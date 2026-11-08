// Photobooth: mô hình dữ liệu, frame mẫu, tính toán "ảnh luôn phủ kín khung" và xuất PNG.
export type Item = {
  id: string; k: 'photo' | 'sticker' | 'text'
  x: number; y: number; w: number; h: number; r: number      // tâm (x,y), kích thước, góc xoay (độ)
  src?: string; iw?: number; ih?: number                     // ảnh/sticker: đường dẫn + kích thước gốc
  z?: number; ox?: number; oy?: number                       // ô ảnh: zoom (>=1) và dịch ảnh bên trong
  bd?: number; bb?: number; rd?: number                      // ô ảnh: viền, viền đáy thêm (kiểu polaroid), bo góc
  text?: string; fs?: number; color?: string                 // chữ
}
export type Slot = { x: number; y: number; w: number; h: number; r?: number; bd?: number; bb?: number; rd?: number }
export type Frame = { id: string; name: string; W: number; H: number; slots: Slot[]; overlay?: string }   // overlay: ảnh frame PNG có lỗ trong suốt, nằm trên ảnh
export type Sticker = { id: string; name: string; src: string; w: number; cat: string }
export const CATS = ['Tất cả', 'Dâu & đỏ', 'Quán cà phê', 'Hồng nhạt', 'Nét vẽ']

