import { useAuthStore } from '../store/authStore';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import DoctorDashboard from '../components/dashboard/DoctorDashboard';
import NurseDashboard from '../components/dashboard/NurseDashboard';
import { useLanguageStore } from '../store/languageStore';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{tr('Dashboard', 'Tableau de bord')}</h1>
        <p className="text-gray-600 mt-1">
          {tr('Welcome to Smart Hospital monitoring system', 'Bienvenue sur le systeme de surveillance Smart Hospital')}
        </p>
      </div>

      {/* Role-based Dashboard Content */}
      {user?.role === 'ADMIN' && <AdminDashboard />}
      {user?.role === 'DOCTOR' && <DoctorDashboard />}
      {user?.role === 'NURSE' && <NurseDashboard />}
    </div>
  );
}
