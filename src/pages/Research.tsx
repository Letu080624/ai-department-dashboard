/* NGHIÊN CỨU KHOA HỌC — đề tài, bài báo, hội thảo, sản phẩm, tiến độ; biểu đồ theo năm; AI Research Summary */
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookMarked, FlaskConical, Mic, Package, Sparkles } from 'lucide-react';
import { useApp } from '../lib/app';
import { date, pct } from '../lib/format';
import { AXIS, CAT, ChartCard, GRID, Legend, TOOLTIP } from '../components/charts';
import { DataTable, type Column } from '../components/DataTable';
import { AiLoading, Alert, Badge, Button, Card, PageHeader, Progress, Select, StatCard } from '../components/ui';
import { AiResultView } from '../components/ai/AiResult';
import { useAiRun } from '../components/ai/useAiRun';
import type { ResearchOutput, ResearchOutputType } from '../types/domain';

const TYPE: Record<ResearchOutputType, string> = { journal_article: 'Bài báo tạp chí', conference_paper: 'Báo cáo hội thảo', book: 'Sách', product: 'Sản phẩm' };
const PST = { in_progress: ['Đang thực hiện', 'info'], accepted: ['Đã nghiệm thu', 'ok'], overdue_report: ['Chậm báo cáo', 'bad'] } as const;

