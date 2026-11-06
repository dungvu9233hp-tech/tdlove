-- Giai đoạn 15: Khu cấp độ (bấm trái tim ở Trang chủ): điểm chung + điểm riêng, cấp độ, nhân vật 3D, cửa hàng đồ
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase14.sql. Chạy lại nhiều lần vẫn an toàn (không xóa dữ liệu đã mua).
-- Điểm KHÔNG lưu thành số: luôn tính lại từ dữ liệu thật (số ngày bên nhau, tin nhắn ảnh) trừ đi những gì đã tiêu,
-- nên không thể sửa điểm từ máy khách, và giá đồ do server quyết định.

-- 1. Luật tính điểm (sửa số ở đây là xong, app tự hiển thị đúng số mới)
--    Điểm CHUNG: +10 mỗi ngày bên nhau, +2 mỗi ảnh một trong hai người gửi trong chat.
--    Điểm RIÊNG: +5 mỗi ảnh chính mình gửi trong chat.
--    Mỗi người chỉ tính tối đa 10 ảnh mỗi ngày (giờ Việt Nam) để không gửi ảnh liên tục cho nhiều điểm.
--    Cấp độ tính theo TỔNG điểm đã kiếm (chung + riêng của cả hai), nên tiêu điểm không làm tụt cấp.
create or replace function level_rules() returns jsonb language sql immutable as $$
  select jsonb_build_object('day_shared', 10, 'img_shared', 2, 'img_personal', 5, 'img_daily_cap', 10) $$;

-- Cấp L cần 50*(L-1)*L điểm: cấp 2 = 100, cấp 3 = 300, cấp 4 = 600, cấp 5 = 1000...
create or replace function level_of(xp int) returns int language plpgsql immutable as $$
declare l int := 1;
begin
  while 50 * l * (l + 1) <= xp loop l := l + 1; end loop;
  return l;
end $$;

-- 2. Nhân vật của từng người (nữ bên trái, nam bên phải) và đồ đang mặc
create table if not exists level_chars(
  user_id uuid primary key references auth.users on delete cascade,
  space_id uuid not null references spaces on delete cascade,
  sex text not null check (sex in ('f','m')),
  outfit jsonb not null default '{}'::jsonb);        -- {"top":"top_red_tee","hat":"hat_cap"}: mỗi ô (slot) một món

-- 3. Danh mục đồ (giá do server quyết định). Hình dạng 3D của từng món nằm ở lib/shop.ts, khớp theo id.
create table if not exists shop_items(
  id text primary key,
  slot text not null check (slot in ('hair','top','bottom','shoes','makeup','glasses','hat','neck')),
  name text not null,
  price int not null check (price >= 0),
  sex text not null default 'any' check (sex in ('any','f','m')),
  min_level int not null default 1,
  sort int not null default 0,
  active boolean not null default true);

-- 4. Đồ đã mua: mỗi nhân vật sở hữu riêng, mỗi món một lần
create table if not exists shop_buys(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  buyer uuid not null references auth.users on delete cascade,
  for_user uuid not null references auth.users on delete cascade,   -- nhân vật được tặng/mặc
  item_id text not null references shop_items,
  price int not null,
  paid_from text not null check (paid_from in ('shared','mine')),
  created_at timestamptz not null default now(),
  unique (for_user, item_id));
create index if not exists shop_buys_space on shop_buys(space_id);

alter table level_chars enable row level security;
alter table shop_items enable row level security;
alter table shop_buys enable row level security;
drop policy if exists lc_r on level_chars; drop policy if exists si_r on shop_items; drop policy if exists sb_r on shop_buys;
create policy lc_r on level_chars for select using (space_id = my_space());
create policy si_r on shop_items for select to authenticated using (true);
create policy sb_r on shop_buys for select using (space_id = my_space());
-- Chỉ đọc trực tiếp; mọi thao tác ghi đi qua các hàm bên dưới
revoke insert, update, delete on level_chars, shop_items, shop_buys from authenticated, anon;
revoke all on level_chars, shop_items, shop_buys from anon;

