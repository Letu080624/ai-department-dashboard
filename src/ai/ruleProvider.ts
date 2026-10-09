/* =========================================================================
 * Provider dự phòng: tổng hợp bằng QUY TẮC từ chính DATA CONTEXT (không phải AI).
 * Dùng khi: chạy Demo không có Gemini, server/Gemini lỗi, quá thời gian, hết hạn mức, hoặc người dùng tắt AI.
 * Chỉ sinh FACT (số liệu nguyên văn từ context) và đề xuất có sẵn trong cảnh báo — không suy luận, không dự báo.
 * ========================================================================= */
import type { AiFact, AiFinding, AiRecommendation, AiResponse, AiRisk, ReportNarrative } from './schema';
import type { TaskId } from './prompts';

type Ctx = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (v: unknown) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '—'));
const fact = (statement: string, refs: string[], polarity: AiFinding['polarity']): AiFinding => ({ statement, kind: 'fact', polarity, refs, confidence: 'high' });
const rec = (action: string, rationale: string, refs: string[], o: Partial<AiRecommendation> = {}): AiRecommendation => ({ action, rationale, owner_role: 'chưa xác định', due_hint: '', success_measure: 'Theo dõi chỉ số liên quan ở kỳ đo tiếp theo', priority: 'medium', refs, propose_improvement_action: false, ...o });

