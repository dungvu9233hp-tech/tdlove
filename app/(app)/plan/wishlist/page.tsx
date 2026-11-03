'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import Lightbox from '@/components/Lightbox'
import PlaceReview from '@/components/PlaceReview'
import { sign } from '@/lib/media'
import { ok } from '@/lib/util'

export default function Wishlist() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([]); const [f, setF] = useState({ name: '', area: '', dish: '', price: '' })
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [rev, setRev] = useState<any>(null)                                   // quán đang viết đánh giá
  const [lb, setLb] = useState<{ place: any; start: number; urls: Record<string, string> } | null>(null)
  const load = useCallback(async () => {
    const r = await sb.from('wishlist_places').select('*, wishlist_media(id, path, thumb_path, sort)').order('created_at', { ascending: false })
    const rows = r.data ?? []; setList(rows)
    setUrls(await sign(rows.flatMap((w: any) => (w.wishlist_media ?? []).map((m: any) => m.thumb_path ?? m.path))))
  }, [])
  useEffect(() => { load() }, [load])
  const upd = async (id: string, v: any) => { await ok(sb.from('wishlist_places').update(v).eq('id', id)); load() }
  async function save() {
    if (!f.name.trim()) return
    if (!await ok(sb.from('wishlist_places').insert({ space_id: space.id, ...f }))) return
    setF({ name: '', area: '', dish: '', price: '' }); load()
  }
  const photos = (w: any) => (w.wishlist_media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort)
  async function openPhotos(w: any, start: number) {   // xem ảnh gốc, không phải ảnh nhỏ
    const u = await sign(photos(w).map((m: any) => m.path)); setLb({ place: w, start, urls: u })
  }
  // Bấm "Chưa đến" -> đánh dấu đã đến và mở luôn form đánh giá; bấm "Đã đến" để bỏ đánh dấu
  async function toggleVisited(w: any) {
    if (w.visited) return upd(w.id, { visited: false })
    if (await ok(sb.from('wishlist_places').update({ visited: true, visited_on: w.visited_on ?? new Date().toLocaleDateString('sv') }).eq('id', w.id))) {
      await load(); setRev({ ...w, visited: true })
    }
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
      {list.map(w => {
        const ph = photos(w)
        return <div key={w.id} className={`k ${w.visited ? 'pe' : ''}`}>
          <b>{w.name}</b><div className="s">{[w.area, w.dish && `Món: ${w.dish}`, w.price].filter(Boolean).join(', ')}</div>
          {w.visited && <>
            <div className="s" style={{ marginTop: 6 }}>{w.stars ? '★'.repeat(w.stars) + '☆'.repeat(5 - w.stars) + ' ' : ''}{w.visited_on ? `Đã đến ${new Date(w.visited_on + 'T00:00').toLocaleDateString('vi-VN')}` : 'Đã đến'}</div>
            {w.review ? <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{w.review}</div> : <div className="s" style={{ marginTop: 6 }}>Chưa có đánh giá. Đi ăn rồi thì viết vài dòng nhé.</div>}
            {ph.length > 0 && <div className="grid" style={{ marginTop: 8 }}>
              {ph.map((m: any, i: number) => <button key={m.id} className="th" style={{ padding: 0, cursor: 'pointer' }} onClick={() => openPhotos(w, i)} aria-label={`Xem ảnh ${i + 1}/${ph.length}`}>
                {urls[m.thumb_path ?? m.path] ? <img src={urls[m.thumb_path ?? m.path]} alt="" /> : '🖼️'}</button>)}
            </div>}
          </>}
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <button className={`pill ${w.visited ? 'on' : ''}`} onClick={() => toggleVisited(w)}>{w.visited ? 'Đã đến' : 'Chưa đến'}</button>
            {w.visited && <button className="pill on" onClick={() => setRev(w)}>{w.review || ph.length ? 'Sửa đánh giá / ảnh' : 'Viết đánh giá, thêm ảnh'}</button>}
            <button className="pill" onClick={async () => {
              if (!await ok(sb.from('wishlist_places').delete().eq('id', w.id), 'Không xóa được')) return
              const files = ph.flatMap((m: any) => [m.path, m.thumb_path].filter(Boolean)); if (files.length) sb.storage.from('media').remove(files)   // dọn tệp ảnh của quán đã xóa
              load()
            }}>Xóa</button>
          </div>
        </div>
      })}
    </div>
    {rev && <PlaceReview space={space} place={rev} onClose={() => { setRev(null); load() }} onDone={() => { setRev(null); load() }} />}
    {lb && <Lightbox items={photos(lb.place).map((m: any) => ({ kind: 'image' as const, url: lb.urls[m.path] })).filter((x: any) => x.url)} start={lb.start} caption={lb.place.name} onClose={() => setLb(null)} />}
  </>
}
