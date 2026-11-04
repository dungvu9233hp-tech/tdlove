// Khóa app bằng mã PIN hoặc sinh trắc học (AUTH-06)
//
// - Cấu hình lưu ở MÁY NÀY (localStorage), không lên Supabase: mỗi máy tự đặt PIN riêng.
// - Đây là lớp khóa màn hình để người khác cầm máy đang mở app không xem được. Nó KHÔNG mã hóa dữ liệu
//   (phiên đăng nhập vẫn nằm trong trình duyệt), nên "Quên PIN" = đăng xuất khỏi máy này rồi đăng nhập lại bằng mật khẩu.
// - PIN không lưu thẳng: chỉ lưu bản băm PBKDF2 kèm salt. Nhập sai nhiều lần thì bị chờ, đến MAX_FAILS lần thì đăng xuất khỏi máy.
import { sb } from '@/lib/supabase'

export type LockCfg = {
  v: 1
  salt: string; hash: string; len: number   // len: số chữ số của PIN (để tự gửi khi nhập đủ)
  delay: number                             // phút: khóa lại sau khi rời app bao lâu (0 = ngay khi rời app)
  bio?: string                              // id của khóa WebAuthn trên máy (Face ID / vân tay); chưa bật thì không có
  fails: number; until: number              // số lần nhập sai liên tiếp; chưa được thử lại trước mốc này (ms)
}
export const PIN_MIN = 4, PIN_MAX = 6, MAX_FAILS = 10
export const DELAYS: [number, string][] = [[0, 'Ngay khi thoát app'], [1, 'Sau 1 phút'], [5, 'Sau 5 phút'], [15, 'Sau 15 phút']]
const WAIT_AT: Record<number, number> = { 5: 30, 7: 120, 9: 600 }   // sai đủ N lần thì chờ từng ấy giây
const ITER = 100000

export const LOCK_CHANGED = 'tdlove-lock-changed', LOCK_NOW = 'tdlove-lock-now'
const k = (uid: string) => `tdlove.lock.${uid}`, seenK = (uid: string) => `tdlove.seen.${uid}`, skipK = (uid: string) => `tdlove.skip.${uid}`

// ---------- Lưu / đọc cấu hình ----------
export function getLock(uid: string): LockCfg | null {
  try {
    const c = JSON.parse(localStorage.getItem(k(uid)) ?? 'null')
    return c && c.v === 1 && typeof c.hash === 'string' && typeof c.salt === 'string' && c.len >= PIN_MIN && c.len <= PIN_MAX ? c : null
  } catch { return null }
}
export function saveLock(uid: string, c: LockCfg) { localStorage.setItem(k(uid), JSON.stringify(c)); notifyLockChanged() }
export function clearLock(uid: string) { localStorage.removeItem(k(uid)); localStorage.removeItem(seenK(uid)); localStorage.removeItem(skipK(uid)); notifyLockChanged() }
export const notifyLockChanged = () => window.dispatchEvent(new Event(LOCK_CHANGED))
export const lockNow = () => window.dispatchEvent(new Event(LOCK_NOW))

// ---------- PIN ----------
// Trả về câu báo lỗi, hoặc '' nếu hợp lệ
export function pinError(p: string, p2?: string): string {
  if (!/^\d+$/.test(p) || p.length < PIN_MIN || p.length > PIN_MAX) return `PIN gồm ${PIN_MIN}–${PIN_MAX} chữ số`
  if (/^(\d)\1+$/.test(p)) return 'PIN không nên là một số lặp lại (0000, 1111…)'
  const d = [...p].map(Number)
  if (d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1)) return 'PIN không nên là dãy số liền nhau (1234, 4321…)'
  if (p2 !== undefined && p !== p2) return 'Hai ô PIN chưa giống nhau'
  return ''
}
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const s = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: s, iterations: ITER }, key, 256))
}
// Đặt PIN mới (giữ nguyên thời gian tự khóa và sinh trắc học nếu đang có)
export async function setPin(uid: string, pin: string) {
  const old = getLock(uid), salt = b64(rand(16))
  saveLock(uid, { v: 1, salt, hash: await hashPin(pin, salt), len: pin.length, delay: old?.delay ?? 1, bio: old?.bio, fails: 0, until: 0 })
}

