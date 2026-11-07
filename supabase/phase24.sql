-- Giai đoạn 24: Khu Trò chơi cho hai người (giai đoạn 0 + 1 + 2).
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase23.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Nguyên tắc:
--  * Mọi luật chơi chạy ở MÁY CHỦ (hàm security definer). Trình duyệt chỉ gọi hàm, không tự ghi trạng thái ván.
--  * Thông tin phải giấu (tàu của mình, lá bài trên tay, số bí mật, đáp án, từ cần vẽ, vị trí lá bài úp) nằm trong
--    game_secrets. Bảng này bật RLS và KHÔNG có policy nào, nên trình duyệt không đọc được; chỉ hàm game_my_secret
--    trả về đúng phần của người gọi. Phần công khai nằm ở games.state và được đẩy realtime cho cả hai.
--  * Mỗi ván có p1 (người tạo) và p2 (người còn lại trong Space). Cột waiting là danh sách người đang phải hành động.

-- ===== 1. Bảng =====
create table if not exists games(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  kind text not null check (kind in ('caro','so_bi_mat','hieu_nhau','lat_bai','pha_thuyen','bai_cao','xi_dach','ve_doan','that_thach')),
  status text not null default 'playing' check (status in ('playing','done','abandoned')),
  p1 uuid not null references auth.users on delete cascade,
  p2 uuid not null references auth.users on delete cascade,
  waiting uuid[] not null default '{}',
  winner uuid,
  state jsonb not null default '{}'::jsonb,
  version int not null default 0,
  reward_drawn boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (p1 <> p2));
create index if not exists games_space_idx on games(space_id, status, updated_at desc);

-- owner = '00000000-0000-0000-0000-000000000000' nghĩa là bí mật của máy chủ (bộ bài còn lại, vị trí lá úp...)
create table if not exists game_secrets(
  game_id uuid not null references games on delete cascade,
  owner uuid not null,
  data jsonb not null default '{}'::jsonb,
  primary key (game_id, owner));

create table if not exists game_vouchers(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  owner uuid not null references auth.users on delete cascade,          -- người sẽ thực hiện phần quà này
  title text not null check (char_length(btrim(title)) between 1 and 120),
  status text not null default 'pool' check (status in ('pool','won','done')),
  holder uuid references auth.users on delete set null,                 -- người trúng quà (người được hưởng)
  game_id uuid references games on delete set null,
  created_at timestamptz not null default now(),
  won_at timestamptz,
  done_at timestamptz);
create index if not exists game_vouchers_idx on game_vouchers(space_id, status);

alter table games enable row level security;
alter table game_secrets enable row level security;
alter table game_vouchers enable row level security;
drop policy if exists games_r on games;
create policy games_r on games for select using (space_id = my_space());
drop policy if exists gv_r on game_vouchers;
create policy gv_r on game_vouchers for select using (space_id = my_space());
-- Trình duyệt chỉ ĐỌC được games / game_vouchers; mọi thay đổi đi qua hàm bên dưới. game_secrets thì không đọc được.
revoke all on games, game_secrets, game_vouchers from anon;
revoke insert, update, delete on games from authenticated;
revoke insert, update, delete on game_vouchers from authenticated;
revoke all on game_secrets from authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
    alter publication supabase_realtime add table games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_vouchers') then
    alter publication supabase_realtime add table game_vouchers;
  end if;
end $$;

-- Kênh broadcast + presence private `game-<space>` (nét vẽ của "Vẽ và đoán", biết người kia đang ở trong ván để khỏi gửi thông báo đẩy).
-- Tạo lại hai policy dùng chung của phase14 với thêm kênh game-.
drop policy if exists call_rt_read on realtime.messages;
drop policy if exists call_rt_write on realtime.messages;
create policy call_rt_read on realtime.messages for select to authenticated
  using ((realtime.messages.extension = 'broadcast'
          and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text, 'together-'||my_space()::text, 'game-'||my_space()::text))
      or (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'game-'||my_space()::text));
create policy call_rt_write on realtime.messages for insert to authenticated
  with check ((realtime.messages.extension = 'broadcast'
          and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text, 'together-'||my_space()::text, 'game-'||my_space()::text))
      or (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'game-'||my_space()::text));

-- ===== 2. Hàm nội bộ (trình duyệt không gọi được) =====
create or replace function _srv() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;

create or replace function _ints(j jsonb) returns int[] language sql immutable as $$
  select coalesce(array(select v::int from jsonb_array_elements_text(coalesce(j,'[]'::jsonb)) with ordinality t(v,o) order by o), '{}'::int[]) $$;

-- Khóa và trả về ván đang chơi của Space mình, mình phải là một trong hai người chơi
create or replace function _g(p_id uuid) returns games language plpgsql security definer set search_path=public as $$
declare g games; begin
  select * into g from games where id = p_id and space_id = my_space() and auth.uid() in (p1, p2) for update;
  if g.id is null then raise exception 'Không tìm thấy ván chơi'; end if;
  if g.status <> 'playing' then raise exception 'Ván này đã kết thúc'; end if;
  return g; end $$;

create or replace function _opp(g games) returns uuid language sql stable as $$ select case when auth.uid() = g.p1 then g.p2 else g.p1 end $$;

