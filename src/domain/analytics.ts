/* =========================================================================
 * Analytics — tính mọi chỉ số tổng hợp TỪ DỮ LIỆU NGUỒN (DataSnapshot).
 * Thuần TypeScript, có memo; dùng chung cho giao diện, AI Context Builder, báo cáo, server và test.
 * ========================================================================= */
import type * as T from '../types/domain';
import * as R from './rules';

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export interface SectionResult {
  section: T.Section; course: T.Course; semester: T.Semester; lecturer: T.Lecturer | undefined;
  registered: number; examined: number; passed: number; failed: number; absent: number;
  passRate: number | null; failRate: number | null; avgScore: number | null;
  distribution: { band: string; count: number }[];
  clo: { clo: T.CLO; rate: number | null; target: number; below: boolean }[];
  progressPct: number;
}
export interface CourseSummary {
  course: T.Course; offerings: SectionResult[]; latest: SectionResult | null; previous: SectionResult | null;
  attention: string[]; cloBelow: string[];
}
export interface LecturerSummary {
  lecturer: T.Lecturer; sectionHours: number; otherHours: number; totalHours: number; ratio: number | null; band: R.WorkloadBand;
  sections: T.Section[]; courses: T.Course[]; outputs: T.ResearchOutput[]; projects: T.ResearchProject[];
  tasks: { task: T.Task; status: R.TaskStatus }[]; overdueTasks: number;
  qaActivities: T.QaActivity[]; evidenceOwned: T.Evidence[]; kpisOwned: T.KpiDefinition[];
  alerts: string[];
}
export interface KpiView { def: T.KpiDefinition; series: R.KpiPoint[]; ev: R.KpiEvaluation; periodLabel: string; owner: T.User | undefined; evidence: { e: T.Evidence; status: R.EvidenceStatus }[] }

export const GRADE_BANDS = [{ band: '< 4', lo: 0, hi: 4 }, { band: '4–5,4', lo: 4, hi: 5.5 }, { band: '5,5–6,9', lo: 5.5, hi: 7 }, { band: '7–8,4', lo: 7, hi: 8.5 }, { band: '≥ 8,5', lo: 8.5, hi: 10.01 }];

export class Analytics {
  readonly d: T.DataSnapshot;
  readonly ref: string;
  private memo = new Map<string, unknown>();
  private byId = new Map<string, Map<string, unknown>>();

  constructor(snapshot: T.DataSnapshot) { this.d = snapshot; this.ref = snapshot.settings.referenceDate; }
  private m<X>(key: string, fn: () => X): X { if (!this.memo.has(key)) this.memo.set(key, fn()); return this.memo.get(key) as X; }
  get<K extends keyof T.DataSnapshot>(table: K, id: string | null | undefined): (T.DataSnapshot[K] extends (infer U)[] ? U : never) | undefined {
    if (!id) return undefined;
    let map = this.byId.get(table as string);
    if (!map) { map = new Map((this.d[table] as unknown as { id: string }[]).map(r => [r.id, r])); this.byId.set(table as string, map); }
    return map.get(id) as never;
  }
  get settings() { return this.d.settings; }
  get department() { return this.d.units.find(u => u.type === 'department')!; }
  get currentYear() { return this.get('academicYears', this.d.settings.currentAcademicYearId)!; }
  get currentSemester() { return this.get('semesters', this.d.settings.currentSemesterId)!; }
  semestersOfYear(yearId: string) { return this.d.semesters.filter(s => s.academicYearId === yearId).sort((a, b) => a.order - b.order); }
  /** Các học kỳ đã kết thúc và có điểm (đến ngày tham chiếu), cũ → mới */
  gradedSemesters() { return this.m('gradedSems', () => this.d.semesters.filter(s => s.endDate <= this.ref && this.d.sections.some(x => x.semesterId === s.id)).sort((a, b) => a.order - b.order)); }
  userName(id: string | null | undefined) { return this.get('users', id)?.fullName ?? '—'; }
  lecturerName(id: string | null | undefined) { return this.get('lecturers', id)?.fullName ?? '—'; }

