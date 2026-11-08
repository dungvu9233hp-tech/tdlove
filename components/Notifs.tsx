'use client'
import './notifs.css'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'

// Thông báo trong app (phase25.sql): khoảnh khắc mới, bình luận mới, trả lời bình luận.
// Dòng thông báo do trigger ở cơ sở dữ liệu tạo ra cho người còn lại; ở đây chỉ đọc, nghe realtime và đánh dấu đã đọc.
export type Notif = {
  id: string; kind: 'moment' | 'moment_comment' | 'moment_reply' | 'pb_post' | 'pb_comment' | 'pb_reply'; moment_id: string | null; comment_id: string | null; pb_post_id?: string | null
  actor: string | null; moment_title: string; body: string; read_at: string | null; created_at: string
}
type Ctx = {
  items: Notif[]; unread: number; unreadMoments: Set<string>
  open: boolean; setOpen: (v: boolean) => void
  go: (n: Notif) => void; markAll: () => Promise<void>
  viewing: MutableRefObject<string | null>      // khoảnh khắc đang mở trong màn hình chi tiết (không báo thừa về nó)
}
const Ctx = createContext<Ctx>({ items: [], unread: 0, unreadMoments: new Set(), open: false, setOpen: () => { }, go: () => { }, markAll: async () => { }, viewing: { current: null } })
export const useNotifs = () => useContext(Ctx)

const LIMIT = 60
const VERB: Record<Notif['kind'], string> = { moment: 'đã đăng khoảnh khắc mới', moment_comment: 'đã bình luận ở', moment_reply: 'đã trả lời bình luận ở', pb_post: 'đã đăng lên Góc Photobooth', pb_comment: 'đã bình luận ở', pb_reply: 'đã trả lời bình luận ở' }
const ICON: Record<Notif['kind'], string> = { moment: '🖼️', moment_comment: '💬', moment_reply: '↩️', pb_post: '🎞️', pb_comment: '💬', pb_reply: '↩️' }
const isNew = (k: Notif['kind']) => k === 'moment' || k === 'pb_post'      // thông báo "có bài mới" (không phải bình luận)
export const MOMENTS_CHANGED = 'tdlove-moments-changed'
export const OPEN_MOMENT = 'tdlove-open-moment'
export const OPEN_PBPOST = 'tdlove-open-pbpost'