create or replace function _save(g games, p_state jsonb, p_waiting uuid[], p_status text default 'playing', p_winner uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  update games set state = p_state, waiting = case when p_status = 'playing' then p_waiting else '{}'::uuid[] end,
    status = p_status, winner = p_winner, version = version + 1, updated_at = now() where id = g.id;
end $$;

create or replace function _sget(p_game uuid, p_owner uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select data from game_secrets where game_id = p_game and owner = p_owner $$;
create or replace function _sset(p_game uuid, p_owner uuid, p_data jsonb) returns void language sql security definer set search_path=public as $$
  insert into game_secrets(game_id, owner, data) values (p_game, p_owner, p_data)
  on conflict (game_id, owner) do update set data = excluded.data $$;

create or replace function _mine(g games) returns boolean language sql stable as $$ select g.waiting @> array[auth.uid()] $$;

-- Chuẩn hóa chữ để so đáp án: bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng
create or replace function _norm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(translate(lower(normalize(coalesce(t,''), NFC)), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'), '\s+', ' ', 'g')) $$;

-- Có ô (r,c) trong danh sách [[r,c],...] không. Không dùng jsonb @> vì nó bỏ qua thứ tự và trùng lặp ([9,0] @> [9,9] là đúng).
create or replace function _has_cell(cells jsonb, p_r int, p_c int) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements(cells) x where (x->>0)::int = p_r and (x->>1)::int = p_c) $$;
-- Mọi ô của tàu đều nằm trong danh sách ô đã trúng
create or replace function _ship_down(hits jsonb, cells jsonb) returns boolean language sql immutable as $$
  select not exists (select 1 from jsonb_array_elements(cells) x where not _has_cell(hits, (x->>0)::int, (x->>1)::int)) $$;

-- Người thắng theo điểm (null = hòa)
create or replace function _winner(g games, st jsonb) returns uuid language sql immutable as $$
  select case when (st->'scores'->>g.p1::text)::int > (st->'scores'->>g.p2::text)::int then g.p1
              when (st->'scores'->>g.p1::text)::int < (st->'scores'->>g.p2::text)::int then g.p2 end $$;

-- ===== 3. Chung: tạo ván, xem bí mật của mình, kết thúc =====
create or replace function game_my_secret(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists (select 1 from games where id = p_id and space_id = my_space() and auth.uid() in (p1, p2)) then return null; end if;
  return _sget(p_id, auth.uid());
end $$;

create or replace function game_end(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games; begin
  g := _g(p_id);
  perform _save(g, g.state, '{}', 'abandoned', null);
end $$;

create or replace function game_create(p_kind text, p_opts jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  me uuid := auth.uid(); sp uuid := my_space(); other uuid; gid uuid; g games; st jsonb; w uuid[];
  a text; b text; n int; pool text[]; picked text[]; layout text[]; q jsonb; qs jsonb := '[]'::jsonb; o jsonb;
begin
  if me is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  select id into other from profiles where space_id = sp and id <> me limit 1;
  if other is null then raise exception 'Người kia chưa vào Space, hãy mời họ trước nhé'; end if;
  if p_kind not in ('caro','so_bi_mat','hieu_nhau','lat_bai','pha_thuyen','bai_cao','xi_dach','ve_doan','that_thach') then raise exception 'Trò chơi không hợp lệ'; end if;
  if exists (select 1 from games where space_id = sp and kind = p_kind and status = 'playing') then
    raise exception 'Đang có một ván chưa xong. Hãy tiếp tục hoặc kết thúc ván đó trước.'; end if;
  p_opts := coalesce(p_opts, '{}'::jsonb);
  a := me::text; b := other::text;
  insert into games(space_id, kind, p1, p2) values (sp, p_kind, me, other) returning id into gid;
  select * into g from games where id = gid;
  w := array[me];

  if p_kind = 'caro' then
    n := case when (p_opts->>'size') = '10' then 10 else 15 end;
    st := jsonb_build_object('size', n, 'board', repeat('0', n*n), 'last', null, 'win', null);
  elsif p_kind = 'so_bi_mat' then
    n := case (p_opts->>'len') when '3' then 3 when '5' then 5 else 4 end;
    st := jsonb_build_object('len', n, 'phase', 'setup', 'ready', jsonb_build_object(a, false, b, false),
      'guesses', jsonb_build_object(a, '[]'::jsonb, b, '[]'::jsonb), 'solved', false, 'reveal', null);
    w := array[me, other];
  elsif p_kind = 'pha_thuyen' then
    st := jsonb_build_object('size', 10, 'fleet', '[5,4,3,3,2]'::jsonb, 'phase', 'setup',
      'ready', jsonb_build_object(a, false, b, false),
      'shots', jsonb_build_object(a, '[]'::jsonb, b, '[]'::jsonb), 'sunk', jsonb_build_object(a, '[]'::jsonb, b, '[]'::jsonb), 'reveal', null);
    w := array[me, other];
  elsif p_kind = 'lat_bai' then
    n := least(12, greatest(4, coalesce((p_opts->>'pairs')::int, 8)));
    pool := array['💗','🌹','🍓','🎀','🧸','🍰','🌙','⭐','🐱','🐶','🦋','🍀','🎈','🍩','☁️','🌻','🍒','🎵','🐰','🍉','🌈','🍭','🐼','🦄'];
    picked := array(select s from unnest(pool) s order by random() limit n);
    layout := array(select s from (select unnest(picked) s union all select unnest(picked)) x order by random());
    perform _sset(gid, _srv(), jsonb_build_object('layout', to_jsonb(layout)));
    st := jsonb_build_object('n', n*2, 'mode', case when p_opts->>'mode' = 'coop' then 'coop' else 'vs' end,
      'matched', '{}'::jsonb, 'up', '[]'::jsonb, 'tries', 0, 'scores', jsonb_build_object(a, 0, b, 0));
  elsif p_kind = 'bai_cao' then
    st := jsonb_build_object('rounds', case (p_opts->>'rounds') when '5' then 5 when '1' then 1 else 3 end, 'round', 1, 'phase', 'play',
      'revealed', jsonb_build_object(a, false, b, false), 'scores', jsonb_build_object(a, 0, b, 0), 'last', null);
    perform _bc_deal(gid, me, other);
    w := array[me, other];
  elsif p_kind = 'xi_dach' then
    st := jsonb_build_object('rounds', case (p_opts->>'rounds') when '5' then 5 when '1' then 1 else 3 end,
      'scores', jsonb_build_object(a, 0, b, 0));
    st := _xd_round(g, st, 1, me);
    perform _xd_commit(g, st);
    return gid;
  elsif p_kind = 've_doan' then
    st := jsonb_build_object('rounds', case (p_opts->>'rounds') when '6' then 6 when '2' then 2 else 4 end, 'round', 1, 'drawer', a,
      'phase', 'pick', 'wl', null, 'scores', jsonb_build_object(a, 0, b, 0), 'guesses', '[]'::jsonb, 'last', null);
  elsif p_kind = 'hieu_nhau' then
    if jsonb_typeof(p_opts->'qs') <> 'array' or jsonb_array_length(p_opts->'qs') not between 4 and 20 then raise exception 'Bộ câu hỏi không hợp lệ'; end if;
    for q in select * from jsonb_array_elements(p_opts->'qs') loop
      if jsonb_typeof(q->'o') <> 'array' or jsonb_array_length(q->'o') not between 2 and 6 or char_length(coalesce(q->>'q','')) not between 1 and 200 then
        raise exception 'Câu hỏi không hợp lệ'; end if;
      qs := qs || jsonb_build_array(jsonb_build_object('q', left(q->>'q', 200),
        'o', (select jsonb_agg(left(x, 80)) from jsonb_array_elements_text(q->'o') x)));
    end loop;
    st := jsonb_build_object('qs', qs, 'i', 0, 'answerer', a, 'phase', 'answer', 'scores', jsonb_build_object(a, 0, b, 0), 'log', '[]'::jsonb);
  else  -- that_thach
    st := jsonb_build_object('phase', 'pick', 'count', 0, 'card', null, 'target', null, 'log', '[]'::jsonb);
  end if;
  perform _save(g, st, w);
  return gid;
end $$;

-- ===== 4. Cờ caro (5 quân liền nhau; bàn 15x15 hoặc 10x10) =====
create or replace function caro_move(p_id uuid, p_r int, p_c int) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); size int; board text; idx int; mark text;
  dirs int[] := array[[0,1],[1,0],[1,1],[1,-1]]; d int; dr int; dc int; k int; rr int; cc int; cells jsonb; win jsonb;
begin
  if g.kind <> 'caro' then raise exception 'Sai loại ván'; end if;
  if not _mine(g) then raise exception 'Chưa đến lượt bạn'; end if;
  st := g.state; size := (st->>'size')::int; board := st->>'board';
  if p_r < 0 or p_r >= size or p_c < 0 or p_c >= size then raise exception 'Ô nằm ngoài bàn cờ'; end if;
  idx := p_r * size + p_c;
  if substr(board, idx + 1, 1) <> '0' then raise exception 'Ô này đã có quân'; end if;
  mark := case when me = g.p1 then '1' else '2' end;
  board := overlay(board placing mark from idx + 1 for 1);
  for d in 1..4 loop
    dr := dirs[d][1]; dc := dirs[d][2];
    cells := jsonb_build_array(jsonb_build_array(p_r, p_c));
    k := 1;
    loop
      rr := p_r + dr*k; cc := p_c + dc*k;
      exit when rr < 0 or rr >= size or cc < 0 or cc >= size or substr(board, rr*size + cc + 1, 1) <> mark;
      cells := cells || jsonb_build_array(jsonb_build_array(rr, cc)); k := k + 1;
    end loop;
    k := 1;
    loop
      rr := p_r - dr*k; cc := p_c - dc*k;
      exit when rr < 0 or rr >= size or cc < 0 or cc >= size or substr(board, rr*size + cc + 1, 1) <> mark;
      cells := cells || jsonb_build_array(jsonb_build_array(rr, cc)); k := k + 1;
    end loop;
    if jsonb_array_length(cells) >= 5 then win := cells; exit; end if;
  end loop;
  st := st || jsonb_build_object('board', board, 'last', jsonb_build_array(p_r, p_c), 'win', win);
  if win is not null then perform _save(g, st, '{}', 'done', me);
  elsif position('0' in board) = 0 then perform _save(g, st, '{}', 'done', null);
  else perform _save(g, st, array[_opp(g)]); end if;
end $$;

-- ===== 5. Số bí mật (Bulls & Cows): mỗi người nghĩ một số, đoán số của nhau =====
create or replace function sb_set(p_id uuid, p_code text) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); n int; ready jsonb;
begin
  if g.kind <> 'so_bi_mat' then raise exception 'Sai loại ván'; end if;
  st := g.state; n := (st->>'len')::int;
  if st->>'phase' <> 'setup' or (st->'ready'->>me::text)::boolean then raise exception 'Bạn đã chọn số rồi'; end if;
  if p_code !~ ('^[0-9]{' || n || '}$') then raise exception 'Số bí mật phải gồm đúng % chữ số', n; end if;
  if (select count(distinct ch) from regexp_split_to_table(p_code, '') ch) <> n then raise exception 'Các chữ số không được trùng nhau'; end if;
  perform _sset(g.id, me, jsonb_build_object('code', p_code));
  st := jsonb_set(st, array['ready', me::text], 'true');
  if (st->'ready'->>g.p1::text)::boolean and (st->'ready'->>g.p2::text)::boolean then
    st := jsonb_set(st, '{phase}', '"play"');
    perform _save(g, st, array[g.p1]);
  else perform _save(g, st, array[_opp(g)]); end if;
end $$;

create or replace function sb_guess(p_id uuid, p_guess text) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); opp uuid; n int; code text; bulls int := 0; cows int := 0; i int; ch text; entry jsonb;
begin
  if g.kind <> 'so_bi_mat' then raise exception 'Sai loại ván'; end if;
  st := g.state; n := (st->>'len')::int; opp := _opp(g);
  if st->>'phase' <> 'play' or not _mine(g) then raise exception 'Chưa đến lượt bạn'; end if;
  if p_guess !~ ('^[0-9]{' || n || '}$') or (select count(distinct c) from regexp_split_to_table(p_guess, '') c) <> n then
    raise exception 'Hãy đoán một số % chữ số, không trùng chữ số', n; end if;
  code := _sget(g.id, opp)->>'code';
  for i in 1..n loop
    ch := substr(p_guess, i, 1);
    if substr(code, i, 1) = ch then bulls := bulls + 1; elsif position(ch in code) > 0 then cows := cows + 1; end if;
  end loop;
  entry := jsonb_build_object('g', p_guess, 'b', bulls, 'c', cows);
  st := jsonb_set(st, array['guesses', me::text], (st->'guesses'->(me::text)) || jsonb_build_array(entry));
  -- Công bằng lượt: người đi trước đoán đúng thì người đi sau còn đúng một lượt cuối. Cùng đúng thì hòa.
  if me = g.p1 then
    if bulls = n then st := jsonb_set(st, '{solved}', 'true'); end if;
    perform _save(g, st, array[opp]);
  else
    if bulls = n or (st->>'solved')::boolean then
      st := jsonb_set(st, '{reveal}', jsonb_build_object(g.p1::text, _sget(g.id, g.p1)->>'code', g.p2::text, _sget(g.id, g.p2)->>'code'));
      perform _save(g, st, '{}', 'done',
        case when bulls = n and (st->>'solved')::boolean then null when bulls = n then g.p2 else g.p1 end);
    else perform _save(g, st, array[opp]); end if;
  end if;
end $$;

-- ===== 6. Lật bài trí nhớ =====
create or replace function lb_flip(p_id uuid, p_i int) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); n int; layout jsonb; up jsonb; sym text; i0 int; s0 text; vs boolean; done boolean;
begin
  if g.kind <> 'lat_bai' then raise exception 'Sai loại ván'; end if;
  if not _mine(g) then raise exception 'Chưa đến lượt bạn'; end if;
  st := g.state; n := (st->>'n')::int; vs := st->>'mode' = 'vs';
  if p_i < 0 or p_i >= n then raise exception 'Ô không hợp lệ'; end if;
  if st->'matched' ? p_i::text then raise exception 'Ô này đã ghép rồi'; end if;
  up := st->'up';
  if jsonb_array_length(up) >= 2 then up := '[]'::jsonb; end if;      -- hai lá lật hụt của lượt trước được úp lại
  if jsonb_array_length(up) = 1 and (up->0->>'i')::int = p_i then raise exception 'Bạn vừa lật ô này rồi'; end if;
  layout := _sget(g.id, _srv())->'layout';
  sym := layout->>p_i;
  up := up || jsonb_build_array(jsonb_build_object('i', p_i, 's', sym));
  if jsonb_array_length(up) = 1 then
    st := jsonb_set(st, '{up}', up);
    perform _save(g, st, array[me]);
    return;
  end if;
  i0 := (up->0->>'i')::int; s0 := up->0->>'s';
  st := jsonb_set(st, '{tries}', to_jsonb((st->>'tries')::int + 1));
  if s0 = sym then
    st := jsonb_set(st, '{matched}', (st->'matched') || jsonb_build_object(i0::text, s0, p_i::text, sym));
    st := jsonb_set(st, '{up}', '[]'::jsonb);
    if vs then st := jsonb_set(st, array['scores', me::text], to_jsonb((st->'scores'->>me::text)::int + 1)); end if;
    done := (select count(*) from jsonb_object_keys(st->'matched')) = n;
    if done then perform _save(g, st, '{}', 'done', case when vs then _winner(g, st) end);
    else perform _save(g, st, array[me]); end if;       -- ghép đúng thì được lật tiếp
  else
    st := jsonb_set(st, '{up}', up);
    perform _save(g, st, array[_opp(g)]);
  end if;
end $$;

-- ===== 7. Hiểu nhau đến đâu: một người trả lời về mình, người kia đoán =====
create or replace function kn_answer(p_id uuid, p_choice int) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); q jsonb;
begin
  if g.kind <> 'hieu_nhau' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'answer' or (st->>'answerer')::uuid <> me then raise exception 'Chưa đến lượt bạn trả lời'; end if;
  q := st->'qs'->((st->>'i')::int);
  if p_choice < 0 or p_choice >= jsonb_array_length(q->'o') then raise exception 'Lựa chọn không hợp lệ'; end if;
  perform _sset(g.id, me, jsonb_build_object('a', p_choice, 'i', (st->>'i')::int));
  st := jsonb_set(st, '{phase}', '"guess"');
  perform _save(g, st, array[_opp(g)]);
end $$;

create or replace function kn_guess(p_id uuid, p_choice int) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); asr uuid; q jsonb; sec jsonb; is_ok boolean; i int;
begin
  if g.kind <> 'hieu_nhau' then raise exception 'Sai loại ván'; end if;
  st := g.state; asr := (st->>'answerer')::uuid; i := (st->>'i')::int;
  if st->>'phase' <> 'guess' or asr = me then raise exception 'Chưa đến lượt bạn đoán'; end if;
  q := st->'qs'->i;
  if p_choice < 0 or p_choice >= jsonb_array_length(q->'o') then raise exception 'Lựa chọn không hợp lệ'; end if;
  sec := _sget(g.id, asr);
  if (sec->>'i')::int <> i then raise exception 'Chưa có câu trả lời để đoán'; end if;
  is_ok := (sec->>'a')::int = p_choice;
  if is_ok then st := jsonb_set(st, array['scores', me::text], to_jsonb((st->'scores'->>me::text)::int + 1)); end if;
  st := jsonb_set(st, '{log}', (st->'log') || jsonb_build_array(jsonb_build_object('i', i, 'by', asr, 'a', (sec->>'a')::int, 'g', p_choice, 'ok', is_ok)));
  if i + 1 >= jsonb_array_length(st->'qs') then
    perform _save(g, st, '{}', 'done', _winner(g, st) );
  else
    st := st || jsonb_build_object('i', i + 1, 'answerer', me::text, 'phase', 'answer');
    perform _save(g, st, array[me]);
  end if;
