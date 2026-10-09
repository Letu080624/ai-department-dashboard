/* HỌC PHẦN — danh sách + Course Detail (CLO, PLO, đánh giá, phân bố điểm, AI Analyze Course: 5 câu hỏi) */
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BookOpen, Sparkles } from 'lucide-react';
import { useApp } from '../lib/app';
import { num, pct } from '../lib/format';
import { href, navigate } from '../lib/router';
import { DataTable, type Column } from '../components/DataTable';
import { AXIS, CAT, ChartCard, GRID, Legend, SEQ, STATUS_COLOR, TOOLTIP } from '../components/charts';
import { AiLoading, Alert, Badge, Button, Card, ClaimTag, EmptyState, KV, PageHeader, Select } from '../components/ui';
import { AiMeta, FindingItem, ProviderBadge, RecItem } from '../components/ai/AiResult';
import { useAiRun } from '../components/ai/useAiRun';
import type { CourseSummary } from '../domain/analytics';
import type { AiResponse } from '../ai/schema';

const SYL = { approved: ['Đã duyệt', 'ok'], submitted: ['Đã nộp', 'info'], draft: ['Bản nháp', 'warn'] } as const;

export default function Courses({ id }: { id?: string }) { return id ? <CourseDetail id={id} /> : <CourseList />; }

