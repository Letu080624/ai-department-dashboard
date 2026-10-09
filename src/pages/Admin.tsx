/* QUẢN TRỊ — cấu hình quy tắc (không hard-code), bộ tiêu chuẩn BĐCL, nhật ký (audit), giám sát AI, dữ liệu demo */
import { useEffect, useState } from 'react';
import { Database, FileClock, Plus, RefreshCcw, Save, Settings2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, dateTime, num } from '../lib/format';
import { dataService, ValidationError } from '../services/dataService';
import { aiService, type AiHealth } from '../services/aiService';
import { ROLE_LABEL, PERMISSIONS } from '../services/authService';
import type { AppSettings, AuditEntry, QaCriterion, QaFramework, QaStandard, Role } from '../types/domain';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, NoAccess, PageHeader, Select, Tabs, Textarea, toast } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';

type TabKey = 'settings' | 'frameworks' | 'audit' | 'ai' | 'data';
const ACTION_LABEL: Record<string, string> = { login: 'Đăng nhập', logout: 'Đăng xuất', 'kpi.update': 'Sửa KPI', 'kpi.entry': 'Nhập kết quả KPI', 'evidence.update': 'Cập nhật minh chứng', 'task.update': 'Cập nhật công việc', 'ai.request': 'Yêu cầu AI phân tích', 'ai.recommendation.approve': 'Duyệt đề xuất AI', 'ai.recommendation.reject': 'Từ chối đề xuất AI', 'report.generate': 'Tạo báo cáo', 'report.export': 'Xuất báo cáo', 'settings.update': 'Đổi cấu hình', 'qa.framework.update': 'Sửa bộ tiêu chuẩn', 'improvement.create': 'Tạo hành động cải tiến', 'data.reset': 'Khôi phục dữ liệu demo' };

export default function Admin() {
  const { can } = useApp();
  const tabs = ([
    can('admin.settings') && { key: 'settings', label: 'Cấu hình quy tắc' }, can('admin.frameworks') && { key: 'frameworks', label: 'Bộ tiêu chuẩn BĐCL' },
    can('audit.view') && { key: 'audit', label: 'Nhật ký (Audit log)' }, (can('admin.settings') || can('audit.view')) && { key: 'ai', label: 'Giám sát AI' },
    can('admin.settings') && { key: 'data', label: 'Dữ liệu & phân quyền' },
  ].filter(Boolean)) as { key: TabKey; label: string }[];
  const [tab, setTab] = useState<TabKey>(tabs[0]?.key ?? 'settings');
  if (!tabs.length) return <><PageHeader title="Quản trị hệ thống" /><NoAccess what="khu vực quản trị" /></>;
  return (
    <>
      <PageHeader title="Quản trị hệ thống" subtitle="Mọi ngưỡng nghiệp vụ, bộ tiêu chuẩn kiểm định được cấu hình tại đây — không viết cứng trong mã nguồn. Mọi thay đổi được ghi nhật ký." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
      {tab === 'settings' && <SettingsForm />}
      {tab === 'frameworks' && <Frameworks />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'ai' && <AiMonitor />}
      {tab === 'data' && <DataTab />}
    </>
  );
}

