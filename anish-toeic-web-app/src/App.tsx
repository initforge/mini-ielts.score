import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CatalogPage from './pages/user/CatalogPage';
import LoginPage from './pages/user/LoginPage';
import ProcessingPage from './pages/user/ProcessingPage';
import ResultPage from './pages/user/ResultPage';
import HistoryPage from './pages/user/HistoryPage';
import MockExamRunnerPage from './modules/mock-exam/pages/MockExamRunnerPage';
import SWRunnerPage from './pages/user/SWRunnerPage';

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/thi-thu" element={<CatalogPage />} />
          <Route path="/thi-thu/dang-xu-ly/:attemptId" element={<ProcessingPage />} />
          <Route path="/thi-thu/ket-qua/:attemptId" element={<ResultPage />} />
          <Route path="/thi-thu/lich-su" element={<HistoryPage />} />
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/thi-thu/:examSlug/lam-bai/:attemptId" element={<MockExamRunnerPage />} />
          <Route path="/thi-thu/lam-bai/:attemptId" element={<MockExamRunnerPage />} />
          <Route path="/thi-thu/:examSlug/lam-bai-sw/:attemptId" element={<SWRunnerPage />} />
          <Route path="/thi-thu/lam-bai-sw/:attemptId" element={<SWRunnerPage />} />
          <Route path="/" element={<Navigate to="/thi-thu" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