-- 5. Điểm và cấp độ của Space mình (chỉ đọc, tính lại mỗi lần gọi)
create or replace function level_stats() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  sp uuid := my_space(); r jsonb := level_rules(); st date; d int := 0;
  sh_earn int; sh_spent int; xp int; lv int; ppl jsonb := '{}'::jsonb; p record;
  p_earn int; p_spent int; p_img int; img_all int := 0; pe_sum int := 0;
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  select start_date into st from spaces where id = sp;
  if st is not null then d := greatest(0, ((now() at time zone 'Asia/Ho_Chi_Minh')::date - st) + 1); end if;

  for p in select id from profiles where space_id = sp loop
    -- ảnh của người này, mỗi ngày (giờ Việt Nam) tính tối đa img_daily_cap
    select coalesce(sum(least(c, (r->>'img_daily_cap')::int)), 0)::int into p_img
      from (select count(*) as c from messages
            where space_id = sp and kind = 'image' and sender = p.id
            group by (created_at at time zone 'Asia/Ho_Chi_Minh')::date) t;
    p_earn := p_img * (r->>'img_personal')::int;
    select coalesce(sum(price), 0)::int into p_spent from shop_buys where space_id = sp and buyer = p.id and paid_from = 'mine';
    img_all := img_all + p_img; pe_sum := pe_sum + p_earn;
    ppl := ppl || jsonb_build_object(p.id::text, jsonb_build_object('images', p_img, 'earned', p_earn, 'spent', p_spent, 'balance', p_earn - p_spent));
  end loop;

  sh_earn := d * (r->>'day_shared')::int + img_all * (r->>'img_shared')::int;
  select coalesce(sum(price), 0)::int into sh_spent from shop_buys where space_id = sp and paid_from = 'shared';
  xp := sh_earn + pe_sum;
  lv := level_of(xp);
  return jsonb_build_object(
    'rules', r, 'days', d, 'xp', xp, 'level', lv,
    'level_from', 50 * (lv - 1) * lv, 'level_to', 50 * lv * (lv + 1),
    'shared', jsonb_build_object('earned', sh_earn, 'spent', sh_spent, 'balance', sh_earn - sh_spent),
    'people', ppl);
end $$;

-- 6. Chọn nhân vật của mình. Người ấy chưa chọn thì tự nhận nhân vật còn lại.
create or replace function pick_char(p_sex text) returns void
language plpgsql security definer set search_path=public as $$
declare sp uuid := my_space(); other uuid; oc level_chars; mine level_chars;
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_sex not in ('f','m') then raise exception 'Nhân vật không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtextextended('level:' || sp::text, 0));
  select * into mine from level_chars where user_id = auth.uid();
  if found then raise exception 'Bạn đã chọn nhân vật rồi'; end if;
  select id into other from profiles where space_id = sp and id <> auth.uid() limit 1;
  if other is not null then
    select * into oc from level_chars where user_id = other;
    if found and oc.sex = p_sex then raise exception 'Người ấy đang là nhân vật này rồi, hãy chọn nhân vật còn lại'; end if;
    if not found then insert into level_chars(user_id, space_id, sex) values (other, sp, case when p_sex = 'f' then 'm' else 'f' end); end if;
  end if;
  insert into level_chars(user_id, space_id, sex) values (auth.uid(), sp, p_sex);
end $$;

-- Đổi chỗ hai nhân vật. Chỉ làm được khi CHƯA mua món nào (đồ có phân nữ/nam nên đổi sau khi mua sẽ lệch).
create or replace function swap_chars() returns void
language plpgsql security definer set search_path=public as $$
declare sp uuid := my_space();
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  perform pg_advisory_xact_lock(hashtextextended('level:' || sp::text, 0));
  if exists (select 1 from shop_buys where space_id = sp) then raise exception 'Đã mua đồ rồi nên không đổi chỗ được nữa'; end if;
  if (select count(*) from level_chars where space_id = sp) <> 2 then raise exception 'Cả hai người cần có nhân vật trước'; end if;
  update level_chars set sex = case when sex = 'f' then 'm' else 'f' end, outfit = '{}'::jsonb where space_id = sp;
end $$;

-- 7. Mua đồ: p_for là nhân vật được mặc (mình hoặc người ấy), p_from = 'shared' (điểm chung) hoặc 'mine' (điểm riêng của mình)
create or replace function buy_item(p_item text, p_for uuid, p_from text) returns void
language plpgsql security definer set search_path=public as $$
declare sp uuid := my_space(); it shop_items; ch level_chars; st jsonb; bal int;
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_from not in ('shared','mine') then raise exception 'Nguồn điểm không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtextextended('level:' || sp::text, 0));   -- hai người cùng tiêu điểm chung không đè nhau
  select * into it from shop_items where id = p_item and active;
  if not found then raise exception 'Món này không có trong cửa hàng'; end if;
  select * into ch from level_chars where user_id = p_for and space_id = sp;
  if not found then raise exception 'Nhân vật này chưa được chọn'; end if;
  if it.sex <> 'any' and it.sex <> ch.sex then raise exception 'Món này không dành cho nhân vật này'; end if;
  if exists (select 1 from shop_buys where for_user = p_for and item_id = p_item) then raise exception 'Nhân vật đã có món này rồi'; end if;
  st := level_stats();
  if (st->>'level')::int < it.min_level then raise exception 'Cần lên cấp % để mua món này', it.min_level; end if;
  bal := case when p_from = 'shared' then (st->'shared'->>'balance')::int else (st->'people'->(auth.uid()::text)->>'balance')::int end;
  if coalesce(bal, 0) < it.price then raise exception 'Chưa đủ điểm (cần %, đang có %)', it.price, coalesce(bal, 0); end if;
  insert into shop_buys(space_id, buyer, for_user, item_id, price, paid_from) values (sp, auth.uid(), p_for, it.id, it.price, p_from);
end $$;

