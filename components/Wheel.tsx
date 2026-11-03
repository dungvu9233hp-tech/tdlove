'use client'
// Vòng quay SVG: kim chỉ ở đỉnh, các ô chia đều, quay theo chiều kim đồng hồ.
const COLORS = ['#FFD9E8', '#EBDDFF', '#FFE6D6', '#FFB3CF', '#DDEBFF', '#FFF3C9']
const R = 96, C = 100
const pt = (deg: number, r = R) => { const a = deg * Math.PI / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)] as const }
const cut = (s: string, n: number) => { const a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('') + '…' : s }

export default function Wheel({ names, rot, ms }: { names: string[]; rot: number; ms: number }) {
  const n = names.length, a = 360 / n
  return <div style={{ position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto', aspectRatio: '1' }}>
    <svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label={`Vòng quay gồm ${n} món: ${names.join(', ')}`}
      style={{ transform: `rotate(${rot}deg)`, transition: `transform ${ms}ms cubic-bezier(.12,.6,.1,1)`, overflow: 'visible' }}>
      <circle cx={C} cy={C} r={R + 3} fill="#fff" stroke="#5B1F3A" strokeWidth="3" />
      {names.map((name, i) => {
        const [x1, y1] = pt(i * a), [x2, y2] = pt((i + 1) * a), c = (i + .5) * a
        return <g key={name}>
          <path d={`M${C},${C} L${x1},${y1} A${R},${R} 0 ${a > 180 ? 1 : 0} 1 ${x2},${y2} Z`} fill={COLORS[i % COLORS.length]} stroke="#5B1F3A" strokeWidth="1.5" strokeLinejoin="round" />
          <text transform={`rotate(${c - 90} ${C} ${C})`} x={C + R - 8} y={C} textAnchor="end" dominantBaseline="central"
            fontSize={n > 8 ? 9 : 11} fontWeight="800" fill="#5B1F3A" style={{ fontFamily: 'inherit' }}>{cut(name, n > 8 ? 9 : 12)}</text>
        </g>
      })}
      <circle cx={C} cy={C} r="9" fill="#FF8FB8" stroke="#5B1F3A" strokeWidth="2.5" />
    </svg>
    {/* kim chỉ cố định ở đỉnh, không quay theo vòng */}
    <svg viewBox="0 0 24 24" width="9%" style={{ position: 'absolute', left: '50%', top: '-3%', transform: 'translateX(-50%)' }} aria-hidden="true">
      <path d="M12 22 2 3h20z" fill="#FF8FB8" stroke="#5B1F3A" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  </div>
}