  /* ---------------- Kết quả học tập ---------------- */
  finalScore(e: T.Enrollment, c: T.Course): number | null {
    if (e.absentFinal) return null;
    let s = 0;
    for (const a of c.assessment) { const v = e.components[a.code]; if (v === null || v === undefined) return null; s += v * a.weight; }
    return r2(s);
  }
  sectionResult(sectionId: string): SectionResult {
    return this.m('sr|' + sectionId, () => {
      const section = this.get('sections', sectionId)!, course = this.get('courses', section.courseId)!, semester = this.get('semesters', section.semesterId)!;
      const enr = this.d.enrollments.filter(e => e.sectionId === sectionId);
      const scores = enr.map(e => this.finalScore(e, course));
      const examined = scores.filter((x): x is number => x !== null);
      const passed = examined.filter(x => x >= course.passScore).length;
      const absent = enr.filter(e => e.absentFinal).length;
      const cfg = this.settings.course;
      const clo = this.d.clos.filter(c => c.courseId === course.id).map(c => {
        const vals = enr.filter(e => !e.absentFinal).map(e => e.cloScores[c.id]).filter(v => v !== undefined);
        const rate = vals.length ? r1(vals.filter(v => v >= cfg.cloPassScore).length / vals.length * 100) : null;
        return { clo: c, rate, target: c.targetPct, below: rate !== null && rate < c.targetPct };
      });
      return {
        section, course, semester, lecturer: this.get('lecturers', section.lecturerId),
        registered: enr.length, examined: examined.length, passed, failed: examined.length - passed + absent, absent,
        passRate: enr.length ? r1(passed / enr.length * 100) : null, failRate: enr.length ? r1((enr.length - passed) / enr.length * 100) : null,
        avgScore: examined.length ? r2(avg(examined)!) : null,
        distribution: GRADE_BANDS.map(b => ({ band: b.band, count: examined.filter(x => x >= b.lo && x < b.hi).length })),
        clo, progressPct: section.plannedSessions ? r1(section.deliveredSessions / section.plannedSessions * 100) : 0,
      };
    });
  }
  /** Gộp kết quả nhiều lớp: tỷ lệ đạt = tổng đạt / tổng đăng ký (vắng thi tính chưa đạt) */
  aggregate(sectionIds: string[]) {
    const rs = sectionIds.map(id => this.sectionResult(id));
    const reg = rs.reduce((s, r) => s + r.registered, 0), passed = rs.reduce((s, r) => s + r.passed, 0), examined = rs.reduce((s, r) => s + r.examined, 0);
    const sumScore = rs.reduce((s, r) => s + (r.avgScore ?? 0) * r.examined, 0);
    const cloRates = rs.flatMap(r => r.clo.map(c => c.rate)).filter((x): x is number => x !== null);
    return { sections: rs.length, registered: reg, examined, passed, failed: reg - passed, passRate: reg ? r1(passed / reg * 100) : null, avgScore: examined ? r2(sumScore / examined) : null, cloRate: cloRates.length ? r1(avg(cloRates)!) : null };
  }
  sectionsOf(semIds: string[]) { return this.d.sections.filter(s => semIds.includes(s.semesterId)); }
  semesterResults(semId: string) { return this.m('semres|' + semId, () => this.aggregate(this.sectionsOf([semId]).map(s => s.id))); }
  courseSummary(courseId: string): CourseSummary {
    return this.m('cs|' + courseId, () => {
      const course = this.get('courses', courseId)!;
      const offerings = this.d.sections.filter(s => s.courseId === courseId && this.gradedSemesters().some(g => g.id === s.semesterId))
        .map(s => this.sectionResult(s.id)).sort((a, b) => a.semester.order - b.semester.order);
      const latest = offerings.at(-1) ?? null, previous = offerings.length > 1 ? offerings.at(-2)! : null;
      const cloBelow = latest ? latest.clo.filter(c => c.below).map(c => c.clo.code) : [];
      const attention = latest ? R.courseAttention({ failRate: latest.failRate, passRate: latest.passRate, prevPassRate: previous?.passRate ?? null, cloBelow }, this.settings.course) : [];
      return { course, offerings, latest, previous, attention, cloBelow };
    });
  }
  courses() { return this.d.courses.map(c => this.courseSummary(c.id)); }
  /** Mức đạt PLO = trung bình có trọng số (mức đóng góp 1–3) của tỷ lệ đạt các CLO ánh xạ, trong các học kỳ chọn */
  ploAttainment(programId: string, semIds: string[]) {
    return this.m(`plo|${programId}|${semIds.join(',')}`, () => this.d.plos.filter(p => p.programId === programId).map(p => {
      let w = 0, sum = 0; const contributors: string[] = [];
      this.d.cloPloMap.filter(m => m.ploId === p.id).forEach(m => {
        const clo = this.get('clos', m.cloId)!;
        this.d.sections.filter(s => s.courseId === clo.courseId && semIds.includes(s.semesterId)).forEach(s => {
          const c = this.sectionResult(s.id).clo.find(x => x.clo.id === clo.id);
          if (c && c.rate !== null) { w += m.level; sum += c.rate * m.level; contributors.push(`${this.get('courses', clo.courseId)!.code}:${clo.code}`); }
        });
      });
      return { plo: p, rate: w ? r1(sum / w) : null, target: p.targetPct, contributors: [...new Set(contributors)] };
    }));
  }

