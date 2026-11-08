'use client'
import './photobooth.css'
import Link from 'next/link'
import Head from '@/components/Head'
import Photobooth from '@/components/Photobooth'

export default function PhotoboothPage() {
  return <>
    <Head t="Photobooth"><Link href="/photobooth/gallery" className="pill">💞 Góc chung</Link><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b"><Photobooth /></div>
  </>
}
