/* =========================================================================
 * dataService — điểm truy cập dữ liệu DUY NHẤT của giao diện.
 *   Component → dataService (đọc qua Analytics, ghi qua các hàm có validation + audit) → Repository
 * Mỗi lần dữ liệu đổi: dựng lại Analytics, tăng `version` (dùng làm khóa cache cho AI) và báo cho UI.
 * ========================================================================= */
import { Analytics } from '../domain/analytics';
import { createRepository, RepositoryError, type Repository, type StoredReport } from '../data/repository';
import type { AppSettings, AuditAction, AuditEntry, DataSnapshot, Evidence, ImprovementAction, KpiEntry, QaCriterion, QaFramework, QaStandard, Task, User } from '../types/domain';

export class ValidationError extends Error { constructor(public field: string, message: string) { super(message); } }
type State = { status: 'loading' | 'ready' | 'error'; error?: string; analytics?: Analytics; version: number; dataKey: string };

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();

class DataService {
  private repo: Repository = createRepository();
  private snapshot: DataSnapshot | null = null;
  private state: State = { status: 'loading', version: 0, dataKey: '' };
  private listeners = new Set<() => void>();
  private user: User | null = null;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;
  get repository() { return this.repo; }
  get analytics(): Analytics { if (!this.state.analytics) throw new Error('Dữ liệu chưa sẵn sàng'); return this.state.analytics; }
  setUser(u: User | null) { this.user = u; }

  private emit() { this.listeners.forEach(f => f()); }
  private rebuild() { this.state = { status: 'ready', analytics: new Analytics(this.snapshot!), version: this.state.version + 1, dataKey: fingerprint(this.snapshot!) }; this.emit(); }

  async load() {
    this.state = { ...this.state, status: 'loading' }; this.emit();
    try {
      const snap = await this.repo.loadSnapshot();
      validateSnapshot(snap);
      this.snapshot = snap; this.rebuild();
    } catch (e) {
      this.state = { status: 'error', error: (e as Error).message, version: this.state.version, dataKey: '' }; this.emit();
    }
  }

  async audit(action: AuditAction, entity: string, entityId: string | null, before?: unknown, after?: unknown, note?: string) {
    const e: AuditEntry = { id: uid('audit'), at: nowIso(), userId: this.user?.id ?? null, role: this.user?.role ?? null, action, entity, entityId, before, after, note };
    try { await this.repo.appendAudit(e); } catch { /* audit không được làm hỏng thao tác chính */ }
  }
  listAudit() { return this.repo.listAudit(); }

  private replace<K extends 'kpiEntries' | 'tasks' | 'evidence' | 'improvementActions' | 'qaFrameworks' | 'qaStandards' | 'qaCriteria'>(table: K, row: DataSnapshot[K][number]) {
    const rows = this.snapshot![table] as { id: string }[]; const i = rows.findIndex(r => r.id === (row as { id: string }).id);
    if (i >= 0) rows[i] = row as { id: string }; else rows.push(row as { id: string });
  }
  private async persist<K extends 'kpiEntries' | 'tasks' | 'evidence' | 'improvementActions' | 'qaFrameworks' | 'qaStandards' | 'qaCriteria'>(table: K, row: DataSnapshot[K][number]) {
    await this.repo.upsert(table, row as never); this.replace(table, row); this.rebuild();
  }

  /* ---------- KPI ---------- */
  async saveKpiEntry(kpiId: string, periodId: string, value: number, note: string) {
    const k = this.snapshot!.kpis.find(x => x.id === kpiId);
    if (!k) throw new ValidationError('kpi', 'KPI không tồn tại');
    if (k.source.type !== 'manual') throw new ValidationError('kpi', 'KPI này tự tính từ dữ liệu nguồn, không nhập tay');
    if (!Number.isFinite(value)) throw new ValidationError('value', 'Giá trị phải là số');
    if (value < 0) throw new ValidationError('value', 'Giá trị không được âm');
    if (k.unit === '%' && value > 100) throw new ValidationError('value', 'Giá trị phần trăm không vượt quá 100');
    if (!this.snapshot!.semesters.some(s => s.id === periodId) && !this.snapshot!.academicYears.some(y => y.id === periodId)) throw new ValidationError('period', 'Kỳ không hợp lệ');
    const old = this.snapshot!.kpiEntries.find(e => e.kpiId === kpiId && e.periodId === periodId);
    const row: KpiEntry = { id: old?.id ?? uid('ke'), kpiId, periodId, value: Math.round(value * 100) / 100, note: note.slice(0, 300), enteredBy: this.user?.id ?? 'unknown', enteredAt: nowIso() };
    await this.persist('kpiEntries', row);
    await this.audit('kpi.entry', 'kpi_entries', row.id, old ? { value: old.value } : null, { kpi: k.code, period: periodId, value: row.value });
  }

