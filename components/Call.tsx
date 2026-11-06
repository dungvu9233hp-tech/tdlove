'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { notifyPartner } from '@/lib/push'

// CALL-04: STUN + TURN. Không có TURN thì chỉ gọi được khi hai máy cùng mạng/NAT dễ, không đủ cho 4G.
const turn = process.env.NEXT_PUBLIC_TURN_URL
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    ...(turn ? [{ urls: turn.split(',').map(s => s.trim()).filter(Boolean), username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS }] : []),
  ],
}
type St = 'idle' | 'calling' | 'incoming' | 'live'
const RING = 30000, INCOMING = 35000, CONNECT = 20000, LOST = 10000 // ms
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
// Độ phân giải vừa phải cho máy đời cũ (Oppo F5)
const cam = (face: string): MediaTrackConstraints => ({ facingMode: { ideal: face }, width: { ideal: 640 }, height: { ideal: 480 } })
const stopStream = (m?: MediaStream | null) => m?.getTracks().forEach(t => t.stop())
const permMsg = () => window.isSecureContext && navigator.mediaDevices
  ? 'Không mở được micro/camera. Hãy cho phép quyền truy cập trong trình duyệt.'
  : 'Trình duyệt này không cho dùng micro/camera. Hãy mở app bằng địa chỉ https.'