function SettingsForm() {
  const { A } = useApp();
  const [s, setS] = useState<AppSettings>(() => structuredClone(A.settings));
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setS(structuredClone(A.settings)); }, [A.settings]);
  const set = <G extends 'kpi' | 'course' | 'workload' | 'evidence' | 'task' | 'ai'>(g: G, k: keyof AppSettings[G], v: number | boolean) => setS(x => ({ ...x, [g]: { ...x[g], [k]: v } }));
  const n = (g: 'kpi' | 'course' | 'workload' | 'evidence' | 'task' | 'ai', k: string, label: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}><Input type="number" step={step} value={String((s[g] as unknown as Record<string, number>)[k])} onChange={e => set(g, k as never, Number(e.target.value))} /></Field>
  );
  const save = async () => { setBusy(true); setErr(null); try { await dataService.updateSettings(s); aiService.clearCache(); toast.ok('Đã lưu cấu hình — mọi trạng thái được tính lại'); } catch (e) { setErr(e instanceof ValidationError ? e.message : (e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="grid gap-4">
      {err && <Alert tone="bad">{err}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="KPI (K1–K4, R1–R2)"><div className="grid gap-3 sm:grid-cols-2">{n('kpi', 'achievedPct', 'Ngưỡng Đạt (CR ≥ %)')}{n('kpi', 'attentionPct', 'Ngưỡng Cần chú ý (CR ≥ %)')}{n('kpi', 'atRiskDays', 'Cờ nguy cơ R1: còn ≤ ngày')}{n('kpi', 'decliningPeriods', 'Cờ nguy cơ R2: giảm ≥ kỳ')}{n('kpi', 'crCapPct', 'Trần CR (%)')}</div></Card>
        <Card title="Học phần (C1–C3)"><div className="grid gap-3 sm:grid-cols-2">{n('course', 'failRateAlertPct', 'C1: tỷ lệ chưa đạt > %')}{n('course', 'passDropAlertPts', 'C3: tỷ lệ đạt giảm ≥ điểm %')}{n('course', 'cloPassScore', 'Điểm đạt CLO (thang 10)', undefined, 0.5)}</div></Card>
        <Card title="Tải giảng"><div className="grid gap-3 sm:grid-cols-2">{n('workload', 'overloadRatio', 'Quá tải khi > (tỷ lệ định mức)', 'vd. 1,2 = 120%', 0.05)}{n('workload', 'underloadRatio', 'Thiếu giờ khi < (tỷ lệ)', 'vd. 0,8 = 80%', 0.05)}{n('workload', 'hoursPerCredit', 'Giờ chuẩn / tín chỉ')}</div></Card>
        <Card title="Minh chứng, công việc, AI"><div className="grid gap-3 sm:grid-cols-2">{n('evidence', 'expiringDays', 'E2: sắp hết hiệu lực trong (ngày)')}{n('task', 'dueSoonDays', 'Công việc sắp đến hạn (ngày)')}{n('ai', 'maxContextChars', 'Giới hạn dữ liệu gửi AI (ký tự)', 'Context Builder rút gọn khi vượt', 1000)}{n('ai', 'cacheMinutes', 'Cache kết quả AI (phút)')}
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="accent-[#1e3a5f]" checked={s.ai.includeStaffNames} onChange={e => set('ai', 'includeStaffNames', e.target.checked)} />Gửi họ tên giảng viên cho AI (tắt: chỉ gửi mã GV)</label></div></Card>
        <Card title="Thời gian tham chiếu" subtitle="Demo cố định “hôm nay” để số liệu ổn định. Production: ngày hệ thống.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ngày tham chiếu"><Input type="date" value={s.referenceDate} onChange={e => setS({ ...s, referenceDate: e.target.value })} /></Field>
            <Field label="Năm học hiện tại"><Select value={s.currentAcademicYearId} onChange={e => setS({ ...s, currentAcademicYearId: e.target.value })}>{A.d.academicYears.map(y => <option key={y.id} value={y.id}>{y.code}</option>)}</Select></Field>
            <Field label="Học kỳ hiện tại"><Select value={s.currentSemesterId} onChange={e => setS({ ...s, currentSemesterId: e.target.value })}>{A.d.semesters.map(x => <option key={x.id} value={x.id}>{x.code}</option>)}</Select></Field>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setS(structuredClone(A.settings))}>Hoàn tác</Button><Button variant="primary" icon={<Save className="size-4" />} loading={busy} onClick={save}>Lưu cấu hình</Button></div>
    </div>
  );
}

function Frameworks() {
  const { A } = useApp();
  const [fwId, setFwId] = useState(A.activeFramework()?.id ?? '');
  const [edit, setEdit] = useState<null | { kind: 'fw'; v: QaFramework } | { kind: 'std'; v: QaStandard } | { kind: 'crit'; v: QaCriterion }>(null);
  const [err, setErr] = useState<string | null>(null);
  const fw = A.get('qaFrameworks', fwId);
  const stds = A.d.qaStandards.filter(s => s.frameworkId === fwId).sort((a, b) => a.order - b.order);
  const save = async () => {
    if (!edit) return; setErr(null);
    try {
      if (edit.kind === 'fw') { await dataService.upsertFramework(edit.v); setFwId(edit.v.id); }
      if (edit.kind === 'std') await dataService.upsertStandard(edit.v);
      if (edit.kind === 'crit') await dataService.upsertCriterion(edit.v);
      toast.ok('Đã lưu'); setEdit(null);
    } catch (e) { setErr((e as Error).message); }
  };
  const newFw = (): QaFramework => ({ id: dataService.newId('fw'), code: '', name: '', version: '1.0', type: 'Chương trình đào tạo', levels: ['Đạt', 'Chưa đạt'], active: false, note: '' });
  return (
    <div className="grid gap-4">
      <Alert tone="info" title="Không hard-code tiêu chuẩn kiểm định">Quản trị/BĐCL thêm bộ tiêu chuẩn (tên, phiên bản, loại), tiêu chuẩn và tiêu chí; mỗi tiêu chí khai báo số minh chứng yêu cầu. Dữ liệu mẫu “BTC-MAU-CTĐT” chỉ để minh hoạ.</Alert>
      <Card title="Bộ tiêu chuẩn" actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ kind: 'fw', v: newFw() })}>Thêm bộ tiêu chuẩn</Button>}>
        <ul className="grid gap-2 md:grid-cols-2">{A.d.qaFrameworks.map(f => (
          <li key={f.id} className={cx('rounded-lg border p-3', f.id === fwId ? 'border-navy-500 bg-navy-50/40' : 'border-line')}>
            <div className="flex flex-wrap items-start justify-between gap-2"><button type="button" className="min-w-0 text-left" onClick={() => setFwId(f.id)}><p className="font-medium">{f.code} — {f.name}</p><p className="text-[12px] text-ink-2">Phiên bản {f.version} · {f.type}</p></button>{f.active ? <Badge tone="ok">Đang áp dụng</Badge> : <Button size="sm" onClick={() => void dataService.setActiveFramework(f.id).then(() => toast.ok('Đã đổi bộ tiêu chuẩn áp dụng'))}>Áp dụng</Button>}</div>
            {f.note && <p className="mt-1 text-[12px] text-warn">{f.note}</p>}
            <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'fw', v: { ...f } })}>Sửa</Button><Button size="sm" variant="ghost" onClick={() => setFwId(f.id)}>Xem tiêu chí</Button></div>
          </li>))}</ul>
      </Card>
      {fw && (
        <Card title={`Tiêu chuẩn & tiêu chí — ${fw.code}`} actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ kind: 'std', v: { id: dataService.newId('std'), frameworkId: fw.id, code: `TC${stds.length + 1}`, name: '', order: stds.length + 1 } })}>Thêm tiêu chuẩn</Button>}>
          {stds.length === 0 ? <EmptyState title="Chưa có tiêu chuẩn" /> : <div className="space-y-3">{stds.map(st => { const crits = A.d.qaCriteria.filter(c => c.standardId === st.id); return (
            <div key={st.id} className="rounded-lg border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-2"><p className="text-[13px] font-semibold">{st.code} · {st.name}</p><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'std', v: { ...st } })}>Sửa</Button><Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ kind: 'crit', v: { id: dataService.newId('crit'), standardId: st.id, code: `${st.code}.${crits.length + 1}`, content: '', requiredEvidence: 1 } })}>Tiêu chí</Button></div></div>
              <ul className="divide-y divide-[#eef1f5]">{crits.map(c => { const cv = A.criterionCoverage(c); return <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]"><span className="min-w-0 flex-1"><b className="font-semibold">{c.code}</b> {c.content}</span><span className="text-ink-2">yêu cầu {c.requiredEvidence} MC · hợp lệ {cv.valid}</span><Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'crit', v: { ...c } })}>Sửa</Button></li>; })}{crits.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-3">Chưa có tiêu chí</li>}</ul>
            </div>); })}</div>}
        </Card>
      )}
      <Modal open={!!edit} onClose={() => { setEdit(null); setErr(null); }} title={edit?.kind === 'fw' ? 'Bộ tiêu chuẩn' : edit?.kind === 'std' ? 'Tiêu chuẩn' : 'Tiêu chí'} footer={<><Button onClick={() => setEdit(null)}>Huỷ</Button><Button variant="primary" onClick={save}>Lưu</Button></>}>
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        {edit?.kind === 'fw' && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mã"><Input value={edit.v.code} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, code: e.target.value } })} /></Field>
          <Field label="Phiên bản"><Input value={edit.v.version} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, version: e.target.value } })} /></Field>
          <Field label="Tên bộ tiêu chuẩn" className="sm:col-span-2"><Input value={edit.v.name} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, name: e.target.value } })} /></Field>
          <Field label="Loại"><Input value={edit.v.type} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, type: e.target.value } })} placeholder="CTĐT / Cơ sở giáo dục / Nội bộ" /></Field>
          <Field label="Mức đánh giá (phân cách bằng dấu phẩy)"><Input value={edit.v.levels.join(', ')} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, levels: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } })} /></Field>
          <Field label="Ghi chú" className="sm:col-span-2"><Textarea rows={2} value={edit.v.note ?? ''} onChange={e => setEdit({ kind: 'fw', v: { ...edit.v, note: e.target.value } })} /></Field>
        </div>}
        {edit?.kind === 'std' && <div className="grid gap-3 sm:grid-cols-[120px_1fr_90px]">
          <Field label="Mã"><Input value={edit.v.code} onChange={e => setEdit({ kind: 'std', v: { ...edit.v, code: e.target.value } })} /></Field>
          <Field label="Tên tiêu chuẩn"><Input value={edit.v.name} onChange={e => setEdit({ kind: 'std', v: { ...edit.v, name: e.target.value } })} /></Field>
          <Field label="Thứ tự"><Input type="number" value={edit.v.order} onChange={e => setEdit({ kind: 'std', v: { ...edit.v, order: Number(e.target.value) } })} /></Field>
        </div>}
        {edit?.kind === 'crit' && <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <Field label="Mã"><Input value={edit.v.code} onChange={e => setEdit({ kind: 'crit', v: { ...edit.v, code: e.target.value } })} /></Field>
          <Field label="Số minh chứng yêu cầu"><Input type="number" min={1} max={20} value={edit.v.requiredEvidence} onChange={e => setEdit({ kind: 'crit', v: { ...edit.v, requiredEvidence: Number(e.target.value) } })} /></Field>
          <Field label="Nội dung tiêu chí" className="sm:col-span-2"><Textarea rows={3} value={edit.v.content} onChange={e => setEdit({ kind: 'crit', v: { ...edit.v, content: e.target.value } })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}

function AuditLog() {
  const { A, version } = useApp();
  const [rows, setRows] = useState<AuditEntry[] | null>(null); const [act, setAct] = useState('');
  useEffect(() => { void dataService.listAudit().then(setRows).catch(() => setRows([])); }, [version]);
  const cols: Column<AuditEntry>[] = [
    { key: 'at', header: 'Thời điểm', sort: r => r.at, render: r => <span className="whitespace-nowrap">{dateTime(r.at)}</span> },
    { key: 'user', header: 'Người dùng', render: r => <div>{A.userName(r.userId)}<div className="text-[11px] text-ink-3">{r.role ? ROLE_LABEL[r.role] : ''}</div></div> },
    { key: 'act', header: 'Thao tác', sort: r => r.action, render: r => <Badge tone={r.action.startsWith('ai') ? 'info' : r.action === 'data.reset' ? 'warn' : 'neutral'} icon={false}>{ACTION_LABEL[r.action] ?? r.action}</Badge> },
    { key: 'ent', header: 'Đối tượng', render: r => <code className="text-[11.5px]">{r.entity}{r.entityId ? `:${r.entityId}` : ''}</code>, hideBelow: 'md' },
    { key: 'det', header: 'Chi tiết', render: r => <span className="line-clamp-2 max-w-md break-all text-[11.5px] text-ink-2" title={JSON.stringify({ before: r.before, after: r.after })}>{r.after ? JSON.stringify(r.after) : ''}{r.note ? ` — ${r.note}` : ''}</span>, hideBelow: 'lg' },
  ];
  const filtered = (rows ?? []).filter(r => !act || r.action === act);
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><FileClock className="size-4" />Nhật ký hệ thống</span>} subtitle="Đăng nhập, cập nhật KPI/minh chứng/công việc, yêu cầu AI, duyệt/từ chối đề xuất AI, tạo/xuất báo cáo, đổi cấu hình. Demo lưu 500 bản ghi gần nhất trên trình duyệt; Production ghi ở server (append-only).">
      {!rows ? <p className="text-[13px] text-ink-2">Đang tải…</p> : <DataTable rows={filtered} columns={cols} rowKey={r => r.id} pageSize={15} search={r => `${A.userName(r.userId)} ${r.action} ${r.entity} ${JSON.stringify(r.after ?? '')}`} initialSort={{ key: 'at', dir: 'desc' }} empty="Chưa có bản ghi nhật ký"
        toolbar={<Select aria-label="Lọc thao tác" value={act} onChange={e => setAct(e.target.value)} className="w-auto"><option value="">Mọi thao tác</option>{Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>} />}
    </Card>
  );
}

