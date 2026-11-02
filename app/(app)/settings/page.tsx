'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import { VAPID, b64ToBytes } from '@/lib/push'
import Head from '@/components/Head'

export default function Settings() {
  const { me, space, partner, reload } = useApp(); const r = useRouter()
  const [name, setName] = useState(me.display_name ?? ''); const [saved, setSaved] = useState(false)
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'denied'>('off'); const [pushMsg, setPushMsg] = useState('')
  const save = async () => { if (await ok(sb.from('profiles').update({ display_name: name }).eq('id', me.id), 'Không lưu được tên')) { setSaved(true); reload() } }

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) return setPush('unsupported')
    if (Notification.permission === 'denied') return setPush('denied')
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription()).then(s => setPush(s ? 'on' : 'off')).catch(() => { })
  }, [])

  async function enablePush() {
    setPushMsg('')
    try {
      const reg = await navigator.serviceWorker.ready
      if (await Notification.requestPermission() !== 'granted') { setPush('denied'); return }
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) })
      const j = sub.toJSON()
      if (!await ok(sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: me.id, space_id: space.id, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' }), 'Không lưu được đăng ký thông báo')) return
      setPush('on')
    } catch (e: any) { setPushMsg('Không bật được thông báo: ' + (e?.message ?? 'lỗi không rõ') + '. Trên iPhone cần "Thêm vào Màn hình chính" trước.') }
  }
  async function disablePush() {
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
      if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
      setPush('off')
    } catch (e: any) { setPushMsg('Không tắt được thông báo: ' + (e?.message ?? '')) }
  }
  async function logout() {
    await disablePush().catch(() => { })   // máy này không còn nhận thông báo của tài khoản vừa đăng xuất
    await sb.auth.signOut(); r.replace('/login')
  }
  return <>
    <Head t="Cài đặt" />
    <div className="b">
      <div className="k"><b>Hồ sơ của mình</b>
        <label><input value={name} onChange={e => { setName(e.target.value); setSaved(false) }} placeholder="Tên hiển thị" /></label>
        <button className="pill" onClick={save}>{saved ? 'Đã lưu' : 'Lưu tên'}</button></div>
      <div className="k"><b>Thông báo</b>
        <div className="s">{push === 'unsupported' ? 'Máy hoặc bản cài này chưa hỗ trợ thông báo đẩy.' : push === 'denied' ? 'Bạn đã chặn thông báo. Hãy cho phép lại trong cài đặt trình duyệt.' : push === 'on' ? 'Đang bật: nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt.' : 'Nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt khi đang đóng app.'}</div>
        {push === 'off' && <button className="pill" onClick={enablePush}>Bật thông báo</button>}
        {push === 'on' && <button className="pill" onClick={disablePush}>Tắt thông báo</button>}
        {pushMsg && <div className="s" role="alert">{pushMsg}</div>}</div>
      <div className="k li"><b>Người ấy</b><div className="s">{partner?.display_name ?? 'Chưa vào Space'}</div></div>
      <button className="btn" onClick={logout}>Đăng xuất</button>
    </div>
  </>
}
