import { Outlet } from 'react-router-dom';
import styles from '../../App.module.css';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className={styles.appContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
}