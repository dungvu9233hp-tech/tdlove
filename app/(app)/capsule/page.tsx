'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import CapsuleForm from '@/components/CapsuleForm'
import Lightbox, { LbItem } from '@/components/Lightbox'
import { ok } from '@/lib/util'

type Cap = { id: string; author: string; teaser: string | null; unlock_at: string; photo_count: number; opened_at: string | null; created_at: string }
type Shown = { body: string; urls: string[] }
type State = 'ready' | 'wait' | 'done'

const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
const dayStr = (iso: string) => new Date(iso).toLocaleDateString('vi-VN')
const stamp = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
const daysLeft = (iso: string) => Math.max(1, Math.round((+new Date(iso) - +today()) / 864e5))

// CAPSULE-02/03: hộp thời gian. Danh sách (capsules) ai trong Space cũng thấy; nội dung (capsule_contents) và ảnh chỉ đọc được
// khi tới ngày mở hoặc mình là người viết (RLS ở phase12.sql), nên app không cần tự "giấu" gì.
export default function Capsule() {
  const { me, space, partner } = useApp()
  const [caps, setCaps] = useState<Cap[]>([]); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false)
  const [form, setForm] = useState(false); const [shown, setShown] = useState<Record<string, Shown>>({})
  const [busy, setBusy] = useState(''); const [note, setNote] = useState('')
  const [lb, setLb] = useState<null | { items: LbItem[]; start: number }>(null)
  const [now, setNow] = useState(() => Date.now())
  const name = partner?.display_name ?? 'Người ấy'

  const load = useCallback(async () => {
    const { data, error } = await sb.from('capsules').select('id,author,teaser,unlock_at,photo_count,opened_at,created_at').order('unlock_at')
    if (error) { console.error('capsules', error.message); setFailed(true) } else { setFailed(false); setCaps(data ?? []) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])   // qua 0 giờ thì hộp tự chuyển sang "Mở được rồi"

  // Đọc nội dung. Nếu server nói chưa tới ngày (đồng hồ máy lệch) thì RLS trả về rỗng và ta báo lại.
  async function reveal(c: Cap) {
    setBusy(c.id); setNote('')
    try {
      const mine = c.author === me.id
      if (!mine && +new Date(c.unlock_at) <= Date.now()) await sb.rpc('open_capsule', { cid: c.id })
      const { data, error } = await sb.from('capsule_contents').select('body,photo_paths').eq('capsule_id', c.id).maybeSingle()
      if (error) throw error
      if (!data) { setNote('Chưa tới ngày mở. Đợi thêm một chút rồi thử lại nhé.'); return }
      const paths: string[] = data.photo_paths ?? [], urls: string[] = []
      if (paths.length) {
        const r = await sb.storage.from('capsules').createSignedUrls(paths, 3600)
        const by = new Map((r.data ?? []).map(x => [x.path, x.signedUrl])); paths.forEach(p => { const u = by.get(p); if (u) urls.push(u) })
      }
      setShown(s => ({ ...s, [c.id]: { body: data.body ?? '', urls } }))
      load()
    } catch (e: any) { console.error('capsule', e); setNote('Không mở được hộp. Hãy kiểm tra mạng rồi thử lại.') }
    finally { setBusy('') }
  }

  async function remove(c: Cap) {
    if (!confirm('Xóa hộp thời gian này? Thư và ảnh bên trong sẽ mất, không khôi phục được.')) return
    setBusy(c.id); setNote('')
    try {
      const { data } = await sb.from('capsule_contents').select('photo_paths').eq('capsule_id', c.id).maybeSingle()
      if (!await ok(sb.from('capsules').delete().eq('id', c.id), 'Không xóa được hộp')) return
      if (data?.photo_paths?.length) await sb.storage.from('capsules').remove(data.photo_paths)
      setShown(s => { const { [c.id]: _, ...rest } = s; return rest })
      load()
    } finally { setBusy('') }
  }

  const due = (c: Cap) => +new Date(c.unlock_at) <= now
  const ready = caps.filter(c => due(c) && c.author !== me.id && !c.opened_at)
  const wait = caps.filter(c => !due(c))
  const done = caps.filter(c => due(c) && !ready.includes(c)).reverse()

  const letter = (c: Cap) => {
    const s = shown[c.id]; if (!s) return null
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '2px dashed var(--ink)', paddingTop: 10 }}>
      {s.body && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.body}</div>}
      {s.urls.length > 0 && <div className="mgrid">{s.urls.map((u, i) => <button key={u} className="th" onClick={() => setLb({ items: s.urls.map(x => ({ kind: 'image' as const, url: x })), start: i })} aria-label={`Xem ảnh ${i + 1}`}><img src={u} alt="" /></button>)}</div>}
      <button className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => setShown(x => { const { [c.id]: _, ...rest } = x; return rest })}>Gấp thư lại</button>
    </div>
  }

  const card = (c: Cap, st: State) => {
    const mine = c.author === me.id, from = mine ? 'Bạn' : name, loadingMe = busy === c.id
    return <div key={c.id} className={`k ${st === 'ready' ? 'pk' : st === 'wait' ? 'li' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {st === 'wait' && <div><span className="num" style={{ fontSize: 40 }}>{daysLeft(c.unlock_at)}</span> <span className="s">ngày nữa mới mở</span></div>}
      <b>{st === 'ready' ? `${from} gửi bạn một hộp thời gian` : mine ? 'Hộp bạn đã chôn' : `Hộp ${from} đã chôn`}</b>
      {c.teaser && <div className="s">“{c.teaser}”</div>}
      <div className="s">
        {st === 'wait' ? `Mở vào ${dayStr(c.unlock_at)}` : st === 'ready' ? `Mở được từ ${dayStr(c.unlock_at)}` : `Mở ngày ${dayStr(c.unlock_at)}`}
        {c.photo_count > 0 ? ` · ${c.photo_count} ảnh` : ''}
        {st === 'done' && mine ? ` · ${c.opened_at ? `${name} mở lúc ${stamp(c.opened_at)}` : `${name} chưa mở`}` : ''}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {st === 'ready' && <button className="btn" onClick={() => reveal(c)} disabled={loadingMe}>{loadingMe ? 'Đang mở…' : 'Mở hộp'}</button>}
        {st === 'done' && !shown[c.id] && <button className="pill" onClick={() => reveal(c)} disabled={loadingMe}>{loadingMe ? 'Đang mở…' : 'Đọc lại'}</button>}
        {st === 'wait' && mine && !shown[c.id] && <button className="pill" onClick={() => reveal(c)} disabled={loadingMe}>Xem lại thư của tôi</button>}
        {mine && <button className="pill" onClick={() => remove(c)} disabled={loadingMe}>Xóa</button>}
      </div>
      {letter(c)}
    </div>
  }

  return <>
    <Head t="Hộp thời gian"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      <button className="btn" onClick={() => setForm(true)}>Chôn hộp mới</button>
      {note && <div className="k pe s" role="status">{note}</div>}
      {loading && <div className="s">Đang tải…</div>}
      {failed && <div className="k pe s" role="alert">Không tải được các hộp. Nếu chưa chạy supabase/phase12.sql thì hãy chạy file đó trước, hoặc kiểm tra mạng.</div>}
      {ready.length > 0 && <><b>Mở được rồi</b>{ready.map(c => card(c, 'ready'))}</>}
      {wait.length > 0 && <><b>Đang chờ</b>{wait.map(c => card(c, 'wait'))}</>}
      {done.length > 0 && <><b>Đã mở</b>{done.map(c => card(c, 'done'))}</>}
      {!loading && !failed && caps.length === 0 && <div className="k pe"><div className="s">Chưa có hộp nào. Hãy viết một lá thư, hẹn ngày mở (một tháng, một năm sau…) rồi chôn nó. Đến ngày đó, người ấy sẽ được mở.</div></div>}
    </div>
    {form && <CapsuleForm space={space} onClose={() => setForm(false)} onDone={() => { setForm(false); load() }} />}
    {lb && <Lightbox items={lb.items} start={lb.start} onClose={() => setLb(null)} />}
  </>
}
