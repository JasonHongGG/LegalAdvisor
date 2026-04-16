import styles from './Sidebar.module.css';
import { clsx } from 'clsx';
import { NavLink } from 'react-router-dom';
import { Database, FolderTree, MessageSquare, Settings, ShieldAlert } from 'lucide-react';

export function Sidebar() {
  const navItems = [
    { id: 'scraping', label: '爬取管理平台', href: '/scraping', icon: <Database size={20} /> },
    { id: 'rag-processing', label: '資料庫與處理', href: '/rag-processing', icon: <FolderTree size={20} /> },
    { id: 'legal-chat', label: '法律諮詢問答', href: '/legal-chat', icon: <MessageSquare size={20} /> },
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
          {navItems.map((item) => (
            <li key={item.id}>
              <NavLink to={item.href} className={({ isActive }) => clsx(styles.navItem, isActive && styles.active)}>
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
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
