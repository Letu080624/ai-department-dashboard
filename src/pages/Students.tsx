/* SINH VIÊN / HỌC VIÊN — quy mô, phân bố, kết quả theo lớp, danh sách người học (dữ liệu cá nhân KHÔNG gửi AI) */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GraduationCap, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { useApp } from '../lib/app';
import { num, pct } from '../lib/format';
import { AXIS, CAT, ChartCard, GRID, STATUS_COLOR, TOOLTIP } from '../components/charts';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Card, PageHeader, Select, StatCard } from '../components/ui';

type Row = ReturnType<ReturnType<typeof useApp>['A']['studentRows']>[number];
const ST = { studying: ['Đang học', 'ok'], graduated: ['Đã tốt nghiệp', 'info'], suspended: ['Tạm dừng', 'warn'] } as const;

export default function Students() {
  const { A, can } = useApp();
  const [prog, setProg] = useState(''); const [cls, setCls] = useState(''); const [st, setSt] = useState('');
  const rows = A.studentRows();
  const classes = [...new Set(A.d.students.map(s => s.className))].sort();
  const filtered = useMemo(() => rows.filter(r => (!prog || r.s.programId === prog) && (!cls || r.s.className === cls) && (!st || r.s.status === st)), [rows, prog, cls, st]);
  const byClass = A.classResults(A.currentSemester.id);
  const cfg = A.settings.course;
  const withFail = rows.filter(r => r.failed > 0).length;
  const showNames = can('staff.detail');
  const cols: Column<Row>[] = [
    { key: 'code', header: 'Mã', sort: r => r.s.code, render: r => <span className="font-medium">{r.s.code}</span> },
    { key: 'name', header: 'Họ tên', sort: r => r.s.fullName.split(' ').at(-1)!, render: r => (showNames ? <span className="whitespace-nowrap">{r.s.fullName}</span> : <span className="text-ink-3">(ẩn theo vai trò)</span>) },
    { key: 'class', header: 'Lớp', sort: r => r.s.className, render: r => r.s.className },
    { key: 'prog', header: 'Chương trình', render: r => r.program?.name ?? '—', hideBelow: 'lg' },
    { key: 'enr', header: 'Lượt học', align: 'right', sort: r => r.enrollments, render: r => r.enrollments },
    { key: 'avg', header: 'Điểm TB', align: 'right', sort: r => r.avgScore, render: r => num(r.avgScore, 2) },
    { key: 'fail', header: 'Chưa đạt', align: 'right', sort: r => r.failed, render: r => (r.failed ? <span className="font-medium text-bad">{r.failed}</span> : 0) },
    { key: 'st', header: 'Tình trạng', render: r => <Badge tone={ST[r.s.status][1]}>{ST[r.s.status][0]}</Badge>, hideBelow: 'md' },
  ];
  return (
    <>
      <PageHeader title="Sinh viên / Học viên" subtitle="Kết quả tổng hợp từ các lớp học phần do Bộ môn giảng dạy. Dữ liệu cá nhân người học không bao giờ được gửi cho AI (AI chỉ nhận chỉ số tổng hợp theo lớp/học phần)." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tổng số người học" value={num(rows.length, 0)} icon={<Users className="size-4" />} sub={A.d.programs.map(p => `${A.d.students.filter(s => s.programId === p.id).length} ${p.level === 'master' ? 'học viên' : 'sinh viên'}`).join(' · ')} />
        <StatCard label="Đang học" value={num(A.d.students.filter(s => s.status === 'studying').length, 0)} icon={<UserCheck className="size-4" />} tone="ok" />
        <StatCard label="Có học phần chưa đạt" value={num(withFail, 0)} icon={<UserX className="size-4" />} tone={withFail ? 'warn' : 'ok'} sub={`${pct(withFail / rows.length * 100)} người học`} />
        <StatCard label={`Tỷ lệ đạt ${A.currentSemester.code}`} value={pct(A.semesterResults(A.currentSemester.id).passRate)} icon={<GraduationCap className="size-4" />} sub={`Điểm TB ${num(A.semesterResults(A.currentSemester.id).avgScore, 2)}`} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title={`Tỷ lệ đạt theo lớp — ${A.currentSemester.code}`} question={`Lớp nào có tỷ lệ chưa đạt vượt ngưỡng ${cfg.failRateAlertPct}%?`} table={{ columns: ['Lớp', 'Lượt', 'Đạt', 'Tỷ lệ đạt', 'Điểm TB'], rows: byClass.map(c => [c.className, c.registered, c.passed, pct(c.passRate), num(c.avgScore, 2)]) }}>
          <ResponsiveContainer><BarChart data={byClass} margin={{ left: -8, right: 8, top: 8 }} barSize={36}><CartesianGrid {...GRID} /><XAxis dataKey="className" {...AXIS} /><YAxis domain={[50, 100]} unit="%" {...AXIS} width={52} /><Tooltip {...TOOLTIP} formatter={v => [pct(v as number), 'Tỷ lệ đạt']} />
            <Bar animationDuration={450} dataKey="passRate" radius={[4, 4, 0, 0]}>{byClass.map(c => <Cell key={c.className} fill={c.passRate !== null && 100 - c.passRate > cfg.failRateAlertPct ? STATUS_COLOR.bad : CAT[0]} />)}</Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Quy mô theo lớp" question="Người học phân bố ở các lớp/khoá như thế nào?" table={{ columns: ['Lớp', 'Số người học'], rows: classes.map(c => [c, A.d.students.filter(s => s.className === c).length]) }}>
          <ResponsiveContainer><BarChart data={classes.map(c => ({ c, n: A.d.students.filter(s => s.className === c).length }))} margin={{ left: -16, right: 8, top: 8 }} barSize={36}><CartesianGrid {...GRID} /><XAxis dataKey="c" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip {...TOOLTIP} formatter={v => [v as number, 'Người học']} /><Bar animationDuration={450} dataKey="n" fill={CAT[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <Card className="mt-5" title="Danh sách người học" subtitle={showNames ? undefined : <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />Họ tên người học được ẩn với vai trò hiện tại.</span>}>
        <DataTable rows={filtered} columns={cols} rowKey={r => r.s.id} pageSize={15} search={r => `${r.s.code} ${showNames ? r.s.fullName : ''} ${r.s.className}`} searchPlaceholder="Tìm mã, họ tên, lớp…" initialSort={{ key: 'code', dir: 'asc' }}
          toolbar={<>
            <Select aria-label="Chương trình" value={prog} onChange={e => setProg(e.target.value)} className="w-auto"><option value="">Mọi chương trình</option>{A.d.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select aria-label="Lớp" value={cls} onChange={e => setCls(e.target.value)} className="w-auto"><option value="">Mọi lớp</option>{classes.map(c => <option key={c}>{c}</option>)}</Select>
            <Select aria-label="Tình trạng" value={st} onChange={e => setSt(e.target.value)} className="w-auto"><option value="">Mọi tình trạng</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select>
          </>} />
      </Card>
    </>
  );
}
