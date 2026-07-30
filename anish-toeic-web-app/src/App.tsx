import { BrowserRouter, Routes, Route } from 'react-router-dom';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/thi-thu/*" element={<div>Thi Thu Shell</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
