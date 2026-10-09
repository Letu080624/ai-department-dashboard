/* =========================================================================
 * Bộ quy tắc nghiệp vụ (thuần, không phụ thuộc giao diện/AI) — dùng chung client + server + test.
 * Mọi trạng thái (KPI, công việc, minh chứng, hoạt động BĐCL, cảnh báo học phần, tải giảng)
 * được quyết định Ở ĐÂY bằng quy tắc có mã, không do AI quyết định.
 * Ngưỡng đọc từ AppSettings (cấu hình được), không viết cứng.
 * ========================================================================= */
import type { AppSettings, Evidence, KpiDirection, QaActivity, Task } from '../types/domain';

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const round1 = (x: number) => Math.round(x * 10) / 10;

/* ------------------------------ KPI ------------------------------ */
export type KpiStatus = 'achieved' | 'attention' | 'not_achieved' | 'overdue' | 'no_data';
export const KPI_STATUS_LABEL: Record<KpiStatus, string> = { achieved: 'Đạt', attention: 'Cần chú ý', not_achieved: 'Không đạt', overdue: 'Quá hạn', no_data: 'Thiếu dữ liệu' };
export interface KpiPoint { periodId: string; label: string; value: number | null }
export interface KpiEvaluation {
  value: number | null; target: number; cr: number | null;
  status: KpiStatus; rule: string; reason: string;
  trend: 'up' | 'down' | 'flat' | 'n/a'; declineStreak: number; change: number | null;
  atRisk: boolean; riskReasons: string[]; daysLeft: number;
}

/** Completion Rate = Actual / Target × 100 (KPI "càng thấp càng tốt": Target / Actual × 100), có trần */
export function completionRate(direction: KpiDirection, actual: number | null, target: number, capPct: number): number | null {
  if (actual === null || actual === undefined || !Number.isFinite(actual) || !target) return null;
  if (direction === 'lower_better') return actual <= 0 ? capPct : Math.min(capPct, target / actual * 100);
  return Math.min(capPct, actual / target * 100);
}

/** Xu hướng: số kỳ liên tiếp đi xuống (theo chiều tốt của KPI) tính từ kỳ gần nhất */
export function trendOf(series: KpiPoint[], direction: KpiDirection) {
  const v = series.map(p => p.value).filter((x): x is number => x !== null);
  if (v.length < 2) return { trend: 'n/a' as const, streak: 0, change: null as number | null };
  const sign = direction === 'lower_better' ? -1 : 1;
  const last = v[v.length - 1], prev = v[v.length - 2], change = round1(last - prev);
  let streak = 0;
  for (let i = v.length - 1; i > 0; i--) { if ((v[i] - v[i - 1]) * sign < -1e-9) streak++; else break; }
  const d = (last - prev) * sign;
  return { trend: Math.abs(last - prev) < 1e-9 ? 'flat' as const : d > 0 ? 'up' as const : 'down' as const, streak, change };
}

/**
 * Quy tắc trạng thái (thứ tự ưu tiên, quy tắc đầu tiên khớp được áp dụng):
 *  K0 Thiếu dữ liệu: chưa có giá trị thực tế.
 *  K1 Đạt:          CR ≥ achievedPct (mặc định 100%).
 *  K2 Quá hạn:      chưa đạt và đã qua deadline.
 *  K3 Cần chú ý:    attentionPct ≤ CR < achievedPct (mặc định 80–99%).
 *  K4 Không đạt:    CR < attentionPct.
 * Cờ "có nguy cơ" (không đổi trạng thái):
 *  R1 chưa đạt và còn ≤ atRiskDays ngày đến hạn;  R2 giảm liên tiếp ≥ decliningPeriods kỳ.
 */
export function evaluateKpi(input: { direction: KpiDirection; target: number; deadline: string; series: KpiPoint[] }, cfg: AppSettings['kpi'], refDate: string): KpiEvaluation {
  const pts = input.series.filter(p => p.value !== null);
  const value = pts.length ? pts[pts.length - 1].value : null;
  const cr = completionRate(input.direction, value, input.target, cfg.crCapPct);
  const daysLeft = daysBetween(refDate, input.deadline);
  const tr = trendOf(input.series, input.direction);
  let status: KpiStatus, rule: string, reason: string;
  if (cr === null) { status = 'no_data'; rule = 'K0'; reason = 'Chưa có giá trị thực tế trong kỳ.'; }
  else if (cr >= cfg.achievedPct) { status = 'achieved'; rule = 'K1'; reason = `CR ${round1(cr)}% ≥ ${cfg.achievedPct}%.`; }
  else if (daysLeft < 0) { status = 'overdue'; rule = 'K2'; reason = `Đã quá hạn ${-daysLeft} ngày, CR ${round1(cr)}% < ${cfg.achievedPct}%.`; }
  else if (cr >= cfg.attentionPct) { status = 'attention'; rule = 'K3'; reason = `${cfg.attentionPct}% ≤ CR ${round1(cr)}% < ${cfg.achievedPct}%.`; }
  else { status = 'not_achieved'; rule = 'K4'; reason = `CR ${round1(cr)}% < ${cfg.attentionPct}%.`; }
  const riskReasons: string[] = [];
  if ((status === 'attention' || status === 'not_achieved') && daysLeft <= cfg.atRiskDays) riskReasons.push(`R1: còn ${daysLeft} ngày đến hạn, chưa đạt mục tiêu`);
  if (status !== 'no_data' && status !== 'overdue' && tr.streak >= cfg.decliningPeriods) riskReasons.push(`R2: giảm ${tr.streak} kỳ liên tiếp`);
  return { value, target: input.target, cr: cr === null ? null : round1(cr), status, rule, reason, trend: tr.trend, declineStreak: tr.streak, change: tr.change, atRisk: riskReasons.length > 0, riskReasons, daysLeft };
}

