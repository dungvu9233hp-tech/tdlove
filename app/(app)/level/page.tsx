'use client'
import Link from 'next/link'
import Head from '@/components/Head'
import Couple3D from '@/components/Couple3D'
import { useApp } from '@/lib/ctx'
import { daysTogether } from '@/lib/util'

// Khu cấp độ: bước 1 mới có hai nhân vật. Điểm, cấp độ và cửa hàng đồ sẽ làm ở các bước sau.
export default function Level() {
  const { me, partner, space } = useApp()
  const day = space.start_date ? daysTogether(space.start_date) : null
  return <>
    <Head t="Cấp độ"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      <div className="k pk" style={{ padding: 0, overflow: 'hidden' }}><Couple3D height={440} /></div>
      <div className="s" style={{ textAlign: 'center' }}>{me.display_name} & {partner?.display_name ?? 'người ấy'}{day ? ` · ${day} ngày bên nhau` : ''}</div>
    </div>
  </>
}