// Cuộc gọi 1-1 qua WebRTC; tín hiệu đi qua Supabase Realtime (broadcast). Gọi đến hiện khi app đang mở; nếu app đang đóng thì thông báo đẩy mở app và app hỏi bảng calls (phase21.sql).
export default function Call() {
  const { me, space, partner } = useApp()
  const [st, setSt] = useState<St>('idle'); const [video, setVideo] = useState(true)
  const [mic, setMic] = useState(true); const [camOn, setCamOn] = useState(true); const [secs, setSecs] = useState<number | null>(null)
  const [spk, setSpk] = useState(false); const [lost, setLost] = useState(false); const [msg, setMsg] = useState('')
  const ch = useRef<any>(null), pc = useRef<RTCPeerConnection | null>(null), local = useRef<MediaStream | null>(null), pend = useRef<RTCIceCandidateInit[]>([])
  const lv = useRef<HTMLVideoElement>(null), rv = useRef<HTMLVideoElement>(null)
  const S = useRef<any>({ st: 'idle', caller: false, video: true, t0: 0, tick: 0, face: 'user', busy: false, yielded: false, flip: false, ring: 0, conn: 0, lost: 0, note: 0, callP: null as Promise<string | null> | null })
  const send = (event: string, data: any = {}) => ch.current?.send({ type: 'broadcast', event, payload: { from: me.id, ...data } })
  const go = (s: St) => { S.current.st = s; setSt(s); if (s !== 'incoming') navigator.vibrate?.(0) }
  // T7: người gọi ghi/đóng dòng trong bảng calls để bên nhận đang đóng app vẫn thấy cuộc gọi khi mở app
  const closeCall = (status: 'accepted' | 'ended') => {
    const p = S.current.callP; if (!p) return
    if (status === 'ended') S.current.callP = null
    p.then((id: string | null) => { if (id) sb.from('calls').update({ status }).eq('id', id).then(() => { }, () => { }) })
  }
  const flash = (t: string) => { setMsg(t); clearTimeout(S.current.note); S.current.note = setTimeout(() => setMsg(''), 5000) }

  useEffect(() => { if (lv.current) lv.current.srcObject = local.current }, [st])

  // CALL-01/03: xin micro (+ camera nếu gọi video)
  async function media(v: boolean) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: v ? cam(S.current.face) : false })
  }
  async function flush() {
    for (const c of pend.current) { try { await pc.current?.addIceCandidate(c) } catch (e) { console.warn('ice', e) } }
    pend.current = []
  }
  const clearTimers = () => { const s = S.current; clearTimeout(s.ring); clearTimeout(s.conn); clearTimeout(s.lost) }
  function makePc() {
    const c = new RTCPeerConnection(ICE); pc.current = c
    local.current?.getTracks().forEach(t => c.addTrack(t, local.current!))
    c.onicecandidate = e => { if (e.candidate) send('ice', { c: e.candidate.toJSON() }) }
    c.ontrack = e => { const r = rv.current; if (!r) return; r.srcObject = e.streams[0]; r.play().catch(() => { }) }
    c.onconnectionstatechange = () => {
      if (pc.current !== c) return
      const k = c.connectionState, s = S.current
      if (k === 'connected') { clearTimeout(s.lost); setLost(false); connected() }
      else if (k === 'disconnected') { setLost(true); clearTimeout(s.lost); s.lost = setTimeout(() => end(true, 'failed'), LOST) } // mạng chập chờn: chờ tự nối lại
      else if (k === 'failed') end(true, 'failed')
    }
    return c
  }
  function connected() {
    const s = S.current
    if (s.t0) return
    clearTimeout(s.ring); clearTimeout(s.conn); s.t0 = Date.now(); go('live'); setSecs(0)
    s.tick = setInterval(() => setSecs(Math.round((Date.now() - s.t0) / 1000)), 1000)
  }
  function stopAll() {
    const s = S.current; clearTimers(); clearInterval(s.tick); s.t0 = 0
    pc.current?.close(); pc.current = null; stopStream(local.current); local.current = null; pend.current = []
    setSecs(null); setLost(false); setSpk(false)
  }
  function end(notify: boolean, reason = '') {
    const s = S.current
    if (s.st === 'idle') return
    if (notify) send('hangup')
    if (s.caller) closeCall('ended')
    const dur = s.t0 ? Math.round((Date.now() - s.t0) / 1000) : 0
    if (s.caller) { // người gọi ghi lại vào chat: thời lượng, nhỡ, bị từ chối hoặc không kết nối được
      const body = dur ? `Cuộc gọi ${s.video ? 'video' : 'thoại'} ${clock(dur)}` : reason === 'rejected' ? 'Cuộc gọi bị từ chối' : reason === 'failed' ? 'Cuộc gọi không kết nối được' : 'Cuộc gọi nhỡ'
      sb.from('messages').insert({ space_id: space.id, body }).then((r: { error: { message: string } | null }) => { if (r.error) console.warn('call log', r.error.message) })
    }
    stopAll(); go('idle')
    if (reason === 'rejected') flash('Người ấy đã từ chối cuộc gọi.')
    else if (reason === 'failed') flash('Không kết nối được. Hãy kiểm tra mạng của cả hai máy.')
    else if (!dur && !s.caller && !notify) flash('Bạn vừa lỡ một cuộc gọi.')
  }

  // T7: có cuộc gọi đang đổ chuông mà lời mời broadcast đã lỡ (bên nhận vừa mở app từ thông báo đẩy)
  async function checkRinging() {
    const s = S.current
    if (s.st !== 'idle' || s.busy) return
    const { data, error } = await sb.rpc('ringing_call')
    const c = (data as { id: string; video: boolean; left_ms: number }[] | null)?.[0]
    if (error || !c || S.current.st !== 'idle') return
    s.video = !!c.video; s.caller = false; setVideo(s.video); go('incoming')
    navigator.vibrate?.([400, 200, 400, 200, 400])
    clearTimeout(s.ring); s.ring = setTimeout(() => end(false, 'missed'), c.left_ms + 3000)
  }

  // CALL-01: người gọi bấm Gọi/Video
  async function start(v: boolean) {
    const s = S.current
    if (s.st !== 'idle' || s.busy) return
    s.busy = true; s.yielded = false; s.video = v; s.caller = true; setVideo(v); setCamOn(v); setMic(true)
    let m: MediaStream
    try { m = await media(v) } catch { s.busy = false; return flash(permMsg()) }
    s.busy = false
    if (s.yielded || s.st !== 'idle') return stopStream(m) // hai người gọi cùng lúc và mình đã nhường
    local.current = m; go('calling'); send('invite', { video: v }); notifyPartner('call')
    s.callP = Promise.resolve(sb.from('calls').insert({ video: v }).select('id').single()).then((r: any) => r.data?.id ?? null, () => null) // CALL-05: báo cả khi bên kia đang đóng app
    s.ring = setTimeout(() => end(true, 'missed'), RING)
  }
  // CALL-02: người nhận bấm Nhận
  async function accept() {
    const s = S.current
    if (s.st !== 'incoming') return
    clearTimeout(s.ring); setCamOn(s.video); setMic(true)
    let m: MediaStream
    try { m = await media(s.video) } catch { flash(permMsg()); return reject() }
    if (S.current.st !== 'incoming') return stopStream(m) // người gọi đã cúp trong lúc mình đang cấp quyền
    local.current = m; go('live'); send('accept')
    s.conn = setTimeout(() => end(true, 'failed'), CONNECT)
  }
  function reject() { clearTimers(); send('reject'); stopAll(); go('idle') }

  useEffect(() => {
    const c = sb.channel('call-' + space.id, { config: { private: true, broadcast: { self: false } } }); ch.current = c
    const safe = (f: (p: any) => Promise<void> | void) => async (m: any) => { try { await f(m.payload) } catch (e) { console.error('call', e); end(true, 'failed') } }
    c.on('broadcast', { event: 'invite' }, safe(p => {
      const s = S.current
      if (s.st === 'incoming') return
      if (s.st === 'live') return send('reject') // đang bận cuộc gọi khác
      if (s.st === 'calling' || s.busy) { // hai người bấm gọi cùng lúc: id nhỏ hơn giữ vai người gọi, bên kia nhường
        if (me.id < p.from) return
        s.yielded = true; if (s.st === 'calling') { stopAll() }
      }
      s.video = !!p.video; s.caller = false; setVideo(s.video); go('incoming')
      navigator.vibrate?.([400, 200, 400, 200, 400])
      clearTimeout(s.ring); s.ring = setTimeout(() => end(false, 'missed'), INCOMING) // người gọi tắt tab mà không báo
    })).on('broadcast', { event: 'accept' }, safe(async () => {
      const s = S.current
      if (s.st !== 'calling' || pc.current) return
      clearTimeout(s.ring); go('live'); closeCall('accepted'); s.conn = setTimeout(() => end(true, 'failed'), CONNECT)
      const p = makePc(); const o = await p.createOffer(); await p.setLocalDescription(o); send('offer', { sdp: o })
    })).on('broadcast', { event: 'offer' }, safe(async p => {
      if (S.current.st !== 'live' || pc.current) return
      const x = makePc(); await x.setRemoteDescription(p.sdp); await flush()
      const a = await x.createAnswer(); await x.setLocalDescription(a); send('answer', { sdp: a })
    })).on('broadcast', { event: 'answer' }, safe(async p => {
      if (pc.current?.signalingState !== 'have-local-offer') return
      await pc.current.setRemoteDescription(p.sdp); await flush()
    })).on('broadcast', { event: 'ice' }, safe(async p => {
      if (pc.current?.remoteDescription) await pc.current.addIceCandidate(p.c); else if (S.current.st !== 'idle') pend.current.push(p.c)
    })).on('broadcast', { event: 'reject' }, safe(() => end(false, 'rejected')))
      .on('broadcast', { event: 'hangup' }, safe(() => end(false)))
      .subscribe((status: string, err?: Error) => { if (status === 'SUBSCRIBED') checkRinging(); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('Kênh cuộc gọi lỗi (đã chạy phase4.sql chưa?)', status, err?.message) })
    const onStart = (e: any) => start(!!e.detail?.video)
    const onLeave = () => { if (S.current.st !== 'idle') send('hangup') } // đóng tab giữa cuộc gọi: báo cho bên kia
    const onVis = () => { if (document.visibilityState === 'visible') checkRinging() }
    window.addEventListener('tdlove-call', onStart); window.addEventListener('pagehide', onLeave); document.addEventListener('visibilitychange', onVis)
    if (!turn) console.warn('Chưa cấu hình NEXT_PUBLIC_TURN_URL: gọi qua 4G có thể không kết nối được (CALL-04).')
    return () => { window.removeEventListener('tdlove-call', onStart); window.removeEventListener('pagehide', onLeave); document.removeEventListener('visibilitychange', onVis); sb.removeChannel(c); stopAll() }
  }, [space.id])

  // CALL-03: bật/tắt mic, camera
  const toggle = (kind: 'audio' | 'video') => {
    const t = (kind === 'audio' ? local.current?.getAudioTracks() : local.current?.getVideoTracks())?.[0]
    if (t) { t.enabled = !t.enabled; kind === 'audio' ? setMic(t.enabled) : setCamOn(t.enabled) }
  }
  // CALL-03: đổi camera trước/sau. Máy Android đời cũ chỉ mở được một camera mỗi lúc nên phải tắt camera cũ trước.
  async function swap(face: string, on: boolean) {
    const nt = (await navigator.mediaDevices.getUserMedia({ video: cam(face) })).getVideoTracks()[0]
    nt.enabled = on
    await pc.current?.getSenders().find(x => x.track?.kind === 'video')?.replaceTrack(nt)
    const m = local.current; m?.getVideoTracks().forEach(t => m.removeTrack(t)); m?.addTrack(nt)
    if (lv.current) lv.current.srcObject = m
  }
  async function flip() {
    const s = S.current, old = local.current?.getVideoTracks()[0]
    if (!old || s.flip) return
    s.flip = true; const on = old.enabled, next = s.face === 'user' ? 'environment' : 'user'
    old.stop()
    try { await swap(next, on); s.face = next }
    catch { try { await swap(s.face, on); flash('Không đổi được camera.') } catch { flash('Không mở lại được camera. Hãy tắt rồi bật lại camera.') } }
    finally { s.flip = false }
  }
  // CALL-03: loa ngoài. Chrome Android cho chọn thiết bị âm thanh ra; Safari iOS thì không, hệ điều hành tự chọn loa.
  async function speaker() {
    const el: any = rv.current
    if (!el?.setSinkId) return flash('Máy này tự chọn loa. Hãy dùng nút âm lượng hoặc trung tâm điều khiển của máy.')
    try {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput')
      const sp = outs.find(d => /speaker|loa/i.test(d.label)) ?? outs.find(d => d.deviceId === 'default')
      await el.setSinkId(spk ? 'default' : (sp?.deviceId ?? 'default')); setSpk(!spk)
    } catch { flash('Không đổi được loa trên trình duyệt này.') }
  }

  if (st === 'idle') return msg ? <div role="status" className="k" style={{ position: 'fixed', left: 18, right: 18, bottom: 'calc(96px + env(safe-area-inset-bottom))', zIndex: 2000, textAlign: 'center', maxWidth: 444, margin: '0 auto' }}>{msg}</div> : null
  const name = partner?.display_name ?? 'Người ấy'
  return <div className="call" role="dialog" aria-label="Cuộc gọi">
    <video ref={rv} autoPlay playsInline className={`rv ${video && st === 'live' ? '' : 'hid'}`} />
    <video ref={lv} autoPlay playsInline muted className={`lv ${video && st !== 'incoming' && camOn ? '' : 'hid'}`} />
    <div className="ci" aria-live="polite"><div className="num" style={{ fontSize: 32 }}>{name}</div>
      <div className="s">{st === 'incoming' ? `${name} đang gọi ${video ? 'video' : 'thoại'}…` : st === 'calling' ? 'Đang đổ chuông…' : lost ? 'Mạng yếu, đang thử nối lại…' : secs == null ? 'Đang kết nối…' : clock(secs)}</div>
      {msg && <div className="s" role="status">{msg}</div>}</div>
    <div className="cc">
      {st === 'incoming' ? <><button className="btn" onClick={accept}>Nhận</button><button className="btn" style={{ background: '#fff' }} onClick={reject}>Từ chối</button></> : <>
        <button className={`pill ${mic ? '' : 'on'}`} onClick={() => toggle('audio')}>{mic ? 'Tắt mic' : 'Bật mic'}</button>
        {video && <button className={`pill ${camOn ? '' : 'on'}`} onClick={() => toggle('video')}>{camOn ? 'Tắt camera' : 'Bật camera'}</button>}
        {video && <button className="pill" onClick={flip}>Đổi camera</button>}
        <button className={`pill ${spk ? 'on' : ''}`} onClick={speaker}>{spk ? 'Loa thường' : 'Loa ngoài'}</button>
        <button className="btn" onClick={() => end(true, 'missed')}>Kết thúc</button></>}
    </div>
  </div>
}
