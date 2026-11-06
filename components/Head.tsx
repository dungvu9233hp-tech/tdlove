// Trái tim nhỏ ở đầu trang, đăng nhập và màn hình khóa: phẳng, một màu hồng phấn, viền mực
export const Heart = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FF9DBF" stroke="#4A1D35" strokeWidth="1.2" strokeLinejoin="round" /></svg>
)
export default function Head({ t, children, lead }: { t: string; children?: React.ReactNode; lead?: React.ReactNode }) {
  return <div className="h">{lead ?? <Heart size={30} />}<h1 className="t1">{t}</h1><span className="r">{children}</span></div>
}
