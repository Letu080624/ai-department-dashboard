/* =========================================================================
 * AI DEPARTMENT COPILOT — không phải chatbot thuần:
 *   Câu hỏi → Nhận diện ý định (quy tắc) → Chọn dữ liệu liên quan → Context Builder → Gemini (server)
 *   → Kiểm tra cấu trúc + đối chiếu số liệu → Hiển thị có nhãn FACT/INFERENCE/RECOMMENDATION → Người dùng duyệt hành động.
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, CircleCheck, CircleDashed, Eraser, Send, ShieldCheck, Sparkles, User } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, dateTime } from '../lib/format';
import { href } from '../lib/router';
import { uiStorage } from '../data/repository';
import type { Scope } from '../ai/contextBuilder';
import { routeQuestion } from '../ai/copilotRouter';
import { TASKS, type TaskId } from '../ai/prompts';
import { AiInputError, aiService, type AiHealth, type AiRunResult } from '../services/aiService';
import { Alert, Badge, Button, Card, NoAccess, PageHeader, Select, Textarea } from '../components/ui';
import { AiResultView } from '../components/ai/AiResult';
import type { AiResponse } from '../ai/schema';

const SUGGESTED: { q: string; task: TaskId }[] = [
  { q: 'Có vấn đề gì cần tôi xử lý?', task: 'dashboard_analysis' },
  { q: 'KPI nào đang có nguy cơ không đạt?', task: 'kpi_risk' },
  { q: 'Giảng viên nào đang quá tải?', task: 'staff_workload' },
  { q: 'Học phần nào cần ưu tiên cải tiến?', task: 'course_priority' },
  { q: 'Minh chứng nào còn thiếu?', task: 'missing_evidence' },
  { q: 'Đề xuất kế hoạch cải tiến tháng này.', task: 'improvement_plan' },
  { q: 'Phân tích kết quả học tập học kỳ gần nhất.', task: 'learning_results' },
  { q: 'Tóm tắt tình hình nghiên cứu khoa học.', task: 'research_summary' },
];
interface Msg { id: string; at: string; question: string; task?: TaskId; scope?: Scope; result?: AiRunResult; error?: string; pending?: boolean; notice?: { text: string; link?: { href: string; label: string } } }

export default function Copilot() {
  const { A, user, can } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>(() => uiStorage.get<Msg[]>('chat', []).filter(m => !m.pending));
  const [q, setQ] = useState('');
  const [scopeType, setScopeType] = useState<Scope['type']>('department');
  const [scopeId, setScopeId] = useState('');
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Trình diễn: bảng điều khiển gửi câu hỏi mẫu qua sự kiện (đi qua đúng luồng như người dùng gõ)
  const askRef = useRef<(q: string) => Promise<void>>(async () => {});
  useEffect(() => { const f = (e: Event) => { const q = (e as CustomEvent<{ question: string }>).detail?.question; if (q) void askRef.current(q); }; window.addEventListener('aidash:demo-ask', f); return () => window.removeEventListener('aidash:demo-ask', f); }, []);
  useEffect(() => { void aiService.health().then(setHealth); }, []);
  useEffect(() => { uiStorage.set('chat', msgs.filter(m => !m.pending).slice(-10)); endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);

  const options = useMemo(() => scopeType === 'course' ? A.d.courses.map(c => ({ id: c.id, label: `${c.code} · ${c.name}`, code: c.code }))
    : scopeType === 'lecturer' ? A.d.lecturers.map(l => ({ id: l.id, label: `${l.code} · ${l.fullName}`, code: l.code }))
    : scopeType === 'kpi' ? A.d.kpis.map(k => ({ id: k.id, label: `${k.code} · ${k.name}`, code: k.code })) : [], [A, scopeType]);
  useEffect(() => { setScopeId(options[0]?.id ?? ''); }, [options]);
  if (!can('ai.use')) return <><PageHeader title="AI Department Copilot" /><NoAccess what="AI Assistant" /></>;

  /** Chọn tác vụ + phạm vi: logic nằm trong src/ai/copilotRouter.ts (kiểm thử độc lập) */
  const resolve = (question: string, fixed?: TaskId) => { const sel = options.find(o => o.id === scopeId); return routeQuestion(A, question, scopeType !== 'department' && sel ? { type: scopeType, id: sel.id, code: sel.code } : null, fixed); };
  const ask = async (question: string, fixed?: TaskId) => {
    const text = question.trim(); if (!text || busy) return;
    const rt = resolve(text, fixed);
    const id = `m-${Date.now().toString(36)}`;
    // Không gọi AI: mã không tồn tại (notice) hoặc yêu cầu thuộc trang khác (redirect)
    if (rt.kind !== 'ai') { setMsgs(m => [...m, { id, at: new Date().toISOString(), question: text, notice: { text: rt.message, link: rt.kind === 'redirect' ? { href: href(rt.target), label: 'Mở trang Báo cáo' } : rt.link ? { href: href(rt.link.target), label: rt.link.label } : undefined } }]); setQ(''); return; }
    const { task, scope } = rt;
    setMsgs(m => [...m, { id, at: new Date().toISOString(), question: text, task, scope, pending: true }]); setQ(''); setBusy(true);
    const history = msgs.filter(m => m.result).slice(-3).map(m => ({ question: m.question, summary: (m.result!.data as AiResponse).summary }));
    try { const r = await aiService.run(task, { question: text, scope, history, userId: user.id }); setMsgs(m => m.map(x => (x.id === id ? { ...x, result: r, pending: false } : x))); }
    catch (e) { setMsgs(m => m.map(x => (x.id === id ? { ...x, pending: false, error: e instanceof AiInputError ? e.message : `Không xử lý được yêu cầu: ${(e as Error).message}` } : x))); }
    finally { setBusy(false); }
  };
  askRef.current = ask;
  const last = [...msgs].reverse().find(m => m.result)?.result;
  const lastId = [...msgs].reverse().find(m => m.result)?.id;

  return (
    <>
      <PageHeader title="AI Department Copilot" subtitle="Trợ lý phân tích quản trị: chỉ dùng số liệu của hệ thống, phân biệt FACT / INFERENCE, nêu DATA GAP. Khuyến nghị là đề xuất — quyết định thuộc về người quản lý."
        actions={msgs.length > 0 && <Button variant="ghost" icon={<Eraser className="size-4" />} onClick={() => setMsgs([])}>Xoá hội thoại</Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {msgs.length === 0 && (
            <Card title="Câu hỏi gợi ý" subtitle="Mỗi câu hỏi gắn với một tác vụ phân tích có phạm vi dữ liệu xác định.">
              <div className="grid gap-2 sm:grid-cols-2">{SUGGESTED.map(s => <button key={s.q} type="button" disabled={busy} onClick={() => void ask(s.q, s.task)} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2.5 text-left text-[13px] hover:border-navy-200 hover:bg-navy-50/50 disabled:opacity-50"><span>{s.q}</span><ArrowRight className="size-4 shrink-0 text-ink-3" /></button>)}</div>
            </Card>
          )}
          {msgs.map(m => (
            <div key={m.id} className="space-y-2">
              <div className="flex justify-end"><div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-navy-700 px-3.5 py-2 text-[13.5px] text-white"><span className="min-w-0 break-words">{m.question}</span><User className="mt-0.5 size-4 shrink-0 opacity-70" /></div></div>
              <div className="flex items-start gap-2">
                <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-700"><Bot className="size-4" /></span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-white p-3.5 sm:p-4">
                  {m.task && m.scope && <p className="mb-2 text-[11.5px] text-ink-3">{TASKS[m.task].label} · {m.scope.type === 'department' ? 'Toàn Bộ môn' : `${m.scope.type === 'course' ? 'Học phần' : m.scope.type === 'lecturer' ? 'Giảng viên' : 'KPI'} ${m.scope.label}`} · {dateTime(m.at)}</p>}
                  {m.notice && <Alert tone="info" title="Hệ thống (không dùng AI)">{m.notice.text}{m.notice.link && <a href={m.notice.link.href} className="ml-1 font-semibold">{m.notice.link.label} →</a>}</Alert>}
                  {m.pending && <Pipeline />}
                  {m.error && <Alert tone="bad">{m.error}</Alert>}
                  {m.result && <div data-demo={m.id === lastId ? 'ai-result-latest' : 'ai-result'}><AiResultView r={m.result} /></div>}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
          <Card bodyClass="p-3" className="sticky bottom-0 z-10 shadow-[0_-4px_16px_rgb(15_23_42/0.05)]">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-ink-2">Phạm vi dữ liệu:</span>
              <Select aria-label="Loại phạm vi" value={scopeType} onChange={e => setScopeType(e.target.value as Scope['type'])} className="h-8 w-auto text-[12.5px]"><option value="department">Toàn Bộ môn</option><option value="course">Một học phần</option><option value="lecturer">Một giảng viên</option><option value="kpi">Một KPI</option></Select>
              {scopeType !== 'department' && <Select aria-label="Đối tượng" value={scopeId} onChange={e => setScopeId(e.target.value)} className="h-8 w-auto max-w-72 text-[12.5px]">{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>}
            </div>
            <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void ask(q); }}>
              <Textarea id="demo-ai-input" aria-label="Câu hỏi cho AI" rows={2} maxLength={2000} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(q); } }} placeholder="Hỏi về KPI, học phần (vd. DAN305), giảng viên (vd. GV05), minh chứng, NCKH… (Enter để gửi)" className="min-h-[52px] flex-1" />
              <Button type="submit" variant="primary" loading={busy} disabled={!q.trim()} icon={<Send className="size-4" />} aria-label="Gửi">Gửi</Button>
            </form>
            {msgs.length > 0 && <div className="mt-2 flex gap-1.5 overflow-x-auto thin-scroll pb-0.5">{SUGGESTED.map(s => <button key={s.q} type="button" disabled={busy} onClick={() => void ask(s.q, s.task)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-navy-50 disabled:opacity-50">{s.q}</button>)}</div>}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card title="Trạng thái AI">
            {!health ? <p className="text-[12.5px] text-ink-2">Đang kiểm tra…</p> : health.available ? (
              <div className="space-y-1.5 text-[12.5px]"><Badge tone="ok">{health.provider === 'mock' ? 'Mock AI (thử nghiệm)' : 'Gemini sẵn sàng'}</Badge><p className="text-ink-2">Model: <code>{health.model}</code></p>{health.rateLimitPerMin && <p className="text-ink-2">Giới hạn: {health.rateLimitPerMin} yêu cầu/phút</p>}</div>
            ) : <div className="space-y-1.5 text-[12.5px]"><Badge tone="warn">Chưa dùng Gemini</Badge><p className="text-ink-2">{health.reason}</p><p className="text-ink-2">Copilot vẫn hoạt động bằng phân tích theo quy tắc (không suy luận). Cấu hình <code>GEMINI_API_KEY</code> trong Secrets của AI Studio để bật Gemini.</p></div>}
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-3"><ShieldCheck className="mt-px size-3.5 shrink-0" />Khoá API chỉ ở server. Trình duyệt chỉ gửi dữ liệu đã chọn lọc (không có dữ liệu cá nhân người học).</p>
          </Card>
          <Card title="Quy trình xử lý">
            <ol className="space-y-1.5 text-[12.5px]">{['Câu hỏi của bạn', 'Nhận diện ý định (quy tắc)', 'Chọn dữ liệu liên quan theo phạm vi', 'Context Builder (giới hạn kích thước)', 'Gemini — structured output (server)', 'Kiểm tra schema + đối chiếu số liệu', 'Hiển thị FACT / INFERENCE / RECOMMENDATION', 'Bạn duyệt / sửa / từ chối hành động'].map((s, i) => <li key={s} className="flex items-center gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-navy-50 text-[11px] font-semibold text-navy-700">{i + 1}</span>{s}</li>)}</ol>
            {last && <p className="mt-3 text-[11.5px] text-ink-3">Lần gần nhất: {last.sections.join(', ')} · {last.contextChars.toLocaleString('vi-VN')} ký tự · {last.provider}</p>}
          </Card>
          <Card title="Nguyên tắc AI">
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-ink-2">
              <li>Không bịa số liệu; số không khớp dữ liệu bị loại hoặc hạ thành INFERENCE.</li><li>Không thay đổi dữ liệu, không tự tạo KPI hay minh chứng.</li>
              <li>Không khẳng định nguyên nhân khi thiếu dữ liệu — nêu DATA GAP.</li><li>Trạng thái KPI, cảnh báo, rủi ro do quy tắc hệ thống tính.</li>
              <li>Hành động chỉ được tạo khi bạn bấm Approve (ghi nhật ký).</li>
            </ul>
            <a href={href('reports')} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-700 hover:underline"><Sparkles className="size-3.5" />Tạo báo cáo Bộ môn</a>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Pipeline() {
  const steps = ['Nhận diện ý định', 'Chọn dữ liệu', 'Context Builder', 'Gọi AI', 'Kiểm tra số liệu'];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => Math.min(x + 1, steps.length - 1)), 700); return () => clearInterval(t); }, [steps.length]);
  return <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-live="polite">{steps.map((s, k) => <li key={s} className={cx('inline-flex items-center gap-1', k < i ? 'text-ok' : k === i ? 'font-medium text-navy-700' : 'text-ink-3')}>{k < i ? <CircleCheck className="size-3.5" /> : <CircleDashed className={cx('size-3.5', k === i && 'animate-spin')} />}{s}</li>)}</ol>;
}