  /* ---------- Công việc ---------- */
  async updateTask(id: string, patch: Partial<Pick<Task, 'state' | 'deadline' | 'priority'>>) {
    const t = this.snapshot!.tasks.find(x => x.id === id); if (!t) throw new ValidationError('task', 'Công việc không tồn tại');
    if (patch.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(patch.deadline)) throw new ValidationError('deadline', 'Hạn không hợp lệ');
    const row: Task = { ...t, ...patch };
    if (patch.state === 'done' && t.state !== 'done') row.completedAt = this.snapshot!.settings.referenceDate;
    if (patch.state && patch.state !== 'done') row.completedAt = null;
    await this.persist('tasks', row);
    await this.audit('task.update', 'tasks', id, { state: t.state, deadline: t.deadline, priority: t.priority }, patch);
  }

  /* ---------- Minh chứng ---------- */
  async updateEvidence(id: string, patch: Partial<Pick<Evidence, 'fileName' | 'validUntil' | 'verified' | 'description'>>) {
    const e = this.snapshot!.evidence.find(x => x.id === id); if (!e) throw new ValidationError('evidence', 'Minh chứng không tồn tại');
    if (patch.fileName !== undefined && patch.fileName !== null && !/^[\w\-. ()À-ỹ]{1,120}\.(pdf|docx?|xlsx?|png|jpe?g)$/i.test(patch.fileName)) throw new ValidationError('fileName', 'Tên file không hợp lệ (pdf, doc, docx, xls, xlsx, png, jpg)');
    if (patch.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(patch.validUntil)) throw new ValidationError('validUntil', 'Ngày hiệu lực không hợp lệ');
    if (patch.verified && this.user && e.ownerId === this.user.lecturerId) throw new ValidationError('verified', 'Người phụ trách minh chứng không tự xác nhận minh chứng của mình');
    const row: Evidence = { ...e, ...patch, updatedAt: this.snapshot!.settings.referenceDate };
    if (patch.fileName !== undefined && patch.fileName !== e.fileName) { row.verified = false; row.verifiedBy = null; }
    if (patch.verified) row.verifiedBy = this.user?.id ?? null;
    await this.persist('evidence', row);
    await this.audit('evidence.update', 'evidence', id, { fileName: e.fileName, validUntil: e.validUntil, verified: e.verified }, patch);
  }

