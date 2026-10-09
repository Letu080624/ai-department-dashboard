/* BÁO CÁO — Generate Department Report: bảng số liệu do hệ thống dựng + nhận xét AI (đã kiểm chứng) → Preview → Edit → Export */
import { useEffect, useState } from 'react';
import { Download, FileJson, FileText, History, Pencil, Printer, Sparkles, Undo2 } from 'lucide-react';
import { useApp } from '../lib/app';
import { dateTime } from '../lib/format';
import { aiService, type AiRunResult } from '../services/aiService';
import { dataService } from '../services/dataService';
import { reportService, type Block, type ReportDoc } from '../services/reportService';
import type { StoredReport } from '../data/repository';
import type { ReportNarrative } from '../ai/schema';
import { AiLoading, Alert, Button, Card, ClaimTag, EmptyState, NoAccess, PageHeader, Textarea, toast } from '../components/ui';
import { ProviderBadge } from '../components/ai/AiResult';
import { REPORT_SECTIONS } from '../ai/schema';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** In qua iframe ẩn (chạy được cả khi ứng dụng nằm trong iframe của AI Studio, không cần popup) */
function printHtml(html: string) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  const d = f.contentDocument!; d.open(); d.write(html); d.close();
  setTimeout(() => { try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { toast.error('Trình duyệt chặn in — hãy tải HTML rồi in.'); } setTimeout(() => f.remove(), 1000); }, 300);
}

