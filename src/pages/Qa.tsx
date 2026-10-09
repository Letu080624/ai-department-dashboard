/* BẢO ĐẢM CHẤT LƯỢNG — PDCA, độ phủ minh chứng theo tiêu chí (bộ tiêu chuẩn cấu hình được), phát hiện, cải tiến, chuỗi chất lượng */
import { useState } from 'react';
import { ArrowRight, ClipboardCheck, FileCheck2, Info, Plus, Search, Settings2, Sparkles, Wrench } from 'lucide-react';
import { useApp } from '../lib/app';
import { addDays, cx, date, num, pct } from '../lib/format';
import { href } from '../lib/router';
import { dataService, ValidationError } from '../services/dataService';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Progress, Select, StatCard, Tabs, Textarea, toast } from '../components/ui';
import { ActionBadge, KpiBadge, QaBadge } from '../components/status';
import type { PdcaPhase } from '../types/domain';

const PHASE: Record<PdcaPhase, { label: string; desc: string }> = {
  PLAN: { label: 'PLAN — Lập kế hoạch', desc: 'Mục tiêu, KPI, kế hoạch, người phụ trách, thời hạn' },
  DO: { label: 'DO — Thực hiện', desc: 'Công việc, tiến độ, người thực hiện' },
  CHECK: { label: 'CHECK — Kiểm tra', desc: 'Kết quả, chỉ số, đánh giá' },
  ACT: { label: 'ACT — Cải tiến', desc: 'Hành động cải tiến, kết quả cải tiến' },
};

