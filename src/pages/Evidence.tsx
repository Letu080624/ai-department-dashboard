/* MINH CHỨNG — Evidence Search + Evidence Detail; trạng thái Đủ / Thiếu / Cần cập nhật / Chưa xác nhận theo quy tắc E1–E4 */
import { useEffect, useState } from 'react';
import { BadgeCheck, FileCheck2, FileClock, FileQuestion, FileX2, Paperclip } from 'lucide-react';
import { useApp } from '../lib/app';
import { date } from '../lib/format';
import { href, navigate } from '../lib/router';
import { evidenceService } from '../services/evidenceService';
import { ValidationError } from '../services/dataService';
import { EVIDENCE_STATUS_LABEL, type EvidenceStatus } from '../domain/rules';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Button, Card, Drawer, Field, Input, KV, PageHeader, Select, StatCard, StatGrid, toast } from '../components/ui';
import { EvidenceBadge, KpiBadge } from '../components/status';

type Row = ReturnType<typeof evidenceService.search>[number];

export default function Evidence({ id }: { id?: string }) {
  const { A } = useApp();
  const [q, setQ] = useState(''); const [status, setStatus] = useState<EvidenceStatus | 'all'>('all'); const [type, setType] = useState('');
  const rows = evidenceService.search(q, status, type);
  const all = A.evidenceRows();
  const n = (s: EvidenceStatus) => all.filter(r => r.status === s).length;
  const cols: Column<Row>[] = [
    { key: 'code', header: 'ID', sort: r => r.e.code, render: r => <span className="whitespace-nowrap font-semibold text-navy-700">{r.e.code}</span> },
    { key: 'name', header: 'Tên minh chứng', sort: r => r.e.name, render: r => <div><p className="font-medium">{r.e.name}</p><p className="text-[11.5px] text-ink-3">{r.e.fileName ?? 'chưa có file'}</p></div> },
    { key: 'type', header: 'Loại', sort: r => r.e.type, render: r => r.e.type, hideBelow: 'md' },
    { key: 'owner', header: 'Phụ trách', sort: r => r.owner?.fullName ?? '', render: r => r.owner?.fullName ?? '—', hideBelow: 'lg' },
    { key: 'kpi', header: 'KPI liên quan', render: r => r.e.kpiIds.map(k => A.get('kpis', k)?.code).join(', ') || '—', hideBelow: 'lg' },
    { key: 'crit', header: 'Tiêu chí', render: r => r.e.criterionIds.map(c => A.get('qaCriteria', c)?.code).join(', ') || '—', hideBelow: 'md' },
    { key: 'upd', header: 'Cập nhật', sort: r => r.e.updatedAt, render: r => <span className="whitespace-nowrap">{date(r.e.updatedAt)}</span> },
    { key: 'status', header: 'Trạng thái', sort: r => ['missing', 'needs_update', 'unverified', 'complete'].indexOf(r.status), render: r => <EvidenceBadge s={r.status} reason={r.reason} /> },
  ];
  const card = (s: EvidenceStatus, icon: React.ReactNode, tone: 'ok' | 'bad' | 'warn' | 'info') => <StatCard label={EVIDENCE_STATUS_LABEL[s]} value={n(s)} icon={icon} tone={tone} onClick={() => setStatus(status === s ? 'all' : s)} active={status === s} sub={status === s ? 'Đang lọc · bấm để bỏ' : `${Math.round(n(s) / all.length * 100)}% minh chứng`} />;
  return (
    <>
      <PageHeader title="Minh chứng" subtitle={`Quy tắc: E1 Thiếu (chưa có file) → E2 Cần cập nhật (hết hiệu lực hoặc còn ≤ ${A.settings.evidence.expiringDays} ngày) → E3 Chưa xác nhận (BĐCL chưa xác nhận) → E4 Đủ.`} />
      <StatGrid>
        {card('complete', <FileCheck2 className="size-4" />, 'ok')}{card('missing', <FileX2 className="size-4" />, 'bad')}{card('needs_update', <FileClock className="size-4" />, 'warn')}{card('unverified', <FileQuestion className="size-4" />, 'info')}
      </StatGrid>
      <Card className="mt-5" title="Evidence Search" subtitle="Tìm theo mã, tên, mô tả, người phụ trách; bấm một dòng để xem chi tiết.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input aria-label="Tìm minh chứng" placeholder="Tìm theo mã, tên, mô tả, người phụ trách…" value={q} onChange={e => setQ(e.target.value)} className="w-full sm:w-80" />
          <Select aria-label="Trạng thái" value={status} onChange={e => setStatus(e.target.value as EvidenceStatus | 'all')} className="w-auto"><option value="all">Mọi trạng thái</option>{(Object.keys(EVIDENCE_STATUS_LABEL) as EvidenceStatus[]).map(s => <option key={s} value={s}>{EVIDENCE_STATUS_LABEL[s]}</option>)}</Select>
          <Select aria-label="Loại" value={type} onChange={e => setType(e.target.value)} className="w-auto"><option value="">Mọi loại</option>{evidenceService.types().map(t => <option key={t}>{t}</option>)}</Select>
        </div>
        <DataTable rows={rows} columns={cols} rowKey={r => r.e.id} onRowClick={r => navigate(`evidence/${r.e.id}`)} pageSize={12} initialSort={{ key: 'status', dir: 'asc' }} empty="Không tìm thấy minh chứng phù hợp" />
      </Card>
      <EvidenceDetail id={id} />
    </>
  );
}

