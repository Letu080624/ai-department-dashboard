/* ĐỘI NGŨ — danh sách giảng viên (tìm, lọc, sắp xếp, phân trang) + Lecturer Detail */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Award, BookOpen, Clock, FlaskConical, GraduationCap, Sparkles, Users } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, date, num, pct } from '../lib/format';
import { href, navigate } from '../lib/router';
import { DataTable, type Column } from '../components/DataTable';
import { AiLoading, Alert, Badge, Button, Card, EmptyState, KV, NoAccess, PageHeader, Progress, Select, StatCard, Tabs } from '../components/ui';
import { EvidenceBadge, KpiBadge, QaBadge, TaskBadge, WorkloadBadge } from '../components/status';
import { AXIS, CAT, GRID, TOOLTIP } from '../components/charts';
import { useAiRun } from '../components/ai/useAiRun';
import { AiResultView } from '../components/ai/AiResult';
import type { LecturerSummary } from '../domain/analytics';
import { WORKLOAD_LABEL, type WorkloadBand } from '../domain/rules';

const OUTPUT_LABEL = { journal_article: 'Bài báo tạp chí', conference_paper: 'Báo cáo hội thảo', book: 'Sách', product: 'Sản phẩm' } as const;

export default function Staff({ id }: { id?: string }) {
  return id ? <LecturerDetail id={id} /> : <StaffList />;
}

