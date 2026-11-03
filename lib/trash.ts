import { sb } from '@/lib/supabase'

export const KEEP_DAYS = 30
const mediaPaths = (m: any): string[] => Array.from(new Set([...(m.photos ?? []), ...(m.media ?? []).flatMap((x: any) => [x.path, x.thumb_path])].filter(Boolean)))

// Xóa vĩnh viễn các khoảnh khắc đã nằm trong thùng rác quá 30 ngày (xóa tệp trước, xóa dòng sau để không mồ côi tệp)
export async function purgeOld(): Promise<number> {
  const { data } = await sb.from('moments').select('id,photos,media(path,thumb_path)').lt('deleted_at', new Date(Date.now() - KEEP_DAYS * 864e5).toISOString()).limit(50)
  if (!data?.length) return 0
  return (await destroy(data)) ? data.length : 0
}
export async function destroy(rows: any[]): Promise<boolean> {
  const paths = rows.flatMap(mediaPaths)
  if (paths.length) { const { error } = await sb.storage.from('media').remove(paths); if (error) return false }
  const { error } = await sb.from('moments').delete().in('id', rows.map(r => r.id))
  return !error
}
