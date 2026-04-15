import { useState } from 'react';
import styles from './App.module.css';
import { Sidebar } from './components/layout/Sidebar';
import { ScrapingDashboard } from './pages/ScrapingDashboard';

function App() {
  const [activeTab, setActiveTab] = useState('scraping');

  return (
    <div className={styles.appContainer}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className={styles.mainContent}>
        {activeTab === 'scraping' && <ScrapingDashboard />}
        {activeTab === 'rag-processing' && (
          <div className="animate-fade-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2>資料庫與處理平台</h2>
            <p>此功能將在下一階段開發，包含樹狀檔案架構與向量資料庫狀態監控。</p>
          </div>
        )}
        {activeTab === 'legal-chat' && (
          <div className="animate-fade-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2>法律諮詢問答</h2>
            <p>此功能將在後續階段開發，提供完整的對話式法律諮詢服務。</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
