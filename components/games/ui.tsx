'use client'
import { isRed, rankOf, suitOf } from '@/lib/games/cards'

export function PCard({ c, down, sm, onClick, label }: { c?: number; down?: boolean; sm?: boolean; onClick?: () => void; label?: string }) {
  const cls = `gm-pc ${sm ? 'sm' : ''} ${down || c === undefined ? 'back' : isRed(c) ? 'red' : ''} ${onClick ? 'tap' : ''}`
  if (down || c === undefined) return <button type="button" className={cls} onClick={onClick} disabled={!onClick} aria-label={label ?? 'Lá bài úp'}>🂠</button>
  return <button type="button" className={cls} onClick={onClick} disabled={!onClick} aria-label={`${rankOf(c)} ${['bích', 'chuồn', 'rô', 'cơ'][Math.floor(c / 13)]}`}><span>{rankOf(c)}</span><small>{suitOf(c)}</small></button>
}

export const Scores = ({ items }: { items: { name: string; n: number | string; sub?: string }[] }) =>
  <div className="gm-score">{items.map(i => <div key={i.name}><div className="gm-sub">{i.name}</div><b>{i.n}</b>{i.sub && <div className="gm-sub">{i.sub}</div>}</div>)}</div>
