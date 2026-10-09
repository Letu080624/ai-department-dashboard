/* Hash router tối giản (không thêm thư viện): chạy được trong iframe của AI Studio và khi host tĩnh. */
import { useEffect, useState } from 'react';

const parse = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);

export function useRoute(): string[] {
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const f = () => { setParts(parse()); document.querySelector('main')?.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return parts;
}
export const navigate = (path: string) => { window.location.hash = '/' + path.replace(/^\/+/, ''); };
export const href = (path: string) => '#/' + path.replace(/^\/+/, '');
