'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DELAYS, MAX_FAILS, PIN_MAX, PIN_MIN, bioAvailable, clearLock, enrollBio, getLock, leaveDevice, lockNow, pinError, saveLock, setPin, verifyPin, type LockCfg } from '@/lib/applock'

type Msg = { good: boolean; text: string } | null
const digits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_MAX)
// Ô nhập PIN: bàn phím số trên điện thoại, che số đã nhập
const PinBox = ({ value, onChange, label, auto }: { value: string; onChange: (v: string) => void; label: string; auto?: boolean }) =>
  <label className="k s" style={{ display: 'block' }}><input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" name={`pin-${label}`} value={value} onChange={e => onChange(digits(e.target.value))} placeholder={label} aria-label={label} autoFocus={auto} /></label>

// Khóa app (AUTH-06) trong Cài đặt: bật/đổi/tắt PIN, thời gian tự khóa, sinh trắc học
export default function LockSettings({ uid, name }: { uid: string; name: string }) {
  const r = useRouter()
  const [cfg, setCfg] = useState<LockCfg | null>(null); const [bioOk, setBioOk] = useState(false)
  const [mode, setMode] = useState<null | 'set' | 'change' | 'off'>(null)
  const [cur, setCur] = useState(''); const [p1, setP1] = useState(''); const [p2, setP2] = useState('')
  const [msg, setMsg] = useState<Msg>(null); const [busy, setBusy] = useState(false)
  const refresh = () => setCfg(getLock(uid))
  useEffect(() => { refresh(); bioAvailable().then(setBioOk) }, [uid])
  const close = () => { setMode(null); setCur(''); setP1(''); setP2('') }

  // Kiểm tra PIN hiện tại (có tính số lần sai và thời gian chờ như ở màn hình khóa)
  async function checkCur(): Promise<boolean> {
    const res = await verifyPin(uid, cur)
    if (res.state === 'ok') return true
    if (res.state === 'wipe') { await leaveDevice(uid); alert('Bạn nhập sai PIN quá nhiều lần nên mình đã đăng xuất khỏi máy này. Hãy đăng nhập lại bằng mật khẩu.'); r.replace('/login'); return false }
    if (res.state === 'wait') setMsg({ good: false, text: `Nhập sai nhiều lần, thử lại sau ${Math.ceil(res.waitMs / 1000)} giây` })
    else setMsg({ good: false, text: `PIN hiện tại chưa đúng, còn ${res.left} lần thử` })
    setCur(''); return false
  }
  async function submit() {
    setMsg(null)
    if (mode !== 'off') { const bad = pinError(p1, p2); if (bad) return setMsg({ good: false, text: bad }) }
    setBusy(true)
    try {
      if (mode !== 'set' && !await checkCur()) return
      if (mode === 'off') { clearLock(uid); setMsg({ good: true, text: 'Đã tắt khóa app' }) }
      else { await setPin(uid, p1); setMsg({ good: true, text: mode === 'set' ? 'Đã bật khóa app. Từ giờ app sẽ hỏi PIN theo thời gian bạn chọn.' : 'Đã đổi PIN' }) }
      close(); refresh()
    } catch (e: any) { setMsg({ good: false, text: 'Không lưu được: ' + (e?.message ?? 'lỗi không rõ') }) }
    finally { setBusy(false) }
  }
  const setDelay = (m: number) => { if (cfg) { saveLock(uid, { ...cfg, delay: m }); refresh() } }
  async function toggleBio() {
    if (!cfg) return
    setMsg(null)
    if (cfg.bio) { saveLock(uid, { ...cfg, bio: undefined }); refresh(); return setMsg({ good: true, text: 'Đã tắt mở khóa bằng sinh trắc học' }) }
    setBusy(true)
    try { saveLock(uid, { ...cfg, bio: await enrollBio(name) }); refresh(); setMsg({ good: true, text: 'Đã bật mở khóa bằng sinh trắc học. PIN vẫn dùng được bất cứ lúc nào.' }) }
    catch { setMsg({ good: false, text: 'Chưa bật được: bạn đã hủy, hoặc máy/trình duyệt chưa cho phép. Trên iPhone, hãy mở app từ Màn hình chính và bật Face ID cho Safari.' }) }
    setBusy(false)
  }

  return <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <b>Khóa app</b>
    <div className="s">{cfg ? `Đang bật khóa bằng PIN${cfg.bio ? ' và sinh trắc học' : ''} trên máy này.` : `Đặt PIN (${PIN_MIN}–${PIN_MAX} số) để người khác cầm điện thoại đang mở app cũng không xem được. PIN chỉ lưu trên máy này, máy kia tự đặt riêng.`}</div>
    {!cfg && mode !== 'set' && <button className="pill" onClick={() => { setMsg(null); setMode('set') }} style={{ alignSelf: 'flex-start' }}>Bật khóa bằng PIN</button>}
    {cfg && !mode && <>
      <label className="s">Tự khóa lại
        <select value={cfg.delay} onChange={e => setDelay(Number(e.target.value))} style={{ maxWidth: '100%', width: '100%', marginTop: 4 }}>{DELAYS.map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pill" onClick={lockNow}>Khóa ngay</button>
        <button className="pill" onClick={() => { setMsg(null); setMode('change') }}>Đổi PIN</button>
        {bioOk && <button className="pill" onClick={toggleBio} disabled={busy}>{cfg.bio ? 'Tắt sinh trắc học' : 'Bật sinh trắc học'}</button>}
        <button className="pill" onClick={() => { setMsg(null); setMode('off') }}>Tắt khóa</button>
      </div>
      <div className="s">Nhập sai PIN {MAX_FAILS} lần sẽ đăng xuất khỏi máy này. Quên PIN thì đăng nhập lại bằng mật khẩu rồi đặt PIN mới.</div>
    </>}
    {mode && <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={e => { e.preventDefault(); submit() }}>
      {mode !== 'set' && <PinBox value={cur} onChange={setCur} label="PIN hiện tại" auto />}
      {mode !== 'off' && <><PinBox value={p1} onChange={setP1} label={mode === 'change' ? 'PIN mới' : `PIN (${PIN_MIN}–${PIN_MAX} số)`} auto={mode === 'set'} /><PinBox value={p2} onChange={setP2} label="Nhập lại PIN" /></>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pill on" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : mode === 'off' ? 'Tắt khóa' : mode === 'set' ? 'Bật khóa' : 'Lưu PIN mới'}</button>
        <button className="pill" type="button" onClick={() => { close(); setMsg(null) }}>Hủy</button>
      </div>
    </form>}
    {msg && <div className="s" role={msg.good ? 'status' : 'alert'}>{msg.good ? '✓ ' : ''}{msg.text}</div>}
  </div>
}