const P = (x: number, y: number, w: number, h: number, r = 0, bd = 0, bb = 0, rd = 0): Slot => ({ x, y, w, h, r, bd, bb, rd })
export const FRAMES: Frame[] = [
  { id: 'blank', name: 'Frame rỗng', W: 1000, H: 1500, slots: [] },
  { id: 'strip', name: 'Dải 4 ảnh', W: 600, H: 1800, slots: [0, 1, 2, 3].map(i => P(50, 50 + i * 380, 500, 350, 0, 0, 0, 14)) },
  { id: 'grid', name: 'Lưới 2×2', W: 1000, H: 1250, slots: [P(40, 40, 440, 440, 0, 0, 0, 16), P(520, 40, 440, 440, 0, 0, 0, 16), P(40, 520, 440, 440, 0, 0, 0, 16), P(520, 520, 440, 440, 0, 0, 0, 16)] },
  { id: 'duo', name: 'Polaroid đôi', W: 1000, H: 1600, slots: [P(120, 60, 760, 720, -3, 28, 100), P(120, 810, 760, 720, 3, 28, 100)] },
  { id: 'one', name: 'Polaroid lớn', W: 1000, H: 1250, slots: [P(80, 80, 840, 1000, 0, 40, 160)] },
  { id: 'collage', name: 'Collage 3 ảnh', W: 1000, H: 1333, slots: [P(400, 50, 540, 560, 4, 24, 70), P(50, 330, 560, 760, -3, 24, 24), P(450, 830, 500, 430, 3, 24, 24)] },
  { id: 'film4', name: 'Phim 4 ô', W: 444, H: 1071, overlay: '/photobooth/frames/film4.png', slots: [{ x: 61.2, y: 20.3, w: 325.6, h: 247.3 }, { x: 60.6, y: 289.6, w: 322.7, h: 243.6 }, { x: 59.2, y: 555.9, w: 319.7, h: 240.1 }, { x: 59.0, y: 817.0, w: 316.0, h: 237.0 }] },
  { id: 'camera-sony', name: 'Máy ảnh', W: 392, H: 297, overlay: '/photobooth/frames/camera-sony.png', slots: [{ x: 51.1, y: 63.1, w: 213.7, h: 159.8, r: 14.9 }] },
  { id: 'caro-1', name: 'Polaroid caro hồng', W: 680, H: 770, overlay: '/photobooth/frames/caro-1.png', slots: [{ x: 88.0, y: 83.0, w: 504, h: 504 }] },
  { id: 'caro-3', name: 'Caro 3 polaroid', W: 1000, H: 1500, overlay: '/photobooth/frames/caro-3.png', slots: [{ x: 124.5, y: 88.2, w: 404.0, h: 404.0, r: -5 }, { x: 460.8, y: 518.1, w: 404.0, h: 404.0, r: 4 }, { x: 145.9, y: 928.1, w: 404.0, h: 404.0, r: -3 }] },
  { id: 'strip-white3', name: 'Dải trắng 3 ảnh', W: 599, H: 1694, overlay: '/photobooth/frames/strip-white3.png', slots: [{ x: 50, y: 53, w: 491, h: 494 }, { x: 50, y: 593, w: 491, h: 494 }, { x: 50, y: 1133, w: 491, h: 494 }] },
  { id: 'strip-grey3', name: 'Dải xám 3 ảnh', W: 420, H: 1205, overlay: '/photobooth/frames/strip-grey3.png', slots: [{ x: 38, y: 35, w: 339, h: 344 }, { x: 38, y: 390, w: 339, h: 344 }, { x: 38, y: 745, w: 339, h: 344 }] },
]
const SK = (id: string, name: string, ext: string, w: number, cat: string): Sticker => ({ id, name, src: `/photobooth/stickers/${id}.${ext}`, w, cat })
export const STICKERS: Sticker[] = [
  SK('cake', 'Bánh dâu', 'png', 300, 'Dâu & đỏ'),
  SK('bear', 'Gấu bông', 'png', 340, 'Dâu & đỏ'),
  SK('phone-rotary', 'Điện thoại', 'png', 320, 'Dâu & đỏ'),
  SK('phone-handset', 'Ống nghe', 'png', 130, 'Dâu & đỏ'),
  SK('clip-1', 'Kẹp đỏ', 'png', 120, 'Dâu & đỏ'),
  SK('clip-2', 'Kẹp đỏ 2', 'png', 130, 'Dâu & đỏ'),
  SK('tag-1', 'Nhãn 1', 'png', 260, 'Dâu & đỏ'),
  SK('tag-2', 'Nhãn 2', 'png', 380, 'Dâu & đỏ'),
  SK('croissant', 'Bánh sừng bò', 'png', 240, 'Quán cà phê'),
  SK('pretzel', 'Bánh pretzel', 'png', 230, 'Quán cà phê'),
  SK('receipt', 'Hóa đơn', 'png', 200, 'Quán cà phê'),
  SK('bubble-hello', 'Bong bóng hỏi', 'png', 330, 'Quán cà phê'),
  SK('bubble-caramel', 'Bong bóng đáp', 'png', 280, 'Quán cà phê'),
  SK('tag-open', 'Nhãn we’re open', 'png', 320, 'Quán cà phê'),
  SK('flower-pink', 'Hoa hồng nhạt', 'png', 230, 'Hồng nhạt'),
  SK('camera-pink', 'Máy ảnh hồng', 'png', 260, 'Hồng nhạt'),
  SK('shark-cat', 'Mèo cá mập', 'png', 230, 'Hồng nhạt'),
  SK('flower-dark', 'Hoa tím', 'png', 120, 'Hồng nhạt'),
  SK('bow', 'Nơ hồng', 'png', 200, 'Hồng nhạt'),
  SK('lips', 'Dấu môi', 'png', 220, 'Hồng nhạt'),
  SK('disco-ball', 'Bóng disco', 'png', 190, 'Hồng nhạt'),
  SK('flower-sticker', 'Hoa viền trắng', 'png', 300, 'Hồng nhạt'),
  SK('disco-heart', 'Tim disco', 'png', 220, 'Hồng nhạt'),
  SK('seal-bow', 'Dấu sáp nơ', 'png', 130, 'Hồng nhạt'),
  SK('lily', 'Hoa lily', 'png', 160, 'Hồng nhạt'),
  SK('lip-balm', 'Son dưỡng dâu', 'png', 230, 'Hồng nhạt'),
  SK('chrome-star', 'Sao bạc', 'png', 240, 'Hồng nhạt'),
  SK('gold-stars', 'Sao vàng', 'png', 260, 'Hồng nhạt'),
  SK('butterfly', 'Bướm', 'png', 220, 'Hồng nhạt'),
  SK('camera-nikon', 'Máy ảnh cũ', 'png', 240, 'Hồng nhạt'),
  SK('basket', 'Giỏ đỏ', 'png', 520, 'Dâu & đỏ'),
  SK('tag-favorite', 'Favorite person', 'png', 260, 'Dâu & đỏ'),
  SK('babygirl', 'Baby girl', 'png', 200, 'Dâu & đỏ'),
  SK('strawberry', 'Dâu tây', 'png', 260, 'Dâu & đỏ'),
  SK('cherry-bow', 'Cherry nơ', 'png', 200, 'Dâu & đỏ'),
  SK('rocket', 'Tên lửa', 'png', 200, 'Dâu & đỏ'),
  SK('clips', 'Kẹp tóc đỏ', 'png', 200, 'Dâu & đỏ'),
  SK('girls', 'Chữ girls', 'png', 220, 'Dâu & đỏ'),
  SK('my-girl', 'Tim my girl', 'png', 160, 'Dâu & đỏ'),
  SK('plate', 'Biển memories', 'png', 130, 'Dâu & đỏ'),
  SK('stars-red', 'Sao đỏ', 'png', 160, 'Dâu & đỏ'),
  SK('heart-line', 'Tim trắng', 'svg', 160, 'Nét vẽ'),
  SK('heart-pink', 'Tim hồng', 'svg', 160, 'Nét vẽ'),
  SK('sparkle', 'Lấp lánh', 'svg', 120, 'Nét vẽ'),
  SK('star-doodle', 'Sao', 'svg', 120, 'Nét vẽ'),
  SK('squiggle', 'Nét lượn', 'svg', 240, 'Nét vẽ'),
  SK('swirl', 'Xoáy', 'svg', 150, 'Nét vẽ'),
  SK('arrow-dash', 'Mũi tên', 'svg', 220, 'Nét vẽ'),
  SK('tape', 'Băng dính', 'svg', 220, 'Nét vẽ'),
]
export const BGS = ['#FFE9F1', '#FFFAFC', '#F8DDE8', '#F3E8FF', '#EBD9C3', '#B4476E', '#4A1D35', '#FFFFFF']

