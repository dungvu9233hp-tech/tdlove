// Trái tim đếm ngày bên nhau ở Trang chủ: tim mập có mặt nũng nịu (má hồng, mắt long lanh biết chớp, miệng ω),
// bóng lệch hồng giống box-shadow của thẻ `.k`, tim nhỏ và sao lấp lánh bay quanh.
// Chỉ vẽ hình; liên kết do Trang chủ bọc ngoài. Kiểu dáng và chuyển động nằm ở globals.css (.lh*),
// chuyển động tự tắt khi máy bật "giảm chuyển động". Lớp tim và lớp trang trí dùng chung một viewBox
// nên chữ đặt theo px (xem .lh-txt) luôn khớp với hình.
const INK = '#5B1F3A'
const VB = '-20 -10 240 196'
const BODY = 'M100 170 C40 125 8 92 8 58 C8 28 31 8 58 8 C77 8 92 18 100 34 C108 18 123 8 142 8 C169 8 192 28 192 58 C192 92 160 125 100 170 Z'
const MINI = 'M0 8.5 C-6 4 -9.2 0.7 -9.2 -2.7 C-9.2 -5.7 -6.9 -7.7 -4.2 -7.7 C-2.3 -7.7 -0.8 -6.7 0 -5.1 C0.8 -6.7 2.3 -7.7 4.2 -7.7 C6.9 -7.7 9.2 -5.7 9.2 -2.7 C9.2 0.7 6 4 0 8.5 Z'
const STAR = 'M0 -6 C0.8 -2 2 -0.8 6 0 C2 0.8 0.8 2 0 6 C-0.8 2 -2 0.8 -6 0 C-2 -0.8 -0.8 -2 0 -6 Z'

const mini = (fill: string) => ({ fill, stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const })
const star = { fill: '#fff', stroke: INK, strokeWidth: 1.8, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const }

export default function LoveHeart({ days }: { days: number | null }) {
  return (
    <div className="lh">
      {/* Lớp trang trí nằm sau tim: tim nhỏ trôi nhẹ, sao nhấp nháy lệch nhịp nhau */}
      <svg className="lh-svg" viewBox={VB} aria-hidden="true" focusable="false">
        <g transform="translate(-6 30) rotate(-20)"><g className="lh-fl"><path d={MINI} {...mini('#FFB3CF')} /></g></g>
        <g transform="translate(208 72) rotate(16) scale(1.25)"><g className="lh-fl b"><path d={MINI} {...mini('#EBDDFF')} /></g></g>
        <g transform="translate(204 14) scale(1.3)"><path className="lh-tw" d={STAR} {...star} /></g>
        <g transform="translate(-2 108) scale(0.9)"><path className="lh-tw b" d={STAR} {...star} /></g>
        <g transform="translate(200 132) scale(0.75)"><path className="lh-tw c" d={STAR} {...star} /></g>
      </svg>
      <div className="lh-press">
        <div className="lh-beat">
          <svg className="lh-svg" viewBox={VB} aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="lh-g" x1="0.2" y1="0" x2="0.8" y2="1">
                <stop offset="0" stopColor="#FFC4DB" />
                <stop offset="0.55" stopColor="#FF9EC2" />
                <stop offset="1" stopColor="#FF7FAC" />
              </linearGradient>
            </defs>
            <path d={BODY} transform="translate(5 6)" fill="#FFB3CF" />
            <path d={BODY} fill="url(#lh-g)" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
            <path d="M26 44 C26 30 36 20 49 19" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
            <circle cx="63" cy="19" r="3.6" fill="#fff" opacity="0.85" />
            <g>
              <ellipse cx="70" cy="127" rx="7.5" ry="5" fill="#FF5C93" opacity="0.38" />
              <ellipse cx="130" cy="127" rx="7.5" ry="5" fill="#FF5C93" opacity="0.38" />
              <g className="lh-eye">
                <ellipse cx="82" cy="119.5" rx="5.3" ry="6.5" fill={INK} />
                <circle cx="84.2" cy="116.9" r="1.95" fill="#fff" />
                <circle cx="80.6" cy="122.2" r="0.9" fill="#fff" />
              </g>
              <g className="lh-eye">
                <ellipse cx="118" cy="119.5" rx="5.3" ry="6.5" fill={INK} />
                <circle cx="120.2" cy="116.9" r="1.95" fill="#fff" />
                <circle cx="116.6" cy="122.2" r="0.9" fill="#fff" />
              </g>
              <path d="M92.5 129 Q96.3 134.5 100 129 Q103.7 134.5 107.5 129" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
          <div className="lh-txt">
            <div className="num lh-n">{days ?? '–'}</div>
            <div className="num lh-l">ngày bên nhau</div>
          </div>
        </div>
      </div>
    </div>
  )
}
