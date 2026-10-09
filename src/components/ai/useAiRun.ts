/* Hook chạy tác vụ AI theo yêu cầu người dùng. KHÔNG gọi AI khi render: chỉ đọc cache (peek). */
import { useCallback, useEffect, useState } from 'react';
import type { Scope } from '../../ai/contextBuilder';
import type { TaskId } from '../../ai/prompts';
import { AiInputError, aiService, type AiRunResult } from '../../services/aiService';
import { useApp } from '../../lib/app';

export function useAiRun<D = unknown>(task: TaskId, scope?: Scope | null, question = '') {
  const { user, version } = useApp();
  const scopeKey = `${scope?.type ?? 'department'}:${scope?.id ?? ''}`;
  const [result, setResult] = useState<AiRunResult | null>(() => aiService.peek(task, scope, question));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Đổi phạm vi hoặc dữ liệu → chỉ xem lại cache, không tự gọi AI
  useEffect(() => { setResult(aiService.peek(task, scope, question)); setError(null); }, [task, scopeKey, question, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try { const r = await aiService.run(task, { scope, question, force, userId: user.id }); setResult(r); return r; }
    catch (e) { setError(e instanceof AiInputError ? e.message : `Không chạy được phân tích: ${(e as Error).message}`); return null; }
    finally { setLoading(false); }
  }, [task, scopeKey, question, user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { result: result as (AiRunResult & { data: D }) | null, loading, error, run };
}
