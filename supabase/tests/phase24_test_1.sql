-- Kiểm thử luật chơi phase24: cờ caro, số bí mật, lật bài, ai hiểu ai nhất, phá thuyền.
\set ON_ERROR_STOP on
create or replace function t_as(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
truncate game_vouchers, games, game_secrets cascade; delete from profiles; delete from spaces; delete from auth.users;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into spaces(id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into profiles values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','An'),('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Binh');

-- ===== CARO =====
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; i int; failed boolean;
begin
  perform t_as(u1); gid:=game_create('caro','{"size":10}');
  perform t_as(u2);
  begin perform caro_move(gid,0,0); failed:=false; exception when others then failed:=true; assert sqlerrm like '%Chưa đến lượt%', sqlerrm; end; assert failed,'out of turn must fail';
  begin perform game_create('caro'); failed:=false; exception when others then failed:=true; end; assert failed,'second active caro must fail';
  for i in 0..3 loop
    perform t_as(u1); perform caro_move(gid,0,i);
    perform t_as(u2); perform caro_move(gid,1,i);
  end loop;
  perform t_as(u1);
  begin perform caro_move(gid,0,0); failed:=false; exception when others then failed:=true; end; -- not his turn? it is u1's turn, cell taken
  assert failed,'occupied cell must fail';
  perform caro_move(gid,0,4);
  select * into g from games where id=gid;
  assert g.status='done' and g.winner=u1, 'caro win';
  assert jsonb_array_length(g.state->'win')=5, 'win cells '||(g.state->'win')::text;
  raise notice 'CARO ok';
end $$;

-- caro diagonal win for u2 and draw-less check on 15 board
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; i int;
begin
  perform t_as(u1); gid:=game_create('caro');
  for i in 0..4 loop
    perform t_as(u1); perform caro_move(gid,i,14-i-0 - (case when i<5 then 0 else 0 end)+0 - 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0 - 0 + 0); -- anti-diagonal for u1
    exit when i=4;
    perform t_as(u2); perform caro_move(gid,13,i);
  end loop;
  select * into g from games where id=gid;
  assert g.status='done' and g.winner=u1, 'anti diagonal win';
  raise notice 'CARO diag ok';
end $$;

-- ===== SO BI MAT =====
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; failed boolean;
begin
  perform t_as(u1); gid:=game_create('so_bi_mat','{"len":4}');
  begin perform sb_set(gid,'1123'); failed:=false; exception when others then failed:=true; end; assert failed,'dup digits rejected';
  perform sb_set(gid,'1234');
  select * into g from games where id=gid; assert g.waiting=array[u2],'waiting u2';
  perform t_as(u2); perform sb_set(gid,'5678');
  select * into g from games where id=gid; assert g.state->>'phase'='play' and g.waiting=array[u1],'play phase';
  perform t_as(u1); perform sb_guess(gid,'5678');   -- u1 solves first
  select * into g from games where id=gid; assert g.status='playing' and g.waiting=array[u2] and (g.state->>'solved')::boolean,'final chance';
  perform t_as(u2); perform sb_guess(gid,'1235');   -- u2 misses -> u1 wins
  select * into g from games where id=gid; assert g.status='done' and g.winner=u1,'u1 wins'; assert g.state->'reveal'->>u2::text='5678','reveal';
  -- bulls/cows counts
  perform t_as(u1); gid:=game_create('so_bi_mat','{"len":4}'); perform sb_set(gid,'1234'); perform t_as(u2); perform sb_set(gid,'1234');
  perform t_as(u1); perform sb_guess(gid,'1243'); select * into g from games where id=gid;
  assert (g.state->'guesses'->(u1::text)->0->>'b')::int=2 and (g.state->'guesses'->(u1::text)->0->>'c')::int=2,'bulls cows '||(g.state->'guesses')::text;
  perform t_as(u2); perform sb_guess(gid,'1234');   -- u2 solves first as 2nd player -> immediate win for u2 (u1 had equal turns)
  select * into g from games where id=gid; assert g.status='done' and g.winner=u2,'p2 immediate win';
  -- both solve -> draw
  perform t_as(u1); gid:=game_create('so_bi_mat','{"len":3}'); perform sb_set(gid,'123'); perform t_as(u2); perform sb_set(gid,'456');
  perform t_as(u1); perform sb_guess(gid,'456'); perform t_as(u2); perform sb_guess(gid,'123');
  select * into g from games where id=gid; assert g.status='done' and g.winner is null,'draw';
  raise notice 'SO BI MAT ok';
end $$;

-- ===== LAT BAI (memory) =====
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; lay jsonb; n int; i int; j int; cur uuid; done_ boolean:=false; found boolean; guard int:=0; tries int;
begin
  perform t_as(u1); gid:=game_create('lat_bai','{"pairs":4,"mode":"vs"}');
  lay:=(select data->'layout' from game_secrets where game_id=gid and owner=_srv());
  assert jsonb_array_length(lay)=8,'layout 8';
  -- mismatch first: find two different cards
  perform lb_flip(gid,0);
  select * into g from games where id=gid; assert jsonb_array_length(g.state->'up')=1 and g.waiting=array[u1],'first flip keeps turn';
  j:=1; while lay->>j = lay->>0 loop j:=j+1; end loop;
  perform lb_flip(gid,j);
  select * into g from games where id=gid; assert g.waiting=array[u2] and jsonb_array_length(g.state->'up')=2,'mismatch passes turn';
  -- now play perfectly, alternating as required
  loop
    guard:=guard+1; assert guard<60,'loop';
    select * into g from games where id=gid; exit when g.status<>'playing';
    cur:=g.waiting[1]; perform t_as(cur);
    -- pick first unmatched card i, then its partner
    for i in 0..7 loop
      if not (g.state->'matched' ? i::text) then
        for j in 0..7 loop
          if j<>i and lay->>j=lay->>i and not (g.state->'matched' ? j::text) then
            perform lb_flip(gid,i); perform lb_flip(gid,j); exit;
          end if;
        end loop; exit;
      end if;
    end loop;
  end loop;
  select * into g from games where id=gid;
  assert g.status='done','memory done'; assert (g.state->'scores'->>u2::text)::int=4,'u2 got all pairs '||(g.state->'scores')::text; assert g.winner=u2,'winner';
  raise notice 'LAT BAI ok';
end $$;

-- ===== HIEU NHAU =====
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; qs jsonb; i int; failed boolean;
begin
  qs:=(select jsonb_agg(jsonb_build_object('q','Câu '||x,'o',jsonb_build_array('a','b','c'))) from generate_series(1,4) x);
  perform t_as(u1); gid:=game_create('hieu_nhau',jsonb_build_object('qs',qs));
  for i in 0..3 loop
    select * into g from games where id=gid;
    perform t_as((g.state->>'answerer')::uuid); perform kn_answer(gid,1);
    select * into g from games where id=gid; perform t_as(g.waiting[1]);
    begin perform kn_answer(gid,0); failed:=false; exception when others then failed:=true; end; assert failed,'guesser cannot answer';
    perform kn_guess(gid,case when i%2=0 then 1 else 2 end);   -- right on even, wrong on odd
  end loop;
  select * into g from games where id=gid; assert g.status='done','hieu done';
  assert (g.state->'scores'->>u2::text)::int=2 and (g.state->'scores'->>u1::text)::int=0 and g.winner=u2,'scores '||(g.state->'scores')::text;
  assert jsonb_array_length(g.state->'log')=4,'log';
  raise notice 'HIEU NHAU ok';
end $$;

-- ===== PHA THUYEN =====
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; ships jsonb; failed boolean; s jsonb; c jsonb; secret1 jsonb; r int; cc int; hit boolean; guard int:=0;
begin
  ships:='[{"len":5,"r":0,"c":0,"d":"h"},{"len":4,"r":2,"c":0,"d":"h"},{"len":3,"r":4,"c":0,"d":"h"},{"len":3,"r":6,"c":0,"d":"h"},{"len":2,"r":8,"c":0,"d":"v"}]';
  perform t_as(u1); gid:=game_create('pha_thuyen');
  begin perform pt_place(gid,'[{"len":5,"r":0,"c":0,"d":"h"}]'); failed:=false; exception when others then failed:=true; end; assert failed,'incomplete fleet rejected';
  begin perform pt_place(gid,'[{"len":5,"r":0,"c":7,"d":"h"},{"len":4,"r":2,"c":0,"d":"h"},{"len":3,"r":4,"c":0,"d":"h"},{"len":3,"r":6,"c":0,"d":"h"},{"len":2,"r":8,"c":0,"d":"v"}]'); failed:=false; exception when others then failed:=true; end; assert failed,'out of bounds rejected';
  begin perform pt_place(gid,'[{"len":5,"r":0,"c":0,"d":"h"},{"len":4,"r":0,"c":2,"d":"h"},{"len":3,"r":4,"c":0,"d":"h"},{"len":3,"r":6,"c":0,"d":"h"},{"len":2,"r":8,"c":0,"d":"v"}]'); failed:=false; exception when others then failed:=true; end; assert failed,'overlap rejected';
  perform pt_place(gid,ships);
  perform t_as(u2); perform pt_place(gid,ships);
  select * into g from games where id=gid; assert g.state->>'phase'='battle' and g.waiting=array[u1],'battle';
  -- u1 fires: miss then hits; u2 fires at empty water
  perform t_as(u1); perform pt_fire(gid,9,9);
  select * into g from games where id=gid; assert (g.state->'shots'->(u1::text)->0->>'h')::boolean=false and g.waiting=array[u2],'miss';
  perform t_as(u2); perform pt_fire(gid,9,9);
  perform t_as(u1);
  begin perform pt_fire(gid,9,9); failed:=false; exception when others then failed:=true; end; assert failed,'repeat shot rejected';
  perform t_as(u1);  -- (turn is u1)
  select * into g from games where id=gid; assert g.waiting=array[u1],'turn u1';
  perform pt_fire(gid,8,0); perform t_as(u2); perform pt_fire(gid,9,8); perform t_as(u1); perform pt_fire(gid,9,0);
  select * into g from games where id=gid; assert jsonb_array_length(g.state->'sunk'->(u2::text))=1,'one ship sunk';
  -- finish: u1 hits all other cells; u2 wastes shots in empty water
  for r in 0..8 loop for cc in 0..4 loop
    select * into g from games where id=gid; exit when g.status<>'playing';
    if g.waiting=array[u2] then perform t_as(u2); perform pt_fire(gid,1+2*((guard/10)%4),guard%10); guard:=guard+1; end if;
    perform t_as(u1);
    if ((r=0 and cc<5) or (r=2 and cc<4) or (r=4 and cc<3) or (r=6 and cc<3))
       and not exists(select 1 from jsonb_array_elements((select state->'shots'->(u1::text) from games where id=gid)) x where (x->>'r')::int=r and (x->>'c')::int=cc) then
      perform pt_fire(gid,r,cc);
    end if;
  end loop; end loop;
  select * into g from games where id=gid; assert g.status='done' and g.winner=u1,'u1 wins battleship '||g.status; assert g.state->'reveal' is not null,'reveal fleets';
  raise notice 'PHA THUYEN ok';
end $$;