function StaffList() {
  const { A, can, user } = useApp();
  const [degree, setDegree] = useState(''); const [band, setBand] = useState<WorkloadBand | ''>(''); const [emp, setEmp] = useState('');
  const all = A.lecturers();
  const rows = useMemo(() => all.filter(l => (!degree || l.lecturer.degree === degree) && (!band || l.band === band) && (!emp || l.lecturer.employment === emp)), [all, degree, band, emp]);
  const ft = A.fullTime();
  const kpiStat = (l: LecturerSummary) => { const ks = l.kpisOwned.map(k => A.kpi(k.id)); return { n: ks.length, bad: ks.filter(k => k.ev.status !== 'achieved').length }; };
  const canOpen = (lecId: string) => can('staff.detail') || user.lecturerId === lecId;

  const cols: Column<LecturerSummary>[] = [
    { key: 'code', header: 'Mã GV', sort: r => r.lecturer.code, render: r => <span className="font-semibold text-navy-700">{r.lecturer.code}</span> },
    { key: 'name', header: 'Họ tên', sort: r => r.lecturer.fullName.split(' ').at(-1)!, render: r => <div className="min-w-0"><p className="whitespace-nowrap font-medium">{r.lecturer.fullName}</p><p className="text-[11.5px] text-ink-3">{r.lecturer.position}{r.lecturer.employment === 'visiting' ? ' · thỉnh giảng' : ''}</p></div> },
    { key: 'degree', header: 'Học vị', sort: r => r.lecturer.degree, render: r => r.lecturer.degree },
    { key: 'title', header: 'Chức danh', sort: r => r.lecturer.title ?? '', render: r => r.lecturer.title ?? '—', hideBelow: 'md' },
    { key: 'courses', header: 'Học phần', sort: r => r.courses.length, render: r => r.courses.length ? <span title={r.courses.map(c => c.name).join(', ')}>{r.courses.map(c => c.code).join(', ')}</span> : <span className="text-ink-3">—</span>, hideBelow: 'lg' },
    { key: 'hours', header: 'Giờ giảng', align: 'right', sort: r => r.ratio ?? -1, render: r => <div><span className="font-medium">{num(r.totalHours)}</span><span className="text-ink-3"> / {r.lecturer.normHours || '—'}</span>{r.ratio !== null && <div className="text-[11.5px] text-ink-2">{pct(r.ratio * 100)}</div>}</div> },
    { key: 'res', header: 'NCKH', align: 'right', sort: r => r.outputs.length, render: r => <span title={`${r.outputs.length} sản phẩm năm ${A.currentYear.code}, ${r.projects.length} đề tài`}>{r.outputs.length}{r.projects.length ? <span className="text-ink-3"> · {r.projects.length} ĐT</span> : null}</span> },
    { key: 'kpi', header: 'KPI', align: 'right', sort: r => kpiStat(r).bad, render: r => { const s = kpiStat(r); return s.n ? <span>{s.n}{s.bad ? <span className="text-bad"> · {s.bad} chưa đạt</span> : <span className="text-ok"> · đạt</span>}</span> : <span className="text-ink-3">—</span>; }, hideBelow: 'md' },
    { key: 'status', header: 'Trạng thái', sort: r => r.alerts.length, render: r => <div className="flex flex-wrap items-center gap-1"><WorkloadBadge b={r.band} />{r.alerts.length > 0 && <Badge tone="warn" icon={false} title={r.alerts.join('\n')}><AlertTriangle className="size-3" />{r.alerts.length}</Badge>}</div> },
  ];

  return (
    <>
      <PageHeader title="Đội ngũ giảng viên" subtitle={`Năm học ${A.currentYear.code}. Giờ giảng = giờ lớp học phần quy đổi (tín chỉ × ${A.settings.workload.hoursPerCredit} × hệ số) + hoạt động khác; ngưỡng quá tải/thiếu giờ theo cấu hình.`} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tổng giảng viên" value={all.length} icon={<Users className="size-4" />} sub={`${ft.length} cơ hữu · ${all.length - ft.length} thỉnh giảng`} />
        <StatCard label="Tiến sĩ (cơ hữu)" value={ft.filter(l => l.degree === 'TS').length} icon={<GraduationCap className="size-4" />} sub={`Tỷ lệ ${pct(A.metric('staff.phd_rate', A.currentYear.id))}`} />
        <StatCard label="Có chức danh GS/PGS" value={all.filter(l => l.lecturer.title).length} icon={<Award className="size-4" />} />
        <StatCard label="Quá tải / thiếu giờ" value={`${all.filter(l => l.band === 'over').length} / ${all.filter(l => l.band === 'under').length}`} icon={<Clock className="size-4" />} tone={all.some(l => l.band === 'over') ? 'warn' : 'ok'} sub={`Ngưỡng >${num(A.settings.workload.overloadRatio * 100, 0)}% / <${num(A.settings.workload.underloadRatio * 100, 0)}%`} />
      </div>
      <Card className="mt-5" title="Danh sách giảng viên" subtitle={!can('staff.detail') ? 'Vai trò hiện tại chỉ xem được hồ sơ chi tiết của chính mình.' : 'Bấm một dòng để xem chi tiết.'}>
        <DataTable rows={rows} columns={cols} rowKey={r => r.lecturer.id} pageSize={10} initialSort={{ key: 'code', dir: 'asc' }}
          search={r => `${r.lecturer.code} ${r.lecturer.fullName} ${r.lecturer.specialization} ${r.courses.map(c => c.code + ' ' + c.name).join(' ')}`} searchPlaceholder="Tìm mã, họ tên, chuyên môn, học phần…"
          onRowClick={r => (canOpen(r.lecturer.id) ? navigate(`staff/${r.lecturer.id}`) : undefined)}
          toolbar={<>
            <Select aria-label="Lọc học vị" value={degree} onChange={e => setDegree(e.target.value)} className="w-auto"><option value="">Mọi học vị</option><option value="TS">Tiến sĩ</option><option value="ThS">Thạc sĩ</option><option value="KS">Kỹ sư</option></Select>
            <Select aria-label="Lọc tải giảng" value={band} onChange={e => setBand(e.target.value as WorkloadBand | '')} className="w-auto"><option value="">Mọi mức tải</option>{(Object.keys(WORKLOAD_LABEL) as WorkloadBand[]).map(b => <option key={b} value={b}>{WORKLOAD_LABEL[b]}</option>)}</Select>
            <Select aria-label="Lọc loại hình" value={emp} onChange={e => setEmp(e.target.value)} className="w-auto"><option value="">Cơ hữu + thỉnh giảng</option><option value="full_time">Cơ hữu</option><option value="visiting">Thỉnh giảng</option></Select>
          </>} />
      </Card>
    </>
  );
}

