/* CÔNG VIỆC — Today's priorities, Overdue tasks, danh sách đầy đủ; trạng thái “Quá hạn” do quy tắc tính */
import { useState } from 'react';
import { AlarmClock, CalendarClock, CheckCircle2, ListTodo } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, date } from '../lib/format';
import { href } from '../lib/router';
import { dataService } from '../services/dataService';
import { TASK_STATUS_LABEL, type TaskStatus } from '../domain/rules';
import type { Task } from '../types/domain';
import { DataTable, type Column } from '../components/DataTable';
import { Card, EmptyState, PageHeader, Select, StatCard, StatGrid, toast } from '../components/ui';
import { PriorityBadge, TaskBadge } from '../components/status';

type Row = ReturnType<ReturnType<typeof useApp>['A']['taskRows']>[number];
const PR = { high: 0, medium: 1, low: 2 } as const;

function StateSelect({ r, showOverdue = true }: { r: Row; showOverdue?: boolean }) {
  const { canOnOwn } = useApp();
  const [busy, setBusy] = useState(false);
  if (!canOnOwn('task.update', r.task.ownerId)) return <TaskBadge s={r.status} />;
  const change = async (state: Task['state']) => { setBusy(true); try { await dataService.updateTask(r.task.id, { state }); toast.ok(`${r.task.code}: ${state === 'done' ? 'đã hoàn thành' : 'đã cập nhật'}`); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {/* Badge chỉ hiện khi quy tắc cho kết quả khác trạng thái lưu (Quá hạn) — tránh lặp thông tin */}
      {showOverdue && r.status === 'overdue' && <TaskBadge s={r.status} />}
      <Select aria-label={`Cập nhật trạng thái ${r.task.code}`} disabled={busy} value={r.task.state} onChange={e => void change(e.target.value as Task['state'])} className="h-8 w-[152px] px-2 text-[12.5px]">
        <option value="not_started">Chưa bắt đầu</option><option value="in_progress">Đang thực hiện</option><option value="done">Hoàn thành</option>
      </Select>
    </div>
  );
}

export default function Tasks() {
  const { A } = useApp();
  const [status, setStatus] = useState<TaskStatus | ''>(''); const [owner, setOwner] = useState('');
  const rows = A.taskRows();
  const soon = A.settings.task.dueSoonDays;
  const overdue = rows.filter(r => r.status === 'overdue').sort((a, b) => a.daysLeft - b.daysLeft);
  // Ưu tiên hôm nay: chưa xong, chưa quá hạn, (ưu tiên cao) hoặc đến hạn trong dueSoonDays ngày
  const today = rows.filter(r => r.status !== 'done' && r.status !== 'overdue' && (r.daysLeft <= soon || r.task.priority === 'high')).sort((a, b) => PR[a.task.priority] - PR[b.task.priority] || a.daysLeft - b.daysLeft).slice(0, 8);
  const filtered = rows.filter(r => (!status || r.status === status) && (!owner || r.task.ownerId === owner));
  const cols: Column<Row>[] = [
    { key: 'task', header: 'Task', sort: r => r.task.code, render: r => <div className="min-w-56"><p className="font-medium leading-snug">{r.task.title}</p><p className="text-[11.5px] text-ink-3">{r.task.code}</p></div> },
    { key: 'owner', header: 'Owner', sort: r => r.owner?.fullName ?? '', render: r => <span className="whitespace-nowrap">{r.owner?.fullName ?? '—'}</span>, hideBelow: 'md' },
    { key: 'prio', header: 'Priority', sort: r => PR[r.task.priority], render: r => <PriorityBadge p={r.task.priority} /> },
    { key: 'deadline', header: 'Deadline', sort: r => r.task.deadline, render: r => <div className="whitespace-nowrap">{date(r.task.deadline)}{r.status !== 'done' && <div className={r.daysLeft < 0 ? 'text-[11px] text-bad' : 'text-[11px] text-ink-3'}>{r.daysLeft < 0 ? `trễ ${-r.daysLeft} ngày` : `còn ${r.daysLeft} ngày`}</div>}</div> },
    { key: 'status', header: 'Status', sort: r => ['overdue', 'in_progress', 'not_started', 'done'].indexOf(r.status), render: r => <StateSelect r={r} /> },
    { key: 'kpi', header: 'KPI', render: r => (r.task.kpiId ? <a href={href(`kpi/${r.task.kpiId}`)} onClick={e => e.stopPropagation()} className="whitespace-nowrap text-navy-700 hover:underline">{A.get('kpis', r.task.kpiId)?.code}</a> : '—'), hideBelow: 'lg' },
    { key: 'qa', header: 'Hoạt động BĐCL', render: r => <span className="whitespace-nowrap">{A.get('qaActivities', r.task.qaActivityId)?.code ?? '—'}</span>, hideBelow: 'lg' },
  ];
  const Mini = ({ r }: { r: Row }) => (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug text-ink">{r.task.title}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-2"><span>{r.owner?.fullName}</span><span aria-hidden className="text-ink-3">·</span><span className="whitespace-nowrap">Hạn {date(r.task.deadline)}</span><span className={cx('whitespace-nowrap font-medium', r.daysLeft < 0 ? 'text-bad' : r.daysLeft <= 7 ? 'text-warn' : 'text-ink-2')}>{r.daysLeft < 0 ? `trễ ${-r.daysLeft} ngày` : `còn ${r.daysLeft} ngày`}</span></p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5"><PriorityBadge p={r.task.priority} /><StateSelect r={r} showOverdue={false} /></div>
    </li>
  );
  return (
    <>
      <PageHeader title="Công việc" subtitle={`Trạng thái lưu: Chưa bắt đầu / Đang thực hiện / Hoàn thành; “Quá hạn” do quy tắc (chưa xong và đã qua hạn ${date(A.ref)}).`} />
      <StatGrid>
        <StatCard label="Tổng công việc" value={rows.length} icon={<ListTodo className="size-4" />} sub={`${rows.filter(r => r.status !== 'done').length} chưa hoàn thành`} />
        <StatCard label="Quá hạn" value={overdue.length} icon={<AlarmClock className="size-4" />} tone={overdue.length ? 'bad' : 'ok'} sub={overdue.length ? `${overdue.filter(r => r.task.priority === 'high').length} việc ưu tiên cao` : 'Không có việc quá hạn'} />
        <StatCard label={`Đến hạn trong ${soon} ngày`} value={rows.filter(r => r.status !== 'done' && r.status !== 'overdue' && r.daysLeft <= soon).length} icon={<CalendarClock className="size-4" />} tone="warn" sub="Chưa quá hạn, cần theo dõi" />
        <StatCard label="Hoàn thành đúng hạn" value={`${Math.round((A.metric('tasks.ontime_rate', A.currentYear.id) ?? 0))}%`} icon={<CheckCircle2 className="size-4" />} sub="KPI-CV-01 (việc đã đến hạn)" />
      </StatGrid>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Today's priorities" subtitle={`Ưu tiên cao hoặc đến hạn trong ${soon} ngày`} bodyClass="py-1 sm:py-1">{today.length ? <ul className="divide-y divide-[#eef1f5]">{today.map(r => <Mini key={r.task.id} r={r} />)}</ul> : <EmptyState title="Không có việc ưu tiên hôm nay" />}</Card>
        <Card title="Overdue tasks" subtitle="Sắp theo số ngày trễ" bodyClass="py-1 sm:py-1">{overdue.length ? <ul className="divide-y divide-[#eef1f5]">{overdue.map(r => <Mini key={r.task.id} r={r} />)}</ul> : <EmptyState title="Không có việc quá hạn" />}</Card>
      </div>
      <Card className="mt-5" title="Tất cả công việc">
        <DataTable rows={filtered} columns={cols} rowKey={r => r.task.id} pageSize={10} search={r => `${r.task.code} ${r.task.title} ${r.owner?.fullName ?? ''}`} initialSort={{ key: 'status', dir: 'asc' }}
          toolbar={<>
            <Select aria-label="Trạng thái" value={status} onChange={e => setStatus(e.target.value as TaskStatus | '')} className="w-auto"><option value="">Mọi trạng thái</option>{(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(s => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</Select>
            <Select aria-label="Người phụ trách" value={owner} onChange={e => setOwner(e.target.value)} className="w-auto max-w-56"><option value="">Mọi người phụ trách</option>{[...new Set(rows.map(r => r.task.ownerId))].map(o => <option key={o} value={o}>{A.lecturerName(o)}</option>)}</Select>
          </>} />
      </Card>
    </>
  );
}
