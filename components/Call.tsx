'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'

const turn = process.env.NEXT_PUBLIC_TURN_URL
const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...(turn ? [{ urls: turn.split(',').map(s => s.trim()), username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS }] : [])] }
type St = 'idle' | 'calling' | 'incoming' | 'live'
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Cuộc gọi 1-1 qua WebRTC; tín hiệu đi qua Supabase Realtime (broadcast). Gọi đến chỉ hiện khi app đang mở.
export default function Call() {
  const { me, space, partner } = useApp()
  const [st, setSt] = useState<St>('idle'); const [video, setVideo] = useState(true)
  const [mic, setMic] = useState(true); const [cam, setCam] = useState(true); const [secs, setSecs] = useState<number | null>(null)
  const ch = useRef<any>(null), pc = useRef<RTCPeerConnection | null>(null), local = useRef<MediaStream | null>(null), pend = useRef<any[]>([])
  const lv = useRef<HTMLVideoElement>(null), rv = useRef<HTMLVideoElement>(null)
  const S = useRef<any>({ st: 'idle', caller: false, video: true, t0: 0, timer: 0, tick: 0, face: 'user' })
  const send = (event: string, data: any = {}) => ch.current?.send({ type: 'broadcast', event, payload: { from: me.id, ...data } })
  const go = (s: St) => { S.current.st = s; setSt(s) }

  useEffect(() => { if (lv.current) lv.current.srcObject = local.current }, [st])

  async function media(v: boolean) {
    local.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: v ? { facingMode: S.current.face } : false })
  }
  async function flush() { for (const c of pend.current) await pc.current?.addIceCandidate(c); pend.current = [] }
  function makePc() {
    const c = new RTCPeerConnection(ICE); pc.current = c
    local.current?.getTracks().forEach(t => c.addTrack(t, local.current!))
    c.onicecandidate = e => { if (e.candidate) send('ice', { c: e.candidate.toJSON() }) }
    c.ontrack = e => { if (rv.current) rv.current.srcObject = e.streams[0] }
    c.onconnectionstatechange = () => { if (c.connectionState === 'connected') connected(); if (c.connectionState === 'failed') end(true, 'failed') }
    return c
  }
  function connected() {
    if (S.current.t0) return
    clearTimeout(S.current.timer); S.current.t0 = Date.now(); go('live'); setSecs(0)
    S.current.tick = setInterval(() => setSecs(Math.round((Date.now() - S.current.t0) / 1000)), 1000)
  }
  function stopAll() {
    clearTimeout(S.current.timer); clearInterval(S.current.tick); S.current.t0 = 0
    pc.current?.close(); pc.current = null; local.current?.getTracks().forEach(t => t.stop()); local.current = null; pend.current = []; setSecs(null)
  }
  function end(notify: boolean, reason = '') {
    if (S.current.st === 'idle') return
    if (notify) send('hangup')
    const dur = S.current.t0 ? Math.round((Date.now() - S.current.t0) / 1000) : 0
    if (S.current.caller) { // người gọi ghi lại vào chat: thời lượng, nhỡ hoặc bị từ chối
      const body = dur ? `Cuộc gọi ${S.current.video ? 'video' : 'thoại'} ${clock(dur)}` : reason === 'rejected' ? 'Cuộc gọi bị từ chối' : 'Cuộc gọi nhỡ'
      sb.from('messages').insert({ space_id: space.id, body })
    }
    stopAll(); go('idle')
  }
  async function start(v: boolean) {
    if (S.current.st !== 'idle') return
    S.current.video = v; S.current.caller = true; setVideo(v); setCam(v); setMic(true)
    try { await media(v) } catch { alert('Không mở được micro/camera. Hãy cho phép quyền truy cập trong trình duyệt.'); return }
    go('calling'); send('invite', { video: v })
    S.current.timer = setTimeout(() => end(true, 'missed'), 30000)
  }
  async function accept() {
    setCam(S.current.video); setMic(true)
    try { await media(S.current.video) } catch { alert('Không mở được micro/camera.'); return reject() }
    go('live'); send('accept')
  }
  const reject = () => { send('reject'); go('idle') }

  useEffect(() => {
    const c = sb.channel('call-' + space.id, { config: { broadcast: { self: false } } }); ch.current = c
    c.on('broadcast', { event: 'invite' }, ({ payload }: any) => {
      if (S.current.st !== 'idle') return send('reject')
      S.current.video = payload.video; S.current.caller = false; setVideo(payload.video); go('incoming')
    }).on('broadcast', { event: 'accept' }, async () => {
      if (S.current.st !== 'calling') return
      const p = makePc(); const o = await p.createOffer(); await p.setLocalDescription(o); send('offer', { sdp: o })
    }).on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
      const p = makePc(); await p.setRemoteDescription(payload.sdp); await flush()
      const a = await p.createAnswer(); await p.setLocalDescription(a); send('answer', { sdp: a })
    }).on('broadcast', { event: 'answer' }, async ({ payload }: any) => { await pc.current?.setRemoteDescription(payload.sdp); await flush() })
      .on('broadcast', { event: 'ice' }, async ({ payload }: any) => { if (pc.current?.remoteDescription) await pc.current.addIceCandidate(payload.c); else pend.current.push(payload.c) })
      .on('broadcast', { event: 'reject' }, () => end(false, 'rejected'))
      .on('broadcast', { event: 'hangup' }, () => end(false))
      .subscribe()
    const onStart = (e: any) => start(!!e.detail?.video)
    window.addEventListener('tdlove-call', onStart)
    return () => { window.removeEventListener('tdlove-call', onStart); sb.removeChannel(c); stopAll() }
  }, [space.id])

  const toggle = (kind: 'audio' | 'video') => {
    const t = (kind === 'audio' ? local.current?.getAudioTracks() : local.current?.getVideoTracks())?.[0]
    if (t) { t.enabled = !t.enabled; kind === 'audio' ? setMic(t.enabled) : setCam(t.enabled) }
  }
  async function flip() {
    S.current.face = S.current.face === 'user' ? 'environment' : 'user'
    try {
      const nt = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: S.current.face } })).getVideoTracks()[0]
      await pc.current?.getSenders().find(x => x.track?.kind === 'video')?.replaceTrack(nt)
      local.current?.getVideoTracks().forEach(t => { t.stop(); local.current!.removeTrack(t) }); local.current?.addTrack(nt)
      if (lv.current) lv.current.srcObject = local.current
    } catch { alert('Không đổi được camera.') }
  }

  if (st === 'idle') return null
  const name = partner?.display_name ?? 'Người ấy'
  return <div className="call" role="dialog" aria-label="Cuộc gọi">
    <video ref={rv} autoPlay playsInline className={`rv ${video && st === 'live' ? '' : 'hid'}`} />
    <video ref={lv} autoPlay playsInline muted className={`lv ${video && st !== 'incoming' && cam ? '' : 'hid'}`} />
    <div className="ci"><div className="num" style={{ fontSize: 32 }}>{name}</div>
      <div className="s">{st === 'incoming' ? `${name} đang gọi ${video ? 'video' : 'thoại'}…` : st === 'calling' ? 'Đang đổ chuông…' : secs == null ? 'Đang kết nối…' : clock(secs)}</div></div>
    <div className="cc">
      {st === 'incoming' ? <><button className="btn" onClick={accept}>Nhận</button><button className="btn" style={{ background: '#fff' }} onClick={reject}>Từ chối</button></> : <>
        <button className={`pill ${mic ? '' : 'on'}`} onClick={() => toggle('audio')}>{mic ? 'Tắt mic' : 'Bật mic'}</button>
        {video && <button className={`pill ${cam ? '' : 'on'}`} onClick={() => toggle('video')}>{cam ? 'Tắt camera' : 'Bật camera'}</button>}
        {video && <button className="pill" onClick={flip}>Đổi camera</button>}
        <button className="btn" onClick={() => end(true, 'missed')}>Kết thúc</button></>}
    </div>
  </div>
}
