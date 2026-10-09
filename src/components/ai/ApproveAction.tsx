/* =========================================================================
 * AI Actions: "AI đề xuất hành động này" — Approve / Edit / Reject.
 * Dữ liệu (hành động cải tiến) CHỈ được tạo khi người dùng bấm Xác nhận; mọi quyết định ghi audit.
 * ========================================================================= */
import { useState } from 'react';
import { Check, Pencil, Sparkles, X } from 'lucide-react';
import type { AiRecommendation } from '../../ai/schema';
import { useApp } from '../../lib/app';
import { addDays, date } from '../../lib/format';
import { href } from '../../lib/router';
import { uiStorage } from '../../data/repository';
import { dataService, ValidationError } from '../../services/dataService';
import { Badge, Button, Field, Input, Modal, Select, Textarea, toast } from '../ui';

type Decision = { status: 'approved' | 'rejected'; code?: string; id?: string; at: string; reason?: string };
const getDecisions = () => uiStorage.get<Record<string, Decision>>('aiDecisions', {});

export function ProposedAction({ rec, decisionKey, provider }: { rec: AiRecommendation; decisionKey: string; provider: string }) {
  const { A, user, can } = useApp();
  const [decision, setDecision] = useState<Decision | undefined>(() => getDecisions()[decisionKey]);
  const [mode, setMode] = useState<null | 'approve' | 'edit' | 'reject'>(null);
  const kpi = rec.kpi_ref ? A.d.kpis.find(k => k.code === rec.kpi_ref) : undefined;
  // Người phụ trách mặc định: người AI nêu tên (nếu khớp danh sách GV) → người phụ trách KPI → người dùng hiện tại
  const named = A.d.lecturers.find(l => l.status === 'active' && rec.owner_role.includes(l.fullName));
  const defaultOwner = named?.id || (kpi && A.get('users', kpi.ownerId)?.lecturerId) || user.lecturerId || A.d.lecturers[0].id;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(rec.due_hint) && rec.due_hint > A.ref ? rec.due_hint : addDays(A.ref, 30);
  const [form, setForm] = useState({ title: rec.action, kpiCode: kpi?.code ?? '', ownerId: defaultOwner, dueDate: due, expected: '' });
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = (d: Decision) => { const all = getDecisions(); all[decisionKey] = d; uiStorage.set('aiDecisions', all); setDecision(d); };

  const approve = async () => {
    setBusy(true); setErr(null);
    try {
      const row = await dataService.createImprovementAction({ title: form.title, kpiCode: form.kpiCode || undefined, ownerId: form.ownerId, dueDate: form.dueDate, expected: form.expected === '' ? null : Number(form.expected), aiRecommendationId: decisionKey });
      save({ status: 'approved', code: row.code, id: row.id, at: new Date().toISOString() });
      setMode(null); toast.ok(`Đã tạo hành động cải tiến ${row.code}`);
    } catch (e) { if (e instanceof ValidationError) setErr({ field: e.field, msg: e.message }); else toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    await dataService.audit('ai.recommendation.reject', 'ai_recommendation', decisionKey, null, { action: rec.action, provider }, reason.slice(0, 300));
    save({ status: 'rejected', at: new Date().toISOString(), reason }); setMode(null); toast.info('Đã từ chối đề xuất (ghi nhật ký)');
  };

  if (decision) return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
      {decision.status === 'approved' ? <><Badge tone="ok">Đã duyệt</Badge><span className="text-ink-2">→ tạo <a className="font-medium text-navy-700 hover:underline" href={href('qa')}>{decision.code}</a> lúc {date(decision.at.slice(0, 10))}</span></>
        : <><Badge tone="neutral">Đã từ chối</Badge>{decision.reason && <span className="text-ink-2">Lý do: {decision.reason}</span>}</>}
    </div>
  );
  const allowed = can('improvement.approve');
  const editable = mode === 'edit';
  return (
    <div data-demo="ai-proposal" className="mt-2.5 rounded-lg border border-dashed border-navy-200 bg-navy-50/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-700"><Sparkles className="size-3.5" />AI đề xuất hành động này</span>
        <span className="text-[11.5px] text-ink-3">— chưa có dữ liệu nào được tạo cho đến khi bạn duyệt</span>
        {allowed ? (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="success" data-demo="ai-approve" icon={<Check className="size-3.5" />} onClick={() => setMode('approve')}>Approve</Button>
            <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setMode('edit')}>Edit</Button>
            <Button size="sm" variant="danger" icon={<X className="size-3.5" />} onClick={() => setMode('reject')}>Reject</Button>
          </div>
        ) : <span className="ml-auto text-[11.5px] text-ink-2">Cần vai trò Trưởng/Phó Bộ môn hoặc BĐCL để duyệt</span>}
      </div>

      <Modal open={mode === 'approve' || mode === 'edit'} onClose={() => setMode(null)} title={editable ? 'Chỉnh sửa rồi tạo hành động cải tiến' : 'Xác nhận tạo hành động cải tiến'}
        footer={<><Button onClick={() => setMode(null)}>Huỷ</Button>{!editable && <Button icon={<Pencil className="size-3.5" />} onClick={() => setMode('edit')}>Sửa trước</Button>}<Button variant="primary" loading={busy} onClick={approve}>Xác nhận tạo</Button></>}>
        <p className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-[#713f12]">Đây là đề xuất của {provider === 'rules' ? 'bộ quy tắc' : 'AI'}, không phải quyết định. Hành động chỉ được tạo khi bạn bấm “Xác nhận tạo”; thao tác được ghi vào nhật ký.</p>
        <div className="grid gap-3">
          <Field label="Hành động cải tiến" error={err?.field === 'title' ? err.msg : null}><Textarea disabled={!editable} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="KPI đo lại"><Select disabled={!editable} value={form.kpiCode} onChange={e => setForm({ ...form, kpiCode: e.target.value })}><option value="">— Không gắn KPI —</option>{A.d.kpis.map(k => <option key={k.id} value={k.code}>{k.code} · {k.name}</option>)}</Select></Field>
            <Field label="Người phụ trách" error={err?.field === 'ownerId' ? err.msg : null}><Select disabled={!editable} value={form.ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}>{A.d.lecturers.filter(l => l.status === 'active').map(l => <option key={l.id} value={l.id}>{l.code} · {l.fullName}</option>)}</Select></Field>
            <Field label="Thời hạn" error={err?.field === 'dueDate' ? err.msg : null}><Input type="date" disabled={!editable} value={form.dueDate} min={A.ref} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Field label="Giá trị kỳ vọng (tuỳ chọn)"><Input type="number" disabled={!editable} value={form.expected} onChange={e => setForm({ ...form, expected: e.target.value })} placeholder="vd. 80" /></Field>
          </div>
          <p className="text-[12px] text-ink-2">Căn cứ: {rec.rationale || '—'} · Đo kết quả: {rec.success_measure || '—'}</p>
        </div>
      </Modal>
      <Modal open={mode === 'reject'} onClose={() => setMode(null)} title="Từ chối đề xuất" footer={<><Button onClick={() => setMode(null)}>Huỷ</Button><Button variant="danger" onClick={reject}>Từ chối</Button></>}>
        <Field label="Lý do (tuỳ chọn, ghi vào nhật ký)"><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="vd. Đã có hành động tương tự đang thực hiện" /></Field>
      </Modal>
    </div>
  );
}
