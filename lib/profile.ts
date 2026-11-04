// Hồ sơ cá nhân (AUTH-05): kiểm tra tên hiển thị và ngày bắt đầu yêu, dùng chung cho Đăng ký và Cài đặt
export const NAME_MAX = 30

// Gộp khoảng trắng thừa, bỏ khoảng trắng đầu/cuối
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim()

// Trả về câu báo lỗi, hoặc '' nếu hợp lệ (đếm theo ký tự, nên emoji chỉ tính là 1)
export function nameError(s: string): string {
  const n = cleanName(s)
  if (!n) return 'Hãy nhập tên hiển thị'
  if ([...n].length > NAME_MAX) return `Tên hiển thị tối đa ${NAME_MAX} ký tự`
  return ''
}

// Ngày hôm nay dạng yyyy-mm-dd theo giờ máy (khớp với ô chọn ngày của trình duyệt)
export const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function startDateError(v: string): string {
  if (!v) return 'Hãy chọn ngày bắt đầu yêu'
  const d = new Date(v + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(+d) || d.toISOString().slice(0, 10) !== v) return 'Ngày chưa hợp lệ'
  if (v > todayStr()) return 'Ngày bắt đầu yêu không thể ở tương lai'
  if (v < '1950-01-01') return 'Ngày này xa quá, kiểm tra lại năm nhé'
  return ''
}