export const uid = () => Math.random().toString(36).slice(2, 9)
export const slotToItem = (s: Slot): Item => ({ id: uid(), k: 'photo', x: s.x + s.w / 2, y: s.y + s.h / 2, w: s.w, h: s.h, r: s.r ?? 0, z: 1, ox: 0, oy: 0, bd: s.bd ?? 0, bb: s.bb ?? 0, rd: s.rd ?? 0 })

const ms = (() => { let c: HTMLCanvasElement | null = null; return () => (c ??= document.createElement('canvas')).getContext('2d')! })()
export const FONT = "'Mali','Quicksand',system-ui,sans-serif"
export function fitText(it: Item): Item {   // đo chữ để khung chọn ôm sát
  const c = ms(); c.font = `700 ${it.fs}px ${FONT}`
  return { ...it, w: Math.ceil(c.measureText(it.text || ' ').width) + 24, h: Math.ceil((it.fs ?? 60) * 1.35) }
}

// Vùng chứa ảnh trong ô (trừ viền) và kích thước ảnh sau khi phóng để LUÔN phủ kín vùng đó, kể cả ảnh dọc/ngang/vuông bất kỳ.
export function fit(it: Item) {
  const bd = it.bd ?? 0, bb = it.bb ?? bd
  const aw = Math.max(10, it.w - 2 * bd), ah = Math.max(10, it.h - bd - bb)
  const iw = it.iw || 1, ih = it.ih || 1, z = Math.max(1, it.z ?? 1)
  const s = Math.max(aw / iw, ah / ih) * z, dw = iw * s, dh = ih * s
  const mx = (dw - aw) / 2, my = (dh - ah) / 2
  const ox = Math.max(-mx, Math.min(mx, it.ox ?? 0)), oy = Math.max(-my, Math.min(my, it.oy ?? 0))
  return { bd, bb, aw, ah, dw, dh, ox, oy }
}

