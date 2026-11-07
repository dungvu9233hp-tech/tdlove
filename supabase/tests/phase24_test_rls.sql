-- Kiểm thử quyền truy cập phase24: trình duyệt không đọc được game_secrets, không ghi trực tiếp, không gọi được hàm nội bộ.
\set ON_ERROR_STOP on
grant select, insert, update, delete on games, game_secrets, game_vouchers to authenticated, anon;  -- giống quyền mặc định của Supabase
\i supabase/phase24.sql
select t_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
do $$ declare n int; failed boolean;
begin
  select count(*) into n from games; assert n>0,'can read own games';
  begin perform 1 from game_secrets; failed:=false; exception when insufficient_privilege then failed:=true; end; assert failed,'secrets readable!';
  begin update games set winner=null; failed:=false; exception when insufficient_privilege then failed:=true; end; assert failed,'direct update allowed!';
  begin insert into game_vouchers(space_id,owner,title) values (my_space(),auth.uid(),'x'); failed:=false; exception when insufficient_privilege then failed:=true; end; assert failed,'direct voucher insert allowed!';
  begin perform _g(gen_random_uuid()); failed:=false; exception when insufficient_privilege then failed:=true; end; assert failed,'internal helper callable!';
  begin perform _sget(gen_random_uuid(), auth.uid()); failed:=false; exception when insufficient_privilege then failed:=true; end; assert failed,'_sget callable!';
  perform game_my_secret(gen_random_uuid());
  raise notice 'RLS ok';
end $$;
reset role;
-- user of another space sees no games
select t_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$ begin assert (select count(*) from games)=0,'other space sees games!'; raise notice 'ISOLATION read ok'; end $$;
reset role;