end $$;

-- ===== 8. Phá thuyền ẩn (Hải chiến) =====
create or replace function pt_place(p_id uuid, p_ships jsonb) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); size int; fleet int[]; lens int[]; s jsonb; len int; r int; c int; d text; k int; rr int; cc int;
  occ text[] := '{}'; cells jsonb; outp jsonb := '[]'::jsonb; key text;
begin
  if g.kind <> 'pha_thuyen' then raise exception 'Sai loại ván'; end if;
  st := g.state; size := (st->>'size')::int;
  if st->>'phase' <> 'setup' or (st->'ready'->>me::text)::boolean then raise exception 'Bạn đã xếp tàu rồi'; end if;
  if jsonb_typeof(p_ships) <> 'array' then raise exception 'Đội tàu không hợp lệ'; end if;
  fleet := array(select v::int from jsonb_array_elements_text(st->'fleet') v order by v::int);
  fleet := array(select x from unnest(fleet) x order by x);
  lens := array(select (e->>'len')::int from jsonb_array_elements(p_ships) e order by 1);
  lens := array(select x from unnest(lens) x order by x);
  if lens is distinct from fleet then raise exception 'Đội tàu phải đủ các tàu: %', fleet; end if;
  for s in select * from jsonb_array_elements(p_ships) loop
    len := (s->>'len')::int; r := (s->>'r')::int; c := (s->>'c')::int; d := s->>'d';
    if d not in ('h','v') then raise exception 'Hướng tàu không hợp lệ'; end if;
    cells := '[]'::jsonb;
    for k in 0..len-1 loop
      rr := r + case when d = 'v' then k else 0 end; cc := c + case when d = 'h' then k else 0 end;
      if rr < 0 or rr >= size or cc < 0 or cc >= size then raise exception 'Có tàu nằm ngoài bàn'; end if;
      key := rr || ',' || cc;
      if key = any(occ) then raise exception 'Các tàu không được đè lên nhau'; end if;
      occ := occ || key; cells := cells || jsonb_build_array(jsonb_build_array(rr, cc));
    end loop;
    outp := outp || jsonb_build_array(jsonb_build_object('len', len, 'cells', cells));
  end loop;
  perform _sset(g.id, me, jsonb_build_object('ships', outp));
  st := jsonb_set(st, array['ready', me::text], 'true');
  if (st->'ready'->>g.p1::text)::boolean and (st->'ready'->>g.p2::text)::boolean then
    st := jsonb_set(st, '{phase}', '"battle"');
    perform _save(g, st, array[g.p1]);
  else perform _save(g, st, array[_opp(g)]); end if;
