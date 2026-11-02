'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { Heart } from '@/components/Head'

export default function Login() {
  const r = useRouter()
  const [mode, setMode] = useState<'login' | 'create' | 'join'>('login')
  const [f, setF] = useState({ email: '', password: '', name: '', code: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const up = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function go() {
    setBusy(true); setErr('')
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password }); if (error) throw error
      } else {
        const email = f.email.trim()
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
        if (pr?.space_id) { r.push('/'); return }
        const q = mode === 'create' ? sb.rpc('create_space', { p_name: f.name }) : sb.rpc('join_space', { p_code: f.code.trim(), p_name: f.name })
        const { error: e2 } = await q
        if (e2) throw new Error(`${e2.message}. Tài khoản đã được tạo, bạn không cần đăng ký lại: ${mode === 'join' ? 'kiểm tra mã mời rồi bấm "Vào Space" lần nữa (nếu mã hết hạn, nhờ người ấy tạo mã mới).' : 'bấm "Tạo Space" lần nữa.'}`)
      }
      r.push('/')
    } catch (e: any) { setErr(e.message ?? 'Có lỗi xảy ra') }
    setBusy(false)
  }

  return (
    <div className="p"><div className="b" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}><Heart size={96} /><h1 className="num" style={{ fontSize: 44 }}>tdlove</h1><div className="s">Góc nhỏ của hai đứa mình</div></div>
      <label className="k s"><input type="email" placeholder="Email của bạn" value={f.email} onChange={up('email')} autoComplete="email" /></label>
      <label className="k s"><input type="password" placeholder="Mật khẩu" value={f.password} onChange={up('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode !== 'login' && <label className="k s"><input placeholder="Tên hiển thị" value={f.name} onChange={up('name')} /></label>}
      {mode === 'join' && <label className="k s"><input placeholder="Mã mời từ người ấy" value={f.code} onChange={up('code')} autoCapitalize="none" /></label>}
      {err && <div className="k pe s" role="alert">{err}</div>}
      <button className="btn" onClick={go} disabled={busy}>{mode === 'login' ? 'Đăng nhập' : mode === 'create' ? 'Tạo Space' : 'Vào Space'}</button>
      <div className="row">
        <button className={`k pk ${mode === 'create' ? 'on' : ''}`} onClick={() => setMode('create')}>Tạo Space mới</button>
        <button className={`k pe ${mode === 'join' ? 'on' : ''}`} onClick={() => setMode('join')}>Nhập mã mời</button>
      </div>
      {mode !== 'login' && <button className="pill" style={{ alignSelf: 'center' }} onClick={() => setMode('login')}>Đã có tài khoản? Đăng nhập</button>}
      <div className="s" style={{ textAlign: 'center' }}>Mỗi Space chỉ có đúng hai người</div>
    </div></div>
  )
}