  /* ---------------- Đội ngũ, tải giảng ---------------- */
  sectionHours(s: T.Section) { return r1(this.get('courses', s.courseId)!.credits * this.settings.workload.hoursPerCredit * s.hoursFactor); }
  lecturerSummary(lecId: string, yearId = this.currentYear.id): LecturerSummary {
    return this.m(`ls|${lecId}|${yearId}`, () => {
      const lecturer = this.get('lecturers', lecId)!;
      const semIds = this.semestersOfYear(yearId).map(s => s.id);
      const sections = this.d.sections.filter(s => s.lecturerId === lecId && semIds.includes(s.semesterId));
      const sectionHours = r1(sections.reduce((a, s) => a + this.sectionHours(s), 0));
      const otherHours = r1(this.d.otherLoads.filter(o => o.lecturerId === lecId && o.academicYearId === yearId).reduce((a, o) => a + o.hours, 0));
      const totalHours = r1(sectionHours + otherHours);
      const ratio = lecturer.normHours > 0 ? Math.round(totalHours / lecturer.normHours * 1000) / 1000 : null;
      const band = R.workloadBand(ratio, lecturer.status, this.settings.workload);
      const user = this.d.users.find(u => u.lecturerId === lecId);
      const tasks = this.d.tasks.filter(t => t.ownerId === lecId).map(t => ({ task: t, status: R.taskStatus(t, this.ref) }));
      const outputs = this.d.researchOutputs.filter(o => o.authorIds.includes(lecId) && o.academicYearId === yearId);
      const alerts: string[] = [];
      if (band === 'over') alerts.push(`Quá tải giờ giảng: ${r1(ratio! * 100)}% định mức`);
      if (band === 'under') alerts.push(`Thiếu giờ giảng: ${r1(ratio! * 100)}% định mức`);
      if (lecturer.employment === 'full_time' && lecturer.status === 'active' && !outputs.length) alerts.push('Chưa có sản phẩm NCKH trong năm học');
      const overdueTasks = tasks.filter(t => t.status === 'overdue').length;
      if (overdueTasks) alerts.push(`${overdueTasks} công việc quá hạn`);
      const evidenceOwned = this.d.evidence.filter(e => e.ownerId === lecId);
      const evBad = evidenceOwned.filter(e => !R.evidenceValid(this.evidenceStatus(e).status)).length;
      if (evBad) alerts.push(`${evBad} minh chứng chưa đủ/cần cập nhật`);
      return {
        lecturer, sectionHours, otherHours, totalHours, ratio, band, sections, courses: [...new Set(sections.map(s => s.courseId))].map(id => this.get('courses', id)!),
        outputs, projects: this.d.researchProjects.filter(p => p.principalId === lecId || p.memberIds.includes(lecId)),
        tasks, overdueTasks, qaActivities: this.d.qaActivities.filter(a => a.ownerId === lecId), evidenceOwned,
        kpisOwned: user ? this.d.kpis.filter(k => k.ownerId === user.id) : [], alerts,
      };
    });
  }
  lecturers(yearId = this.currentYear.id) { return this.d.lecturers.map(l => this.lecturerSummary(l.id, yearId)); }
  fullTime() { return this.d.lecturers.filter(l => l.employment === 'full_time'); }

