import * as THREE from 'three'

// Nhân vật 3D tỉ lệ người thật (khoảng 7,5 đầu), dựng bằng code, không cần tải mô hình.
// Mọi số đo tính bằng mét. Nhân vật nhìn về +z, trục y hướng lên.
// Đồ (top / bottom / shoes / hair) là các "slot" riêng để sau này Cửa hàng chỉ việc thay.

export type Face = { width: number; jaw: number; eyeSize: number; eyeGap: number; noseLen: number; noseWidth: number; lipFull: number; brow: number; cheek: number }
export type Body = { shoulder: number; chest: number; waist: number; hip: number; thigh: number; arm: number }
export type Look = {
  sex: 'f' | 'm'; height: number
  skin: number; hair: number; eye: number; lip: number
  hairStyle: 'long' | 'short'
  top: number; bottom: number; shoe: number
  face: Face; body: Body
}
export const DEF_FACE: Face = { width: 1, jaw: 1, eyeSize: 1, eyeGap: 1, noseLen: 1, noseWidth: 1, lipFull: 1, brow: 1, cheek: 1 }
export const DEF_BODY: Body = { shoulder: 1, chest: 1, waist: 1, hip: 1, thigh: 1, arm: 1 }

// Hai nhân vật mặc định (chưa có ảnh tham chiếu nên là khuôn mặt "trung bình" kiểu Việt; chỉnh bằng face/body)
export const LOOK_F: Look = { sex: 'f', height: 1.62, skin: 0xf1c7ab, hair: 0x241713, eye: 0x4a2e1f, lip: 0xd46f72, hairStyle: 'long', top: 0xffc4da, bottom: 0xc3b3ee, shoe: 0xffffff, face: { ...DEF_FACE, width: .94, jaw: .95, eyeSize: 1.1, noseLen: .9, cheek: 1.05 }, body: { ...DEF_BODY } }
export const LOOK_M: Look = { sex: 'm', height: 1.75, skin: 0xe6b595, hair: 0x1a1411, eye: 0x3a2417, lip: 0xb2685f, hairStyle: 'short', top: 0xa9d3f0, bottom: 0x46658f, shoe: 0xffffff, face: { ...DEF_FACE, width: .97, jaw: 1.04, eyeSize: 1.06, brow: 1.15 }, body: { ...DEF_BODY } }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

// Nội suy Catmull-Rom cho bảng khóa [t, ...giá trị] -> n mẫu
function curve(keys: number[][], n: number): number[][] {
  const out: number[][] = [], t0 = keys[0][0], t1 = keys[keys.length - 1][0], m = keys[0].length
  for (let s = 0; s < n; s++) {
    const tt = t0 + (t1 - t0) * s / (n - 1)
    let i = 0; while (i < keys.length - 2 && tt > keys[i + 1][0]) i++
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)]
    const u = (tt - k1[0]) / (k2[0] - k1[0]), row = [tt]
    for (let c = 1; c < m; c++) { const p0 = k0[c], p1 = k1[c], p2 = k2[c], p3 = k3[c]; row.push(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)) }
    out.push(row)
  }
  return out
}
type Ring = { y: number; rx: number; rz: number; ox: number; oz: number }
const ringsOf = (keys: number[][], n: number): Ring[] => curve(keys, n).map(r => ({ y: r[0], rx: Math.max(.0006, r[1]), rz: Math.max(.0006, r[2]), ox: 0, oz: r[3] ?? 0 }))

