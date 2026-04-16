import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ScrapingDashboard } from './pages/ScrapingDashboard';
import { LegalChatPage } from './pages/LegalChatPage';
import { RagProcessingPage } from './pages/RagProcessingPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/scraping" replace />} />
          <Route path="/scraping">
            <Route index element={<ScrapingDashboard />} />
            <Route path=":taskId" element={<ScrapingDashboard />} />
          </Route>
          <Route path="/rag-processing" element={<RagProcessingPage />} />
          <Route path="/legal-chat" element={<LegalChatPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
