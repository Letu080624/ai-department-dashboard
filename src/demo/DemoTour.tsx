/* =========================================================================
 * Bảng điều khiển trình diễn (Presenter panel) — 12 bước ~10 phút.
 *   Bước 0: chuẩn bị (kiểm tra dữ liệu gốc, trạng thái AI, kịch bản tự chọn từ dữ liệu)
 *   Bước 1–12: đi tới màn hình · tô sáng vùng cần chỉ · lời dẫn sinh từ dữ liệu · "Làm giúp" thao tác mẫu
 * Phím tắt: Alt+→ bước tiếp, Alt+← bước trước.
 * Mọi thao tác đều đi qua giao diện thật (không có dữ liệu dựng sẵn cho buổi demo).
 * ========================================================================= */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ChevronsDownUp, Clock, ListOrdered, MonitorPlay, MousePointerClick, Navigation, RotateCcw, X, XCircle } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx } from '../lib/format';
import { navigate } from '../lib/router';
import { aiService, type AiHealth } from '../services/aiService';
import { dataService } from '../services/dataService';
import { Badge, Button } from '../components/ui';
import { resolveScenario } from './scenario';
import { DEMO_STEPS, DEMO_TOTAL_SECONDS } from './steps';
import { startDemo } from './startDemo';
import { tour, useTour } from './tourStore';

