// Edge Function `anniversary`: nhắc ngày đặc biệt (ANNIV-04). Chạy mỗi sáng bằng pg_cron (xem README.md cùng thư mục).
// Nhắc vào ngày đó và trước một ngày: ngày đặc biệt tự thêm, kỷ niệm tròn năm, các mốc 100/200/365... ngày.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const MS = [100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1500, 2000]
const ymd = (d: Date) => d.toISOString().slice(0, 10)   // dùng UTC trên "ngày lịch" đã quy đổi sang giờ Việt Nam
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const vn = new Date(Date.now() + 7 * 36e5)                // giờ Việt Nam (UTC+7)
  const today = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()))
  const { data: spaces } = await admin.from('spaces').select('id,start_date')
  let sent = 0
  for (const sp of spaces ?? []) {
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('space_id', sp.id)
    if (!subs?.length) continue
    const { data: sd } = await admin.from('special_dates').select('name,on_date,yearly').eq('space_id', sp.id)
    const notes: string[] = []
    for (const off of [0, 1]) {
      const day = addDays(today, off), key = ymd(day), md = key.slice(5), when = off ? 'Ngày mai' : 'Hôm nay'
      for (const s of sd ?? []) if (s.yearly ? s.on_date.slice(5) === md : s.on_date === key) notes.push(`${when}: ${s.name}`)
      if (sp.start_date) {
        const n = Math.round((+day - +new Date(sp.start_date + 'T00:00:00Z')) / 864e5) + 1
        if (MS.includes(n)) notes.push(`${when}: ngày thứ ${n} bên nhau`)
        if (sp.start_date.slice(5) === md && +day > +new Date(sp.start_date + 'T00:00:00Z')) notes.push(`${when}: kỷ niệm ${day.getUTCFullYear() - +sp.start_date.slice(0, 4)} năm yêu nhau`)
      }
    }
    if (!notes.length) continue
    const payload = JSON.stringify({ kind: 'anniv', title: 'tdlove', body: notes.join('\n'), url: '/special', tag: 'anniv' })
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 }); sent++ }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); else console.error('anniv', e?.statusCode) }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
