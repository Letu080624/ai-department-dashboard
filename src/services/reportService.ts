/* =========================================================================
 * reportService — Generate Department Report (mô hình lai)
 *   - Bảng/số liệu: hệ thống dựng từ Analytics (cùng nguồn với dashboard) → không thể bịa số.
 *   - Nhận xét: AI (hoặc quy tắc khi không có AI); đoạn có số không kiểm chứng được bị loại (chế độ nghiêm ngặt).
 *   - Người dùng xem trước, CHỈNH SỬA đoạn nhận xét, rồi xuất HTML/JSON hoặc In → PDF.
 * ========================================================================= */
import type { Analytics } from '../domain/analytics';
import { EVIDENCE_STATUS_LABEL, KPI_STATUS_LABEL, QA_STATUS_LABEL, WORKLOAD_LABEL } from '../domain/rules';
import { REPORT_SECTIONS, type AiRecommendation, type ReportNarrative, type ReportSectionKey } from '../ai/schema';
import type { AiRunResult } from './aiService';

export type Block =
  | { type: 'kv'; items: { label: string; value: string }[] }
  | { type: 'table'; caption: string; columns: string[]; rows: (string | number | null)[][] }
  | { type: 'paragraph'; id: string; text: string; kind: 'fact' | 'inference' | 'system'; refs: string[]; source: 'ai' | 'rules' | 'user'; note?: string }
  | { type: 'actions'; caption: string; items: AiRecommendation[] };
export interface ReportDoc {
  id: string; title: string;
  meta: { department: string; faculty: string; university: string; academicYear: string; semester: string; referenceDate: string; generatedAt: string; generatedBy: string; provider: string; model: string | null; trust: string; warnings: string[]; removed: { where: string; text: string; values: string[] }[]; dataGaps: string[]; fallbackReason?: string; edited: boolean };
  sections: { key: ReportSectionKey; number: number; title: string; blocks: Block[] }[];
}