/* ---------- Tô sáng vùng cần chỉ ---------- */
let spotTimer: ReturnType<typeof setTimeout> | undefined;
function spotlight(selector: string, waitMs = 6000) {
  clearTimeout(spotTimer);
  const t0 = Date.now();
  const tick = () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) { document.querySelectorAll('.demo-spot').forEach(x => x.classList.remove('demo-spot')); el.classList.add('demo-spot'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (Date.now() - t0 < waitMs) spotTimer = setTimeout(tick, 300);
  };
  tick();
}
const clearSpot = () => { clearTimeout(spotTimer); document.querySelectorAll('.demo-spot').forEach(x => x.classList.remove('demo-spot')); };
const waitFor = (selector: string, ms = 8000) => new Promise<HTMLElement | null>(res => { const t0 = Date.now(); const f = () => { const el = document.querySelector<HTMLElement>(selector); if (el) res(el); else if (Date.now() - t0 > ms) res(null); else setTimeout(f, 200); }; f(); });
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function DemoTour() {
  const t = useTour();
  const { A, version, login } = useApp();
  const scenario = useMemo(() => resolveScenario(A), [A, version]);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [now, setNow] = useState(Date.now());
  const [list, setList] = useState(false);
  const [busy, setBusy] = useState(false);
  const step = t.step >= 1 ? DEMO_STEPS[t.step - 1] : null;
  // Khi có hộp thoại (vd. hộp phê duyệt) → tạm thu gọn để không che nội dung khán giả cần xem
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { if (!t.active) return; const mo = new MutationObserver(() => setModalOpen(!!document.querySelector('[data-modal="center"]'))); mo.observe(document.body, { childList: true }); return () => mo.disconnect(); }, [t.active]);

  useEffect(() => { if (t.active && t.step === 0) void aiService.health(true).then(setHealth); }, [t.active, t.step]);
  useEffect(() => { if (!t.active || !t.startedAt) return; setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [t.active, t.startedAt]);
  // Vào bước: đi tới màn hình + tô sáng
  useEffect(() => {
    if (!t.active || !step || !scenario) { clearSpot(); return; }
    const route = step.route(scenario);
    if (window.location.hash.replace(/^#\/?/, '') !== route) navigate(route);
    const id = setTimeout(() => spotlight(step.spot(scenario), step.waitMs ?? 6000), 350);
    return () => clearTimeout(id);
  }, [t.active, t.step, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((n: number) => tour.go(Math.max(0, Math.min(DEMO_STEPS.length, n))), []);
  useEffect(() => {
    if (!t.active) return;
    const f = (e: KeyboardEvent) => { if (!e.altKey) return; if (e.key === 'ArrowRight') { e.preventDefault(); go(t.step + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(t.step - 1); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [t.active, t.step, go]);

  const doAction = async () => {
    if (!step?.action || !scenario) return;
    setBusy(true);
    try {
      if (step.action.kind === 'ask') {
        if (!window.location.hash.includes('/ai')) navigate('ai');
        await waitFor('#demo-ai-input');
        window.dispatchEvent(new CustomEvent('aidash:demo-ask', { detail: { question: scenario.question } }));
        spotlight('[data-demo="ai-result-latest"]', 45000);
      } else {
        const el = await waitFor(step.action.selector, 15000);
        el?.click();
        setTimeout(() => spotlight(step.spot(scenario), step.waitMs ?? 6000), 400);
      }
    } finally { setBusy(false); }
  };

  if (!t.active) return null;
  const elapsed = t.startedAt ? Math.max(0, (now - Date.parse(t.startedAt)) / 1000) : 0;
  const planned = DEMO_STEPS.slice(0, Math.max(0, t.step)).reduce((a, s) => a + s.seconds, 0);
  const approved = A.d.improvementActions.filter(a => a.origin === 'ai_approved');

  if (t.collapsed || modalOpen) return (
    <button type="button" onClick={() => tour.collapse(false)} className="no-print fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-xl hover:bg-navy-800">
      <MonitorPlay className="size-4 text-[#f6c45b]" />Trình diễn {t.step}/{DEMO_STEPS.length}{t.startedAt && <span className="tabular-nums text-navy-200">· {mmss(elapsed)}</span>}
    </button>
  );

  return (
    <aside aria-label="Bảng điều khiển trình diễn" className="no-print animate-in fixed bottom-3 left-3 z-[60] flex max-h-[min(78vh,640px)] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-[0_12px_40px_rgb(15_23_42/0.22)]">
      <div className="flex items-center gap-2 bg-navy-900 px-4 py-2.5 text-white">
        <MonitorPlay className="size-4 text-[#f6c45b]" />
        <p className="flex-1 whitespace-nowrap text-[13px] font-semibold">{step ? `Bước ${step.n}/${DEMO_STEPS.length}` : 'Chuẩn bị trình diễn'}</p>
        {t.startedAt && <span className={cx('inline-flex items-center gap-1 text-[12px] tabular-nums', elapsed > DEMO_TOTAL_SECONDS ? 'text-[#fca5a5]' : 'text-navy-200')} title="Thời gian đã trình diễn / kế hoạch đến hết bước này"><Clock className="size-3.5" />{mmss(elapsed)} / {mmss(planned)}</span>}
        <button type="button" aria-label="Danh sách bước" onClick={() => setList(l => !l)} className="rounded p-1 hover:bg-white/10"><ListOrdered className="size-4" /></button>
        <button type="button" aria-label="Thu gọn" onClick={() => tour.collapse(true)} className="rounded p-1 hover:bg-white/10"><ChevronsDownUp className="size-4" /></button>
        <button type="button" aria-label="Kết thúc trình diễn" onClick={() => { clearSpot(); tour.close(); }} className="rounded p-1 hover:bg-white/10"><X className="size-4" /></button>
      </div>
      <div className="h-1 bg-navy-50"><div className="h-full bg-[#f6c45b] transition-all" style={{ width: `${(t.step / DEMO_STEPS.length) * 100}%` }} /></div>

      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-3 text-[13px]">
        {list ? (
          <ol className="space-y-0.5">
            <li><button type="button" onClick={() => { setList(false); go(0); }} className={cx('w-full rounded-md px-2 py-1.5 text-left hover:bg-navy-50', t.step === 0 && 'bg-navy-50 font-semibold')}>0. Chuẩn bị</button></li>
            {DEMO_STEPS.map(s => <li key={s.n}><button type="button" onClick={() => { setList(false); go(s.n); }} className={cx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-navy-50', t.step === s.n && 'bg-navy-50 font-semibold')}><span>{s.n}. {s.title}</span><span className="text-[11.5px] text-ink-3">{mmss(s.seconds)}</span></button></li>)}
          </ol>
        ) : !scenario ? (
          <p className="text-bad">Không dựng được kịch bản: dữ liệu không có KPI chưa đạt hoặc học phần có kết quả.</p>
        ) : t.step === 0 ? (
          <Preflight health={health} scenario={scenario} />
        ) : step && (
          <div className="space-y-3">
            <h3 className="text-[15px] font-semibold text-navy-900">{step.title} <span className="text-[12px] font-normal text-ink-3">≈ {step.seconds}s</span></h3>
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Lời dẫn</p><ul className="list-disc space-y-1 pl-4 leading-relaxed text-ink">{step.say(A, scenario).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <p className="rounded-lg bg-[#fff8e6] px-3 py-2 text-[12.5px] text-[#713f12]"><b className="font-semibold">Chỉ cho khán giả:</b> {step.look}</p>
            {step.n === 11 && (approved.length ? <p className="flex items-center gap-1.5 text-[12.5px] text-ok"><CheckCircle2 className="size-4" />Đã tạo {approved.map(a => a.code).join(', ')} — có trong BĐCL → Cải tiến và nhật ký.</p> : <p className="text-[12.5px] text-ink-2">Chờ người dùng bấm “Xác nhận tạo” trong hộp phê duyệt.</p>)}
          </div>
        )}
      </div>

      {!list && scenario && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-3 py-2.5">
          {t.step === 0 ? (<>
            <Button size="sm" variant="ghost" onClick={() => { clearSpot(); tour.close(); }}>Đóng</Button>
            <div className="ml-auto flex gap-2">
              {dataService.hasLocalChanges() && <Button size="sm" icon={<RotateCcw className="size-3.5" />} loading={busy} onClick={async () => { setBusy(true); await startDemo(login); setBusy(false); }}>Khôi phục dữ liệu gốc</Button>}
              <Button size="sm" variant="primary" icon={<ChevronRight className="size-3.5" />} onClick={() => go(1)}>Bắt đầu</Button>
            </div>
          </>) : (<>
            <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-3.5" />} onClick={() => go(t.step - 1)} aria-label="Bước trước">Trước</Button>
            <Button size="sm" variant="ghost" icon={<Navigation className="size-3.5" />} onClick={() => { if (step) { navigate(step.route(scenario)); setTimeout(() => spotlight(step.spot(scenario), step.waitMs ?? 6000), 350); } }}>Chỉ lại</Button>
            <div className="ml-auto flex gap-2">
              {step?.action && <Button size="sm" icon={<MousePointerClick className="size-3.5" />} loading={busy} onClick={() => void doAction()}>{step.action.label}</Button>}
              {t.step < DEMO_STEPS.length ? <Button size="sm" variant="primary" icon={<ChevronRight className="size-3.5" />} onClick={() => go(t.step + 1)}>Tiếp</Button>
                : <Button size="sm" variant="success" onClick={() => { clearSpot(); tour.close(); }}>Kết thúc</Button>}
            </div>
          </>)}
        </div>
      )}
    </aside>
  );
}

function Preflight({ health, scenario }: { health: AiHealth | null; scenario: NonNullable<ReturnType<typeof resolveScenario>> }) {
  const pristine = !dataService.hasLocalChanges();
  const Row = ({ ok, label, detail, warn }: { ok: boolean; label: string; detail: string; warn?: boolean }) => (
    <li className="flex items-start gap-2">{ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : warn ? <Badge tone="warn" icon={false} className="mt-0.5 px-1.5">!</Badge> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />}<span><b className="font-medium">{label}</b> <span className="text-ink-2">— {detail}</span></span></li>
  );
  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-semibold text-navy-900">Chuẩn bị trình diễn (~{Math.round(DEMO_TOTAL_SECONDS / 60)} phút)</h3>
      <ul className="space-y-1.5 text-[12.5px]">
        <Row ok={pristine} label="Dữ liệu" detail={pristine ? 'đang ở trạng thái mẫu gốc' : 'đã có thay đổi từ lần trước — nên khôi phục'} />
        <Row ok={!!health?.available && health.provider === 'gemini'} warn={!!health && !(health.available && health.provider === 'gemini')} label="AI" detail={!health ? 'đang kiểm tra…' : health.available ? (health.provider === 'gemini' ? `Gemini sẵn sàng (${health.model})` : 'chế độ Mock (kiểm thử)') : 'chưa có GEMINI_API_KEY → AI chạy chế độ quy tắc (vẫn trình diễn được; nên cấu hình key trước buổi họp)'} />
        {scenario.checks.map(c => <Row key={c.label} ok={c.ok} label={c.label} detail={c.detail} />)}
      </ul>
      <p className="rounded-lg bg-navy-50 px-3 py-2 text-[12px] text-ink-2">Kịch bản được chọn tự động từ dữ liệu. Dùng <b>Tiếp</b> / <b>Alt+→</b> để chuyển bước; <b>Làm giúp</b> thao tác mẫu trên giao diện thật; vùng cần chỉ được tô vàng.</p>
    </div>
  );
}
