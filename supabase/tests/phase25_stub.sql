-- Môi trường giả lập tối thiểu của Supabase để chạy thử phase25.sql trên Postgres thường.
-- Gồm phần của phase24_stub (auth, realtime, spaces, profiles, my_space) cộng bảng messages, moments, moment_comments
-- (đúng như schema.sql, phase5.sql, phase6.sql, phase18.sql) và schema storage tối thiểu.
-- Cách chạy: xem mục "Thông báo, trả lời bình luận, GIF (phase25)" trong README.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
-- giống quyền mặc định của Supabase: bảng mới tạo ra là authenticated/anon có đủ quyền, RLS mới là hàng rào
alter default privileges in schema public grant all on tables to authenticated, anon;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema realtime;
create publication supabase_realtime;
grant usage on schema public, auth to authenticated, anon;

create table spaces(id uuid primary key default gen_random_uuid(), name text, start_date date);
create table profiles(id uuid primary key references auth.users, space_id uuid references spaces, display_name text);
create function my_space() returns uuid language sql stable security definer as $$ select space_id from profiles where id=auth.uid() $$;
alter table spaces enable row level security; alter table profiles enable row level security;
create policy p1 on profiles for select using (true);
grant select on spaces, profiles to authenticated;

-- schema.sql + phase5.sql + phase18.sql (messages)
create table messages(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null, sender uuid default auth.uid(),
  body text not null, created_at timestamptz default now(), seen_at timestamptz);
alter table messages
  add column kind text not null default 'text', add column media_path text, add column duration int,
  add column reply_to uuid references messages(id) on delete set null, add column reactions jsonb not null default '{}'::jsonb;
alter table messages add constraint msg_kind_chk check (kind in ('text','image','video','voice','location'));
alter table messages add constraint msg_media_chk check (kind not in ('image','video','voice') or media_path is not null);
alter table messages enable row level security;
create policy ms_r on messages for select using (space_id=my_space());
create policy ms_i on messages for insert with check (space_id=my_space() and sender=auth.uid());

-- schema.sql + phase6.sql (moments, moment_comments)
create table moments(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null, author uuid default auth.uid(),
  title text not null, description text, taken_on date default current_date,
  place text, photos text[] default '{}', deleted_at timestamptz,
  created_at timestamptz default now());
alter table moments enable row level security;
create policy mo_all on moments for all using (space_id=my_space()) with check (space_id=my_space());
create table moment_comments(
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments(id) on delete cascade,
  space_id uuid not null,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now());
alter table moment_comments enable row level security;
create policy mc_r on moment_comments for select using (space_id=my_space());
create policy mc_i on moment_comments for insert with check (space_id=my_space() and author=auth.uid()
  and exists(select 1 from moments m where m.id=moment_id and m.space_id=my_space()));
create policy mc_d on moment_comments for delete using (author=auth.uid());

-- storage tối thiểu
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated, anon;
grant select, insert on storage.objects to authenticated;

create function t_as(u text) returns text language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
