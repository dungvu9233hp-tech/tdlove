#!/usr/bin/env python3
"""Apply the tdlove audit fixes to a clean checkout of dungvu9233hp-tech/tdlove.

Run from the repository root:  py apply_tdlove_fix.py
The script is intentionally strict: it aborts if source anchors do not match.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
BACKUP_FILES = [
    "package.json", "README.md", "supabase/phase9.sql", "supabase/phase16.sql",
    "app/(app)/map/page.tsx", "app/(app)/chat/page.tsx",
    "components/DiaryForm.tsx", "components/MomentForm.tsx", "components/PlaceReview.tsx",
    "lib/media.ts",
]
BACKUP_DIR = ROOT / ".tdlove_fix_backup"
for relative in BACKUP_FILES:
    source = ROOT / relative
    backup = BACKUP_DIR / relative
    if source.is_file() and not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, backup)


def read(path: str) -> str:
    p = ROOT / path
    if not p.is_file():
        raise FileNotFoundError(f"Không thấy {path}. Hãy chạy script tại thư mục gốc repository.")
    return p.read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8", newline="\n")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: cần đúng 1 anchor, nhưng tìm thấy {count}. Không ghi file này.")
    write(path, content.replace(old, new, 1))


def replace_all(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"{path}: không tìm thấy anchor {old!r}.")
    write(path, content.replace(old, new))


# ---------------------------------------------------------------------------
# 1) Next.js + React: App Router của Next 15 dùng React 19.
# 15.5.29 và React 19.3.1 là các bản đã có security fixes ở thời điểm 2026-11-07.
# ---------------------------------------------------------------------------
pkg = json.loads(read("package.json"))
pkg.setdefault("dependencies", {})["next"] = "15.5.29"
pkg["dependencies"]["react"] = "19.3.1"
pkg["dependencies"]["react-dom"] = "19.3.1"
pkg.setdefault("devDependencies", {})["@types/react"] = "^19.3.0"
pkg["devDependencies"]["@types/react-dom"] = "^19.3.0"
write("package.json", json.dumps(pkg, ensure_ascii=False, indent=1) + "\n")

# ---------------------------------------------------------------------------
# 2) Timeline: use an effect driven by the current index, not a stale callback.
# ---------------------------------------------------------------------------
replace_once(
    "app/(app)/map/page.tsx",
    "  const [playTimer, setPlayTimer] = useState<NodeJS.Timeout | null>(null)\n",
    "",
)
replace_once(
    "app/(app)/map/page.tsx",
    "  const [missingMoments, setMissingMoments] = useState<any[]>([])\n  const [attachingMomentId, setAttachingMomentId] = useState<string | null>(null)\n",
    "  const [missingMoments, setMissingMoments] = useState<any[]>([])\n"
    "  const [missingThumbUrls, setMissingThumbUrls] = useState<Record<string, string>>({})\n"
    "  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)\n"
    "  const [savingLocationId, setSavingLocationId] = useState<string | null>(null)\n",
)
replace_once(
    "app/(app)/map/page.tsx",
    "      const thumbPromise = sign([pin.kind === 'moment' ? pin.ref_id : ''])\n",
    "",
)
old_timeline = """  // Timeline playback
  const playStep = useCallback(() => {
    if (timelineIndex >= visiblePins.length - 1) {
      setPlaying(false)
      setPlayTimer(null)
      return
    }
    const next = timelineIndex + 1
    setTimelineIndex(next)
    map.current?.flyTo([visiblePins[next].lat, visiblePins[next].lng], map.current.getZoom(), {
      duration: Math.min(2, 0.5 + haversine(visiblePins[next].lat, visiblePins[next].lng, visiblePins[next - 1]?.lat ?? 0, visiblePins[next - 1]?.lng ?? 0) / 50000)
    })
    const timer = setTimeout(playStep, 1500)
    setPlayTimer(timer)
  }, [timelineIndex, visiblePins])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      if (playTimer) { clearTimeout(playTimer); setPlayTimer(null) }
    } else {
      if (timelineIndex >= visiblePins.length - 1) setTimelineIndex(-1)
      setPlaying(true)
      playStep()
    }
  }

  useEffect(() => {
    return () => { if (playTimer) clearTimeout(playTimer) }
  }, [playTimer])

  // Stop playback when changing chip or mode
  useEffect(() => {
    if (mode !== 'memory' || playing) {
      setPlaying(false)
      if (playTimer) { clearTimeout(playTimer); setPlayTimer(null) }
    }
    setTimelineIndex(-1)
    fit.current = false
  }, [mode, selectedChip])
