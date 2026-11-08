'use client'
import '../photobooth.css'
import Link from 'next/link'
import Head from '@/components/Head'
import PbGallery from '@/components/PbGallery'
import { NotifBell } from '@/components/Notifs'

export default function PhotoboothGalleryPage() {
  return <>
    <Head t="Góc Photobooth"><NotifBell /><Link href="/photobooth" className="pill">Photobooth</Link></Head>
    <div className="b"><PbGallery /></div>
  </>
}
