/* =========================================================================
 * aiService — AI layer phía trình duyệt (độc lập giao diện)
 *
 *   UI ──► aiService.run(task, {question, scope})
 *            ├─ Context Builder: chọn lọc dữ liệu liên quan (không gửi toàn bộ dữ liệu)
 *            ├─ Cache: cùng tác vụ + phạm vi + phiên bản dữ liệu → dùng lại (không gọi lại Gemini)
 *            ├─ POST /api/ai/generate ──► server.ts ──► Gemini (API key chỉ ở server)
 *            ├─ Response parser: kiểm tra cấu trúc + đối chiếu số liệu lần nữa tại trình duyệt
 *            └─ Dự phòng bằng quy tắc khi: không có key, server lỗi, quá thời gian, hết hạn mức
 * AI chỉ được gọi khi người dùng yêu cầu (bấm nút / gửi câu hỏi) — không gọi khi render.
 * ========================================================================= */
import { buildContext, type BuiltContext, type Scope } from '../ai/contextBuilder';
import { TASKS, type TaskId } from '../ai/prompts';
import { checkWarnings, mergeChecks, parseReport, parseResponse, trustOf, type ParseChecks } from '../ai/responseParser';
import { ruleReport, ruleResponse } from '../ai/ruleProvider';
import type { AiResponse, ReportNarrative } from '../ai/schema';
import { uiStorage } from '../data/repository';
import { dataService } from './dataService';

export interface AiHealth { available: boolean; provider?: string; model?: string; reason?: string | null; rateLimitPerMin?: number }
export interface AiRunResult<D = AiResponse | ReportNarrative> {
  id: string; at: string; task: TaskId; label: string; question: string; scope: Scope;
  provider: 'gemini' | 'mock' | 'rules'; model: string | null; data: D; checks: ParseChecks; trust: 'verified' | 'warning' | 'failed';
  warnings: string[]; fallbackReason?: string; latencyMs: number; usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  contextChars: number; sections: string[]; truncated: string[]; cached?: boolean; dataVersion: number;
}
export interface AiLog { id: string; at: string; userId: string | null; task: TaskId; provider: string; model: string | null; status: 'ok' | 'fallback'; error?: string; latencyMs: number; tokens: number | null; contextChars: number; trust: string }
export class AiInputError extends Error {}

const CLIENT_TIMEOUT_MS = 90000;
let health: AiHealth | null = null, healthAt = 0;
const cache = new Map<string, AiRunResult>();
const inflight = new Map<string, Promise<AiRunResult>>();

async function fetchJson(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...init, signal: ac.signal }); let j: unknown = null; try { j = await r.json(); } catch { /* không phải JSON */ } return { r, j: j as Record<string, any> | null }; } // eslint-disable-line @typescript-eslint/no-explicit-any
  finally { clearTimeout(t); }
}

