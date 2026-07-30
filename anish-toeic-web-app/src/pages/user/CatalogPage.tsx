import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Headphones, Mic, History, ArrowLeft, Map, ChevronDown, FileText, Moon, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import ExamCard from './components/ExamCard';
import ExamModeDialog from './components/ExamModeDialog';

const CatalogPage = () => {
  const [skillType, setSkillType] = useState('LR');
  const [collectionId, setCollectionId] = useState<string>('');
  const [search, setSearch] = useState('');
  
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const navigate = useNavigate();

  const { data: exams, isLoading, error } = useQuery({
    queryKey: ['exams', skillType, collectionId, search],
    queryFn: async () => {
      const response = await api.get('/toeic-exams', {
        params: {
          skillType,
          collectionId: collectionId || undefined,
          search: search || undefined
        }
      });
      return response.data;
    }
  });

  const handleOpenModeDialog = (exam: any, _defaultMode?: 'exam' | 'practice') => {
    setSelectedExam(exam);
    setIsModeDialogOpen(true);
  };

  const collectionsLR = ['2026', '2024', '2023', '2022', '2021'];
  const collectionsSW = ['ETS Xanh Dương', 'ETS Xanh Lá', 'ETS Cam Hồng', 'ETS Đỏ Đô', 'ETS Tím Huế'];
  const currentCollections = skillType === 'LR' ? collectionsLR : collectionsSW;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 w-full bg-slate-900 text-slate-100 border-b border-slate-800 shadow-lg">
        <nav className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14 gap-2">
          <a className="font-heading font-bold text-lg whitespace-nowrap mr-2" href="/">
            XoáMù<span className="text-orange-400">TOEIC</span>
          </a>
          <ul className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            <li>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
                <Map className="w-4 h-4 text-indigo-400" />
                <span>Lộ trình</span>
              </button>
            </li>
            <li>
              <button className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
                <span>Học tập</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </li>
            <li>
              <button className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
                <span>Luyện tập</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </li>
            <li>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-slate-800">
                <FileText className="w-4 h-4 text-orange-400" />
                <span>Thi thử</span>
              </button>
            </li>
            <li>
              <button className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
                <span>Tài nguyên</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </li>
          </ul>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white transition-colors">
              <Moon size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => navigate('/dang-nhap')} className="text-sm font-medium text-slate-200 hover:text-white px-3 py-1.5 transition-colors">
                Đăng nhập
              </button>
              <button className="text-sm font-semibold text-white px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-md transition-all">
                Đăng ký
              </button>
            </div>
            <button className="lg:hidden p-2 rounded-md hover:bg-slate-800">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </nav>
      </header>

      <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => navigate('/')} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 mb-3">
          <ArrowLeft className="w-4 h-4 mr-1" /> Trang chủ
        </button>
        <h1 className="text-3xl md:text-4xl font-bold mb-1">Thư viện đề thi</h1>
        <p className="text-muted-foreground mb-6">Chọn chế độ thi: Listening & Reading hoặc Speaking & Writing.</p>
        
        <div className="w-full">
          <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground mb-6">
            <button 
              onClick={() => { setSkillType('LR'); setCollectionId(''); }}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 ${skillType === 'LR' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50 hover:text-foreground'}`}
            >
              <Headphones className="w-4 h-4" /> Listening & Reading
            </button>
            <button 
              onClick={() => { setSkillType('SW'); setCollectionId(''); }}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 ${skillType === 'SW' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50 hover:text-foreground'}`}
            >
              <Mic className="w-4 h-4" /> Speaking & Writing
            </button>
            <button onClick={() => navigate('/thi-thu/lich-su')} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background transition-colors ml-1">
              <History className="w-4 h-4" /> Lịch sử & Kết quả
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border pb-3">
            <button 
              onClick={() => setCollectionId('')}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${collectionId === '' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-background hover:bg-muted'}`}
            >
              Tất cả
            </button>
            {currentCollections.map(col => (
              <button 
                key={col}
                onClick={() => setCollectionId(col)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${collectionId === col ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-background hover:bg-muted'}`}
              >
                {col}
              </button>
            ))}
          </div>

          <div className="flex gap-2 max-w-xl mb-6">
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm" 
              placeholder={skillType === 'LR' ? "2026" : "Tìm kiếm đề thi..."} 
            />
            <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              <Search className="w-4 h-4 mr-1" /> Tìm kiếm
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Đang tải đề thi...</div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-destructive">Lỗi khi tải đề thi. Vui lòng thử lại sau.</div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {exams?.map((exam: any) => (
                    <ExamCard 
                      key={exam.id} 
                      exam={exam} 
                      onOpenModeDialog={handleOpenModeDialog} 
                    />
                  ))}
                  {(!exams || exams.length === 0) && (
                    <div className="col-span-full py-12 text-center text-muted-foreground">
                      Không tìm thấy đề thi nào phù hợp.
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <aside className="hidden lg:block space-y-4">
               {/* Fixed right sidebar from design */}
               <a className="block" href="#">
                <div className="group relative overflow-hidden rounded-xl p-4 text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer bg-gradient-to-br from-blue-800 to-blue-900">
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
              </a>
            </aside>
          </div>
        </div>
      </section>

      <ExamModeDialog
        isOpen={isModeDialogOpen}
        onClose={() => setIsModeDialogOpen(false)}
        exam={selectedExam}
      />
    </div>
  );
};

export default CatalogPage;
