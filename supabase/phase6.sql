-- Giai đoạn 6: hoàn thiện Khoảnh khắc (MOM-01..11)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase5.sql. Chạy lại nhiều lần vẫn an toàn.

-- MOM-01: tọa độ, thẻ cảm xúc, liên kết Plan (MOM-11); MOM-05: ai sửa gần nhất
alter table moments
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists tags text[] not null default '{}',
  add column if not exists plan_id uuid references plans(id) on delete set null,
  add column if not exists updated_at timestamptz default now();
create index if not exists moments_timeline_idx on moments(space_id, taken_on desc, created_at desc) where deleted_at is null;
create index if not exists moments_tags_idx on moments using gin(tags);

-- plan_id phải là Plan của chính Space (RLS của moments chỉ kiểm tra space_id)
create or replace function moments_check() returns trigger language plpgsql as $$
begin
  if new.plan_id is not null and not exists(select 1 from plans where id=new.plan_id and space_id=new.space_id) then
    raise exception 'Kế hoạch không thuộc Space này'; end if;
  new.updated_at := now();
  return new; end $$;
drop trigger if exists moments_check_t on moments;
create trigger moments_check_t before insert or update on moments for each row execute function moments_check();

-- MOM-02/03: bảng media (ảnh/video), mỗi tệp một dòng, có ảnh thu nhỏ
create table if not exists media(
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments(id) on delete cascade,
  space_id uuid not null,
  kind text not null check (kind in ('image','video')),
  path text not null,
  thumb_path text,
  size bigint,
  taken_at timestamptz,
  lat double precision, lng double precision,
  width int, height int, duration real,
  sort int not null default 0,
  created_at timestamptz default now());
create index if not exists media_moment_idx on media(moment_id, sort);
create index if not exists media_space_idx on media(space_id);
alter table media enable row level security;
drop policy if exists md_all on media;
create policy md_all on media for all
  using (space_id=my_space())
  with check (space_id=my_space()
    and path like my_space()::text||'/%'
    and (thumb_path is null or thumb_path like my_space()::text||'/%')
    and exists(select 1 from moments m where m.id=moment_id and m.space_id=my_space()));

-- chuyển dữ liệu cũ (moments.photos) sang bảng media, chỉ làm cho moment chưa có media
insert into media(moment_id, space_id, kind, path, sort)
select m.id, m.space_id,
       case when lower(p.path) ~ '\.(mp4|mov|webm|m4v)$' then 'video' else 'image' end,
       p.path, (p.ord-1)::int
from moments m, unnest(m.photos) with ordinality as p(path, ord)
where not exists(select 1 from media x where x.moment_id=m.id);

-- MOM-07: thả tim và bình luận
create table if not exists moment_hearts(
  moment_id uuid not null references moments(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  space_id uuid not null,
  created_at timestamptz default now(),
  primary key(moment_id, user_id));
create table if not exists moment_comments(
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments(id) on delete cascade,
  space_id uuid not null,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now());
create index if not exists moment_comments_idx on moment_comments(moment_id, created_at);
alter table moment_hearts enable row level security;
alter table moment_comments enable row level security;
drop policy if exists mh_r on moment_hearts; drop policy if exists mh_i on moment_hearts; drop policy if exists mh_d on moment_hearts;
create policy mh_r on moment_hearts for select using (space_id=my_space());
create policy mh_i on moment_hearts for insert with check (space_id=my_space() and user_id=auth.uid()
  and exists(select 1 from moments m where m.id=moment_id and m.space_id=my_space()));
create policy mh_d on moment_hearts for delete using (user_id=auth.uid());
drop policy if exists mc_r on moment_comments; drop policy if exists mc_i on moment_comments; drop policy if exists mc_d on moment_comments;
create policy mc_r on moment_comments for select using (space_id=my_space());
create policy mc_i on moment_comments for insert with check (space_id=my_space() and author=auth.uid()
  and exists(select 1 from moments m where m.id=moment_id and m.space_id=my_space()));
create policy mc_d on moment_comments for delete using (author=auth.uid());

-- MOM-06: album / bộ sưu tập
create table if not exists albums(
  id uuid primary key default gen_random_uuid(), space_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz default now());
create table if not exists album_moments(
  album_id uuid not null references albums(id) on delete cascade,
  moment_id uuid not null references moments(id) on delete cascade,
  space_id uuid not null,
  primary key(album_id, moment_id));
alter table albums enable row level security;
alter table album_moments enable row level security;
drop policy if exists al_all on albums; drop policy if exists am_all on album_moments;
create policy al_all on albums for all using (space_id=my_space()) with check (space_id=my_space());
create policy am_all on album_moments for all using (space_id=my_space())
  with check (space_id=my_space()
    and exists(select 1 from albums a where a.id=album_id and a.space_id=my_space())
    and exists(select 1 from moments m where m.id=moment_id and m.space_id=my_space()));

do $$ begin
  begin alter publication supabase_realtime add table moment_hearts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table moment_comments; exception when duplicate_object then null; end;
end $$;
