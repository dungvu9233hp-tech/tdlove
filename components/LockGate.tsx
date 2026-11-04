'use client'
import { useEffect, useMemo, useState } from 'react'
import Lock from '@/components/Lock'
import { LOCK_CHANGED, LOCK_NOW, getLock, shouldLock, touchActive } from '@/lib/applock'

// Bọc toàn bộ app (AUTH-06). Khi đang khóa, các trang vẫn nằm yên phía sau nhưng bị ẩn (giữ nguyên tin đang soạn, vị trí cuộn),
// màn hình khóa phủ lên trên. Cuộc gọi đến vẫn hiện được (xem .call trong globals.css) để không lỡ cuộc gọi.
export default function LockGate({ uid, children }: { uid: string; children: React.ReactNode }) {
  const [ver, setVer] = useState(0)   // tăng lên mỗi khi cấu hình khóa đổi (bật/tắt/đổi PIN)
  const [locked, setLocked] = useState(() => shouldLock(uid))
  const on = useMemo(() => !!getLock(uid), [uid, ver])

  useEffect(() => {
    const changed = () => setVer(v => v + 1), now = () => { if (getLock(uid)) setLocked(true) }
    window.addEventListener(LOCK_CHANGED, changed); window.addEventListener(LOCK_NOW, now)
    return () => { window.removeEventListener(LOCK_CHANGED, changed); window.removeEventListener(LOCK_NOW, now) }
  }, [uid])

  useEffect(() => {
    if (!on) return
    const beat = setInterval(() => { if (document.visibilityState === 'visible' && !locked) touchActive(uid) }, 10000)
    const vis = () => {
      if (document.visibilityState === 'hidden') {
        if (!locked) touchActive(uid)
        if (getLock(uid)?.delay === 0) setLocked(true)   // khóa ngay lúc rời app để màn hình hiện trong danh sách app đang mở cũng đã bị che
      } else if (shouldLock(uid)) setLocked(true)
    }
    const hide = () => { if (!locked) touchActive(uid) }
    document.addEventListener('visibilitychange', vis); window.addEventListener('pagehide', hide)
    return () => { clearInterval(beat); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', hide) }
  }, [on, locked, uid])

  const show = locked && on
  return <>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, visibility: show ? 'hidden' : 'visible' }} aria-hidden={show}>{children}</div>
    {show && <Lock uid={uid} onUnlock={() => { setLocked(false); setTimeout(() => window.dispatchEvent(new Event('resize')), 50) }} />}
  </>
}
