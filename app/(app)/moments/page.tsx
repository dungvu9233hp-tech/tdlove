'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { sign, TAG_EMOJI, zipDownload } from '@/lib/media'
import { ok } from '@/lib/util'
import { purgeOld } from '@/lib/trash'
import Head from '@/components/Head'
import MomentForm from '@/components/MomentForm'
import MomentView from '@/components/MomentView'
import Slideshow from '@/components/Slideshow'

const PAGE = 30
const SEL = '*, media(id,kind,path,thumb_path,sort,size,duration), moment_hearts(user_id), moment_comments(count), album_moments(album_id)'
const dayLabel = (d: string) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tep'

type Filter = { year: string; place: string; tag: string; album: string }
const NOF: Filter = { year: '', place: '', tag: '', album: '' }

export default function Moments() {
  const { me, partner, space } = useApp()
  const [list, setList] = useState<any[]>([]); const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [more, setMore] = useState(true); const [loading, setLoading] = useState(false)
  const [flt, setFlt] = useState<Filter>(NOF); const [showF, setShowF] = useState(false)
  const [opts, setOpts] = useState<{ years: string[]; places: string[]; tags: string[] }>({ years: [], places: [], tags: [] })
  const [albums, setAlbums] = useState<any[]>([]); const [plans, setPlans] = useState<any[]>([])
  const [form, setForm] = useState<null | 'new' | any>(null); const [view, setView] = useState<any>(null)
  const [memo, setMemo] = useState<any[]>([]); const [show, setShow] = useState(false)
  const [zip, setZip] = useState<string>(''); const [trashN, setTrashN] = useState(0)
  const lenRef = useRef(0), lock = useRef(false), gen = useRef(0), fRef = useRef(flt); fRef.current = flt
  const sentinel = useRef<HTMLDivElement>(null)

  const attach = useCallback(async (rows: any[]) => {   // ký link ảnh nhỏ cho cả trang bằng một lần gọi
    const t = await sign(rows.flatMap(m => (m.media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort).slice(0, 4).map((x: any) => x.thumb_path ?? (x.kind === 'image' ? x.path : null))))
    setThumbs(a => ({ ...a, ...t }))
  }, [])

  const fetchPage = useCallback(async (from: number) => {
    const f = fRef.current
    let q: any = sb.from('moments').select(f.album ? SEL.replace('album_moments(album_id)', 'album_moments!inner(album_id)') : SEL).is('deleted_at', null)
    if (f.year) q = q.gte('taken_on', `${f.year}-01-01`).lte('taken_on', `${f.year}-12-31`)
    if (f.place) q = q.eq('place', f.place)
    if (f.tag) q = q.contains('tags', [f.tag])
    if (f.album) q = q.eq('album_moments.album_id', f.album)
    const { data, error } = await q.order('taken_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1)
    if (error) { console.error('moments', error.message); return null }
    const rows = data ?? []; await attach(rows); return rows
  }, [attach])

  const page = useCallback(async (reset: boolean) => {
    if (!reset && lock.current) return
    const g = reset ? ++gen.current : gen.current
    lock.current = true; setLoading(true)
    try {
      const from = reset ? 0 : lenRef.current, rows = await fetchPage(from)
      if (g !== gen.current || !rows) return
      lenRef.current = from + rows.length
      setList(a => reset ? rows : [...a, ...rows.filter((r: any) => !a.some(x => x.id === r.id))]); setMore(rows.length === PAGE)
    } finally { if (g === gen.current) { lock.current = false; setLoading(false) } }
  }, [fetchPage])
  const load = useCallback(() => page(true), [page])
  useEffect(() => { load() }, [load, flt])

  useEffect(() => {
    const el = sentinel.current; if (!el || !more) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) page(false) }, { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [more, list.length, page])

  // lựa chọn cho bộ lọc, album, plan, thùng rác, nhắc lại kỷ niệm
  const loadMeta = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      sb.from('moments').select('taken_on,place,tags').is('deleted_at', null).limit(3000),
      sb.from('albums').select('*').order('created_at'),
      sb.from('plans').select('id,name').order('created_at', { ascending: false }).limit(100),
      sb.from('moments').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      sb.from('moments').select(SEL).is('deleted_at', null).limit(500),
    ])
    const rows = a.data ?? [], uniq = (xs: any[]) => Array.from(new Set(xs.filter(Boolean))) as string[]
    setOpts({ years: uniq(rows.map((r: any) => r.taken_on.slice(0, 4))).sort().reverse(), places: uniq(rows.map((r: any) => r.place)).sort(), tags: uniq(rows.flatMap((r: any) => r.tags ?? [])).sort() })
    setAlbums(b.data ?? []); setPlans(c.data ?? []); setTrashN(d.count ?? 0)
    const t = new Date(), md = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const mm = ((e.data ?? []) as any[]).filter(r => r.taken_on.slice(5) === md && +r.taken_on.slice(0, 4) < t.getFullYear())
    setMemo(mm); if (mm.length) attach(mm)
  }, [attach])
  useEffect(() => { purgeOld().finally(loadMeta) }, [loadMeta])
  useEffect(() => { if (new URLSearchParams(location.search).get('memories')) setShow(true) }, [])
  // mở thẳng một khoảnh khắc từ ghim trên bản đồ: /moments?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('open'); if (!id) return
    sb.from('moments').select(SEL).eq('id', id).is('deleted_at', null).maybeSingle().then(r => { if (r.data) { attach([r.data]); setView(r.data) } })
  }, [attach])

  // mở form sửa từ liên kết /moments?edit=<id> (sau khi tạo nhanh từ Kế hoạch)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('edit'); if (!id) return
    sb.from('moments').select(SEL).eq('id', id).is('deleted_at', null).maybeSingle().then(r => { if (r.data) { attach([r.data]); setForm({ ...r.data, albumIds: (r.data.album_moments ?? []).map((x: any) => x.album_id) }) } })
    history.replaceState(null, '', '/moments')
  }, [attach])

  const refresh = async () => { await Promise.all([load(), loadMeta()]) }
  // nếu đang xem chi tiết thì cập nhật số tim/bình luận trong danh sách
  const changed = async () => { await refresh() }

  const del = async (m: any) => {
    if (!confirm('Xóa khoảnh khắc này? Có thể khôi phục trong 30 ngày.')) return
    if (!await ok(sb.from('moments').update({ deleted_at: new Date().toISOString() }).eq('id', m.id), 'Không xóa được')) return
    setView(null); lenRef.current = Math.max(0, lenRef.current - 1); setList(a => a.filter(x => x.id !== m.id)); loadMeta()
  }

  // MOM-09: tải toàn bộ ảnh/video về dạng zip
  const downloadAll = async () => {
    if (zip) return
    setZip('Đang chuẩn bị…')
    try {
      const { data, error } = await sb.from('moments').select('title,taken_on,media(path,kind,sort)').is('deleted_at', null).order('taken_on')
      if (error) throw error
      const files: { name: string; path: string }[] = []
      for (const m of data ?? []) (m.media as any[]).sort((a, b) => a.sort - b.sort).forEach((x, i) => files.push({ name: `${m.taken_on}-${slug(m.title)}/${String(i + 1).padStart(2, '0')}.${x.path.split('.').pop()}`, path: x.path }))
      if (!files.length) { setZip(''); return alert('Chưa có ảnh hay video nào để tải.') }
      if (files.length > 150 && !confirm(`Có ${files.length} tệp, tải về sẽ mất một lúc và tốn dung lượng điện thoại. Vẫn tải?`)) { setZip(''); return }
      await zipDownload(files, `tdlove-khoanh-khac-${new Date().toISOString().slice(0, 10)}.zip`, (d, n) => setZip(`Đang nén ${d}/${n}…`))
    } catch (e: any) { alert('Không tải được: ' + (e?.message ?? e)) } finally { setZip('') }
  }

  // album
  const renameAlbum = async (a: any) => { const n = prompt('Tên album', a.name)?.trim(); if (n && n !== a.name && await ok(sb.from('albums').update({ name: n }).eq('id', a.id), 'Không đổi được tên')) loadMeta() }
  const delAlbum = async (a: any) => { if (confirm(`Xóa album "${a.name}"? Các khoảnh khắc trong album vẫn được giữ.`) && await ok(sb.from('albums').delete().eq('id', a.id), 'Không xóa được album')) { if (flt.album === a.id) setFlt({ ...flt, album: '' }); loadMeta() } }

  const nf = [flt.year, flt.place, flt.tag, flt.album].filter(Boolean).length
  const set = (k: keyof Filter, v: string) => setFlt(f => ({ ...f, [k]: v }))
  const mkEdit = (m: any) => ({ ...m, albumIds: (m.album_moments ?? []).map((x: any) => x.album_id) })
  const albumOf = (m: any) => (m.album_moments ?? []).map((x: any) => albums.find(a => a.id === x.album_id)?.name).filter(Boolean)
  const groups: [string, any[]][] = []
  for (const m of list) { const g = groups[groups.length - 1]; if (g && g[0] === m.taken_on) g[1].push(m); else groups.push([m.taken_on, [m]]) }

  return <>
    <Head t="Khoảnh khắc"><Link href="/map?layer=moments" className="pill">Bản đồ</Link></Head>
    <div className="b">
      {memo.length > 0 && <div className="k li"><b>Ngày này năm trước</b>{memo.map(m => <div key={m.id} className="s">{m.taken_on.slice(0, 4)}: {m.title}</div>)}
        <button className="pill on" style={{ marginTop: 6 }} onClick={() => setShow(true)}>▶ Xem slideshow</button></div>}

      <div className="row" style={{ flex: 'none' }}>
        <button className={'pill' + (nf ? ' on' : '')} onClick={() => setShowF(!showF)} aria-expanded={showF}>Lọc{nf ? ` (${nf})` : ''}</button>
        <button className="pill" onClick={downloadAll} disabled={!!zip}>{zip || 'Tải tất cả (zip)'}</button>
        <Link className="pill" href="/moments/trash" style={{ textAlign: 'center' }}>Thùng rác{trashN ? ` (${trashN})` : ''}</Link>
      </div>
      {showF && <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row"><label className="s">Năm<select value={flt.year} onChange={e => set('year', e.target.value)} style={{ maxWidth: '100%', width: '100%' }}><option value="">Tất cả</option>{opts.years.map(y => <option key={y}>{y}</option>)}</select></label>
          <label className="s">Thẻ<select value={flt.tag} onChange={e => set('tag', e.target.value)} style={{ maxWidth: '100%', width: '100%' }}><option value="">Tất cả</option>{opts.tags.map(t => <option key={t} value={t}>{TAG_EMOJI[t] ?? '🏷️'} {t}</option>)}</select></label></div>
        <label className="s">Địa điểm<select value={flt.place} onChange={e => set('place', e.target.value)} style={{ maxWidth: '100%', width: '100%' }}><option value="">Tất cả</option>{opts.places.map(p => <option key={p}>{p}</option>)}</select></label>
        {nf > 0 && <button className="pill" onClick={() => setFlt({ ...NOF, album: flt.album })}>Bỏ lọc</button>}
      </div>}

      <div className="days" aria-label="Album">
        <button className={'pill' + (!flt.album ? ' on' : '')} onClick={() => set('album', '')}>Tất cả</button>
        {albums.map(a => <button key={a.id} className={'pill' + (flt.album === a.id ? ' on' : '')} onClick={() => set('album', a.id)}>📁 {a.name}</button>)}
      </div>
      {flt.album && (() => { const a = albums.find(x => x.id === flt.album); return a && <div className="row" style={{ flex: 'none' }}><button className="pill" onClick={() => renameAlbum(a)}>Đổi tên album</button><button className="pill" onClick={() => delAlbum(a)}>Xóa album</button></div> })()}

      {!list.length && !loading && <div className="k pe"><b>{nf || flt.album ? 'Không có khoảnh khắc nào khớp' : 'Chưa có khoảnh khắc nào'}</b><div className="s">{nf || flt.album ? 'Thử bỏ bớt bộ lọc nhé.' : 'Bấm dấu + để lưu kỷ niệm đầu tiên của hai đứa.'}</div></div>}

      {groups.map(([d, ms]) => <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="s" style={{ position: 'sticky', top: 0, background: '#FFF0F6', padding: '2px 0', zIndex: 1 }}>{dayLabel(d)}</div>
        {ms.map(m => {
          const md = (m.media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort), nh = (m.moment_hearts ?? []).length, nc = m.moment_comments?.[0]?.count ?? 0
          const myHeart = (m.moment_hearts ?? []).some((h: any) => h.user_id === me.id)
          return <button key={m.id} className="k" style={{ textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setView(m)}>
            {md.length > 0 && <div className="mgrid" style={{ gridTemplateColumns: md.length === 1 ? '1fr' : 'repeat(2,1fr)' }}>
              {md.slice(0, 4).map((x: any, i: number) => {
                const t = thumbs[x.thumb_path ?? (x.kind === 'image' ? x.path : '')]
                return <span key={x.id} className="th" style={md.length === 1 ? { aspectRatio: '16/10' } : undefined}>{t ? <img src={t} alt="" loading="lazy" /> : x.kind === 'video' ? '🎬' : '🖼️'}
                  {x.kind === 'video' && t && <span style={{ position: 'absolute', fontSize: 30 }}>▶️</span>}
                  {i === 3 && md.length > 4 && <span className="more">+{md.length - 4}</span>}</span>
              })}</div>}
            <b>{m.title}</b>
            {m.description && <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.description}</div>}
            <div className="s">{[md.length ? `${md.length} ảnh/video` : '', m.place && `📍 ${m.place}`, ...(m.tags ?? []).map((t: string) => `${TAG_EMOJI[t] ?? '🏷️'} ${t}`)].filter(Boolean).join(' · ')}</div>
            {(nh > 0 || nc > 0) && <div className="s">{nh > 0 && `${myHeart ? '💗' : '🤍'} ${nh}`}{nh > 0 && nc > 0 && '  '}{nc > 0 && `💬 ${nc}`}</div>}
          </button>
        })}
      </div>)}
      {list.length > 0 && more && <div ref={sentinel} style={{ textAlign: 'center' }}><button className="pill" onClick={() => page(false)} disabled={loading}>{loading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
      {list.length > 0 && !more && <div className="s" style={{ textAlign: 'center' }}>Đã xem hết rồi 💗</div>}
    </div>

    <button className="rb fab" onClick={() => setForm('new')} aria-label="Thêm khoảnh khắc">+</button>
    {view && !form && <MomentView m={view} me={me} partner={partner} albumNames={albumOf(view)} plan={plans.find(p => p.id === view.plan_id)}
      onClose={() => setView(null)} onEdit={() => setForm(mkEdit(view))} onDelete={() => del(view)} onChanged={changed} />}
    {form && <MomentForm space={space} moment={form === 'new' ? undefined : form} plans={plans} albums={albums}
      onClose={() => setForm(null)} onAlbumCreated={a => setAlbums(x => [...x, a])}
      onDone={async () => { setForm(null); setView(null); await refresh() }} />}
    {show && <Slideshow moments={memo} onClose={() => setShow(false)} />}
  </>
}
