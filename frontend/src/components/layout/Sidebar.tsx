import styles from './Sidebar.module.css';
import { clsx } from 'clsx';
import { Database, FolderTree, MessageSquare, Settings, ShieldAlert } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: 'scraping', label: '爬取管理平台', icon: <Database size={20} /> },
    { id: 'rag-processing', label: '資料庫與處理', icon: <FolderTree size={20} /> },
    { id: 'legal-chat', label: '法律諮詢問答', icon: <MessageSquare size={20} /> },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoContainer}>
        <div className={styles.logoIcon}>
          <ShieldAlert size={28} color="var(--accent-primary)" />
        </div>
        <h1 className={styles.logoText}>Legal<span className={styles.logoHighlight}>Advisor</span></h1>
      </div>

      <nav className={styles.nav}>
        <p className={styles.navConfig}>核心工作區</p>
        <ul className={styles.navList}>
          {navItems.map(item => (
            <li key={item.id}>
              <button
                className={clsx(styles.navItem, activeTab === item.id && styles.active)}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.bottomSection}>
        <button className={clsx(styles.navItem, styles.settings)}>
          <Settings size={20} />
          <span>系統設定</span>
        </button>
      </div>
    </aside>
  );
}
