'use client'
import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import { sign } from '@/lib/media'
import TripPanel, { type Route } from '@/components/TripPanel'
import PlacePicker from '@/components/PlacePicker'
import { loadPoints } from '@/lib/trip'

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => x * Math.PI / 180
  const d = r(b.lat - a.lat), e = r(b.lng - a.lng)
  return 12742 * Math.asin(Math.sqrt(Math.sin(d / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(e / 2) ** 2))
}

const live = (l: any) => !!l && new Date(l.share_until) > new Date()
const ago = (t: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000))
  return s < 60 ? `${s} giây trước` : `${Math.round(s / 60)} phút trước`
}

type MemoryPlace = {
  source: 'moment' | 'journal' | 'plan' | 'journey'
  title: string
  lat: number
  lng: number
  visited_on: string
  ref_id: string
  kind: string
  is_private: boolean
  author: string
  journey_path?: [number, number][]  // [lat, lng][]
  is_start_point?: boolean
}

type PinData = MemoryPlace & {
  order: number
  clusterKey?: string
  merged?: MemoryPlace[]
  is_favorite?: boolean
}

const CHIP_LABELS = [
  { key: '1m', label: '1 tháng', days: 30 },
  { key: '1y', label: '1 năm', days: 365 },
  { key: '2y', label: '2 năm', days: 730 },
  { key: 'love', label: 'Từ ngày yêu', days: null },
] as const

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function getChipDate(key: string, startDate: string | null): Date | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const chip = CHIP_LABELS.find(c => c.key === key)
  if (!chip) return null
  if (chip.key === 'love') {
    if (!startDate) return null
    const d = new Date(startDate + 'T00:00:00')
    d.setHours(0, 0, 0, 0)
    return d
  }
  const target = new Date(today)
  target.setDate(target.getDate() - chip.days!)
  return target
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (x: number) => x * Math.PI / 180
  const d = r(lat2 - lat1), e = r(lng2 - lng1)
  return 12742 * Math.asin(Math.sqrt(Math.sin(d / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(e / 2) ** 2)) * 1000
}

function clusterKey(lat: number, lng: number, zoom: number, cellSize = 60): string {
  // Simple grid clustering based on screen pixels at current zoom
  const scale = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * scale * 256 / cellSize)
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale * 256 / cellSize)
  return `${zoom}:${x}:${y}`
}

