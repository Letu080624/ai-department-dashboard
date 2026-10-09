/* =========================================================================
 * Copilot router (thuần, kiểm thử được): câu hỏi + phạm vi người dùng chọn → tác vụ AI + phạm vi dữ liệu.
 * ========================================================================= */
import type { Analytics } from '../domain/analytics';
import { detectIntent, type Scope } from './contextBuilder';
import type { TaskId } from './prompts';

export type Route =
  | { kind: 'ai'; task: TaskId; scope: Scope }
  | { kind: 'notice'; message: string; link?: { target: string; label: string } }
  | { kind: 'redirect'; target: 'reports'; message: string };

export function routeQuestion(A: Analytics, question: string, sel: { type: Scope['type']; id?: string; code?: string } | null, fixed?: TaskId): Route {
  if (sel && sel.type !== 'department' && sel.id) {
    const scope: Scope = { type: sel.type, id: sel.id, label: sel.code };
    return { kind: 'ai', task: fixed && fixed !== 'dashboard_analysis' ? fixed : sel.type === 'course' ? 'course_analysis' : sel.type === 'lecturer' ? 'lecturer_analysis' : 'kpi_risk', scope };
  }
  if (fixed) return { kind: 'ai', task: fixed, scope: { type: 'department' } };
  const q = question || '';
  // Yêu cầu tạo báo cáo → chuyển sang trang Báo cáo (quy trình Generate → Preview → Edit → Export có kiểm soát)
  if (/(tạo|lập|xuất|viết|soạn)\s+(một\s+)?báo cáo/i.test(q)) return { kind: 'redirect', target: 'reports', message: 'Báo cáo Bộ môn được tạo ở trang Báo cáo: hệ thống dựng bảng số liệu từ dữ liệu nguồn, AI chỉ viết nhận xét đã được kiểm chứng; bạn xem trước, chỉnh sửa rồi mới xuất file.' };
  // Yêu cầu GHI dữ liệu → Copilot không có quyền; chỉ dẫn tới đúng màn hình để người dùng tự thao tác (có kiểm tra + nhật ký)
  if (/^\s*(hãy|vui lòng|xin|giúp tôi|làm ơn)?\s*(cập nhật|sửa|chỉnh sửa|thay đổi|đổi|xoá|xóa|đánh dấu|phê duyệt|duyệt|gán|đặt lại|nhập|ghi)\b/i.test(q) || /\b(tự|giúp)\s+(cập nhật|sửa|xoá|xóa|đánh dấu|phê duyệt)\b/i.test(q)) {
    const kpi = q.match(/KPI-[A-Z]{2}-\d{2}/i)?.[0].toUpperCase(); const k = kpi ? A.d.kpis.find(x => x.code === kpi) : undefined;
    const link = k ? { target: `kpi/${k.id}`, label: `Mở ${k.code} để nhập kết quả` } : /công việc|nhiệm vụ/i.test(q) ? { target: 'tasks', label: 'Mở trang Công việc' } : /minh chứng/i.test(q) ? { target: 'evidence', label: 'Mở trang Minh chứng' } : /cải tiến|hành động/i.test(q) ? { target: 'qa', label: 'Mở trang Bảo đảm chất lượng' } : undefined;
    return { kind: 'notice', message: 'AI Copilot chỉ phân tích và đề xuất, không thay đổi dữ liệu. Việc cập nhật phải do người có quyền thực hiện trên màn hình nghiệp vụ (có kiểm tra hợp lệ và ghi nhật ký).', link };
  }
  // Mã đối tượng không tồn tại → báo ngay, không gọi AI (tránh AI đoán sang đối tượng khác)
  const unknown = [
    ...[...q.matchAll(/\b[A-ZĐ]{2,4}\d{3}\b/g)].map(m => m[0]).filter(c => !A.d.courses.some(x => x.code === c)).map(c => `học phần ${c}`),
    ...[...q.matchAll(/\bGV\d{2,3}\b/gi)].map(m => m[0].toUpperCase()).filter(c => !A.d.lecturers.some(x => x.code === c)).map(c => `giảng viên ${c}`),
    ...[...q.matchAll(/\bKPI-[A-Z]{2}-\d{2}\b/gi)].map(m => m[0].toUpperCase()).filter(c => !A.d.kpis.some(x => x.code === c)).map(c => `KPI ${c}`),
  ];
  if (unknown.length) return { kind: 'notice', message: `Không tìm thấy ${unknown.join(', ')} trong dữ liệu của Bộ môn. Kiểm tra lại mã hoặc chọn đối tượng ở “Phạm vi dữ liệu”. Hệ thống không phân tích để tránh suy đoán sai đối tượng.` };
  const d = detectIntent(q, A);
  return { kind: 'ai', task: d.task === 'department_report' ? 'dashboard_analysis' : d.task, scope: d.scope ?? { type: 'department' } };
}