export type PinResult = { state: 'ok' } | { state: 'bad'; left: number; waitMs: number } | { state: 'wait'; waitMs: number } | { state: 'wipe' }
export async function verifyPin(uid: string, pin: string): Promise<PinResult> {
  const c = getLock(uid); if (!c) return { state: 'ok' }
  const now = Date.now()
  if (now < c.until) return { state: 'wait', waitMs: c.until - now }   // đang bị chờ: không tính thêm lần sai
  if (await hashPin(pin, c.salt) === c.hash) { unlockOk(uid); return { state: 'ok' } }
  const fails = c.fails + 1
  if (fails >= MAX_FAILS) return { state: 'wipe' }
  const waitMs = (WAIT_AT[fails] ?? 0) * 1000
  saveLock(uid, { ...c, fails, until: waitMs ? Date.now() + waitMs : 0 })
  return { state: 'bad', left: MAX_FAILS - fails, waitMs }
}
// Mở khóa thành công (bằng PIN hoặc sinh trắc học): xóa số lần sai, ghi nhận app đang được dùng
export function unlockOk(uid: string) {
  const c = getLock(uid); if (c && (c.fails || c.until)) localStorage.setItem(k(uid), JSON.stringify({ ...c, fails: 0, until: 0 }))
  touchActive(uid)
}

// ---------- Khi nào khóa ----------
// seen = lần cuối app được biết là đang mở (cập nhật khi rời app và mỗi vài giây khi đang mở)
export const touchActive = (uid: string) => { try { localStorage.setItem(seenK(uid), String(Date.now())) } catch { } }
// Gọi ngay sau khi đăng nhập bằng mật khẩu: vừa nhập mật khẩu xong thì không bắt nhập PIN nữa
export const markFreshLogin = (uid: string) => { try { touchActive(uid); localStorage.setItem(skipK(uid), String(Date.now() + 15000)) } catch { } }
export function shouldLock(uid: string, now = Date.now()): boolean {
  const c = getLock(uid); if (!c) return false
  if (now < Number(localStorage.getItem(skipK(uid)) ?? 0)) return false
  const seen = Number(localStorage.getItem(seenK(uid)) ?? 0)
  return !seen || now - seen >= c.delay * 60000   // chưa từng ghi nhận thì khóa cho chắc
}

// Rời máy này: bỏ đăng ký thông báo, đăng xuất khỏi máy này, xóa PIN (dùng khi nhập sai quá nhiều hoặc quên PIN)
export async function leaveDevice(uid: string) {
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription()
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
  } catch { }
  await sb.auth.signOut({ scope: 'local' })
  clearLock(uid)
}

// ---------- Sinh trắc học (WebAuthn, khóa gắn với máy) ----------
// Chỉ dùng để xác nhận "đúng chủ máy" ngay trên máy này (Face ID / vân tay / khóa màn hình); không có máy chủ kiểm tra chữ ký.
const b64u = (b: ArrayBuffer | Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export async function bioAvailable(): Promise<boolean> {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}
// Phải gọi từ một lần bấm nút (trình duyệt yêu cầu). Trả về id khóa để lưu vào cấu hình.
export async function enrollBio(label: string): Promise<string> {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32), rp: { name: 'tdlove' }, user: { id: rand(16), name: label || 'tdlove', displayName: label || 'tdlove' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none', timeout: 60000,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Không tạo được khóa sinh trắc học')
  return b64u(cred.rawId)
}
export async function verifyBio(uid: string): Promise<boolean> {
  const c = getLock(uid); if (!c?.bio) return false
  const challenge = rand(32)
  const a = await navigator.credentials.get({
    publicKey: { challenge, allowCredentials: [{ type: 'public-key', id: unb64u(c.bio), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
  }) as PublicKeyCredential | null
  if (!a) return false
  const r = a.response as AuthenticatorAssertionResponse
  const cd = JSON.parse(new TextDecoder().decode(r.clientDataJSON))
  const uv = (new Uint8Array(r.authenticatorData)[32] & 0x04) !== 0   // cờ "đã xác minh người dùng"
  const good = cd.type === 'webauthn.get' && cd.challenge === b64u(challenge) && cd.origin === location.origin && uv && b64u(a.rawId) === c.bio
  if (good) unlockOk(uid)
  return good
}
