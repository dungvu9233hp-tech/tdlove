export async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise(ok => c.toBlob(b => ok(b!), 'image/jpeg', 0.8))
}
export const km = (a: any, b: any) => { const r = (x: number) => x * Math.PI / 180, d = r(b.lat - a.lat), e = r(b.lng - a.lng); return 12742 * Math.asin(Math.sqrt(Math.sin(d / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(e / 2) ** 2)) }
// Lấy tọa độ từ link Google Maps dạng dài (link rút gọn maps.app.goo.gl không đọc được)
export const coords = (u: string) => {
  const m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/[?&](?:q|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  return m ? { lat: +m[1], lng: +m[2] } : {}
}