export function ruleResponse(_task: TaskId, ctx: Ctx): AiResponse {
  const facts: AiFact[] = [], findings: AiFinding[] = [], risks: AiRisk[] = [], recs: AiRecommendation[] = [];
  const kpis: Ctx[] = Array.isArray(ctx.kpis) ? ctx.kpis : [];
  const order = (k: Ctx) => ({ 'Quá hạn': 0, 'Không đạt': 1, 'Cần chú ý': 2 } as Record<string, number>)[k.status] ?? (k.at_risk ? 3 : 9);
  kpis.slice().sort((a, b) => order(a) - order(b)).forEach(k => {
    if (k.actual !== null) facts.push({ statement: `${k.ref} ${k.name}: ${fmt(k.actual)} ${k.unit} / mục tiêu ${fmt(k.target)} ${k.unit} (${k.status})`, value: k.actual, unit: k.unit, ref: k.ref });
    if (k.status === 'Đạt') findings.push(fact(`${k.ref} (${k.name}) đạt mục tiêu: ${fmt(k.actual)} ${k.unit}.`, [k.ref], 'positive'));
    else if (['Không đạt', 'Quá hạn', 'Cần chú ý'].includes(k.status)) findings.push(fact(`${k.ref} (${k.name}) ${String(k.status).toLowerCase()}: ${fmt(k.actual)}/${fmt(k.target)} ${k.unit}, CR ${fmt(k.completion_rate_pct)}% (quy tắc ${k.rule}).`, [k.ref], 'negative'));
    if (k.at_risk) risks.push({ statement: `${k.ref} có cờ nguy cơ không đạt theo quy tắc: ${k.risk_reasons.join('; ')}.`, kind: 'fact', likelihood: 'medium', impact: `Không đạt mục tiêu ${fmt(k.target)} ${k.unit} đến hạn ${k.deadline}`, refs: [k.ref], confidence: 'high' });
    if (k.status === 'Quá hạn') risks.push({ statement: `${k.ref} đã quá hạn ${k.deadline} mà chưa đạt.`, kind: 'fact', likelihood: 'high', impact: 'Ảnh hưởng kết quả tự đánh giá và kế hoạch năm học', refs: [k.ref], confidence: 'high' });
    if (['Không đạt', 'Quá hạn'].includes(k.status) || k.at_risk) recs.push(rec(`Rà soát ${k.ref} (${k.name}) và lập hành động cải tiến gắn với KPI`, `${k.status}${k.at_risk ? ', có nguy cơ' : ''} theo quy tắc ${k.rule}`, [k.ref], { owner_role: k.owner ?? 'chưa xác định', due_hint: k.deadline, priority: k.status === 'Quá hạn' || k.status === 'Không đạt' ? 'high' : 'medium', success_measure: `${k.ref} đạt mục tiêu ở kỳ đo tiếp theo`, kpi_ref: k.ref, propose_improvement_action: true }));
  });
  const courses: Ctx[] = ctx.course_detail ? [ctx.course_detail] : (ctx.learning?.courses ?? []).filter((c: Ctx) => c.attention_rules?.length);
  courses.forEach(c => {
    if (c.pass_rate_pct !== null) facts.push({ statement: `${c.name}: tỷ lệ đạt ${fmt(c.pass_rate_pct)}%, điểm TB ${fmt(c.avg_score)} (${c.latest_semester})`, value: c.pass_rate_pct, unit: '%', ref: c.ref });
    (c.clo_below_target ?? []).forEach((b: Ctx) => findings.push(fact(`${b.clo} của ${c.ref.replace('COURSE:', '')}: ${fmt(b.attainment_pct)}%${b.previous_pct !== null ? ` (lần trước ${fmt(b.previous_pct)}%)` : ''}, dưới mục tiêu ${fmt(b.target_pct)}%.`, [b.ref], 'negative')));
    (c.attention_rules ?? []).forEach((r: string) => findings.push(fact(`${c.name}: ${r}.`, [c.ref], 'negative')));
    if ((c.attention_rules ?? []).length) recs.push(rec(`Rà soát phương pháp giảng dạy và đánh giá học phần ${c.ref.replace('COURSE:', '')}`, (c.attention_rules ?? []).join('; '), [c.ref], { owner_role: c.coordinator ?? 'GV phụ trách học phần', priority: 'high', success_measure: 'Tỷ lệ đạt CLO ở lần mở tiếp theo (KPI-SV-02)', kpi_ref: 'KPI-SV-02', propose_improvement_action: true }));
    if (ctx.course_detail && !(c.attention_rules ?? []).length) findings.push(fact(`${c.name} không có cảnh báo theo quy tắc ở lần mở gần nhất.`, [c.ref], 'positive'));
  });
  const staff: Ctx[] = Array.isArray(ctx.staff_detail) ? ctx.staff_detail : ctx.staff?.flagged ?? [];
  staff.filter(s => ['Quá tải', 'Thiếu giờ'].includes(s.workload) || ctx.staff_detail?.length === 1).forEach(s => {
    if (s.load_pct !== null) facts.push({ statement: `${s.name}: ${fmt(s.hours)}/${fmt(s.norm_hours)} giờ (${fmt(s.load_pct)}% định mức)`, value: s.load_pct, unit: '% định mức', ref: s.ref });
    findings.push(fact(`${s.name}: tải giảng ${fmt(s.load_pct)}% định mức — ${String(s.workload).toLowerCase()}.`, [s.ref], s.workload === 'Trong ngưỡng' ? 'positive' : 'negative'));
    if (s.workload === 'Quá tải') recs.push(rec(`Điều chỉnh phân công giảng dạy cho ${s.name}`, `${fmt(s.load_pct)}% định mức`, [s.ref], { owner_role: 'Phó Trưởng Bộ môn', priority: 'high', success_measure: 'KPI-DN-02 Tỷ lệ GV trong ngưỡng định mức', kpi_ref: 'KPI-DN-02', propose_improvement_action: true }));
  });
  if (ctx.evidence) {
    (ctx.evidence.criteria as Ctx[]).filter(c => c.coverage !== 'full').forEach(c => findings.push(fact(`${c.ref.replace('CRIT:', 'Tiêu chí ')}: ${c.valid}/${c.required} minh chứng hợp lệ.`, [c.ref], 'negative')));
    (ctx.evidence.items_not_complete as Ctx[]).slice(0, 8).forEach(e => { findings.push(fact(`${e.ref.replace('EV:', '')} "${e.name}": ${e.status} (${e.reason}).`, [e.ref], 'negative')); recs.push(rec(`Bổ sung/cập nhật minh chứng ${e.ref.replace('EV:', '')} — ${e.name}`, e.reason, [e.ref], { owner_role: e.owner ?? 'chưa xác định', priority: e.status === 'Thiếu' ? 'high' : 'medium', success_measure: 'KPI-CL-01 Độ phủ minh chứng' })); });
  }
  if (ctx.research) { (ctx.research.by_year as Ctx[]).forEach(y => facts.push({ statement: `Năm học ${y.academic_year}: ${y.total} sản phẩm (${y.journal_articles} bài báo tạp chí)`, value: y.total, unit: 'sản phẩm', ref: 'RESEARCH' })); (ctx.research.projects as Ctx[]).filter(p => p.gap_pct_points < -15 || p.status === 'overdue_report').forEach(p => risks.push({ statement: `Đề tài ${p.ref.replace('PRJ:', '')} có tiến độ ${fmt(p.progress_pct)}% so với ${fmt(p.time_elapsed_pct)}% thời gian.`, kind: 'fact', likelihood: 'medium', impact: 'Chậm nghiệm thu đề tài', refs: [p.ref], confidence: 'high' })); }
  if (ctx.tasks?.overdue?.length) risks.push({ statement: `${ctx.tasks.overdue.length} công việc quá hạn.`, kind: 'fact', likelihood: 'high', impact: 'Ảnh hưởng tiến độ KPI liên quan', refs: ['TASKS'], confidence: 'high' });
  (ctx.alerts as Ctx[] | undefined)?.filter(a => a.level !== 'medium').slice(0, 4).forEach(a => { if (!recs.some(r => r.refs.includes(a.subject))) recs.push(rec(`Xử lý: ${a.title}`, a.detail, [a.ref], { owner_role: a.owner, due_hint: a.due ?? '', priority: 'high' })); });
  const o = ctx.overview;
  const head = o ? `${o.kpi_counts.achieved}/${o.kpi_counts.total} KPI đạt, ${o.kpi_counts.overdue} quá hạn, ${o.kpi_counts.at_risk} có nguy cơ; tỷ lệ đạt học phần ${fmt(o.results.pass_rate_pct)}% (${o.results.semester}).` : courses.length === 1 ? `${courses[0].name}: tỷ lệ đạt ${fmt(courses[0].pass_rate_pct)}%, ${(courses[0].clo_below_target ?? []).length} CLO dưới mục tiêu.` : 'Các dữ kiện liên quan được liệt kê dưới đây.';
  // Học phần chưa có lần mở nào có điểm: không in “tỷ lệ đạt —%”, nói rõ thiếu dữ liệu
  const noResults = !!ctx.course_detail && (ctx.course_detail.pass_rate_pct === null || ctx.course_detail.latest_semester === null);
  if (noResults) { findings.length = 0; recs.length = 0; }
  const prio = recs.slice().sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority));
  const empty = (!facts.length && !findings.length) || noResults;
  const gaps = (ctx.data_gaps ?? []).concat(noResults ? [`${ctx.course_detail.name} chưa có lần mở lớp nào có điểm trong dữ liệu.`] : [], ['Chế độ quy tắc không phân tích nguyên nhân hay dự báo.']);
  return {
    summary: empty ? (noResults ? `${ctx.course_detail.name} chưa có kết quả học tập trong dữ liệu. Không đủ dữ liệu để kết luận.` : 'Không đủ dữ liệu để kết luận.') : `${head} Bản tổng hợp bằng quy tắc (không dùng AI): chỉ có dữ kiện và đề xuất sẵn có, không có suy luận.`,
    facts: facts.slice(0, 10), findings: findings.slice(0, 12), risks: risks.slice(0, 8), recommendations: recs.slice(0, 8), priority_actions: prio.slice(0, 3),
    data_gaps: gaps, confidence: empty ? 'low' : 'medium', insufficient_data: empty,
  };
}

