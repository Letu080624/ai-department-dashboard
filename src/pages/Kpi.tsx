/* KPI — trạng thái do QUY TẮC (K0–K4, cờ R1–R2, cấu hình được); CR = Actual / Target × 100 */
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock, FileCheck2, Flag, Save, Search, Target, Wrench, XCircle } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, date, num, pct } from '../lib/format';
import { href, navigate } from '../lib/router';
import { kpiService, type KpiFilter } from '../services/kpiService';
import { ValidationError } from '../services/dataService';
import type { KpiView } from '../domain/analytics';
import { DataTable, type Column } from '../components/DataTable';
import { AXIS, CAT, ChartCard, GRID, TOOLTIP } from '../components/charts';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, KV, PageHeader, Progress, Select, StatCard, StatGrid, TrendIcon, toast } from '../components/ui';
import { ActionBadge, EvidenceBadge, KpiBadge, kpiTone } from '../components/status';

export default function Kpi({ id }: { id?: string }) { return id ? <KpiDetail id={id} /> : <KpiList />; }

function KpiList() {
  const { A } = useApp();
  const [filter, setFilter] = useState<KpiFilter>('all'); const [group, setGroup] = useState('');
  const c = kpiService.counts();
  const rows = kpiService.list(filter, group);
  const cols: Column<KpiView>[] = [
    { key: 'name', header: 'KPI', sort: k => k.def.code, render: k => <div className="min-w-52 max-w-80"><p className="whitespace-nowrap font-semibold text-navy-700">{k.def.code}</p><p className="text-[12px] leading-snug text-ink-2">{k.def.name}</p></div> },
    { key: 'target', header: 'Target', align: 'right', sort: k => k.def.target, render: k => num(k.def.target, 2) },
    { key: 'actual', header: 'Actual', align: 'right', sort: k => k.ev.value, render: k => <div className="whitespace-nowrap"><span className="font-semibold">{num(k.ev.value, 2)}</span><div className="text-[11px] text-ink-3">{k.periodLabel}</div></div> },
    { key: 'unit', header: 'Đơn vị', render: k => k.def.unit, hideBelow: 'md' },
    { key: 'cr', header: 'Completion', sort: k => k.ev.cr, render: k => <div className="flex min-w-28 items-center gap-2"><Progress value={k.ev.cr} max={120} tone={kpiTone(k.ev.status) === 'ok' ? 'ok' : kpiTone(k.ev.status) === 'warn' ? 'warn' : kpiTone(k.ev.status) === 'neutral' ? 'neutral' : 'bad'} label="Mức đạt" /><span className="w-12 text-right text-[12px] tabular-nums">{pct(k.ev.cr)}</span></div> },
    { key: 'deadline', header: 'Deadline', sort: k => k.def.deadline, render: k => <div className="whitespace-nowrap"><span>{date(k.def.deadline)}</span>{k.ev.status !== 'achieved' && <div className={cx('text-[11px]', k.ev.daysLeft < 0 ? 'text-bad' : 'text-ink-3')}>{k.ev.daysLeft < 0 ? `quá ${-k.ev.daysLeft} ngày` : `còn ${k.ev.daysLeft} ngày`}</div>}</div> },
    { key: 'owner', header: 'Owner', sort: k => k.owner?.fullName ?? '', render: k => <span className="whitespace-nowrap">{k.owner?.fullName ?? '—'}</span>, hideBelow: 'lg' },
    { key: 'status', header: 'Status', sort: k => ['overdue', 'not_achieved', 'attention', 'no_data', 'achieved'].indexOf(k.ev.status), render: k => <div className="flex flex-col items-start gap-1"><KpiBadge s={k.ev.status} rule={k.ev.rule} />{k.ev.atRisk && <Badge tone="risk" icon={false} title={k.ev.riskReasons.join('\n')}><Flag className="size-3" />Nguy cơ</Badge>}</div> },
    { key: 'trend', header: 'Trend', align: 'center', render: k => <span title={k.ev.change !== null ? `Thay đổi ${num(k.ev.change)} so kỳ trước` : 'Chưa có kỳ trước'}><TrendIcon trend={k.ev.trend} /></span> },
  ];
  const card = (f: KpiFilter, label: string, v: number, icon: React.ReactNode, tone: 'ok' | 'warn' | 'bad' | 'risk' | 'neutral') => (
    <StatCard label={label} value={v} icon={icon} tone={tone} onClick={() => setFilter(filter === f ? 'all' : f)} active={filter === f} sub={filter === f ? 'Đang lọc · bấm để bỏ' : `${pct(c.total ? v / c.total * 100 : null, 0)} tổng KPI`} />
  );
  return (
    <>
      <PageHeader title="KPI" subtitle={`${c.total} KPI · Completion Rate = Actual / Target × 100% (KPI “càng thấp càng tốt”: Target / Actual). Trạng thái do quy tắc hệ thống, cấu hình ở Quản trị.`} />
      <StatGrid cols={6}>
        <StatCard label="Tỷ lệ KPI đạt" value={pct(c.completionRate)} icon={<Target className="size-4" />} sub={`${c.achieved}/${c.total} KPI đạt`} foot={<Progress value={c.completionRate} tone="ok" label="Tỷ lệ KPI đạt" />} />
        {card('achieved', 'Đạt', c.achieved, <CheckCircle2 className="size-4" />, 'ok')}
        {card('attention', 'Cần chú ý', c.attention, <AlertTriangle className="size-4" />, 'warn')}
        {card('not_achieved', 'Không đạt', c.notAchieved, <XCircle className="size-4" />, 'bad')}
        {card('overdue', 'Quá hạn', c.overdue, <Clock className="size-4" />, 'risk')}
        {card('at_risk', 'Có nguy cơ', c.atRisk, <Flag className="size-4" />, 'risk')}
      </StatGrid>
      <Card id="demo-kpi-table" className="mt-5">
        <DataTable rows={rows} columns={cols} rowKey={k => k.def.id} onRowClick={k => navigate(`kpi/${k.def.id}`)} pageSize={15} search={k => `${k.def.code} ${k.def.name} ${k.owner?.fullName ?? ''}`} searchPlaceholder="Tìm mã, tên KPI, người phụ trách…"
          empty="Không có KPI phù hợp bộ lọc"
          toolbar={<>
            <Select aria-label="Trạng thái" value={filter} onChange={e => setFilter(e.target.value as KpiFilter)} className="w-auto"><option value="all">Mọi trạng thái</option><option value="achieved">Đạt</option><option value="attention">Cần chú ý</option><option value="not_achieved">Không đạt</option><option value="overdue">Quá hạn</option><option value="no_data">Thiếu dữ liệu</option><option value="at_risk">Có nguy cơ</option></Select>
            <Select aria-label="Nhóm" value={group} onChange={e => setGroup(e.target.value)} className="w-auto"><option value="">Mọi nhóm</option>{kpiService.groups().map(g => <option key={g}>{g}</option>)}</Select>
          </>} />
      </Card>
      <Card className="mt-5" title="Quy tắc xác định trạng thái (đang áp dụng)" subtitle={`Áp dụng theo thứ tự; quy tắc đầu tiên khớp được dùng. Cờ nguy cơ không đổi trạng thái. Ngày tham chiếu ${date(A.ref)}.`}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{kpiService.rulesText().map(([code, label, desc]) => <div key={code} className="rounded-lg border border-line px-3 py-2"><p className="text-[12.5px]"><b className="mr-1.5 font-semibold text-navy-700">{code}</b>{label}</p><p className="text-[12px] text-ink-2">{desc}</p></div>)}</div>
      </Card>
    </>
  );
}