"""
new_timeline = """  // Timeline playback: mỗi bước đọc timelineIndex mới nhất, không giữ closure cũ.
  useEffect(() => {
    if (!playing) return
    const nextIndex = timelineIndex + 1
    if (nextIndex >= processedPins.length) {
      setPlaying(false)
      return
    }

    const timer = window.setTimeout(() => {
      const nextPin = processedPins[nextIndex]
      const previousPin = processedPins[nextIndex - 1]
      setTimelineIndex(nextIndex)
      if (nextPin && map.current) {
        const duration = previousPin
          ? Math.min(2, 0.5 + haversine(nextPin.lat, nextPin.lng, previousPin.lat, previousPin.lng) / 50000)
          : 0.8
        map.current.flyTo([nextPin.lat, nextPin.lng], map.current.getZoom(), { duration })
      }
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [playing, timelineIndex, processedPins])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (!processedPins.length) return
    if (timelineIndex >= processedPins.length - 1) setTimelineIndex(-1)
    setPlaying(true)
  }

  // Dừng phát lại khi đổi khoảng thời gian hoặc chuyển chế độ.
  useEffect(() => {
    setPlaying(false)
    setTimelineIndex(-1)
    fit.current = false
  }, [mode, selectedChip])
"""
replace_once("app/(app)/map/page.tsx", old_timeline, new_timeline)

# ---------------------------------------------------------------------------
# 3) PlacePicker: one picker for one explicitly selected Moment; sign thumbnails.
# ---------------------------------------------------------------------------
old_missing_logic = """  // Missing moments list
  const loadMissingMoments = async () => {
    const { data } = await sb.rpc('moments_missing_coords', { p_limit: 50, p_offset: 0 })
    setMissingMoments(data ?? [])
    setShowMissingList(true)
  }

  const attachLocation = async (momentId: string, place: { lat: number; lng: number; name: string }) => {
    setAttachingMomentId(momentId)
    const { error } = await sb.rpc('set_moment_location', { p_moment_id: momentId, p_lat: place.lat, p_lng: place.lng, p_place: place.name })
    setAttachingMomentId(null)
    if (error) return alert(error.message)
    loadMissingMoments()
    loadMemories()
  }
"""
new_missing_logic = """  // Missing moments list: RPC trả về storage path, nên phải ký URL trước khi hiển thị ảnh.
  const loadMissingMoments = async () => {
    const { data, error } = await sb.rpc('moments_missing_coords', { p_limit: 50, p_offset: 0 })
    if (error) return alert(error.message)
    const rows = data ?? []
    const urls = await sign(rows.map((m: any) => m.thumb_path))
    setMissingThumbUrls(urls)
    setMissingMoments(rows)
    const { data: count } = await sb.rpc('moments_missing_coords_count')
    if (typeof count === 'number') setMissingCount(count)
    setShowMissingList(rows.length > 0)
  }

  const attachLocation = async (momentId: string, place: { lat: number; lng: number; name: string }) => {
    setSavingLocationId(momentId)
    try {
      const { error } = await sb.rpc('set_moment_location', {
        p_moment_id: momentId, p_lat: place.lat, p_lng: place.lng, p_place: place.name
      })
      if (error) throw new Error(error.message)
      setSelectedMomentId(null)
      await Promise.all([loadMissingMoments(), loadMemories()])
    } catch (e: any) {
      alert(e?.message ?? 'Không lưu được địa điểm cho kỷ niệm.')
    } finally {
      setSavingLocationId(null)
    }
  }
"""
replace_once("app/(app)/map/page.tsx", old_missing_logic, new_missing_logic)

old_missing_ui = """        {/* Missing moments modal/list */}
        {showMissingList && missingMoments.length > 0 && (
          <div className="k li" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div className="k" style={{background:'white',borderRadius:16,padding:20,width:'100%',maxWidth:400,maxHeight:'80vh',overflow:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <b>Gắn vị trí cho {missingMoments.length} kỷ niệm cũ</b>
                <button className="pill" onClick={() => setShowMissingList(false)}>✕</button>
              </div>
              {missingMoments.map(m => (
                <div key={m.id} className="k" style={{display:'flex',flexDirection:'column',gap:8,padding:12,borderRadius:12,background:'#fafafa',marginBottom:12}}>
                  {m.thumb_path && (
                    <div style={{position:'relative'}}>
                      <img src={m.thumb_path} alt="" style={{width:'100%',height:160,objectFit:'cover', borderRadius:8}} />
                    </div>
                  )}
                  <b>{m.title}</b>
                  <div className="s">{new Date(m.taken_on).toLocaleDateString('vi-VN')}{m.place ? ' · ' + m.place : ''}</div>
                  <PlacePicker onClose={() => {}} onPick={place => attachLocation(m.id, place)} />
                </div>
              ))}
            </div>
          </div>
        )}
"""
new_missing_ui = """        {/* Missing moments modal/list */}
        {showMissingList && missingMoments.length > 0 && (
          <div className="k li" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div className="k" style={{background:'white',borderRadius:16,padding:20,width:'100%',maxWidth:400,maxHeight:'80vh',overflow:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <b>Gắn vị trí cho {missingMoments.length} kỷ niệm cũ</b>
                <button className="pill" onClick={() => { setShowMissingList(false); setSelectedMomentId(null) }}>✕</button>
              </div>
              {missingMoments.map(m => (
                <div key={m.id} className="k" style={{display:'flex',flexDirection:'column',gap:8,padding:12,borderRadius:12,background:'#fafafa',marginBottom:12}}>
                  {m.thumb_path && missingThumbUrls[m.thumb_path] && (
                    <div style={{position:'relative'}}>
                      <img src={missingThumbUrls[m.thumb_path]} alt="" loading="lazy" style={{width:'100%',height:160,objectFit:'cover', borderRadius:8}} />
                    </div>
                  )}
                  <b>{m.title}</b>
                  <div className="s">{new Date(m.taken_on).toLocaleDateString('vi-VN')}{m.place ? ' · ' + m.place : ''}</div>
                  <button className="pill" disabled={!!savingLocationId} onClick={() => setSelectedMomentId(m.id)}>
                    {savingLocationId === m.id ? 'Đang lưu…' : 'Chọn vị trí cho kỷ niệm này'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedMomentId && missingMoments.some(m => m.id === selectedMomentId) && (
          <PlacePicker
            onClose={() => setSelectedMomentId(null)}
            onPick={place => attachLocation(selectedMomentId, place)}
          />
        )}
"""
replace_once("app/(app)/map/page.tsx", old_missing_ui, new_missing_ui)

# ---------------------------------------------------------------------------
# 4) Media Storage: path-scoped uploads and short, user-scoped signed URL cache.
# ---------------------------------------------------------------------------
for path in ["components/DiaryForm.tsx", "components/MomentForm.tsx", "components/PlaceReview.tsx"]:
    replace_once(
        path,
        "    const base = `${space.id}/${uid()}`, made: string[] = []\n    try {\n",
        "    const made: string[] = []\n    try {\n"
        "      const { data: { user } } = await sb.auth.getUser()\n"
        "      if (!user) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')\n"
        "      const base = `${space.id}/${user.id}/${uid()}`\n",
    )

replace_once(
    "app/(app)/chat/page.tsx",
    "const path = `${space.id}/${crypto.randomUUID()}.${vid ? (f.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'}`",
    "const path = `${space.id}/${me.id}/${crypto.randomUUID()}.${vid ? (f.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'}`",
)
replace_once(
    "app/(app)/chat/page.tsx",
    "const path = `${space.id}/${crypto.randomUUID()}.${ext}`",
    "const path = `${space.id}/${me.id}/${crypto.randomUUID()}.${ext}`",
)

# The cache must not reuse a signed URL across two accounts on the same browser.
replace_once(
    "lib/media.ts",
    "export async function sign(paths: (string | null | undefined)[], ttl = 3600): Promise<Record<string, string>> {\n"
    "  const want = Array.from(new Set(paths.filter(Boolean) as string[])), out: Record<string, string> = {}, now = Date.now(), miss: string[] = []\n"
    "  for (const p of want) { const c = cache.get(p); if (c && c.exp > now + 60000) out[p] = c.u; else miss.push(p) }\n"
    "  if (miss.length) {\n"
    "    const { data } = await sb.storage.from('media').createSignedUrls(miss, ttl)\n"
    "    for (const x of data ?? []) if (x.path && x.signedUrl) { out[x.path] = x.signedUrl; cache.set(x.path, { u: x.signedUrl, exp: now + ttl * 1000 }) }\n"
    "  }\n"
    "  return out\n"
    "}",
    "export async function sign(paths: (string | null | undefined)[], ttl = 300): Promise<Record<string, string>> {\n"
    "  const { data: { session } } = await sb.auth.getSession()\n"
    "  const cacheScope = session?.user.id ?? 'anon'\n"
    "  const want = Array.from(new Set(paths.filter(Boolean) as string[])), out: Record<string, string> = {}, now = Date.now(), miss: string[] = []\n"
    "  for (const p of want) { const c = cache.get(`${cacheScope}:${p}`); if (c && c.exp > now + 60000) out[p] = c.u; else miss.push(p) }\n"
    "  if (miss.length) {\n"
    "    const { data } = await sb.storage.from('media').createSignedUrls(miss, ttl)\n"
    "    for (const x of data ?? []) if (x.path && x.signedUrl) { out[x.path] = x.signedUrl; cache.set(`${cacheScope}:${x.path}`, { u: x.signedUrl, exp: now + ttl * 1000 }) }\n"
    "  }\n"
    "  return out\n"
    "}",
)

# ---------------------------------------------------------------------------
# 5) Map SQL plan filter: include trips explicitly marked "Đã đi".
# ---------------------------------------------------------------------------
old_plan_sql = """    and p.status = 'Đã chốt'
    and p.end_date is not null
    and p.end_date <= (current_date at time zone 'UTC+7')  -- so sánh theo múi giờ VN
"""
new_plan_sql = """    and p.end_date is not null
    and (
      p.status = 'Đã đi'
      or (
        p.status = 'Đã chốt'
        and p.end_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
      )
    )
"""
replace_once("supabase/phase16.sql", old_plan_sql, new_plan_sql)

# ---------------------------------------------------------------------------
# 6) README: use the actual phase8_trc filename and document phase17 + upgrade.
# ---------------------------------------------------------------------------
replace_all("README.md", "phase8.sql", "phase8_trc.sql")
replace_once(
    "supabase/phase9.sql",
    "SAU phase8.sql",
    "SAU phase8_trc.sql",
)

# Generate phase17 by reusing the canonical memory_places function from phase16.
phase16 = read("supabase/phase16.sql")
fn_start = phase16.find("create or replace function memory_places(")
fn_end = phase16.find("revoke all on function memory_places(date, date)", fn_start)
if fn_start < 0 or fn_end < 0:
    raise RuntimeError("Không tìm thấy định nghĩa memory_places trong phase16.sql.")
updated_function = phase16[fn_start:fn_end].rstrip()

phase17 = """-- Giai đoạn 17: vá quyền đọc ảnh Storage và đồng bộ Bản đồ Kỷ niệm.
-- Chạy SAU phase16.sql và TRƯỚC khi deploy frontend đã vá.
-- Có thể chạy lại an toàn.

-- Xóa policy cũ: nó cho mọi thành viên Space liệt kê/tải mọi object trong bucket media.
drop policy if exists media_all on storage.objects;
drop policy if exists media_read_visible on storage.objects;
drop policy if exists media_insert_space on storage.objects;
drop policy if exists media_update_owned on storage.objects;
drop policy if exists media_delete_owned on storage.objects;

-- Chỉ ký/tải được object đang được tham chiếu bởi dữ liệu mà caller được phép đọc.
-- diary_media SELECT policy (phase8_trc.sql) đi qua RLS của diary_entries,
-- nên ảnh của nhật ký riêng tư không xuất hiện với người còn lại.
create policy media_read_visible on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      where dm.space_id = my_space()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space()
        and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.space_id = my_space() and p.avatar_url = name
    )
  )
);

-- Upload mới chỉ được đặt trong thư mục Space hiện tại.
create policy media_insert_space on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
);

-- Cho sửa/xóa tệp của chính user (kể cả tệp mới upload chưa gắn metadata),
-- hoặc tệp đang thuộc bản ghi mà caller có quyền quản lý.
create policy media_update_owned on storage.objects
for update to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);

create policy media_delete_owned on storage.objects
for delete to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);

-- Giữ nguyên RPC map, chỉ cập nhật điều kiện để nhận cả kế hoạch đã đánh dấu "Đã đi".
""" + updated_function + "\n\nrevoke all on function memory_places(date, date) from public, anon;\ngrant execute on function memory_places(date, date) to authenticated, service_role;\n"
write("supabase/phase17.sql", phase17)

# README note: delete the old, now-invalid storage limitation and add the new migration.
readme = read("README.md")
old_privacy = "- Giới hạn: tệp ảnh nằm chung bucket `media` của Space nên về kỹ thuật người kia vẫn liệt kê được tên tệp trong Storage nếu cố tình, nhưng không biết tệp nào thuộc bài nào và không có đường dẫn từ nhật ký. Nếu cần kín hơn, phải tách bucket riêng cho ảnh riêng tư."
new_privacy = "- Bản vá `phase17.sql` khóa quyền đọc bucket `media` theo bản ghi metadata còn nhìn thấy được. Ảnh nhật ký riêng tư không còn được liệt kê/ký URL bởi thành viên còn lại; URL mới có TTL mặc định 5 phút và cache tách theo tài khoản. URL đã phát hành bởi phiên bản cũ có thể còn hiệu lực tới hết hạn cũ (tối đa 1 giờ)."
if old_privacy not in readme:
    raise RuntimeError("README.md: không tìm thấy đoạn mô tả giới hạn riêng tư cũ.")
readme = readme.replace(old_privacy, new_privacy, 1)
readme += """

## Bản vá bảo mật và Bản đồ Kỷ niệm (phase17)

- Sau khi đã chạy `supabase/phase16.sql`, chạy `supabase/phase17.sql` trong Supabase SQL Editor **trước khi deploy frontend**. Migration thay policy Storage rộng `media_all` bằng quyền đọc theo bản ghi đang được phép xem; quyền cập nhật/xóa được giới hạn theo tác giả hoặc nội dung dùng chung.
- Ảnh upload mới được đặt dưới `space_id/user_id/...`. Quyền sửa/xóa đối chiếu `owner_id` của Storage, thư mục user và bản ghi metadata (khi còn tồn tại), nên vẫn hỗ trợ các tệp cũ và giữ nguyên thứ tự xóa hiện tại. Cache URL ký được tách theo user để không dùng nhầm URL giữa hai phiên đăng nhập trên cùng trình duyệt.
- Bản đồ Kỷ niệm hiển thị cả kế hoạch có trạng thái `Đã đi`, ngoài kế hoạch `Đã chốt` có ngày kết thúc đã qua.
- Cập nhật framework: Next.js `15.5.29`, React/React DOM `19.3.1` và typings React `19.3.0`. Sau khi áp dụng mã nguồn, chạy `npm install` để đồng bộ `package-lock.json`, rồi `npm run build`.
"""
write("README.md", readme)

print("Đã áp dụng các thay đổi mã nguồn. Các tệp đã sửa/thêm:")
for p in [
    "package.json",
    "app/(app)/map/page.tsx",
    "components/DiaryForm.tsx",
    "components/MomentForm.tsx",
    "components/PlaceReview.tsx",
    "app/(app)/chat/page.tsx",
    "lib/media.ts",
    "supabase/phase16.sql",
    "supabase/phase17.sql",
    "supabase/phase9.sql",
    "README.md",
]:
    print(f"  - {p}")
print("\nTiếp theo chạy: npm install && npm run build")
print("Lưu ý: package-lock.json được npm install cập nhật trên máy bạn; script không tự tạo commit hoặc push.")
