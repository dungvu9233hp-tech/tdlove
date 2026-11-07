'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import { useGame } from '@/lib/games/useGame'
import { createGame, replayOpts } from '@/lib/games/api'
import { KINDS, type GameProps, type Voucher } from '@/lib/games/types'
import Caro from '@/components/games/Caro'
import SoBiMat from '@/components/games/SoBiMat'
import HieuNhau from '@/components/games/HieuNhau'
import LatBai from '@/components/games/LatBai'
import PhaThuyen from '@/components/games/PhaThuyen'
import BaiCao from '@/components/games/BaiCao'
import XiDach from '@/components/games/XiDach'
import VeDoan from '@/components/games/VeDoan'
import ThatThach from '@/components/games/ThatThach'

const VIEW: Record<string, (p: GameProps) => React.ReactElement> = {
  caro: Caro, so_bi_mat: SoBiMat, hieu_nhau: HieuNhau, lat_bai: LatBai, pha_thuyen: PhaThuyen, bai_cao: BaiCao, xi_dach: XiDach, ve_doan: VeDoan, that_thach: ThatThach,
}

export default function Room() {
  const { id } = useParams<{ id: string }>()
  const { me, partner } = useApp()
  const r = useRouter()
  const pn = partner?.display_name ?? 'Người ấy'
  const { g, secret, busy, msg, setMsg, act, ch } = useGame(id)
  const [prize, setPrize] = useState<Voucher | null>(null)
  const [rb, setRb] = useState(false); const [rmsg, setRmsg] = useState('')

  // Phần quà đã rút cho ván này (nếu có), để cả hai cùng thấy
  useEffect(() => {
    if (!g || g.status !== 'done' || !g.reward_drawn) return
    sb.from('game_vouchers').select('*').eq('game_id', g.id).maybeSingle().then(x => { if (x.data) setPrize(x.data as Voucher) })
  }, [g?.id, g?.status, g?.reward_drawn])  // eslint-disable-line react-hooks/exhaustive-deps

  if (g === undefined) return <><Head t="Trò chơi" /><div className="b"><div className="s">Đang mở ván chơi…</div></div></>
  if (g === null || !partner) return <><Head t="Trò chơi"><Link href="/games" className="pill">Trò chơi</Link></Head>
    <div className="b"><div className="k pe"><b>Không tìm thấy ván chơi</b><div className="s">Ván này có thể đã bị xóa hoặc không thuộc Space của bạn.</div></div></div></>

  const info = KINDS[g.kind], View = VIEW[g.kind]
  const mine = g.waiting.includes(me.id)
  const playing = g.status === 'playing'
  const props: GameProps = { g, me: me.id, partnerId: partner.id, pn, mine, secret, act, busy, ch }

  async function draw() {
    setRb(true); setRmsg('')
    const x = await sb.rpc('voucher_draw', { p_game: g!.id })
    setRb(false)
    if (x.error) return setRmsg(x.error.message)
    setPrize(x.data as Voucher)
  }
  async function again() {
    const x = await createGame(g!.kind, replayOpts(g!))
    if (x.error) return setMsg(x.error)
    r.push(`/games/${x.id}`)
  }
  async function end() {
    if (confirm('Kết thúc ván này? Ván sẽ không được tính thắng thua.')) await act('game_end')
  }

  const banner = playing
    ? (mine ? { cls: 'me', t: g.waiting.length === 1 ? 'Đến lượt bạn' : 'Cần bạn hành động' } : { cls: '', t: `Chờ ${pn}…` })
    : g.status === 'abandoned' ? { cls: 'end', t: 'Ván này đã kết thúc, không tính thắng thua' }
      : { cls: 'end', t: g.winner === me.id ? 'Bạn thắng rồi! 🎉' : g.winner ? `${pn} thắng ván này` : 'Hòa nhau, hay quá!' }

  return <>
    <Head t={info.name} lead={<span style={{ fontSize: 28 }} aria-hidden="true">{info.icon}</span>}><Link href="/games" className="pill">Trò chơi</Link></Head>
    <div className="b">
      <div className={`gm-turn ${banner.cls}`} role="status">
        {playing && mine && <i className="gm-dot" aria-hidden="true" />}
        <span className="gm-grow">{banner.t}
          {playing && <span className="gm-sub" style={{ display: 'block' }}>{ch.partnerHere ? `${pn} đang ở trong ván` : `${pn} không ở trong ván, sẽ có thông báo khi đến lượt`}</span>}</span>
      </div>
      {msg && <div className="gm-err" role="alert">{msg}</div>}

      <View {...props} />

      {g.status === 'done' && <div className="k pe" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {g.winner === me.id && !g.reward_drawn && <>
          <b>Phần thưởng cho người thắng 🎁</b>
          <div className="gm-sub">Rút ngẫu nhiên một phần quà mà {pn} đã viết sẵn trong hộp quà.</div>
          <button className="btn" disabled={rb} onClick={draw}>{rb ? 'Đang rút…' : 'Rút quà thử thách'}</button>
          {rmsg && <div className="gm-err" role="alert">{rmsg} <Link href="/games/rewards" className="pill" style={{ marginLeft: 6 }}>Mở hộp quà</Link></div>}
        </>}
        {prize && <div className="gm-big">🎁 {g.winner === me.id ? `Bạn nhận được: ${prize.title}` : `${pn} nhận được từ bạn: ${prize.title}`}<br /><Link href="/games/rewards" className="pill on">Xem hộp quà</Link></div>}
        {g.winner && g.winner !== me.id && !g.reward_drawn && <div className="gm-sub">{pn} sẽ được rút một phần quà từ hộp quà của bạn.</div>}
        <button className="btn ghost" onClick={again}>Chơi lại</button>
      </div>}
      {g.status !== 'playing' && g.winner === null && <button className="btn ghost" onClick={again}>Chơi lại</button>}
      {playing && <button className="pill" style={{ alignSelf: 'center' }} onClick={end}>Kết thúc ván này</button>}
    </div>
  </>
}