function AiMonitor() {
  const { A } = useApp();
  const [h, setH] = useState<AiHealth | null>(null); const [logs, setLogs] = useState(aiService.logs());
  useEffect(() => { void aiService.health(true).then(setH); }, []);
  const ok = logs.filter(l => l.status === 'ok').length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Kết nối AI" actions={<Button size="sm" icon={<RefreshCcw className="size-3.5" />} onClick={() => void aiService.health(true).then(setH)}>Kiểm tra</Button>}>
        {!h ? <p className="text-[13px] text-ink-2">Đang kiểm tra…</p> : <div className="space-y-2 text-[13px]">
          <Badge tone={h.available ? 'ok' : 'warn'}>{h.available ? `Sẵn sàng (${h.provider})` : 'Chưa dùng Gemini'}</Badge>
          {h.model && <p>Model: <code>{h.model}</code></p>}{h.reason && <p className="text-ink-2">{h.reason}</p>}
          <p className="text-ink-2">Giới hạn dữ liệu gửi AI: {num(A.settings.ai.maxContextChars, 0)} ký tự · cache {A.settings.ai.cacheMinutes} phút</p>
        </div>}
        <Alert tone="info" className="mt-3" title="Cấu hình Gemini (Google AI Studio)">Settings → Secrets → thêm <code>GEMINI_API_KEY</code>. Khoá chỉ đọc ở server (<code>process.env</code>), không bao giờ gửi xuống trình duyệt.</Alert>
      </Card>
      <Card className="lg:col-span-2" title={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" />Nhật ký sử dụng AI</span>} subtitle={`${logs.length} lượt · ${ok} dùng AI · ${logs.length - ok} dự phòng bằng quy tắc`}
        actions={<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { aiService.clearCache(); toast.ok('Đã xoá cache AI'); setLogs(aiService.logs()); }}>Xoá cache</Button>}>
        {logs.length === 0 ? <EmptyState title="Chưa có lượt sử dụng AI" /> : (
          <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[640px] text-[12.5px]"><thead><tr className="border-b border-line text-left text-ink-2"><th className="py-1.5 font-medium">Thời điểm</th><th className="py-1.5 font-medium">Tác vụ</th><th className="py-1.5 font-medium">Nguồn</th><th className="py-1.5 text-right font-medium">Độ trễ</th><th className="py-1.5 text-right font-medium">Token</th><th className="py-1.5 text-right font-medium">Context</th><th className="py-1.5 font-medium">Kiểm tra</th></tr></thead>
            <tbody>{logs.slice(0, 30).map(l => <tr key={l.id} className="border-b border-[#eef1f5]"><td className="py-1.5 whitespace-nowrap">{dateTime(l.at)}</td><td className="py-1.5">{l.task}</td><td className="py-1.5">{l.provider}{l.model ? ` · ${l.model}` : ''}{l.error && <div className="max-w-56 truncate text-[11px] text-warn" title={l.error}>{l.error}</div>}</td><td className="py-1.5 text-right tabular-nums">{num(l.latencyMs, 0)} ms</td><td className="py-1.5 text-right tabular-nums">{l.tokens ?? '—'}</td><td className="py-1.5 text-right tabular-nums">{num(l.contextChars, 0)}</td><td className="py-1.5">{l.trust}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

function DataTab() {
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const src = dataService.repository.kind;
  const roles: Role[] = ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'LECTURER', 'QA', 'VIEWER'];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-1.5"><Database className="size-4" />Nguồn dữ liệu</span>}>
        <p className="text-[13px]">Đang dùng: <Badge tone={src === 'mock' ? 'warn' : 'ok'}>{src === 'mock' ? 'Demo — dữ liệu mẫu + thay đổi lưu trên trình duyệt' : 'API (REST)'}</Badge></p>
        <p className="mt-2 text-[12.5px] text-ink-2">Đổi bằng biến build <code>VITE_DATA_SOURCE</code> (mock | api). Kiến trúc: Component → dataService → Repository → (Mock | HTTP API → PostgreSQL). Có thể thêm repository cho Google Sheets, Excel, LMS, hệ thống quản lý đào tạo, hệ thống BĐCL mà không đổi giao diện.</p>
        <div className="mt-5 rounded-lg border border-[#f1c4c4] bg-bad-bg/40 p-3">
          <p className="text-[13px] font-medium text-bad">Khôi phục dữ liệu demo</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">Xoá mọi thay đổi (KPI nhập tay, công việc, minh chứng, cải tiến, cấu hình, nhật ký, cache AI) đã lưu trên trình duyệt này.</p>
          <Button className="mt-2" variant="danger" icon={<RefreshCcw className="size-4" />} onClick={() => setConfirm(true)}>Khôi phục</Button>
        </div>
      </Card>
      <Card title={<span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" />Ma trận phân quyền (RBAC)</span>} subtitle="Cấu hình trong authService; Production kiểm lại quyền ở API." bodyClass="p-0">
        <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[560px] text-[12px]"><thead><tr className="border-b border-line text-ink-2"><th className="px-3 py-2 text-left font-medium">Quyền</th>{roles.map(r => <th key={r} className="px-1.5 py-2 font-medium">{r}</th>)}</tr></thead>
          <tbody>{Object.entries(PERMISSIONS).map(([p, rs]) => <tr key={p} className="border-b border-[#eef1f5]"><td className="px-3 py-1.5"><code>{p}</code></td>{roles.map(r => <td key={r} className="px-1.5 py-1.5 text-center">{rs.includes(r) ? <span className="text-ok" aria-label="có">●</span> : <span className="text-[#cfd5de]" aria-label="không">○</span>}</td>)}</tr>)}</tbody></table></div>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Khôi phục dữ liệu demo?" footer={<><Button onClick={() => setConfirm(false)}>Huỷ</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); aiService.clearCache(); await dataService.resetDemo(); setBusy(false); setConfirm(false); toast.ok('Đã khôi phục dữ liệu demo'); }}>Khôi phục</Button></>}>
        <p className="text-[13px]">Mọi thay đổi trên trình duyệt này sẽ bị xoá và dữ liệu mẫu được nạp lại. Thao tác không thể hoàn tác.</p>
      </Modal>
      <p className="flex items-center gap-1 text-[12px] text-ink-3 lg:col-span-2"><Settings2 className="size-3.5" />Phiên bản dữ liệu mẫu: dữ liệu tổng hợp, sinh tất định (seed cố định), không phải dữ liệu thật.</p>
    </div>
  );
}