function EvidenceDetail({ id }: { id?: string }) {
  const { A, can, canOnOwn, user } = useApp();
  const r = id ? evidenceService.get(id) : null;
  const [file, setFile] = useState(''); const [valid, setValid] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setFile(r?.e.fileName ?? ''); setValid(r?.e.validUntil ?? ''); setErr(null); }, [id, r?.e.fileName, r?.e.validUntil]);
  const close = () => navigate('evidence');
  if (!id) return null;
  if (!r) return <Drawer open onClose={close} title="Không tìm thấy minh chứng"><Alert tone="warn">Mã minh chứng không tồn tại.</Alert></Drawer>;
  const e = r.e;
  const canEdit = canOnOwn('evidence.update', e.ownerId);
  const canVerify = can('evidence.verify') && !!e.fileName && !e.verified && user.lecturerId !== e.ownerId;
  const attach = async () => { setBusy(true); setErr(null); try { await evidenceService.attachFile(e.id, file.trim(), valid || null); toast.ok('Đã cập nhật minh chứng (cần BĐCL xác nhận lại)'); } catch (x) { setErr(x instanceof ValidationError ? x.message : (x as Error).message); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); try { await evidenceService.verify(e.id); toast.ok('Đã xác nhận minh chứng'); } catch (x) { toast.error((x as Error).message); } finally { setBusy(false); } };
  return (
    <Drawer id="demo-evidence-detail" open onClose={close} title={`${e.code} · ${e.name}`} footer={<Button onClick={close}>Đóng</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-2"><EvidenceBadge s={r.status} /><span className="text-[12.5px] text-ink-2">{r.reason}</span></div>
      <KV items={[
        { label: 'Loại', value: e.type }, { label: 'Đơn vị cung cấp', value: e.providerUnit },
        { label: 'Người phụ trách', value: r.owner?.fullName ?? '—' }, { label: 'Ngày cập nhật', value: date(e.updatedAt) },
        { label: 'Hiệu lực đến', value: e.validUntil ? date(e.validUntil) : 'Không thời hạn' }, { label: 'Xác nhận', value: e.verified ? `Đã xác nhận (${A.userName(e.verifiedBy)})` : 'Chưa xác nhận' },
        { label: 'File', value: e.fileName ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" />{e.fileName}</span> : <span className="text-bad">Chưa có</span> },
        { label: 'Mã băm', value: e.fileHash ? <code className="text-[11px]">{e.fileHash.slice(0, 16)}…</code> : '—' },
      ]} />
      <p className="mt-3 text-[13px] text-ink-2">{e.description}</p>
      <h4 className="mb-1.5 mt-4 text-[12.5px] font-semibold text-ink-2">Liên kết KPI</h4>
      {e.kpiIds.length ? <ul className="space-y-1.5">{e.kpiIds.map(k => { const v = A.kpi(k); return <li key={k}><a href={href(`kpi/${k}`)} className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] hover:bg-navy-50/50"><span>{v.def.code} · {v.def.name}</span><KpiBadge s={v.ev.status} /></a></li>; })}</ul> : <p className="text-[12.5px] text-ink-3">Không gắn KPI.</p>}
      <h4 className="mb-1.5 mt-4 text-[12.5px] font-semibold text-ink-2">Liên kết tiêu chí BĐCL</h4>
      {e.criterionIds.length ? <ul className="space-y-1.5">{e.criterionIds.map(c => { const cr = A.get('qaCriteria', c); const cv = cr ? A.criterionCoverage(cr) : null; return <li key={c} className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px]"><b className="font-semibold">{cr?.code}</b> {cr?.content} <span className="text-ink-2">· {cv?.valid}/{cv?.required} hợp lệ</span></li>; })}</ul> : <p className="text-[12.5px] text-ink-3">Không gắn tiêu chí.</p>}

      <div className="mt-5 rounded-lg border border-line p-3">
        <h4 className="mb-2 text-[13px] font-semibold">Cập nhật file minh chứng</h4>
        {canEdit ? (
          <div className="grid gap-2">
            <Field label="Tên file" hint="Bản Demo lưu tên file (metadata). Production: tải file lên File Storage, tính mã băm." error={err}><Input value={file} onChange={x => setFile(x.target.value)} placeholder="vd. bien-ban-hop-bo-mon-2026.pdf" /></Field>
            <Field label="Hiệu lực đến (tuỳ chọn)"><Input type="date" value={valid} onChange={x => setValid(x.target.value)} /></Field>
            <div className="flex justify-end"><Button variant="primary" loading={busy} disabled={!file.trim() || (file === (e.fileName ?? '') && valid === (e.validUntil ?? ''))} onClick={attach}>Lưu cập nhật</Button></div>
          </div>
        ) : <p className="text-[12.5px] text-ink-2">Bạn chỉ xem được minh chứng này (giảng viên chỉ cập nhật minh chứng mình phụ trách).</p>}
      </div>
      {can('evidence.verify') && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
          <p className="text-[12.5px] text-ink-2">{e.verified ? 'Minh chứng đã được xác nhận.' : !e.fileName ? 'Cần có file trước khi xác nhận.' : user.lecturerId === e.ownerId ? 'Người phụ trách không tự xác nhận minh chứng của mình.' : 'BĐCL xác nhận minh chứng hợp lệ.'}</p>
          <Button variant="success" icon={<BadgeCheck className="size-4" />} disabled={!canVerify} loading={busy} onClick={verify}>Xác nhận</Button>
        </div>
      )}
    </Drawer>
  );
}