function ago(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000
  if (d < 60) return 'vừa xong'
  if (d < 3600) return `${Math.floor(d / 60)} phút trước`
  if (d < 86400) return `${Math.floor(d / 3600)} giờ trước`
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} ngày trước`
  return new Date(s).toLocaleDateString('vi-VN')
}

export function NotifProvider({ children }: { children: React.ReactNode }) {
  const { me, partner } = useApp()
  const router = useRouter(), path = usePathname()
  const [items, setItems] = useState<Notif[]>([]); const [open, setOpen] = useState(false); const [toast, setToast] = useState<Notif | null>(null)
  const viewing = useRef<string | null>(null), toastTimer = useRef<any>(null)
  const pn = partner?.display_name ?? 'Người ấy'
  const who = (n: Notif) => n.actor === me.id ? 'Mình' : pn

  const load = useCallback(async () => {
    const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(LIMIT)
    if (error) return console.warn('notifications', error.message)      // chưa chạy phase25.sql thì chỉ không có thông báo trong app
    setItems((data ?? []) as Notif[])
  }, [])

  useEffect(() => {
    load()
    const ch = sb.channel('notif-' + me.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }, p => {
        if (p.eventType === 'INSERT') {
          const n = p.new as Notif
          setItems(a => a.some(x => x.id === n.id) ? a : [n, ...a].slice(0, LIMIT))
          window.dispatchEvent(new Event(MOMENTS_CHANGED))                 // trang Khoảnh khắc đang mở thì nạp lại danh sách / số bình luận
          if (document.visibilityState === 'visible' && !((n.moment_id || n.pb_post_id) && viewing.current === (n.moment_id || n.pb_post_id))) {
            setToast(n); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 6000)
          }
        } else if (p.eventType === 'UPDATE') { const n = p.new as Notif; setItems(a => a.map(x => x.id === n.id ? n : x)) }
        else if (p.eventType === 'DELETE') { const o: any = p.old; setItems(a => a.filter(x => x.id !== o.id)) }
      }).subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); clearTimeout(toastTimer.current) }
  }, [me.id, load])

  useEffect(() => { if (open) load() }, [open, load])

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const at = new Date().toISOString()
    setItems(a => a.map(x => ids.includes(x.id) && !x.read_at ? { ...x, read_at: at } : x))     // hiện ngay, lỗi thì nạp lại
    const { error } = await sb.from('notifications').update({ read_at: at }).in('id', ids).is('read_at', null)
    if (error) { console.warn('notifications', error.message); load() }
  }, [load])
  const markAll = useCallback(() => markRead(items.filter(x => !x.read_at).map(x => x.id)), [items, markRead])

  const go = useCallback((n: Notif) => {
    markRead([n.id]); setOpen(false); setToast(null)
    if (n.pb_post_id) {      // bài ở Góc Photobooth
      if (path.startsWith('/photobooth/gallery')) window.dispatchEvent(new CustomEvent(OPEN_PBPOST, { detail: { id: n.pb_post_id } }))
      else router.push('/photobooth/gallery?open=' + n.pb_post_id)
      return
    }
    if (!n.moment_id) return
    if (path === '/moments') window.dispatchEvent(new CustomEvent(OPEN_MOMENT, { detail: { id: n.moment_id } }))
    else router.push('/moments?open=' + n.moment_id)
  }, [markRead, path, router])

  const unread = useMemo(() => items.filter(x => !x.read_at).length, [items])
  const unreadMoments = useMemo(() => new Set(items.filter(x => !x.read_at && x.moment_id).map(x => x.moment_id as string)), [items])
  const value = useMemo(() => ({ items, unread, unreadMoments, open, setOpen, go, markAll, viewing }), [items, unread, unreadMoments, open, go, markAll])

  return <Ctx.Provider value={value}>
    {children}
    {toast && !open && <div className="k pk ntoast" role="status">
      <button className="ntoast-main" onClick={() => go(toast)}>
        <b>{ICON[toast.kind]} {who(toast)} {VERB[toast.kind]}</b>
        <span className="nclamp s">{isNew(toast.kind) ? toast.moment_title : toast.body || toast.moment_title}</span>
      </button>
      <button className="pill" style={{ flex: 'none', padding: '0 10px' }} onClick={() => setToast(null)} aria-label="Đóng thông báo">×</button>
    </div>}
    {open && <div className="sheet" role="dialog" aria-label="Thông báo">
      <div className="row"><b style={{ flex: 1 }}>Thông báo</b>
        {unread > 0 && <button className="pill" style={{ flex: 'none' }} onClick={markAll}>Đọc hết</button>}
        <button className="pill" style={{ flex: 'none' }} onClick={() => setOpen(false)}>Đóng</button></div>
      {!items.length && <div className="k pe"><b>Chưa có thông báo</b><div className="s">Khi {pn} đăng khoảnh khắc hay bình luận, thông báo sẽ hiện ở đây.</div></div>}
      {items.map(n => <button key={n.id} className={`k nitem ${n.read_at ? '' : 'pk'}`} onClick={() => go(n)}>
        <span className="s">{ICON[n.kind]} {ago(n.created_at)}{!n.read_at && <span className="ndot" aria-label="Chưa đọc"> ●</span>}</span>
        <b>{who(n)} {VERB[n.kind]}{!isNew(n.kind) && ` “${n.moment_title}”`}</b>
        {(isNew(n.kind) ? n.moment_title : n.body) && <span className="nclamp">{isNew(n.kind) ? `“${n.moment_title}”` : n.body}</span>}
      </button>)}
    </div>}
  </Ctx.Provider>
}

// Chuông ở đầu trang, có số thông báo chưa đọc
export function NotifBell() {
  const { unread, setOpen } = useNotifs()
  return <button className="pill nbell" onClick={() => setOpen(true)} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
    🔔{unread > 0 && <span className="nbadge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
  </button>
}
