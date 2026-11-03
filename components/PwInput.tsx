'use client'
import { useState } from 'react'

// Ô nhập mật khẩu có nút Hiện/Ẩn (gõ sai trên điện thoại rất dễ)
export default function PwInput({ value, onChange, placeholder, auto, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; auto: 'current-password' | 'new-password'; autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <label className="k s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type={show ? 'text' : 'password'} placeholder={placeholder} aria-label={placeholder} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} autoComplete={auto} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pill" style={{ flex: 'none' }} aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'}</button>
    </label>
  )
}