  /* ---------------- Công việc, minh chứng, BĐCL ---------------- */
  taskRows() { return this.m('tasks', () => this.d.tasks.map(t => ({ task: t, status: R.taskStatus(t, this.ref), daysLeft: R.daysBetween(this.ref, t.deadline), owner: this.get('lecturers', t.ownerId) }))); }
  evidenceStatus(e: T.Evidence) { return R.evidenceStatus(e, this.ref, this.settings.evidence); }
  evidenceRows() { return this.m('evrows', () => this.d.evidence.map(e => ({ e, ...this.evidenceStatus(e), owner: this.get('lecturers', e.ownerId) }))); }
  activeFramework() { return this.d.qaFrameworks.find(f => f.active) ?? this.d.qaFrameworks[0]; }
  criteriaOf(frameworkId: string) { const st = this.d.qaStandards.filter(s => s.frameworkId === frameworkId).map(s => s.id); return this.d.qaCriteria.filter(c => st.includes(c.standardId)); }
  /** Độ phủ minh chứng của tiêu chí: số minh chứng HỢP LỆ (trạng thái Đủ) / số yêu cầu */
  criterionCoverage(c: T.QaCriterion) {
    const linked = this.evidenceRows().filter(r => r.e.criterionIds.includes(c.id));
    const valid = linked.filter(r => R.evidenceValid(r.status)).length;
    return { criterion: c, linked: linked.length, valid, required: c.requiredEvidence, coverage: valid >= c.requiredEvidence ? 'full' as const : valid > 0 ? 'partial' as const : 'missing' as const, missing: Math.max(0, c.requiredEvidence - valid) };
  }
  coverageAll(frameworkId = this.activeFramework()?.id) { return frameworkId ? this.criteriaOf(frameworkId).map(c => this.criterionCoverage(c)) : []; }
  qaRows() { return this.m('qarows', () => this.d.qaActivities.map(a => ({ a, status: R.qaActivityStatus(a, this.ref), owner: this.get('lecturers', a.ownerId), criterion: this.get('qaCriteria', a.criterionId), kpi: this.get('kpis', a.kpiId) }))); }
  actionStatus(a: T.ImprovementAction): 'planned' | 'in_progress' | 'done' | 'overdue' { if (a.state === 'done') return 'done'; if (a.dueDate < this.ref) return 'overdue'; return a.state; }
  /** Kết quả cải tiến: so giá trị KPI kỳ đầu tiên sau khi đóng với kỳ ngay trước khi bắt đầu */
  actionResult(a: T.ImprovementAction) {
    const k = a.kpiId ? this.kpi(a.kpiId) : null;
    if (!k) return { label: 'Không gắn KPI', effective: null as boolean | null, before: null as R.KpiPoint | null, after: null as R.KpiPoint | null };
    const pts = k.series.filter(p => p.value !== null);
    const endOf = (p: R.KpiPoint) => (this.get('semesters', p.periodId)?.endDate ?? this.get('academicYears', p.periodId)?.endDate ?? '');
    const before = [...pts].reverse().find(p => endOf(p) <= a.startDate) ?? null;
    if (a.state !== 'done' || !a.closedAt) return { label: 'Đang theo dõi', effective: null, before, after: null };
    const after = pts.find(p => endOf(p) > a.closedAt!) ?? null;
    if (!after || !before) return { label: 'Chờ số liệu kỳ sau', effective: null, before, after };
    const better = k.def.direction === 'lower_better' ? after.value! < before.value! : after.value! > before.value!;
    return { label: better ? 'Có hiệu quả' : 'Chưa hiệu quả', effective: better, before, after };
  }
  /** Chuỗi chất lượng KPI → Minh chứng → Phát hiện → Hành động cải tiến → Kết quả */
  qaChain(kpiId: string) {
    const k = this.kpi(kpiId);
    const evidence = k.evidence;
    const findings = this.d.qaFindings.filter(f => f.kpiId === kpiId);
    const actions = this.d.improvementActions.filter(a => a.kpiId === kpiId).map(a => ({ a, status: this.actionStatus(a), result: this.actionResult(a) }));
    const gaps: string[] = [];
    if (!evidence.some(x => R.evidenceValid(x.status))) gaps.push('G1: chưa có minh chứng hợp lệ');
    if (['not_achieved', 'overdue', 'attention'].includes(k.ev.status) && !actions.some(x => x.status !== 'done')) gaps.push('G2: KPI chưa đạt nhưng không có hành động cải tiến đang mở');
    if (findings.some(f => f.type === 'weakness') && !actions.length) gaps.push('G3: có phát hiện điểm yếu chưa có hành động cải tiến');
    if (actions.some(x => x.status === 'overdue')) gaps.push('G4: hành động cải tiến quá hạn');
    return { kpi: k, evidence, findings, actions, gaps, state: gaps.length ? 'broken' as const : actions.some(x => x.status !== 'done') ? 'open' as const : 'closed' as const };
  }