export default function Reports() {
  const { A, user, can } = useApp();
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [ai, setAi] = useState<AiRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredReport[]>([]);
  useEffect(() => { void dataService.listReports().then(setHistory).catch(() => setHistory([])); }, [doc?.id]);
  if (!can('report.generate')) return <><PageHeader title="Báo cáo" /><NoAccess what="chức năng tạo báo cáo" /></>;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await aiService.run('department_report', { userId: user.id, force: !!doc });
      const d = reportService.compose(A, r as AiRunResult<ReportNarrative>, user.fullName);
      setAi(r); setDoc(d); setEditing(null);
      await dataService.saveReport({ id: d.id, createdAt: d.meta.generatedAt, createdBy: user.fullName, title: d.title, doc: d });
      await dataService.audit('report.generate', 'reports', d.id, null, { provider: r.provider, model: r.model, trust: r.trust, removed: r.checks.removed.length });
      toast.ok('Đã tạo báo cáo — xem trước, chỉnh sửa rồi xuất file');
    } catch (e) { toast.error(`Không tạo được báo cáo: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const updatePara = (pid: string, text: string) => setDoc(d => d && ({ ...d, meta: { ...d.meta, edited: true }, sections: d.sections.map(s => ({ ...s, blocks: s.blocks.map(b => (b.type === 'paragraph' && b.id === pid ? { ...b, text, source: 'user' as const } : b)) })) }));
  const exportAs = async (kind: 'html' | 'json' | 'print') => {
    if (!doc) return;
    const html = reportService.renderHtml(doc);
    if (kind === 'html') download(reportService.fileName(doc, 'html'), html, 'text/html;charset=utf-8');
    if (kind === 'json') download(reportService.fileName(doc, 'json'), JSON.stringify(doc, null, 2), 'application/json');
    if (kind === 'print') printHtml(html);
    await dataService.saveReport({ id: doc.id, createdAt: doc.meta.generatedAt, createdBy: doc.meta.generatedBy, title: doc.title, doc });
    await dataService.audit('report.export', 'reports', doc.id, null, { format: kind === 'print' ? 'pdf(print)' : kind, edited: doc.meta.edited });
  };

  return (
    <>
      <PageHeader title="Báo cáo Bộ môn" subtitle={`Báo cáo gồm ${REPORT_SECTIONS.length} mục. Bảng số liệu do hệ thống dựng từ cùng nguồn với dashboard; AI chỉ viết nhận xét — đoạn có số không kiểm chứng được sẽ bị loại.`}
        actions={<Button id="demo-report-generate" variant="primary" icon={<Sparkles className="size-4" />} loading={busy} onClick={generate}>{doc ? 'Tạo lại báo cáo' : 'AI → Generate Department Report'}</Button>} />
      {!doc && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Cấu trúc báo cáo">
            <ol className="grid gap-1.5 sm:grid-cols-2">{REPORT_SECTIONS.map((s, i) => <li key={s.key} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px]"><span className="grid size-6 place-items-center rounded-full bg-navy-50 text-[12px] font-semibold text-navy-700">{i + 1}</span>{s.title}</li>)}</ol>
            <p className="mt-3 text-[12.5px] text-ink-2">Quy trình: Generate → Preview → Edit (sửa nhận xét) → Export (HTML, JSON, In → PDF). Mọi lần tạo/xuất được ghi nhật ký.</p>
          </Card>
          <HistoryCard history={history} onOpen={d => { setDoc(d); setAi(null); }} />
        </div>
      )}
      {busy && !doc && <Card className="mt-5"><AiLoading label="Đang dựng bảng số liệu hệ thống và viết nhận xét…" /></Card>}
      {doc && (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <article className="min-w-0 rounded-xl border border-line bg-white px-5 py-6 sm:px-10">
            <div className="flex flex-wrap justify-between gap-2 text-[11.5px] uppercase text-ink-2"><div>{doc.meta.university}<br />{doc.meta.faculty}<br /><b className="text-ink">{doc.meta.department}</b></div><div className="text-right"><b className="text-ink">Báo cáo</b><br />Ngày lập {doc.meta.generatedAt.slice(0, 10)}</div></div>
            <h2 className="mt-5 text-center text-[18px] font-semibold uppercase text-navy-800">{doc.title}</h2>
            <p className="mt-1 text-center text-[12px] text-ink-2">Năm học {doc.meta.academicYear} · Dữ liệu đến {doc.meta.referenceDate} · Người lập: {doc.meta.generatedBy}{doc.meta.edited && ' · đã chỉnh sửa'}</p>
            {doc.meta.warnings.length > 0 && <Alert tone="warn" className="mt-5" title="Lưu ý rà soát">{doc.meta.warnings.join(' ')}</Alert>}
            {doc.sections.map(s => (
              <section key={s.key} className="mt-6">
                <h3 className="border-b-2 border-navy-700 pb-1 text-[14px] font-semibold uppercase text-navy-800">{s.number}. {s.title}</h3>
                <div className="mt-2 space-y-3">{s.blocks.map((b, i) => <BlockView key={i} b={b} editing={b.type === 'paragraph' && editing === b.id} onEdit={() => b.type === 'paragraph' && setEditing(b.id)} onSave={t => { if (b.type === 'paragraph') updatePara(b.id, t); setEditing(null); }} onCancel={() => setEditing(null)} />)}</div>
              </section>
            ))}
            <section className="mt-6 text-[12px] text-ink-2"><h3 className="text-[13px] font-semibold uppercase text-navy-800">Phụ lục</h3><p className="mt-1">Dữ liệu còn thiếu: {doc.meta.dataGaps.join(' ') || 'không ghi nhận'}</p>{doc.meta.removed.length > 0 && <p className="mt-1">Nội dung AI bị loại do số liệu không kiểm chứng được: {doc.meta.removed.map(r => `“${r.text}” [${r.values.join(', ')}]`).join('; ')}</p>}</section>
          </article>
          <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
            <Card id="demo-report-export" title="Xuất báo cáo">
              <div className="grid gap-2">
                <Button icon={<Download className="size-4" />} onClick={() => void exportAs('html')}>Tải HTML</Button>
                <Button icon={<Printer className="size-4" />} onClick={() => void exportAs('print')}>In / Lưu PDF</Button>
                <Button icon={<FileJson className="size-4" />} onClick={() => void exportAs('json')}>Tải JSON (dữ liệu)</Button>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">DOCX/Excel: Phase 5 (xuất ở server). PDF: dùng “In → Lưu dưới dạng PDF”.</p>
            </Card>
            <Card title="Nguồn nhận xét">
              {ai ? <ProviderBadge r={ai} /> : <p className="text-[12.5px] text-ink-2">Báo cáo mở từ lịch sử.</p>}
              {doc.meta.fallbackReason && <p className="mt-2 text-[12px] text-ink-2">Dùng quy tắc vì: {doc.meta.fallbackReason}</p>}
              <p className="mt-2 text-[12px] text-ink-2"><Pencil className="mr-1 inline size-3" />Bấm “Sửa” ở một đoạn nhận xét để chỉnh sửa; bảng số liệu hệ thống không sửa được.</p>
            </Card>
            <HistoryCard history={history} onOpen={d => { setDoc(d); setAi(null); }} />
          </aside>
        </div>
      )}
    </>
  );
}

function BlockView({ b, editing, onEdit, onSave, onCancel }: { b: Block; editing: boolean; onEdit: () => void; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(b.type === 'paragraph' ? b.text : '');
  useEffect(() => { if (b.type === 'paragraph') setText(b.text); }, [b, editing]);
  if (b.type === 'kv') return <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">{b.items.map(i => <div key={i.label} className="flex justify-between gap-2 border-b border-dashed border-line py-1"><dt className="text-ink-2">{i.label}</dt><dd className="font-medium tabular-nums">{i.value}</dd></div>)}</dl>;
  if (b.type === 'table') return (
    <div><p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold"><ClaimTag kind="system" />{b.caption}</p>
      {b.rows.length ? <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-[12px]"><thead><tr>{b.columns.map(c => <th key={c} className="border border-line bg-canvas px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border border-line px-2 py-1 align-top">{c ?? '—'}</td>)}</tr>)}</tbody></table></div> : <p className="text-[12px] text-ink-3">Không có dữ liệu.</p>}</div>
  );
  if (b.type === 'actions') return (
    <div><p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold"><ClaimTag kind="rec" />{b.caption}</p>
      <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-[12px]"><thead><tr>{['Hành động', 'Phụ trách', 'Thời hạn', 'Đo bằng'].map(c => <th key={c} className="border border-line bg-canvas px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead><tbody>{b.items.map((a, i) => <tr key={i}><td className="border border-line px-2 py-1">{a.action}</td><td className="border border-line px-2 py-1">{a.owner_role}</td><td className="border border-line px-2 py-1">{a.due_hint || '—'}</td><td className="border border-line px-2 py-1">{a.success_measure}</td></tr>)}</tbody></table></div></div>
  );
  return (
    <div className={`group rounded-r-md border-l-[3px] px-3 py-2 ${b.kind === 'inference' ? 'border-dashed border-warn bg-[#fffbeb]' : 'border-navy-700 bg-canvas'}`}>
      <div className="flex flex-wrap items-center gap-1.5"><ClaimTag kind={b.kind === 'system' ? 'system' : b.kind} />{b.source === 'user' && <span className="text-[11px] text-ink-3">đã chỉnh sửa</span>}{b.source === 'rules' && <span className="text-[11px] text-ink-3">quy tắc</span>}
        {!editing && <button type="button" onClick={onEdit} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 text-[11.5px] text-ink-2 hover:bg-white hover:text-navy-700"><Pencil className="size-3" />Sửa</button>}</div>
      {editing ? (
        <div className="mt-1.5 grid gap-2"><Textarea aria-label="Nội dung đoạn" value={text} onChange={e => setText(e.target.value)} rows={3} /><div className="flex justify-end gap-2"><Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={onCancel}>Huỷ</Button><Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => onSave(text.trim().slice(0, 2000))}>Lưu đoạn</Button></div></div>
      ) : <p className="mt-1 text-[13px] leading-relaxed">{b.text}</p>}
      {b.refs.length > 0 && <p className="mt-1 text-[11px] text-ink-3">Nguồn: {b.refs.join(', ')}</p>}
      {b.note && <p className="text-[11px] text-ink-3">{b.note}</p>}
    </div>
  );
}

function HistoryCard({ history, onOpen }: { history: StoredReport[]; onOpen: (d: ReportDoc) => void }) {
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><History className="size-4" />Báo cáo đã tạo</span>} subtitle="Lưu tối đa 5 bản gần nhất (Demo)">
      {history.length === 0 ? <EmptyState icon={<FileText className="size-5" />} title="Chưa có báo cáo">Bấm “Generate Department Report” để tạo bản đầu tiên. Các bản đã tạo sẽ hiện ở đây để mở lại.</EmptyState> : (
        <ul className="space-y-1.5">{history.map(h => <li key={h.id}><button type="button" onClick={() => onOpen(h.doc as ReportDoc)} className="w-full rounded-md border border-line px-2.5 py-1.5 text-left text-[12.5px] hover:bg-navy-50/50"><span className="block truncate font-medium">{h.title}</span><span className="text-ink-3">{dateTime(h.createdAt)} · {h.createdBy}</span></button></li>)}</ul>
      )}
    </Card>
  );
}
