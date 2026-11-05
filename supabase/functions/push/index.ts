// Edge Function `push`: gửi thông báo đẩy đến máy người kia khi có tin nhắn mới, cuộc gọi đến (CHAT-04, CALL-05)
// và các tương tác ở mục Giải trí: thả cảm xúc, bình luận, rủ xem cùng (phase14).
// Gọi từ app bằng supabase.functions.invoke('push', { body: { kind, text, clip } }), kind là một trong KINDS bên dưới.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const KINDS = ['message', 'call', 'clip-react', 'clip-comment', 'together']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
    const { kind, text, clip } = await req.json()
    if (!KINDS.includes(kind)) return reply({ error: 'bad kind' }, 400)

    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('space_id', me.space_id).neq('user_id', u.id)
    const title = me.display_name ?? 'Người ấy', t = String(text ?? '').slice(0, 100)
    const cid = typeof clip === 'string' && UUID.test(clip) ? clip : null
    const msgs: Record<string, { body: string; url: string; tag: string }> = {
      call: { body: 'Đang gọi cho bạn…', url: '/chat', tag: 'call' },
      message: { body: String(text ?? 'Tin nhắn mới').slice(0, 120), url: '/chat', tag: 'msg' },
      'clip-react': { body: `Đã thả ${t || 'cảm xúc'} vào clip`, url: '/fun', tag: 'clip-react' },
      'clip-comment': { body: t ? `Bình luận clip: ${t}` : 'Có bình luận mới ở một clip', url: '/fun', tag: 'clip-comment' },
      together: { body: 'Rủ bạn xem clip cùng nhau, vào ngay nhé!', url: cid ? `/fun?together=${cid}` : '/fun', tag: 'together' },
    }
    const payload = JSON.stringify({ kind, title, ...msgs[kind] })
    let sent = 0
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: kind === 'call' ? 30 : kind === 'together' ? 600 : 3600, urgency: 'high' })
        sent++
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint) // máy đã gỡ đăng ký
        else console.error('push', e?.statusCode, e?.body)
      }
    }
    return reply({ sent })
  } catch (e) { console.error(e); return reply({ error: 'server' }, 500) }
})
