import { AlertTriangle, Inbox, RefreshCw, SearchX } from 'lucide-react';

export function CatalogLoading({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Đang tải đề thi">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
          <div className="h-4 w-3/4 bg-muted rounded mb-3" />
          <div className="h-3 w-1/2 bg-muted rounded mb-2" />
          <div className="h-3 w-2/3 bg-muted rounded mb-3" />
          <div className="h-6 w-16 bg-muted rounded mb-3" />
          <div className="grid grid-cols-3 gap-1.5">
            <div className="h-9 bg-muted rounded" />
            <div className="h-9 bg-muted rounded" />
            <div className="h-9 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogEmpty() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Inbox className="w-10 h-10 text-muted-foreground/50" />
      <p className="text-muted-foreground">Chưa có đề thi nào trong thư viện.</p>
    </div>
  );
}

export function CatalogNoResult({ onReset }: { onReset: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
      <SearchX className="w-10 h-10 text-muted-foreground/50" />
      <p className="text-muted-foreground">Không tìm thấy đề thi nào phù hợp.</p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-primary hover:bg-primary/10 px-3 py-1.5 transition-colors"
      >
        Xóa bộ lọc
      </button>
    </div>
  );
}

export function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="w-10 h-10 text-destructive/70" />
      <p className="text-destructive">Không thể tải thư viện đề thi. Vui lòng thử lại.</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Thử lại
      </button>
    </div>
  );
}
