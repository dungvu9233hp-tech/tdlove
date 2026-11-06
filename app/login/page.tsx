'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { Heart } from '@/components/Head'
import { authMsg } from '@/lib/auth'
import { cleanName, nameError } from '@/lib/profile'
import { markFreshLogin } from '@/lib/applock'

export default function Login() {
  const r = useRouter()
  const [mode, setMode] = useState<'login' | 'create' | 'join' | 'forgot'>('login')
  const [f, setF] = useState({ email: '', password: '', name: '', code: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(''); const [cool, setCool] = useState(0)   // cool: giây chờ trước khi được gửi lại email
  useEffect(() => { if (cool > 0) { const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t) } }, [cool])
  const up = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function go() {
    setBusy(true); setErr('')
    const fresh = async () => { const { data: { session } } = await sb.auth.getSession(); if (session) markFreshLogin(session.user.id) }   // AUTH-06: vừa nhập mật khẩu thì không hỏi PIN nữa
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password }); if (error) throw error
      } else {
        const email = f.email.trim()
        const bad = nameError(f.name); if (bad) throw new Error(bad)   // kiểm tra trước khi tạo tài khoản, tránh để lại tài khoản không có tên
        if (mode === 'join' && !f.code.trim()) throw new Error('Hãy nhập mã mời')
        // Lần trước đăng ký xong mà vào Space lỗi thì tài khoản vẫn còn: dùng lại, không đăng ký lần nữa
        let { data: { session } } = await sb.auth.getSession()
        if (session && session.user.email?.toLowerCase() !== email.toLowerCase()) { await sb.auth.signOut(); session = null }
        if (!session) {
          const up = await sb.auth.signUp({ email, password: f.password })
          if (up.error && /already|registered|exists/i.test(up.error.message)) {
            const inn = await sb.auth.signInWithPassword({ email, password: f.password })
            if (inn.error) throw new Error('Email này đã có tài khoản. Hãy nhập đúng mật khẩu đã dùng lúc đăng ký để tiếp tục.')
            session = inn.data.session
          } else if (up.error) throw up.error
          else session = up.data.session
          if (!session) throw new Error('Supabase đang bật xác nhận email. Vào Auth > Providers > Email, tắt "Confirm email" rồi thử lại.')
        }
        // Đã ở trong một Space rồi thì vào thẳng, không tạo/đổi Space
        const { data: pr } = await sb.from('profiles').select('space_id').eq('id', session.user.id).maybeSingle()
        if (pr?.space_id) { await fresh(); r.push('/'); return }
        const q = mode === 'create' ? sb.rpc('create_space', { p_name: cleanName(f.name) }) : sb.rpc('join_space', { p_code: f.code.trim(), p_name: cleanName(f.name) })
        const { data: res, error: e2 } = await q
        const why = e2?.message ?? (mode === 'join' && res !== 'ok' ? String(res) : '')   // join_space trả 'ok' hoặc câu báo lỗi
        if (why) throw new Error(`${why.replace(/\.$/, '')}. Tài khoản đã được tạo, bạn không cần đăng ký lại: ${mode === 'join' ? 'kiểm tra mã mời rồi bấm "Vào Space" lần nữa (nếu mã hết hạn, nhờ người ấy tạo mã mới).' : 'bấm "Tạo Space" lần nữa.'}`)
      }
      await fresh(); r.push('/')
    } catch (e: any) { setErr(e.message ?? 'Có lỗi xảy ra') }
    setBusy(false)
  }

  // Quên mật khẩu (AUTH-04): gửi email chứa link về /reset-password
  async function sendReset() {
    const email = f.email.trim()
    if (!email) return setErr('Hãy nhập email đã dùng để đăng ký')
    setBusy(true); setErr(''); setInfo('')
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) setErr(authMsg(error))
    else { setInfo('Nếu email này đã có tài khoản, mình vừa gửi link đặt lại mật khẩu. Nhớ xem cả thư mục Spam. Link chỉ dùng được một lần và sẽ hết hạn sau ít lâu.'); setCool(60) }
    setBusy(false)
  }
  const goMode = (m: typeof mode) => { setMode(m); setErr(''); setInfo('') }

  return (
    <div className="p"><div className="b stagger" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingBottom: 6 }}><Heart size={92} /><h1 className="num" style={{ fontSize: 48, marginTop: 6, letterSpacing: '-.03em' }}>tdlove</h1><div className="couple-names">Góc nhỏ của hai đứa mình</div></div>
      <label className="k s"><input type="email" placeholder="Email của bạn" value={f.email} onChange={up('email')} autoComplete="email" /></label>
      {mode !== 'forgot' && <label className="k s"><input type="password" placeholder="Mật khẩu" value={f.password} onChange={up('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
      {mode === 'login' && <button className="pill" style={{ alignSelf: 'flex-end' }} onClick={() => goMode('forgot')}>Quên mật khẩu?</button>}
      {mode === 'forgot' && <div className="s">Nhập email đã đăng ký, mình gửi link để bạn đặt mật khẩu mới.</div>}
      {(mode === 'create' || mode === 'join') && <label className="k s"><input placeholder="Tên hiển thị" value={f.name} onChange={up('name')} /></label>}
      {mode === 'join' && <label className="k s"><input placeholder="Mã mời từ người ấy" value={f.code} onChange={up('code')} autoCapitalize="none" /></label>}
      {err && <div className="k pe s" role="alert">{err}</div>}
      {info && <div className="k pk s" role="status">{info}</div>}
      {mode === 'forgot'
        ? <button className="btn" onClick={sendReset} disabled={busy || cool > 0}>{cool > 0 ? `Gửi lại sau ${cool}s` : info ? 'Gửi lại link' : 'Gửi link đặt lại mật khẩu'}</button>
        : <button className="btn" onClick={go} disabled={busy}>{mode === 'login' ? 'Đăng nhập' : mode === 'create' ? 'Tạo Space' : 'Vào Space'}</button>}
      {mode !== 'forgot' && <div className="row">
        <button className={`k pk ${mode === 'create' ? 'on' : ''}`} onClick={() => goMode('create')}>Tạo Space mới</button>
        <button className={`k pe ${mode === 'join' ? 'on' : ''}`} onClick={() => goMode('join')}>Nhập mã mời</button>
      </div>}
      {mode !== 'login' && <button className="pill" style={{ alignSelf: 'center' }} onClick={() => goMode('login')}>{mode === 'forgot' ? 'Quay lại đăng nhập' : 'Đã có tài khoản? Đăng nhập'}</button>}
      <div className="s" style={{ textAlign: 'center' }}>Mỗi Space chỉ có đúng hai người</div>
    </div></div>
  )
}
