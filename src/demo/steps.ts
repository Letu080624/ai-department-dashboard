/* =========================================================================
 * 12 bước trình diễn (~10 phút). Mỗi bước: màn hình (route), vùng cần chỉ (spot),
 * lời dẫn (say — sinh từ dữ liệu thật, không viết cứng số liệu), hành động "Làm giúp" (action).
 * ========================================================================= */
import type { Analytics } from '../domain/analytics';
import { num, pct } from '../lib/format';
import type { DemoScenario } from './scenario';

export type DemoAction = { kind: 'ask'; label: string } | { kind: 'click'; label: string; selector: string };
export interface DemoStep {
  n: number; title: string; seconds: number; route: (s: DemoScenario) => string; spot: (s: DemoScenario) => string;
  say: (A: Analytics, s: DemoScenario) => string[]; look: string; action?: DemoAction; waitMs?: number;
}

export const DEMO_STEPS: DemoStep[] = [
  { n: 1, title: 'Tổng quan Bộ môn', seconds: 60, route: () => 'overview', spot: () => '#demo-overview-kpis',
    look: '8 thẻ chỉ số, biểu đồ KPI, bảng “Cần xử lý” do quy tắc sinh ra',
    say: A => { const o = A.overview(); return [
      `Bộ môn có ${o.lecturers} giảng viên (${o.phd} tiến sĩ cơ hữu), ${o.courses} học phần, ${num(o.students, 0)} người học — mọi số liệu tính trực tiếp từ dữ liệu nguồn.`,
      `${o.kpi.achieved}/${o.kpi.total} KPI đạt, ${o.kpi.overdue} quá hạn; ${o.overdueTasks} công việc quá hạn, còn thiếu ${o.missingEvidence} minh chứng theo tiêu chí.`,
      'Trạng thái và cảnh báo do QUY TẮC cấu hình xác định, không phải AI — Trưởng Bộ môn nhìn là biết “Bộ môn đang thế nào”.',
    ]; } },
  { n: 2, title: 'Xem KPI', seconds: 45, route: () => 'kpi', spot: () => '#demo-kpi-table',
    look: 'Bảng KPI: Target, Actual, Completion, Deadline, Owner, Status, Trend',
    say: A => { const c = A.kpiCounts(); return [
      `Completion Rate = Actual / Target × 100%. Hiện ${c.achieved} Đạt, ${c.attention} Cần chú ý, ${c.notAchieved} Không đạt, ${c.overdue} Quá hạn.`,
      'Ngưỡng Đạt/Cần chú ý/Không đạt cấu hình ở Quản trị — không viết cứng trong phần mềm.',
    ]; } },
  { n: 3, title: 'Phát hiện một vấn đề', seconds: 45, route: s => `kpi/${s.kpi.id}`, spot: () => '#demo-kpi-trend',
    look: 'Đường giá trị theo kỳ cắt xuống dưới vạch mục tiêu',
    say: (_A, s) => [
      `${s.kpi.code} – ${s.kpi.name}: ${num(s.kpi.value)}${s.kpi.unit} so với mục tiêu ${num(s.kpi.target)}${s.kpi.unit} → ${s.kpi.status}${s.kpi.prev !== null ? `, giảm từ ${num(s.kpi.prev)}${s.kpi.unit} kỳ trước` : ''}.`,
      'Hệ thống nêu rõ công thức và quy tắc đã áp dụng — người xem kiểm chứng được, không phải “hộp đen”.',
      'Câu hỏi quản trị: vì sao chỉ số này giảm? → đi xuống học phần.',
    ] },
  { n: 4, title: 'Drill-down vào học phần', seconds: 60, route: s => `courses/${s.course.id}`, spot: () => '#demo-clo',
    look: 'Biểu đồ mức đạt CLO: các cột đỏ dưới vạch mục tiêu',
    say: (_A, s) => [
      `${s.course.code} ${s.course.name} (${s.course.semester}): ${s.course.cloBelow.length} CLO dưới mục tiêu${s.course.worst ? `; ${s.course.worst.clo} giảm từ ${pct(s.course.worst.from)} xuống ${pct(s.course.worst.to)}` : ''}.`,
      `Tỷ lệ đạt học phần vẫn ${pct(s.course.passRate)} — chỉ nhìn tỷ lệ đạt sẽ bỏ sót vấn đề chuẩn đầu ra.`,
      'Bảng CLO–PLO cho thấy ảnh hưởng tới chuẩn đầu ra chương trình.',
    ] },
  { n: 5, title: 'Xem dữ liệu giảng viên', seconds: 45, route: s => `staff/${s.lecturer.id}`, spot: () => '#demo-lecturer-load',
    look: 'Thẻ giờ giảng có thanh đỏ “Quá tải”, khối cảnh báo theo quy tắc',
    say: (_A, s) => [
      `${s.lecturer.code} ${s.lecturer.name} phụ trách học phần này: tải giảng ${pct(s.lecturer.loadPct)} định mức (${s.lecturer.band}).`,
      ...s.lecturer.alerts.slice(1, 3).map(a => `Cảnh báo: ${a}.`),
      'Đây là DỮ KIỆN; còn “quá tải làm giảm chất lượng” chỉ là giả thuyết — hệ thống không tự kết luận nguyên nhân.',
    ] },
  { n: 6, title: 'Kiểm tra minh chứng', seconds: 40, route: s => (s.evidence ? `evidence/${s.evidence.id}` : 'evidence'), spot: () => '#demo-evidence-detail',
    look: 'Chi tiết minh chứng: trạng thái, liên kết KPI và tiêu chí',
    say: (_A, s) => (s.evidence ? [
      `Minh chứng ${s.evidence.code} “${s.evidence.name}” — ${s.evidence.status} (${s.evidence.reason}).`,
      `KPI ${s.kpi.code} vì vậy chưa có minh chứng hợp lệ — chuỗi chất lượng bị đứt ở mắt xích minh chứng.`,
    ] : ['Minh chứng được kiểm tra theo quy tắc E1–E4: Thiếu / Cần cập nhật / Chưa xác nhận / Đủ.']) },
  { n: 7, title: 'Xem hoạt động BĐCL', seconds: 45, route: () => 'qa', spot: s => (s.qa ? `#demo-qa-${s.qa.id}` : '#demo-pdca'),
    look: 'Bảng PDCA với thẻ hoạt động liên quan',
    say: (_A, s) => [
      s.qa ? `Hoạt động ${s.qa.code} “${s.qa.title}” — ${s.qa.status}, tiến độ ${s.qa.progress}%.` : 'Các hoạt động BĐCL được theo dõi theo vòng PDCA.',
      'Vòng PDCA: Kế hoạch → Thực hiện → Kiểm tra → Cải tiến; mỗi hoạt động gắn KPI và tiêu chí (bộ tiêu chuẩn do quản trị cấu hình).',
    ] },
  { n: 8, title: 'Hỏi AI', seconds: 30, route: () => 'ai', spot: () => '#demo-ai-input', action: { kind: 'ask', label: 'Gửi câu hỏi mẫu' },
    look: 'Câu hỏi được gửi; các bước Intent → Context → AI → Kiểm tra hiển thị',
    say: (_A, s) => [
      `Hỏi bằng tiếng Việt tự nhiên: “${s.question}”.`,
      'Hệ thống chỉ gửi dữ liệu của học phần này cho AI (không gửi toàn bộ CSDL, không có dữ liệu cá nhân người học).',
    ] },
  { n: 9, title: 'AI phân tích vấn đề', seconds: 60, route: () => 'ai', spot: () => '[data-demo="ai-result-latest"]', waitMs: 45000,
    look: 'Kết quả có nhãn FACT / INFERENCE, nguồn dữ liệu (ref), DATA GAP',
    say: () => [
      'FACT = số liệu đọc trực tiếp từ hệ thống (đã được đối chiếu tự động); INFERENCE = suy luận, luôn kèm cách kiểm chứng.',
      'AI không được bịa số: con số không khớp dữ liệu bị loại hoặc hạ cấp, kèm cảnh báo.',
      'Mục “Dữ liệu còn thiếu” nói rõ AI KHÔNG đủ căn cứ để kết luận nguyên nhân sư phạm.',
      'Nếu thẻ ghi “Quy tắc — không dùng AI” (chưa có Gemini key): kết quả chỉ gồm FACT và đề xuất có sẵn — nói rõ điều này; với Gemini sẽ có thêm INFERENCE kèm cách kiểm chứng.',
    ] },
  { n: 10, title: 'AI đề xuất hành động cải tiến', seconds: 45, route: () => 'ai', spot: () => '[data-demo="ai-result-latest"] [data-demo="ai-proposal"]', waitMs: 45000,
    look: 'Khung “AI đề xuất hành động này” với Approve / Edit / Reject',
    say: (_A, s) => [
      `Đề xuất gắn KPI ${s.kpi.code} để đo lại kết quả cải tiến ở kỳ sau.`,
      'Đây chỉ là ĐỀ XUẤT: chưa có dữ liệu nào được tạo.',
    ] },
  { n: 11, title: 'Người dùng phê duyệt hành động', seconds: 45, route: () => 'ai', spot: () => '[data-demo="ai-result-latest"] [data-demo="ai-proposal"]',
    action: { kind: 'click', label: 'Mở hộp phê duyệt', selector: '[data-demo="ai-result-latest"] [data-demo="ai-approve"]' },
    look: 'Hộp xác nhận → bấm “Xác nhận tạo” → nhãn “Đã duyệt → CI-AI-…”',
    say: (_A, s) => [
      'Người quản lý quyết định: Approve, Edit (đổi người phụ trách, thời hạn) hoặc Reject.',
      `Gợi ý: ${s.lecturer.code} đang ${s.lecturer.band.toLowerCase()} — có thể bấm “Sửa trước” để giao cho người khác.`,
      'Bấm “Xác nhận tạo” → hành động cải tiến được tạo và ghi vào nhật ký hệ thống (ai duyệt, lúc nào).',
    ] },
  { n: 12, title: 'Tạo báo cáo', seconds: 60, route: () => 'reports', spot: () => '#demo-report-export', waitMs: 45000,
    action: { kind: 'click', label: 'Tạo báo cáo', selector: '#demo-report-generate' },
    look: 'Báo cáo 11 mục: bảng số liệu hệ thống + nhận xét; xuất HTML / In PDF',
    say: () => [
      'Bảng số liệu do hệ thống dựng từ cùng nguồn với dashboard; AI chỉ viết nhận xét đã kiểm chứng.',
      'Hành động cải tiến vừa duyệt đã có trong mục “Hành động cải tiến” — khép vòng Dữ liệu → Quyết định → Hành động.',
      'Có thể sửa nhận xét trước khi xuất; mọi lần tạo/xuất đều ghi nhật ký.',
    ] },
];
export const DEMO_TOTAL_SECONDS = DEMO_STEPS.reduce((a, s) => a + s.seconds, 0);