// Mặt cắt elip xếp chồng theo trục y, nối thành khối liền (dùng cho thân, đầu, chân tay, quần áo)
function loft(rings: Ring[], seg = 44, caps = true): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [], R = rings.length
  for (const r of rings) for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2; pos.push(r.ox + r.rx * Math.cos(a), r.y, r.oz + r.rz * Math.sin(a)) }
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg; idx.push(a, c, b, b, c, d) }
  if (caps) {
    const lo = rings[0], hi = rings[R - 1], bi = pos.length / 3
    pos.push(lo.ox, lo.y, lo.oz); pos.push(hi.ox, hi.y, hi.oz)
    for (let j = 0; j < seg; j++) { const k = (j + 1) % seg; idx.push(bi, j, k); idx.push(bi + 1, (R - 1) * seg + k, (R - 1) * seg + j) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g
}
// Ống thon dọc theo đường cong (tóc, lông mày, môi)
function sweep(pts: THREE.Vector3[], rad: (t: number) => number, flat = 1, N = 24, seg = 10): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts), fr = c.computeFrenetFrames(N, false), pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= N; i++) {
    const p = c.getPointAt(i / N), n = fr.normals[i], b = fr.binormals[i], r = Math.max(.0003, rad(i / N))
    for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2, u = Math.cos(a) * r, w = Math.sin(a) * r * flat; pos.push(p.x + n.x * u + b.x * w, p.y + n.y * u + b.y * w, p.z + n.z * u + b.z * w) }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c2 = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg; idx.push(a, b, c2, b, d, c2) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g
}
// Chi thon từ a đến b; prof = [[t, bán kính]]
function limbGeo(L: number, prof: number[][], flat = 1, off = 0): THREE.BufferGeometry {
  return loft(curve(prof, 16).map(r => ({ y: r[0] * L, rx: r[1] + off, rz: (r[1] + off) * flat, ox: 0, oz: 0 })), 28)
}
function place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.copy(a); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())
}
const ball = (r: number, mat: THREE.Material, p: THREE.Vector3, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat); m.position.copy(p); m.scale.set(sx, sy, sz); return m }

// Bảng thân (y, rx, rz, oz) theo mét. Nữ cao 1,64 / nam cao 1,78 làm chuẩn rồi nhân theo chiều cao thật.
const TORSO_F = [[.73, .05, .055, 0], [.77, .12, .09, -.005], [.835, .176, .105, -.006], [.935, .14, .092, -.002], [1.01, .108, .08, 0], [1.1, .122, .088, .003], [1.175, .146, .103, .012], [1.235, .15, .097, .004], [1.29, .158, .088, -.002], [1.335, .15, .078, -.006], [1.358, .09, .062, -.01], [1.38, .05, .05, -.01]]
const TORSO_M = [[.79, .055, .06, 0], [.835, .13, .095, -.004], [.905, .176, .106, -.005], [1.01, .15, .1, 0], [1.1, .145, .097, 0], [1.19, .16, .105, .004], [1.275, .178, .112, .008], [1.34, .192, .105, .004], [1.4, .2, .092, -.002], [1.432, .16, .078, -.008], [1.458, .095, .066, -.01], [1.485, .06, .06, -.01]]
// Đầu cao 0,22 m ở chuẩn: [t, rx, rz, oz] với t = 0 ở cằm, 1 ở đỉnh đầu (đơn vị: tỉ lệ)
const HEAD = [[0, .03, .034, .03], [.045, .046, .048, .035], [.13, .057, .068, .02], [.26, .068, .082, .01], [.4, .072, .09, -.002], [.52, .076, .094, -.006], [.68, .077, .098, -.008], [.82, .073, .095, -.011], [.93, .058, .08, -.016], [1, .022, .035, -.015]]
const HH = .22

export type Arm = { target: THREE.Vector3 | null; handYaw?: number; curl?: number; thumb?: 1 | -1 }
export type Human = { group: THREE.Group; head: THREE.Group; lids: THREE.Group[]; slots: Record<string, THREE.Group> }