end $$;

create or replace function pt_fire(p_id uuid, p_r int, p_c int) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); opp uuid; size int; ships jsonb; ship jsonb; hit boolean := false; hitship jsonb;
  shots jsonb; hits jsonb; total int := 0; allsunk boolean := true;
begin
  if g.kind <> 'pha_thuyen' then raise exception 'Sai loại ván'; end if;
  st := g.state; size := (st->>'size')::int; opp := _opp(g);
  if st->>'phase' <> 'battle' or not _mine(g) then raise exception 'Chưa đến lượt bạn'; end if;
  if p_r < 0 or p_r >= size or p_c < 0 or p_c >= size then raise exception 'Ô nằm ngoài bàn'; end if;
  shots := st->'shots'->(me::text);
  if exists (select 1 from jsonb_array_elements(shots) x where (x->>'r')::int = p_r and (x->>'c')::int = p_c) then raise exception 'Bạn đã bắn ô này rồi'; end if;
  ships := _sget(g.id, opp)->'ships';
  for ship in select * from jsonb_array_elements(ships) loop
    if _has_cell(ship->'cells', p_r, p_c) then hit := true; hitship := ship; end if;
  end loop;
  shots := shots || jsonb_build_array(jsonb_build_object('r', p_r, 'c', p_c, 'h', hit));
  st := jsonb_set(st, array['shots', me::text], shots);
  hits := coalesce((select jsonb_agg(jsonb_build_array(x->'r', x->'c')) from jsonb_array_elements(shots) x where (x->>'h')::boolean), '[]'::jsonb);
  if hit and _ship_down(hits, hitship->'cells') then
    st := jsonb_set(st, array['sunk', opp::text], (st->'sunk'->(opp::text)) || jsonb_build_array(hitship));
  end if;
  for ship in select * from jsonb_array_elements(ships) loop
    total := total + (ship->>'len')::int;
    if not _ship_down(hits, ship->'cells') then allsunk := false; end if;
  end loop;
  if allsunk then
    st := jsonb_set(st, '{reveal}', jsonb_build_object(g.p1::text, _sget(g.id, g.p1)->'ships', g.p2::text, _sget(g.id, g.p2)->'ships'));
    perform _save(g, st, '{}', 'done', me);
  else perform _save(g, st, array[opp]); end if;
