import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import api from '../../lib/api';
import clsx from 'clsx';
import { useLanguageStore } from '../../store/languageStore';

export default function PatientsOverview() {
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatientsOverview();
  }, []);

  const fetchPatientsOverview = async () => {
    try {
      const response = await api.get('/dashboard/patients-overview');
      setStatusData(response.data.data.statusDistribution);
    } catch (error) {
      console.error('Failed to fetch patients overview');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL':
        return 'bg-red-500';
      case 'IN_TREATMENT':
        return 'bg-orange-500';
      case 'STABLE':
        return 'bg-green-500';
      case 'ADMITTED':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const totalPatients = statusData.reduce((sum, item) => sum + item._count, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">{tr('Patients Overview', 'Apercu des patients')}</h2>
        <Users className="w-5 h-5 text-blue-500" />
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-gray-500 text-center py-4">{tr('Loading...', 'Chargement...')}</p>
        ) : (
          <>
            {/* Status Bars */}
            {statusData.map((item) => (
              <div key={item.status}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {item.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-gray-600">
                    {item._count} ({Math.round((item._count / totalPatients) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={clsx('h-2 rounded-full', getStatusColor(item.status))}
                    style={{
                      width: `${(item._count / totalPatients) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{tr('Total Patients', 'Total patients')}</span>
                <span className="text-2xl font-bold text-gray-900">{totalPatients}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