export function buildHuman(look: Look, arms: { l: Arm; r: Arm }): Human {
  const f = look.sex === 'f', H = look.height, k = H / (f ? 1.64 : 1.78), fc = look.face, bd = look.body
  const g = new THREE.Group()
  const M = (c: number, ro = .6, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: ro, ...extra })
  const skin = M(look.skin, .55), hairM = M(look.hair, .55, { metalness: 0 }), lipM = M(look.lip, .4), eyeW = M(0xfbf8f4, .3), irisM = M(look.eye, .25), pupilM = M(0x0c0707, .2)
  const slot = (name: string) => { const s = new THREE.Group(); s.name = name; g.add(s); return s }
  const slots = { body: slot('body'), hair: slot('hair'), top: slot('top'), bottom: slot('bottom'), shoes: slot('shoes'), acc: slot('acc') }
  const add = (s: THREE.Group, m: THREE.Object3D) => { s.add(m); return m }

  // ---- Thân ----
  const raw = (f ? TORSO_F : TORSO_M).map(r => [r[0] * k, r[1] * k, r[2] * k, r[3] * k])
  const wsc = (y: number) => { // hệ số theo vùng: vai/ngực/eo/hông
    const t = y / H
    return t > .78 ? bd.shoulder : t > .66 ? bd.chest : t > .58 ? lerp(bd.waist, bd.chest, sstep(.58, .66, t)) : t > .53 ? lerp(bd.hip, bd.waist, sstep(.53, .58, t)) : bd.hip
  }
  const tk = raw.map(r => [r[0], r[1] * wsc(r[0]), r[2], r[3]])
  const dense = curve(tk, 70)
  const at = (y: number) => { let i = 0; while (i < dense.length - 2 && dense[i + 1][0] < y) i++; const a = dense[i], b = dense[i + 1], u = clamp((y - a[0]) / (b[0] - a[0] || 1), 0, 1); return { rx: lerp(a[1], b[1], u), rz: lerp(a[2], b[2], u), oz: lerp(a[3], b[3], u) } }
  add(slots.body, new THREE.Mesh(loft(ringsOf(tk, 56)), skin))
  const neckTop = (f ? 1.49 : 1.575) * k, neckR = (f ? .05 : .056) * k
  const neck = new THREE.Mesh(loft([{ y: (f ? 1.35 : 1.44) * k, rx: neckR * 1.05, rz: neckR, ox: 0, oz: -.012 }, { y: neckTop, rx: neckR * .95, rz: neckR * .92, ox: 0, oz: -.016 }], 28), skin); add(slots.body, neck)

  // ---- Chân ----
  const hipX = (f ? .088 : .095) * k * bd.hip, hipY = (f ? .84 : .915) * k, kneeY = (f ? .467 : .5) * k, ankY = (f ? .074 : .08) * k, ts = bd.thigh * (f ? 1 : 1.12) * k
  const thighP = [[0, .079 * ts], [.2, .082 * ts], [.8, .056 * ts], [1, .05 * ts]], calfP = [[0, .05 * ts], [.25, .055 * ts], [.6, .04 * ts], [1, .03 * ts]]
  for (const s of [1, -1]) {
    const hp = V(s * hipX, hipY, 0), kn = V(s * (hipX + .004), kneeY, .006), an = V(s * (hipX + .004), ankY, -.004)
    const t1 = new THREE.Mesh(limbGeo(hp.distanceTo(kn), thighP), skin); place(t1, hp, kn); add(slots.body, t1)
    const c1 = new THREE.Mesh(limbGeo(kn.distanceTo(an), calfP, 1.05), skin); place(c1, kn, an); add(slots.body, c1)
    add(slots.body, ball(.05 * ts, skin, kn))
    // giày (slot shoes)
    const shoeM = M(look.shoe, .5), soleM = M(0xf2eee8, .8), W = (f ? .042 : .049) * k
    const shoeG = loft(curve([[0, .03 * k, .042 * k], [.04, .046 * k, .05 * k], [.12, W, .04 * k], [.2, .04 * k, .031 * k], [.255, .02 * k, .022 * k], [.275, .005, .008]], 18).map(r => ({ y: r[0] * k, rx: r[1], rz: r[2], ox: 0, oz: -.034 * k })), 24)
    const soleG = loft(curve([[0, .031 * k, .012], [.12, W + .002, .012], [.26, .02 * k, .01], [.278, .005, .005]], 12).map(r => ({ y: r[0] * k, rx: r[1], rz: r[2], ox: 0, oz: -.006 })), 24)
    for (const [geo, mat] of [[shoeG, shoeM], [soleG, soleM]] as [THREE.BufferGeometry, THREE.Material][]) {
      const sh = new THREE.Mesh(geo, mat); sh.rotation.x = Math.PI / 2; sh.position.set(an.x, .012 * k, an.z - .06 * k); sh.rotation.z = -s * .12; add(slots.shoes, sh)
    }
    add(slots.shoes, ball(.036 * k, shoeM, V(an.x, ankY + .012 * k, an.z), 1, 1.35, 1))
  }

  // ---- Tay + bàn tay ----
  const l1 = (f ? .285 : .31) * k, l2 = (f ? .245 : .27) * k, shY = (f ? 1.335 : 1.4) * k, shX = (f ? .156 : .19) * k * bd.shoulder, as = bd.arm * (f ? 1 : 1.2)
  const upP = [[0, .046 * as], [.3, .044 * as], [1, .034 * as]], foP = [[0, .034 * as], [.25, .036 * as], [1, .024 * as]]
  const sleeveM = M(look.top, .85)
  const armsOut: THREE.Vector3[] = []
  for (const [side, a] of [[1, arms.l], [-1, arms.r]] as [1 | -1, Arm][]) {
    const S = V(side * shX, shY, -.004)
    const tg = a.target ? a.target.clone() : S.clone().add(V(side * .052, -(l1 + l2) * .985, .01))
    let d = S.distanceTo(tg); const dir = tg.clone().sub(S).normalize(); d = Math.min(d, (l1 + l2) * .999); const W = S.clone().add(dir.clone().multiplyScalar(d))
    const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa))
    const pole = V(side * .5, -.15, -.85), perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize()
    const E = S.clone().add(dir.clone().multiplyScalar(aa)).add(perp.multiplyScalar(h))
    const u = new THREE.Mesh(limbGeo(S.distanceTo(E), upP), skin); place(u, S, E); add(slots.body, u)
    const fo = new THREE.Mesh(limbGeo(E.distanceTo(W), foP), skin); place(fo, E, W); add(slots.body, fo)
    add(slots.body, ball(.045 * as, skin, S)); add(slots.body, ball(.036 * as, skin, E)); add(slots.body, ball(.021 * as, skin, W))
    // tay áo ngắn thuộc slot top
    const se = E.clone().sub(S).multiplyScalar(f ? .5 : .56).add(S)
    const sl = new THREE.Mesh(limbGeo(S.distanceTo(se), [[0, .0505 * as], [1, .048 * as]], 1, .002), sleeveM); place(sl, S, se); add(slots.top, sl)
    add(slots.top, ball(.0495 * as * (f ? 1.03 : 1.04), sleeveM, S))
    armsOut.push(W)
    // bàn tay
    const hand = makeHand(skin, k * (f ? 1.12 : 1.18), a.curl ?? 0, a.thumb ?? side)
    hand.position.copy(W); hand.rotation.y = a.handYaw ?? 0; g.add(hand)
  }

  // ---- Quần áo (slot top / bottom) ----
  const topM = M(look.top, .85, { side: THREE.DoubleSide }), botM = M(look.bottom, .8, { side: THREE.DoubleSide })
  const band = (y0: number, y1: number, off: number, n = 14) => Array.from({ length: n }, (_, i) => { const y = lerp(y0, y1, i / (n - 1)), r = at(y); return { y, rx: r.rx + off, rz: r.rz + off, ox: 0, oz: r.oz } })
  add(slots.top, new THREE.Mesh(loft(band((f ? 1.0 : .93) * k, (f ? 1.372 : 1.468) * k, .007 * k), 56, false), topM))
  if (f) { // váy xòe
    const y0 = 1.02 * k, y1 = .53 * k, rings = Array.from({ length: 18 }, (_, i) => { const t = i / 17, y = lerp(y0, y1, t), r = at(Math.max(y, .84 * k)), fl = Math.pow(sstep(.25, 1, t), 1.1); return { y, rx: Math.max(r.rx + .014, lerp(r.rx + .014, .255 * k * bd.hip, fl)), rz: Math.max(r.rz + .009, lerp(r.rz + .009, .2 * k, fl)), ox: 0, oz: lerp(r.oz, 0, fl) } })
    add(slots.bottom, new THREE.Mesh(loft(rings, 56, false), botM))
  } else { // quần jean
    const pel = ringsOf([[.735 * k, .02 * k, .045 * k, 0], [.775 * k, .075 * k, .075 * k, 0], [.82 * k, .13 * k, .092 * k, -.003], [.86 * k, .165 * k, .102 * k, -.004], [.9 * k, at(.9 * k).rx + .009 * k, at(.9 * k).rz + .009 * k, -.004]], 12).concat(band(.92 * k, 1.12 * k, .008 * k, 10))
    add(slots.bottom, new THREE.Mesh(loft(pel, 56, false), botM)); add(slots.bottom, new THREE.Mesh(loft(pel.slice(0, 4), 56, true), botM))
    for (const s of [1, -1]) {
      const hp = V(s * hipX, hipY, 0), kn = V(s * (hipX + .004), kneeY, .006), an = V(s * (hipX + .004), ankY + .01, -.004)
      const a1 = new THREE.Mesh(limbGeo(hp.distanceTo(kn), thighP, 1, .009 * k), botM); place(a1, hp, kn); add(slots.bottom, a1)
      const a2 = new THREE.Mesh(limbGeo(kn.distanceTo(an), calfP.map(p => [p[0], p[1] * 1.0]), 1.05, .01 * k), botM); place(a2, kn, an); add(slots.bottom, a2)
      add(slots.bottom, ball(.052 * ts + .009 * k, botM, kn))
    }
  }

  // ---- Đầu ----
  const head = new THREE.Group(); head.position.set(0, neckTop - .052 * k, (f ? .004 : .006)); head.scale.setScalar(k * (f ? 1.0 : 1.05))
  const hk = HEAD.map(r => { const t = r[0]; const jawF = lerp(fc.jaw, 1, sstep(.05, .45, t)); return [t * HH, r[1] * fc.width * jawF * (f ? .96 : 1.02), r[2], r[3]] })
  const rs = ringsOf(hk, 44), fz = (y: number, x: number) => { let i = 0; while (i < rs.length - 2 && rs[i + 1].y < y) i++; const a = rs[i], b = rs[i + 1], u = clamp((y - a.y) / (b.y - a.y || 1), 0, 1), rx = lerp(a.rx, b.rx, u), rz = lerp(a.rz, b.rz, u), oz = lerp(a.oz, b.oz, u); return { z: oz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)), rx } }
  head.add(new THREE.Mesh(loft(rs, 56), skin))
  const eyeY = .54 * HH, eyeX = .031 * fc.eyeGap, er = .0125 * fc.eyeSize
  const lids: THREE.Group[] = []
  for (const s of [1, -1]) {
    const z = fz(eyeY, s * eyeX).z - .0045, eg = new THREE.Group(); eg.position.set(s * eyeX, eyeY, z); eg.rotation.y = s * .06
    eg.add(ball(er, eyeW, V())); eg.add(ball(er * .68, irisM, V(0, 0, er * .85), 1, 1, .42)); eg.add(ball(er * .29, pupilM, V(0, 0, er * .98), 1, 1, .4)); eg.add(ball(er * .15, M(0xffffff, .1, { emissive: new THREE.Color(0xffffff), emissiveIntensity: .8 }), V(er * .24, er * .26, er * 1.0)))
    const th = Math.acos(.64)
    const up = new THREE.Group(); up.add(new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 28, 14, 0, Math.PI * 2, 0, th), skin))
    const lash = new THREE.Mesh(new THREE.TorusGeometry(er * 1.1 * Math.sin(th), er * (f ? .17 : .12), 6, 28), M(f ? 0x120a08 : 0x1c1210, .5)); lash.rotation.x = Math.PI / 2; lash.position.y = er * 1.1 * Math.cos(th); up.add(lash)
    up.rotation.x = -.04; eg.add(up); lids.push(up)
    const lo = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 28, 14, 0, Math.PI * 2, Math.PI - th * .8, th * .8), skin); eg.add(lo)
    head.add(eg)
    // lông mày
    const by = eyeY + (f ? .0255 : .0225), bz = (x: number, y: number) => fz(y, x).z + .003, bp = [[.011, by - .002], [.025, by + .0035], [.042, by + .0055], [.056, by - .003]].map(p => V(s * p[0], p[1], bz(p[0], p[1])))
    head.add(new THREE.Mesh(sweep(bp, t => (.0034 + .0016 * (1 - t) ** .5) * fc.brow * (f ? .85 : 1.15), .55, 16, 8), hairM))
    // tai
    const ey = .45 * HH, ear = ball(1, skin, V(s * (fz(ey, 0).rx - .002), ey, -.012), .0065, .024, .017); ear.rotation.z = s * -.12; head.add(ear)
    // má hồng
    const bl = new THREE.Mesh(new THREE.CircleGeometry(.0165 * fc.cheek, 20), new THREE.MeshBasicMaterial({ color: f ? 0xff7e90 : 0xe8806f, transparent: true, opacity: f ? .26 : .12, depthWrite: false }))
    const bx = s * .041, by2 = .335 * HH; bl.position.set(bx, by2, fz(by2, bx).z + .0008); bl.rotation.y = s * .65; head.add(bl)
  }
  // mũi
  const ny = .335 * HH, nz = fz(ny, 0).z, nl = .0098 * fc.noseLen, nw = fc.noseWidth
  const bridge = new THREE.Mesh(sweep([V(0, eyeY - .004, fz(eyeY - .004, 0).z + .003), V(0, lerp(eyeY, ny, .6), fz(ny, 0).z + .004), V(0, ny, nz + nl)], t => .0042 + .0026 * t, 1, 12, 10), skin); head.add(bridge)
  head.add(ball(.0104 * nw, skin, V(0, ny - .001, nz + nl), 1, .9, 1))
  for (const s of [1, -1]) head.add(ball(.0072 * nw, skin, V(s * .0095 * nw, ny - .003, nz + nl * .45), 1, .9, 1))
  // môi
  const my = .205 * HH, mz = (x: number, y: number) => fz(y, x).z + .001, lf = fc.lipFull
  const pt = (arr: number[][], dy: number) => arr.map(p => V(p[0], my + p[1] + dy, mz(p[0], my + p[1] + dy)))
  head.add(new THREE.Mesh(sweep(pt([[-.021, .0022], [-.011, .0046], [-.004, .0042], [0, .0033], [.004, .0042], [.011, .0046], [.021, .0022]], .0008), t => (.0036 + .0014 * Math.sin(t * Math.PI)) * lf, .75, 22, 8), lipM))
  head.add(new THREE.Mesh(sweep(pt([[-.018, -.0012], [-.009, -.0062], [0, -.0072], [.009, -.0062], [.018, -.0012]], 0), t => (.0044 + .0018 * Math.sin(t * Math.PI)) * lf, .75, 22, 8), lipM))
  head.add(new THREE.Mesh(sweep(pt([[-.022, .0016], [-.011, .0006], [0, 0], [.011, .0006], [.022, .0016]], 0), () => .0011, 1, 14, 6), M(0x6a2e30, .5)))

  // ---- Tóc (slot hair) ----
  const hr = ringsOf(HEAD.filter(r => r[0] >= .42).map(r => [r[0] * HH, r[1] * fc.width * 1.07 + .004, r[2] * 1.06 + .004, r[3] - .002]), 40)
  const hg = loft(hr, 56, true), hp = hg.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < hp.count; i++) { // đường chân tóc: trán cao, thái dương thấp, gáy thấp
    const x = hp.getX(i), z = hp.getZ(i), fr = clamp((z + .01) / .1, 0, 1), hl = (.4 + (f ? .39 : .33) * fr * fr - .12 * fr * clamp(Math.abs(x) / .08, 0, 1)) * HH
    if (hp.getY(i) < hl) hp.setY(i, hl)
  }
  hg.computeVertexNormals(); head.add(new THREE.Mesh(hg, hairM))
  if (look.hairStyle === 'long') {
    const back = ringsOf([[-.4, .05, .02, -.086], [-.36, .09, .036, -.086], [-.27, .104, .046, -.086], [-.15, .106, .05, -.082], [-.02, .098, .046, -.076], [.08, .09, .042, -.072], [.16, .07, .04, -.07]], 24)
    head.add(new THREE.Mesh(loft(back, 40), hairM))
    for (const s of [1, -1]) {
      const lp = [V(s * .074, .12, .028), V(s * .086, .04, .036), V(s * .1, -.05, .052), V(s * .108, -.15, .086), V(s * .1, -.24, .112), V(s * .094, -.3, .12)]
      head.add(new THREE.Mesh(sweep(lp, t => (.027 + .008 * Math.sin(t * Math.PI * .9)) * (1 - .5 * t * t), .72, 28, 12), hairM))
    }
    head.add(new THREE.Mesh(sweep([V(-.004, .213, .04), V(.035, .192, .082), V(.066, .152, .084), V(.077, .108, .06)], t => .019 * (1 - .6 * t), .5, 20, 10), hairM))
    head.add(new THREE.Mesh(sweep([V(-.004, .213, .04), V(-.035, .192, .082), V(-.064, .152, .082), V(-.076, .11, .058)], t => .016 * (1 - .6 * t), .5, 20, 10), hairM))
  } else {
    const q = ball(1, hairM, V(.004, .198, .034), .068, .03, .074); q.rotation.z = -.1; head.add(q)
    for (const s of [1, -1]) head.add(new THREE.Mesh(sweep([V(s * .069, .115, .016), V(s * .071, .095, .022), V(s * .07, .078, .026)], () => .0055, .7, 6, 6), hairM))
  }
  g.add(head)
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return { group: g, head, lids, slots }
}
function makeHand(skin: THREE.Material, k: number, curl: number, thumb: number): THREE.Group {
  const h = new THREE.Group(), s = k
  const palm = ball(1, skin, V(0, -.052 * s, 0), .037 * s, .05 * s, .0175 * s); h.add(palm)
  const seg = (len: number, r: number) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 10), skin); m.position.y = -len / 2; return m }
  const lens = [.036, .041, .038, .031].map(x => x * s)
  for (let i = 0; i < 4; i++) {
    const x = (-.026 + i * .0175) * s, g1 = new THREE.Group(); g1.position.set(x, -.094 * s, 0); g1.rotation.x = -curl * .5
    const p1 = seg(lens[i] * .55, .0088 * s); g1.add(p1)
    const g2 = new THREE.Group(); g2.position.y = -lens[i] * .55; g2.rotation.x = -curl * 1.0; g2.add(seg(lens[i] * .45, .0078 * s)); g1.add(g2)
    const g3 = new THREE.Group(); g3.position.y = -lens[i] * .45; g3.rotation.x = -curl * .7; g3.add(seg(lens[i] * .35, .007 * s)); g2.add(g3)
    h.add(g1)
  }
  const tg = new THREE.Group(); tg.position.set(thumb * .034 * s, -.05 * s, .004 * s); tg.rotation.z = thumb * .55; tg.rotation.x = -.15
  const t1 = seg(.03 * s, .0105 * s); tg.add(t1); const t2 = new THREE.Group(); t2.position.y = -.03 * s; t2.rotation.z = thumb * -.25; t2.add(seg(.026 * s, .0092 * s)); tg.add(t2); h.add(tg)
  return h
}

