'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

export default function Settings() {
  const { me, partner, reload } = useApp(); const r = useRouter()
  const [name, setName] = useState(me.display_name ?? ''); const [ok, setOk] = useState(false)
  const save = async () => { await sb.from('profiles').update({ display_name: name }).eq('id', me.id); setOk(true); reload() }
  return <>
    <Head t="Cài đặt" />
    <div className="b">
      <div className="k"><b>Hồ sơ của mình</b>
        <label><input value={name} onChange={e => { setName(e.target.value); setOk(false) }} placeholder="Tên hiển thị" /></label>
        <button className="pill" onClick={save}>{ok ? 'Đã lưu' : 'Lưu tên'}</button></div>
      <div className="k li"><b>Người ấy</b><div className="s">{partner?.display_name ?? 'Chưa vào Space'}</div></div>
      <button className="btn" onClick={async () => { await sb.auth.signOut(); r.replace('/login') }}>Đăng xuất</button>
    </div>
  </>
}
