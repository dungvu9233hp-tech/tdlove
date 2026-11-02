'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

export default function Wishlist() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([]); const [f, setF] = useState({ name: '', area: '', dish: '', price: '' })
  const load = useCallback(() => { sb.from('wishlist_places').select('*').order('created_at', { ascending: false }).then(r => setList(r.data ?? [])) }, [])
  useEffect(() => { load() }, [load])
  const upd = async (id: string, v: any) => { await sb.from('wishlist_places').update(v).eq('id', id); load() }
  async function save() {
    if (!f.name.trim()) return
    await sb.from('wishlist_places').insert({ space_id: space.id, ...f }); setF({ name: '', area: '', dish: '', price: '' }); load()
  }
  return <>
    <Head t="Quán muốn thử"><Link href="/plan" className="pill">Quay lại</Link></Head>
    <div className="b">
      <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input placeholder="Tên quán hoặc địa điểm" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input placeholder="Khu vực" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} />
        <input placeholder="Món nên thử" value={f.dish} onChange={e => setF({ ...f, dish: e.target.value })} />
        <input placeholder="Mức giá, ví dụ: 100–150k" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
        <button className="btn" onClick={save}>Thêm vào danh sách</button>
      </div>
      {!list.length && <div className="k pe"><div className="s">Chưa có quán nào. Thêm chỗ hai đứa muốn đi nhé.</div></div>}
      {list.map(w => <div key={w.id} className={`k ${w.visited ? 'pe' : ''}`}>
        <b>{w.name}</b><div className="s">{[w.area, w.dish && `Món: ${w.dish}`, w.price].filter(Boolean).join(', ')}</div>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button className={`pill ${w.visited ? 'on' : ''}`} onClick={() => upd(w.id, { visited: !w.visited })}>{w.visited ? 'Đã đến' : 'Chưa đến'}</button>
          {w.visited && [1, 2, 3, 4, 5].map(n => <button key={n} className={`pill ${(w.stars ?? 0) >= n ? 'on' : ''}`} onClick={() => upd(w.id, { stars: n })} aria-label={`${n} sao`}>{n}★</button>)}
          <button className="pill" onClick={async () => { await sb.from('wishlist_places').delete().eq('id', w.id); load() }}>Xóa</button>
        </div>
      </div>)}
    </div>
  </>
}
