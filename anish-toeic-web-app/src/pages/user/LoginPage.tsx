import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, LogIn, Mail } from 'lucide-react';
import { Spin } from 'antd';
import api from '../../api';

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });

      if (data.token) {
        localStorage.setItem('token', data.token);
        // Open-redirect guard: only allow relative return URLs.
        const rawReturnUrl = searchParams.get('returnUrl');
        const returnUrl = rawReturnUrl && rawReturnUrl.startsWith('/') ? rawReturnUrl : '/';
        navigate(returnUrl);
      } else {
        alert(data.error || 'Đăng nhập thất bại');
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (error as any)?.response?.data?.error;
      alert(message || 'Không thể kết nối đến máy chủ');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Left side - Branding (hidden on mobile) */}
      <div
        className="hidden lg:flex w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgb(30, 64, 175) 0%, rgb(67, 56, 202) 60%, rgb(109, 40, 217) 100%)' }}
      >
        <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-12 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Quay lại trang chủ
          </Link>
          <div className="text-3xl font-extrabold tracking-tight mb-6">
            ANISH<span className="text-orange-400">TOEIC</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-6">
            Luyện thi TOEIC
            <br />
            Hiệu quả &amp; Dễ dàng
          </h1>
          <p className="text-blue-100 text-lg max-w-md opacity-90">
            Trải nghiệm nền tảng luyện thi với giao diện mô phỏng 100% đề thi thực tế, cùng hệ thống
            phân tích kết quả chi tiết.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200">© 2026 Anish TOEIC. All rights reserved.</div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-32 bg-white relative">
        <Link to="/" className="lg:hidden absolute top-6 left-6 text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="w-full max-w-sm mx-auto">
          <div className="text-center lg:text-left mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Đăng nhập</h2>
            <p className="text-slate-500">Đăng nhập để tiếp tục bài thi của bạn.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Email hoặc Tên đăng nhập</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all outline-none text-slate-700 bg-slate-50 focus:bg-white"
                  placeholder="email@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Mật khẩu</label>
                <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                  Quên mật khẩu?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all outline-none text-slate-700 bg-slate-50 focus:bg-white"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none mt-2"
            >
              {isLoading ? <Spin size="small" /> : (
                <>
                  <LogIn className="w-5 h-5" /> Đăng nhập
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            Chưa có tài khoản?{' '}
            <a href="#" className="font-semibold text-blue-600 hover:text-blue-800 transition-colors">
              Đăng ký ngay
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