  /* ---------------- KPI ---------------- */
  metric(name: string, periodId: string): number | null {
    const sem = this.get('semesters', periodId), yearId = sem ? sem.academicYearId : periodId;
    const year = this.get('academicYears', yearId);
    const ft = this.fullTime().filter(l => l.status === 'active' || name === 'staff.phd_rate');
    switch (name) {
      case 'learning.pass_rate': return sem ? this.semesterResults(sem.id).passRate : null;
      case 'learning.clo_rate': return sem ? this.semesterResults(sem.id).cloRate : null;
      case 'learning.avg_score': return sem ? this.semesterResults(sem.id).avgScore : null;
      case 'training.progress_rate': { if (!sem) return null; const ss = this.sectionsOf([sem.id]); const pl = ss.reduce((a, s) => a + s.plannedSessions, 0); return pl ? r1(ss.reduce((a, s) => a + Math.min(s.deliveredSessions, s.plannedSessions), 0) / pl * 100) : null; }
      case 'training.syllabus_rate': return r1(this.d.courses.filter(c => c.syllabusStatus === 'approved').length / this.d.courses.length * 100);
      case 'staff.phd_rate': { const f = this.fullTime(); return f.length ? r1(f.filter(l => l.degree === 'TS').length / f.length * 100) : null; }
      case 'staff.workload_ok_rate': { const rows = ft.map(l => this.lecturerSummary(l.id, yearId)).filter(r => r.band !== 'leave' && r.band !== 'n/a'); return rows.length ? r1(rows.filter(r => r.band === 'ok').length / rows.length * 100) : null; }
      case 'staff.training_hours_avg': return ft.length ? r1(avg(ft.map(l => l.trainingHours))!) : null;
      case 'research.articles': return this.d.researchOutputs.filter(o => o.academicYearId === yearId && o.type === 'journal_article').length;
      case 'research.project_ontime_rate': { const ps = this.d.researchProjects.filter(p => p.startDate <= (year?.endDate ?? this.ref)); return ps.length ? r1(ps.filter(p => p.status !== 'overdue_report').length / ps.length * 100) : null; }
      case 'qa.evidence_coverage': { const cov = this.coverageAll(); return cov.length ? r1(cov.filter(c => c.coverage === 'full').length / cov.length * 100) : null; }
      case 'qa.actions_ontime_rate': { const due = this.d.improvementActions.filter(a => a.dueDate <= this.ref || a.state === 'done'); return due.length ? r1(due.filter(a => a.state === 'done' && a.closedAt! <= a.dueDate).length / due.length * 100) : null; }
      case 'qa.activities_ontime_rate': { const rows = this.qaRows().filter(r => r.status !== 'cancelled' && r.status !== 'planned'); return rows.length ? r1(rows.filter(r => r.status === 'done' || r.status === 'in_progress').length / rows.length * 100) : null; }
      case 'tasks.ontime_rate': { const due = this.d.tasks.filter(t => t.deadline <= this.ref || t.state === 'done'); return due.length ? r1(due.filter(t => R.taskOnTime(t)).length / due.length * 100) : null; }
      default: return null;
    }
  }
  /** Chuỗi giá trị KPI theo kỳ: KPI học kỳ → các HK đã có điểm; KPI năm → năm hiện tại (nguồn tĩnh không có lịch sử) */
  kpiSeries(def: T.KpiDefinition): R.KpiPoint[] {
    if (def.source.type === 'manual') {
      return this.d.kpiEntries.filter(e => e.kpiId === def.id).map(e => ({ e, sem: this.get('semesters', e.periodId) }))
        .sort((a, b) => (a.sem?.order ?? 0) - (b.sem?.order ?? 0)).map(x => ({ periodId: x.e.periodId, label: x.sem?.code ?? x.e.periodId, value: x.e.value }));
    }
    const metric = def.source.metric;
    if (/^learning\.|^training\.progress/.test(metric)) return this.gradedSemesters().map(s => ({ periodId: s.id, label: s.code, value: this.metric(metric, s.id) }));
    if (metric === 'research.articles' || metric === 'staff.workload_ok_rate') return this.d.academicYears.filter(y => y.startDate <= this.ref).map(y => ({ periodId: y.id, label: y.code, value: this.metric(metric, y.id) }));
    return [{ periodId: this.currentYear.id, label: this.currentYear.code, value: this.metric(metric, this.currentYear.id) }];
  }
  kpi(id: string): KpiView {
    return this.m('kpi|' + id, () => {
      const def = this.get('kpis', id)!;
      const series = this.kpiSeries(def);
      const ev = R.evaluateKpi({ direction: def.direction, target: def.target, deadline: def.deadline, series }, this.settings.kpi, this.ref);
      const last = [...series].reverse().find(p => p.value !== null);
      return { def, series, ev, periodLabel: last?.label ?? '—', owner: this.get('users', def.ownerId), evidence: def.evidenceIds.map(eid => this.get('evidence', eid)).filter((e): e is T.Evidence => !!e).map(e => ({ e, status: this.evidenceStatus(e).status })) };
    });
  }
  kpis() { return this.d.kpis.map(k => this.kpi(k.id)); }
  kpiCounts() {
    const ks = this.kpis(); const c = (s: R.KpiStatus) => ks.filter(k => k.ev.status === s).length;
    return { total: ks.length, achieved: c('achieved'), attention: c('attention'), notAchieved: c('not_achieved'), overdue: c('overdue'), noData: c('no_data'), atRisk: ks.filter(k => k.ev.atRisk).length, completionRate: ks.length ? r1(c('achieved') / ks.length * 100) : null };
  }

