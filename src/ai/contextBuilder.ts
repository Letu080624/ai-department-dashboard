/* =========================================================================
 * AI Context Builder — chỉ gửi phần dữ liệu liên quan cho Gemini.
 *   User question → Intent detection → Relevant data selection → Context builder → Gemini
 * - Mỗi tác vụ khai báo các "section" cần (prompts.ts); hỏi đáp tự do chọn theo ý định.
 * - Chỉ gửi số liệu ĐÃ TÍNH bởi quy tắc (trạng thái KPI, cảnh báo) — AI diễn giải, không tính lại.
 * - Không gửi dữ liệu cá nhân người học (chỉ tổng hợp theo lớp/học phần).
 * - Mỗi bản ghi có "ref" để AI trích dẫn và để hệ thống đối chiếu số liệu.
 * - Giới hạn kích thước; vượt thì cắt dần và ghi lại phần đã cắt.
 * Thuần TS (dùng được ở server khi chuyển sang dựng context phía server).
 * ========================================================================= */
import type { Analytics } from '../domain/analytics';
import { KPI_STATUS_LABEL, TASK_STATUS_LABEL, EVIDENCE_STATUS_LABEL, QA_STATUS_LABEL, WORKLOAD_LABEL } from '../domain/rules';
import { TASKS, type ContextSection, type TaskId } from './prompts';

export type ScopeType = 'department' | 'course' | 'lecturer' | 'kpi';
export interface Scope { type: ScopeType; id?: string; label?: string }
export interface BuiltContext { taskId: TaskId; context: Record<string, unknown>; sections: ContextSection[]; chars: number; truncated: string[]; scope: Scope }

const r1 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

/* ---------------- Nhận diện ý định (quy tắc từ khóa, không dùng AI) ---------------- */
const INTENTS: { task: TaskId; re: RegExp }[] = [
  { task: 'kpi_risk', re: /\bkpi\b|chỉ tiêu|nguy cơ không đạt|mục tiêu/i },
  { task: 'staff_workload', re: /giảng viên|tải giảng|quá tải|giờ giảng|đội ngũ|thiếu giờ/i },
  { task: 'missing_evidence', re: /minh chứng|hồ sơ kiểm định/i },
  { task: 'course_priority', re: /học phần nào|ưu tiên.*học phần|học phần.*ưu tiên/i },
  { task: 'learning_results', re: /kết quả học|điểm|tỷ lệ đạt|\bclo\b|\bplo\b|sinh viên|học viên/i },
  { task: 'improvement_plan', re: /cải tiến|kế hoạch|đề xuất/i },
  { task: 'research_summary', re: /nckh|nghiên cứu|bài báo|đề tài|công bố/i },
  { task: 'department_report', re: /báo cáo/i },
  { task: 'dashboard_analysis', re: /tình hình|tổng quan|phân tích bộ môn|tóm tắt|vấn đề|cần (tôi )?xử lý|việc gì cần/i },
];
export function detectIntent(question: string, A: Analytics): { task: TaskId; scope: Scope | null } {
  const q = question || '';
  const course = q.match(/\b[A-ZĐ]{2,4}\d{3}\b/);
  const lec = q.match(/\bGV\d{2}\b/i);
  const kpi = q.match(/KPI-[A-Z]{2}-\d{2}/i);
  if (course) { const c = A.d.courses.find(x => x.code === course[0]); if (c) return { task: 'course_analysis', scope: { type: 'course', id: c.id, label: c.code } }; }
  if (lec) { const l = A.d.lecturers.find(x => x.code === lec[0].toUpperCase()); if (l) return { task: 'lecturer_analysis', scope: { type: 'lecturer', id: l.id, label: l.code } }; }
  if (kpi) { const k = A.d.kpis.find(x => x.code === kpi[0].toUpperCase()); if (k) return { task: 'kpi_risk', scope: { type: 'kpi', id: k.id, label: k.code } }; }
  const hit = INTENTS.find(i => i.re.test(q));
  return { task: hit ? hit.task : 'free_question', scope: null };
}
/** Section cho câu hỏi tự do: theo từ khóa, luôn kèm overview */
function sectionsForQuestion(q: string): ContextSection[] {
  const s = new Set<ContextSection>(['overview']);
  if (/kpi|chỉ tiêu|mục tiêu/i.test(q)) s.add('kpis');
  if (/giảng viên|tải|giờ|đội ngũ/i.test(q)) { s.add('staff'); s.add('staff_detail'); }
  if (/học phần|điểm|đạt|clo|plo|sinh viên|học viên/i.test(q)) { s.add('learning'); s.add('plos'); }
  if (/minh chứng|tiêu chí|bđcl|chất lượng|pdca/i.test(q)) { s.add('qa'); s.add('evidence'); }
  if (/nghiên cứu|nckh|bài báo|đề tài/i.test(q)) s.add('research');
  if (/công việc|nhiệm vụ|quá hạn|hạn/i.test(q)) s.add('tasks');
  if (/cải tiến/i.test(q)) s.add('improvement');
  if (s.size === 1) { s.add('kpis'); s.add('alerts'); }
  return [...s];
}