// Tải ảnh người dùng: sửa xoay EXIF, thu nhỏ còn tối đa 1800px để máy yếu không bị treo
export async function loadPhoto(f: File) {
  const bm = await createImageBitmap(f, { imageOrientation: 'from-image' })
  const k = Math.min(1, 1800 / Math.max(bm.width, bm.height)), c = document.createElement('canvas')
  c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k)
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height); bm.close?.()
  const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.9))
  return { id: uid(), url: URL.createObjectURL(blob), iw: c.width, ih: c.height }
}
export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })

// Frame PNG có lỗ trong suốt -> tự tìm các lỗ, mỗi lỗ thành một ô ảnh nằm dưới frame (ảnh to hơn lỗ một chút cũng không lộ viền)
export function findHoles(img: HTMLImageElement, W: number, H: number): Slot[] {
  const gw = 240, gh = Math.max(1, Math.round(gw * img.naturalHeight / img.naturalWidth))
  const c = document.createElement('canvas'); c.width = gw; c.height = gh
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, gw, gh)
  const d = g.getImageData(0, 0, gw, gh).data, seen = new Uint8Array(gw * gh), out: Slot[] = []
  const hole = (i: number) => d[i * 4 + 3] < 40
  for (let s = 0; s < gw * gh; s++) {
    if (seen[s] || !hole(s)) continue
    let n = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0; const st = [s]; seen[s] = 1
    while (st.length) {
      const p = st.pop()!, x = p % gw, y = (p / gw) | 0; n++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const q of [p - 1, p + 1, p - gw, p + gw]) {
        if (q < 0 || q >= gw * gh || seen[q] || !hole(q)) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === gw - 1)) continue
        seen[q] = 1; st.push(q)
      }
    }
    if (n < gw * gh * 0.015 || n > gw * gh * 0.6) continue
    const k = W / gw, e = 2 * k
    out.push({ x: x0 * k - e, y: y0 * k - e, w: (x1 - x0 + 1) * k + 2 * e, h: (y1 - y0 + 1) * k + 2 * e })
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)) }
export async function render(W: number, H: number, bg: string, bgImg: string | null, overlay: string | null, items: Item[], px = 1200) {
  await document.fonts?.ready
  const k = px / W, cv = document.createElement('canvas'); cv.width = px; cv.height = Math.round(H * k)
  const c = cv.getContext('2d')!; c.scale(k, k); c.fillStyle = bg; c.fillRect(0, 0, W, H)
  if (bgImg) c.drawImage(await loadImg(bgImg), 0, 0, W, H)
  const draw = async (it: Item) => {
    c.save(); c.translate(it.x, it.y); c.rotate(it.r * Math.PI / 180)
    if (it.k === 'photo') {
      const f = fit(it), card = f.bd > 0 || f.bb > 0
      if (card) { c.shadowColor = 'rgba(74,29,53,.25)'; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = '#fff'; rr(c, -it.w / 2, -it.h / 2, it.w, it.h, it.rd ?? 0); c.fill(); c.shadowColor = 'transparent' }
      const ax = -it.w / 2 + f.bd, ay = -it.h / 2 + f.bd
      if (it.src) { c.save(); rr(c, ax, ay, f.aw, f.ah, card ? 0 : it.rd ?? 0); c.clip(); c.drawImage(await loadImg(it.src), ax + f.aw / 2 - f.dw / 2 + f.ox, ay + f.ah / 2 - f.dh / 2 + f.oy, f.dw, f.dh); c.restore() }
    } else if (it.k === 'sticker' && it.src) c.drawImage(await loadImg(it.src), -it.w / 2, -it.h / 2, it.w, it.h)
    else if (it.k === 'text') { c.font = `700 ${it.fs}px ${FONT}`; c.fillStyle = it.color || '#4A1D35'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it.text || '', 0, 0) }
    c.restore()
  }
  for (const it of items.filter(i => i.k === 'photo' && i.src)) await draw(it)
  if (overlay) c.drawImage(await loadImg(overlay), 0, 0, W, H)
  for (const it of items.filter(i => i.k !== 'photo')) await draw(it)
  return new Promise<Blob>(r => cv.toBlob(b => r(b!), 'image/png'))
}
