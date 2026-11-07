'use client'
import type { GameProps } from '@/lib/games/types'

export default function HieuNhau({ g, me, partnerId, pn, secret, act, busy }: GameProps) {
  const st = g.state, qs: { q: string; o: string[] }[] = st.qs, i: number = st.i
  const playing = g.status === 'playing'
  const iAnswer = playing && st.phase === 'answer' && st.answerer === me
  const iGuess = playing && st.phase === 'guess' && st.answerer !== me
  const who = st.answerer === me ? 'bạn' : pn
  const q = qs[Math.min(i, qs.length - 1)]
  const log: any[] = st.log ?? []
  const myPick: number | undefined = secret && secret.i === i ? secret.a : undefined
  const total = (id: string) => log.filter(l => l.by !== id).length    // số câu người đó phải đoán
  const good = (id: string) => log.filter(l => l.by !== id && l.ok).length

  return <>
    <div className="bar" aria-label={`Đã xong ${log.length} trên ${qs.length} câu`}><i style={{ width: `${(log.length / qs.length) * 100}%` }} /></div>
    <div className="gm-sub">Câu {Math.min(i + 1, qs.length)} / {qs.length}. Mỗi câu một người trả lời thật về mình, người kia đoán xem họ chọn gì.</div>
    {playing && <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="gm-sub">{iAnswer ? 'Bạn trả lời về chính mình' : iGuess ? `${pn} đã chọn xong, bạn đoán xem họ chọn gì` : st.phase === 'answer' ? `${pn} đang trả lời…` : `${pn} đang đoán…`}</div>
      <b style={{ fontSize: 19 }}>{q.q}</b>
      <div className="gm-opts">
        {q.o.map((o, k) => <button key={k} type="button" className={`gm-opt ${st.phase === 'guess' && myPick === k && st.answerer === me ? 'pick' : ''}`} disabled={busy || !(iAnswer || iGuess)}
          onClick={() => act(iAnswer ? 'kn_answer' : 'kn_guess', { p_choice: k })}>{o}</button>)}
      </div>
      {st.phase === 'guess' && st.answerer === me && <div className="gm-sub">Bạn đã chọn “{q.o[myPick ?? 0]}”. Chờ {pn} đoán.</div>}
    </div>}
    {g.status !== 'playing' && <div className="k pe">
      <b>Kết quả</b>
      <div className="gm-sub">Bạn đoán đúng {good(me)} / {total(me)} câu · {pn} đoán đúng {good(partnerId)} / {total(partnerId)} câu</div>
    </div>}
    {log.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="gm-sub">Các câu đã xong</div>
      {[...log].reverse().map(l => {
        const qq = qs[l.i], by = l.by === me ? 'Bạn' : pn, guesser = l.by === me ? pn : 'Bạn'
        return <div key={l.i} className={`k ${l.ok ? '' : 'pe'}`}>
          <b style={{ fontSize: 15 }}>{qq.q}</b>
          <div className="gm-sub">{by} chọn: {qq.o[l.a]}</div>
          <div className="gm-sub">{guesser} đoán: {qq.o[l.g]} {l.ok ? '✅ đúng rồi!' : '❌ chưa đúng'}</div>
        </div>
      })}
    </div>}
  </>
}