/* ---------------- Các section dữ liệu ---------------- */
function kpiItem(A: Analytics, id: string) {
  const k = A.kpi(id);
  return {
    ref: k.def.code, name: k.def.name, group: k.def.group, unit: k.def.unit, direction: k.def.direction === 'lower_better' ? 'càng thấp càng tốt' : 'càng cao càng tốt',
    period: k.periodLabel, actual: k.ev.value, target: k.def.target, completion_rate_pct: k.ev.cr, status: KPI_STATUS_LABEL[k.ev.status], rule: k.ev.rule, rule_reason: k.ev.reason,
    at_risk: k.ev.atRisk, risk_reasons: k.ev.riskReasons, trend: k.ev.trend, change_vs_previous: k.ev.change, deadline: k.def.deadline, days_to_deadline: k.ev.daysLeft,
    owner: k.owner?.fullName ?? null, series: k.series.map(p => ({ period: p.label, value: p.value })), evidence: k.evidence.map(x => ({ ref: `EV:${x.e.code}`, status: EVIDENCE_STATUS_LABEL[x.status] })),
  };
}
function courseItem(A: Analytics, courseId: string, detail: boolean) {
  const cs = A.courseSummary(courseId); const l = cs.latest;
  const base = {
    ref: `COURSE:${cs.course.code}`, name: cs.course.name, credits: cs.course.credits, program: A.get('programs', cs.course.programId)?.name, coordinator: A.lecturerName(cs.course.coordinatorId),
    latest_semester: l?.semester.code ?? null, registered: l?.registered ?? null, passed: l?.passed ?? null, pass_rate_pct: l?.passRate ?? null, fail_rate_pct: l?.failRate ?? null, avg_score: l?.avgScore ?? null,
    previous: cs.previous ? { semester: cs.previous.semester.code, pass_rate_pct: cs.previous.passRate, avg_score: cs.previous.avgScore } : null,
    attention_rules: cs.attention,
    clo_below_target: l ? l.clo.filter(c => c.below).map(c => ({ ref: `CLO:${cs.course.code}:${c.clo.code}`, clo: c.clo.code, attainment_pct: c.rate, target_pct: c.target, previous_pct: cs.previous?.clo.find(p => p.clo.id === c.clo.id)?.rate ?? null })) : [],
  };
  if (!detail) return base;
  return {
    ...base, syllabus: cs.course.syllabusStatus, pass_score: cs.course.passScore,
    assessment: cs.course.assessment.map(a => `${a.name} ${Math.round(a.weight * 100)}%`),
    clos: l ? l.clo.map(c => ({ ref: `CLO:${cs.course.code}:${c.clo.code}`, clo: c.clo.code, description: c.clo.description, attainment_pct: c.rate, target_pct: c.target, previous_pct: cs.previous?.clo.find(p => p.clo.id === c.clo.id)?.rate ?? null, plos: A.d.cloPloMap.filter(m => m.cloId === c.clo.id).map(m => `${A.get('plos', m.ploId)?.code} (mức ${m.level})`) })) : [],
    grade_distribution: l?.distribution ?? [],
    offerings: cs.offerings.map(o => ({ semester: o.semester.code, section: o.section.code, class: o.section.className, lecturer: o.lecturer?.fullName, registered: o.registered, pass_rate_pct: o.passRate, avg_score: o.avgScore, progress_pct: o.progressPct })),
    related_kpis: ['KPI-SV-01', 'KPI-SV-02', 'KPI-SV-03'].map(code => A.d.kpis.find(k => k.code === code)).filter(Boolean).map(k => kpiItem(A, k!.id)),
  };
}
function lecturerItem(A: Analytics, lecId: string, detail: boolean, names: boolean) {
  const s = A.lecturerSummary(lecId);
  const base = { ref: `GV:${s.lecturer.code}`, name: names ? s.lecturer.fullName : s.lecturer.code, degree: s.lecturer.degree, title: s.lecturer.title, employment: s.lecturer.employment === 'full_time' ? 'cơ hữu' : 'thỉnh giảng', workload: WORKLOAD_LABEL[s.band], hours: s.totalHours, norm_hours: s.lecturer.normHours, load_pct: s.ratio === null ? null : r1(s.ratio * 100), research_outputs_year: s.outputs.length, overdue_tasks: s.overdueTasks };
  if (!detail) return base;
  return { ...base, position: s.lecturer.position, section_hours: s.sectionHours, other_hours: s.otherHours, courses: s.courses.map(c => c.code), projects: s.projects.map(p => p.code), tasks: s.tasks.map(t => ({ ref: `TASK:${t.task.code}`, title: t.task.title, status: TASK_STATUS_LABEL[t.status], deadline: t.task.deadline })), qa_activities: s.qaActivities.map(a => a.code), alerts: s.alerts };
}

