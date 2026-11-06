'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { sign } from '@/lib/media'
import { destroy, KEEP_DAYS, purgeOld } from '@/lib/trash'
import { ok } from '@/lib/util'
import Head from '@/components/Head'

// Thùng rác: khôi phục trong 30 ngày (MOM-05)
export default function Trash() {
  const [list, setList] = useState<any[] | null>(null); const [t, setT] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    await purgeOld()
    const { data } = await sb.from('moments').select('id,title,taken_on,deleted_at,photos,media(path,thumb_path,kind,sort)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    const rows = data ?? []; setList(rows)
    setT(await sign(rows.map(m => { const x = (m.media as any[]).sort((a, b) => a.sort - b.sort)[0]; return x ? x.thumb_path ?? (x.kind === 'image' ? x.path : null) : null })))
  }, [])
  useEffect(() => { load() }, [load])
  const left = (d: string) => Math.max(0, Math.ceil(KEEP_DAYS - (Date.now() - new Date(d).getTime()) / 864e5))
  const restore = async (m: any) => { if (await ok(sb.from('moments').update({ deleted_at: null }).eq('id', m.id), 'Không khôi phục được')) load() }
  const kill = async (m: any) => { if (confirm(`Xóa vĩnh viễn "${m.title}"? Không khôi phục được nữa.`)) { if (await destroy([m])) load(); else alert('Không xóa được, thử lại sau nhé.') } }

  return <>
    <Head t="Thùng rác"><Link href="/moments" className="pill">Quay lại</Link></Head>
    <div className="b">
      <div className="s">Khoảnh khắc đã xóa được giữ {KEEP_DAYS} ngày, sau đó tự xóa hẳn.</div>
      {list && !list.length && <div className="k pe"><b>Thùng rác trống</b></div>}
      {list?.map(m => { const x = (m.media as any[])[0], u = x && t[x.thumb_path ?? (x.kind === 'image' ? x.path : '')]
        return <div key={m.id} className="k" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {u ? <img src={u} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line2)' }} /> : <span style={{ fontSize: 32 }}>🗑️</span>}
          <div style={{ flex: 1, minWidth: 0 }}><b>{m.title}</b><div className="s">{new Date(m.taken_on).toLocaleDateString('vi-VN')} · còn {left(m.deleted_at)} ngày</div>
            <div className="row" style={{ marginTop: 6 }}><button className="pill on" onClick={() => restore(m)}>Khôi phục</button><button className="pill" onClick={() => kill(m)}>Xóa hẳn</button></div></div>
        </div> })}
    </div>
  </>
}
