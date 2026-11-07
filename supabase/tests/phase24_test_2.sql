-- Kiểm thử luật chơi phase24: bài cào, xì dách (40 ván ngẫu nhiên), vẽ và đoán, thật hay thách, hộp quà, cách ly giữa các Space.
\set ON_ERROR_STOP on
truncate game_vouchers, games, game_secrets cascade;
insert into auth.users values ('33333333-3333-3333-3333-333333333333') on conflict do nothing;
insert into spaces(id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') on conflict do nothing;
insert into profiles values ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Lạ') on conflict do nothing;

-- pure functions
do $$ begin
  assert _bc_pts(array[10,11,12])=10,'ba cao';
  assert _bc_pts(array[0,1])=3,'A+2'; assert _bc_pts(array[9,10,11])=0,'10 J Q = 0';
  assert _bc_pts(array[8,21,34])=7,'9+9+9=27 -> 7';
  assert _xd_eval(array[0,13])->>'kind'='xibang','xi bang';
  assert _xd_eval(array[0,9])->>'kind'='xidach' and _xd_eval(array[12,0])->>'kind'='xidach','xi dach';
  assert _xd_eval(array[5,6,7])->>'pts'='21','6+7+8';
  assert _xd_eval(array[12,11,5])->>'kind'='quac','quac';
  assert _xd_eval(array[0,1,2,3,4])->>'kind'='nguli','ngu linh';
  assert _xd_eval(array[0,13,8])->>'pts'='21','A A 9 = 21';
  assert _xd_eval(array[0,5])->>'pts'='17','A+6 = 17';
  assert _xd_cmp(_xd_eval(array[0,13]),_xd_eval(array[0,9]))=1,'xi bang > xi dach';
  assert _xd_cmp(_xd_eval(array[0,1,2,3,4]),_xd_eval(array[5,6,7]))=1,'ngu linh > 21';
  assert _xd_cmp(_xd_eval(array[12,11,5]),_xd_eval(array[12,11,5]))=0,'quac vs quac hoa';
  assert _norm('  Đồng   HỒ ')='dong ho','norm '||_norm('  Đồng   HỒ ');
  assert _norm('Trái tim')=_norm('TRAI TIM'),'norm2';
  raise notice 'PURE ok';
end $$;

-- BAI CAO
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; failed boolean; c1 int[]; c2 int[];
begin
  perform t_as(u1); gid:=game_create('bai_cao','{"rounds":1}');
  select * into g from games where id=gid; assert g.waiting @> array[u1,u2],'both waiting';
  assert jsonb_array_length(game_my_secret(gid)->'cards')=3,'own 3 cards';
  perform t_as(u2); assert game_my_secret(gid)<>(select data from game_secrets where game_id=gid and owner=u1),'different hands';
  perform t_as(u1); perform bc_reveal(gid);
  select * into g from games where id=gid; assert g.state->'last' is null or g.state->'last'='null'::jsonb,'hands hidden until both reveal';
  begin perform bc_reveal(gid); failed:=false; exception when others then failed:=true; end; assert failed,'reveal twice rejected';
  perform t_as(u2); perform bc_reveal(gid);
  select * into g from games where id=gid; assert g.status='done','1 round done';
  c1:=_ints(g.state->'last'->'hands'->(u1::text)); c2:=_ints(g.state->'last'->'hands'->(u2::text));
  assert g.winner is not distinct from case when _bc_pts(c1)>_bc_pts(c2) then u1 when _bc_pts(c1)<_bc_pts(c2) then u2 end,'winner matches points';
  -- multi round
  perform t_as(u1); gid:=game_create('bai_cao','{"rounds":3}');
  for i in 1..3 loop
    perform t_as(u1); perform bc_reveal(gid); perform t_as(u2); perform bc_reveal(gid);
    select * into g from games where id=gid; exit when g.status='done';
    perform bc_next(gid);
  end loop;
  select * into g from games where id=gid; assert g.status='done' and (g.state->>'round')::int=3,'3 rounds';
  raise notice 'BAI CAO ok';
end $$;

-- XI DACH: 40 random full games driven by a simple bot
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; k int; guard int; actor uuid; hand int[]; ev jsonb; need int; shows int:=0; naturals int:=0; leak boolean:=false;
begin
  for k in 1..40 loop
    perform t_as(u1); gid:=game_create('xi_dach',jsonb_build_object('rounds',3)); guard:=0;
    loop
      guard:=guard+1; assert guard<80,'xi dach loop';
      select * into g from games where id=gid; exit when g.status<>'playing';
      if g.state->>'phase'='show' then
        shows:=shows+1; perform t_as(u1); perform xd_next(gid);
      else
        actor:=(g.state->>'turn')::uuid; assert g.waiting=array[actor],'waiting equals turn'; perform t_as(actor);
        hand:=_ints((select data->'cards' from game_secrets where game_id=gid and owner=actor));
        ev:=_xd_eval(hand); need:=case when (g.state->>'dealer')::uuid=actor then 15 else 16 end;
        -- the opponent must not see my cards in public state
        if g.state::text like '%"cards"%' then leak:=true; end if;
        if ev->>'kind'='diem' and (ev->>'pts')::int<need then perform xd_hit(gid); else perform xd_stand(gid); end if;
      end if;
    end loop;
    select * into g from games where id=gid; assert g.status='done','xi dach done';
    assert (g.state->'scores'->>u1::text)::int+(g.state->'scores'->>u2::text)::int<=3,'scores bounded';
  end loop;
  assert not leak,'public state leaked a hand';
  raise notice 'XI DACH ok (% rounds shown)', shows;
  -- standing under age is rejected
  perform t_as(u1); delete from games where kind='xi_dach';
  loop
    gid:=game_create('xi_dach','{"rounds":1}'); select * into g from games where id=gid;
    if g.status='playing' then
      actor:=(g.state->>'turn')::uuid; perform t_as(actor); hand:=_ints((select data->'cards' from game_secrets where game_id=gid and owner=actor)); ev:=_xd_eval(hand);
      if (ev->>'pts')::int<15 then
        begin perform xd_stand(gid); assert false,'should reject'; exception when others then assert sqlerrm like '%Chưa đủ tuổi%', sqlerrm; end;
        exit;
      end if;
    end if;
    perform t_as(u1); delete from games where kind='xi_dach';
  end loop;
  raise notice 'XI DACH min-age ok';
end $$;

-- VE DOAN
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; r boolean; failed boolean; i int;
begin
  perform t_as(u1); gid:=game_create('ve_doan','{"rounds":2}');
  perform t_as(u2); begin perform vd_set_word(gid,'abc'); failed:=false; exception when others then failed:=true; end; assert failed,'only drawer sets word';
  perform t_as(u1); perform vd_set_word(gid,'Con Mèo');
  select * into g from games where id=gid; assert g.state::text not like '%Mèo%' and g.state->'wl'='[3,3]'::jsonb,'word hidden, lengths shown '||g.state::text;
  begin perform vd_guess(gid,'x'); failed:=false; exception when others then failed:=true; end; assert failed,'drawer cannot guess';
  perform t_as(u2); r:=vd_guess(gid,'con chó'); assert r=false,'wrong';
  r:=vd_guess(gid,'  CON   MEO '); assert r=true,'right, case/diacritics/space insensitive';
  select * into g from games where id=gid; assert g.state->>'phase'='over' and (g.state->'scores'->>u2::text)::int=1,'scored';
  perform vd_next(gid);
  select * into g from games where id=gid; assert g.state->>'phase'='pick' and (g.state->>'drawer')::uuid=u2 and (g.state->>'round')::int=2,'swap drawer';
  perform t_as(u2); perform vd_set_word(gid,'Trái tim');
  perform t_as(u1); for i in 1..15 loop perform vd_guess(gid,'sai '||i); end loop;
  select * into g from games where id=gid; assert jsonb_array_length(g.state->'guesses')=12 and g.state->'guesses'->>11='sai 15','guess cap '||(g.state->'guesses')::text;
  perform vd_giveup(gid); perform vd_next(gid);
  select * into g from games where id=gid; assert g.status='done' and g.winner=u2,'ve doan winner';
  raise notice 'VE DOAN ok';
end $$;

-- THAT THACH
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; gid uuid; g games; failed boolean;
begin
  perform t_as(u1); gid:=game_create('that_thach');
  begin perform td_card(gid,'{"t":"x","text":"hi"}'); failed:=false; exception when others then failed:=true; end; assert failed,'bad card';
  perform td_card(gid,'{"t":"truth","text":"Điều gì khiến bạn rung động đầu tiên?"}');
  select * into g from games where id=gid; assert g.waiting=array[u2] and g.state->>'phase'='card','card sent';
  begin perform td_done(gid); failed:=false; exception when others then null; failed:=false; end;
  perform t_as(u2); perform td_done(gid);
  select * into g from games where id=gid; assert g.waiting=array[u2] and g.state->>'phase'='pick' and (g.state->>'count')::int=1,'u2 asks next';
  perform td_card(gid,'{"t":"dare","text":"Hát một câu"}'); perform t_as(u1); perform td_done(gid,true);
  select * into g from games where id=gid; assert (g.state->>'count')::int=1 and jsonb_array_length(g.state->'log')=2,'skip not counted';
  perform game_end(gid); select * into g from games where id=gid; assert g.status='abandoned','ended';
  raise notice 'THAT THACH ok';
end $$;

-- VOUCHERS + cross-space isolation
do $$ declare u1 uuid:='11111111-1111-1111-1111-111111111111'; u2 uuid:='22222222-2222-2222-2222-222222222222'; u3 uuid:='33333333-3333-3333-3333-333333333333'; gid uuid; g1 uuid; g2 uuid; g3 uuid; v game_vouchers; failed boolean; vid uuid;
begin
  perform t_as(u2); vid:=voucher_add('Massage 15 phút'); perform t_as(u1); perform voucher_add('Rửa bát');
  -- make three finished caro games: u1 wins, u2 wins, u1 wins
  perform t_as(u1); g1:=game_create('caro','{"size":10}');
  for i in 0..3 loop perform t_as(u1); perform caro_move(g1,0,i); perform t_as(u2); perform caro_move(g1,1,i); end loop; perform t_as(u1); perform caro_move(g1,0,4);
  g2:=game_create('caro','{"size":10}'); -- u1 is p1 and moves first; let u2 win
  perform t_as(u1); perform caro_move(g2,5,5);
  for i in 0..3 loop perform t_as(u2); perform caro_move(g2,0,i); perform t_as(u1); perform caro_move(g2,9,i); end loop; perform t_as(u2); perform caro_move(g2,0,4);
  -- isolation: outsider cannot touch or draw
  perform t_as(u3);
  begin perform caro_move(g1,3,3); failed:=false; exception when others then failed:=true; end; assert failed,'outsider cannot move';
  begin perform voucher_draw(g1); failed:=false; exception when others then failed:=true; end; assert failed,'outsider cannot draw';
  assert game_my_secret(g1) is null,'outsider no secret';
  perform t_as(u2); begin perform voucher_draw(g1); failed:=false; exception when others then failed:=true; assert sqlerrm like '%người thắng%', sqlerrm; end; assert failed,'loser cannot draw';
  perform t_as(u1); v:=voucher_draw(g1); assert v.title='Massage 15 phút' and v.holder=u1 and v.status='won','u1 draws u2 voucher';
  begin perform voucher_draw(g1); failed:=false; exception when others then failed:=true; end; assert failed,'draw only once';
  perform voucher_done(v.id);
  perform t_as(u2); v:=voucher_draw(g2); assert v.title='Rửa bát' and v.holder=u2,'u2 draws u1 voucher';
  -- no vouchers left in pool for u1 winning again
  perform t_as(u1); g3:=game_create('caro','{"size":10}');
  for i in 0..3 loop perform t_as(u1); perform caro_move(g3,0,i); perform t_as(u2); perform caro_move(g3,1,i); end loop; perform t_as(u1); perform caro_move(g3,0,4);
  begin perform voucher_draw(g3); failed:=false; exception when others then failed:=true; assert sqlerrm like '%chưa có phần quà%', sqlerrm; end; assert failed,'empty pool message';
  perform t_as(u2); perform voucher_add('x'); begin perform voucher_remove(vid); failed:=false; exception when others then failed:=true; end; assert failed,'cannot remove won voucher';
  raise notice 'VOUCHERS + ISOLATION ok';
end $$;

