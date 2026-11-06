import { LOOK_F, LOOK_M, type Look } from '@/lib/human3d'

// Cửa hàng đồ cho hai nhân vật (khu Cấp độ). Giá, cấp cần có và nữ/nam do server quyết định (bảng shop_items, phase15.sql).
// File này chỉ giữ HÌNH DẠNG 3D của từng món, khớp theo id. Món có trong DB mà thiếu ở đây thì không hiện (không mặc được).
export const SLOTS = ['hair', 'top', 'bottom', 'shoes', 'makeup', 'glasses', 'hat', 'neck'] as const
export type Slot = typeof SLOTS[number]
export const SLOT_LABEL: Record<Slot, string> = { hair: 'Tóc', top: 'Áo', bottom: 'Quần/váy', shoes: 'Giày', makeup: 'Trang điểm', glasses: 'Kính', hat: 'Mũ', neck: 'Cổ' }

export type Item = { id: string; slot: Slot; name: string; price: number; sex: 'any' | 'f' | 'm'; min_level: number; sort: number }
export type Outfit = Partial<Record<Slot, string>>

export const VISUAL: Record<string, Partial<Look>> = {
  hair_chestnut_long: { hair: 0x6b3f2a, hairStyle: 'long' },
  hair_rose_long: { hair: 0xe79bb5, hairStyle: 'long' },
  hair_lavender_long: { hair: 0xb59be0, hairStyle: 'long' },
  hair_brown_short: { hair: 0x6b4630, hairStyle: 'short' },
  hair_ash_short: { hair: 0x8d8a92, hairStyle: 'short' },
  hair_teal_short: { hair: 0x2f9a93, hairStyle: 'short' },

  top_white_tee: { top: 0xffffff },
  top_mint_tee: { top: 0xb8e6d3 },
  top_red_tee: { top: 0xf2767f },
  top_yellow_hoodie: { top: 0xf8d56b, sleeve: 'long' },
  top_black_long: { top: 0x2a2530, sleeve: 'long' },

  bot_pink_skirt: { bottom: 0xffb3cf, botKind: 'skirt' },
  bot_denim_skirt: { bottom: 0x5b7fb0, botKind: 'skirt' },
  bot_black_pants_f: { bottom: 0x2a2530, botKind: 'pants' },
  bot_black_pants_m: { bottom: 0x2a2530, botKind: 'pants' },
  bot_khaki_pants: { bottom: 0xc9b48a, botKind: 'pants' },
  bot_denim_shorts: { bottom: 0x5b7fb0, botKind: 'shorts' },

  shoe_pink: { shoe: 0xffb3cf },
  shoe_black: { shoe: 0x2a2530 },
  shoe_red: { shoe: 0xe0525e },
  shoe_gold: { shoe: 0xe8c26a },

  mk_rose_lip: { lip: 0xe0707f },
  mk_coral_lip: { lip: 0xf08a73 },
  mk_blush: { blush: 2.4 },
  mk_berry_lip: { lip: 0x9c3050 },

  gl_round: { glasses: { shape: 'round', color: 0x3a2a2a } },
  gl_square: { glasses: { shape: 'square', color: 0x1c1c24 } },
  gl_gold_round: { glasses: { shape: 'round', color: 0xe8c26a } },

  hat_cap: { hat: { kind: 'cap', color: 0xf2767f } },
  hat_beanie: { hat: { kind: 'beanie', color: 0xa9d3f0 } },
  hat_crown: { hat: { kind: 'crown', color: 0xf0c75e } },

  neck_heart: { neck: { kind: 'heart', color: 0xff7fac } },
  neck_scarf: { neck: { kind: 'scarf', color: 0xe05d66 } },
  neck_pearl: { neck: { kind: 'pearl', color: 0xfaf3ea } },
}

// Dáng nhân vật = dáng mặc định + các món đang mặc. `preview` là món đang thử (chưa mua cũng xem được), thay cho món cùng ô.
export function lookFor(sex: 'f' | 'm', outfit: Outfit | null | undefined, preview?: Item | null): Look {
  const o: Outfit = { ...(outfit ?? {}) }
  if (preview) o[preview.slot] = preview.id
  let look: Look = { ...(sex === 'f' ? LOOK_F : LOOK_M) }
  for (const s of SLOTS) { const v = o[s] && VISUAL[o[s]!]; if (v) look = { ...look, ...v } }
  return look
}

// Màu đại diện của món, để vẽ chấm màu trên thẻ (cửa hàng chưa có ảnh minh họa)
export function swatch(id: string): string {
  const v = VISUAL[id]; if (!v) return '#ddd'
  const n = v.top ?? v.bottom ?? v.shoe ?? v.hair ?? v.lip ?? v.glasses?.color ?? v.hat?.color ?? v.neck?.color ?? (v.blush ? 0xff8fb8 : 0xdddddd)
  return '#' + n.toString(16).padStart(6, '0')
}

export type Char = { user_id: string; space_id: string; sex: 'f' | 'm'; outfit: Outfit }
export type Person = { images: number; earned: number; spent: number; balance: number }
export type Stats = {
  rules: { day_shared: number; img_shared: number; img_personal: number; img_daily_cap: number }
  days: number; xp: number; level: number; level_from: number; level_to: number
  shared: { earned: number; spent: number; balance: number }
  people: Record<string, Person>
}
export const pts = (n: number) => n.toLocaleString('vi-VN')
