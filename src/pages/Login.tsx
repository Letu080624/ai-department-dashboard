/* Đăng nhập DEMO (xác thực giả lập). Production: SSO/JWT — chỉ thay authService, giữ nguyên phân quyền. */
import { useState } from 'react';
import { LogIn, MonitorPlay, ShieldCheck } from 'lucide-react';
import { dataService } from '../services/dataService';
import { startDemo } from '../demo/startDemo';
import { ROLE_LABEL } from '../services/authService';
import { Button } from '../components/ui';
import { cx } from '../lib/format';

export default function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const A = dataService.analytics;
  const head = A.d.users.find(u => u.role === 'HEAD') ?? A.d.users[0];
  const [sel, setSel] = useState(head.id);
  const [starting, setStarting] = useState(false);
  return (
    <div className="flex min-h-full items-center justify-center bg-[linear-gradient(160deg,#172d4a_0%,#1e3a5f_55%,#2f5482_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-navy-700 text-[15px] font-bold text-white">BM</span><div><p className="text-[12px] uppercase tracking-wide text-ink-3">{A.get('units', A.department.parentId)?.name}</p><h1 className="text-[18px] font-semibold text-navy-800">{A.department.name}</h1></div></div>
        <p className="mt-5 text-[13.5px] text-ink-2">AI Department Management Dashboard — quản trị Bộ môn dựa trên dữ liệu: <b className="font-medium text-ink">Dữ liệu → Phân tích → Quyết định → Hành động → Cải tiến</b>.</p>
        <div className="mt-5 rounded-lg border border-[#f0dca4] bg-warn-bg px-3 py-2 text-[12.5px] text-[#713f12]">Chế độ Demo: xác thực giả lập, không cần mật khẩu. Chọn vai trò để thử phân quyền.</div>
        <fieldset className="mt-5 grid gap-1.5">
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Tài khoản demo</legend>
          {A.d.users.map(u => (
            <label key={u.id} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors', sel === u.id ? 'border-navy-500 bg-navy-50' : 'border-line hover:bg-canvas')}>
              <input type="radio" name="acc" value={u.id} checked={sel === u.id} onChange={() => setSel(u.id)} className="accent-[#1e3a5f]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{u.fullName}</span><span className="block text-[12px] text-ink-2">{ROLE_LABEL[u.role]}</span></span>
              {u.role === 'HEAD' && <span className="rounded bg-navy-700 px-1.5 py-px text-[10.5px] font-semibold text-white">Mặc định</span>}
            </label>
          ))}
        </fieldset>
        <Button variant="primary" className="mt-5 w-full" icon={<LogIn className="size-4" />} onClick={() => onLogin(sel)}>Vào Dashboard</Button>
        <Button className="mt-2 w-full" icon={<MonitorPlay className="size-4" />} loading={starting} onClick={async () => { setStarting(true); await startDemo(onLogin); }}>Bắt đầu trình diễn (~10 phút)</Button>
        <p className="mt-1.5 text-center text-[11.5px] text-ink-3">Khôi phục dữ liệu mẫu gốc, đăng nhập Trưởng Bộ môn và mở kịch bản 12 bước.</p>
        <p className="mt-5 flex items-center gap-1.5 text-[12px] text-ink-3"><ShieldCheck className="size-3.5" />Khoá Gemini API chỉ nằm ở server; trình duyệt không bao giờ nhận khoá.</p>
      </div>
    </div>
  );
}