// Cặp đôi: nữ bên trái, nam bên phải, nắm tay giữa. Trả về hàm cập nhật hoạt cảnh.
export function buildCouple(lf: Look = LOOK_F, lm: Look = LOOK_M) {
  const root = new THREE.Group(), yawF = .3, yawM = -.3, posF = V(-.285, 0, 0), posM = V(.295, 0, .0)
  const toLocal = (w: THREE.Vector3, p: THREE.Vector3, yaw: number) => { const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)); return w.clone().applyMatrix4(m.invert()) }
  const handF = V(-.012, .8, .085), handM = V(.036, .83, .075)
  const F = buildHuman(lf, { l: { target: toLocal(handF, posF, yawF), handYaw: Math.PI / 2 - yawF, curl: 1.0, thumb: -1 }, r: { target: null } })
  const Mn = buildHuman(lm, { r: { target: toLocal(handM, posM, yawM), handYaw: -Math.PI / 2 - yawM, curl: 1.0, thumb: 1 }, l: { target: null } })
  F.group.position.copy(posF); F.group.rotation.y = yawF; Mn.group.position.copy(posM); Mn.group.rotation.y = yawM
  root.add(F.group, Mn.group)
  let nextBlink = 2, blinkT = -1
  const tick = (t: number, calm: boolean) => {
    if (calm) return
    F.head.rotation.set(Math.sin(t * .7) * .015 - .02, Math.sin(t * .45) * .05 - .12, Math.sin(t * .5) * .02)
    Mn.head.rotation.set(Math.sin(t * .6 + 1) * .015 - .01, Math.sin(t * .4 + 2) * .05 + .12, Math.sin(t * .5 + 1) * .02)
    if (blinkT < 0 && t > nextBlink) { blinkT = t; nextBlink = t + 2.5 + Math.random() * 3 }
    const b = blinkT >= 0 ? Math.sin(clamp((t - blinkT) / .16, 0, 1) * Math.PI) : 0
    if (blinkT >= 0 && t - blinkT > .16) blinkT = -1
    for (const l of [...F.lids, ...Mn.lids]) l.rotation.x = -.04 + b * 1.1
  }
  return { root, F, M: Mn, tick }
}

