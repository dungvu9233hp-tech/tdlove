'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { Heart } from '@/components/Head'
import PwInput from '@/components/PwInput'
import { authMsg, pwError } from '@/lib/auth'
import { markFreshLogin } from '@/lib/applock'

// Đọc phần # của link TRƯỚC khi supabase-js kịp xử lý và xóa nó khỏi thanh địa chỉ
const BOOT = typeof window === 'undefined' ? '' : window.location.hash

// Trang người dùng rơi vào khi bấm link "Đặt lại mật khẩu" trong email (AUTH-04)
export default function ResetPassword() {
  const r = useRouter()
  const [st, setSt] = useState<'wait' | 'ready' | 'bad' | 'done'>('wait')
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = new URLSearchParams(BOOT.replace(/^#/, ''))
    if (h.get('error') || h.get('error_code')) { setSt('bad'); return }        // link hết hạn hoặc đã dùng rồi
    // supabase-js tự đổi token trong link thành phiên "khôi phục" rồi phát sự kiện này
    const { data: { subscription } } = sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setSt('ready') })
    if (h.get('type') === 'recovery') sb.auth.getSession().then(({ data }) => setSt(s => s === 'wait' ? (data.session ? 'ready' : 'bad') : s))
    const t = setTimeout(() => setSt(s => s === 'wait' ? 'bad' : s), 2000)      // mở thẳng /reset-password, không qua link email
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function save() {
    const bad = pwError(pw, pw2); if (bad) return setErr(bad)
    setBusy(true); setErr('')
    const { error } = await sb.auth.updateUser({ password: pw })
    if (error) { setErr(authMsg(error)); setBusy(false); return }
    await sb.auth.signOut({ scope: 'others' }).catch(() => { })   // mật khẩu cũ có thể đã lộ: đăng xuất các máy khác
    const { data: { session } } = await sb.auth.getSession(); if (session) markFreshLogin(session.user.id)   // AUTH-06: vừa xác minh qua email nên không hỏi PIN
    setSt('done'); setBusy(false)
  }

  return (
    <div className="p"><div className="b" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><Heart size={80} /><h1 className="num" style={{ fontSize: 34, letterSpacing: '-.02em' }}>Đặt lại mật khẩu</h1></div>
      {st === 'wait' && <div className="s" style={{ textAlign: 'center' }}>Đang kiểm tra link…</div>}
      {st === 'bad' && <>
        <div className="k pe s" role="alert">Link này đã hết hạn hoặc đã được dùng rồi. Hãy yêu cầu link mới nhé.</div>
        <button className="btn" onClick={() => r.replace('/login')}>Về trang đăng nhập</button>
      </>}
      {st === 'ready' && <>
        <div className="s" style={{ textAlign: 'center' }}>Nhập mật khẩu mới cho tài khoản của bạn</div>
        <PwInput value={pw} onChange={setPw} placeholder="Mật khẩu mới (từ 8 ký tự)" auto="new-password" autoFocus />
        <PwInput value={pw2} onChange={setPw2} placeholder="Nhập lại mật khẩu mới" auto="new-password" />
        {err && <div className="k pe s" role="alert">{err}</div>}
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
      </>}
      {st === 'done' && <>
        <div className="k pk s" role="status">Xong rồi! Mật khẩu mới đã được lưu. Các máy khác đã được đăng xuất; nếu bạn dùng app cài ở Màn hình chính, hãy đăng nhập lại bằng mật khẩu mới.</div>
        <button className="btn" onClick={() => r.replace('/')}>Vào app</button>
      </>}
    </div></div>
  )
}
