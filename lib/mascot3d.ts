import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Linh vật Shiba 3D (public/models/shiba.glb). Mô hình là lưới tĩnh, không có xương/animation,
// nên mọi chuyển động được tính bằng code: cúi/nghiêng đầu theo ngón tay, vẫy đuôi, thở, chớp mắt, nhảy.
// Mô hình nhìn về +z, y hướng lên; 3 phần: [0] vòng cổ, [1] thân + đầu + đuôi, [2] đôi mắt.

export type MascotAct = 'hop' | 'shake' | 'sniff' | 'wag' | 'spin'
export type MascotHandle = {
  poke: () => void                     // bấm vào: nhảy, vẫy đuôi, híp mắt
  look: (nx: number, ny: number) => void // hướng nhìn, -1..1 (ra ngoài vùng thì thả về null)
  unlook: () => void
  talk: (on: boolean) => void          // đang nói: gật gù nhẹ, vẫy đuôi
  face: (dir: 1 | -1) => void          // hướng mặt: 1 = quay sang phải màn hình, -1 = sang trái
  act: (a: MascotAct) => void
  dispose: () => void
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const damp = (cur: number, to: number, k: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-k * dt))

const NECK = new THREE.Vector3(0, -0.22, -0.28)   // trục xoay đầu
const TAIL = new THREE.Vector3(0, -0.34, -0.98)   // gốc đuôi
const FEET = 1.005                                  // đáy chân nằm ở y = -1.005
const CZ = -0.52                                    // tâm thân theo z, để xoay quanh giữa con chó

type Part = { geo: THREE.BufferGeometry; orig: Float32Array; kind: 'collar' | 'body' | 'eyes' }

