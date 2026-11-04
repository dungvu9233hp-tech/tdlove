'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { daysTogether, ok } from '@/lib/util'
import { MAX_IMG, MB, processAvatar, uploadBlob } from '@/lib/media'
import { cleanName, nameError, startDateError, todayStr } from '@/lib/profile'
import { VAPID, b64ToBytes } from '@/lib/push'
import Head from '@/components/Head'
import PwInput from '@/components/PwInput'
import Avatar from '@/components/Avatar'
import LockSettings from '@/components/LockSettings'
import { authMsg, pwError } from '@/lib/auth'

export default function Settings() {
  const { me, space, partner, reload } = useApp(); const r = useRouter()
  const [name, setName] = useState(me.display_name ?? ''); const [saved, setSaved] = useState(false); const [nameMsg, setNameMsg] = useState('')
  const [avBusy, setAvBusy] = useState(false); const [avMsg, setAvMsg] = useState<{ good: boolean; text: string } | null>(null); const file = useRef<HTMLInputElement>(null)
  const [sd, setSd] = useState<string>(space.start_date ?? ''); const [sdMsg, setSdMsg] = useState<{ good: boolean; text: string } | null>(null); const [sdBusy, setSdBusy] = useState(false)
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'denied'>('off'); const [pushMsg, setPushMsg] = useState('')
  const [email, setEmail] = useState('')
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false); const [pwMsg, setPwMsg] = useState<{ good: boolean; text: string } | null>(null)
  useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')) }, [])
  // Tên hiển thị (AUTH-05): bỏ khoảng trắng thừa, không để trống, tối đa NAME_MAX ký tự
  const save = async () => {
    const bad = nameError(name); setNameMsg(bad); if (bad) return
    const n = cleanName(name)
    if (await ok(sb.from('profiles').update({ display_name: n }).eq('id', me.id), 'Không lưu được tên')) { setName(n); setSaved(true); reload() }
  }
  // Ảnh đại diện (AUTH-05): cắt vuông 320px, lưu vào bucket private `media` ở <space>/avatars/. Mỗi lần đổi dùng tên tệp mới
  // (không ghi đè) để link ký và bộ nhớ đệm không hiện ảnh cũ; tệp cũ được xóa sau khi lưu thành công.
  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''   // cho phép chọn lại đúng tệp vừa chọn
    if (!f) return
    setAvMsg(null)
    if (!f.type.startsWith('image/')) return setAvMsg({ good: false, text: 'Hãy chọn một tệp ảnh' })
    if (f.size > MAX_IMG) return setAvMsg({ good: false, text: `Ảnh nặng quá (tối đa ${MB(MAX_IMG)})` })
    setAvBusy(true)
    try {
      const blob = await processAvatar(f), path = `${space.id}/avatars/${me.id}-${Date.now()}.jpg`, old: string | null = me.avatar_url
      await uploadBlob(path, blob, 'image/jpeg')
      const { error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', me.id)
      if (error) { await sb.storage.from('media').remove([path]); throw error }
      if (old) await sb.storage.from('media').remove([old])
      reload(); setAvMsg({ good: true, text: 'Đã đổi ảnh đại diện' })
    } catch (er: any) { setAvMsg({ good: false, text: 'Không đổi được ảnh: ' + authMsg(er) }) }
    setAvBusy(false)
  }
  async function removeAvatar() {
    const old: string | null = me.avatar_url; if (!old) return
    setAvBusy(true); setAvMsg(null)
    const { error } = await sb.from('profiles').update({ avatar_url: null }).eq('id', me.id)
    if (error) setAvMsg({ good: false, text: 'Không gỡ được ảnh: ' + error.message })
    else { await sb.storage.from('media').remove([old]); reload(); setAvMsg({ good: true, text: 'Đã gỡ ảnh đại diện' }) }
    setAvBusy(false)
  }
  // Ngày bắt đầu yêu (AUTH-05): dùng chung cho cả Space, Trang chủ / mốc kỷ niệm / nhắc kỷ niệm đều tính từ ngày này
  async function saveDate() {
    const bad = startDateError(sd); if (bad) return setSdMsg({ good: false, text: bad })
    setSdBusy(true); setSdMsg(null)
    const { error } = await sb.from('spaces').update({ start_date: sd }).eq('id', space.id)
    if (error) setSdMsg({ good: false, text: 'Không lưu được ngày: ' + error.message })
    else { reload(); setSdMsg({ good: true, text: 'Đã lưu ngày bắt đầu yêu' }) }
    setSdBusy(false)
  }
  const sdErr = sd ? startDateError(sd) : ''

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
    await sb.auth.signOut({ scope: 'local' }); r.replace('/login')   // chỉ máy này; mặc định của supabase-js là đăng xuất MỌI máy
  }
  // Đổi mật khẩu (AUTH-04, SET-01): bắt nhập lại mật khẩu hiện tại cho chắc người đổi đúng là chủ tài khoản
  async function changePw() {
    setPwMsg(null)
    if (!cur) return setPwMsg({ good: false, text: 'Hãy nhập mật khẩu hiện tại' })
    const bad = pwError(pw, pw2); if (bad) return setPwMsg({ good: false, text: bad })
    if (pw === cur) return setPwMsg({ good: false, text: 'Mật khẩu mới phải khác mật khẩu hiện tại' })
    if (!email) return setPwMsg({ good: false, text: 'Chưa đọc được email tài khoản, tải lại trang rồi thử lại' })
    setPwBusy(true)
    try {
      const re = await sb.auth.signInWithPassword({ email, password: cur })
      if (re.error) throw new Error(/invalid|credentials/i.test(re.error.message + (re.error as any).code) ? 'Mật khẩu hiện tại chưa đúng' : authMsg(re.error))
      const up = await sb.auth.updateUser({ password: pw }); if (up.error) throw up.error
      await sb.auth.signOut({ scope: 'others' }).catch(() => { })   // các máy khác phải đăng nhập lại bằng mật khẩu mới
      setCur(''); setPw(''); setPw2('')
      setPwMsg({ good: true, text: 'Đã đổi mật khẩu. Các máy khác sẽ phải đăng nhập lại.' })
    } catch (e: any) { setPwMsg({ good: false, text: authMsg(e) }) }
    setPwBusy(false)
  }
  return <>
    <Head t="Cài đặt" />
    <div className="b">
      <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><b>Hồ sơ của mình</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar p={me} size={76} on alt="Ảnh đại diện của bạn" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <button className="pill" onClick={() => file.current?.click()} disabled={avBusy}>{avBusy ? 'Đang lưu…' : me.avatar_url ? 'Đổi ảnh' : 'Chọn ảnh đại diện'}</button>
            {me.avatar_url && !avBusy && <button className="pill" onClick={removeAvatar}>Gỡ ảnh</button>}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>
        {avMsg && <div className="s" role={avMsg.good ? 'status' : 'alert'}>{avMsg.good ? '✓ ' : ''}{avMsg.text}</div>}
        <label><span className="s">Tên hiển thị</span><input value={name} onChange={e => { setName(e.target.value); setSaved(false); setNameMsg('') }} placeholder="Tên hiển thị" autoComplete="nickname" aria-invalid={!!nameMsg} /></label>
        {nameMsg && <div className="s" role="alert">{nameMsg}</div>}
        <button className="pill" onClick={save} style={{ alignSelf: 'flex-start' }}>{saved ? 'Đã lưu' : 'Lưu tên'}</button></div>
      <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><b>Ngày bắt đầu yêu</b>
        <label><span className="s">Hai đứa bắt đầu yêu từ ngày nào?</span><input type="date" value={sd} max={todayStr()} onChange={e => { setSd(e.target.value); setSdMsg(null) }} aria-invalid={!!sdErr} /></label>
        {sd && !sdErr && <div className="s">Hôm nay là ngày thứ {daysTogether(sd)} bên nhau.</div>}
        {sdErr && <div className="s" role="alert">{sdErr}</div>}
        <div className="s">Ngày này dùng chung cho hai người: Trang chủ, các mốc kỷ niệm và thông báo nhắc đều tính từ đây. Khi bạn đổi, người ấy cũng thấy ngày mới.</div>
        {sdMsg && <div className="s" role={sdMsg.good ? 'status' : 'alert'}>{sdMsg.good ? '✓ ' : ''}{sdMsg.text}</div>}
        <button className="pill" onClick={saveDate} disabled={sdBusy || !sd || !!sdErr || sd === space.start_date} style={{ alignSelf: 'flex-start' }}>{sdBusy ? 'Đang lưu…' : 'Lưu ngày'}</button></div>
      <div className="k"><b>Thông báo</b>
        <div className="s">{push === 'unsupported' ? 'Máy hoặc bản cài này chưa hỗ trợ thông báo đẩy.' : push === 'denied' ? 'Bạn đã chặn thông báo. Hãy cho phép lại trong cài đặt trình duyệt.' : push === 'on' ? 'Đang bật: nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt.' : 'Nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt khi đang đóng app.'}</div>
        {push === 'off' && <button className="pill" onClick={enablePush}>Bật thông báo</button>}
        {push === 'on' && <button className="pill" onClick={disablePush}>Tắt thông báo</button>}
        {pushMsg && <div className="s" role="alert">{pushMsg}</div>}</div>
      <LockSettings uid={me.id} name={me.display_name ?? ''} />
      <form className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={e => { e.preventDefault(); changePw() }}>
        <b>Đổi mật khẩu</b>
        <input type="text" value={email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
        <PwInput value={cur} onChange={setCur} placeholder="Mật khẩu hiện tại" auto="current-password" />
        <PwInput value={pw} onChange={setPw} placeholder="Mật khẩu mới (từ 8 ký tự)" auto="new-password" />
        <PwInput value={pw2} onChange={setPw2} placeholder="Nhập lại mật khẩu mới" auto="new-password" />
        {pwMsg && <div className="s" role={pwMsg.good ? 'status' : 'alert'}>{pwMsg.good ? '✓ ' : ''}{pwMsg.text}</div>}
        <button className="pill" type="submit" disabled={pwBusy} style={{ alignSelf: 'flex-start' }}>{pwBusy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
      </form>
      <div className="k li" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{partner && <Avatar p={partner} size={48} />}<div><b>Người ấy</b><div className="s">{partner?.display_name ?? 'Chưa vào Space'}</div></div></div>
      <button className="btn" onClick={logout}>Đăng xuất</button>
    </div>
  </>
}
