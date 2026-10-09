/* =========================================================================
 * Hiển thị kết quả AI có cấu trúc: summary · facts · findings · risks · recommendations ·
 * priority_actions · data_gaps — gắn nhãn FACT / INFERENCE / RECOMMENDATION, nguồn (ref), độ tin cậy,
 * kết quả kiểm tra số liệu, nhà cung cấp (Gemini / Mock / Quy tắc).
 * ========================================================================= */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Cpu, Database, Info, ShieldCheck, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AiFinding, AiRecommendation, AiResponse, AiRisk } from '../../ai/schema';
import type { AiRunResult } from '../../services/aiService';
import { cx, dateTime, num } from '../../lib/format';
import { Alert, Badge, ClaimTag } from '../ui';
import { PriorityBadge } from '../status';
import { ProposedAction } from './ApproveAction';

const CONF = { high: 'cao', medium: 'trung bình', low: 'thấp' } as const;

export function ProviderBadge({ r }: { r: AiRunResult }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {r.provider === 'gemini' ? <Badge tone="info" icon={false}><Cpu className="size-3" />Gemini · {r.model}</Badge> : r.provider === 'mock' ? <Badge tone="neutral" icon={false}>Mock AI (thử nghiệm)</Badge> : <Badge tone="neutral" icon={false}>Quy tắc — không dùng AI</Badge>}
      {r.trust === 'verified' ? <Badge tone="ok" icon={false}><ShieldCheck className="size-3" />Đã đối chiếu số liệu</Badge> : r.trust === 'warning' ? <Badge tone="warn" icon={false}><ShieldAlert className="size-3" />Cần rà soát</Badge> : <Badge tone="bad">Không kiểm chứng được</Badge>}
      {r.cached && <Badge tone="neutral" icon={false}>Từ cache</Badge>}
    </span>
  );
}
const Refs = ({ refs }: { refs: string[] }) => (refs.length ? <span className="inline-flex flex-wrap gap-1">{refs.map(x => <code key={x} className="rounded bg-[#eef1f5] px-1.5 py-px text-[11px] text-ink-2">{x}</code>)}</span> : null);

