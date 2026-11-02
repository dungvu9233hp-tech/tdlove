// Edge Function `push`: gửi thông báo đẩy đến máy người kia khi có tin nhắn mới hoặc cuộc gọi đến (CHAT-04, CALL-05).
// Gọi từ app bằng supabase.functions.invoke('push', { body: { kind: 'message' | 'call', text } }).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    // Xác thực người gọi bằng JWT của chính họ, rồi đọc hồ sơ qua RLS để biết họ thuộc Space nào
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user: u } } = await user.auth.getUser()
    if (!u) return reply({ error: 'unauthorized' }, 401)
    const { data: me } = await user.from('profiles').select('space_id,display_name').eq('id', u.id).maybeSingle()
    if (!me?.space_id) return reply({ error: 'no space' }, 403)
    const { kind, text } = await req.json()
    if (kind !== 'message' && kind !== 'call') return reply({ error: 'bad kind' }, 400)

    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('space_id', me.space_id).neq('user_id', u.id)
    const payload = JSON.stringify(kind === 'call'
      ? { kind, title: me.display_name ?? 'Người ấy', body: 'Đang gọi cho bạn…', url: '/chat', tag: 'call' }
      : { kind, title: me.display_name ?? 'Người ấy', body: String(text ?? 'Tin nhắn mới').slice(0, 120), url: '/chat', tag: 'msg' })
    let sent = 0
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: kind === 'call' ? 30 : 3600, urgency: 'high' })
        sent++
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint) // máy đã gỡ đăng ký
        else console.error('push', e?.statusCode, e?.body)
      }
    }
    return reply({ sent })
  } catch (e) { console.error(e); return reply({ error: 'server' }, 500) }
})