export default function Research() {
  const { A, can } = useApp();
  const [type, setType] = useState<ResearchOutputType | ''>(''); const [year, setYear] = useState('');
  const ai = useAiRun('research_summary');
  const by = A.researchByYear(); const cur = by.find(y => y.year.id === A.currentYear.id)!; const prev = by.find(y => y.year.endDate < A.currentYear.startDate);
  const projects = A.projectRows();
  const outputs = A.d.researchOutputs.filter(o => (!type || o.type === type) && (!year || o.academicYearId === year));
  const delta = (a: number, b?: number) => (b === undefined ? null : a - b);
  const sub = (a: number, b?: number) => { const d = delta(a, b); return d === null ? undefined : d === 0 ? <span className="text-ink-2">= không đổi so {prev!.year.code}</span> : <span className={d > 0 ? 'text-ok' : 'text-bad'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)} so {prev!.year.code}</span>; };
  const cols: Column<ResearchOutput>[] = [
    { key: 'type', header: 'Loại', sort: o => o.type, render: o => <Badge tone="neutral" icon={false}>{TYPE[o.type]}</Badge> },
    { key: 'title', header: 'Tên sản phẩm', sort: o => o.title, render: o => <div><p className="font-medium">{o.title}</p><p className="text-[11.5px] text-ink-3">{o.venue}</p></div> },
    { key: 'auth', header: 'Tác giả (Bộ môn)', render: o => o.authorIds.map(a => A.get('lecturers', a)?.code).join(', '), hideBelow: 'md' },
    { key: 'idx', header: 'Chỉ mục', render: o => o.indexed ?? '—', hideBelow: 'lg' },
    { key: 'date', header: 'Ngày', sort: o => o.publishedDate, render: o => <span className="whitespace-nowrap">{date(o.publishedDate)}</span> },
    { key: 'y', header: 'Năm học', sort: o => o.academicYearId, render: o => <span className="whitespace-nowrap">{A.get('academicYears', o.academicYearId)?.code}</span>, hideBelow: 'md' },
  ];
  return (
    <>
      <PageHeader title="Nghiên cứu khoa học" subtitle={`Sản phẩm theo năm học; tiến độ đề tài so với thời gian đã trôi qua (đến ${date(A.ref)}).`}
        actions={can('ai.use') && <Button variant="primary" icon={<Sparkles className="size-4" />} loading={ai.loading} onClick={() => void ai.run(!!ai.result)}>{ai.result ? 'Tóm tắt lại' : 'AI Research Summary'}</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Đề tài" value={projects.length} icon={<FlaskConical className="size-4" />} sub={`${projects.filter(p => p.p.status === 'in_progress').length} đang thực hiện · ${projects.filter(p => p.p.status === 'overdue_report').length} chậm báo cáo`} />
        <StatCard label={`Bài báo ${A.currentYear.code}`} value={cur.journal} icon={<BookMarked className="size-4" />} sub={sub(cur.journal, prev?.journal)} />
        <StatCard label={`Hội thảo ${A.currentYear.code}`} value={cur.conference} icon={<Mic className="size-4" />} sub={sub(cur.conference, prev?.conference)} />
        <StatCard label={`Sách + sản phẩm ${A.currentYear.code}`} value={cur.book + cur.product} icon={<Package className="size-4" />} sub={sub(cur.book + cur.product, prev ? prev.book + prev.product : undefined)} />
      </div>
      {(ai.result || ai.loading || ai.error) && (
        <Card className="mt-5 border-navy-200" title={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-4 text-navy-500" />AI Research Summary</span>}>
          {ai.error && <Alert tone="bad">{ai.error}</Alert>}{ai.loading && <AiLoading label="AI đang tóm tắt dữ liệu NCKH…" />}{ai.result && !ai.loading && <AiResultView r={ai.result} />}
        </Card>
      )}
      <div className="mt-5 grid items-start gap-4 xl:grid-cols-5">
        <ChartCard className="xl:col-span-2" title="Research output by year" question="Sản phẩm khoa học tăng hay giảm theo năm, theo loại?" table={{ columns: ['Năm học', 'Bài báo', 'Hội thảo', 'Sách', 'Sản phẩm', 'Tổng'], rows: by.map(y => [y.year.code, y.journal, y.conference, y.book, y.product, y.total]) }}>
          <Legend items={[{ label: TYPE.journal_article, color: CAT[0] }, { label: TYPE.conference_paper, color: CAT[1] }, { label: TYPE.book, color: CAT[2] }, { label: TYPE.product, color: CAT[3] }]} />
          <ResponsiveContainer height="86%"><BarChart data={by.map(y => ({ ...y, code: y.year.code }))} margin={{ left: -16, right: 8, top: 8 }} barSize={48}><CartesianGrid {...GRID} /><XAxis dataKey="code" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip {...TOOLTIP} />
            <Bar animationDuration={450} dataKey="journal" name={TYPE.journal_article} stackId="r" fill={CAT[0]} stroke="#fff" /><Bar animationDuration={450} dataKey="conference" name={TYPE.conference_paper} stackId="r" fill={CAT[1]} stroke="#fff" /><Bar animationDuration={450} dataKey="book" name={TYPE.book} stackId="r" fill={CAT[2]} stroke="#fff" /><Bar animationDuration={450} dataKey="product" name={TYPE.product} stackId="r" fill={CAT[3]} stroke="#fff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <Card className="xl:col-span-3" title="Tiến độ đề tài" subtitle="Chênh lệch = tiến độ khối lượng − tiến độ thời gian; âm nhiều là dấu hiệu chậm." bodyClass="p-0">
          <ul className="divide-y divide-[#eef1f5]">{projects.map(r => (
            <li key={r.p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium">{r.p.code} · {r.p.title}</p><p className="text-[12px] text-ink-2">{r.p.level} · Chủ nhiệm {r.principal?.fullName} · {date(r.p.startDate)}–{date(r.p.endDate)}</p></div><Badge tone={PST[r.p.status][1]}>{PST[r.p.status][0]}</Badge></div>
              <div className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                <div className="flex items-center gap-2"><span className="w-[72px] shrink-0 whitespace-nowrap text-ink-2">Khối lượng</span><Progress value={r.p.progressPct} tone={r.gap < -15 && r.p.status !== 'accepted' ? 'bad' : 'navy'} label="Tiến độ khối lượng" /><span className="w-10 shrink-0 text-right font-medium tabular-nums">{r.p.progressPct}%</span></div>
                <div className="flex items-center gap-2"><span className="w-[72px] shrink-0 whitespace-nowrap text-ink-2">Thời gian</span><Progress value={r.timePct} tone="neutral" label="Thời gian đã qua" /><span className="w-10 shrink-0 text-right tabular-nums">{pct(r.timePct, 0)}</span></div>
              </div>
              {r.gap < -15 && r.p.status !== 'accepted' && <p className="mt-1 text-[12px] text-bad">Chậm {Math.abs(Math.round(r.gap))} điểm % so với thời gian.</p>}
            </li>))}</ul>
        </Card>
      </div>
      <Card className="mt-5" title="Sản phẩm khoa học">
        <DataTable rows={outputs} columns={cols} rowKey={o => o.id} search={o => `${o.title} ${o.venue} ${o.authorIds.map(a => A.lecturerName(a)).join(' ')}`} initialSort={{ key: 'date', dir: 'desc' }}
          toolbar={<>
            <Select aria-label="Loại" value={type} onChange={e => setType(e.target.value as ResearchOutputType | '')} className="w-auto"><option value="">Mọi loại</option>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select aria-label="Năm học" value={year} onChange={e => setYear(e.target.value)} className="w-auto"><option value="">Mọi năm học</option>{A.d.academicYears.map(y => <option key={y.id} value={y.id}>{y.code}</option>)}</Select>
          </>} />
      </Card>
    </>
  );
}