end $$;

-- ===== 9. Bài cào (3 lá, tính nút; ba cào = 3 lá J/Q/K là lớn nhất) =====
-- Lá bài mã hóa 0..51: hạng = số % 13 (0 = A, 1..8 = 2..9, 9 = 10, 10 = J, 11 = Q, 12 = K), chất = số / 13.
create or replace function _bc_pts(cards int[]) returns int language sql immutable as $$
  select case when (select bool_and(c % 13 >= 10) from unnest(cards) c) then 10
    else (select sum(case when c % 13 = 0 then 1 when c % 13 >= 9 then 10 else c % 13 + 1 end) from unnest(cards) c)::int % 10 end $$;

create or replace function _bc_deal(p_game uuid, a uuid, b uuid) returns void language plpgsql security definer set search_path=public as $$
declare deck int[] := array(select i from generate_series(0, 51) i order by random());
begin
  perform _sset(p_game, a, jsonb_build_object('cards', to_jsonb(deck[1:3])));
  perform _sset(p_game, b, jsonb_build_object('cards', to_jsonb(deck[4:6])));
end $$;

create or replace function bc_reveal(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); ha int[]; hb int[]; pa int; pb int; w uuid; is_last boolean;
begin
  if g.kind <> 'bai_cao' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'play' or (st->'revealed'->>me::text)::boolean then raise exception 'Bạn đã lật bài rồi'; end if;
  st := jsonb_set(st, array['revealed', me::text], 'true');
  if not ((st->'revealed'->>g.p1::text)::boolean and (st->'revealed'->>g.p2::text)::boolean) then
    perform _save(g, st, array[_opp(g)]); return; end if;
  ha := _ints(_sget(g.id, g.p1)->'cards'); hb := _ints(_sget(g.id, g.p2)->'cards');
  pa := _bc_pts(ha); pb := _bc_pts(hb);
  w := case when pa > pb then g.p1 when pa < pb then g.p2 end;
  if w is not null then st := jsonb_set(st, array['scores', w::text], to_jsonb((st->'scores'->>w::text)::int + 1)); end if;
  st := jsonb_set(st, '{phase}', '"show"');
  st := jsonb_set(st, '{last}', jsonb_build_object('hands', jsonb_build_object(g.p1::text, to_jsonb(ha), g.p2::text, to_jsonb(hb)),
    'pts', jsonb_build_object(g.p1::text, pa, g.p2::text, pb), 'winner', w));
  is_last := (st->>'round')::int >= (st->>'rounds')::int;
  if is_last then perform _save(g, st, '{}', 'done', _winner(g, st));
  else perform _save(g, st, array[g.p1, g.p2]); end if;
