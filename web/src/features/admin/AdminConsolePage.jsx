import { Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import AdminConsoleSidebar from './components/AdminConsoleSidebar';
import './AdminConsolePage.css';

export default function AdminConsolePage() {
  return (
    <div className="dashboard-grid-container">
      <PageHeader
        title="Admin Console"
        subtitle="Platform operations — manage every tenant"
        icon={ShieldCheck}
      />
      <div className="dashboard-grid-layout">
        <AdminConsoleSidebar />
        <main className="dashboard-grid-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