-- 8. Mặc / cởi đồ đã có. p_item = null là cởi món đó ở ô p_slot (về dáng mặc định).
create or replace function set_outfit(p_for uuid, p_slot text, p_item text) returns void
language plpgsql security definer set search_path=public as $$
declare sp uuid := my_space(); it shop_items;
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_slot not in ('hair','top','bottom','shoes','makeup','glasses','hat','neck') then raise exception 'Ô đồ không hợp lệ'; end if;
  perform 1 from level_chars where user_id = p_for and space_id = sp for update;
  if not found then raise exception 'Nhân vật này chưa được chọn'; end if;
  if p_item is null then
    update level_chars set outfit = outfit - p_slot where user_id = p_for;
  else
    select * into it from shop_items where id = p_item;
    if not found or it.slot <> p_slot then raise exception 'Món này không thuộc ô đã chọn'; end if;
    if not exists (select 1 from shop_buys where for_user = p_for and item_id = p_item) then raise exception 'Nhân vật chưa có món này'; end if;
    update level_chars set outfit = outfit || jsonb_build_object(p_slot, p_item) where user_id = p_for;
  end if;
end $$;

revoke all on function level_rules(), level_of(int), level_stats(), pick_char(text), swap_chars(), buy_item(text, uuid, text), set_outfit(uuid, text, text) from public, anon;
grant execute on function level_rules(), level_of(int), level_stats(), pick_char(text), swap_chars(), buy_item(text, uuid, text), set_outfit(uuid, text, text) to authenticated;

-- 9. Danh mục đồ ban đầu. Chạy lại sẽ cập nhật tên/giá/cấp nhưng không đụng tới đồ đã mua (giá đã mua được lưu riêng).
insert into shop_items(id, slot, name, price, sex, min_level, sort) values
  -- tóc
  ('hair_chestnut_long','hair','Tóc dài nâu hạt dẻ',40,'f',1,10),
  ('hair_rose_long','hair','Tóc dài hồng pastel',150,'f',2,11),
  ('hair_lavender_long','hair','Tóc dài tím oải hương',400,'f',4,12),
  ('hair_brown_short','hair','Tóc ngắn nâu',40,'m',1,13),
  ('hair_ash_short','hair','Tóc ngắn xám khói',150,'m',2,14),
  ('hair_teal_short','hair','Tóc ngắn xanh ngọc',400,'m',4,15),
  -- áo
  ('top_white_tee','top','Áo thun trắng',30,'any',1,20),
  ('top_mint_tee','top','Áo thun xanh bạc hà',30,'any',1,21),
  ('top_red_tee','top','Áo thun đỏ san hô',60,'any',1,22),
  ('top_yellow_hoodie','top','Áo hoodie vàng bơ',200,'any',3,23),
  ('top_black_long','top','Áo dài tay đen',260,'any',3,24),
  -- quần / váy
  ('bot_pink_skirt','bottom','Váy xòe hồng',60,'f',1,30),
  ('bot_denim_skirt','bottom','Váy jean xanh',120,'f',2,31),
  ('bot_black_pants_f','bottom','Quần dài đen',180,'f',3,32),
  ('bot_black_pants_m','bottom','Quần dài đen',60,'m',1,33),
  ('bot_khaki_pants','bottom','Quần kaki',120,'m',2,34),
  ('bot_denim_shorts','bottom','Quần short jean',150,'any',2,35),
  -- giày
  ('shoe_pink','shoes','Giày hồng',30,'any',1,40),
  ('shoe_black','shoes','Giày đen',50,'any',1,41),
  ('shoe_red','shoes','Giày đỏ',120,'any',2,42),
  ('shoe_gold','shoes','Giày ánh vàng',500,'any',5,43),
  -- trang điểm
  ('mk_rose_lip','makeup','Son hồng cánh sen',40,'any',1,50),
  ('mk_coral_lip','makeup','Son cam san hô',40,'any',1,51),
  ('mk_blush','makeup','Má hồng đậm',80,'any',1,52),
  ('mk_berry_lip','makeup','Son mận chín',120,'any',2,53),
  -- kính
  ('gl_round','glasses','Kính tròn',150,'any',2,60),
  ('gl_square','glasses','Kính vuông',150,'any',2,61),
  ('gl_gold_round','glasses','Kính tròn gọng vàng',350,'any',4,62),
  -- mũ
  ('hat_cap','hat','Mũ lưỡi trai',200,'any',3,70),
  ('hat_beanie','hat','Mũ len',220,'any',3,71),
  ('hat_crown','hat','Vương miện',1500,'any',8,72),
  -- dây chuyền / khăn
  ('neck_heart','neck','Dây chuyền trái tim',120,'any',2,80),
  ('neck_scarf','neck','Khăn quàng cổ',250,'any',3,81),
  ('neck_pearl','neck','Vòng ngọc trai',300,'any',4,82)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price,
  sex = excluded.sex, min_level = excluded.min_level, sort = excluded.sort;

-- 10. Realtime: người kia đổi đồ hay mua đồ thì máy này thấy ngay
do $$ declare t text; begin
  foreach t in array array['level_chars','shop_buys'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