  /* ---------- Hành động cải tiến (chỉ tạo khi người dùng DUYỆT đề xuất AI) ---------- */
  async createImprovementAction(input: { title: string; kpiCode?: string; ownerId: string; dueDate: string; expected?: number | null; aiRecommendationId?: string | null }) {
    const title = input.title.trim();
    if (title.length < 5) throw new ValidationError('title', 'Tên hành động quá ngắn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new ValidationError('dueDate', 'Hạn không hợp lệ');
    if (input.dueDate < this.snapshot!.settings.referenceDate) throw new ValidationError('dueDate', 'Hạn phải sau ngày hiện tại');
    if (!this.snapshot!.lecturers.some(l => l.id === input.ownerId)) throw new ValidationError('ownerId', 'Người phụ trách không hợp lệ');
    const kpi = input.kpiCode ? this.snapshot!.kpis.find(k => k.code === input.kpiCode) : undefined;
    const n = this.snapshot!.improvementActions.length + 1;
    const row: ImprovementAction = { id: uid('ia'), code: `CI-AI-${String(n).padStart(2, '0')}`, title, findingId: null, kpiId: kpi?.id ?? null, ownerId: input.ownerId, startDate: this.snapshot!.settings.referenceDate, dueDate: input.dueDate, state: 'planned', closedAt: null, baseline: null, expected: input.expected ?? null, origin: input.aiRecommendationId ? 'ai_approved' : 'manual', aiRecommendationId: input.aiRecommendationId ?? null };
    await this.persist('improvementActions', row);
    await this.audit(input.aiRecommendationId ? 'ai.recommendation.approve' : 'improvement.create', 'improvement_actions', row.id, null, { code: row.code, title, kpi: kpi?.code ?? null, due: row.dueDate });
    return row;
  }

  /* ---------- Cấu hình, bộ tiêu chuẩn BĐCL ---------- */
  async updateSettings(next: AppSettings) {
    const k = next.kpi, w = next.workload;
    if (!(k.attentionPct > 0 && k.attentionPct < k.achievedPct)) throw new ValidationError('kpi', 'Ngưỡng "Cần chú ý" phải nhỏ hơn ngưỡng "Đạt" và lớn hơn 0');
    if (!(w.underloadRatio > 0 && w.underloadRatio < w.overloadRatio)) throw new ValidationError('workload', 'Ngưỡng thiếu giờ phải nhỏ hơn ngưỡng quá tải');
    if (next.course.failRateAlertPct <= 0 || next.course.failRateAlertPct >= 100) throw new ValidationError('course', 'Ngưỡng tỷ lệ chưa đạt phải trong (0, 100)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next.referenceDate)) throw new ValidationError('referenceDate', 'Ngày tham chiếu không hợp lệ');
    const before = this.snapshot!.settings;
    await this.repo.updateSettings(next); this.snapshot!.settings = next; this.rebuild();
    await this.audit('settings.update', 'settings', null, before, next);
  }
  async upsertFramework(f: QaFramework) { if (!f.code.trim() || !f.name.trim()) throw new ValidationError('framework', 'Cần mã và tên bộ tiêu chuẩn'); await this.persist('qaFrameworks', f); await this.audit('qa.framework.update', 'qa_frameworks', f.id, null, f); }
  async upsertStandard(s: QaStandard) { if (!s.code.trim() || !s.name.trim()) throw new ValidationError('standard', 'Cần mã và tên tiêu chuẩn'); await this.persist('qaStandards', s); await this.audit('qa.framework.update', 'qa_standards', s.id, null, s); }
  async upsertCriterion(c: QaCriterion) { if (!c.code.trim() || !c.content.trim()) throw new ValidationError('criterion', 'Cần mã và nội dung tiêu chí'); if (!(c.requiredEvidence >= 1 && c.requiredEvidence <= 20)) throw new ValidationError('requiredEvidence', 'Số minh chứng yêu cầu 1–20'); await this.persist('qaCriteria', c); await this.audit('qa.framework.update', 'qa_criteria', c.id, null, c); }
  async setActiveFramework(id: string) { for (const f of this.snapshot!.qaFrameworks) { const row = { ...f, active: f.id === id }; await this.repo.upsert('qaFrameworks', row); this.replace('qaFrameworks', row); } this.rebuild(); await this.audit('qa.framework.update', 'qa_frameworks', id, null, { active: true }); }
  newId(p: string) { return uid(p); }

  /* ---------- Báo cáo ---------- */
  saveReport(r: StoredReport) { return this.repo.saveReport(r); }
  listReports() { return this.repo.listReports(); }

  /** Demo: dữ liệu đã bị thay đổi so với bản gốc? (API thật: luôn false) */
  hasLocalChanges() { const r = this.repo as Repository & { hasChanges?: () => boolean }; return r.kind === 'mock' && !!r.hasChanges?.(); }
  async resetDemo() { await this.repo.reset(); await this.load(); await this.audit('data.reset', 'all', null); }
}

/** Dấu vân tay dữ liệu có thể thay đổi (khóa cache AI ổn định qua các lần tải lại trang) */
function fingerprint(s: DataSnapshot): string {
  const str = JSON.stringify([s.kpiEntries, s.tasks, s.evidence, s.improvementActions, s.qaFrameworks, s.qaStandards, s.qaCriteria, s.settings]);
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

/** Kiểm tra tối thiểu khi nạp (không để dữ liệu hỏng làm trắng trang) */
function validateSnapshot(s: DataSnapshot) {
  const need: (keyof DataSnapshot)[] = ['units', 'academicYears', 'semesters', 'users', 'lecturers', 'courses', 'sections', 'kpis', 'settings'];
  const miss = need.filter(k => !s || !s[k] || (Array.isArray(s[k]) && !(s[k] as unknown[]).length));
  if (miss.length) throw new RepositoryError('invalid', `Dữ liệu thiếu bảng: ${miss.join(', ')}`);
  if (!s.units.some(u => u.type === 'department')) throw new RepositoryError('invalid', 'Không có đơn vị cấp Bộ môn');
  if (!s.academicYears.some(y => y.id === s.settings.currentAcademicYearId)) throw new RepositoryError('invalid', 'Năm học hiện tại không hợp lệ');
}

export const dataService = new DataService();