  /* ---------------- Người học ---------------- */
  /** Kết quả từng người học (tổng hợp các lượt đăng ký đã có điểm) */
  studentRows() {
    return this.m('students', () => {
      const bySt = new Map<string, T.Enrollment[]>();
      this.d.enrollments.forEach(e => { const l = bySt.get(e.studentId); if (l) l.push(e); else bySt.set(e.studentId, [e]); });
      return this.d.students.map(s => {
        const enr = bySt.get(s.id) ?? [];
        const scores = enr.map(e => { const sec = this.get('sections', e.sectionId)!; const c = this.get('courses', sec.courseId)!; return { score: this.finalScore(e, c), pass: c.passScore }; });
        const ex = scores.filter(x => x.score !== null) as { score: number; pass: number }[];
        const passed = ex.filter(x => x.score >= x.pass).length;
        return { s, program: this.get('programs', s.programId), enrollments: enr.length, passed, failed: enr.length - passed, avgScore: ex.length ? r2(avg(ex.map(x => x.score))!) : null };
      });
    });
  }
  /** Kết quả theo lớp hành chính trong một học kỳ */
  classResults(semId: string) {
    return this.m('classres|' + semId, () => {
      const secIds = new Set(this.sectionsOf([semId]).map(s => s.id));
      const stClass = new Map(this.d.students.map(s => [s.id, s.className]));
      const g = new Map<string, { registered: number; passed: number; sum: number; n: number }>();
      this.d.enrollments.filter(e => secIds.has(e.sectionId)).forEach(e => {
        const sec = this.get('sections', e.sectionId)!, c = this.get('courses', sec.courseId)!, sc = this.finalScore(e, c);
        const k = stClass.get(e.studentId) ?? '—'; const x = g.get(k) ?? { registered: 0, passed: 0, sum: 0, n: 0 };
        x.registered++; if (sc !== null) { x.n++; x.sum += sc; if (sc >= c.passScore) x.passed++; } g.set(k, x);
      });
      return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([className, x]) => ({ className, registered: x.registered, passed: x.passed, passRate: x.registered ? r1(x.passed / x.registered * 100) : null, avgScore: x.n ? r2(x.sum / x.n) : null }));
    });
  }

  /* ---------------- NCKH ---------------- */
  researchByYear() {
    return this.d.academicYears.map(y => {
      const os = this.d.researchOutputs.filter(o => o.academicYearId === y.id);
      return { year: y, journal: os.filter(o => o.type === 'journal_article').length, conference: os.filter(o => o.type === 'conference_paper').length, book: os.filter(o => o.type === 'book').length, product: os.filter(o => o.type === 'product').length, total: os.length };
    });
  }
  projectRows() { return this.d.researchProjects.map(p => { const span = R.daysBetween(p.startDate, p.endDate), elapsed = Math.max(0, Math.min(span, R.daysBetween(p.startDate, this.ref))); const timePct = span > 0 ? r1(elapsed / span * 100) : 100; return { p, timePct, gap: r1(p.progressPct - timePct), principal: this.get('lecturers', p.principalId) }; }); }

  /* ---------------- Tổng quan ---------------- */
  overview() {
    return this.m('overview', () => {
      const sem = this.currentSemester, sr = this.semesterResults(sem.id);
      const tasks = this.taskRows(), cov = this.coverageAll();
      return {
        lecturers: this.d.lecturers.length, fullTime: this.fullTime().length, phd: this.fullTime().filter(l => l.degree === 'TS').length, titled: this.d.lecturers.filter(l => l.title).length,
        courses: this.d.courses.length, sectionsInSemester: this.sectionsOf([sem.id]).length, sectionsTotal: this.d.sections.length,
        students: this.d.students.length, studentsActive: this.d.students.filter(s => s.status === 'studying').length,
        semester: sem, results: sr, kpi: this.kpiCounts(),
        overdueTasks: tasks.filter(t => t.status === 'overdue').length, openTasks: tasks.filter(t => t.status !== 'done').length,
        missingEvidence: cov.reduce((a, c) => a + c.missing, 0), evidenceNotComplete: this.evidenceRows().filter(r => r.status !== 'complete').length,
        improvementOpen: this.d.improvementActions.filter(a => a.state !== 'done').length, improvementTotal: this.d.improvementActions.length,
        researchThisYear: this.d.researchOutputs.filter(o => o.academicYearId === this.currentYear.id).length,
      };
    });
  }
  /** Cảnh báo theo quy tắc (không do AI): KPI, học phần, tải giảng, công việc, minh chứng, BĐCL */
  alerts() {
    return this.m('alerts', () => {
      type A = { id: string; level: 'critical' | 'high' | 'medium'; area: string; title: string; detail: string; owner: string; due?: string; link: string; ref: string };
      const out: A[] = [];
      this.kpis().forEach(k => {
        if (k.ev.status === 'overdue') out.push({ id: 'k-' + k.def.id, level: 'critical', area: 'KPI', title: `${k.def.code} quá hạn chưa đạt`, detail: k.ev.reason, owner: k.owner?.fullName ?? '—', due: k.def.deadline, link: `kpi/${k.def.id}`, ref: k.def.code });
        else if (k.ev.status === 'not_achieved') out.push({ id: 'k-' + k.def.id, level: 'high', area: 'KPI', title: `${k.def.code} không đạt`, detail: k.ev.reason, owner: k.owner?.fullName ?? '—', due: k.def.deadline, link: `kpi/${k.def.id}`, ref: k.def.code });
        else if (k.ev.atRisk) out.push({ id: 'k-' + k.def.id, level: 'medium', area: 'KPI', title: `${k.def.code} có nguy cơ không đạt`, detail: k.ev.riskReasons.join('; '), owner: k.owner?.fullName ?? '—', due: k.def.deadline, link: `kpi/${k.def.id}`, ref: k.def.code });
      });
      this.courses().filter(c => c.attention.length).forEach(c => out.push({ id: 'c-' + c.course.id, level: c.attention.some(x => x.startsWith('C1')) ? 'high' : 'medium', area: 'Học phần', title: `${c.course.code} cần chú ý`, detail: c.attention.join('; '), owner: this.lecturerName(c.course.coordinatorId), link: `courses/${c.course.id}`, ref: `COURSE:${c.course.code}` }));
      this.lecturers().filter(l => l.band === 'over').forEach(l => out.push({ id: 'w-' + l.lecturer.id, level: 'medium', area: 'Đội ngũ', title: `${l.lecturer.fullName} quá tải giờ giảng`, detail: `${l.totalHours}/${l.lecturer.normHours} giờ (${r1(l.ratio! * 100)}%)`, owner: this.lecturerName('lec-02'), link: `staff/${l.lecturer.id}`, ref: `GV:${l.lecturer.code}` }));
      const od = this.taskRows().filter(t => t.status === 'overdue');
      if (od.length) out.push({ id: 'tasks', level: od.some(t => t.task.priority === 'high') ? 'high' : 'medium', area: 'Công việc', title: `${od.length} công việc quá hạn`, detail: od.slice(0, 3).map(t => t.task.title).join('; '), owner: '—', link: 'tasks', ref: 'TASKS' });
      const miss = this.coverageAll().filter(c => c.coverage !== 'full');
      if (miss.length) out.push({ id: 'ev', level: 'medium', area: 'Minh chứng', title: `${miss.length} tiêu chí thiếu minh chứng hợp lệ`, detail: miss.slice(0, 4).map(c => c.criterion.code).join(', '), owner: this.lecturerName('lec-03'), link: 'evidence', ref: 'EVIDENCE' });
      this.qaRows().filter(r => r.status === 'overdue').forEach(r => out.push({ id: 'qa-' + r.a.id, level: 'high', area: 'BĐCL', title: `${r.a.code} quá hạn (${r.a.progressPct}%)`, detail: r.a.title, owner: r.owner?.fullName ?? '—', due: r.a.dueDate, link: 'qa', ref: `QAACT:${r.a.code}` }));
      const order = { critical: 0, high: 1, medium: 2 };
      return out.sort((a, b) => order[a.level] - order[b.level]);
    });
  }
}