/** Nhận xét báo cáo dự phòng: mỗi mục 1 đoạn FACT lấy nguyên văn số liệu từ context */
export function ruleReport(ctx: Ctx): ReportNarrative {
  const o = ctx.overview, s: ReportNarrative['sections'] = [];
  const p = (key: ReportNarrative['sections'][number]['key'], text: string, refs: string[]) => s.push({ key, paragraphs: [{ text, kind: 'fact', refs }] });
  if (o) {
    p('executive', `${o.department} năm học ${o.academic_year}: ${o.kpi_counts.achieved}/${o.kpi_counts.total} KPI đạt, ${o.kpi_counts.overdue} KPI quá hạn; tỷ lệ đạt học phần ${fmt(o.results.pass_rate_pct)}% (${o.results.semester}); ${o.overdue_tasks} công việc quá hạn.`, ['OVERVIEW']);
    p('staff', `Bộ môn có ${o.lecturers_total} giảng viên, trong đó ${o.lecturers_full_time} cơ hữu, ${o.phd_full_time} có học vị tiến sĩ.`, ['OVERVIEW']);
    p('students', `Kỳ ${o.results.semester}: ${o.results.passed}/${o.results.registered} lượt đạt, tỷ lệ đạt ${fmt(o.results.pass_rate_pct)}%, điểm trung bình ${fmt(o.results.avg_score)}.`, ['OVERVIEW']);
  }
  if (ctx.staff) p('teaching', `Tải giảng: ${ctx.staff.counts.ok} GV trong ngưỡng, ${ctx.staff.counts.over} quá tải, ${ctx.staff.counts.under} thiếu giờ.`, ['STAFF']);
  if (ctx.research) { const y = ctx.research.by_year.at(-1); if (y) p('research', `Năm học ${y.academic_year}: ${y.total} sản phẩm khoa học, trong đó ${y.journal_articles} bài báo tạp chí.`, ['RESEARCH']); }
  if (o) p('kpi', `${o.kpi_counts.achieved} KPI đạt, ${o.kpi_counts.attention} cần chú ý, ${o.kpi_counts.not_achieved} không đạt, ${o.kpi_counts.overdue} quá hạn.`, ['OVERVIEW']);
  if (ctx.evidence) { const miss = (ctx.evidence.criteria as Ctx[]).filter(c => c.coverage !== 'full').length; p('evidence', `${miss} tiêu chí chưa đủ minh chứng hợp lệ; ${(ctx.evidence.items_not_complete as Ctx[]).length} minh chứng chưa ở trạng thái Đủ.`, ['EVIDENCE']); }
  const r = ruleResponse('department_report', ctx);
  return { sections: s, recommendations: r.recommendations.slice(0, 6), data_gaps: r.data_gaps, confidence: 'medium' };
}
