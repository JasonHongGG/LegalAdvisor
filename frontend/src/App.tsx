import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import styles from './App.module.css';
import { AppLayout } from './components/layout/AppLayout';

const ScrapingDashboard = lazy(() =>
  import('./pages/ScrapingDashboard').then((module) => ({ default: module.ScrapingDashboard })),
);

const LegalChatPage = lazy(() =>
  import('./pages/LegalChatPage').then((module) => ({ default: module.LegalChatPage })),
);

const RagProcessingPage = lazy(() =>
  import('./pages/RagProcessingPage').then((module) => ({ default: module.RagProcessingPage })),
);

function RouteLoadingFallback() {
  return <div className={styles.routeLoading}>載入頁面中...</div>;
}

function renderLazyRoute(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/scraping" replace />} />
          <Route path="/scraping">
            <Route index element={renderLazyRoute(<ScrapingDashboard />)} />
            <Route path=":runId" element={renderLazyRoute(<ScrapingDashboard />)} />
          </Route>
          <Route path="/rag-processing" element={renderLazyRoute(<RagProcessingPage />)} />
          <Route path="/legal-chat" element={renderLazyRoute(<LegalChatPage />)} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
