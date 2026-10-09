/* =========================================================================
 * TỔNG QUAN — trả lời nhanh: Bộ môn đang thế nào? Vấn đề gì? Ưu tiên gì? Ai xử lý, khi nào?
 * KPI cards + 5 biểu đồ (mỗi biểu đồ một câu hỏi quản trị) + AI Insight Panel + cảnh báo theo quy tắc.
 * ========================================================================= */
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardList, FileWarning, GraduationCap, Lightbulb, ListTodo, RefreshCw, Sparkles, Target, ThumbsUp, Users, Wrench } from 'lucide-react';
import { useApp } from '../lib/app';
import { date, num, pct } from '../lib/format';
import { href, navigate } from '../lib/router';
import { KPI_STATUS_LABEL } from '../domain/rules';
import type { AiFinding, AiRecommendation, AiResponse, AiRisk } from '../ai/schema';
import { AXIS, CAT, ChartCard, GRID, Legend, STATUS_COLOR, TOOLTIP } from '../components/charts';
import { Alert, Button, Card, ClaimTag, EmptyState, PageHeader, Progress, StatCard } from '../components/ui';
import { LevelBadge } from '../components/status';
import { useAiRun } from '../components/ai/useAiRun';
import { ProviderBadge, AiMeta } from '../components/ai/AiResult';

const KPI_COLOR = { achieved: STATUS_COLOR.ok, attention: STATUS_COLOR.warn, not_achieved: STATUS_COLOR.bad, overdue: STATUS_COLOR.risk, no_data: STATUS_COLOR.neutral } as const;

