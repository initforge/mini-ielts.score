import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CatalogPage from './pages/user/CatalogPage';
import LoginPage from './pages/user/LoginPage';
import ProcessingPage from './pages/user/ProcessingPage';
import ResultPage from './pages/user/ResultPage';
import ErrorMapPage from './pages/user/ErrorMapPage';
import HistoryPage from './pages/user/HistoryPage';
import MockExamRunnerPage from './modules/mock-exam/pages/MockExamRunnerPage';
import SWRunnerPage from './pages/user/SWRunnerPage';
import ExamDetailPage from './pages/user/ExamDetailPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import OnlineExamPage from './pages/admin/OnlineExamPage';
import MixedExamPage from './pages/admin/MixedExamPage';
import OnlineResultPage from './pages/admin/OnlineResultPage';
import OnlineImportPage from './pages/admin/OnlineImportPage';

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/thi-thu" element={<CatalogPage />} />
          <Route path="/thi-thu/dang-xu-ly/:attemptId" element={<ProcessingPage />} />
          <Route path="/thi-thu/ket-qua/:attemptId" element={<ResultPage />} />
          <Route path="/thi-thu/ket-qua/:attemptId/chi-tiet" element={<ErrorMapPage />} />
          <Route path="/thi-thu/lich-su" element={<HistoryPage />} />
          <Route path="/thi-thu/:examSlug" element={<ExamDetailPage />} />
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/thi-thu/:examSlug/lam-bai/:attemptId" element={<MockExamRunnerPage />} />
          <Route path="/thi-thu/lam-bai/:attemptId" element={<MockExamRunnerPage />} />
          <Route path="/thi-thu/:examSlug/lam-bai-sw/:attemptId" element={<SWRunnerPage />} />
          <Route path="/thi-thu/lam-bai-sw/:attemptId" element={<SWRunnerPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="de-thi-online" element={<OnlineExamPage />} />
            <Route path="de-hon-hop" element={<MixedExamPage />} />
            <Route path="ket-qua-thi-online" element={<OnlineResultPage />} />
            <Route path="nhap-de-thi-online" element={<OnlineImportPage />} />
            <Route index element={<Navigate to="de-thi-online" replace />} />
          </Route>
          <Route path="/" element={<Navigate to="/thi-thu" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
