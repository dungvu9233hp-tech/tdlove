'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { C } from '@/lib/ctx'
import Nav from '@/components/Nav'
import Call from '@/components/Call'
import LockGate from '@/components/LockGate'
import TripBar from '@/components/TripBar'
import LocShare from '@/components/LocShare'
import { NotifProvider } from '@/components/Notifs'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const r = useRouter()
  const [s, set] = useState<any>(null)
  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return r.replace('/login')
    const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!me?.space_id) return r.replace('/login')
    const [{ data: space }, { data: ps }] = await Promise.all([
      sb.from('spaces').select('*').eq('id', me.space_id).single(),
      sb.from('profiles').select('*').eq('space_id', me.space_id).neq('id', user.id),
    ])
    // Chỉ cập nhật khi dữ liệu thật sự đổi, để các trang con không bị nạp lại vô ích mỗi lần làm mới
    const next = { me, space, partner: ps?.[0] ?? null }
    set((prev: any) => prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
  }, [r])
  useEffect(() => { load() }, [load])
  // T5: quay lại app thì nạp lại hồ sơ (người kia vào Space, đổi tên/ảnh...)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])
  // T5: chưa có người kia thì cứ 10 giây hỏi lại một lần, để máy người mời tự cập nhật khi người kia vào Space
  const waiting = !!s && !s.partner
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => clearInterval(id)
  }, [waiting, load])
  // L11: bị đăng xuất (ví dụ đổi mật khẩu ở máy khác) thì về trang đăng nhập thay vì hiện app rỗng
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') r.replace('/login') })
    return () => data.subscription.unsubscribe()
  }, [r])
  if (!s) return <div className="p"><div className="b s">Đang mở góc nhỏ của hai đứa…</div></div>
  return <C.Provider value={{ ...s, reload: load }}><div className="p"><LockGate uid={s.me.id}><NotifProvider><TripBar /><LocShare />{children}<Nav /><Call /></NotifProvider></LockGate></div></C.Provider>
}
