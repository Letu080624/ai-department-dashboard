/* =========================================================================
 * Kịch bản trình diễn — CHỌN TỰ ĐỘNG từ dữ liệu (không hard-code mã KPI/học phần):
 *   KPI có vấn đề (ưu tiên KPI đạt CLO đang giảm) → học phần có nhiều CLO dưới mục tiêu nhất
 *   → GV phụ trách học phần → minh chứng chưa đủ của KPI → hoạt động BĐCL đang mở của KPI.
 * Mỗi mắt xích có kiểm tra; trang "Chuẩn bị trình diễn" hiển thị kết quả kiểm tra.
 * ========================================================================= */
import type { Analytics } from '../domain/analytics';
import { EVIDENCE_STATUS_LABEL, KPI_STATUS_LABEL, QA_STATUS_LABEL, WORKLOAD_LABEL } from '../domain/rules';

export interface DemoScenario {
  kpi: { id: string; code: string; name: string; value: number | null; target: number; unit: string; status: string; prev: number | null; owner: string };
  course: { id: string; code: string; name: string; cloBelow: string[]; worst: { clo: string; from: number | null; to: number | null } | null; passRate: number | null; semester: string };
  lecturer: { id: string; code: string; name: string; loadPct: number | null; band: string; alerts: string[] };
  evidence: { id: string; code: string; name: string; status: string; reason: string } | null;
  qa: { id: string; code: string; title: string; status: string; progress: number } | null;
  question: string;
  checks: { label: string; ok: boolean; detail: string }[];
}

export function resolveScenario(A: Analytics): DemoScenario | null {
  const bad = A.kpis().filter(k => ['attention', 'not_achieved', 'overdue'].includes(k.ev.status));
  const k = bad.find(x => x.def.source.type === 'computed' && x.def.source.metric === 'learning.clo_rate') ?? bad.find(x => x.ev.trend === 'down') ?? bad[0];
  if (!k) return null;
  const courses = A.courses().filter(c => c.latest).sort((a, b) => b.cloBelow.length - a.cloBelow.length || (a.latest!.passRate ?? 100) - (b.latest!.passRate ?? 100));
  const cs = courses[0]; if (!cs) return null;
  const drops = cs.latest!.clo.map(c => ({ clo: c.clo.code, to: c.rate, from: cs.previous?.clo.find(p => p.clo.id === c.clo.id)?.rate ?? null })).filter(x => x.from !== null && x.to !== null).sort((a, b) => (a.to! - a.from!) - (b.to! - b.from!));
  const lec = A.lecturerSummary(cs.latest!.lecturer?.id ?? cs.course.coordinatorId);
  const ev = k.evidence.find(e => e.status !== 'complete');
  const evRow = ev ? A.evidenceRows().find(r => r.e.id === ev.e.id) : undefined;
  const qa = A.qaRows().find(r => r.a.kpiId === k.def.id && r.status !== 'done' && r.status !== 'cancelled');
  const prev = [...k.series].reverse().filter(p => p.value !== null)[1]?.value ?? null;
  const s: DemoScenario = {
    kpi: { id: k.def.id, code: k.def.code, name: k.def.name, value: k.ev.value, target: k.def.target, unit: k.def.unit, status: KPI_STATUS_LABEL[k.ev.status], prev, owner: k.owner?.fullName ?? '—' },
    course: { id: cs.course.id, code: cs.course.code, name: cs.course.name, cloBelow: cs.cloBelow, worst: drops[0] ?? null, passRate: cs.latest!.passRate, semester: cs.latest!.semester.code },
    lecturer: { id: lec.lecturer.id, code: lec.lecturer.code, name: lec.lecturer.fullName, loadPct: lec.ratio === null ? null : Math.round(lec.ratio * 1000) / 10, band: WORKLOAD_LABEL[lec.band], alerts: lec.alerts },
    evidence: evRow ? { id: evRow.e.id, code: evRow.e.code, name: evRow.e.name, status: EVIDENCE_STATUS_LABEL[evRow.status], reason: evRow.reason } : null,
    qa: qa ? { id: qa.a.id, code: qa.a.code, title: qa.a.title, status: QA_STATUS_LABEL[qa.status], progress: qa.a.progressPct } : null,
    question: `Phân tích học phần ${cs.course.code} và đề xuất hành động cải tiến`,
    checks: [],
  };
  s.checks = [
    { label: 'KPI có vấn đề', ok: true, detail: `${s.kpi.code} · ${s.kpi.status}` },
    { label: 'Học phần cần chú ý', ok: cs.cloBelow.length > 0, detail: `${s.course.code} · ${cs.cloBelow.length} CLO dưới mục tiêu` },
    { label: 'Giảng viên liên quan', ok: true, detail: `${s.lecturer.code} · ${s.lecturer.band}` },
    { label: 'Minh chứng của KPI', ok: !!s.evidence, detail: s.evidence ? `${s.evidence.code} · ${s.evidence.status}` : 'KPI không có minh chứng chưa đủ' },
    { label: 'Hoạt động BĐCL của KPI', ok: !!s.qa, detail: s.qa ? `${s.qa.code} · ${s.qa.status}` : 'Không có hoạt động đang mở' },
  ];
  return s;
}
