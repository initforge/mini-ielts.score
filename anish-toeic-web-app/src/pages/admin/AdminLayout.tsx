import { Link, Outlet } from 'react-router';

const SIDEBAR_W = 240;

const MENU = [
  { label: 'Đề thi trực tuyến', to: '/admin/de-thi-online' },
  { label: 'Đề hỗn hợp', to: '/admin/de-hon-hop' },
  { label: 'Kết quả thi trực tuyến', to: '/admin/ket-qua-thi-online' },
  { label: 'Nhập đề thi online', to: '/admin/nhap-de-thi-online' },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="sticky top-0 flex flex-col border-r border-slate-700 bg-slate-900 text-slate-300"
        style={{ width: SIDEBAR_W }}
      >
        <div className="px-4 py-5 border-b border-slate-700">
          <h2 className="font-heading font-bold text-white text-base">Admin</h2>
          <p className="text-xs text-slate-400 mt-0.5">Bảng điều khiển</p>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5" aria-label="Admin navigation">
          {MENU.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-6 bg-background">
        <Outlet />
      </main>
    </div>
  );
}
