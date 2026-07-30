import { Clock, Users, Pencil, GraduationCap, Trophy, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ExamCardProps {
  exam: any;
  onOpenModeDialog: (exam: any, defaultMode?: 'exam' | 'practice') => void;
}

const ExamCard = ({ exam, onOpenModeDialog }: ExamCardProps) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-1.5 text-green-600 font-bold text-sm mb-2">
        <CheckCircle2 className="w-4 h-4" />
        <span className="truncate">{exam.title}</span>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground mb-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {exam.duration || 120} phút
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {exam.participants || Math.floor(Math.random() * 500) + 50}
          </span>
        </div>
        <p>{exam.skill_type === 'LR' ? '7 phần thi' : '11 câu hỏi'} | {exam.questionCount || 200} câu hỏi</p>
      </div>
      <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 w-fit mb-3 text-[10px]">
        #TOEIC
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5">
        <button 
          onClick={() => onOpenModeDialog(exam, 'exam')}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md text-xs px-1"
        >
          <Pencil className="w-3 h-3 mr-1" />
          Thi thử
        </button>
        <button 
          onClick={() => onOpenModeDialog(exam, 'practice')}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md text-xs px-1"
        >
          <GraduationCap className="w-3 h-3 mr-1" />
          Luyện tập
        </button>
        <button 
          onClick={() => navigate('/thi-thu/lich-su')}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md text-xs px-1"
        >
          <Trophy className="w-3 h-3 mr-1" />
          Kết quả
        </button>
      </div>
    </div>
  );
};

export default ExamCard;