const n1 = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toLocaleString('vi-VN', { maximumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${n1(v)}%`);

/** Bảng số liệu hệ thống cho từng mục */
function systemBlocks(A: Analytics, key: ReportSectionKey): Block[] {
  const o = A.overview();
  switch (key) {
    case 'executive': return [{ type: 'kv', items: [
      { label: 'Giảng viên (cơ hữu / tiến sĩ)', value: `${o.lecturers} (${o.fullTime} / ${o.phd})` }, { label: 'Học phần / lớp học phần trong kỳ', value: `${o.courses} / ${o.sectionsInSemester}` },
      { label: 'Người học', value: n1(o.students, 0) }, { label: `Tỷ lệ đạt học phần (${o.semester.code})`, value: pct(o.results.passRate) },
      { label: 'KPI đạt / tổng', value: `${o.kpi.achieved} / ${o.kpi.total}` }, { label: 'KPI quá hạn / có nguy cơ', value: `${o.kpi.overdue} / ${o.kpi.atRisk}` },
      { label: 'Công việc quá hạn', value: String(o.overdueTasks) }, { label: 'Minh chứng còn thiếu (theo tiêu chí)', value: String(o.missingEvidence) } ] }];
    case 'staff': { const rows = A.lecturers().filter(l => l.band === 'over' || l.band === 'under' || l.overdueTasks); return [{ type: 'table', caption: 'Giảng viên có cảnh báo (tải giảng, công việc quá hạn)', columns: ['Mã', 'Họ tên', 'Học vị', 'Giờ / định mức', 'Tải', 'Đánh giá', 'Việc quá hạn'], rows: rows.map(l => [l.lecturer.code, l.lecturer.fullName, l.lecturer.degree, `${n1(l.totalHours)} / ${l.lecturer.normHours}`, l.ratio === null ? '—' : pct(l.ratio * 100), WORKLOAD_LABEL[l.band], l.overdueTasks]) }]; }
    case 'teaching': { const ss = A.sectionsOf([A.currentSemester.id]).map(s => A.sectionResult(s.id)); return [{ type: 'table', caption: `Lớp học phần ${A.currentSemester.code}`, columns: ['Lớp HP', 'Học phần', 'Giảng viên', 'Sĩ số', 'Tiến độ', 'Giờ quy đổi'], rows: ss.map(r => [r.section.code, r.course.name, r.lecturer?.fullName ?? '—', r.registered, pct(r.progressPct), n1(A.sectionHours(r.section))]) }]; }
    case 'students': return [
      { type: 'table', caption: 'Kết quả theo học kỳ', columns: ['Học kỳ', 'Lớp HP', 'Đăng ký', 'Đạt', 'Tỷ lệ đạt', 'Điểm TB', 'Đạt CLO bình quân'], rows: A.gradedSemesters().map(s => { const r = A.semesterResults(s.id); return [s.code, r.sections, r.registered, r.passed, pct(r.passRate), n1(r.avgScore, 2), pct(r.cloRate)]; }) },
      { type: 'table', caption: 'Học phần cần chú ý (theo quy tắc C1–C3)', columns: ['Học phần', 'Kỳ', 'Tỷ lệ đạt', 'Điểm TB', 'Lý do'], rows: A.courses().filter(c => c.attention.length).map(c => [`${c.course.code} ${c.course.name}`, c.latest?.semester.code ?? '—', pct(c.latest?.passRate), n1(c.latest?.avgScore, 2), c.attention.join('; ')]) }];
    case 'research': return [
      { type: 'table', caption: 'Sản phẩm khoa học theo năm học', columns: ['Năm học', 'Bài báo tạp chí', 'Báo cáo hội thảo', 'Sách', 'Sản phẩm', 'Tổng'], rows: A.researchByYear().map(y => [y.year.code, y.journal, y.conference, y.book, y.product, y.total]) },
      { type: 'table', caption: 'Đề tài', columns: ['Mã', 'Tên đề tài', 'Tiến độ', 'Thời gian đã qua', 'Trạng thái'], rows: A.projectRows().map(r => [r.p.code, r.p.title, pct(r.p.progressPct), pct(r.timePct), r.p.status === 'accepted' ? 'Đã nghiệm thu' : r.p.status === 'overdue_report' ? 'Chậm báo cáo' : 'Đang thực hiện']) }];
    case 'kpi': return [{ type: 'table', caption: 'KPI (trạng thái do quy tắc hệ thống xác định)', columns: ['Mã', 'KPI', 'Thực tế', 'Mục tiêu', 'Mức đạt', 'Trạng thái', 'Hạn'], rows: A.kpis().map(k => [k.def.code, k.def.name, `${n1(k.ev.value, 2)} ${k.def.unit}`, `${n1(k.def.target, 2)} ${k.def.unit}`, pct(k.ev.cr), KPI_STATUS_LABEL[k.ev.status] + (k.ev.atRisk ? ' · nguy cơ' : ''), k.def.deadline]) }];
    case 'qa': return [{ type: 'table', caption: 'Hoạt động BĐCL theo PDCA', columns: ['Mã', 'Hoạt động', 'Giai đoạn', 'Tiến độ', 'Hạn', 'Trạng thái'], rows: A.qaRows().map(r => [r.a.code, r.a.title, r.a.phase, `${r.a.progressPct}%`, r.a.dueDate, QA_STATUS_LABEL[r.status]]) }];
    case 'evidence': return [{ type: 'table', caption: 'Độ phủ minh chứng theo tiêu chí', columns: ['Tiêu chí', 'Nội dung', 'Hợp lệ / yêu cầu', 'Đánh giá'], rows: A.coverageAll().map(c => [c.criterion.code, c.criterion.content, `${c.valid} / ${c.required}`, c.coverage === 'full' ? 'Đủ' : c.coverage === 'partial' ? 'Thiếu một phần' : 'Thiếu']) },
      { type: 'table', caption: 'Minh chứng chưa ở trạng thái Đủ', columns: ['Mã', 'Tên', 'Trạng thái', 'Lý do', 'Phụ trách'], rows: A.evidenceRows().filter(r => r.status !== 'complete').map(r => [r.e.code, r.e.name, EVIDENCE_STATUS_LABEL[r.status], r.reason, r.owner?.fullName ?? '—']) }];
    case 'risks': return [{ type: 'table', caption: 'Cảnh báo theo quy tắc (không do AI chấm)', columns: ['Mức', 'Lĩnh vực', 'Nội dung', 'Chi tiết', 'Phụ trách'], rows: A.alerts().map(a => [a.level === 'critical' ? 'Nghiêm trọng' : a.level === 'high' ? 'Cao' : 'Trung bình', a.area, a.title, a.detail, a.owner]) }];
    case 'improvement': return [{ type: 'table', caption: 'Hành động cải tiến', columns: ['Mã', 'Hành động', 'KPI', 'Phụ trách', 'Hạn', 'Trạng thái', 'Kết quả'], rows: A.d.improvementActions.map(a => [a.code, a.title, A.get('kpis', a.kpiId)?.code ?? '—', A.lecturerName(a.ownerId), a.dueDate, ({ planned: 'Kế hoạch', in_progress: 'Đang thực hiện', done: 'Hoàn thành', overdue: 'Quá hạn' } as const)[A.actionStatus(a)], A.actionResult(a).label]) }];
    default: return [];
  }
}

export const reportService = {
  compose(A: Analytics, ai: AiRunResult<ReportNarrative>, user: string): ReportDoc {
    const n = ai.data;
    const sections = REPORT_SECTIONS.map((s, i) => {
      const blocks: Block[] = systemBlocks(A, s.key);
      (n.sections.find(x => x.key === s.key)?.paragraphs ?? []).forEach((p, j) => blocks.push({ type: 'paragraph', id: `${s.key}-${j}`, text: p.text, kind: p.kind, refs: p.refs, source: ai.provider === 'rules' ? 'rules' : 'ai', note: p.downgraded ? `Đã hạ thành INFERENCE: ${p.downgrade_reason}` : undefined }));
      if (s.key === 'recommendations' && n.recommendations.length) blocks.push({ type: 'actions', caption: ai.provider === 'rules' ? 'Đề xuất theo quy tắc' : 'Khuyến nghị (đề xuất, không phải quyết định)', items: n.recommendations });
      return { key: s.key, number: i + 1, title: s.title, blocks };
    });
    const dep = A.department, fac = A.get('units', dep.parentId), uni = A.get('units', fac?.parentId);
    return {
      id: `rpt-${Date.now().toString(36)}`, title: `Báo cáo tình hình ${dep.name} — ${A.currentSemester.name}`,
      meta: { department: dep.name, faculty: fac?.name ?? '', university: uni?.name ?? '', academicYear: A.currentYear.code, semester: A.currentSemester.name, referenceDate: A.ref, generatedAt: new Date().toISOString(), generatedBy: user, provider: ai.provider, model: ai.model, trust: ai.trust, warnings: ai.warnings, removed: ai.checks.removed, dataGaps: n.data_gaps, fallbackReason: ai.fallbackReason, edited: false },
      sections,
    };
  },
  renderHtml(doc: ReportDoc): string {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const tag = (k: string) => `<span class="tag ${k}">${k === 'fact' ? 'FACT' : k === 'inference' ? 'INFERENCE' : k === 'rec' ? 'RECOMMENDATION' : 'SỐ LIỆU HỆ THỐNG'}</span>`;
    const block = (b: Block) => {
      if (b.type === 'kv') return `<table class="kv">${b.items.map(i => `<tr><th>${esc(i.label)}</th><td>${esc(i.value)}</td></tr>`).join('')}</table>`;
      if (b.type === 'table') return `<div class="cap">${tag('system')} ${esc(b.caption)}</div>${b.rows.length ? `<table><thead><tr>${b.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">Không có dữ liệu.</p>'}`;
      if (b.type === 'paragraph') return `<div class="p ${b.kind}">${tag(b.kind)}${b.source === 'user' ? '<span class="muted"> đã chỉnh sửa</span>' : ''}<p>${esc(b.text)}</p>${b.refs.length ? `<div class="refs">Nguồn: ${b.refs.map(esc).join(', ')}</div>` : ''}${b.note ? `<div class="muted">${esc(b.note)}</div>` : ''}</div>`;
      return `<div class="cap">${tag('rec')} ${esc(b.caption)}</div><table><thead><tr><th>Hành động</th><th>Phụ trách</th><th>Thời hạn</th><th>Đo bằng</th></tr></thead><tbody>${b.items.map(a => `<tr><td>${esc(a.action)}</td><td>${esc(a.owner_role)}</td><td>${esc(a.due_hint || '—')}</td><td>${esc(a.success_measure)}</td></tr>`).join('')}</tbody></table>`;
    };
    const m = doc.meta;
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
body{font:14px/1.55 'Times New Roman',serif;color:#0f172a;max-width:860px;margin:24px auto;padding:0 20px}h1{font-size:20px;text-align:center;color:#1e3a5f;text-transform:uppercase}h2{font-size:15px;color:#1e3a5f;border-bottom:1.5px solid #1e3a5f;padding-bottom:3px;margin-top:22px;text-transform:uppercase}
.head{display:flex;justify-content:space-between;font-size:12.5px;text-transform:uppercase}.meta{text-align:center;color:#475569;font-size:12.5px}table{border-collapse:collapse;width:100%;font:12px system-ui,Arial;margin:4px 0 8px}th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}
.kv th{width:55%;font-weight:400;color:#475569;background:none}.cap{font-weight:700;font-size:13px;margin:10px 0 4px}.tag{font:700 9.5px system-ui;padding:1px 5px;border-radius:3px;margin-right:4px}.tag.fact{background:#1e3a5f;color:#fff}.tag.inference{background:#fef3c7;color:#92400e;border:1px dashed #b45309}.tag.rec{background:#dcfce7;color:#15803d}.tag.system{background:#e2e8f0;color:#334155}
.p{border-left:3px solid #1e3a5f;padding:4px 10px;margin:6px 0;background:#f8fafc}.p.inference{border-left-style:dashed;border-left-color:#b45309;background:#fffbeb}.p p{margin:2px 0}.refs,.muted{font-size:11.5px;color:#64748b}.warn{border:1px solid #f59e0b;background:#fffbeb;padding:6px 10px;font-size:12.5px}.sign{display:flex;justify-content:space-around;text-align:center;margin-top:40px}
@page{size:A4;margin:18mm 16mm}@media print{body{margin:0;max-width:none}}</style></head><body>
<div class="head"><div>${esc(m.university)}<br>${esc(m.faculty)}<br><b>${esc(m.department)}</b></div><div><b>BÁO CÁO</b><br>Ngày lập: ${esc(m.generatedAt.slice(0, 10))}</div></div>
<h1>${esc(doc.title)}</h1><div class="meta">Năm học ${esc(m.academicYear)} · Dữ liệu đến ngày ${esc(m.referenceDate)} · Người lập: ${esc(m.generatedBy)} · Nhận xét: ${m.provider === 'gemini' ? `Gemini (${esc(m.model)})` : m.provider === 'mock' ? 'Mock' : 'tổng hợp bằng quy tắc'}${m.edited ? ' · đã chỉnh sửa thủ công' : ''}</div>
${m.warnings.length ? `<p class="warn"><b>Lưu ý rà soát:</b> ${m.warnings.map(esc).join(' ')}</p>` : ''}
${doc.sections.map(s => `<h2>${s.number}. ${esc(s.title)}</h2>${s.blocks.map(block).join('')}`).join('')}
<h2>Phụ lục</h2><p class="muted">Dữ liệu còn thiếu: ${m.dataGaps.map(esc).join(' ') || 'không ghi nhận'}</p>${m.removed.length ? `<p class="muted">Nội dung AI bị loại do số liệu không kiểm chứng được: ${m.removed.map(r => `${esc(r.text)} [${r.values.map(esc).join(', ')}]`).join('; ')}</p>` : ''}
<div class="sign"><div><b>NGƯỜI LẬP</b><br><span class="muted">(ký, ghi rõ họ tên)</span></div><div><b>TRƯỞNG BỘ MÔN</b><br><span class="muted">(ký, ghi rõ họ tên)</span></div></div></body></html>`;
  },
  fileName(doc: ReportDoc, ext: string) { return `bao-cao-bo-mon-${doc.meta.referenceDate}.${ext}`; },
};
