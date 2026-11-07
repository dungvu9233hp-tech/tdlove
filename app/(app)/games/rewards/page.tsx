'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import Head from '@/components/Head'
import { VOUCHER_IDEAS } from '@/lib/games/content'
import type { Voucher } from '@/lib/games/types'

export default function Rewards() {
  const { me, partner, space } = useApp()
  const pn = partner?.display_name ?? 'Người ấy'
  const [vs, setVs] = useState<Voucher[] | null>(null)
  const [err, setErr] = useState(''); const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await sb.from('game_vouchers').select('*').order('created_at', { ascending: false }).limit(300)
    if (r.error) { setErr('Chưa tải được hộp quà. Đã chạy supabase/phase24.sql chưa?'); setVs([]) } else { setErr(''); setVs((r.data ?? []) as Voucher[]) }
  }, [])
  useEffect(() => {
    load()
    const c = sb.channel('vouchers-' + space.id).on('postgres_changes', { event: '*', schema: 'public', table: 'game_vouchers', filter: `space_id=eq.${space.id}` }, () => load()).subscribe()
    return () => { sb.removeChannel(c) }
  }, [space.id, load])

  async function add(t: string) {
    const s = t.trim(); if (!s || busy) return
    setBusy(true)
    const good = await ok(sb.rpc('voucher_add', { p_title: s }), 'Không thêm được quà')
    setBusy(false)
    if (good) { setTitle(''); load() }
  }
  const call = async (fn: string, args: Record<string, unknown>, what: string) => { if (await ok(sb.rpc(fn, args), what)) load() }

  const all = vs ?? []
  const mine = all.filter(v => v.owner === me.id && v.status === 'pool')
  const theirs = all.filter(v => v.owner !== me.id && v.status === 'pool').length
  const received = all.filter(v => v.holder === me.id && v.status === 'won')
  const owe = all.filter(v => v.owner === me.id && v.holder && v.holder !== me.id && v.status === 'won')
  const done = all.filter(v => v.status === 'done')
  const taken = new Set(mine.map(v => v.title))

  return <>
    <Head t="Hộp quà thử thách"><Link href="/games" className="pill">Trò chơi</Link></Head>
    <div className="b">
      <div className="k li"><div className="s">Mỗi người tự viết sẵn những phần quà “mình sẽ làm cho người ấy”. Ai thắng một ván thì được rút ngẫu nhiên một phần từ hộp của người kia. Người rút không biết trước trong hộp có gì.</div></div>
      {err && <div className="k pe"><div className="s">{err}</div></div>}

      {received.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><b>🎉 Quà bạn đã trúng</b>
        {received.map(v => <div key={v.id} className="k pk gm-row"><div className="gm-grow"><b style={{ fontSize: 16 }}>{v.title}</b><div className="gm-sub">{pn} sẽ thực hiện</div></div>
          <button className="pill on" onClick={() => call('voucher_done', { p_id: v.id }, 'Không cập nhật được')}>Đã nhận ✓</button></div>)}</div>}
      {owe.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><b>Bạn đang nợ {pn}</b>
        {owe.map(v => <div key={v.id} className="k pe gm-row"><div className="gm-grow"><b style={{ fontSize: 16 }}>{v.title}</b><div className="gm-sub">Đừng quên thực hiện nhé</div></div>
          <button className="pill on" onClick={() => call('voucher_done', { p_id: v.id }, 'Không cập nhật được')}>Đã làm xong ✓</button></div>)}</div>}

      <b>Hộp quà của bạn ({mine.length}/40)</b>
      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row"><label className="k"><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add(title)} placeholder="Mình sẽ… (ví dụ: nấu bữa tối cho em)" aria-label="Phần quà mới" /></label>
          <button className="rb" disabled={busy || !title.trim()} onClick={() => add(title)} aria-label="Thêm quà">+</button></div>
        <div className="gm-sub">Gợi ý, chạm để thêm:</div>
        <div className="gm-chips">{VOUCHER_IDEAS.filter(i => !taken.has(i)).slice(0, 8).map(i => <button key={i} className="pill" disabled={busy} onClick={() => add(i)}>{i}</button>)}</div>
      </div>
      {vs && !mine.length && <div className="s">Hộp của bạn đang trống. Nếu không có quà nào, {pn} thắng cũng không rút được gì.</div>}
      {mine.map(v => <div key={v.id} className="k gm-row"><div className="gm-grow">{v.title}</div>
        <button className="pill" onClick={() => { if (confirm('Bỏ phần quà này khỏi hộp?')) call('voucher_remove', { p_id: v.id }, 'Không xóa được') }} aria-label={`Xóa ${v.title}`}>Xóa</button></div>)}

      <div className="k pe"><b>Hộp quà của {pn}</b><div className="s">{theirs} phần quà đang chờ được rút. Nội dung giữ bí mật cho đến khi bạn thắng.</div></div>

      {done.length > 0 && <details className="k"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Đã hoàn thành ({done.length})</summary>
        <div className="gm-hist" style={{ marginTop: 8 }}>{done.map(v => <div key={v.id}><span>{v.title}</span><span>{v.holder === me.id ? `${pn} làm cho bạn` : `Bạn làm cho ${pn}`}</span></div>)}</div></details>}
    </div>
  </>
}
