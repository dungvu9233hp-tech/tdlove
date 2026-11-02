-- Chạy toàn bộ file này trong Supabase > SQL Editor
create table spaces(
  id uuid primary key default gen_random_uuid(),
  name text default 'tdlove', start_date date,
  invite_code text unique default substr(md5(random()::text),1,8),
  invite_expires timestamptz default now()+interval '24 hours',
  created_at timestamptz default now());
create table profiles(
  id uuid primary key references auth.users on delete cascade,
  space_id uuid references spaces on delete cascade,
  display_name text, avatar_url text);
create table moments(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null, author uuid default auth.uid(),
  title text not null, description text, taken_on date default current_date,
  place text, photos text[] default '{}', deleted_at timestamptz,
  created_at timestamptz default now());
create table messages(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null, sender uuid default auth.uid(),
  body text not null, created_at timestamptz default now(), seen_at timestamptz);

create function my_space() returns uuid language sql stable security definer set search_path=public
as $$ select space_id from profiles where id=auth.uid() $$;

-- tạo Space / vào Space bằng mã mời (tối đa 2 người, mã dùng một lần, hết hạn 24h)
create function create_space(p_name text) returns text language plpgsql security definer set search_path=public as $$
declare s spaces; begin
  insert into spaces default values returning * into s;
  insert into profiles(id,space_id,display_name) values(auth.uid(),s.id,p_name)
    on conflict(id) do update set space_id=s.id, display_name=p_name;
  return s.invite_code; end $$;
create function join_space(p_code text, p_name text) returns void language plpgsql security definer set search_path=public as $$
declare s spaces; begin
  select * into s from spaces where invite_code=p_code and invite_expires>now();
  if s.id is null then raise exception 'Mã mời không đúng hoặc đã hết hạn'; end if;
  if (select count(*) from profiles where space_id=s.id)>=2 then raise exception 'Space này đã đủ hai người'; end if;
  insert into profiles(id,space_id,display_name) values(auth.uid(),s.id,p_name)
    on conflict(id) do update set space_id=s.id, display_name=p_name;
  update spaces set invite_expires=now() where id=s.id; end $$;

alter table spaces enable row level security;
alter table profiles enable row level security;
alter table moments enable row level security;
alter table messages enable row level security;
create policy sp_r on spaces for select using (id=my_space());
create policy sp_u on spaces for update using (id=my_space());
create policy pr_r on profiles for select using (id=auth.uid() or space_id=my_space());
create policy pr_u on profiles for update using (id=auth.uid());
create policy mo_all on moments for all using (space_id=my_space()) with check (space_id=my_space());
create policy ms_r on messages for select using (space_id=my_space());
create policy ms_i on messages for insert with check (space_id=my_space() and sender=auth.uid());
create policy ms_u on messages for update using (space_id=my_space());
alter publication supabase_realtime add table messages;

-- ảnh/video: bucket private, mỗi Space một thư mục
insert into storage.buckets(id,name,public) values('media','media',false);
create policy media_all on storage.objects for all
  using (bucket_id='media' and (storage.foldername(name))[1]=my_space()::text)
  with check (bucket_id='media' and (storage.foldername(name))[1]=my_space()::text);