function CourseList() {
  const { A } = useApp();
  const [prog, setProg] = useState('');
  const [att, setAtt] = useState('');
  const rows = A.courses().filter(c => (!prog || c.course.programId === prog) && (!att || (att === 'yes' ? c.attention.length > 0 : !c.attention.length)));
  const cols: Column<CourseSummary>[] = [
    { key: 'code', header: 'Mã HP', sort: c => c.course.code, render: c => <span className="font-medium text-navy-700">{c.course.code}</span> },
    { key: 'name', header: 'Tên học phần', sort: c => c.course.name, render: c => <div><p className="font-medium">{c.course.name}</p><p className="text-[11.5px] text-ink-3">{A.get('programs', c.course.programId)?.name}</p></div> },
    { key: 'cr', header: 'TC', align: 'right', sort: c => c.course.credits, render: c => c.course.credits },
    { key: 'coord', header: 'GV phụ trách', render: c => A.lecturerName(c.course.coordinatorId), hideBelow: 'md' },
    { key: 'syl', header: 'Đề cương', render: c => <Badge tone={SYL[c.course.syllabusStatus][1]}>{SYL[c.course.syllabusStatus][0]}</Badge>, hideBelow: 'lg' },
    { key: 'sem', header: 'Lần mở gần nhất', render: c => c.latest?.semester.code ?? <span className="text-ink-3">chưa có điểm</span>, hideBelow: 'md' },
    { key: 'avg', header: 'Điểm TB', align: 'right', sort: c => c.latest?.avgScore ?? null, render: c => num(c.latest?.avgScore, 2) },
    { key: 'pass', header: 'Tỷ lệ đạt', align: 'right', sort: c => c.latest?.passRate ?? null, render: c => pct(c.latest?.passRate) },
    { key: 'att', header: 'Cảnh báo', sort: c => c.attention.length, render: c => (c.attention.length ? <Badge tone="warn" title={c.attention.join('\n')}>{c.attention.map(a => a.slice(0, 2)).join(' · ')}</Badge> : <Badge tone="ok">Không</Badge>) },
  ];
  return (
    <>
      <PageHeader title="Học phần" subtitle={`${A.d.courses.length} học phần do Bộ môn phụ trách. Cảnh báo theo quy tắc: C1 tỷ lệ chưa đạt > ${A.settings.course.failRateAlertPct}% · C2 CLO dưới mục tiêu · C3 tỷ lệ đạt giảm ≥ ${A.settings.course.passDropAlertPts} điểm %.`} />
      <Card>
        <DataTable rows={rows} columns={cols} rowKey={c => c.course.id} onRowClick={c => navigate(`courses/${c.course.id}`)} search={c => `${c.course.code} ${c.course.name} ${A.lecturerName(c.course.coordinatorId)}`} searchPlaceholder="Tìm mã, tên học phần, GV…" initialSort={{ key: 'code', dir: 'asc' }} pageSize={12}
          toolbar={<>
            <Select aria-label="Lọc chương trình" value={prog} onChange={e => setProg(e.target.value)} className="w-auto"><option value="">Mọi chương trình</option>{A.d.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select aria-label="Lọc cảnh báo" value={att} onChange={e => setAtt(e.target.value)} className="w-auto"><option value="">Mọi học phần</option><option value="yes">Cần chú ý</option><option value="no">Không cảnh báo</option></Select>
          </>} />
      </Card>
    </>
  );
}

function CourseDetail({ id }: { id: string }) {
  const { A, can } = useApp();
  const course = A.get('courses', id);
  const [secId, setSecId] = useState<string>('');
  const ai = useAiRun<AiResponse>('course_analysis', course ? { type: 'course', id: course.id, label: course.code } : null);
  if (!course) return <Card><EmptyState title="Không tìm thấy học phần" action={<Button onClick={() => navigate('courses')}>Về danh sách</Button>} /></Card>;
  const cs = A.courseSummary(id);
  const sel = cs.offerings.find(o => o.section.id === secId) ?? cs.latest;
  const clos = A.d.clos.filter(c => c.courseId === id);
  const prog = A.get('programs', course.programId)!;
  const allSections = A.d.sections.filter(s => s.courseId === id);
  const plos = A.ploAttainment(prog.id, sel ? [sel.semester.id] : []);
  const maps = A.d.cloPloMap.filter(m => clos.some(c => c.id === m.cloId));
  const cloData = sel ? sel.clo.map(c => ({ code: c.clo.code, rate: c.rate, target: c.target, below: c.below, desc: c.clo.description, prev: cs.previous?.clo.find(p => p.clo.id === c.clo.id)?.rate ?? null })) : [];
  const ploIds = [...new Set(maps.map(m => m.ploId))];

  return (
    <>
      <PageHeader crumbs={[{ label: 'Học phần', href: href('courses') }, { label: course.code }]} title={`${course.code} · ${course.name}`}
        subtitle={`${course.credits} tín chỉ · ${prog.name} · GV phụ trách: ${A.lecturerName(course.coordinatorId)} · Điểm đạt ${num(course.passScore)}`}
        actions={<>
          {cs.offerings.length > 1 && <Select aria-label="Chọn lần mở" value={sel?.section.id ?? ''} onChange={e => setSecId(e.target.value)} className="w-auto">{cs.offerings.map(o => <option key={o.section.id} value={o.section.id}>{o.semester.code} · {o.section.code}</option>)}</Select>}
          {can('ai.use') && <Button variant="primary" icon={<Sparkles className="size-4" />} loading={ai.loading} onClick={() => void ai.run(!!ai.result)}>{ai.result ? 'Phân tích lại' : 'AI Analyze Course'}</Button>}
        </>} />
      {cs.attention.length > 0 && <Alert tone="warn" title="Học phần cần chú ý (quy tắc)" className="mb-4">{cs.attention.join(' · ')}</Alert>}

      {(ai.result || ai.loading || ai.error) && <CourseAi r={ai.result} loading={ai.loading} error={ai.error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Thông tin học phần">
          <KV cols={1} items={[
            { label: 'Giảng viên giảng dạy', value: [...new Set(allSections.map(s => A.lecturerName(s.lecturerId)))].join(', ') || '—' },
            { label: 'Số lớp đã mở', value: `${allSections.length} lớp (${cs.offerings.length} đã có điểm)` },
            { label: `Người học (${sel?.semester.code ?? '—'})`, value: sel ? `${sel.registered} đăng ký · ${sel.examined} dự thi · ${sel.absent} vắng thi` : '—' },
            { label: 'Đề cương', value: <Badge tone={SYL[course.syllabusStatus][1]}>{SYL[course.syllabusStatus][0]}</Badge> },
          ]} />
        </Card>
        <Card title="Phương pháp đánh giá">
          <table className="w-full text-[13px]"><thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="py-1.5 font-medium">Thành phần</th><th className="py-1.5 text-right font-medium">Trọng số</th></tr></thead>
            <tbody>{course.assessment.map(a => <tr key={a.code} className="border-b border-[#eef1f5]"><td className="py-1.5">{a.name} <span className="text-ink-3">({a.code})</span></td><td className="py-1.5 text-right tabular-nums">{pct(a.weight * 100, 0)}</td></tr>)}</tbody></table>
        </Card>
        <Card title={`Kết quả ${sel?.semester.code ?? ''}`}>
          {sel ? <KV cols={2} items={[{ label: 'Điểm TB', value: <span className="text-lg font-semibold">{num(sel.avgScore, 2)}</span> }, { label: 'Tỷ lệ đạt', value: <span className="text-lg font-semibold">{pct(sel.passRate)}</span> }, { label: 'Đạt / chưa đạt', value: `${sel.passed} / ${sel.failed}` }, { label: 'Lần mở trước', value: cs.previous && sel.section.id === cs.latest?.section.id ? `${pct(cs.previous.passRate)} (${cs.previous.semester.code})` : '—' }]} /> : <EmptyState title="Chưa có kết quả" />}
        </Card>
      </div>

      {sel && (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <ChartCard title="Phân bố điểm" question="Điểm tổng kết của người dự thi tập trung ở khoảng nào?" table={{ columns: ['Khoảng điểm', 'Số người học'], rows: sel.distribution.map(d => [d.band, d.count]) }}>
            <ResponsiveContainer><BarChart data={sel.distribution} margin={{ left: -16, right: 8, top: 8 }} barSize={44}><CartesianGrid {...GRID} /><XAxis dataKey="band" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip {...TOOLTIP} formatter={v => [v as number, 'Người học']} />
              <Bar animationDuration={450} dataKey="count" radius={[4, 4, 0, 0]}>{sel.distribution.map((d, i) => <Cell key={d.band} fill={SEQ[i + 1]} />)}</Bar></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard id="demo-clo" title="Mức đạt CLO" question="CLO nào thấp hơn mục tiêu? (tỷ lệ người học đạt ≥ ngưỡng điểm CLO)" table={{ columns: ['CLO', 'Đạt', 'Mục tiêu', 'Lần trước'], rows: cloData.map(c => [c.code, pct(c.rate), pct(c.target, 0), pct(c.prev)]) }}>
            <Legend items={[{ label: 'Đạt mục tiêu', color: CAT[0] }, { label: 'Dưới mục tiêu', color: STATUS_COLOR.bad }, { label: 'Mục tiêu', color: '#1e3a5f', dashed: true }]} />
            <ResponsiveContainer height="88%"><BarChart data={cloData} margin={{ left: -8, right: 8, top: 8 }} barSize={30}><CartesianGrid {...GRID} /><XAxis dataKey="code" {...AXIS} /><YAxis domain={[0, 100]} unit="%" {...AXIS} width={52} />
              <Tooltip {...TOOLTIP} formatter={(v, _n, p) => [`${pct(v as number)} (mục tiêu ${pct((p.payload as { target: number }).target, 0)})`, 'Mức đạt']} labelFormatter={(l, p) => `${l}: ${(p?.[0]?.payload as { desc?: string })?.desc ?? ''}`} />
              <Bar animationDuration={450} dataKey="rate" radius={[4, 4, 0, 0]}>{cloData.map(c => <Cell key={c.code} fill={c.below ? STATUS_COLOR.bad : CAT[0]} />)}</Bar>
              <Bar animationDuration={450} dataKey="target" fill="transparent" stroke="#1e3a5f" strokeDasharray="4 3" barSize={30} isAnimationActive={false} /></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card title="Chuẩn đầu ra học phần (CLO)" bodyClass="p-0">
          <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[520px] text-[13px]"><thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-4 py-2 font-medium">CLO</th><th className="px-2 py-2 font-medium">Mô tả</th><th className="px-2 py-2 text-right font-medium">Mục tiêu</th><th className="px-2 py-2 text-right font-medium">Đạt</th><th className="px-4 py-2 font-medium">PLO</th></tr></thead>
            <tbody>{clos.map(c => { const x = sel?.clo.find(y => y.clo.id === c.id); return <tr key={c.id} className="border-b border-[#eef1f5] last:border-0"><td className="px-4 py-2 font-medium">{c.code}</td><td className="px-2 py-2 text-ink-2">{c.description}</td><td className="px-2 py-2 text-right tabular-nums">{pct(c.targetPct, 0)}</td><td className={`px-2 py-2 text-right font-medium tabular-nums ${x?.below ? 'text-bad' : ''}`}>{pct(x?.rate)}</td><td className="px-4 py-2 text-[12px]">{maps.filter(m => m.cloId === c.id).map(m => `${A.get('plos', m.ploId)?.code}(${m.level})`).join(', ') || '—'}</td></tr>; })}</tbody></table></div>
        </Card>
        <Card title="Đóng góp vào PLO" subtitle={`Mức đạt PLO của ${prog.code} trong ${sel?.semester.code ?? '—'} (trung bình có trọng số mức đóng góp 1–3 của các CLO ánh xạ). Ô: mức đóng góp của CLO.`} bodyClass="p-0">
          {ploIds.length === 0 ? <EmptyState title="Chưa ánh xạ CLO–PLO" /> : (
            <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[420px] text-[13px]"><thead><tr className="border-b border-line text-[12px] text-ink-2"><th className="px-4 py-2 text-left font-medium">PLO</th>{clos.map(c => <th key={c.id} className="px-2 py-2 text-center font-medium">{c.code}</th>)}<th className="px-4 py-2 text-right font-medium">Mức đạt / mục tiêu</th></tr></thead>
              <tbody>{ploIds.map(pid => { const p = plos.find(x => x.plo.id === pid); return <tr key={pid} className="border-b border-[#eef1f5] last:border-0"><td className="px-4 py-2 font-medium" title={p?.plo.description}>{p?.plo.code}</td>{clos.map(c => { const m = maps.find(x => x.cloId === c.id && x.ploId === pid); return <td key={c.id} className="px-2 py-2 text-center">{m ? <span className="inline-grid size-6 place-items-center rounded text-[11.5px] font-semibold text-white" style={{ background: SEQ[m.level + 2] }}>{m.level}</span> : <span className="text-ink-3">·</span>}</td>; })}<td className={`px-4 py-2 text-right tabular-nums ${p && p.rate !== null && p.rate < p.target ? 'font-medium text-bad' : ''}`}>{pct(p?.rate)} / {pct(p?.target, 0)}</td></tr>; })}</tbody></table></div>
          )}
        </Card>
      </div>

      {cs.offerings.length > 1 && (
        <Card className="mt-5" title="So sánh các lần mở" bodyClass="p-0">
          <div className="thin-scroll overflow-x-auto"><table className="w-full min-w-[560px] text-[13px]"><thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-4 py-2 font-medium">Học kỳ</th><th className="px-2 py-2 font-medium">Lớp HP</th><th className="px-2 py-2 font-medium">Giảng viên</th><th className="px-2 py-2 text-right font-medium">Sĩ số</th><th className="px-2 py-2 text-right font-medium">Điểm TB</th><th className="px-4 py-2 text-right font-medium">Tỷ lệ đạt</th></tr></thead>
            <tbody>{cs.offerings.map(o => <tr key={o.section.id} className="border-b border-[#eef1f5] last:border-0"><td className="px-4 py-2">{o.semester.code}</td><td className="px-2 py-2">{o.section.code}</td><td className="px-2 py-2">{o.lecturer?.fullName}</td><td className="px-2 py-2 text-right">{o.registered}</td><td className="px-2 py-2 text-right tabular-nums">{num(o.avgScore, 2)}</td><td className="px-4 py-2 text-right tabular-nums">{pct(o.passRate)}</td></tr>)}</tbody></table></div>
        </Card>
      )}
      {!cs.offerings.length && <Card className="mt-5"><EmptyState icon={<BookOpen className="size-5" />} title="Học phần chưa có lần mở nào có điểm">Kết quả sẽ hiển thị sau khi học kỳ kết thúc và có điểm.</EmptyState></Card>}
    </>
  );
}

/** Kết quả AI theo 5 câu hỏi của học phần */
function CourseAi({ r, loading, error }: { r: ReturnType<typeof useAiRun<AiResponse>>['result']; loading: boolean; error: string | null }) {
  const d = r?.data;
  const cloF = d?.findings.filter(f => /CLO/i.test(f.statement) || f.refs.some(x => x.startsWith('CLO:'))) ?? [];
  const otherF = d?.findings.filter(f => !cloF.includes(f)) ?? [];
  const Q = ({ n, q, children }: { n: number; q: string; children: React.ReactNode }) => <div className="rounded-lg border border-line p-3"><h4 className="mb-2 text-[13px] font-semibold text-navy-800"><span className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-navy-700 text-[11px] text-white">{n}</span>{q}</h4>{children}</div>;
  const none = <p className="text-[12.5px] text-ink-3">Không có nội dung có căn cứ.</p>;
  return (
    <Card className="mb-4 border-navy-200" title={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-4 text-navy-500" />AI Analyze Course</span>} subtitle="Nguyên nhân sư phạm chỉ là INFERENCE kèm cách kiểm chứng; số liệu đã được đối chiếu với dữ liệu hệ thống.">
      {error && <Alert tone="bad">{error}</Alert>}
      {loading && <AiLoading label="AI đang phân tích học phần (chỉ dữ liệu của học phần này)…" />}
      {r && d && !loading && (
        <div className="space-y-3">
          <ProviderBadge r={r} />
          {r.fallbackReason && <Alert tone="info">Phân tích bằng quy tắc (không dùng AI): {r.fallbackReason}</Alert>}
          <div className="grid gap-3 lg:grid-cols-2">
            <Q n={1} q="Kết quả hiện tại thế nào?"><p className="text-[13px] leading-relaxed">{d.summary}</p>{d.facts.slice(0, 3).map((f, i) => <p key={i} className="mt-1 flex gap-1.5 text-[12px] text-ink-2"><ClaimTag kind="fact" />{f.statement}</p>)}</Q>
            <Q n={2} q="CLO nào thấp?">{cloF.length ? <ul className="space-y-2">{cloF.map((f, i) => <FindingItem key={i} f={f} />)}</ul> : none}</Q>
            <Q n={3} q="Có dấu hiệu bất thường không?">{otherF.length ? <ul className="space-y-2">{otherF.map((f, i) => <FindingItem key={i} f={f} />)}</ul> : none}</Q>
            <Q n={4} q="Những vấn đề nào cần xem xét?">{d.risks.length ? <ul className="space-y-2">{d.risks.map((f, i) => <FindingItem key={i} f={f} />)}</ul> : none}</Q>
          </div>
          <Q n={5} q="Đề xuất cải tiến nào?">{d.recommendations.length ? <ul className="grid gap-2">{d.recommendations.map((x, i) => <RecItem key={i} r={x} decisionKey={`${r.id}:r${i}`} provider={r.provider} />)}</ul> : none}</Q>
          {d.data_gaps.length > 0 && <div className="text-[12.5px] text-ink-2"><b className="inline-flex items-center gap-1 font-medium"><AlertTriangle className="size-3.5" />Dữ liệu còn thiếu:</b> {d.data_gaps.join(' ')}</div>}
          <AiMeta r={r} />
        </div>
      )}
    </Card>
  );
}
