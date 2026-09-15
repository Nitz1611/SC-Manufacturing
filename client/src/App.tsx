import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
