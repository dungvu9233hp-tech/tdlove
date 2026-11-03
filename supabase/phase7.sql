-- Giai đoạn 7: hoàn thiện Nhật ký (DIARY-01..03) và nhắc lại kỷ niệm (DIARY-02)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase6.sql. Chạy lại nhiều lần vẫn an toàn.

-- DIARY-03: gắn bài nhật ký với một Moment hoặc Plan; updated_at để biết bài đã được sửa
alter table diary_entries
  add column if not exists moment_id uuid references moments(id) on delete set null,
  add column if not exists plan_id uuid references plans(id) on delete set null,
  add column if not exists updated_at timestamptz;
create index if not exists diary_timeline_idx on diary_entries(space_id, entry_date desc, created_at desc);
create index if not exists diary_moment_idx on diary_entries(moment_id) where moment_id is not null;
create index if not exists diary_plan_idx on diary_entries(plan_id) where plan_id is not null;

-- moment_id / plan_id phải thuộc chính Space (RLS của diary_entries chỉ kiểm tra space_id)
create or replace function diary_check() returns trigger language plpgsql as $$
begin
  if new.moment_id is not null and not exists(select 1 from moments where id=new.moment_id and space_id=new.space_id) then
    raise exception 'Khoảnh khắc không thuộc Space này'; end if;
  if new.plan_id is not null and not exists(select 1 from plans where id=new.plan_id and space_id=new.space_id) then
    raise exception 'Kế hoạch không thuộc Space này'; end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new; end $$;
drop trigger if exists diary_check_t on diary_entries;
create trigger diary_check_t before insert or update on diary_entries for each row execute function diary_check();

-- chỉ tác giả được sửa, và chỉ các cột này (phase4 đã khóa các cột còn lại)
revoke update on diary_entries from authenticated, anon;
grant update (entry_date, title, body, mood, moment_id, plan_id) on diary_entries to authenticated;

-- DIARY-01: ảnh đính kèm bài nhật ký (tệp nằm chung bucket 'media', thư mục đầu là id Space)
create table if not exists diary_media(
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references diary_entries(id) on delete cascade,
  space_id uuid not null,
  path text not null,
  thumb_path text,
  size bigint,
  width int, height int,
  sort int not null default 0,
  created_at timestamptz default now());
create index if not exists diary_media_entry_idx on diary_media(entry_id, sort);
alter table diary_media enable row level security;
drop policy if exists dm_r on diary_media; drop policy if exists dm_i on diary_media; drop policy if exists dm_d on diary_media;
create policy dm_r on diary_media for select using (space_id=my_space());
-- chỉ tác giả của bài mới thêm/gỡ ảnh được
create policy dm_i on diary_media for insert with check (space_id=my_space()
  and path like my_space()::text||'/%'
  and (thumb_path is null or thumb_path like my_space()::text||'/%')
  and exists(select 1 from diary_entries e where e.id=entry_id and e.space_id=my_space() and e.author=auth.uid()));
create policy dm_d on diary_media for delete using (space_id=my_space()
  and exists(select 1 from diary_entries e where e.id=entry_id and e.author=auth.uid()));
-- tối đa 10 ảnh mỗi bài
create or replace function diary_media_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from diary_media where entry_id=new.entry_id) >= 10 then
    raise exception 'Mỗi bài nhật ký tối đa 10 ảnh'; end if;
  return new; end $$;
drop trigger if exists diary_media_limit_t on diary_media;
create trigger diary_media_limit_t before insert on diary_media for each row execute function diary_media_limit();

-- DIARY-02: nhắc lại kỷ niệm của đúng ngày này các năm trước (nhật ký + Moment).
-- security invoker: người dùng chỉ thấy dữ liệu của Space mình (RLS); Edge Function dùng service_role rồi tự lọc theo space_id.
create or replace function on_this_day(d date)
returns table(kind text, id uuid, space_id uuid, title text, day date)
language sql stable security invoker set search_path = public as $$
  select 'diary'::text, e.id, e.space_id, coalesce(nullif(trim(e.title),''), 'Nhật ký'), e.entry_date
    from diary_entries e
   where e.entry_date is not null
     and extract(month from e.entry_date) = extract(month from d)
     and extract(day from e.entry_date) = extract(day from d)
     and extract(year from e.entry_date) < extract(year from d)
  union all
  select 'moment'::text, m.id, m.space_id, m.title, m.taken_on
    from moments m
   where m.deleted_at is null
     and extract(month from m.taken_on) = extract(month from d)
     and extract(day from m.taken_on) = extract(day from d)
     and extract(year from m.taken_on) < extract(year from d)
  order by 5 desc $$;
revoke all on function on_this_day(date) from public, anon;
grant execute on function on_this_day(date) to authenticated, service_role;
