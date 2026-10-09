/* Ánh xạ trạng thái (do quy tắc tính) → badge. Một nơi duy nhất để thống nhất màu/nhãn. */
import { EVIDENCE_STATUS_LABEL, KPI_STATUS_LABEL, QA_STATUS_LABEL, TASK_STATUS_LABEL, WORKLOAD_LABEL, type EvidenceStatus, type KpiStatus, type QaActivityStatus, type TaskStatus, type WorkloadBand } from '../domain/rules';
import { Badge, type Tone } from './ui';

const KPI_TONE: Record<KpiStatus, Tone> = { achieved: 'ok', attention: 'warn', not_achieved: 'bad', overdue: 'risk', no_data: 'neutral' };
const TASK_TONE: Record<TaskStatus, Tone> = { done: 'ok', in_progress: 'info', not_started: 'neutral', overdue: 'bad' };
const EV_TONE: Record<EvidenceStatus, Tone> = { complete: 'ok', missing: 'bad', needs_update: 'warn', unverified: 'info' };
const QA_TONE: Record<QaActivityStatus, Tone> = { done: 'ok', in_progress: 'info', planned: 'neutral', overdue: 'bad', cancelled: 'neutral' };
const WL_TONE: Record<WorkloadBand, Tone> = { ok: 'ok', over: 'bad', under: 'warn', leave: 'neutral', 'n/a': 'neutral' };
export const ACTION_LABEL = { planned: 'Kế hoạch', in_progress: 'Đang thực hiện', done: 'Hoàn thành', overdue: 'Quá hạn' } as const;
const ACTION_TONE: Record<keyof typeof ACTION_LABEL, Tone> = { planned: 'neutral', in_progress: 'info', done: 'ok', overdue: 'bad' };

export const KpiBadge = ({ s, rule }: { s: KpiStatus; rule?: string }) => <Badge tone={KPI_TONE[s]} title={rule ? `Quy tắc ${rule}` : undefined}>{KPI_STATUS_LABEL[s]}</Badge>;
export const TaskBadge = ({ s }: { s: TaskStatus }) => <Badge tone={TASK_TONE[s]}>{TASK_STATUS_LABEL[s]}</Badge>;
export const EvidenceBadge = ({ s, reason }: { s: EvidenceStatus; reason?: string }) => <Badge tone={EV_TONE[s]} title={reason}>{EVIDENCE_STATUS_LABEL[s]}</Badge>;
export const QaBadge = ({ s }: { s: QaActivityStatus }) => <Badge tone={QA_TONE[s]}>{QA_STATUS_LABEL[s]}</Badge>;
export const WorkloadBadge = ({ b }: { b: WorkloadBand }) => <Badge tone={WL_TONE[b]}>{WORKLOAD_LABEL[b]}</Badge>;
export const ActionBadge = ({ s }: { s: keyof typeof ACTION_LABEL }) => <Badge tone={ACTION_TONE[s]}>{ACTION_LABEL[s]}</Badge>;
export const PriorityBadge = ({ p }: { p: 'high' | 'medium' | 'low' }) => <Badge icon={false} tone={p === 'high' ? 'bad' : p === 'medium' ? 'warn' : 'neutral'}>{p === 'high' ? 'Cao' : p === 'medium' ? 'Trung bình' : 'Thấp'}</Badge>;
export const LevelBadge = ({ l }: { l: 'critical' | 'high' | 'medium' }) => <Badge tone={l === 'critical' ? 'bad' : l === 'high' ? 'risk' : 'warn'}>{l === 'critical' ? 'Nghiêm trọng' : l === 'high' ? 'Cao' : 'Trung bình'}</Badge>;
export const kpiTone = (s: KpiStatus) => KPI_TONE[s];