/* ------------------------------ Công việc ------------------------------ */
export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'overdue';
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { not_started: 'Chưa bắt đầu', in_progress: 'Đang thực hiện', done: 'Hoàn thành', overdue: 'Quá hạn' };
/** T1 Hoàn thành → T2 Quá hạn (chưa xong, qua hạn) → T3 Đang thực hiện → T4 Chưa bắt đầu */
export function taskStatus(t: Pick<Task, 'state' | 'deadline'>, refDate: string): TaskStatus {
  if (t.state === 'done') return 'done';
  if (t.deadline < refDate) return 'overdue';
  return t.state === 'in_progress' ? 'in_progress' : 'not_started';
}
export const taskOnTime = (t: Pick<Task, 'state' | 'deadline' | 'completedAt'>) => t.state === 'done' && !!t.completedAt && t.completedAt <= t.deadline;

/* ------------------------------ Minh chứng ------------------------------ */
export type EvidenceStatus = 'complete' | 'missing' | 'needs_update' | 'unverified';
export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = { complete: 'Đủ', missing: 'Thiếu', needs_update: 'Cần cập nhật', unverified: 'Chưa xác nhận' };
/** E1 Thiếu (chưa có file) → E2 Cần cập nhật (hết hiệu lực hoặc còn ≤ expiringDays ngày) → E3 Chưa xác nhận → E4 Đủ */
export function evidenceStatus(e: Pick<Evidence, 'fileName' | 'validUntil' | 'verified'>, refDate: string, cfg: AppSettings['evidence']): { status: EvidenceStatus; reason: string } {
  if (!e.fileName) return { status: 'missing', reason: 'E1: chưa có file minh chứng' };
  if (e.validUntil) {
    const left = daysBetween(refDate, e.validUntil);
    if (left < 0) return { status: 'needs_update', reason: `E2: hết hiệu lực ${-left} ngày` };
    if (left <= cfg.expiringDays) return { status: 'needs_update', reason: `E2: còn ${left} ngày hết hiệu lực` };
  }
  if (!e.verified) return { status: 'unverified', reason: 'E3: chưa được BĐCL xác nhận' };
  return { status: 'complete', reason: 'E4: có file, còn hiệu lực, đã xác nhận' };
}
export const evidenceValid = (s: EvidenceStatus) => s === 'complete';

/* ------------------------------ Hoạt động BĐCL ------------------------------ */
export type QaActivityStatus = 'planned' | 'in_progress' | 'done' | 'overdue' | 'cancelled';
export const QA_STATUS_LABEL: Record<QaActivityStatus, string> = { planned: 'Kế hoạch', in_progress: 'Đang thực hiện', done: 'Hoàn thành', overdue: 'Quá hạn', cancelled: 'Huỷ' };
/** A1 Huỷ → A2 Hoàn thành (100%) → A3 Quá hạn (qua hạn, chưa xong) → A4 Đang thực hiện (đã bắt đầu) → A5 Kế hoạch */
export function qaActivityStatus(a: Pick<QaActivity, 'cancelled' | 'progressPct' | 'dueDate' | 'startDate'>, refDate: string): QaActivityStatus {
  if (a.cancelled) return 'cancelled';
  if (a.progressPct >= 100) return 'done';
  if (a.dueDate < refDate) return 'overdue';
  if (a.startDate <= refDate) return 'in_progress';
  return 'planned';
}

/* ------------------------------ Tải giảng ------------------------------ */
export type WorkloadBand = 'ok' | 'over' | 'under' | 'leave' | 'n/a';
export const WORKLOAD_LABEL: Record<WorkloadBand, string> = { ok: 'Trong ngưỡng', over: 'Quá tải', under: 'Thiếu giờ', leave: 'Nghỉ dài hạn', 'n/a': 'Không tính định mức' };
export function workloadBand(ratio: number | null, status: 'active' | 'leave', cfg: AppSettings['workload']): WorkloadBand {
  if (status === 'leave') return 'leave';
  if (ratio === null) return 'n/a';
  if (ratio > cfg.overloadRatio) return 'over';
  if (ratio < cfg.underloadRatio) return 'under';
  return 'ok';
}

/* ------------------------------ Học phần cần chú ý ------------------------------ */
/** C1 tỷ lệ chưa đạt > ngưỡng · C2 có CLO dưới mục tiêu · C3 tỷ lệ đạt giảm ≥ passDropAlertPts điểm % so với lần mở trước */
export function courseAttention(o: { failRate: number | null; passRate: number | null; prevPassRate: number | null; cloBelow: string[] }, cfg: AppSettings['course']): string[] {
  const r: string[] = [];
  if (o.failRate !== null && o.failRate > cfg.failRateAlertPct) r.push(`C1: tỷ lệ chưa đạt ${round1(o.failRate)}% > ${cfg.failRateAlertPct}%`);
  if (o.cloBelow.length) r.push(`C2: ${o.cloBelow.length} CLO dưới mục tiêu (${o.cloBelow.join(', ')})`);
  if (o.passRate !== null && o.prevPassRate !== null && o.prevPassRate - o.passRate >= cfg.passDropAlertPts) r.push(`C3: tỷ lệ đạt giảm ${round1(o.prevPassRate - o.passRate)} điểm % so với lần mở trước`);
  return r;
}