export async function mountMascot(canvas: HTMLCanvasElement, opt: { url?: string; calm?: boolean } = {}): Promise<MascotHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  renderer.setPixelRatio(dpr)

  const gltf = await new GLTFLoader().loadAsync(opt.url ?? '/models/shiba.glb')
  gltf.scene.updateMatrixWorld(true)

  // Nướng ma trận của từng nút vào lưới để toạ độ đỉnh là toạ độ thế giới (y lên, mặt về +z)
  const scene = new THREE.Scene()
  const root = new THREE.Group()          // nhảy lên xuống
  const squash = new THREE.Group()        // co giãn, gốc ở đáy chân
  const yawG = new THREE.Group()          // xoay thân
  const inner = new THREE.Group()
  inner.position.set(0, FEET, -CZ)
  yawG.add(inner); squash.add(yawG); root.add(squash); scene.add(root)

  const parts: Part[] = []
  const order = ['collar', 'body', 'eyes'] as const
  const metas: { mesh: THREE.Mesh; size: number }[] = []
  gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; metas.push({ mesh: m, size: m.geometry.attributes.position.count }) } })
  // Nhận diện phần theo số đỉnh: ít nhất = mắt, nhiều nhất = thân, còn lại = vòng cổ
  const bySize = [...metas].sort((a, b) => a.size - b.size)
  const kindOf = new Map<THREE.Mesh, Part['kind']>()
  if (bySize.length >= 3) { kindOf.set(bySize[0].mesh, 'eyes'); kindOf.set(bySize[1].mesh, 'collar'); kindOf.set(bySize[2].mesh, 'body') }
  else bySize.forEach(m => kindOf.set(m.mesh, 'body'))
  for (const { mesh } of metas) {
    const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld)
    const mat = (mesh.material as THREE.Material).clone(); (mat as any).side = THREE.DoubleSide
    if ((mat as THREE.MeshBasicMaterial).map) (mat as THREE.MeshBasicMaterial).map!.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false
    inner.add(m)
    parts.push({ geo, orig: Float32Array.from(geo.attributes.position.array as Float32Array), kind: kindOf.get(mesh)! })
  }
  void order

  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
  cam.position.set(0, 0.95, 4.9); cam.lookAt(0, 0.62, 0)

  // ---- trạng thái chuyển động ----
  const S = {
    t: 0, dir: 1 as 1 | -1, yaw: 0.55, headYaw: 0, headNod: 0, headTilt: 0, lookX: 0, lookY: 0, looking: false,
    hop: 0, hopT: -1, shake: 0, sniff: 0, spin: -1, wagBoost: 0, squint: 0, talking: false,
    nextBlink: 1.5, blink: 0, nextIdle: 3, idleHeadT: 0, idleHeadYaw: 0, idleHeadNod: 0,
  }
  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  const act = (a: MascotAct) => {
    if (a === 'hop') S.hopT = 0
    else if (a === 'shake') S.shake = 1
    else if (a === 'sniff') S.sniff = 1
    else if (a === 'wag') S.wagBoost = 1
    else if (a === 'spin') S.spin = 0
  }

  const v = new THREE.Vector3()
  const apply = () => {
    const wagA = (0.34 + 0.5 * S.wagBoost + (S.talking ? 0.15 : 0)) * Math.sin(S.t * (7 + 8 * S.wagBoost))
    const breathe = 1 + 0.012 * Math.sin(S.t * 2.1)
    const rx = S.headNod + (S.talking ? 0.05 * Math.sin(S.t * 9) : 0) + 0.18 * S.sniff * Math.sin(S.t * 14)
    const ry = S.headYaw, rz = S.headTilt
    const eul = new THREE.Euler(rx, ry, rz, 'YXZ')
    const R = new THREE.Matrix4().makeRotationFromEuler(eul)
    const eyeCy = -0.025, eyeK = clamp(1 - S.blink - S.squint, 0.06, 1)
    for (const p of parts) {
      const pos = p.geo.attributes.position as THREE.BufferAttribute, o = p.orig
      for (let i = 0; i < pos.count; i++) {
        let x = o[i * 3], y = o[i * 3 + 1], z = o[i * 3 + 2]
        if (p.kind === 'eyes') y = eyeCy + (y - eyeCy) * eyeK              // chớp / híp mắt
        else y = -FEET + (y + FEET) * breathe                              // thở
        // đuôi vẫy quanh trục y
        const tw = sstep(-0.98, -1.2, z) * (1 - sstep(0.16, 0.3, Math.abs(x)))
        if (tw > 0 && p.kind === 'body') {
          const a = wagA * tw, c = Math.cos(a), s = Math.sin(a), dx = x - TAIL.x, dz = z - TAIL.z
          x = TAIL.x + dx * c + dz * s; z = TAIL.z - dx * s + dz * c
        }
        // đầu: cúi / quay / nghiêng quanh cổ (trọng số mượt theo vị trí)
        const hw = sstep(-0.5, -0.12, z) * sstep(-0.36, -0.2, y)
        if (hw > 0) {
          v.set(x - NECK.x, y - NECK.y, z - NECK.z).applyMatrix4(R)
          x += (v.x + NECK.x - x) * hw; y += (v.y + NECK.y - y) * hw; z += (v.z + NECK.z - z) * hw
        }
        pos.setXYZ(i, x, y, z)
      }
      pos.needsUpdate = true
    }
  }

  const step = (dt: number) => {
    S.t += dt
    // chớp mắt
    S.nextBlink -= dt
    if (S.nextBlink <= 0) { S.blink = 1; S.nextBlink = rand(2.2, 5.5) }
    S.blink = Math.max(0, S.blink - dt * 7)
    S.squint = Math.max(0, S.squint - dt * 0.9)
    // việc vặt ngẫu nhiên khi rảnh: nhìn quanh, ngửi, lắc người, vẫy đuôi, nhảy nhẹ
    S.nextIdle -= dt
    if (S.nextIdle <= 0) {
      S.nextIdle = rand(4, 9)
      const r = Math.random()
      if (!S.looking) {
        if (r < 0.35) { S.idleHeadYaw = rand(-0.5, 0.5); S.idleHeadNod = rand(-0.1, 0.18); S.idleHeadT = rand(1.2, 2.4) }
        else if (r < 0.55) act('sniff'); else if (r < 0.7) act('shake'); else if (r < 0.88) act('wag'); else act('hop')
      }
    }
    S.idleHeadT -= dt; if (S.idleHeadT <= 0) { S.idleHeadYaw = 0; S.idleHeadNod = 0 }
    S.wagBoost = Math.max(0, S.wagBoost - dt * 0.45)
    S.sniff = Math.max(0, S.sniff - dt * 0.8)
    S.shake = Math.max(0, S.shake - dt * 1.2)
    // hướng nhìn
    const wantYaw = S.looking ? clamp(S.lookX, -1, 1) * 0.65 : S.idleHeadYaw
    const wantNod = S.looking ? clamp(-S.lookY, -1, 1) * 0.28 : S.idleHeadNod
    S.headYaw = damp(S.headYaw, wantYaw, 7, dt); S.headNod = damp(S.headNod, wantNod, 7, dt)
    S.headTilt = damp(S.headTilt, S.looking ? clamp(S.lookX, -1, 1) * -0.12 : 0, 6, dt)
    // thân xoay nhẹ theo, + lắc người, + xoay vòng
    let spinA = 0
    if (S.spin >= 0) { S.spin += dt / 0.9; spinA = (1 - Math.pow(1 - Math.min(S.spin, 1), 3)) * Math.PI * 2; if (S.spin >= 1) S.spin = -1 }
    const targetYaw = 0.55 * S.dir + (S.looking ? S.lookX * 0.22 : 0) + 0.12 * S.shake * Math.sin(S.t * 28) + spinA
    S.yaw = damp(S.yaw, targetYaw, S.spin >= 0 ? 60 : 8, dt)
    yawG.rotation.y = S.yaw
    // nhảy: parabol + co giãn trước khi bật / khi chạm đất
    let h = 0, sq = 0
    if (S.hopT >= 0) {
      S.hopT += dt / 0.62; const u = S.hopT
      if (u < 0.14) sq = -0.1 * (u / 0.14)                                     // dồn lực
      else if (u < 0.86) { const k = (u - 0.14) / 0.72; h = 0.62 * 4 * k * (1 - k); sq = 0.06 * Math.sin(k * Math.PI) }
      else if (u < 1) sq = -0.1 * Math.sin(((u - 0.86) / 0.14) * Math.PI)      // chạm đất
      else S.hopT = -1
    }
    root.position.y = h
    const talkBob = S.talking ? 0.012 * Math.sin(S.t * 9) : 0
    squash.scale.set(1 - sq * 0.5, 1 + sq + talkBob, 1 - sq * 0.5)
    apply()
  }

  // ---- khung hình ----
  const resize = () => {
    const w = canvas.clientWidth || 140, hh = canvas.clientHeight || 140
    renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(() => { resize(); draw() }); ro.observe(canvas)
  const draw = () => renderer.render(scene, cam)

  let raf = 0, last = 0, visible = true, alive = true
  const calm = !!opt.calm
  const loop = (now: number) => {
    raf = 0
    if (!alive) return
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now
    step(dt); draw()
    if (visible && !document.hidden) raf = requestAnimationFrame(loop)
  }
  const kick = () => { if (!raf && alive && !calm) { last = 0; raf = requestAnimationFrame(loop) } }
  const io = new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true; if (visible) kick() })
  io.observe(canvas)
  const onVis = () => { if (!document.hidden) kick() }
  document.addEventListener('visibilitychange', onVis)
  const oneFrame = () => { step(0.016); draw() }
  oneFrame(); kick()

  return {
    poke: () => { S.squint = 1; S.wagBoost = 1; if (calm) { oneFrame(); return } act('hop'); kick() },
    look: (nx, ny) => { S.looking = true; S.lookX = nx; S.lookY = ny; if (calm) oneFrame(); else kick() },
    unlook: () => { S.looking = false; if (calm) oneFrame() },
    talk: on => { S.talking = on && !calm; kick() },
    face: dir => { S.dir = dir; if (calm) { S.yaw = 0.55 * dir; oneFrame() } else kick() },
    act: a => { if (calm) return; act(a); kick() },
    dispose: () => {
      alive = false; if (raf) cancelAnimationFrame(raf)
      io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis)
      for (const p of parts) p.geo.dispose()
      scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m) { m.map?.dispose(); m.dispose() } })
      renderer.dispose()
    },
  }
}