function LecturerDetail({ id }: { id: string }) {
  const { A, can, user } = useApp();
  const [tab, setTab] = useState<'load' | 'courses' | 'research' | 'kpi' | 'tasks' | 'qa'>('load');
  const lec = A.get('lecturers', id);
  const ai = useAiRun('lecturer_analysis', lec ? { type: 'lecturer', id: lec.id, label: lec.code } : null);
  if (!lec) return <Card><EmptyState title="Không tìm thấy giảng viên" action={<Button onClick={() => navigate('staff')}>Về danh sách</Button>} /></Card>;
  if (!can('staff.detail') && user.lecturerId !== id) return <NoAccess what="hồ sơ chi tiết giảng viên khác" />;
  const s = A.lecturerSummary(id);
  const years = A.d.academicYears.map(y => ({ y: y.code, ...(() => { const x = A.lecturerSummary(id, y.id); return { section: x.sectionHours, other: x.otherHours }; })() }));
  const other = A.d.otherLoads.filter(o => o.lecturerId === id && o.academicYearId === A.currentYear.id);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Đội ngũ', href: href('staff') }, { label: lec.code }]} title={lec.fullName}
        subtitle={`${lec.code} · ${lec.position} · ${lec.title ? lec.title + '.' : ''}${lec.degree} · ${lec.specialization}`}
        actions={can('ai.use') && <Button variant="primary" icon={<Sparkles className="size-4" />} loading={ai.loading} onClick={() => void ai.run(!!ai.result)}>{ai.result ? 'Phân tích lại' : 'AI phân tích giảng viên'}</Button>} />
      {s.alerts.length > 0 && <Alert tone="warn" title="Cảnh báo theo quy tắc" className="mb-4"><ul className="list-disc pl-4">{s.alerts.map(a => <li key={a}>{a}</li>)}</ul></Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Hồ sơ" className="lg:col-span-1">
          <KV cols={1} items={[
            { label: 'Loại hình', value: lec.employment === 'full_time' ? 'Cơ hữu' : 'Thỉnh giảng' }, { label: 'Tình trạng', value: lec.status === 'active' ? 'Đang công tác' : 'Nghỉ dài hạn' },
            { label: 'Học vị / chức danh', value: `${lec.degree}${lec.title ? ' · ' + lec.title : ''}` }, { label: 'Chuyên môn', value: lec.specialization },
            { label: 'Định mức giờ chuẩn/năm', value: lec.normHours || 'Không áp dụng' }, { label: 'Bồi dưỡng chuyên môn', value: `${lec.trainingHours} giờ` },
          ]} />
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <StatCard id="demo-lecturer-load" label={`Giờ giảng ${A.currentYear.code}`} value={num(s.totalHours)} icon={<Clock className="size-4" />} sub={<>{num(s.sectionHours)} giờ lớp + {num(s.otherHours)} giờ khác{s.ratio !== null && <> · {pct(s.ratio * 100)} định mức</>}</>} foot={<div className="flex items-center gap-2"><Progress value={s.ratio === null ? null : s.ratio * 100} max={150} tone={s.band === 'over' ? 'bad' : s.band === 'under' ? 'warn' : 'navy'} label="Tải giảng" /><WorkloadBadge b={s.band} /></div>} />
          <StatCard label="Học phần đang dạy" value={s.courses.length} icon={<BookOpen className="size-4" />} sub={`${s.sections.length} lớp học phần trong năm`} />
          <StatCard label="Sản phẩm NCKH (năm)" value={s.outputs.length} icon={<FlaskConical className="size-4" />} sub={`${s.projects.length} đề tài tham gia`} />
          <StatCard label="Công việc" value={s.tasks.length} icon={<AlertTriangle className="size-4" />} tone={s.overdueTasks ? 'bad' : undefined} sub={`${s.overdueTasks} quá hạn · ${s.tasks.filter(t => t.status === 'done').length} hoàn thành`} />
        </div>
      </div>

      {(ai.result || ai.error || ai.loading) && (
        <Card className="mt-5" title="AI phân tích giảng viên" subtitle="Chỉ dựa trên số liệu trong hệ thống; không đánh giá năng lực cá nhân.">
          {ai.error && <Alert tone="bad">{ai.error}</Alert>}
          {ai.loading && <AiLoading label="AI đang phân tích số liệu của giảng viên…" />}
          {ai.result && !ai.loading && <AiResultView r={ai.result} />}
        </Card>
      )}

      <Card className="mt-5" bodyClass="p-0">
        <Tabs className="px-3 pt-1" value={tab} onChange={setTab} tabs={[
          { key: 'load', label: 'Tải giảng' }, { key: 'courses', label: 'Học phần', count: s.courses.length }, { key: 'research', label: 'NCKH', count: s.outputs.length + s.projects.length },
          { key: 'kpi', label: 'KPI', count: s.kpisOwned.length }, { key: 'tasks', label: 'Công việc', count: s.tasks.length }, { key: 'qa', label: 'Trách nhiệm BĐCL', count: s.qaActivities.length + s.evidenceOwned.length },
        ]} />
        <div className="p-4">
          {tab === 'load' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Giờ quy đổi theo năm học</h3>
                <div className="h-56"><ResponsiveContainer><BarChart data={years} margin={{ left: -16, right: 8, top: 8 }} barSize={40}><CartesianGrid {...GRID} /><XAxis dataKey="y" {...AXIS} /><YAxis {...AXIS} /><Tooltip {...TOOLTIP} formatter={(v, n) => [num(v as number), n === 'section' ? 'Giờ lớp học phần' : 'Hoạt động khác']} />
                  <Bar animationDuration={450} dataKey="section" stackId="h" fill={CAT[0]} stroke="#fff" /><Bar animationDuration={450} dataKey="other" stackId="h" fill={CAT[1]} stroke="#fff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                <p className="text-[12px] text-ink-2"><span className="mr-3 inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: CAT[0] }} />Giờ lớp học phần</span><span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: CAT[1] }} />Hoạt động khác</span></p>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-[13px] font-semibold">Chi tiết {A.currentYear.code}</h3>
                <table className="w-full text-[12.5px]"><thead><tr className="border-b border-line text-left text-ink-2"><th className="py-1.5 font-medium">Nội dung</th><th className="py-1.5 text-right font-medium">Giờ</th></tr></thead><tbody>
                  {s.sections.map(x => <tr key={x.id} className="border-b border-[#eef1f5]"><td className="py-1.5">{x.code} · {A.get('courses', x.courseId)?.name} <span className="text-ink-3">({A.get('semesters', x.semesterId)?.code})</span></td><td className="py-1.5 text-right tabular-nums">{num(A.sectionHours(x))}</td></tr>)}
                  {other.map(o => <tr key={o.id} className="border-b border-[#eef1f5]"><td className="py-1.5">{o.activity}</td><td className="py-1.5 text-right tabular-nums">{num(o.hours)}</td></tr>)}
                  <tr className="font-semibold"><td className="py-1.5">Tổng</td><td className="py-1.5 text-right tabular-nums">{num(s.totalHours)}</td></tr>
                </tbody></table>
              </div>
            </div>
          )}
          {tab === 'courses' && (s.courses.length ? <ul className="grid gap-2 md:grid-cols-2">{s.courses.map(c => { const cs = A.courseSummary(c.id); return <li key={c.id}><a href={href(`courses/${c.id}`)} className="block rounded-lg border border-line p-3 hover:border-navy-200 hover:bg-navy-50/40"><p className="font-medium text-navy-700">{c.code} · {c.name}</p><p className="text-[12px] text-ink-2">{c.credits} tín chỉ · đạt {pct(cs.latest?.passRate)} ({cs.latest?.semester.code ?? '—'})</p>{cs.attention.length > 0 && <Badge tone="warn" className="mt-1">Cần chú ý</Badge>}</a></li>; })}</ul> : <EmptyState title="Không có học phần trong năm học" />)}
          {tab === 'research' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div><h3 className="mb-2 text-[13px] font-semibold">Sản phẩm ({A.currentYear.code})</h3>{s.outputs.length ? <ul className="space-y-2">{s.outputs.map(o => <li key={o.id} className="rounded-lg border border-line p-2.5 text-[12.5px]"><Badge tone="info" icon={false}>{OUTPUT_LABEL[o.type]}</Badge><p className="mt-1 font-medium">{o.title}</p><p className="text-ink-2">{o.venue} · {date(o.publishedDate)}{o.indexed ? ` · ${o.indexed}` : ''}</p></li>)}</ul> : <EmptyState title="Chưa có sản phẩm NCKH trong năm học" />}</div>
              <div><h3 className="mb-2 text-[13px] font-semibold">Đề tài</h3>{s.projects.length ? <ul className="space-y-2">{s.projects.map(p => <li key={p.id} className="rounded-lg border border-line p-2.5 text-[12.5px]"><p className="font-medium">{p.code} · {p.title}</p><p className="text-ink-2">{p.level} · {p.principalId === id ? 'Chủ nhiệm' : 'Thành viên'} · {date(p.startDate)}–{date(p.endDate)}</p><div className="mt-1.5 flex items-center gap-2"><Progress value={p.progressPct} label="Tiến độ đề tài" /><span className="w-10 text-right tabular-nums">{p.progressPct}%</span></div></li>)}</ul> : <EmptyState title="Không tham gia đề tài" />}</div>
            </div>
          )}
          {tab === 'kpi' && (s.kpisOwned.length ? <ul className="grid gap-2 md:grid-cols-2">{s.kpisOwned.map(k => { const v = A.kpi(k.id); return <li key={k.id}><a href={href(`kpi/${k.id}`)} className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 hover:bg-navy-50/40"><span className="min-w-0"><span className="block font-medium text-navy-700">{k.code}</span><span className="block truncate text-[12px] text-ink-2">{k.name}</span></span><span className="text-right"><KpiBadge s={v.ev.status} rule={v.ev.rule} /><span className="mt-0.5 block text-[12px] text-ink-2">CR {pct(v.ev.cr)}</span></span></a></li>; })}</ul> : <EmptyState title="Không phụ trách KPI nào" />)}
          {tab === 'tasks' && (s.tasks.length ? <ul className="divide-y divide-[#eef1f5]">{s.tasks.map(t => <li key={t.task.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]"><span className="min-w-0 flex-1"><span className="text-ink-3">{t.task.code}</span> {t.task.title}</span><span className="text-[12px] text-ink-2">Hạn {date(t.task.deadline)}</span><TaskBadge s={t.status} /></li>)}</ul> : <EmptyState title="Không có công việc" />)}
          {tab === 'qa' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div><h3 className="mb-2 text-[13px] font-semibold">Hoạt động BĐCL phụ trách</h3>{s.qaActivities.length ? <ul className="space-y-2">{s.qaActivities.map(a => <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-[12.5px]"><span className="min-w-0"><b className="font-medium">{a.code}</b> · {a.title} <span className="text-ink-3">({a.phase})</span></span><QaBadge s={A.qaRows().find(r => r.a.id === a.id)!.status} /></li>)}</ul> : <EmptyState title="Không phụ trách hoạt động BĐCL" />}</div>
              <div><h3 className="mb-2 text-[13px] font-semibold">Minh chứng phụ trách</h3>{s.evidenceOwned.length ? <ul className="space-y-2">{s.evidenceOwned.map(e => { const st = A.evidenceStatus(e); return <li key={e.id}><a href={href(`evidence/${e.id}`)} className={cx('flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-[12.5px] hover:bg-navy-50/40')}><span className="min-w-0"><b className="font-medium">{e.code}</b> · {e.name}</span><EvidenceBadge s={st.status} reason={st.reason} /></a></li>; })}</ul> : <EmptyState title="Không phụ trách minh chứng" />}</div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
