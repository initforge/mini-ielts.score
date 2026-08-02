import { AnishHeader } from '../../components/AnishShell';

interface UnverifiedPageProps {
  title: string;
}

export default function UnverifiedPage({ title }: UnverifiedPageProps) {
  return (
    <>
      <AnishHeader />
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-8 py-12 max-w-md">
          <p className="text-2xl font-bold text-slate-400 tracking-wide">UNVERIFIED</p>
          <p className="mt-3 text-muted-foreground text-sm">
            {title} — chức năng này chưa được triển khai và không sẵn sàng sử dụng.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Liên kết này chỉ mang tính placeholder; không có dữ liệu hay quy trình nào được vận hành tại đây.
          </p>
        </div>
      </div>
    </>
  );
}