// Gắn vào canvas: đèn, nền, kéo để xoay, tự dừng khi tab ẩn. Trả về hàm dọn.
export function mountCouple(canvas: HTMLCanvasElement, opt: { lf?: Look; lm?: Look; calm?: boolean; view?: { az?: number; fov?: number; y?: number; dist?: number; x?: number } } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false })
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(opt.view?.fov ?? 28, 1, .1, 50)
  scene.add(new THREE.HemisphereLight(0xfff4f8, 0xf3c9d9, 1.15))
  const key = new THREE.DirectionalLight(0xfff6ee, 2.3); key.position.set(1.6, 3.2, 3.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -.0005
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -.5, near: .5, far: 10 }); scene.add(key)
  const rim = new THREE.DirectionalLight(0xffb6d2, 1.2); rim.position.set(-2.5, 2.2, -2.5); scene.add(rim)
  const fill = new THREE.DirectionalLight(0xdfe8ff, .55); fill.position.set(-3, 1.2, 2.5); scene.add(fill)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(.8, 64), new THREE.MeshStandardMaterial({ color: 0xffd9e8, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
  const edge = new THREE.Mesh(new THREE.TorusGeometry(.8, .012, 8, 96), new THREE.MeshStandardMaterial({ color: 0x5b1f3a, roughness: .7 })); edge.rotation.x = Math.PI / 2; scene.add(edge)
  const c = buildCouple(opt.lf, opt.lm), pivot = new THREE.Group(); pivot.add(c.root); scene.add(pivot)
  const reduce = !!opt.calm || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  let drag = false, lastX = 0, yaw = opt.view?.az ?? 0, vel = 0
  const down = (e: PointerEvent) => { drag = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId) }
  const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw = clamp(yaw + dx * .008, -1.2, 1.2); vel = dx * .008 }
  const up = () => { drag = false }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
  canvas.style.touchAction = 'pan-y'
  const size = () => { const w = canvas.clientWidth || 360, h = canvas.clientHeight || 420; r.setSize(w, h, false); cam.aspect = w / h; const d = opt.view?.dist ?? (w / h < .9 ? 5.3 : 4.8); const vx = opt.view?.x ?? 0, vy = opt.view?.y ?? .88; cam.position.set(vx, vy + .2 * (d / 4.9), d); cam.lookAt(vx, vy, 0); cam.updateProjectionMatrix() }
  size(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null; ro?.observe(canvas)
  let raf = 0, t0 = performance.now()
  const loop = () => {
    raf = requestAnimationFrame(loop); if (document.hidden) return
    const t = (performance.now() - t0) / 1000
    if (!drag) { vel *= .92; yaw = clamp(yaw + vel, -1.2, 1.2) }
    pivot.rotation.y = yaw + (reduce || drag ? 0 : Math.sin(t * .35) * .12)
    c.tick(t, reduce); r.render(scene, cam)
  }
  loop()
  return {
    renderOnce: () => { c.tick(0, true); r.render(scene, cam) }, setYaw: (v: number) => { yaw = v; pivot.rotation.y = v }, couple: c,
    dispose: () => { cancelAnimationFrame(raf); ro?.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mt = m.material; (Array.isArray(mt) ? mt : [mt]).forEach(x => x.dispose()) } }); r.dispose() },
  }
}
