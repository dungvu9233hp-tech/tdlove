'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { C } from '@/lib/ctx'
import Nav from '@/components/Nav'
import Call from '@/components/Call'
import LockGate from '@/components/LockGate'
import TripBar from '@/components/TripBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const r = useRouter()
  const [s, set] = useState<any>(null)
  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return r.replace('/login')
    const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!me?.space_id) return r.replace('/login')
    const [{ data: space }, { data: ps }] = await Promise.all([
      sb.from('spaces').select('*').eq('id', me.space_id).single(),
      sb.from('profiles').select('*').eq('space_id', me.space_id).neq('id', user.id),
    ])
    set({ me, space, partner: ps?.[0] ?? null })
  }, [r])
  useEffect(() => { load() }, [load])
  if (!s) return <div className="p"><div className="b s">Đang mở góc nhỏ của hai đứa…</div></div>
  return <C.Provider value={{ ...s, reload: load }}><div className="p"><LockGate uid={s.me.id}><TripBar />{children}<Nav /><Call /></LockGate></div></C.Provider>
}
