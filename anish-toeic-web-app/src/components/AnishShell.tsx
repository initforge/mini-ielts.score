import { Link } from 'react-router-dom';
import { Menu, Moon } from 'lucide-react';

const NAV_LINKS: { label: string; to: string }[] = [
  { label: 'Lộ trình', to: '/' },
  { label: 'Học tập', to: '/' },
  { label: 'Luyện tập', to: '/' },
  { label: 'Thi thử', to: '/thi-thu' },
  { label: 'Tài nguyên', to: '/' },
];

export function AnishHeader() {
  return (
    <header className="sticky top-0 z-50 w-full bg-slate-900 text-slate-100 border-b border-slate-800 shadow-lg">
      <nav className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14 gap-2">
        <Link to="/" className="font-heading font-bold text-lg whitespace-nowrap mr-2 text-white">
          ANISH<span className="text-orange-400">TOEIC</span>
        </Link>
        <ul className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  item.to === '/thi-thu'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <button
            aria-label="Chuyển chế độ sáng/tối"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Moon size={18} />
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <Link to="/dang-nhap" className="text-sm font-medium text-slate-200 hover:text-white px-3 py-1.5 transition-colors">
              Đăng nhập
            </Link>
            <Link
              to="/dang-ky"
              className="text-sm font-semibold text-white px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-md transition-all"
            >
              Đăng ký
            </Link>
          </div>
          <button aria-label="Mở menu" className="lg:hidden p-2 rounded-md hover:bg-slate-800">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>
    </header>
  );
}

export function AnishFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900 text-slate-300 mt-12">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-heading font-bold text-lg text-white">
              ANISH<span className="text-orange-400">TOEIC</span>
            </p>
            <p className="text-sm text-slate-400 mt-1">Luyện thi TOEIC toàn diện</p>
          </div>
          <div>
            <p className="font-semibold mb-2 text-sm text-white">Về Anish</p>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>Về chúng tôi</li>
              <li>Liên hệ</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-2 text-sm text-white">Tài nguyên</p>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>
                <Link to="/thi-thu" className="hover:text-white transition-colors">
                  Thi Thử
                </Link>
              </li>
              <li>Thư viện</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-2 text-sm text-white">Chính sách chung</p>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>Điều khoản sử dụng</li>
              <li>Chính sách bảo mật</li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-500 border-t border-slate-800 pt-4">
          ANISH TOEIC © 2026. TOEIC® is a registered trademark of Educational Testing Service (ETS).
        </p>
      </div>
    </footer>
  );
}