export default function Qa() {
  const { A, can } = useApp();
  const [tab, setTab] = useState<'pdca' | 'coverage' | 'findings' | 'actions' | 'chain'>('pdca');
  const [open, setOpen] = useState(false);
  const fw = A.activeFramework();
  const rows = A.qaRows(); const cov = A.coverageAll();
  const chains = A.d.kpis.map(k => A.qaChain(k.id));
  const actions = A.d.improvementActions.map(a => ({ a, status: A.actionStatus(a), result: A.actionResult(a) }));
  const avgProgress = rows.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.a.progressPct, 0) / Math.max(1, rows.filter(r => r.status !== 'cancelled').length);
  const standards = fw ? A.d.qaStandards.filter(s => s.frameworkId === fw.id).sort((a, b) => a.order - b.order) : [];

  return (
    <>
      <PageHeader title="Bảo đảm chất lượng" subtitle="Vận hành theo PDCA và chuỗi KPI → Minh chứng → Phát hiện → Cải tiến → Kết quả. Trạng thái theo quy tắc A1–A5; độ phủ = minh chứng hợp lệ / yêu cầu của tiêu chí."
        actions={<>{can('admin.frameworks') && <a href={href('admin')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 text-[13.5px] font-medium shadow-[0_1px_1px_rgb(15_23_42/0.04)] hover:border-navy-200 hover:bg-navy-50"><Settings2 className="size-4" />Quản lý bộ tiêu chuẩn</a>}{can('qa.update') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Thêm hành động cải tiến</Button>}</>} />
      {fw ? (
        <Alert tone={fw.note ? 'warn' : 'info'} className="mb-4" title={`Bộ tiêu chuẩn đang áp dụng: ${fw.code} — ${fw.name} (phiên bản ${fw.version}, ${fw.type})`}>
          {fw.note ?? 'Bộ tiêu chuẩn do quản trị cấu hình.'} Không có tiêu chuẩn kiểm định nào được viết cứng trong mã nguồn.
        </Alert>
      ) : <Alert tone="warn" className="mb-4" title="Chưa cấu hình bộ tiêu chuẩn">Vào Quản trị → Bộ tiêu chuẩn BĐCL để thêm.</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Hoạt động BĐCL" value={rows.length} icon={<ClipboardCheck className="size-4" />} sub={`${rows.filter(r => r.status === 'done').length} hoàn thành · ${rows.filter(r => r.status === 'overdue').length} quá hạn`} foot={<Progress value={avgProgress} label="Tiến độ bình quân" />} />
        <StatCard label="Tiêu chí đủ minh chứng" icon={<FileCheck2 className="size-4" />} value={`${cov.filter(c => c.coverage === 'full').length}/${cov.length}`} sub={`${pct(A.metric('qa.evidence_coverage', A.currentYear.id))} · thiếu ${cov.reduce((s, c) => s + c.missing, 0)} MC`} tone={cov.every(c => c.coverage === 'full') ? 'ok' : 'warn'} />
        <StatCard label="Phát hiện" icon={<Search className="size-4" />} value={A.d.qaFindings.length} sub={`${A.d.qaFindings.filter(f => f.type === 'strength').length} điểm mạnh · ${A.d.qaFindings.filter(f => f.type === 'weakness').length} điểm yếu`} />
        <StatCard label="Hành động cải tiến" icon={<Wrench className="size-4" />} value={actions.length} sub={`${actions.filter(x => x.status !== 'done').length} đang mở · ${actions.filter(x => x.result.effective).length} có hiệu quả`} tone={actions.some(x => x.status === 'overdue') ? 'warn' : undefined} />
      </div>
      <Card className="mt-5" bodyClass="p-0">
        <Tabs className="px-3 pt-1" value={tab} onChange={setTab} tabs={[{ key: 'pdca', label: 'Vòng PDCA', count: rows.length }, { key: 'coverage', label: 'Tiêu chí & minh chứng', count: cov.length }, { key: 'findings', label: 'Phát hiện', count: A.d.qaFindings.length }, { key: 'actions', label: 'Cải tiến', count: actions.length }, { key: 'chain', label: 'Chuỗi chất lượng', count: chains.filter(c => c.state === 'broken').length }]} />
        <div className="p-4">
          {tab === 'pdca' && (
            <div id="demo-pdca" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(PHASE) as PdcaPhase[]).map(ph => { const list = rows.filter(r => r.a.phase === ph); return (
                <div key={ph} className="min-w-0 rounded-xl border border-line bg-canvas/60">
                  <div className="border-b border-line px-3 py-2.5"><p className="text-[13px] font-semibold text-navy-800">{PHASE[ph].label}</p><p className="text-[11.5px] text-ink-2">{PHASE[ph].desc}</p></div>
                  <ul className="space-y-2 p-2.5">{list.length === 0 && <li className="px-1 py-3 text-center text-[12.5px] text-ink-3">Không có hoạt động</li>}
                    {list.map(r => (
                      <li key={r.a.id} id={`demo-qa-${r.a.id}`} className="rounded-lg border border-line bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2"><span className="text-[11.5px] font-semibold text-ink-2">{r.a.code}</span><QaBadge s={r.status} /></div>
                        <p className="mt-1 text-[12.5px] font-medium leading-snug">{r.a.title}</p>
                        <div className="mt-2 flex items-center gap-2"><Progress value={r.a.progressPct} tone={r.status === 'overdue' ? 'bad' : r.status === 'done' ? 'ok' : 'navy'} label="Tiến độ" /><span className="text-[11.5px] tabular-nums">{r.a.progressPct}%</span></div>
                        <p className="mt-1.5 text-[11.5px] text-ink-2">{r.owner?.fullName} · hạn {date(r.a.dueDate)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">{r.criterion && <code className="rounded bg-[#eef1f5] px-1 text-[10.5px]">{r.criterion.code}</code>}{r.kpi && <a href={href(`kpi/${r.kpi.id}`)} className="rounded bg-navy-50 px-1 text-[10.5px] text-navy-700 hover:underline">{r.kpi.code}</a>}</div>
                        {r.a.resultSummary && <p className="mt-1 text-[11.5px] text-ink-2">Kết quả: {r.a.resultSummary}</p>}
                      </li>))}
                  </ul>
                </div>); })}
            </div>
          )}
          {tab === 'coverage' && (standards.length === 0 ? <EmptyState title="Bộ tiêu chuẩn chưa có tiêu chuẩn/tiêu chí" /> : (
            <div className="space-y-4">{standards.map(st => (
              <div key={st.id}><h3 className="mb-2 text-[13px] font-semibold text-navy-800">{st.code} · {st.name}</h3>
                <ul className="grid gap-2 md:grid-cols-2">{cov.filter(c => c.criterion.standardId === st.id).map(c => (
                  <li key={c.criterion.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2"><p className="text-[12.5px]"><b className="font-semibold">{c.criterion.code}</b> {c.criterion.content}</p><Badge tone={c.coverage === 'full' ? 'ok' : c.coverage === 'partial' ? 'warn' : 'bad'}>{c.coverage === 'full' ? 'Đủ' : c.coverage === 'partial' ? 'Thiếu một phần' : 'Thiếu'}</Badge></div>
                    <div className="mt-2 flex items-center gap-2"><Progress value={c.valid} max={c.required} tone={c.coverage === 'full' ? 'ok' : c.coverage === 'partial' ? 'warn' : 'bad'} label="Độ phủ" /><span className="whitespace-nowrap text-[12px] tabular-nums">{c.valid}/{c.required} hợp lệ</span></div>
                    <p className="mt-1 text-[11.5px] text-ink-2">{c.linked} minh chứng liên kết · <a className="text-navy-700 hover:underline" href={href('evidence')}>xem minh chứng</a></p>
                  </li>))}</ul>
              </div>))}</div>
          ))}
          {tab === 'findings' && (
            <ul className="grid gap-2 md:grid-cols-2">{A.d.qaFindings.map(f => (
              <li key={f.id} className="rounded-lg border border-line p-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2"><b className="text-[12px] font-semibold text-ink-2">{f.code}</b><Badge tone={f.type === 'strength' ? 'ok' : 'warn'} icon={false}>{f.type === 'strength' ? 'Điểm mạnh' : 'Điểm yếu'}</Badge><span className="text-[11.5px] text-ink-3">{date(f.date)}</span></div>
                <p className="mt-1">{f.statement}</p>
                <p className="mt-1 text-[11.5px] text-ink-2">{[A.get('qaActivities', f.activityId)?.code, A.get('qaCriteria', f.criterionId)?.code, A.get('kpis', f.kpiId)?.code].filter(Boolean).join(' · ') || '—'}{f.type === 'weakness' && !A.d.improvementActions.some(a => a.findingId === f.id || (f.kpiId && a.kpiId === f.kpiId)) && <span className="ml-1 text-bad">· chưa có hành động cải tiến</span>}</p>
              </li>))}</ul>
          )}
          {tab === 'actions' && (
            <div className="thin-scroll -mx-4 overflow-x-auto px-4"><table className="w-full min-w-[760px] text-[13px]"><thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="py-2 pr-2 font-medium">Mã</th><th className="px-2 py-2 font-medium">Hành động</th><th className="px-2 py-2 font-medium">KPI</th><th className="px-2 py-2 font-medium">Phụ trách</th><th className="px-2 py-2 font-medium">Hạn</th><th className="px-2 py-2 font-medium">Trạng thái</th><th className="px-2 py-2 font-medium">Kết quả cải tiến</th></tr></thead>
              <tbody>{actions.map(x => (
                <tr key={x.a.id} className="border-b border-[#eef1f5] last:border-0 align-top">
                  <td className="py-2.5 pr-2 font-medium">{x.a.code}{x.a.origin === 'ai_approved' && <div><Badge tone="info" icon={false}><Sparkles className="size-3" />AI · đã duyệt</Badge></div>}</td>
                  <td className="px-2 py-2.5">{x.a.title}</td>
                  <td className="px-2 py-2.5">{x.a.kpiId ? <a className="text-navy-700 hover:underline" href={href(`kpi/${x.a.kpiId}`)}>{A.get('kpis', x.a.kpiId)?.code}</a> : '—'}</td>
                  <td className="px-2 py-2.5">{A.lecturerName(x.a.ownerId)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{date(x.a.dueDate)}</td>
                  <td className="px-2 py-2.5"><ActionBadge s={x.status} /></td>
                  <td className="px-2 py-2.5 text-[12.5px]"><span className={cx(x.result.effective === true && 'font-medium text-ok', x.result.effective === false && 'font-medium text-bad')}>{x.result.label}</span>{x.result.before && <div className="text-ink-2">{num(x.result.before.value, 2)} ({x.result.before.label}){x.result.after ? <> <ArrowRight className="inline size-3" /> {num(x.result.after.value, 2)} ({x.result.after.label})</> : ''}</div>}</td>
                </tr>))}</tbody></table>
              <p className="mt-2 flex items-center gap-1 text-[12px] text-ink-3"><Info className="size-3.5" />Kết quả cải tiến = so giá trị KPI kỳ đầu tiên sau khi đóng hành động với kỳ ngay trước khi bắt đầu.</p>
            </div>
          )}
          {tab === 'chain' && (
            <ul className="divide-y divide-[#eef1f5]">{chains.sort((a, b) => ['broken', 'open', 'closed'].indexOf(a.state) - ['broken', 'open', 'closed'].indexOf(b.state)).map(c => (
              <li key={c.kpi.def.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <a href={href(`kpi/${c.kpi.def.id}`)} className="min-w-0 flex-1"><span className="font-medium text-navy-700">{c.kpi.def.code}</span> <span className="text-[12.5px] text-ink-2">{c.kpi.def.name}</span>{c.gaps.length > 0 && <p className="text-[12px] text-warn">{c.gaps.join(' · ')}</p>}</a>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-2"><KpiBadge s={c.kpi.ev.status} />{c.evidence.length} MC · {c.findings.length} PH · {c.actions.length} CI <Badge tone={c.state === 'broken' ? 'bad' : c.state === 'open' ? 'info' : 'ok'}>{c.state === 'broken' ? 'Đứt chuỗi' : c.state === 'open' ? 'Đang mở' : 'Khép kín'}</Badge></span>
              </li>))}</ul>
          )}
        </div>
      </Card>
      <NewActionModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewActionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { A, user } = useApp();
  const [f, setF] = useState({ title: '', kpiCode: '', ownerId: user.lecturerId ?? A.d.lecturers[0].id, dueDate: addDays(A.ref, 60) });
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await dataService.createImprovementAction({ ...f, kpiCode: f.kpiCode || undefined }); toast.ok(`Đã tạo ${r.code}`); onClose(); setF({ ...f, title: '' }); }
    catch (e) { if (e instanceof ValidationError) setErr({ field: e.field, msg: e.message }); else toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Thêm hành động cải tiến" footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" loading={busy} onClick={save}>Tạo</Button></>}>
      <div className="grid gap-3">
        <Field label="Hành động" error={err?.field === 'title' ? err.msg : null}><Textarea rows={2} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Mô tả hành động cụ thể, kiểm chứng được" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="KPI đo lại"><Select value={f.kpiCode} onChange={e => setF({ ...f, kpiCode: e.target.value })}><option value="">— Không gắn —</option>{A.d.kpis.map(k => <option key={k.id} value={k.code}>{k.code} · {k.name}</option>)}</Select></Field>
          <Field label="Người phụ trách" error={err?.field === 'ownerId' ? err.msg : null}><Select value={f.ownerId} onChange={e => setF({ ...f, ownerId: e.target.value })}>{A.d.lecturers.filter(l => l.status === 'active').map(l => <option key={l.id} value={l.id}>{l.code} · {l.fullName}</option>)}</Select></Field>
          <Field label="Thời hạn" error={err?.field === 'dueDate' ? err.msg : null}><Input type="date" min={A.ref} value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}
