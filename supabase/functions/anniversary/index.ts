// Edge Function `anniversary`: nhắc ngày đặc biệt (ANNIV-04) và nhắc lại kỷ niệm "ngày này năm trước" (DIARY-02).
// Chạy mỗi sáng bằng pg_cron (xem README.md cùng thư mục). Cần đã chạy supabase/phase7.sql (hàm on_this_day).
// Ngày đặc biệt: nhắc vào ngày đó và trước một ngày (ngày đặc biệt tự thêm, kỷ niệm tròn năm, các mốc 100/200/365... ngày).
// Kỷ niệm: nhắc trong ngày, gồm nhật ký và Moment của đúng ngày này các năm trước.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const MS = [100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1500, 2000]
const ymd = (d: Date) => d.toISOString().slice(0, 10)   // dùng UTC trên "ngày lịch" đã quy đổi sang giờ Việt Nam
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)
const MAX_LINES = 3                                       // tối đa số dòng kỷ niệm hiện trong một thông báo

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const vn = new Date(Date.now() + 7 * 36e5)                // giờ Việt Nam (UTC+7)
  const today = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()))

  // DIARY-02: kỷ niệm của ngày hôm nay, gom theo Space (service_role bỏ qua RLS nên tự lọc theo space_id)
  const memos = new Map<string, { kind: string; title: string; day: string }[]>()
  const { data: mm, error: mErr } = await admin.rpc('on_this_day', { d: ymd(today) })
  if (mErr) console.error('on_this_day', mErr.message)   // chưa chạy phase7.sql thì chỉ bỏ qua phần kỷ niệm, vẫn nhắc ngày đặc biệt
  for (const r of mm ?? []) { const a = memos.get(r.space_id) ?? []; a.push(r); memos.set(r.space_id, a) }

  const { data: spaces } = await admin.from('spaces').select('id,start_date')
  let sent = 0
  const push = async (subs: { endpoint: string; p256dh: string; auth: string }[], payload: Record<string, unknown>) => {
    const body = JSON.stringify(payload)
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600 }); sent++ }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); else console.error('anniv', e?.statusCode) }
    }
  }

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
    if (notes.length) await push(subs, { kind: 'anniv', title: 'tdlove', body: notes.join('\n'), url: '/special', tag: 'anniv' })

    // DIARY-02: một thông báo riêng cho kỷ niệm, mở thẳng Trang chủ (nơi có mục "Ngày này năm trước")
    const mem = memos.get(sp.id) ?? []
    if (mem.length) {
      const lines = mem.slice(0, MAX_LINES).map(m => `${today.getUTCFullYear() - +m.day.slice(0, 4)} năm trước: ${m.kind === 'diary' ? '📓' : '📷'} ${m.title}`)
      if (mem.length > MAX_LINES) lines.push(`và ${mem.length - MAX_LINES} kỷ niệm khác`)
      await push(subs, { kind: 'memory', title: 'Ngày này năm trước', body: lines.join('\n'), url: '/', tag: 'memory' })
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