export const aiService = {
  tasks: TASKS,
  async health(force = false): Promise<AiHealth> {
    if (!force && health && Date.now() - healthAt < 60000) return health;
    try {
      const { r, j } = await fetchJson('/api/health', { cache: 'no-store' }, 5000);
      health = r.ok && j ? { available: !!j.configured, provider: j.provider, model: j.model, reason: j.message, rateLimitPerMin: j.rateLimitPerMin } : { available: false, reason: `AI server trả lỗi ${r.status}` };
    } catch { health = { available: false, reason: 'Không kết nối được AI server (chế độ Demo tĩnh) — dùng phân tích bằng quy tắc.' }; }
    healthAt = Date.now(); return health;
  },
  /** Lấy kết quả đã có trong cache (KHÔNG gọi AI) — dùng khi render trang */
  peek(task: TaskId, scope?: Scope | null, question = ''): AiRunResult | null {
    try {
      const A = dataService.analytics, dk = dataService.getState().dataKey, sc = scope ?? { type: 'department' as const };
      const key = `${task}|${sc.type}:${sc.id ?? ''}|${question.trim().slice(0, 2000).toLowerCase()}|d${dk}|${A.ref}`;
      const hit = cache.get(key) ?? uiStorage.get<Record<string, AiRunResult>>('aiCache', {})[key];
      return hit && Date.now() - Date.parse(hit.at) < A.settings.ai.cacheMinutes * 60000 ? { ...hit, cached: true } : null;
    } catch { return null; }
  },
  logs(): AiLog[] { return uiStorage.get<AiLog[]>('aiLogs', []); },
  clearCache() { cache.clear(); uiStorage.set('aiCache', {}); },

  /** Chạy một tác vụ AI. Trả kết quả đã kiểm tra; không bao giờ ném lỗi do Gemini (luôn có dự phòng). */
  async run(task: TaskId, opt: { question?: string; scope?: Scope | null; history?: { question: string; summary: string }[]; force?: boolean; userId?: string | null } = {}): Promise<AiRunResult> {
    const T = TASKS[task]; if (!T) throw new AiInputError(`Tác vụ không hợp lệ: ${task}`);
    const question = (opt.question ?? '').trim().slice(0, 2000);
    if (task === 'free_question' && !question) throw new AiInputError('Vui lòng nhập câu hỏi.');
    const A = dataService.analytics, version = dataService.getState().version, dk = dataService.getState().dataKey;
    const scope = opt.scope ?? { type: 'department' as const };
    const key = `${task}|${scope.type}:${scope.id ?? ''}|${question.toLowerCase()}|d${dk}|${A.ref}`;
    if (!opt.force) {
      const hit = cache.get(key) ?? (uiStorage.get<Record<string, AiRunResult>>('aiCache', {})[key]);
      const ttl = A.settings.ai.cacheMinutes * 60000;
      if (hit && Date.now() - Date.parse(hit.at) < ttl) { cache.set(key, hit); return { ...hit, cached: true }; }
      if (inflight.has(key)) return inflight.get(key)!;
    }
    const p = this.execute(task, question, scope, opt, version).finally(() => inflight.delete(key));
    inflight.set(key, p);
    const res = await p;
    cache.set(key, res);
    const stored = uiStorage.get<Record<string, AiRunResult>>('aiCache', {}); stored[key] = res;
    const keys = Object.keys(stored).slice(-15); uiStorage.set('aiCache', Object.fromEntries(keys.map(k => [k, stored[k]])));
    return res;
  },

  async execute(task: TaskId, question: string, scope: Scope, opt: { history?: { question: string; summary: string }[]; userId?: string | null }, version: number): Promise<AiRunResult> {
    const t0 = Date.now(), T = TASKS[task], isReport = T.schema === 'report';
    const A = dataService.analytics;
    let built: BuiltContext;
    try { built = buildContext(A, task, { question, scope }); }
    catch (e) { throw new AiInputError((e as Error).message); }
    const parse = (raw: unknown, trusted: boolean) => (isReport ? parseReport(raw, built.context, { trustedSystemFields: trusted }) : parseResponse(raw, built.context, { trustedSystemFields: trusted }));
    let out: Omit<AiRunResult, 'id' | 'at' | 'latencyMs' | 'warnings'> | null = null; let fallbackReason: string | undefined;
    const h = await this.health();
    if (h.available) {
      try {
        const { r, j } = await fetchJson('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, question, context: built.context, history: (opt.history ?? []).slice(-3) }) }, CLIENT_TIMEOUT_MS);
        if (!r.ok || !j?.ok) {
          const code = j?.error?.code ?? `http_${r.status}`;
          if (code === 'rate_limited') health = null;
          throw new Error(`${j?.error?.message ?? `AI server lỗi ${r.status}`} (${code})`);
        }
        const p = parse(j.result, true);   // phòng thủ nhiều lớp: kiểm tra lại tại trình duyệt
        if (!p.ok) throw new Error(`Phản hồi AI không đúng cấu trúc: ${p.errors.join('; ')}`);
        const checks = mergeChecks(j.checks as Partial<ParseChecks> | null, p.checks);   // không làm mất cảnh báo server đã phát hiện
        out = { task, label: T.label, question, scope, provider: j.model === 'mock' ? 'mock' : 'gemini', model: j.model, data: p.data!, checks, trust: trustOf(checks), usage: j.usage, contextChars: built.chars, sections: built.sections, truncated: built.truncated, dataVersion: version };
      } catch (e) { fallbackReason = (e as Error).name === 'AbortError' ? 'Quá thời gian chờ AI (timeout)' : (e as Error).message; }
    } else fallbackReason = h.reason ?? 'AI không khả dụng';
    if (!out) {
      const raw = isReport ? ruleReport(built.context) : ruleResponse(task, built.context);
      const p = parse(raw, false);
      out = { task, label: T.label, question, scope, provider: 'rules', model: null, data: p.data!, checks: p.checks, trust: p.trust, contextChars: built.chars, sections: built.sections, truncated: built.truncated, dataVersion: version };
    }
    const res: AiRunResult = { ...out, id: `ai-${Date.now().toString(36)}`, at: new Date().toISOString(), latencyMs: Date.now() - t0, warnings: checkWarnings(out.checks), fallbackReason };
    // Nhật ký sử dụng AI (giám sát) + audit
    const log: AiLog = { id: res.id, at: res.at, userId: opt.userId ?? null, task, provider: res.provider, model: res.model, status: res.provider === 'rules' ? 'fallback' : 'ok', error: fallbackReason, latencyMs: res.latencyMs, tokens: res.usage?.totalTokens ?? null, contextChars: res.contextChars, trust: res.trust };
    uiStorage.set('aiLogs', [log, ...this.logs()].slice(0, 200));
    void dataService.audit('ai.request', 'ai_analysis', res.id, null, { task, provider: res.provider, model: res.model, scope: `${scope.type}:${scope.label ?? scope.id ?? ''}`, context_chars: res.contextChars, trust: res.trust });
    return res;
  },
};
