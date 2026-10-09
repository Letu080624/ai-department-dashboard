/* Không để một lỗi giao diện làm trắng toàn bộ trang */
import { Component, type ReactNode } from 'react';
import { ErrorState } from './ui';

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[UI]', error); }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <div className="rounded-xl border border-line bg-white"><ErrorState title="Trang gặp lỗi khi hiển thị" message={`${this.state.error.message}. Dữ liệu không bị thay đổi. Hãy thử lại hoặc chuyển sang trang khác.`} onRetry={() => this.setState({ error: null })} /></div>;
    return this.props.children;
  }
}
