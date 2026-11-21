import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onOpenRecovery?: () => void },
  State
> {
  constructor(props: { children: React.ReactNode; onOpenRecovery?: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || '發生未預期錯誤' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="mx-auto my-12 max-w-xl rounded-2xl border p-6"
          style={{
            backgroundColor: 'var(--mc-bg-secondary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-primary)',
          }}
        >
          <div className="flex items-center gap-3 text-amber-300">
            <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden="true" />
            <h2 className="text-lg font-semibold">畫面載入遇到異常，已隔離錯誤</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
            您的本機學習資料已保留在 IndexedDB 中不會自動清空。您可以重新載入介面，或前往「儲存與版本」匯出備份／復原。
          </p>
          <p className="mt-2 rounded-lg bg-black/30 p-3 font-mono text-xs text-rose-300">
            {this.state.errorMessage}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.hash = '#/';
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>返回首頁</span>
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.hash = '#/storage';
                this.props.onOpenRecovery?.();
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
            >
              <span>開啟資料復原頁</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
