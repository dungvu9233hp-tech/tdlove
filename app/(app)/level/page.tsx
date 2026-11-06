'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import Head from '@/components/Head'
import Couple3D from '@/components/Couple3D'
import { useApp } from '@/lib/ctx'
import { daysTogether, ok } from '@/lib/util'
import { SLOTS, SLOT_LABEL, VISUAL, lookFor, pts, swatch, type Char, type Item, type Slot, type Stats } from '@/lib/shop'

type Buy = { for_user: string; item_id: string }

// Khu cấp độ (bấm trái tim ở Trang chủ): hai nhân vật 3D nắm tay, điểm chung + điểm riêng, cấp độ, cửa hàng đồ.
// Mọi con số điểm và giá do server tính (phase15.sql); trang này chỉ hiển thị và gọi hàm mua / mặc đồ.
export default function Level() {
  const { me, partner, space } = useApp()
  const [stats, setStats] = useState<Stats | null>(null)
  const [chars, setChars] = useState<Char[] | null>(null)
  const [buys, setBuys] = useState<Buy[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'lv' | 'shop'>('lv')
  const [slot, setSlot] = useState<Slot>('top')
  const [target, setTarget] = useState(me.id)          // nhân vật đang được mặc đồ
  const [from, setFrom] = useState<'shared' | 'mine'>('shared')   // trả bằng điểm chung hay điểm riêng của mình
  const [sel, setSel] = useState<Item | null>(null)    // món đang thử (chưa mua cũng xem được trên nhân vật)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [s, c, b, it] = await Promise.all([
      sb.rpc('level_stats'), sb.from('level_chars').select('*'), sb.from('shop_buys').select('for_user,item_id'),
      sb.from('shop_items').select('*').eq('active', true).order('sort'),
    ])
    const e = s.error ?? c.error ?? b.error ?? it.error
    if (e) { setErr(e.message); return }
    setErr(''); setStats(s.data as Stats); setChars(c.data as Char[]); setBuys((b.data ?? []) as Buy[])
    setItems(((it.data ?? []) as Item[]).filter(i => VISUAL[i.id]))   // món chưa có hình 3D thì không bán
  }, [])

  useEffect(() => {
    load()
    // Người kia mua/đổi đồ, hoặc gửi ảnh (cộng điểm) thì máy này cập nhật ngay
    const ch = sb.channel('level-' + space.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'level_chars', filter: `space_id=eq.${space.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_buys', filter: `space_id=eq.${space.id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `space_id=eq.${space.id}` }, (p: any) => { if (p.new?.kind === 'image') load() })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [space.id, load])

  const mine = chars?.find(c => c.user_id === me.id) ?? null
  const theirs = partner ? chars?.find(c => c.user_id === partner.id) ?? null : null
  const tid = partner && theirs && target === partner.id ? partner.id : me.id
  const tgt = tid === me.id ? mine : theirs
  const fRow = chars?.find(c => c.sex === 'f') ?? null, mRow = chars?.find(c => c.sex === 'm') ?? null
  const preview = (row: Char | null) => (tab === 'shop' && sel && row && row.user_id === tid ? sel : null)
  const lf = lookFor('f', fRow?.outfit, preview(fRow)), lm = lookFor('m', mRow?.outfit, preview(mRow))

  const myP = stats?.people[me.id], pP = partner ? stats?.people[partner.id] : undefined
  const day = space.start_date ? daysTogether(space.start_date) : null
  const bal = !stats ? 0 : from === 'shared' ? stats.shared.balance : myP?.balance ?? 0
  const owns = (it: Item) => buys.some(b => b.for_user === tid && b.item_id === it.id)
  const wearing = (it: Item) => tgt?.outfit?.[it.slot] === it.id
  const locked = (it: Item) => !!stats && stats.level < it.min_level
  const shown = items.filter(i => i.slot === slot && tgt && (i.sex === 'any' || i.sex === tgt.sex))

  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn() } finally { setBusy(false) } }
  const pick = (sex: 'f' | 'm') => run(async () => { if (await ok(sb.rpc('pick_char', { p_sex: sex }), 'Không chọn được nhân vật')) await load() })
  const swap = () => run(async () => {
    if (!confirm('Đổi chỗ hai nhân vật? Chỉ làm được khi chưa mua món nào.')) return
    if (await ok(sb.rpc('swap_chars'), 'Không đổi chỗ được')) await load()
  })
  const act = () => run(async () => {
    if (!sel || !tgt) return
    const wear = (item: string | null, what: string) => ok(sb.rpc('set_outfit', { p_for: tid, p_slot: sel.slot, p_item: item }), what)
    if (wearing(sel)) { if (await wear(null, 'Không cởi được')) setSel(null) }
    else if (owns(sel)) await wear(sel.id, 'Không mặc được')
    else {
      if (!await ok(sb.rpc('buy_item', { p_item: sel.id, p_for: tid, p_from: from }), 'Không mua được')) { await load(); return }
      await wear(sel.id, 'Đã mua rồi nhưng chưa mặc được')
    }
    await load()
  })
  const choose = (s: Slot) => { setSlot(s); setSel(null) }

  const span = stats ? stats.level_to - stats.level_from : 1, got = stats ? stats.xp - stats.level_from : 0
  const who = partner?.display_name ?? 'người ấy'
  const need = sel && stats ? (locked(sel) ? `Cần lên cấp ${sel.min_level} (đang cấp ${stats.level})` : !owns(sel) && bal < sel.price ? `Còn thiếu ${pts(sel.price - bal)} điểm` : '') : ''

  return <>
    <Head t="Cấp độ"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b" style={{ overflow: 'hidden' }}>
      <div className="k pk" style={{ padding: 0, overflow: 'hidden', flex: 'none', position: 'relative' }}>
        <Couple3D height="clamp(220px, 34dvh, 340px)" lf={lf} lm={lm} />
        {stats && <span className="pill on" style={{ position: 'absolute', left: 10, top: 10, cursor: 'default' }}>Cấp {stats.level}</span>}
      </div>
      <div className="s" style={{ textAlign: 'center', flex: 'none' }}>{me.display_name} & {who}{day ? ` · ${day} ngày bên nhau` : ''}</div>

      <div className="lv-tabs">
        <button className={`pill ${tab === 'lv' ? 'on' : ''}`} aria-pressed={tab === 'lv'} onClick={() => { setTab('lv'); setSel(null) }}>Cấp độ</button>
        <button className={`pill ${tab === 'shop' ? 'on' : ''}`} aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>Cửa hàng</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 6px 8px 2px' }}>
        {err && <div className="k pe"><b>Chưa mở được khu cấp độ</b><div className="s">Hãy chạy supabase/phase15.sql trong Supabase (sau phase14.sql) rồi thử lại.</div><div className="s" style={{ fontSize: 14 }}>{err}</div><button className="pill" onClick={load}>Thử lại</button></div>}
        {!err && !stats && <div className="s">Đang tính điểm…</div>}

        {chars && !mine && <div className="k pe"><b>Bạn là nhân vật nào?</b>
          <div className="s">Nữ đứng bên trái, nam đứng bên phải.{theirs ? '' : ' Người ấy sẽ tự nhận nhân vật còn lại.'}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={busy || theirs?.sex === 'f'} onClick={() => pick('f')}>Nhân vật nữ</button>
            <button className="btn" disabled={busy || theirs?.sex === 'm'} onClick={() => pick('m')}>Nhân vật nam</button>
          </div></div>}

        {stats && tab === 'lv' && <>
          <div className="k pk">
            <div className="row"><b>Cấp {stats.level}</b><span className="s" style={{ textAlign: 'right' }}>{pts(stats.xp)} điểm đã kiếm</span></div>
            <div className="lv-bar" role="progressbar" aria-label="Tiến độ lên cấp tiếp theo" aria-valuemin={0} aria-valuemax={span} aria-valuenow={got} style={{ margin: '8px 0' }}><i style={{ width: `${Math.min(100, Math.max(2, got / span * 100))}%` }} /></div>
            <div className="s">Còn {pts(stats.level_to - stats.xp)} điểm nữa lên cấp {stats.level + 1}</div>
          </div>
          <div className="lv-pts" style={{ gridTemplateColumns: partner ? '1fr 1fr 1fr' : '1fr 1fr' }}>
            <div className="k pk"><span className="num">{pts(stats.shared.balance)}</span><div className="s">Điểm chung</div></div>
            <div className="k pe"><span className="num">{pts(myP?.balance ?? 0)}</span><div className="s">Của {me.display_name}</div></div>
            {partner && <div className="k li"><span className="num">{pts(pP?.balance ?? 0)}</span><div className="s">Của {partner.display_name}</div></div>}
          </div>
          <div className="k li"><b>Cách kiếm điểm</b>
            <div className="s">Mỗi ngày bên nhau: +{stats.rules.day_shared} điểm chung ({stats.days} ngày = {pts(stats.days * stats.rules.day_shared)} điểm).</div>
            <div className="s">Mỗi ảnh gửi trong chat: +{stats.rules.img_shared} điểm chung và +{stats.rules.img_personal} điểm riêng cho người gửi, tối đa {stats.rules.img_daily_cap} ảnh mỗi ngày mỗi người. Đã tính: {me.display_name} {myP?.images ?? 0} ảnh{partner ? `, ${partner.display_name} ${pP?.images ?? 0} ảnh` : ''}.</div>
            <div className="s">Cấp độ tính theo tổng điểm đã kiếm nên tiêu điểm không làm tụt cấp.</div>
            {!space.start_date && <div className="s">Hai đứa chưa chọn ngày bắt đầu yêu: vào Trang chủ chọn ngày để tích điểm theo ngày.</div>}
          </div>
          {mine && theirs && buys.length === 0 && <button className="pill" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={swap}>Đổi chỗ hai nhân vật</button>}
        </>}

        {stats && tab === 'shop' && (!tgt ? <div className="k pe"><b>Chọn nhân vật trước nhé</b><div className="s">Bấm chọn nhân vật của bạn ở thẻ phía trên để mở cửa hàng.</div></div> : <>
          {theirs && partner && <div className="row" style={{ flex: 'none' }}>
            <span className="s" style={{ flex: 'none' }}>Mặc cho</span>
            <button className={`pill ${tid === me.id ? 'on' : ''}`} aria-pressed={tid === me.id} onClick={() => { setTarget(me.id); setSel(null) }}>{me.display_name}</button>
            <button className={`pill ${tid === partner.id ? 'on' : ''}`} aria-pressed={tid === partner.id} onClick={() => { setTarget(partner.id); setSel(null) }}>{partner.display_name}</button>
          </div>}
          <div className="row" style={{ flex: 'none' }}>
            <button className={`pill ${from === 'shared' ? 'on' : ''}`} aria-pressed={from === 'shared'} onClick={() => setFrom('shared')}>Điểm chung · {pts(stats.shared.balance)}</button>
            <button className={`pill ${from === 'mine' ? 'on' : ''}`} aria-pressed={from === 'mine'} onClick={() => setFrom('mine')}>Điểm của mình · {pts(myP?.balance ?? 0)}</button>
          </div>
          <div className="lv-chips" role="group" aria-label="Loại đồ">{SLOTS.map(s => <button key={s} className={`pill ${slot === s ? 'on' : ''}`} aria-pressed={slot === s} onClick={() => choose(s)}>{SLOT_LABEL[s]}</button>)}</div>
          <div className="lv-grid">{shown.map(it => {
            const w = wearing(it), o = owns(it), l = locked(it)
            return <button key={it.id} className={`lv-it ${sel?.id === it.id ? 'sel' : ''} ${l && !o ? 'lock' : ''}`} aria-pressed={sel?.id === it.id} onClick={() => setSel(sel?.id === it.id ? null : it)}>
              <span><i className="lv-sw" style={{ background: swatch(it.id) }} />{it.name}</span>
              <span className="s">{w ? 'Đang mặc ✓' : o ? 'Đã có' : l ? `🔒 Cấp ${it.min_level}` : `${pts(it.price)} điểm`}</span>
            </button>
          })}</div>
          {shown.length === 0 && <div className="s">Chưa có món nào ở mục này.</div>}
          {sel && <div className="k pk lv-act">
            <b>{sel.name}</b>
            {need ? <div className="s">{need}</div> : !owns(sel) && <div className="s">Trả bằng {from === 'shared' ? 'điểm chung' : 'điểm của bạn'}{tid !== me.id ? `, tặng ${who}` : ''}</div>}
            <button className="btn" disabled={busy || (!owns(sel) && !!need)} onClick={act}>{wearing(sel) ? 'Cởi ra' : owns(sel) ? 'Mặc' : `Mua · ${pts(sel.price)} điểm`}</button>
          </div>}
        </>)}
      </div>
    </div>
  </>
}