type Builder = (A: Analytics, scope: Scope) => unknown;
const SECTIONS: Record<ContextSection, Builder> = {
  overview: A => { const o = A.overview(); return { ref: 'OVERVIEW', department: A.department.name, academic_year: A.currentYear.code, semester: o.semester.name, lecturers_total: o.lecturers, lecturers_full_time: o.fullTime, phd_full_time: o.phd, courses: o.courses, sections_in_semester: o.sectionsInSemester, students: o.students, results: { semester: o.semester.code, registered: o.results.registered, passed: o.results.passed, pass_rate_pct: o.results.passRate, avg_score: o.results.avgScore, clo_rate_pct: o.results.cloRate }, kpi_counts: { total: o.kpi.total, achieved: o.kpi.achieved, attention: o.kpi.attention, not_achieved: o.kpi.notAchieved, overdue: o.kpi.overdue, at_risk: o.kpi.atRisk }, overdue_tasks: o.overdueTasks, missing_evidence_items: o.missingEvidence, improvement_open: o.improvementOpen, research_outputs_year: o.researchThisYear }; },
  kpis: (A, sc) => (sc.type === 'kpi' && sc.id ? [kpiItem(A, sc.id)] : A.d.kpis.map(k => kpiItem(A, k.id))),
  alerts: A => A.alerts().slice(0, 12).map((a, i) => ({ ref: `ALERT:${i + 1}`, level: a.level, area: a.area, title: a.title, detail: a.detail, owner: a.owner, due: a.due ?? null, subject: a.ref })),
  staff: A => { const rows = A.lecturers(); const cfg = A.settings.workload; return { ref: 'STAFF', thresholds_pct: { underload: cfg.underloadRatio * 100, overload: cfg.overloadRatio * 100 }, counts: { ok: rows.filter(r => r.band === 'ok').length, over: rows.filter(r => r.band === 'over').length, under: rows.filter(r => r.band === 'under').length, leave: rows.filter(r => r.band === 'leave').length }, flagged: rows.filter(r => r.band === 'over' || r.band === 'under' || r.overdueTasks).map(r => lecturerItem(A, r.lecturer.id, false, A.settings.ai.includeStaffNames)) }; },
  staff_detail: (A, sc) => (sc.type === 'lecturer' && sc.id ? [lecturerItem(A, sc.id, true, A.settings.ai.includeStaffNames)] : A.d.lecturers.map(l => lecturerItem(A, l.id, false, A.settings.ai.includeStaffNames))),
  learning: A => { const sems = A.gradedSemesters(); return { ref: 'LEARNING', by_semester: sems.map(s => { const r = A.semesterResults(s.id); return { semester: s.code, sections: r.sections, registered: r.registered, passed: r.passed, pass_rate_pct: r.passRate, avg_score: r.avgScore, clo_rate_pct: r.cloRate }; }), fail_rate_alert_pct: A.settings.course.failRateAlertPct, courses: A.d.courses.map(c => courseItem(A, c.id, false)) }; },
  course_detail: (A, sc) => (sc.type === 'course' && sc.id ? courseItem(A, sc.id, true) : null),
  plos: A => { const sems = A.semestersOfYear(A.currentYear.id).map(s => s.id); return A.d.programs.map(p => ({ program: p.name, plos: A.ploAttainment(p.id, sems).map(x => ({ ref: `PLO:${p.code}:${x.plo.code}`, plo: x.plo.code, attainment_pct: x.rate, target_pct: x.target })) })); },
  research: A => ({ ref: 'RESEARCH', by_year: A.researchByYear().map(y => ({ academic_year: y.year.code, journal_articles: y.journal, conference_papers: y.conference, books: y.book, products: y.product, total: y.total })), projects: A.projectRows().map(r => ({ ref: `PRJ:${r.p.code}`, title: r.p.title, level: r.p.level, status: r.p.status, progress_pct: r.p.progressPct, time_elapsed_pct: r.timePct, gap_pct_points: r.gap, end_date: r.p.endDate })) }),
  qa: A => { const fw = A.activeFramework(); const rows = A.qaRows(); return { ref: 'QA', framework: fw ? `${fw.code} — ${fw.name} (phiên bản ${fw.version})` : null, activities: rows.map(r => ({ ref: `QAACT:${r.a.code}`, title: r.a.title, phase: r.a.phase, status: QA_STATUS_LABEL[r.status], progress_pct: r.a.progressPct, due: r.a.dueDate, owner: r.owner?.fullName ?? null, criterion: r.criterion?.code ?? null, kpi: r.kpi?.code ?? null })), findings: A.d.qaFindings.map(f => ({ ref: `FIND:${f.code}`, type: f.type === 'strength' ? 'điểm mạnh' : 'điểm yếu', statement: f.statement, kpi: A.get('kpis', f.kpiId)?.code ?? null, date: f.date })), chains: A.d.kpis.map(k => A.qaChain(k.id)).filter(c => c.gaps.length).map(c => ({ ref: `CHAIN:${c.kpi.def.code}`, kpi: c.kpi.def.code, gaps: c.gaps })) }; },
  evidence: A => ({ ref: 'EVIDENCE', criteria: A.coverageAll().map(c => ({ ref: `CRIT:${c.criterion.code}`, criterion: c.criterion.content, valid: c.valid, required: c.required, coverage: c.coverage })), items_not_complete: A.evidenceRows().filter(r => r.status !== 'complete').map(r => ({ ref: `EV:${r.e.code}`, name: r.e.name, status: EVIDENCE_STATUS_LABEL[r.status], reason: r.reason, owner: r.owner?.fullName ?? null })) }),
  improvement: A => A.d.improvementActions.map(a => { const res = A.actionResult(a); return { ref: `CI:${a.code}`, title: a.title, status: A.actionStatus(a), owner: A.lecturerName(a.ownerId), due: a.dueDate, kpi: A.get('kpis', a.kpiId)?.code ?? null, result: res.label, before: res.before?.value ?? null, after: res.after?.value ?? null }; }),
  tasks: A => { const rows = A.taskRows(); return { ref: 'TASKS', total: rows.length, open: rows.filter(r => r.status !== 'done').length, overdue: rows.filter(r => r.status === 'overdue').map(r => ({ ref: `TASK:${r.task.code}`, title: r.task.title, owner: r.owner?.fullName ?? null, deadline: r.task.deadline, priority: r.task.priority, days_late: -r.daysLeft })), due_soon: rows.filter(r => r.status !== 'done' && r.status !== 'overdue' && r.daysLeft <= A.settings.task.dueSoonDays).length }; },
  settings: A => ({ ref: 'SETTINGS', kpi_rules: `Đạt khi CR ≥ ${A.settings.kpi.achievedPct}%; Cần chú ý ${A.settings.kpi.attentionPct}–${A.settings.kpi.achievedPct}%; Không đạt < ${A.settings.kpi.attentionPct}%; Quá hạn khi qua deadline mà chưa đạt`, fail_rate_alert_pct: A.settings.course.failRateAlertPct, clo_pass_score: A.settings.course.cloPassScore, workload_overload_pct: A.settings.workload.overloadRatio * 100, workload_underload_pct: A.settings.workload.underloadRatio * 100 }),
};

