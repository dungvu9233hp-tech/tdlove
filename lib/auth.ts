// Dùng chung cho đổi mật khẩu / quên mật khẩu (AUTH-04, SET-01)
export const MIN_PW = 8

// Trả về câu báo lỗi, hoặc '' nếu hợp lệ
export function pwError(p: string, p2: string): string {
  if (p.length < MIN_PW) return `Mật khẩu mới cần ít nhất ${MIN_PW} ký tự`
  if (p !== p2) return 'Hai ô mật khẩu mới chưa giống nhau'
  return ''
}

// Đổi lỗi của Supabase Auth sang tiếng Việt dễ hiểu
export function authMsg(e: any): string {
  const code = String(e?.code ?? ''), m = String(e?.message ?? '')
  if (code === 'same_password' || /different from the old/i.test(m)) return 'Mật khẩu mới phải khác mật khẩu cũ'
  if (code === 'weak_password' || /should be at least|weak/i.test(m)) return 'Mật khẩu quá yếu, hãy chọn mật khẩu dài và khó đoán hơn'
  if (/rate.?limit/i.test(code) || e?.status === 429 || /rate limit|security purposes/i.test(m)) return 'Bạn bấm hơi nhiều lần rồi, đợi khoảng một phút rồi thử lại nhé'
  if (code === 'session_not_found' || code === 'session_expired' || /session missing|session.*expired/i.test(m)) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp'
  if (/sending|smtp|email.*(fail|error)/i.test(m)) return 'Chưa gửi được email lúc này. Thử lại sau ít phút nhé'
  if (/fetch|network/i.test(m)) return 'Không có mạng hoặc mạng yếu, thử lại nhé'
  return m || 'Có lỗi xảy ra'
}
