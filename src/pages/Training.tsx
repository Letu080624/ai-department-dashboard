/* ĐÀO TẠO — số liệu học kỳ, biểu đồ theo học phần, xu hướng, tiến độ giảng dạy, học phần cần chú ý (quy tắc C1–C3) */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BookOpen, CheckCircle2, Layers, Percent, Sigma, Users, XCircle } from 'lucide-react';
import { useApp } from '../lib/app';
import { num, pct } from '../lib/format';
import { href } from '../lib/router';
import { AXIS, CAT, ChartCard, GRID, Legend, STATUS_COLOR, TOOLTIP } from '../components/charts';
import { Badge, Card, EmptyState, PageHeader, Progress, Select, StatCard } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { SectionResult } from '../domain/analytics';

export default function Training() {
  const { A } = useApp();
  const graded = A.gradedSemesters();
  const [semId, setSemId] = useState(A.currentSemester.id);
  const sem = A.get('semesters', semId)!;
  const r = A.semesterResults(semId);
  const sections = A.sectionsOf([semId]).map(s => A.sectionResult(s.id));
  const students = new Set(A.d.enrollments.filter(e => sections.some(s => s.section.id === e.sectionId)).map(e => e.studentId)).size;
  const courses = new Set(sections.map(s => s.course.id)).size;
  const cfg = A.settings.course;

  const byCourse = useMemo(() => {
    const m = new Map<string, SectionResult[]>(); sections.forEach(s => m.set(s.course.code, [...(m.get(s.course.code) ?? []), s]));
    return [...m.entries()].map(([code, ss]) => { const ag = A.aggregate(ss.map(x => x.section.id)); return { code, name: ss[0].course.name, avg: ag.avgScore, pass: ag.passRate, fail: ag.passRate === null ? null : Math.round((100 - ag.passRate) * 10) / 10 }; }).sort((a, b) => (a.pass ?? 0) - (b.pass ?? 0));
  }, [A, semId]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = graded.map(s => { const x = A.semesterResults(s.id); return { sem: s.code, avg: x.avgScore, pass: x.passRate }; });
  const attention = A.courses().filter(c => c.attention.length);

  const cols: Column<SectionResult>[] = [
    { key: 'code', header: 'Lớp HP', sort: x => x.section.code, render: x => <span className="whitespace-nowrap font-medium">{x.section.code}</span> },
    { key: 'course', header: 'Học phần', sort: x => x.course.code, render: x => <a href={href(`courses/${x.course.id}`)} className="text-navy-700 hover:underline">{x.course.code} · {x.course.name}</a> },
    { key: 'lec', header: 'Giảng viên', render: x => <span className="whitespace-nowrap">{x.lecturer?.fullName ?? '—'}</span>, hideBelow: 'md' },
    { key: 'class', header: 'Lớp', render: x => <span className="whitespace-nowrap">{x.section.className}</span>, hideBelow: 'lg' },
    { key: 'reg', header: 'Sĩ số', align: 'right', sort: x => x.registered, render: x => x.registered },
    { key: 'avg', header: 'Điểm TB', align: 'right', sort: x => x.avgScore, render: x => num(x.avgScore, 2) },
    { key: 'pass', header: 'Tỷ lệ đạt', align: 'right', sort: x => x.passRate, render: x => <span className={x.failRate !== null && x.failRate > cfg.failRateAlertPct ? 'font-medium text-bad' : ''}>{pct(x.passRate)}</span> },
    { key: 'prog', header: 'Tiến độ giảng dạy', sort: x => x.progressPct, render: x => <div className="flex min-w-28 items-center gap-2"><Progress value={x.progressPct} tone={x.progressPct >= 100 ? 'ok' : 'navy'} label="Tiến độ" /><span className="w-12 text-right text-[12px] tabular-nums">{pct(x.progressPct, 0)}</span></div> },
  ];

  return (
    <>
      <PageHeader title="Đào tạo" subtitle="Tỷ lệ đạt = số đạt / số đăng ký (vắng thi tính chưa đạt). Học phần cần chú ý theo quy tắc C1–C3, ngưỡng cấu hình ở Quản trị."
        actions={<Select aria-label="Chọn học kỳ" value={semId} onChange={e => setSemId(e.target.value)} className="w-auto">{A.d.semesters.filter(s => A.sectionsOf([s.id]).length).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>} />
      {!graded.some(g => g.id === semId) && <p className="mb-3 text-[12.5px] text-warn">Học kỳ chưa kết thúc — kết quả có thể chưa đầy đủ.</p>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Lớp học phần" value={sections.length} icon={<Layers className="size-4" />} sub={sem.code} />
        <StatCard label="Học phần" value={courses} icon={<BookOpen className="size-4" />} />
        <StatCard label="Người học" value={num(students, 0)} icon={<Users className="size-4" />} sub={`${num(r.registered, 0)} lượt đăng ký`} />
        <StatCard label="Điểm trung bình" value={num(r.avgScore, 2)} icon={<Sigma className="size-4" />} sub="thang 10, người dự thi" />
        <StatCard label="Tỷ lệ đạt" value={pct(r.passRate)} icon={<CheckCircle2 className="size-4" />} tone="ok" sub={`${num(r.passed, 0)} lượt đạt`} />
        <StatCard label="Tỷ lệ chưa đạt" value={pct(r.passRate === null ? null : 100 - r.passRate)} icon={<XCircle className="size-4" />} tone={r.passRate !== null && 100 - r.passRate > cfg.failRateAlertPct ? 'bad' : 'neutral'} sub={`ngưỡng cảnh báo ${cfg.failRateAlertPct}%/lớp`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Điểm trung bình theo học phần" question={`Học phần nào có điểm trung bình thấp nhất trong ${sem.code}? (đường nét đứt: mốc 5,0)`} table={{ columns: ['Học phần', 'Tên', 'Điểm TB'], rows: byCourse.map(c => [c.code, c.name, num(c.avg, 2)]) }}>
          <ResponsiveContainer><BarChart data={byCourse} margin={{ left: -16, right: 8, top: 8 }} barSize={28}><CartesianGrid {...GRID} /><XAxis dataKey="code" {...AXIS} /><YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} {...AXIS} width={40} />
            <Tooltip {...TOOLTIP} formatter={v => [num(v as number, 2), 'Điểm TB']} labelFormatter={(l, p) => `${l} — ${(p?.[0]?.payload as { name?: string })?.name ?? ''}`} />
            <ReferenceLine y={5} stroke="#a3acb9" strokeDasharray="4 3" />
            <Bar animationDuration={450} dataKey="avg" fill={CAT[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tỷ lệ đạt theo học phần" question={`Học phần nào có tỷ lệ chưa đạt vượt ngưỡng ${cfg.failRateAlertPct}%?`} table={{ columns: ['Học phần', 'Tỷ lệ đạt', 'Chưa đạt'], rows: byCourse.map(c => [c.code, pct(c.pass), pct(c.fail)]) }}>
          <Legend items={[{ label: 'Trong ngưỡng', color: CAT[0] }, { label: `Chưa đạt > ${cfg.failRateAlertPct}%`, color: STATUS_COLOR.bad }]} />
          <ResponsiveContainer height="90%"><BarChart data={byCourse} margin={{ left: -8, right: 8, top: 8 }} barSize={28}><CartesianGrid {...GRID} /><XAxis dataKey="code" {...AXIS} /><YAxis domain={[50, 100]} ticks={[50, 60, 70, 80, 90, 100]} unit="%" {...AXIS} width={52} />
            <Tooltip {...TOOLTIP} formatter={v => [pct(v as number), 'Tỷ lệ đạt']} />
            <ReferenceLine y={100 - cfg.failRateAlertPct} stroke={STATUS_COLOR.bad} strokeDasharray="4 3" />
            <Bar animationDuration={450} dataKey="pass" radius={[4, 4, 0, 0]}>{byCourse.map(c => <Cell key={c.code} fill={c.fail !== null && c.fail > cfg.failRateAlertPct ? STATUS_COLOR.bad : CAT[0]} />)}</Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Xu hướng điểm trung bình theo học kỳ" question="Điểm trung bình toàn Bộ môn đang tăng hay giảm?" table={{ columns: ['Học kỳ', 'Điểm TB', 'Tỷ lệ đạt'], rows: trend.map(t => [t.sem, num(t.avg, 2), pct(t.pass)]) }}>
          <ResponsiveContainer><LineChart data={trend} margin={{ left: -16, right: 16, top: 12 }}><CartesianGrid {...GRID} /><XAxis dataKey="sem" padding={{ left: 24, right: 24 }} {...AXIS} /><YAxis domain={[5, 8]} ticks={[5, 5.5, 6, 6.5, 7, 7.5, 8]} tickFormatter={v => num(v as number)} {...AXIS} width={40} />
            <Tooltip {...TOOLTIP} cursor={{ stroke: '#cfd5de' }} formatter={v => [num(v as number, 2), 'Điểm TB']} />
            <Line animationDuration={450} dataKey="avg" stroke={CAT[0]} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} /></LineChart></ResponsiveContainer>
        </ChartCard>
        <Card title={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-4 text-warn" />Học phần cần chú ý</span>} subtitle="Lần mở gần nhất có điểm; xác định bằng quy tắc dữ liệu, không do AI." bodyClass="p-0">
          {attention.length === 0 ? <EmptyState title="Không có học phần cần chú ý" /> : (
            <ul className="divide-y divide-[#eef1f5]">{attention.map(c => (
              <li key={c.course.id}><a href={href(`courses/${c.course.id}`)} className="block px-4 py-3 hover:bg-navy-50/50">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-navy-700">{c.course.code} · {c.course.name}</span><span className="text-[12px] text-ink-2">{c.latest?.semester.code} · đạt {pct(c.latest?.passRate)} · TB {num(c.latest?.avgScore, 2)}</span></div>
                <div className="mt-1 flex flex-wrap gap-1">{c.attention.map(a => <Badge wrap key={a} tone={a.startsWith('C1') ? 'bad' : 'warn'}>{a}</Badge>)}</div>
              </a></li>))}</ul>
          )}
        </Card>
      </div>

      <Card className="mt-5" title={`Lớp học phần ${sem.code}`} subtitle="Tiến độ giảng dạy = số buổi đã dạy / số buổi kế hoạch.">
        <DataTable rows={sections} columns={cols} rowKey={x => x.section.id} search={x => `${x.section.code} ${x.course.code} ${x.course.name} ${x.lecturer?.fullName ?? ''} ${x.section.className}`} pageSize={10} initialSort={{ key: 'pass', dir: 'asc' }} />
      </Card>
      <p className="mt-3 flex items-center gap-1 text-[12px] text-ink-3"><Percent className="size-3.5" />Mọi tỷ lệ được tính lại từ điểm thành phần của từng lượt đăng ký; không nhập tay.</p>
    </>
  );
}
