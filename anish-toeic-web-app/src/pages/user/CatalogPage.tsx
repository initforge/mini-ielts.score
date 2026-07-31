import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Headphones, History, Mic, Search } from 'lucide-react';
import { useExamsQuery } from '../../modules/mock-exam/catalogApi';
import { getCollections } from '../../modules/mock-exam/collections';
import ExamCard from '../../modules/mock-exam/components/ExamCard';
import ExamModeDialog from '../../modules/mock-exam/components/ExamModeDialog';
import {
  CatalogEmpty,
  CatalogError,
  CatalogLoading,
  CatalogNoResult,
} from '../../modules/mock-exam/components/CatalogStates';
import { AnishFooter, AnishHeader } from '../../components/AnishShell';
import { Exam, ExamMode } from '../../types/exam';

type SkillTab = 'LR' | 'SW';

const CatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const tabParam = searchParams.get('tab');
  const skillType: SkillTab = tabParam === 'sw' ? 'SW' : 'LR';

  const [collectionId, setCollectionId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [dialogMode, setDialogMode] = useState<ExamMode>('exam');
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useExamsQuery({
    skillType,
    collectionId: collectionId || undefined,
    search: search || undefined,
  });

  const exams = data?.items ?? [];
  const hasFilters = collectionId !== '' || search !== '';
  const isNoResult = !isLoading && !isError && data?.total === 0 && hasFilters;
  const isEmpty = !isLoading && !isError && data?.total === 0 && !hasFilters;

  // Preserve anonymous-login intent: /dang-nhap?returnUrl=/thi-thu?exam=<id>&mode=<mode>
  useEffect(() => {
    const examId = searchParams.get('exam');
    if (!data || !examId) return;
    const target = data.items.find((e) => e.id === Number(examId));
    if (target) {
      setSelectedExam(target);
      setDialogMode(searchParams.get('mode') === 'practice' ? 'practice' : 'exam');
      setIsModeDialogOpen(true);
    }
    const params = new URLSearchParams(searchParams);
    params.delete('exam');
    params.delete('mode');
    setSearchParams(params, { replace: true });
  }, [data, searchParams, setSearchParams]);

  const switchTab = (next: SkillTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'LR') params.delete('tab');
    else params.set('tab', 'sw');
    setSearchParams(params, { replace: true });
    setCollectionId('');
    setSearchInput('');
    setSearch('');
  };

  const resetFilters = () => {
    setCollectionId('');
    setSearchInput('');
    setSearch('');
  };

  const openModeDialog = (exam: Exam, defaultMode: ExamMode = 'exam') => {
    setSelectedExam(exam);
    setDialogMode(defaultMode);
    setIsModeDialogOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <AnishHeader />

      <main className="flex-1">
        <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Trang chủ
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold mb-1">Thư viện đề thi</h1>
          <p className="text-muted-foreground mb-6">
            Chọn chế độ thi: Listening & Reading hoặc Speaking & Writing.
          </p>

          <div className="w-full">
            <div className="mb-6 w-full overflow-x-auto overscroll-x-contain">
              <div className="inline-flex min-w-max h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
              <button
                onClick={() => switchTab('LR')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 ${
                  skillType === 'LR' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50 hover:text-foreground'
                }`}
                aria-pressed={skillType === 'LR'}
              >
                <Headphones className="w-4 h-4" /> Listening & Reading
              </button>
              <button
                onClick={() => switchTab('SW')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 ${
                  skillType === 'SW' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50 hover:text-foreground'
                }`}
                aria-pressed={skillType === 'SW'}
              >
                <Mic className="w-4 h-4" /> Speaking & Writing
              </button>
              <button
                onClick={() => navigate('/thi-thu/lich-su')}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background transition-colors ml-1"
              >
                <History className="w-4 h-4" /> Lịch sử & Kết quả
              </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border pb-3">
              <button
                onClick={() => setCollectionId('')}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  collectionId === '' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Tất cả
              </button>
              {getCollections(skillType).map((col) => (
                <button
                  key={col.id}
                  onClick={() => setCollectionId(String(col.id))}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    collectionId === String(col.id) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2 max-w-xl mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                placeholder={skillType === 'LR' ? 'ETS 2024' : 'Tìm kiếm đề thi...'}
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                <Search className="w-4 h-4" /> Tìm kiếm
              </button>
            </form>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                {isLoading ? (
                  <CatalogLoading />
                ) : isError ? (
                  <CatalogError onRetry={() => void refetch()} />
                ) : isEmpty ? (
                  <CatalogEmpty />
                ) : isNoResult ? (
                  <CatalogNoResult onReset={resetFilters} />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {exams.map((exam) => (
                      <ExamCard key={exam.id} exam={exam} onOpenModeDialog={openModeDialog} />
                    ))}
                  </div>
                )}
              </div>

              <aside className="hidden lg:block space-y-4">
                <div className="group relative overflow-hidden rounded-xl p-4 text-white shadow-md cursor-pointer bg-gradient-to-br from-blue-800 to-blue-900">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-12 h-12 rounded-lg bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition-colors">
                      <span className="font-extrabold text-lg leading-none">990</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug text-[15px]">Dự đoán điểm TOEIC</p>
                      <p className="text-[11px] opacity-80 mt-0.5">Nhanh chóng – Chính xác</p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <AnishFooter />

      <ExamModeDialog
        isOpen={isModeDialogOpen}
        onClose={() => setIsModeDialogOpen(false)}
        exam={selectedExam}
        defaultMode={dialogMode}
      />
    </div>
  );
};

export default CatalogPage;
