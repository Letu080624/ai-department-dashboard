/* =========================================================================
 * server.ts — Full-stack server theo mẫu Google AI Studio Build (Express + Vite middleware)
 *
 *   Trình duyệt ──► POST /api/ai/generate ──► (server) prompt + Gemini ──► kiểm tra/đối chiếu ──► JSON
 *   GEMINI_API_KEY CHỈ được đọc ở đây (AI Studio cấp dưới dạng secret phía server).
 *
 * Endpoint:
 *   GET  /api/health          trạng thái AI (không lộ key)
 *   POST /api/ai/generate     { task, question?, context, history? } → kết quả đã kiểm tra
 *   GET  /api/v1/snapshot     dữ liệu mẫu chỉ-đọc (minh hoạ HttpRepository; Production: thay bằng PostgreSQL)
 * Chạy: npm run dev (phát triển) · npm run build && npm start (production)
 * ========================================================================= */
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { buildPrompt, PROMPT_VERSION, TASKS, type TaskId } from './src/ai/prompts';
import { parseReport, parseResponse } from './src/ai/responseParser';
import { ruleReport, ruleResponse } from './src/ai/ruleProvider';
import { AiError, GeminiClient } from './server/gemini';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT || 3000);
const PROD = env.NODE_ENV === 'production';

/* ---------------- Cấu hình (biến môi trường, không hard-code) ---------------- */
const CFG = {
  provider: (env.AI_PROVIDER || 'gemini').toLowerCase() as 'gemini' | 'mock' | 'off',
  model: env.GEMINI_MODEL || 'gemini-3.8-flash',
  fallbackModels: (env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.5-flash-lite').split(',').map(s => s.trim()).filter(Boolean),
  timeoutMs: Number(env.AI_TIMEOUT_MS || 30000),
  maxRetries: Number(env.AI_MAX_RETRIES ?? 2),
  ratePerMin: Number(env.AI_RATE_LIMIT_PER_MIN || 12),
  maxContextChars: Number(env.AI_MAX_CONTEXT_CHARS || 60000),
};
const apiKey = (env.GEMINI_API_KEY || '').trim();
const keyLooksReal = apiKey.length > 20 && !/^MY_|YOUR_|PLACEHOLDER/i.test(apiKey);
const gemini = CFG.provider === 'gemini' && keyLooksReal ? new GeminiClient({ apiKey, model: CFG.model, fallbackModels: CFG.fallbackModels, timeoutMs: CFG.timeoutMs, maxRetries: CFG.maxRetries }) : null;
const configured = CFG.provider === 'mock' || !!gemini;
const notConfiguredReason = CFG.provider === 'off' ? 'AI đang tắt (AI_PROVIDER=off).' : !keyLooksReal ? 'Chưa cấu hình GEMINI_API_KEY ở server (AI Studio: Settings → Secrets; chạy ngoài: file .env).' : null;

/* ---------------- Tiện ích ---------------- */
const log = (rec: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...rec }));
const sendErr = (res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}) => res.status(status).json({ ok: false, error: { code, message, ...extra } });
const hits = new Map<string, number[]>();
function rateLimited(ip: string): number {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(t => now - t < 60000);
  if (list.length >= CFG.ratePerMin) { hits.set(ip, list); return Math.ceil((60000 - (now - list[0])) / 1000); }
  list.push(now); hits.set(ip, list); return 0;
}
/** Không gửi trường nhạy cảm lên Gemini dù client có gửi kèm */
const DENY_KEYS = /^(email|phone|password|token|api_?key|secret|address|birth_?date|national_id|student_name|full_name_student)$/i;
function sanitizeContext(v: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.slice(0, 400).map(x => sanitizeContext(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !DENY_KEYS.test(k)).map(([k, x]) => [k, sanitizeContext(x, depth + 1)]));
  if (typeof v === 'string') return v.slice(0, 2000);
  return v;
}

/* ---------------- App ---------------- */
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CSP chỉ bật ở production (Vite dev cần script inline cho HMR). Không chặn nhúng khung vì AI Studio xem trước trong iframe.
  if (PROD) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
  next();
});
app.use('/api', express.json({ limit: '300kb' }));

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, configured, provider: CFG.provider, model: CFG.provider === 'mock' ? 'mock' : CFG.model, models: [CFG.model, ...CFG.fallbackModels], message: configured ? null : notConfiguredReason, promptVersion: PROMPT_VERSION, rateLimitPerMin: CFG.ratePerMin, maxContextChars: CFG.maxContextChars });
});

app.get('/api/v1/snapshot', (_req, res) => {
  // Backend minh hoạ chỉ-đọc: cùng hình dạng DataSnapshot mà Repository phía client dùng.
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.resolve(__dirname, 'src/data/mock/seed.json'));
});