end $$;

create or replace function bc_next(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb;
begin
  if g.kind <> 'bai_cao' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'show' then raise exception 'Chưa lật hết bài'; end if;
  perform _bc_deal(g.id, g.p1, g.p2);
  st := st || jsonb_build_object('round', (st->>'round')::int + 1, 'phase', 'play', 'last', null,
    'revealed', jsonb_build_object(g.p1::text, false, g.p2::text, false));
  perform _save(g, st, array[g.p1, g.p2]);
end $$;

-- ===== 10. Xì dách 2 người (cái và con đổi vai mỗi ván) =====
-- A tính 1 / 11 (2 lá), 1 / 10 / 11 (3 lá), 1 / 10 (4 lá), 1 (5 lá); J Q K = 10. Xì bàng (2 A) > xì dách (A + 10) > ngũ linh (5 lá <= 21) > điểm > quắc.
-- Con dằn khi từ 16 điểm, cái dằn khi từ 15 điểm. Bằng nhau thì hòa.
create or replace function _xd_eval(cards int[]) returns jsonb language plpgsql immutable as $$
declare n int := coalesce(array_length(cards, 1), 0); base int := 0; k int := 0; c int; rk int; totals int[]; opts int[]; best int; kind text; i int;
begin
  foreach c in array cards loop rk := c % 13; if rk = 0 then k := k + 1; else base := base + least(rk + 1, 10); end if; end loop;
  opts := case when n <= 2 then array[1,11] when n = 3 then array[1,10,11] when n = 4 then array[1,10] else array[1] end;
  totals := array[base];
  for i in 1..k loop totals := array(select t + d from unnest(totals) t, unnest(opts) d); end loop;
  best := (select max(t) from unnest(totals) t where t <= 21);
  if best is null then best := (select min(t) from unnest(totals) t); end if;
  kind := case when n = 2 and k = 2 then 'xibang' when n = 2 and k = 1 and base = 10 then 'xidach'
               when n = 5 and best <= 21 then 'nguli' when best > 21 then 'quac' else 'diem' end;
  return jsonb_build_object('n', n, 'pts', best, 'kind', kind);
end $$;
create or replace function _xd_rank(e jsonb) returns int language sql immutable as $$
  select case e->>'kind' when 'xibang' then 5 when 'xidach' then 4 when 'nguli' then 3 when 'diem' then 2 else 1 end $$;
create or replace function _xd_cmp(x jsonb, y jsonb) returns int language sql immutable as $$
  select case when _xd_rank(x) > _xd_rank(y) then 1 when _xd_rank(x) < _xd_rank(y) then -1
    when _xd_rank(x) in (2, 3) then sign((x->>'pts')::int - (y->>'pts')::int)::int else 0 end $$;

create or replace function _xd_show(g games, st jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare a text := g.p1::text; b text := g.p2::text; ha int[]; hb int[]; ea jsonb; eb jsonb; w text;
begin
  ha := _ints(_sget(g.id, g.p1)->'cards'); hb := _ints(_sget(g.id, g.p2)->'cards');
  ea := _xd_eval(ha); eb := _xd_eval(hb);
  w := case _xd_cmp(ea, eb) when 1 then a when -1 then b end;
  if w is not null then st := jsonb_set(st, array['scores', w], to_jsonb((st->'scores'->>w)::int + 1)); end if;
  st := jsonb_set(st, '{phase}', '"show"');
  st := jsonb_set(st, '{last}', jsonb_build_object('hands', jsonb_build_object(a, to_jsonb(ha), b, to_jsonb(hb)),
    'ev', jsonb_build_object(a, ea, b, eb), 'winner', w));
  return st;
end $$;

create or replace function _xd_round(g games, st jsonb, p_round int, p_dealer uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare deck int[] := array(select i from generate_series(0, 51) i order by random()); ha int[]; hb int[]; fst uuid; a text := g.p1::text; b text := g.p2::text; ea jsonb; eb jsonb;
begin
  ha := deck[1:2]; hb := deck[3:4]; deck := deck[5:52];
  perform _sset(g.id, g.p1, jsonb_build_object('cards', to_jsonb(ha)));
  perform _sset(g.id, g.p2, jsonb_build_object('cards', to_jsonb(hb)));
  perform _sset(g.id, _srv(), jsonb_build_object('deck', to_jsonb(deck)));
  fst := case when p_dealer = g.p1 then g.p2 else g.p1 end;
  st := st || jsonb_build_object('round', p_round, 'dealer', p_dealer::text, 'turn', fst::text, 'phase', 'play',
    'stood', jsonb_build_object(a, false, b, false), 'counts', jsonb_build_object(a, 2, b, 2), 'last', null);
  ea := _xd_eval(ha); eb := _xd_eval(hb);
  if ea->>'kind' in ('xibang', 'xidach') or eb->>'kind' in ('xibang', 'xidach') then st := _xd_show(g, st); end if;
  return st;
end $$;

create or replace function _xd_commit(g games, st jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  if st->>'phase' = 'show' then
    if (st->>'round')::int >= (st->>'rounds')::int then perform _save(g, st, '{}', 'done', _winner(g, st));
    else perform _save(g, st, array[g.p1, g.p2]); end if;
  else perform _save(g, st, array[(st->>'turn')::uuid]); end if;
end $$;

-- sau khi mình dằn: người kia đã dằn thì lật bài, chưa thì đến lượt họ
create or replace function _xd_after_stand(g games, st jsonb, me uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare opp uuid := case when me = g.p1 then g.p2 else g.p1 end;
begin
  st := jsonb_set(st, array['stood', me::text], 'true');
  if (st->'stood'->>opp::text)::boolean then return _xd_show(g, st); end if;
  return jsonb_set(st, '{turn}', to_jsonb(opp::text));
end $$;

create or replace function xd_hit(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); hand int[]; deck int[]; ev jsonb;
begin
  if g.kind <> 'xi_dach' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'play' or (st->>'turn')::uuid <> me then raise exception 'Chưa đến lượt bạn'; end if;
  hand := _ints(_sget(g.id, me)->'cards');
  if array_length(hand, 1) >= 5 then raise exception 'Đã đủ 5 lá'; end if;
  deck := _ints(_sget(g.id, _srv())->'deck');
  hand := hand || deck[1]; deck := deck[2:array_length(deck, 1)];
  perform _sset(g.id, me, jsonb_build_object('cards', to_jsonb(hand)));
  perform _sset(g.id, _srv(), jsonb_build_object('deck', to_jsonb(deck)));
  st := jsonb_set(st, array['counts', me::text], to_jsonb(array_length(hand, 1)));
  ev := _xd_eval(hand);
  if ev->>'kind' in ('quac', 'nguli') then st := _xd_after_stand(g, st, me); end if;   -- quắc hoặc ngũ linh thì không rút thêm được nữa
  perform _xd_commit(g, st);
end $$;

create or replace function xd_stand(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); ev jsonb; need int;
begin
  if g.kind <> 'xi_dach' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'play' or (st->>'turn')::uuid <> me then raise exception 'Chưa đến lượt bạn'; end if;
  ev := _xd_eval(_ints(_sget(g.id, me)->'cards'));
  need := case when (st->>'dealer')::uuid = me then 15 else 16 end;
  if ev->>'kind' = 'diem' and (ev->>'pts')::int < need then raise exception 'Chưa đủ tuổi, cần từ % điểm mới được dằn', need; end if;
  st := _xd_after_stand(g, st, me);
  perform _xd_commit(g, st);
end $$;

create or replace function xd_next(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb;
begin
  if g.kind <> 'xi_dach' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'show' then raise exception 'Ván này chưa lật bài'; end if;
  st := _xd_round(g, st, (st->>'round')::int + 1, case when (st->>'dealer')::uuid = g.p1 then g.p2 else g.p1 end);
  perform _xd_commit(g, st);
end $$;

-- ===== 11. Vẽ và đoán (nét vẽ gửi realtime qua kênh game-<space>; máy chủ chỉ giữ từ khóa và chấm đáp án) =====
create or replace function vd_set_word(p_id uuid, p_word text) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); w text := regexp_replace(btrim(coalesce(p_word, '')), '\s+', ' ', 'g');
begin
  if g.kind <> 've_doan' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'pick' or (st->>'drawer')::uuid <> me then raise exception 'Chưa đến lượt bạn chọn từ'; end if;
  if char_length(w) not between 1 and 30 then raise exception 'Từ cần vẽ dài 1 đến 30 ký tự'; end if;
  perform _sset(g.id, me, jsonb_build_object('word', w, 'round', (st->>'round')::int));
  st := st || jsonb_build_object('phase', 'draw', 'guesses', '[]'::jsonb, 'last', null,
    'wl', (select jsonb_agg(char_length(x)) from regexp_split_to_table(w, ' ') x));
  perform _save(g, st, array[_opp(g)]);
end $$;

create or replace function vd_guess(p_id uuid, p_text text) returns boolean language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); dr uuid; word text; ok boolean; lg jsonb; t text := left(btrim(coalesce(p_text, '')), 40);
begin
  if g.kind <> 've_doan' then raise exception 'Sai loại ván'; end if;
  st := g.state; dr := (st->>'drawer')::uuid;
  if st->>'phase' <> 'draw' or dr = me then raise exception 'Bạn chưa đoán được lúc này'; end if;
  if t = '' then raise exception 'Hãy nhập đáp án'; end if;
  word := _sget(g.id, dr)->>'word';
  ok := _norm(t) = _norm(word);
  if ok then
    st := jsonb_set(st, array['scores', me::text], to_jsonb((st->'scores'->>me::text)::int + 1));
    st := st || jsonb_build_object('phase', 'over', 'last', jsonb_build_object('word', word, 'ok', true));
    perform _save(g, st, array[g.p1, g.p2]);
  else
    lg := coalesce(st->'guesses', '[]'::jsonb) || jsonb_build_array(t);
    lg := (select jsonb_agg(x order by o) from (select x, o from jsonb_array_elements(lg) with ordinality t2(x, o) order by o desc limit 12) z);
    st := jsonb_set(st, '{guesses}', lg);
    perform _save(g, st, array[me]);
  end if;
  return ok;
end $$;

create or replace function vd_giveup(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; dr uuid; word text;
begin
  if g.kind <> 've_doan' then raise exception 'Sai loại ván'; end if;
  st := g.state; dr := (st->>'drawer')::uuid;
  if st->>'phase' <> 'draw' then raise exception 'Chưa có từ để bỏ qua'; end if;
  word := _sget(g.id, dr)->>'word';
  st := st || jsonb_build_object('phase', 'over', 'last', jsonb_build_object('word', word, 'ok', false));
  perform _save(g, st, array[g.p1, g.p2]);
end $$;

create or replace function vd_next(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; nd uuid;
begin
  if g.kind <> 've_doan' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'over' then raise exception 'Lượt này chưa kết thúc'; end if;
  if (st->>'round')::int >= (st->>'rounds')::int then perform _save(g, st, '{}', 'done', _winner(g, st)); return; end if;
  nd := case when (st->>'drawer')::uuid = g.p1 then g.p2 else g.p1 end;
  st := st || jsonb_build_object('round', (st->>'round')::int + 1, 'drawer', nd::text, 'phase', 'pick', 'wl', null, 'guesses', '[]'::jsonb);
  perform _save(g, st, array[nd]);
end $$;

-- ===== 12. Thật hay thách (thẻ do app chọn; không có thắng thua, kết thúc khi muốn) =====
create or replace function td_card(p_id uuid, p_card jsonb) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); t uuid := _opp(g);
begin
  if g.kind <> 'that_thach' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'pick' or not _mine(g) then raise exception 'Chưa đến lượt bạn ra đề'; end if;
  if p_card->>'t' not in ('truth', 'dare') or char_length(coalesce(p_card->>'text', '')) not between 1 and 240 then raise exception 'Thẻ không hợp lệ'; end if;
  st := st || jsonb_build_object('phase', 'card', 'card', jsonb_build_object('t', p_card->>'t', 'text', left(p_card->>'text', 240)), 'target', t::text);
  perform _save(g, st, array[t]);
end $$;

create or replace function td_done(p_id uuid, p_skip boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare g games := _g(p_id); st jsonb; me uuid := auth.uid(); entry jsonb; lg jsonb;
begin
  if g.kind <> 'that_thach' then raise exception 'Sai loại ván'; end if;
  st := g.state;
  if st->>'phase' <> 'card' or (st->>'target')::uuid <> me then raise exception 'Chưa đến lượt bạn'; end if;
  entry := (st->'card') || jsonb_build_object('who', me::text, 'skip', coalesce(p_skip, false));
  lg := (jsonb_build_array(entry) || coalesce(st->'log', '[]'::jsonb));
  lg := (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(lg) with ordinality t(x, o) order by o limit 8) z);
  st := st || jsonb_build_object('phase', 'pick', 'card', null, 'target', null, 'log', lg, 'count', (st->>'count')::int + case when coalesce(p_skip, false) then 0 else 1 end);
  perform _save(g, st, array[me]);       -- người vừa làm xong sẽ ra đề cho người kia
end $$;

-- ===== 13. Hộp quà thử thách: người thắng rút một phần quà người thua đã tự viết sẵn =====
create or replace function voucher_add(p_title text) returns uuid language plpgsql security definer set search_path=public as $$
declare vid uuid; begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Quà tặng dài 1 đến 120 ký tự'; end if;
  if (select count(*) from game_vouchers where space_id = my_space() and owner = auth.uid() and status = 'pool') >= 40 then raise exception 'Hộp quà của bạn đã đầy (tối đa 40)'; end if;
  insert into game_vouchers(space_id, owner, title) values (my_space(), auth.uid(), btrim(p_title)) returning id into vid;
  return vid; end $$;

create or replace function voucher_remove(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from game_vouchers where id = p_id and space_id = my_space() and owner = auth.uid() and status = 'pool';
  if not found then raise exception 'Không xóa được phần quà này'; end if;
end $$;

create or replace function voucher_draw(p_game uuid) returns game_vouchers language plpgsql security definer set search_path=public as $$
declare g games; loser uuid; v game_vouchers;
begin
  select * into g from games where id = p_game and space_id = my_space() and auth.uid() in (p1, p2) for update;
  if g.id is null then raise exception 'Không tìm thấy ván chơi'; end if;
  if g.status <> 'done' or g.winner is distinct from auth.uid() then raise exception 'Chỉ người thắng mới được rút quà'; end if;
  if g.reward_drawn then raise exception 'Ván này đã rút quà rồi'; end if;
  loser := case when auth.uid() = g.p1 then g.p2 else g.p1 end;
  select * into v from game_vouchers where space_id = g.space_id and owner = loser and status = 'pool' order by random() limit 1 for update skip locked;
  if v.id is null then raise exception 'Người kia chưa có phần quà nào trong hộp'; end if;
  update game_vouchers set status = 'won', holder = auth.uid(), game_id = g.id, won_at = now() where id = v.id returning * into v;
  update games set reward_drawn = true where id = g.id;
  return v;
end $$;

create or replace function voucher_done(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update game_vouchers set status = 'done', done_at = now()
   where id = p_id and space_id = my_space() and status = 'won' and auth.uid() in (holder, owner);
  if not found then raise exception 'Không cập nhật được phần quà này'; end if;
end $$;

-- ===== 14. Quyền gọi =====
do $$
declare f text;
begin
  -- hàm nội bộ: không ai gọi trực tiếp từ trình duyệt
  for f in select unnest(array[
    '_srv()', '_ints(jsonb)', '_g(uuid)', '_opp(games)', '_save(games,jsonb,uuid[],text,uuid)', '_sget(uuid,uuid)', '_sset(uuid,uuid,jsonb)',
    '_mine(games)', '_norm(text)', '_has_cell(jsonb,int,int)', '_ship_down(jsonb,jsonb)', '_winner(games,jsonb)', '_bc_pts(int[])', '_bc_deal(uuid,uuid,uuid)', '_xd_eval(int[])', '_xd_rank(jsonb)',
    '_xd_cmp(jsonb,jsonb)', '_xd_show(games,jsonb)', '_xd_round(games,jsonb,int,uuid)', '_xd_commit(games,jsonb)', '_xd_after_stand(games,jsonb,uuid)'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- hàm công khai cho người đã đăng nhập
  for f in select unnest(array[
    'game_my_secret(uuid)', 'game_end(uuid)', 'game_create(text,jsonb)', 'caro_move(uuid,int,int)', 'sb_set(uuid,text)', 'sb_guess(uuid,text)',
    'lb_flip(uuid,int)', 'kn_answer(uuid,int)', 'kn_guess(uuid,int)', 'pt_place(uuid,jsonb)', 'pt_fire(uuid,int,int)', 'bc_reveal(uuid)', 'bc_next(uuid)',
    'xd_hit(uuid)', 'xd_stand(uuid)', 'xd_next(uuid)', 'vd_set_word(uuid,text)', 'vd_guess(uuid,text)', 'vd_giveup(uuid)', 'vd_next(uuid)',
    'td_card(uuid,jsonb)', 'td_done(uuid,boolean)', 'voucher_add(text)', 'voucher_remove(uuid)', 'voucher_draw(uuid)', 'voucher_done(uuid)'])
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