/** Dữ liệu còn thiếu (để AI nói rõ, không đoán) */
function dataGaps(A: Analytics, sections: ContextSection[], scope: Scope = { type: 'department' }): string[] {
  const g: string[] = [];
  // Kiểm tra chất lượng dữ liệu nguồn: số liệu ngoài miền hợp lệ → báo DATA GAP để AI không kết luận trên số sai
  if (sections.some(s => s === 'learning' || s === 'course_detail' || s === 'overview')) {
    const secIds = new Set(A.d.sections.filter(x => scope.type !== 'course' || x.courseId === scope.id).map(x => x.id));
    const bad = new Map<string, number>();
    A.d.enrollments.forEach(e => { if (!secIds.has(e.sectionId)) return;
      const vals = [...Object.values(e.components), ...Object.values(e.cloScores)].filter((v): v is number => typeof v === 'number');
      if (vals.some(v => !Number.isFinite(v) || v < 0 || v > 10)) { const code = A.get('sections', e.sectionId)?.code ?? e.sectionId; bad.set(code, (bad.get(code) ?? 0) + 1); } });
    if (bad.size) g.push(`Dữ liệu bất thường: ${[...bad.values()].reduce((a, b) => a + b, 0)} lượt đăng ký có điểm ngoài thang 0–10 (${[...bad.entries()].map(([k, n]) => `${k}: ${n}`).join(', ')}). Các chỉ số tính từ những lớp này có thể sai — cần kiểm tra dữ liệu nguồn trước khi kết luận.`);
  }
  if (sections.includes('kpis')) A.kpis().filter(k => k.ev.value !== null && (k.ev.value < 0 || (k.def.unit === '%' && k.ev.value > 100))).forEach(k => g.push(`Dữ liệu bất thường: ${k.def.code} có giá trị ${k.ev.value}${k.def.unit} ngoài miền hợp lệ.`));
  if (sections.some(s => s === 'learning' || s === 'course_detail')) g.push('Không có dữ liệu dự giờ, nội dung đề thi, ý kiến chi tiết của người học theo học phần — không thể kết luận nguyên nhân sư phạm.');
  if (sections.includes('kpis')) A.kpis().filter(k => k.series.length < 2).forEach(k => g.push(`${k.def.code}: chỉ có số liệu 1 kỳ, chưa đánh giá được xu hướng.`));
  if (sections.includes('qa') || sections.includes('evidence')) { const fw = A.activeFramework(); if (fw?.note) g.push(`Bộ tiêu chuẩn: ${fw.note}`); }
  return g;
}