app.post('/api/ai/generate', async (req: Request, res: Response) => {
  const t0 = Date.now();
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
  const wait = rateLimited(ip);
  if (wait) { res.setHeader('Retry-After', String(wait)); return sendErr(res, 429, 'rate_limited', `Quá ${CFG.ratePerMin} yêu cầu AI/phút. Thử lại sau ${wait} giây.`, { retry_after: wait }); }
  if (!configured) return sendErr(res, 503, 'not_configured', notConfiguredReason || 'AI chưa được cấu hình');
  const body = req.body ?? {};
  const task = String(body.task ?? '') as TaskId;
  if (!TASKS[task]) return sendErr(res, 400, 'bad_request', `Tác vụ không hợp lệ: ${task}`);
  if (!body.context || typeof body.context !== 'object' || Array.isArray(body.context)) return sendErr(res, 400, 'bad_request', 'Thiếu DATA CONTEXT có cấu trúc');
  if (body.question !== undefined && typeof body.question !== 'string') return sendErr(res, 400, 'bad_request', 'question phải là chuỗi');
  const context = sanitizeContext(body.context) as Record<string, unknown>;
  const chars = JSON.stringify(context).length;
  if (chars > CFG.maxContextChars) return sendErr(res, 413, 'context_too_large', `Dữ liệu gửi AI ${chars} ký tự vượt giới hạn ${CFG.maxContextChars}.`);
  let prompt;
  try { prompt = buildPrompt(task, { context, question: body.question, history: Array.isArray(body.history) ? body.history : [] }); }
  catch (e) { return sendErr(res, 400, 'bad_request', (e as Error).message); }
  const isReport = TASKS[task].schema === 'report';
  const parse = (raw: unknown) => (isReport ? parseReport(raw, context) : parseResponse(raw, context));
  const baseLog = { route: 'ai.generate', task, ip_hash: crypto.createHash('sha256').update(ip).digest('hex').slice(0, 10), context_chars: chars, prompt_version: PROMPT_VERSION };
  try {
    let text: string, model: string, usage = null as unknown, attempts: unknown[] = [];
    if (CFG.provider === 'mock') {
      // Phản hồi giả lập để kiểm thử luồng (không gọi Gemini): dựng bằng quy tắc, gắn nhãn MOCK
      const data = isReport ? ruleReport(context) : { ...ruleResponse(task, context), summary: `[MOCK] ${ruleResponse(task, context).summary}` };
      text = JSON.stringify(data); model = 'mock';
    } else {
      const g = await gemini!.generate(prompt); text = g.text; model = g.model; usage = g.usage; attempts = g.attempts;
    }
    let parsed = parse(text);
    // Lộ chỉ dẫn hệ thống (prompt injection thành công) → chặn ngay, không thử lại, không trả nội dung về trình duyệt
    if (!parsed.ok && parsed.errors.some(e => e.startsWith('policy_leak'))) { log({ ...baseLog, status: 'blocked', reason: 'policy_leak', model }); return sendErr(res, 502, 'policy_violation', 'Phản hồi AI chứa nội dung chỉ dẫn hệ thống nên đã bị chặn.'); }
    if (!parsed.ok && gemini) {
      // Một lần sửa: nhiệt độ 0, nhiều token hơn (thường do JSON bị cắt hoặc lệch schema)
      const g = await gemini.generate({ ...prompt, temperature: 0, maxOutputTokens: Math.round(prompt.maxOutputTokens * 1.5) });
      parsed = parse(g.text); model = g.model; usage = g.usage; attempts = attempts.concat(g.attempts);
      if (!parsed.ok && parsed.errors.some(e => e.startsWith('policy_leak'))) { log({ ...baseLog, status: 'blocked', reason: 'policy_leak', model }); return sendErr(res, 502, 'policy_violation', 'Phản hồi AI chứa nội dung chỉ dẫn hệ thống nên đã bị chặn.'); }
    }
    if (!parsed.ok) { log({ ...baseLog, status: 'invalid_response', model, errors: parsed.errors }); return sendErr(res, 502, 'invalid_response', 'Phản hồi của AI không đúng cấu trúc yêu cầu.'); }
    const out = { ok: true, task, model, promptVersion: PROMPT_VERSION, result: parsed.data, checks: parsed.checks, trust: parsed.trust, usage, latencyMs: Date.now() - t0, attempts };
    log({ ...baseLog, status: 'ok', model, latency_ms: out.latencyMs, usage, trust: parsed.trust });
    return res.json(out);
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('unavailable', (e as Error).message);
    log({ ...baseLog, status: 'error', code: err.code, message: err.message, latency_ms: Date.now() - t0, attempts: (e as { attempts?: unknown }).attempts });
    return sendErr(res, err.status, err.code, err.message, err.retryAfterSec ? { retry_after: err.retryAfterSec } : {});
  }
});
app.use('/api', (_req, res) => sendErr(res, 404, 'not_found', 'Không có endpoint này'));
app.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.too.large') return sendErr(res, 413, 'payload_too_large', 'Dữ liệu gửi lên quá lớn');
  if (err.type === 'entity.parse.failed') return sendErr(res, 400, 'bad_request', 'Body không phải JSON hợp lệ');
  return next(err);
});

/* ---------------- Giao diện: Vite middleware (dev) hoặc dist (production) ---------------- */
async function start() {
  if (!PROD) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(dist)) { console.error('Chưa có thư mục dist/. Chạy "npm run build" trước.'); process.exit(1); }
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`AI Department Dashboard: http://0.0.0.0:${PORT} · AI provider=${CFG.provider}${gemini ? ` · model=${CFG.model}` : configured ? '' : ' · (chưa có GEMINI_API_KEY → chế độ quy tắc)'}`));
}
if (!process.env.DASHBOARD_NO_LISTEN) start();
export { app };