function KpiDetail({ id }: { id: string }) {
  const { A, can } = useApp();
  const def = A.get('kpis', id);
  const [period, setPeriod] = useState(A.currentSemester.id); const [val, setVal] = useState(''); const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!def) return <Card><EmptyState title="Không tìm thấy KPI" action={<Button onClick={() => navigate('kpi')}>Về danh sách KPI</Button>} /></Card>;
  const k = kpiService.get(id); const ev = k.ev; const chain = kpiService.chain(id); const cfg = A.settings.kpi;
  const manual = def.source.type === 'manual';
  const save = async () => {
    setErr(null); setBusy(true);
    try { await kpiService.saveEntry(id, period, Number(val.replace(',', '.')), note); toast.ok('Đã lưu kết quả KPI — trạng thái được tính lại theo quy tắc'); setVal(''); setNote(''); }
    catch (e) { setErr(e instanceof ValidationError ? e.message : (e as Error).message); } finally { setBusy(false); }
  };
  const chartData = k.series.map(p => ({ label: p.label, value: p.value }));
  const step = (icon: React.ReactNode, title: string, n: number, ok: boolean) => <div className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2', ok ? 'border-[#bfe3cb] bg-ok-bg/50' : 'border-[#f0dca4] bg-warn-bg/60')}>{icon}<div className="min-w-0"><p className="text-[12.5px] font-medium">{title}</p><p className="text-[11.5px] text-ink-2">{n} mục</p></div></div>;

  return (
    <>
      <PageHeader crumbs={[{ label: 'KPI', href: href('kpi') }, { label: def.code }]} title={`${def.code} · ${def.name}`} subtitle={`${def.group} · Phụ trách: ${k.owner?.fullName ?? '—'} · Hạn ${date(def.deadline)}`}
        actions={<div className="flex items-center gap-2"><KpiBadge s={ev.status} rule={ev.rule} />{ev.atRisk && <Badge tone="risk"><Flag className="size-3" />Có nguy cơ</Badge>}</div>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Đánh giá theo quy tắc">
          <div className="flex items-end gap-3"><p className="text-3xl font-semibold tabular-nums">{num(ev.value, 2)}<span className="ml-1 text-base font-normal text-ink-2">{def.unit}</span></p><p className="pb-1 text-[13px] text-ink-2">/ mục tiêu {num(def.target, 2)} {def.unit}</p></div>
          <div className="mt-3 flex items-center gap-2"><Progress value={ev.cr} max={120} tone={kpiTone(ev.status) === 'ok' ? 'ok' : kpiTone(ev.status) === 'warn' ? 'warn' : 'bad'} label="CR" /><span className="text-[13px] font-medium tabular-nums">{pct(ev.cr)}</span></div>
          <div className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[12.5px]">
            <p><b className="font-semibold">Công thức:</b> CR = {def.direction === 'lower_better' ? 'Target / Actual' : 'Actual / Target'} × 100 = {def.direction === 'lower_better' ? `${num(def.target, 2)} / ${num(ev.value, 2)}` : `${num(ev.value, 2)} / ${num(def.target, 2)}`} × 100 = <b>{pct(ev.cr)}</b> (trần {cfg.crCapPct}%)</p>
            <p className="mt-1"><b className="font-semibold">Quy tắc {ev.rule}:</b> {ev.reason}</p>
            {ev.riskReasons.map(r => <p key={r} className="mt-1 text-risk">{r}</p>)}
            <p className="mt-1 text-ink-2">Xu hướng: <TrendIcon trend={ev.trend} className="align-middle" /> {ev.change !== null ? `${ev.change > 0 ? '+' : ''}${num(ev.change)} so kỳ trước` : 'chưa có kỳ trước'}{ev.declineStreak ? ` · giảm ${ev.declineStreak} kỳ liên tiếp` : ''}</p>
          </div>
          <KV cols={2} items={[{ label: 'Chiều tốt', value: def.direction === 'higher_better' ? 'Càng cao càng tốt' : 'Càng thấp càng tốt' }, { label: 'Nguồn số liệu', value: manual ? 'Nhập tay theo kỳ' : <code className="text-[12px]">{(def.source as { metric: string }).metric}</code> }, { label: 'Kỳ đo gần nhất', value: k.periodLabel }, { label: 'Thời hạn', value: `${date(def.deadline)} (${ev.daysLeft < 0 ? `quá ${-ev.daysLeft} ngày` : `còn ${ev.daysLeft} ngày`})` }]} />
          {def.note && <p className="mt-3 text-[12px] text-ink-2">Ghi chú: {def.note}</p>}
        </Card>
        <ChartCard id="demo-kpi-trend" className="lg:col-span-2" title="Giá trị theo kỳ" question="KPI đang tiến tới hay xa dần mục tiêu?" table={{ columns: ['Kỳ', 'Giá trị', 'Mục tiêu'], rows: k.series.map(p => [p.label, num(p.value, 2), num(def.target, 2)]) }}>
          {chartData.length < 2 && <p className="mb-1 text-[12px] text-ink-3">Chỉ có số liệu {chartData.length} kỳ — chưa đánh giá được xu hướng.</p>}
          <ResponsiveContainer height={chartData.length < 2 ? '90%' : '100%'}><LineChart data={chartData} margin={{ left: -8, right: 24, top: 16 }}><CartesianGrid {...GRID} /><XAxis dataKey="label" padding={{ left: 24, right: 24 }} {...AXIS} /><YAxis {...AXIS} width={52} domain={['auto', 'auto']} />
            <Tooltip {...TOOLTIP} cursor={{ stroke: '#cfd5de' }} formatter={v => [`${num(v as number, 2)} ${def.unit}`, 'Giá trị']} />
            <ReferenceLine y={def.target} stroke="#1e3a5f" strokeDasharray="4 3" label={{ value: `Mục tiêu ${num(def.target, 2)}`, position: 'insideTopRight', fill: '#1e3a5f', fontSize: 11 }} />
            <Line animationDuration={450} dataKey="value" stroke={CAT[0]} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls /></LineChart></ResponsiveContainer>
        </ChartCard>
      </div>

      {manual && (
        <Card className="mt-5" title="Nhập kết quả KPI (nhập tay)" subtitle="Giá trị được kiểm tra hợp lệ, ghi nhật ký; trạng thái tự tính lại theo quy tắc.">
          {can('kpi.entry') ? (
            <div className="grid items-end gap-3 sm:grid-cols-[180px_160px_1fr_auto]">
              <Field label="Kỳ"><Select value={period} onChange={e => setPeriod(e.target.value)}>{A.d.semesters.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>
              <Field label={`Giá trị (${def.unit})`} error={err}><Input inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="vd. 86,5" /></Field>
              <Field label="Ghi chú / nguồn"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="vd. Khảo sát người học HK2" maxLength={300} /></Field>
              <Button variant="primary" icon={<Save className="size-4" />} loading={busy} disabled={!val.trim()} onClick={save}>Lưu</Button>
            </div>
          ) : <Alert tone="info">Vai trò hiện tại không được nhập kết quả KPI.</Alert>}
          <ul className="mt-3 divide-y divide-[#eef1f5] text-[12.5px]">{A.d.kpiEntries.filter(e => e.kpiId === id).map(e => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{A.get('semesters', e.periodId)?.code ?? e.periodId}: <b>{num(e.value, 2)}</b> {def.unit}{e.note ? <span className="text-ink-2"> — {e.note}</span> : ''}</span><span className="text-ink-3">{A.userName(e.enteredBy)} · {date(e.enteredAt.slice(0, 10))}</span></li>)}</ul>
        </Card>
      )}

      <Card className="mt-5" title="Chuỗi chất lượng: KPI → Minh chứng → Phát hiện → Cải tiến → Kết quả" subtitle={chain.state === 'broken' ? 'Chuỗi bị đứt — xem các khoảng trống bên dưới.' : chain.state === 'open' ? 'Chuỗi đang mở (có hành động cải tiến đang thực hiện).' : 'Chuỗi khép kín.'}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {step(<Target className="size-4 text-navy-700" />, def.code, 1, ev.status === 'achieved')}<ArrowRight className="hidden size-4 shrink-0 text-ink-3 md:block" />
          {step(<FileCheck2 className="size-4 text-navy-700" />, 'Minh chứng', chain.evidence.length, chain.evidence.some(e => e.status === 'complete'))}<ArrowRight className="hidden size-4 shrink-0 text-ink-3 md:block" />
          {step(<Search className="size-4 text-navy-700" />, 'Phát hiện', chain.findings.length, chain.findings.length > 0 || ev.status === 'achieved')}<ArrowRight className="hidden size-4 shrink-0 text-ink-3 md:block" />
          {step(<Wrench className="size-4 text-navy-700" />, 'Cải tiến', chain.actions.length, chain.actions.length > 0 || ev.status === 'achieved')}<ArrowRight className="hidden size-4 shrink-0 text-ink-3 md:block" />
          {step(<CircleDashed className="size-4 text-navy-700" />, 'Kết quả', chain.actions.filter(a => a.result.effective !== null).length, chain.actions.some(a => a.result.effective))}
        </div>
        {chain.gaps.length > 0 && <Alert tone="warn" className="mt-3" title="Khoảng trống trong chuỗi">{chain.gaps.join(' · ')}</Alert>}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div><h4 className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Minh chứng</h4>{chain.evidence.length ? <ul className="space-y-1.5">{chain.evidence.map(x => <li key={x.e.id}><a href={href(`evidence/${x.e.id}`)} className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] hover:bg-navy-50/50"><span className="min-w-0 truncate">{x.e.code} · {x.e.name}</span><EvidenceBadge s={x.status} /></a></li>)}</ul> : <p className="text-[12.5px] text-ink-3">Chưa gắn minh chứng.</p>}</div>
          <div><h4 className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Phát hiện</h4>{chain.findings.length ? <ul className="space-y-1.5">{chain.findings.map(f => <li key={f.id} className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px]"><Badge tone={f.type === 'strength' ? 'ok' : 'warn'} icon={false}>{f.type === 'strength' ? 'Điểm mạnh' : 'Điểm yếu'}</Badge> {f.statement} <span className="text-ink-3">({date(f.date)})</span></li>)}</ul> : <p className="text-[12.5px] text-ink-3">Chưa có phát hiện.</p>}</div>
          <div><h4 className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Hành động cải tiến & kết quả</h4>{chain.actions.length ? <ul className="space-y-1.5">{chain.actions.map(x => <li key={x.a.id} className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px]"><div className="flex flex-wrap items-center justify-between gap-1"><b className="font-medium">{x.a.code}</b><ActionBadge s={x.status} /></div><p>{x.a.title}</p><p className="text-ink-2">Kết quả: <span className={x.result.effective === true ? 'text-ok' : x.result.effective === false ? 'text-bad' : ''}>{x.result.label}</span>{x.result.before && ` · trước ${num(x.result.before.value, 2)} (${x.result.before.label})`}{x.result.after && ` → sau ${num(x.result.after.value, 2)} (${x.result.after.label})`}</p></li>)}</ul> : <p className="text-[12.5px] text-ink-3">Chưa có hành động.</p>}</div>
        </div>
      </Card>
    </>
  );
}