/** Dựng DATA CONTEXT cho một tác vụ */
export function buildContext(A: Analytics, taskId: TaskId, opt: { question?: string; scope?: Scope | null; maxChars?: number } = {}): BuiltContext {
  const T = TASKS[taskId];
  const scope: Scope = opt.scope ?? { type: 'department' };
  // Phạm vi phải tồn tại trong dữ liệu (không để lỗi kỹ thuật lộ ra giao diện)
  if (scope.type !== 'department') {
    const table = scope.type === 'kpi' ? 'kpis' : scope.type === 'course' ? 'courses' : 'lecturers';
    const what = scope.type === 'kpi' ? 'KPI' : scope.type === 'course' ? 'học phần' : 'giảng viên';
    if (!scope.id || !A.get(table, scope.id)) throw new Error(`Không tìm thấy ${what} “${scope.label ?? scope.id ?? ''}” trong dữ liệu — vui lòng chọn lại phạm vi.`);
  }
  let sections: ContextSection[] = T.sections.length ? [...T.sections] : sectionsForQuestion(opt.question ?? '');
  if (scope.type === 'course' && !sections.includes('course_detail')) sections.push('course_detail');
  if (scope.type === 'lecturer' && !sections.includes('staff_detail')) sections.push('staff_detail');
  if (scope.type === 'kpi' && !sections.includes('kpis')) sections.push('kpis');
  const context: Record<string, unknown> = {
    meta: { department: A.department.name, academic_year: A.currentYear.code, semester: A.currentSemester.name, reference_date: A.ref, scope: scope.type === 'department' ? 'Toàn Bộ môn' : `${scope.type}:${scope.label ?? scope.id}`, note: 'Số liệu do hệ thống tính từ dữ liệu nguồn; trạng thái KPI/cảnh báo do quy tắc, không do AI.' },
  };
  sections.forEach(s => { const v = SECTIONS[s](A, scope); if (v !== null && v !== undefined) context[s] = v; });
  context.data_gaps = dataGaps(A, sections, scope);
  // Giới hạn kích thước: cắt dần phần ít quan trọng
  const max = opt.maxChars ?? A.settings.ai.maxContextChars;
  const truncated: string[] = [];
  const cutters: [string, () => void][] = [
    ['kpis.series → 2 kỳ', () => { (context.kpis as { series: unknown[] }[] | undefined)?.forEach(k => { k.series = k.series.slice(-2); }); }],
    ['learning.courses → chỉ học phần cần chú ý', () => { const l = context.learning as { courses: { attention_rules: string[] }[] } | undefined; if (l) l.courses = l.courses.filter(c => c.attention_rules.length); }],
    ['staff_detail → chỉ GV có cảnh báo', () => { if (Array.isArray(context.staff_detail)) context.staff_detail = (context.staff_detail as { workload: string; overdue_tasks: number }[]).filter(x => x.workload !== 'Trong ngưỡng' || x.overdue_tasks); }],
    ['qa.activities → chưa hoàn thành', () => { const q = context.qa as { activities: { status: string }[] } | undefined; if (q) q.activities = q.activities.filter(a => a.status !== 'Hoàn thành'); }],
    ['alerts → 6', () => { if (Array.isArray(context.alerts)) context.alerts = (context.alerts as unknown[]).slice(0, 6); }],
  ];
  let json = JSON.stringify(context);
  for (const [label, cut] of cutters) { if (json.length <= max) break; cut(); truncated.push(label); json = JSON.stringify(context); }
  if (truncated.length) (context.meta as Record<string, unknown>).truncated = truncated;
  if (json.length > max) throw new Error(`Dữ liệu gửi AI vượt giới hạn ${max} ký tự sau khi rút gọn (${json.length}).`);
  return { taskId, context, sections, chars: JSON.stringify(context).length, truncated, scope };
}