function interpolateColor(start: string, end: string, factor: number): string {
  // Simple interpolation between two hex colors
  const s = start.replace('#', '')
  const e = end.replace('#', '')
  const sr = parseInt(s.slice(0, 2), 16), sg = parseInt(s.slice(2, 4), 16), sb = parseInt(s.slice(4, 6), 16)
  const er = parseInt(e.slice(0, 2), 16), eg = parseInt(e.slice(2, 4), 16), eb = parseInt(e.slice(4, 6), 16)
  const r = Math.round(sr + (er - sr) * factor)
  const g = Math.round(sg + (eg - sg) * factor)
  const b = Math.round(sb + (eb - sb) * factor)
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

export default function MapPage() {
  const { me, space, partner } = useApp()
  const router = useRouter()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const L = useRef<any>(null)
  const pins = useRef<Record<string, any>>({})
  const fit = useRef(false)
  const memoryLayer = useRef<any>(null)
  const routeLayer = useRef<any>(null)
  const clusterLayer = useRef<any>(null)

  const [locs, setLocs] = useState<Record<string, any>>({})
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)
  const [, tick] = useState(0)

  // Memory mode state
  const [mode, setMode] = useState<'live' | 'memory'>('live')
  const [selectedChip, setSelectedChip] = useState<'1m' | '1y' | '2y' | 'love'>('1m')
  const [memories, setMemories] = useState<MemoryPlace[]>([])
  const [loadingMemories, setLoadingMemories] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [filteredPins, setFilteredPins] = useState<PinData[]>([])
  const [timelineIndex, setTimelineIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [playTimer, setPlayTimer] = useState<NodeJS.Timeout | null>(null)
  const [missingCount, setMissingCount] = useState(0)
  const [showMissingList, setShowMissingList] = useState(false)
  const [missingMoments, setMissingMoments] = useState<any[]>([])
  const [attachingMomentId, setAttachingMomentId] = useState<string | null>(null)

  const mine = locs[me.id]
  const sharing = live(mine)
  const theirs = partner && live(locs[partner.id]) ? locs[partner.id] : null

  // Load live locations
  useEffect(() => {
    sb.from('locations').select('*').then(r => setLocs(Object.fromEntries((r.data ?? []).map(l => [l.user_id, l]))))
    const ch = sb.channel('loc-' + space.id).on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, p => {
      if (p.eventType === 'DELETE') setLocs(a => { const n = { ...a }; delete n[(p.old as any).user_id]; return n })
      else setLocs(a => ({ ...a, [(p.new as any).user_id]: p.new }))
    }).subscribe()
    const t = setInterval(() => tick(x => x + 1), 5000)
    return () => { sb.removeChannel(ch); clearInterval(t) }
  }, [space.id])

  // Initialize map
  useEffect(() => {
    let dead = false
    ;(async () => {
      const lf = (await import('leaflet')).default
      if (dead || !el.current || map.current) return
      L.current = lf
      map.current = lf.map(el.current, { zoomControl: false }).setView([21.0285, 105.8542], 13)
      lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
      memoryLayer.current = lf.layerGroup().addTo(map.current)
      routeLayer.current = lf.layerGroup().addTo(map.current)
      clusterLayer.current = lf.layerGroup().addTo(map.current)
      setReady(true)
    })()
    return () => { dead = true; map.current?.remove(); map.current = null; pins.current = {}; fit.current = false; setReady(false) }
  }, [])

  // Render live mode pins
  useEffect(() => {
    if (!ready || mode !== 'live') return
    memoryLayer.current?.clearLayers()
    routeLayer.current?.clearLayers()
    clusterLayer.current?.clearLayers()
    const show: Record<string, any> = {}
    if (sharing) show[me.id] = mine
    if (theirs) show[partner.id] = theirs
    Object.keys(pins.current).forEach(k => { if (!show[k]) { pins.current[k].remove(); delete pins.current[k] } })
    Object.entries(show).forEach(([id, l]) => {
      if (pins.current[id]) return pins.current[id].setLatLng([l.lat, l.lng])
      const d = document.createElement('div')
      d.className = 'pin' + (id === me.id ? ' on' : '')
      const who = id === me.id ? me : partner
      d.textContent = [...(String(who.display_name ?? '').trim() || '?')][0].toUpperCase()
      if (who.avatar_url) sign([who.avatar_url]).then(m => {
        const u = m[who.avatar_url]; if (!u) return
        const i = new Image(); i.alt = ''; i.onload = () => { d.textContent = ''; d.appendChild(i) }; i.src = u
      }).catch(() => { })
      pins.current[id] = L.current.marker([l.lat, l.lng], { icon: L.current.divIcon({ className: '', html: d, iconSize: [44, 44] }) }).addTo(map.current)
    })
    const pts = Object.values(show).map((l: any) => [l.lat, l.lng])
    if (!fit.current && pts.length) { fit.current = true; pts.length > 1 ? map.current.fitBounds(pts, { padding: [50, 50] }) : map.current.setView(pts[0], 16) }
  }, [locs, ready, sharing, !!theirs, mode])

  // Load memory places
  const loadMemories = useCallback(async () => {
    if (mode !== 'memory') return
    setLoadingMemories(true)
    setMemoryError('')
    try {
      const from = getChipDate(selectedChip, space.start_date)
      const to = new Date()
      to.setHours(23, 59, 59, 999)
      const { data, error } = await sb.rpc('memory_places', {
        p_from: from?.toISOString().slice(0, 10) || null,
        p_to: to.toISOString().slice(0, 10)
      })
      if (error) throw new Error(error.message)
      setMemories(data ?? [])
    } catch (e: any) {
      setMemoryError(e.message)
    } finally {
      setLoadingMemories(false)
    }
  }, [mode, selectedChip, space.start_date])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  // Load missing count
  useEffect(() => {
    sb.rpc('moments_missing_coords_count').then(r => { if (!r.error) setMissingCount(r.data ?? 0) })
  }, [])

  // Process memories into pins with clustering, merging, ordering
  const processedPins = useMemo(() => {
    if (!memories.length) return []

    // Sort by visited_on asc
    const sorted = [...memories].sort((a, b) => new Date(a.visited_on).getTime() - new Date(b.visited_on).getTime())

    // Count visits per location (for "quán quen" badge - FR-23)
    const visitCounts = new Map<string, number>()
    sorted.forEach(m => {
      const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`
      visitCounts.set(key, (visitCounts.get(key) || 0) + 1)
    })
    const maxVisits = Math.max(...visitCounts.values(), 0)
    const favoriteKey = maxVisits > 1 ? Array.from(visitCounts.entries()).find(([, v]) => v === maxVisits)?.[0] : null

    // Merge nearby points (< 100m)
    const merged: PinData[] = []
    const MERGE_THRESHOLD = 100 // meters

    for (const m of sorted) {
      let found = false
      for (const group of merged) {
        const dist = haversine(group.lat, group.lng, m.lat, m.lng)
        if (dist < MERGE_THRESHOLD) {
          // Add to this group
          if (!group.merged) group.merged = []
          group.merged.push(m)
          // Update position to average
          const all = [group, ...group.merged]
          group.lat = all.reduce((s, p) => s + p.lat, 0) / all.length
          group.lng = all.reduce((s, p) => s + p.lng, 0) / all.length
          found = true
          break
        }
      }
      if (!found) {
        merged.push({ ...m, order: merged.length + 1, merged: undefined })
      }
    }

    // Assign order numbers and favorite badge
    merged.forEach((p, i) => {
      p.order = i + 1
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
      p.is_favorite = key === favoriteKey && maxVisits > 1
    })

    return merged
  }, [memories])

  // Filter pins by timeline index
  const visiblePins = useMemo(() => {
    if (timelineIndex < 0) return processedPins
    return processedPins.filter(p => p.order <= timelineIndex + 1)
  }, [processedPins, timelineIndex])

  // Render memory pins
  useEffect(() => {
    if (!ready || mode !== 'memory') return
    if (!map.current || !L.current) return

    memoryLayer.current?.clearLayers()
    routeLayer.current?.clearLayers()
    clusterLayer.current?.clearLayers()

    const pins = visiblePins
    if (!pins.length) {
      fit.current = false
      return
    }

    // Color gradient: light pink to dark pink
    const START_COLOR = '#FFB3CF' // light pink
    const END_COLOR = '#5B1F3A'   // dark pink

    // Create markers
    pins.forEach((pin, idx) => {
      const factor = pins.length > 1 ? idx / (pins.length - 1) : 1
      const color = interpolateColor(START_COLOR, END_COLOR, factor)

      const d = document.createElement('div')
      d.className = 'pin memory-pin'
      d.style.setProperty('--pin-color', color)
      d.innerHTML = `<span class="pin-number">${pin.order}</span>`
      if (pin.merged && pin.merged.length > 0) {
        d.innerHTML += `<span class="pin-merge">×${pin.merged.length + 1}</span>`
      }
      if (pin.is_favorite) {
        d.innerHTML += `<span class="pin-favorite" title="Nơi đến nhiều nhất">⭐</span>`
      }

      const marker = L.current.marker([pin.lat, pin.lng], {
        icon: L.current.divIcon({ className: '', html: d, iconSize: [44, 44] })
      }).addTo(memoryLayer.current)

      // Popup
      const thumbPromise = sign([pin.kind === 'moment' ? pin.ref_id : ''])
      marker.bindPopup(async () => {
        let thumbUrl = ''
        if (pin.source === 'moment') {
          const { data } = await sb.from('media').select('thumb_path').eq('moment_id', pin.ref_id).eq('kind', 'image').order('sort').limit(1)
          if (data?.[0]?.thumb_path) {
            const urls = await sign([data[0].thumb_path])
            thumbUrl = urls[data[0].thumb_path] || ''
          }
        }
        const sourceLabels: Record<string, string> = {
          moment: '📷 Khoảnh khắc',
          journal: '📓 Nhật ký',
          plan: '🗓️ Kế hoạch',
          journey: '🛤️ Hành trình'
        }
        const box = document.createElement('div')
        box.style.minWidth = '200px'
        if (thumbUrl) {
          const img = document.createElement('img')
          img.src = thumbUrl
          img.alt = ''
          img.style.cssText = 'width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px'
          box.appendChild(img)
        } else {
          const ph = document.createElement('div')
          ph.style.cssText = 'width:100%;height:120px;background:linear-gradient(135deg,'+START_COLOR+','+END_COLOR+');border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px'
          ph.textContent = '📍'
          box.appendChild(ph)
        }
        const title = document.createElement('b')
        title.textContent = pin.title
        box.appendChild(title)
        const meta = document.createElement('div')
        meta.className = 's'
        meta.style.marginTop = '4px'
        meta.textContent = `${sourceLabels[pin.source] || pin.source} · ${new Date(pin.visited_on).toLocaleDateString('vi-VN')}`
        box.appendChild(meta)
        const btn = document.createElement('button')
        btn.className = 'pill on'
        btn.style.marginTop = '8px'
        btn.textContent = pin.source === 'moment' ? 'Mở khoảnh khắc' : pin.source === 'journal' ? 'Mở nhật ký' : pin.source === 'plan' ? 'Mở kế hoạch' : 'Mở hành trình'
        btn.onclick = () => {
          if (pin.source === 'moment') router.push('/moments?open=' + pin.ref_id)
          else if (pin.source === 'journal') router.push('/diary?month=' + pin.visited_on.slice(0, 7) + '&open=' + pin.ref_id)
          else if (pin.source === 'plan') router.push('/plan/' + pin.ref_id)
          else if (pin.source === 'journey') {
            // Trigger trip panel to show this trip
            window.dispatchEvent(new CustomEvent('tdlove-show-trip', { detail: { tripId: pin.ref_id } }))
          }
          map.current.closePopup()
        }
        box.appendChild(btn)
        return box
      })

      // Tooltip
      marker.bindTooltip(`#${pin.order} · ${pin.title}`, { permanent: false, direction: 'top' })
    })

    // Draw connecting lines - use real journey paths where available (FR-14)
    // Group pins by journey to draw real paths
    const journeyGroups = new Map<string, { path: [number, number][]; color: string; pins: PinData[] }>()

    // First pass: collect journey paths
    pins.forEach((pin, idx) => {
      if (pin.source === 'journey' && pin.journey_path && pin.journey_path.length > 1) {
        // Convert [lat, lng] to [lng, lat] for Leaflet? No, our data is [lat, lng]
        // But journey_path from SQL is jsonb with {lat, lng} objects
        const path = pin.journey_path.map((pt: any) => [pt.lat, pt.lng] as [number, number])
        const existing = journeyGroups.get(pin.ref_id)
        if (!existing || (pin.is_start_point && !existing.pins.some(p => p.is_start_point))) {
          // For the start point, use the full path; for end point, we already have it
          journeyGroups.set(pin.ref_id, { path, color: '#5B1F3A', pins: [pin] })
        }
      }
    })

    // Draw real journey paths (solid lines)
    journeyGroups.forEach(({ path }) => {
      if (path.length >= 2) {
        L.current.polyline(path, {
          color: '#5B1F3A',
          weight: 6,
          opacity: 0.8,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(routeLayer.current)
        // Inner highlight line
        L.current.polyline(path, {
          color: '#FF8FB8',
          weight: 3,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(routeLayer.current)
      }
    })

    // Draw connecting lines (dashed) between non-journey pins
    // We need to connect pins in order, but skip segments that are covered by journey paths
    if (pins.length > 1) {
      const linePoints = pins.map(p => [p.lat, p.lng] as [number, number])
      L.current.polyline(linePoints, {
        color: '#5B1F3A',
        weight: 2,
        dashArray: '8, 6',
        opacity: 0.7,
        lineJoin: 'round'
      }).addTo(routeLayer.current)

      // Legend note
      const legend = L.current.control({ position: 'bottomleft' })
      legend.onAdd = () => {
        const div = document.createElement('div')
        div.className = 'k s'
        div.style.cssText = 'background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:6px;font-size:11px;color:#5B1F3A'
        div.innerHTML = '💡 Đường nét đứt: minh hoạ · Đường nét liền: hành trình thật'
        return div
      }
      legend.addTo(map.current)
      ;(routeLayer.current as any)._legend = legend
    }

    // Clustering on zoom
    const updateClusters = () => {
      if (!map.current || !L.current) return
      const zoom = map.current.getZoom()
      if (zoom >= 15) {
        clusterLayer.current?.clearLayers()
        return
      }

      clusterLayer.current?.clearLayers()
      const groups = new Map<string, PinData[]>()

      pins.forEach(pin => {
        const key = clusterKey(pin.lat, pin.lng, zoom)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(pin)
      })

      groups.forEach((groupPins, key) => {
        if (groupPins.length <= 1) return
        const avgLat = groupPins.reduce((s, p) => s + p.lat, 0) / groupPins.length
        const avgLng = groupPins.reduce((s, p) => s + p.lng, 0) / groupPins.length
        const d = document.createElement('div')
        d.className = 'pin cluster-pin'
        d.textContent = groupPins.length.toString()
        const marker = L.current.marker([avgLat, avgLng], {
          icon: L.current.divIcon({ className: '', html: d, iconSize: [44, 44] })
        }).addTo(clusterLayer.current)
        marker.on('click', () => {
          const bounds = L.current.latLngBounds(groupPins.map(p => [p.lat, p.lng] as [number, number]))
          map.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
        })
      })
    }

    map.current.on('zoomend moveend', updateClusters)
    updateClusters()

    // Fit bounds
    if (!fit.current) {
      fit.current = true
      const bounds = L.current.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number]))
      map.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }

    return () => {
      map.current?.off('zoomend moveend', updateClusters)
      ;(routeLayer.current as any)._legend?.remove()
    }
  }, [ready, mode, visiblePins, router])

  // Timeline playback
  const playStep = useCallback(() => {
    if (timelineIndex >= visiblePins.length - 1) {
      setPlaying(false)
      setPlayTimer(null)
      return
    }
    const next = timelineIndex + 1
    setTimelineIndex(next)
    map.current?.flyTo([visiblePins[next].lat, visiblePins[next].lng], map.current.getZoom(), {
      duration: Math.min(2, 0.5 + haversine(visiblePins[next].lat, visiblePins[next].lng, visiblePins[next - 1]?.lat ?? 0, visiblePins[next - 1]?.lng ?? 0) / 50000)
    })
    const timer = setTimeout(playStep, 1500)
    setPlayTimer(timer)
  }, [timelineIndex, visiblePins])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      if (playTimer) { clearTimeout(playTimer); setPlayTimer(null) }
    } else {
      if (timelineIndex >= visiblePins.length - 1) setTimelineIndex(-1)
      setPlaying(true)
      playStep()
    }
  }

  useEffect(() => {
    return () => { if (playTimer) clearTimeout(playTimer) }
  }, [playTimer])

  // Stop playback when changing chip or mode
  useEffect(() => {
    if (mode !== 'memory' || playing) {
      setPlaying(false)
      if (playTimer) { clearTimeout(playTimer); setPlayTimer(null) }
    }
    setTimelineIndex(-1)
    fit.current = false
  }, [mode, selectedChip])

  // Live location push
  const push = async (p: GeolocationPosition, su: string) => {
    const row = { user_id: me.id, space_id: space.id, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, updated_at: new Date().toISOString(), share_until: su }
    const { error } = await sb.from('locations').upsert(row)
    if (error) return setErr(`Không lưu được vị trí: ${error.message}`)
    setLocs(a => ({ ...a, [me.id]: row }))
  }

  useEffect(() => {
    if (!sharing) return
    let last = 0
    const id = navigator.geolocation.watchPosition(p => { if (Date.now() - last < 8000) return; last = Date.now(); push(p, mine.share_until) }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [sharing])

  const start = (h: number) => {
    const su = new Date(); h ? su.setTime(Date.now() + h * 36e5) : su.setHours(23, 59, 59, 0)
    setErr('')
    navigator.geolocation.getCurrentPosition(p => push(p, su.toISOString()), () => setErr('Không lấy được vị trí. Hãy cho phép trang web truy cập vị trí trong cài đặt trình duyệt.'), { enableHighAccuracy: true })
  }
  const stop = async () => {
    const { error } = await sb.from('locations').delete().eq('user_id', me.id)
    if (error) return setErr(`Không tắt được chia sẻ: ${error.message}`)
    setLocs(a => { const n = { ...a }; delete n[me.id]; return n })
  }

  // Spots from plans
  const [spots, setSpots] = useState<any[]>([])
  useEffect(() => { sb.from('stops').select('name,lat,lng,plans!inner(status)').not('lat', 'is', null).in('plans.status', ['Ý tưởng', 'Đã chốt']).limit(60).then(r => setSpots(r.data ?? [])) }, [])
  useEffect(() => {
    if (!ready || mode !== 'live') return
    const g = L.current.layerGroup().addTo(map.current)
    spots.forEach(s => L.current.circleMarker([s.lat, s.lng], { radius: 8, color: '#5B1F3A', weight: 2.5, fillColor: '#FFB3CF', fillOpacity: 1 }).bindTooltip(s.name).addTo(g))
    return () => { g.remove() }
  }, [ready, spots, mode])

  // Moments on map (live mode)
  const [moms, setMoms] = useState<any[]>([]); const [showMoms, setShowMoms] = useState(true)
  useEffect(() => { sb.from('moments').select('id,title,taken_on,place,lat,lng').is('deleted_at', null).not('lat', 'is', null).limit(500).then(r => setMoms(r.data ?? [])) }, [])
  useEffect(() => {
    if (!ready || !showMoms || mode !== 'live') return
    const g = L.current.layerGroup().addTo(map.current)
    moms.forEach(m => {
      const box = document.createElement('div')
      const t = document.createElement('b'); t.textContent = m.title; box.appendChild(t)
      const d = document.createElement('div'); d.textContent = new Date(m.taken_on).toLocaleDateString('vi-VN') + (m.place ? ' · ' + m.place : ''); box.appendChild(d)
      const bt = document.createElement('button'); bt.className = 'pill on'; bt.textContent = 'Xem khoảnh khắc'; bt.onclick = () => router.push('/moments?open=' + m.id); box.appendChild(bt)
      L.current.circleMarker([m.lat, m.lng], { radius: 10, color: '#5B1F3A', weight: 2.5, fillColor: '#EBDDFF', fillOpacity: 1 }).bindPopup(box).bindTooltip('♥ ' + m.title).addTo(g)
    })
    if (!fit.current && moms.length && !Object.keys(pins.current).length) { fit.current = true; map.current.fitBounds(moms.map(m => [m.lat, m.lng]), { padding: [50, 50], maxZoom: 15 }) }
    return () => { g.remove() }
  }, [ready, moms, showMoms, mode])

  // Trip route
  const [route, setRoute] = useState<Route | null>(null)
  useEffect(() => {
    if (!ready || !route || mode !== 'live') return
    const g = L.current.layerGroup().addTo(map.current), ll = route.points
    L.current.polyline(ll, { color: '#5B1F3A', weight: 8, opacity: 0.9, lineJoin: 'round' }).addTo(g)
    L.current.polyline(ll, { color: route.mine ? '#FF8FB8' : '#B58CF0', weight: 4, lineJoin: 'round' }).addTo(g)
    L.current.circleMarker(ll[0], { radius: 9, color: '#5B1F3A', weight: 2.5, fillColor: '#fff', fillOpacity: 1 }).bindTooltip('Điểm đầu · ' + route.name).addTo(g)
    L.current.circleMarker(ll[ll.length - 1], { radius: 9, color: '#5B1F3A', weight: 2.5, fillColor: '#FF8FB8', fillOpacity: 1 }).bindTooltip('Điểm cuối').addTo(g)
    fit.current = true; map.current.fitBounds(ll, { padding: [40, 40] })
    return () => { g.remove() }
  }, [ready, route, mode])

  // Listen for trip show event from memory popup
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { tripId } = e.detail
      sb.from('trips').select('*').eq('id', tripId).single().then(r => {
        if (r.data) {
          setMode('live')
          loadPoints(r.data.id).then(points => {
            setRoute({ points, name: r.data.name, mine: r.data.user_id === me.id })
          })
        }
      })
    }
    window.addEventListener('tdlove-show-trip', handler as EventListener)
    return () => window.removeEventListener('tdlove-show-trip', handler as EventListener)
  }, [])

  // Trip panel in live mode
  const [tripPanelOpen, setTripPanelOpen] = useState(false)

  const dist = sharing && theirs ? km(mine, theirs) : null

  // Missing moments list
  const loadMissingMoments = async () => {
    const { data } = await sb.rpc('moments_missing_coords', { p_limit: 50, p_offset: 0 })
    setMissingMoments(data ?? [])
    setShowMissingList(true)
  }

  const attachLocation = async (momentId: string, place: { lat: number; lng: number; name: string }) => {
    setAttachingMomentId(momentId)
    const { error } = await sb.rpc('set_moment_location', { p_moment_id: momentId, p_lat: place.lat, p_lng: place.lng, p_place: place.name })
    setAttachingMomentId(null)
    if (error) return alert(error.message)
    loadMissingMoments()
    loadMemories()
  }

  return <>
    <Head t="Bản đồ">
      {mode === 'live' && sharing && <span className="pill on">Đang chia sẻ</span>}
      {mode === 'live' && <button className={'pill' + (showMoms ? ' on' : '')} onClick={() => setShowMoms(!showMoms)} aria-pressed={showMoms}>♥ Khoảnh khắc ({moms.length})</button>}
    </Head>
    <div className="b">
      <div ref={el} className="mapbox" />
      {err && <div className="k pe s" role="alert">{err}</div>}
      {memoryError && mode === 'memory' && <div className="k pe s" role="alert">{memoryError}</div>}

      {/* Mode tabs */}
      <div className="k pk" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={'pill' + (mode === 'live' ? ' on' : '')} onClick={() => setMode('live')}>Trực tiếp</button>
        <button className={'pill' + (mode === 'memory' ? ' on' : '')} onClick={() => setMode('memory')}>Kỷ niệm</button>
      </div>

      {/* Live mode UI */}
      {mode === 'live' && <>
        <div className="k pk">
          {sharing ? <>
            <b>Đang chia sẻ vị trí của mình</b>
            <div className="s">Đến {new Date(mine.share_until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
            <button className="pill" onClick={stop}>Tắt chia sẻ</button>
          </> : <>
            <b>Chia sẻ vị trí của mình</b>
            <div className="s">Chỉ cập nhật khi app đang mở</div>
            <div className="row">{([['1 giờ', 1], ['4 giờ', 4], ['Hết hôm nay', 0]] as [string, number][]).map(([l, h]) => <button key={l} className="pill" onClick={() => start(h)}>{l}</button>)}</div>
          </>}
        </div>
        {theirs ? <div className="k">
          <b>{dist == null ? 'Người ấy đang chia sẻ vị trí' : `Cách nhau ${dist < 1 ? Math.round(dist * 1000) + ' m' : dist.toFixed(1).replace('.', ',') + ' km'}`}</b>
          <div className="s">Cập nhật {ago(theirs.updated_at)}, sai số ±{Math.round(theirs.accuracy ?? 0)} m</div>
        </div> : <div className="k"><div className="s">Người ấy chưa chia sẻ vị trí.</div></div>}
        {theirs && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${theirs.lat},${theirs.lng}`} target="_blank" rel="noreferrer">Chỉ đường đến người ấy</a>}
        <TripPanel onShow={setRoute} />
      </>}

      {/* Memory mode UI */}
      {mode === 'memory' && <>
        {/* Time range chips */}
        <div className="k" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {CHIP_LABELS.map(chip => {
            const disabled = chip.key === 'love' && !space.start_date
            return <button
              key={chip.key}
              className={'pill' + (selectedChip === chip.key ? ' on' : '') + (disabled ? ' disabled' : '')}
              onClick={() => !disabled && setSelectedChip(chip.key)}
              disabled={disabled}
              aria-pressed={selectedChip === chip.key}
            >
              {chip.label}
              {disabled && <span className="s" style={{marginLeft:6}}>⚠️ Chưa đặt ngày yêu</span>}
            </button>
          })}
        </div>

        {/* Loading/empty state */}
        {loadingMemories && <div className="k s" style={{textAlign:'center',padding:20}}>Đang tải ký ức…</div>}
        {!loadingMemories && !processedPins.length && <div className="k li" style={{textAlign:'center',padding:20}}>
          <div>Chưa có kỷ niệm nào trong khoảng này</div>
          <div className="s" style={{marginTop:8}}>Thử chọn khoảng thời gian dài hơn hoặc {missingCount > 0 && <button className="pill" onClick={loadMissingMoments}>Gắn vị trí cho {missingCount} kỷ niệm cũ</button>}</div>
        </div>}

        {/* Timeline slider */}
        {processedPins.length > 1 && !loadingMemories && <div className="k pk" style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
            <button className="pill" onClick={togglePlay} disabled={playing && timelineIndex >= processedPins.length - 1}>
              {playing ? '⏸ Tạm dừng' : '▶ Phát lại'}
            </button>
            <span className="s">{timelineIndex + 1} / {processedPins.length}</span>
            <input type="range" min="0" max={processedPins.length - 1} value={Math.max(0, timelineIndex)} onChange={e => setTimelineIndex(+e.target.value)} style={{flex:1}} />
          </div>
          <div className="s" style={{color:'#5B1F3A'}}>Kéo để xem dòng chảy thời gian · Nét đứt: minh hoạ · Nét liền: hành trình thật</div>
        </div>}

        {/* Synced list */}
        {processedPins.length > 0 && !loadingMemories && <div className="k li" style={{marginTop:12, maxHeight: 400, overflow: 'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <b>Danh sách kỷ niệm ({processedPins.length})</b>
            <span className="s">{timelineIndex >= 0 ? `Đã xem ${timelineIndex + 1} / ${processedPins.length}` : 'Kéo thanh thời gian để lọc'}</span>
          </div>
          {processedPins.map((pin, idx) => (
            <MemoryListItem
              key={pin.ref_id}
              pin={pin}
              idx={idx}
              isVisible={idx <= timelineIndex}
              isActive={idx === timelineIndex}
              timelineIndex={timelineIndex}
              onClick={() => {
                setTimelineIndex(idx)
                map.current?.flyTo([pin.lat, pin.lng], 16)
                const markers = Object.values((memoryLayer.current as any)?._layers || {})
                markers.forEach((m: any) => {
                  if (m._latlng?.lat === pin.lat && m._latlng?.lng === pin.lng) m.openPopup()
                })
              }}
            />
          ))}
        </div>}

        {/* Missing moments modal/list */}
        {showMissingList && missingMoments.length > 0 && (
          <div className="k li" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div className="k" style={{background:'white',borderRadius:16,padding:20,width:'100%',maxWidth:400,maxHeight:'80vh',overflow:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <b>Gắn vị trí cho {missingMoments.length} kỷ niệm cũ</b>
                <button className="pill" onClick={() => setShowMissingList(false)}>✕</button>
              </div>
              {missingMoments.map(m => (
                <div key={m.id} className="k" style={{display:'flex',flexDirection:'column',gap:8,padding:12,borderRadius:12,background:'#fafafa',marginBottom:12}}>
                  {m.thumb_path && (
                    <div style={{position:'relative'}}>
                      <img src={m.thumb_path} alt="" style={{width:'100%',height:160,objectFit:'cover', borderRadius:8}} />
                    </div>
                  )}
                  <b>{m.title}</b>
                  <div className="s">{new Date(m.taken_on).toLocaleDateString('vi-VN')}{m.place ? ' · ' + m.place : ''}</div>
                  <PlacePicker onClose={() => {}} onPick={place => attachLocation(m.id, place)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </>}
    </div>
  </>
}

// MemoryListItem component - extracted to avoid useState in map loop
function MemoryListItem({ pin, idx, isVisible, isActive, timelineIndex, onClick }: {
  pin: PinData
  idx: number
  isVisible: boolean
  isActive: boolean
  timelineIndex: number
  onClick: () => void
}) {
  const [showMergedDates, setShowMergedDates] = useState(false)
  const sourceLabels: Record<string, string> = {
    moment: '📷', journal: '📓', plan: '🗓️', journey: '🛤️'
  }

  return <div
    id={`memory-list-${pin.ref_id}`}
    className={'k s' + (!isVisible ? ' disabled' : '') + (pin.merged ? ' merged' : '')}
    style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      borderRadius: 8, cursor: 'pointer',
      background: isVisible ? 'rgba(91,31,58,0.05)' : 'transparent',
      opacity: isVisible ? 1 : 0.4,
      border: isActive ? '2px solid #5B1F3A' : 'none',
      padding: '8px 10px'
    }}
    onClick={pin.merged ? () => setShowMergedDates(!showMergedDates) : onClick}
  >
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontWeight:'bold',color:'#5B1F3A',minWidth:28}}>#{pin.order}</span>
      {pin.merged && <span className="pin-merge" style={{fontSize:12,background:'#FFB3CF',color:'#5B1F3A',padding:'2px 6px',borderRadius:999}}>×{pin.merged.length + 1}</span>}
      <span style={{fontSize:16}}>{sourceLabels[pin.source] || '📍'}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{pin.title}</div>
        <div className="s" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{new Date(pin.visited_on).toLocaleDateString('vi-VN')} · {pin.source}</div>
      </div>
      {pin.merged && <span className="s" style={{color:'#888'}}>{showMergedDates ? '▲ Thu gọn' : '▼ Xem các ngày'}</span>}
    </div>
    {pin.merged && showMergedDates && (
      <div style={{marginLeft:36,display:'flex',flexDirection:'column',gap:4,paddingTop:4,borderTop:'1px dashed #FFB3CF'}}>
        {pin.merged!.map((mp, mi) => (
          <button key={mi} className="k s" style={{textAlign:'left',padding:'6px 8px',borderRadius:6,background:'#fff',border:'1px solid #FFD9E8',cursor:'pointer',width:'100%'}}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
          >
            <div style={{fontWeight:500}}>{mp.title}</div>
            <div className="s">{new Date(mp.visited_on).toLocaleDateString('vi-VN')} · {sourceLabels[mp.source] || mp.source}</div>
          </button>
        ))}
      </div>
    )}
  </div>
}