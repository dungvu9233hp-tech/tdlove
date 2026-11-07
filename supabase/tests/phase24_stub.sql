-- Môi trường giả lập tối thiểu của Supabase (auth, realtime, spaces, profiles, my_space) để chạy thử phase24.sql trên Postgres thường.
-- Cách chạy: xem mục "Trò chơi cho hai người" trong README.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema realtime; create table realtime.messages(extension text, topic text);
create function realtime.topic() returns text language sql as $$ select 'x'::text $$;
alter table realtime.messages enable row level security;
create publication supabase_realtime;
grant usage on schema public, auth to authenticated, anon;
create table spaces(id uuid primary key default gen_random_uuid(), name text, start_date date);
create table profiles(id uuid primary key references auth.users, space_id uuid references spaces, display_name text);
create function my_space() returns uuid language sql stable security definer as $$ select space_id from profiles where id=auth.uid() $$;
alter table spaces enable row level security; alter table profiles enable row level security;
create policy p1 on profiles for select using (true);
grant select on spaces, profiles to authenticated;