export default function Overview() {
  const { A, can } = useApp();
  const o = A.overview();
  const k = o.kpi;
  const prevSem = A.gradedSemesters().at(-2);
  const prev = prevSem ? A.semesterResults(prevSem.id) : null;

  const kpiData = useMemo(() => A.kpis().map(x => ({ code: x.def.code, name: x.def.name, cr: x.ev.cr === null ? 0 : Math.min(150, x.ev.cr), crRaw: x.ev.cr, status: x.ev.status })).sort((a, b) => a.cr - b.cr), [A]);
  const loadData = useMemo(() => A.lecturers().filter(l => l.ratio !== null && l.band !== 'leave').map(l => ({ code: l.lecturer.code, name: l.lecturer.fullName, load: Math.round(l.ratio! * 1000) / 10, band: l.band, hours: l.totalHours, norm: l.lecturer.normHours })).sort((a, b) => b.load - a.load), [A]);
  const semData = useMemo(() => A.gradedSemesters().map(s => { const r = A.semesterResults(s.id); return { sem: s.code, pass: r.passRate, clo: r.cloRate, avg: r.avgScore }; }), [A]);
  const resData = useMemo(() => A.researchByYear().map(y => ({ year: y.year.code, journal: y.journal, conference: y.conference, book: y.book, product: y.product })), [A]);
  const qaData = useMemo(() => (['PLAN', 'DO', 'CHECK', 'ACT'] as const).map(ph => { const rows = A.qaRows().filter(r => r.a.phase === ph); const c = (s: string) => rows.filter(r => r.status === s).length; return { phase: ph, done: c('done'), in_progress: c('in_progress'), planned: c('planned'), overdue: c('overdue') }; }), [A]);
  const wl = A.settings.workload, kc = A.settings.kpi;
  const alerts = A.alerts();

  return (
    <>
      <PageHeader title="Tổng quan Bộ môn" subtitle={`${A.currentSemester.name} · Năm học ${A.currentYear.code} · Số liệu tính từ dữ liệu nguồn đến ngày ${date(A.ref)}; trạng thái và cảnh báo theo quy tắc cấu hình.`}
        actions={can('report.generate') && <Button icon={<ClipboardList className="size-4" />} onClick={() => navigate('reports')}>Tạo báo cáo</Button>} />

      {/* 8 KPI cards */}
      <div id="demo-overview-kpis" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tổng số giảng viên" value={o.lecturers} icon={<Users className="size-4" />} href={href('staff')} sub={<>{o.fullTime} cơ hữu · {o.phd} tiến sĩ (cơ hữu)</>} />
        <StatCard label="Tổng số học phần" value={o.courses} icon={<BookOpen className="size-4" />} href={href('courses')} sub={<>{o.sectionsInSemester} lớp học phần {A.currentSemester.code}</>} />
        <StatCard label="Tổng số người học" value={num(o.students, 0)} icon={<GraduationCap className="size-4" />} href={href('students')} sub={<>{num(o.studentsActive, 0)} đang học</>} />
        <StatCard label="Tỷ lệ hoàn thành KPI" value={pct(k.completionRate)} icon={<Target className="size-4" />} href={href('kpi')} tone={k.completionRate !== null && k.completionRate >= 80 ? 'ok' : 'warn'}
          sub={<>{k.achieved}/{k.total} đạt · {k.overdue} quá hạn · {k.atRisk} nguy cơ</>} foot={<Progress value={k.completionRate} tone="ok" label="Tỷ lệ KPI đạt" />} />
        <StatCard label={`Tỷ lệ đạt học phần (${o.semester.code})`} value={pct(o.results.passRate)} icon={<CheckCircle2 className="size-4" />} href={href('training')}
          sub={<>{num(o.results.passed, 0)}/{num(o.results.registered, 0)} lượt · {prev && o.results.passRate !== null && prev.passRate !== null ? <Delta d={o.results.passRate - prev.passRate} vs={prevSem!.code} /> : 'chưa có kỳ trước'}</>} />
        <StatCard label="Công việc quá hạn" value={o.overdueTasks} icon={<ListTodo className="size-4" />} href={href('tasks')} tone={o.overdueTasks ? 'bad' : 'ok'} sub={<>{o.openTasks} công việc chưa hoàn thành</>} />
        <StatCard label="Minh chứng còn thiếu" value={o.missingEvidence} icon={<FileWarning className="size-4" />} href={href('evidence')} tone={o.missingEvidence ? 'warn' : 'ok'} sub={<>theo yêu cầu tiêu chí · {o.evidenceNotComplete} MC chưa “Đủ”</>} />
        <StatCard label="Hoạt động cải tiến" value={o.improvementOpen} icon={<Wrench className="size-4" />} href={href('qa')} sub={<>đang mở / {o.improvementTotal} hành động</>} />
      </div>

      <AiInsightPanel />

      {/* Biểu đồ */}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="KPI Performance" question="KPI nào đang thấp so với mục tiêu? (mức đạt CR %, ngưỡng theo cấu hình)" height={Math.max(300, kpiData.length * 22 + 60)}
          table={{ columns: ['KPI', 'Tên', 'CR', 'Trạng thái'], rows: kpiData.map(d => [d.code, d.name, pct(d.crRaw), KPI_STATUS_LABEL[d.status]]) }}>
          <Legend items={(['achieved', 'attention', 'not_achieved', 'overdue'] as const).map(s => ({ label: KPI_STATUS_LABEL[s], color: KPI_COLOR[s] }))} />
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={kpiData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={4}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" domain={[0, 150]} ticks={[0, 50, kc.attentionPct, kc.achievedPct, 150]} unit="%" {...AXIS} />
              <YAxis type="category" dataKey="code" width={86} interval={0} {...AXIS} />
              <Tooltip {...TOOLTIP} formatter={(_v, _n, p) => [`${pct((p.payload as { crRaw: number | null }).crRaw)} · ${KPI_STATUS_LABEL[(p.payload as { status: keyof typeof KPI_COLOR }).status]}`, 'Mức đạt']} labelFormatter={(l, p) => `${l} — ${(p?.[0]?.payload as { name?: string })?.name ?? ''}`} />
              <ReferenceLine x={kc.achievedPct} stroke="#1e3a5f" strokeDasharray="4 3" />
              <ReferenceLine x={kc.attentionPct} stroke="#a3acb9" strokeDasharray="4 3" />
              <Bar animationDuration={450} dataKey="cr" radius={[0, 4, 4, 0]} barSize={12}>{kpiData.map(d => <Cell key={d.code} fill={KPI_COLOR[d.status]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Teaching Load" question={`Giảng viên nào quá tải (> ${num(wl.overloadRatio * 100, 0)}%) hoặc thiếu giờ (< ${num(wl.underloadRatio * 100, 0)}%) định mức, năm học ${A.currentYear.code}?`} height={Math.max(300, kpiData.length * 22 + 60)}
          table={{ columns: ['Mã GV', 'Họ tên', 'Giờ', 'Định mức', '% định mức'], rows: loadData.map(d => [d.code, d.name, num(d.hours), d.norm, pct(d.load)]) }}>
          <Legend items={[{ label: 'Trong ngưỡng', color: CAT[0] }, { label: 'Quá tải', color: STATUS_COLOR.bad }, { label: 'Thiếu giờ', color: STATUS_COLOR.warn }]} />
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={loadData} margin={{ left: -8, right: 8, top: 8, bottom: 4 }} barCategoryGap={3}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="code" {...AXIS} interval={0} angle={-45} textAnchor="end" height={44} />
              <YAxis unit="%" {...AXIS} width={52} />
              <Tooltip {...TOOLTIP} formatter={(v, _n, p) => [`${pct(v as number)} (${num((p.payload as { hours: number }).hours)}/${(p.payload as { norm: number }).norm} giờ)`, 'Tải giảng']} labelFormatter={(l, p) => `${l} — ${(p?.[0]?.payload as { name?: string })?.name ?? ''}`} />
              <ReferenceLine y={wl.overloadRatio * 100} stroke={STATUS_COLOR.bad} strokeDasharray="4 3" />
              <ReferenceLine y={wl.underloadRatio * 100} stroke={STATUS_COLOR.warn} strokeDasharray="4 3" />
              <Bar animationDuration={450} dataKey="load" radius={[4, 4, 0, 0]}>{loadData.map(d => <Cell key={d.code} fill={d.band === 'over' ? STATUS_COLOR.bad : d.band === 'under' ? STATUS_COLOR.warn : CAT[0]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Student Performance" question="Kết quả học tập có cải thiện qua các học kỳ? (tỷ lệ đạt học phần và tỷ lệ đạt CLO bình quân)"
          table={{ columns: ['Học kỳ', 'Tỷ lệ đạt', 'Đạt CLO bình quân', 'Điểm TB'], rows: semData.map(d => [d.sem, pct(d.pass), pct(d.clo), num(d.avg, 2)]) }}>
          <Legend items={[{ label: 'Tỷ lệ đạt học phần', color: CAT[0] }, { label: 'Đạt CLO bình quân', color: CAT[1] }]} />
          <ResponsiveContainer width="100%" height="88%">
            <LineChart data={semData} margin={{ left: -8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="sem" padding={{ left: 24, right: 24 }} {...AXIS} />
              <YAxis domain={[50, 100]} unit="%" {...AXIS} width={52} />
              <Tooltip {...TOOLTIP} cursor={{ stroke: '#cfd5de' }} formatter={(v, n) => [pct(v as number), n === 'pass' ? 'Tỷ lệ đạt' : 'Đạt CLO']} />
              <Line animationDuration={450} type="monotone" dataKey="pass" stroke={CAT[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
              <Line animationDuration={450} type="monotone" dataKey="clo" stroke={CAT[1]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Research Output" question="Sản phẩm khoa học của Bộ môn tăng hay giảm theo năm học, theo loại?"
          table={{ columns: ['Năm học', 'Bài báo', 'Hội thảo', 'Sách', 'Sản phẩm'], rows: resData.map(d => [d.year, d.journal, d.conference, d.book, d.product]) }}>
          <Legend items={[{ label: 'Bài báo tạp chí', color: CAT[0] }, { label: 'Báo cáo hội thảo', color: CAT[1] }, { label: 'Sách', color: CAT[2] }, { label: 'Sản phẩm', color: CAT[3] }]} />
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={resData} margin={{ left: -16, right: 8, top: 8, bottom: 0 }} barSize={44}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="year" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} />
              <Bar animationDuration={450} dataKey="journal" name="Bài báo tạp chí" stackId="a" fill={CAT[0]} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="conference" name="Báo cáo hội thảo" stackId="a" fill={CAT[1]} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="book" name="Sách" stackId="a" fill={CAT[2]} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="product" name="Sản phẩm" stackId="a" fill={CAT[3]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="QA Progress" question="Hoạt động BĐCL theo PDCA đang ở trạng thái nào? (số hoạt động)" className="xl:col-span-2" height={220}
          table={{ columns: ['Giai đoạn', 'Hoàn thành', 'Đang thực hiện', 'Kế hoạch', 'Quá hạn'], rows: qaData.map(d => [d.phase, d.done, d.in_progress, d.planned, d.overdue]) }}>
          <Legend items={[{ label: 'Hoàn thành', color: STATUS_COLOR.ok }, { label: 'Đang thực hiện', color: STATUS_COLOR.info }, { label: 'Kế hoạch', color: STATUS_COLOR.neutral }, { label: 'Quá hạn', color: STATUS_COLOR.bad }]} />
          <ResponsiveContainer width="100%" height="84%">
            <BarChart data={qaData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }} barSize={18}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" allowDecimals={false} {...AXIS} />
              <YAxis type="category" dataKey="phase" width={56} {...AXIS} />
              <Tooltip {...TOOLTIP} />
              <Bar animationDuration={450} dataKey="done" name="Hoàn thành" stackId="q" fill={STATUS_COLOR.ok} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="in_progress" name="Đang thực hiện" stackId="q" fill={STATUS_COLOR.info} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="planned" name="Kế hoạch" stackId="q" fill={STATUS_COLOR.neutral} stroke="#fff" strokeWidth={1} />
              <Bar animationDuration={450} dataKey="overdue" name="Quá hạn" stackId="q" fill={STATUS_COLOR.bad} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Decision support theo quy tắc */}
      <Card className="mt-5" title="Cần xử lý — Decision Support" subtitle="Điều gì xảy ra? Căn cứ? Ai xử lý? Khi nào? (cảnh báo do quy tắc hệ thống sinh ra, không do AI)" bodyClass="p-0">
        {alerts.length === 0 ? <EmptyState title="Không có cảnh báo" /> : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-4 py-2 font-medium">Mức</th><th className="px-2 py-2 font-medium">Điều gì xảy ra?</th><th className="px-2 py-2 font-medium">Căn cứ (dữ liệu/quy tắc)</th><th className="px-2 py-2 font-medium">Ai xử lý?</th><th className="px-4 py-2 font-medium">Hạn</th></tr></thead>
              <tbody>{alerts.slice(0, 8).map(a => (
                <tr key={a.id} className="border-b border-[#eef1f5] last:border-0">
                  <td className="px-4 py-2.5"><LevelBadge l={a.level} /></td>
                  <td className="px-2 py-2.5"><a href={href(a.link)} className="font-medium text-navy-700 hover:underline">{a.title}</a><div className="text-[11.5px] text-ink-3">{a.area}</div></td>
                  <td className="max-w-md px-2 py-2.5 text-ink-2">{a.detail}</td>
                  <td className="px-2 py-2.5">{a.owner}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{a.due ? date(a.due) : '—'}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Delta({ d, vs }: { d: number; vs: string }) {
  if (Math.abs(d) < 0.05) return <span className="text-ink-2">= không đổi so {vs}</span>;
  return <span className={d > 0 ? 'text-ok' : 'text-bad'}>{d > 0 ? '▲' : '▼'} {num(Math.abs(d))} điểm % so {vs}</span>;
}

/* ---------------- AI Insight Panel ---------------- */
function InsightCol({ title, icon, items, empty, tone }: { title: string; icon: React.ReactNode; items: { text: string; kind?: 'fact' | 'inference' | 'rec'; refs: string[]; sub?: string }[]; empty: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3">
      <h3 className={`mb-2 flex items-center gap-1.5 text-[13px] font-semibold ${tone}`}>{icon}{title}</h3>
      {items.length === 0 ? <p className="text-[12.5px] text-ink-3">{empty}</p> : (
        <ol className="space-y-2">{items.slice(0, 3).map((it, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed text-ink">
            <div className="mb-0.5 flex flex-wrap items-center gap-1">{it.kind && <ClaimTag kind={it.kind} />}{it.refs.slice(0, 2).map(r => <code key={r} className="rounded bg-[#eef1f5] px-1 text-[10.5px] text-ink-2">{r}</code>)}</div>
            {it.text}{it.sub && <div className="text-[11.5px] text-ink-2">{it.sub}</div>}
          </li>))}</ol>
      )}
    </div>
  );
}
function AiInsightPanel() {
  const { can } = useApp();
  const { result, loading, error, run } = useAiRun<AiResponse>('dashboard_analysis');
  const d = result?.data as AiResponse | undefined;
  const f = (x: AiFinding | AiRisk) => ({ text: x.statement, kind: x.kind, refs: x.refs, sub: x.kind === 'inference' && x.verify_by ? `Kiểm chứng: ${x.verify_by}` : undefined });
  const a = (x: AiRecommendation) => ({ text: x.action, kind: 'rec' as const, refs: x.refs, sub: `${x.owner_role}${x.due_hint ? ` · ${x.due_hint}` : ''}` });
  const allowed = can('ai.use');
  return (
    <Card className="mt-5 border-navy-200 bg-[linear-gradient(180deg,#f5f8fc,white_40%)]" title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-navy-500" />AI Insight Panel</span>}
      subtitle="AI chỉ diễn giải số liệu do hệ thống tính; không tự tạo số liệu, không thay đổi dữ liệu. Chỉ chạy khi bạn bấm nút."
      actions={allowed ? <Button variant="primary" loading={loading} icon={result ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />} onClick={() => void run(!!result)}>{result ? 'Phân tích lại' : 'Phân tích toàn bộ Dashboard bằng AI'}</Button> : undefined}>
      {!allowed && <Alert tone="info">Vai trò hiện tại chỉ xem; không sử dụng AI.</Alert>}
      {error && <Alert tone="bad" className="mb-3">{error}</Alert>}
      {allowed && !result && !loading && <EmptyState icon={<Lightbulb className="size-5" />} title="Chưa có phân tích AI cho dữ liệu hiện tại">Bấm “Phân tích toàn bộ Dashboard bằng AI” để nhận 3 điểm nổi bật, 3 vấn đề, 3 rủi ro và 3 hành động ưu tiên. Không có Gemini API key, hệ thống tự dùng phân tích bằng quy tắc.</EmptyState>}
      {loading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-2 rounded-lg border border-line bg-white p-3"><div className="h-4 w-1/2 animate-pulse rounded bg-[#e9edf3]" /><div className="h-3 animate-pulse rounded bg-[#e9edf3]" /><div className="h-3 w-5/6 animate-pulse rounded bg-[#e9edf3]" /><div className="h-3 w-4/6 animate-pulse rounded bg-[#e9edf3]" /></div>)}</div>}
      {result && d && !loading && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><ProviderBadge r={result} /><a href={href('ai')} className="text-[12.5px] font-medium text-navy-700 hover:underline">Xem chi tiết trong AI Assistant →</a></div>
          {result.fallbackReason && <Alert tone="info" className="mb-3">Phân tích bằng quy tắc (không dùng AI): {result.fallbackReason}</Alert>}
          <p className="mb-3 rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed text-ink ring-1 ring-line">{d.summary}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InsightCol title="Điểm nổi bật" tone="text-ok" icon={<ThumbsUp className="size-4" />} items={d.findings.filter(x => x.polarity === 'positive').map(f)} empty="Không có điểm nổi bật có căn cứ." />
            <InsightCol title="Vấn đề cần chú ý" tone="text-bad" icon={<AlertTriangle className="size-4" />} items={d.findings.filter(x => x.polarity === 'negative').map(f)} empty="Không phát hiện vấn đề." />
            <InsightCol title="Rủi ro" tone="text-risk" icon={<FileWarning className="size-4" />} items={d.risks.map(f)} empty="Không ghi nhận rủi ro." />
            <InsightCol title="Hành động ưu tiên" tone="text-navy-700" icon={<Target className="size-4" />} items={(d.priority_actions.length ? d.priority_actions : d.recommendations).map(a)} empty="Chưa có đề xuất." />
          </div>
          <AiMeta r={result} />
        </>
      )}
    </Card>
  );
}