export function FindingItem({ f }: { f: AiFinding | AiRisk }) {
  const isRisk = 'likelihood' in f;
  return (
    <li className={cx('rounded-lg border px-3 py-2', f.kind === 'inference' ? 'border-dashed border-[#e7c56d] bg-[#fffcf2]' : 'border-line bg-white')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <ClaimTag kind={f.kind} />
        {!isRisk && (f as AiFinding).polarity === 'positive' && <ThumbsUp className="size-3.5 text-ok" aria-label="Điểm nổi bật" />}
        {!isRisk && (f as AiFinding).polarity === 'negative' && <ThumbsDown className="size-3.5 text-bad" aria-label="Vấn đề" />}
        <span className="text-[11.5px] text-ink-3">Độ tin cậy {CONF[f.confidence]}{isRisk && ` · Khả năng ${CONF[(f as AiRisk).likelihood]}`}</span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink">{f.statement}</p>
      {isRisk && (f as AiRisk).impact && <p className="mt-0.5 text-[12px] text-ink-2">Tác động: {(f as AiRisk).impact}</p>}
      {f.kind === 'inference' && f.verify_by && <p className="mt-0.5 text-[12px] text-warn">Cần kiểm chứng: {f.verify_by}</p>}
      {f.downgraded && <p className="mt-0.5 text-[11.5px] text-ink-3">Hệ thống hạ FACT → INFERENCE: {f.downgrade_reason}</p>}
      <div className="mt-1"><Refs refs={f.refs} /></div>
    </li>
  );
}
export function RecItem({ r, decisionKey, provider }: { r: AiRecommendation; decisionKey: string; provider: string }) {
  return (
    <li className="rounded-lg border border-line bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5"><ClaimTag kind="rec" /><PriorityBadge p={r.priority} />{r.kpi_ref && <code className="rounded bg-navy-50 px-1.5 text-[11px] text-navy-700">{r.kpi_ref}</code>}</div>
      <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">{r.action}</p>
      <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[12px] text-ink-2 sm:grid-cols-2">
        {r.rationale && <span>Căn cứ: {r.rationale}</span>}
        <span>Phụ trách: {r.owner_role || 'chưa xác định'}</span>
        {r.due_hint && <span>Thời hạn: {r.due_hint}</span>}
        {r.success_measure && <span>Đo kết quả: {r.success_measure}</span>}
      </div>
      <div className="mt-1"><Refs refs={r.refs} /></div>
      {r.propose_improvement_action && <ProposedAction rec={r} decisionKey={decisionKey} provider={provider} />}
    </li>
  );
}
function Block({ title, count, children, icon }: { title: string; count?: number; children: ReactNode; icon?: ReactNode }) {
  return <div><h4 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-ink-2">{icon}{title}{count !== undefined && <span className="font-normal normal-case text-ink-3">({count})</span>}</h4>{children}</div>;
}

export function AiMeta({ r }: { r: AiRunResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-2 text-[12px] text-ink-3">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 hover:text-navy-700" aria-expanded={open}><Database className="size-3.5" />Dữ liệu gửi AI & kiểm tra {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button>
      {open && (
        <div className="mt-1.5 grid gap-1 rounded-md bg-canvas p-2.5">
          <span>Tác vụ: <b className="text-ink-2">{r.label}</b> · Phạm vi: {r.scope.type === 'department' ? 'Toàn Bộ môn' : `${r.scope.type} ${r.scope.label ?? r.scope.id}`}</span>
          <span>Context Builder: {r.sections.join(', ')} · {num(r.contextChars, 0)} ký tự{r.truncated.length ? ` · rút gọn: ${r.truncated.join('; ')}` : ''}</span>
          <span>Thời gian: {dateTime(r.at)} · {num(r.latencyMs, 0)} ms{r.usage?.totalTokens ? ` · ${num(r.usage.totalTokens, 0)} token` : ''}</span>
          <span>Kiểm tra: {r.checks.factsRejected.length} fact bị loại · {r.checks.downgraded.length} hạ thành inference · {r.checks.unknownRefs.length} ref lạ · {r.checks.unverifiedNumbers.length} số chưa kiểm chứng</span>
          {r.checks.factsRejected.map((f, i) => <span key={i} className="text-bad">Loại: “{f.statement}” — {f.reason}</span>)}
        </div>
      )}
    </div>
  );
}

/** Kết quả đầy đủ (AI Copilot, Course/Lecturer analysis) */
export function AiResultView({ r, sections = 'all' }: { r: AiRunResult; sections?: 'all' | 'compact' }) {
  const d = r.data as AiResponse;
  const key = (i: number, p: string) => `${r.id}:${p}${i}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><ProviderBadge r={r} /><span className="text-[11.5px] text-ink-3">Độ tin cậy tổng thể: {CONF[d.confidence]}</span></div>
      {r.fallbackReason && <Alert tone="info" title="Đang dùng phân tích bằng quy tắc">{r.fallbackReason}. Kết quả chỉ gồm dữ kiện và đề xuất có sẵn, không có suy luận AI.</Alert>}
      {r.warnings.length > 0 && <Alert tone="warn" title="Lưu ý rà soát">{r.warnings.join(' ')}</Alert>}
      {d.insufficient_data && <Alert tone="warn" title="Không đủ dữ liệu để kết luận." />}
      <div className="rounded-lg bg-navy-50/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">{d.summary}</div>
      {d.facts.length > 0 && (
        <Block title="Dữ kiện (FACT)" count={d.facts.length}>
          <ul className="grid gap-1.5 md:grid-cols-2">{d.facts.map((f, i) => <li key={i} className="flex gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px]"><ClaimTag kind="fact" /><span className="min-w-0 flex-1">{f.statement} <Refs refs={[f.ref]} /></span></li>)}</ul>
        </Block>
      )}
      {d.findings.length > 0 && <Block title="Nhận định" count={d.findings.length}><ul className="grid gap-2">{d.findings.map((f, i) => <FindingItem key={i} f={f} />)}</ul></Block>}
      {d.risks.length > 0 && <Block title="Rủi ro" count={d.risks.length} icon={<AlertTriangle className="size-3.5" />}><ul className="grid gap-2">{d.risks.map((f, i) => <FindingItem key={i} f={f} />)}</ul></Block>}
      {sections === 'all' && d.priority_actions.length > 0 && <Block title="Hành động ưu tiên" count={d.priority_actions.length}><ul className="grid gap-2">{d.priority_actions.map((x, i) => <RecItem key={i} r={x} decisionKey={key(i, 'p')} provider={r.provider} />)}</ul></Block>}
      {d.recommendations.length > 0 && <Block title="Khuyến nghị (đề xuất, không phải quyết định)" count={d.recommendations.length}><ul className="grid gap-2">{d.recommendations.map((x, i) => <RecItem key={i} r={x} decisionKey={key(i, 'r')} provider={r.provider} />)}</ul></Block>}
      {d.data_gaps.length > 0 && <Block title="Dữ liệu còn thiếu (DATA GAP)" icon={<Info className="size-3.5" />}><ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-2">{d.data_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></Block>}
      <AiMeta r={r} />
    </div>
  );
}
