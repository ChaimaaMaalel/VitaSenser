import { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';
import clsx from 'clsx';

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  patient: {
    firstName: string;
    lastName: string;
    bed?: {
      bedNumber: string;
      room: {
        roomNumber: string;
        floor: {
          floorNumber: number;
        };
      };
    };
  };
}

export default function RecentAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await api.get('/dashboard/recent-alerts?limit=5');
      setAlerts(response.data.data.alerts);
    } catch (error) {
      console.error('Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Recent Alerts</h2>
        <AlertTriangle className="w-5 h-5 text-orange-500" />
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-500 text-center py-4">Loading alerts...</p>
        ) : alerts.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No active alerts</p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={clsx(
                'p-4 rounded-lg border-2',
                getSeverityColor(alert.severity)
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold">
                    {alert.patient.firstName} {alert.patient.lastName}
                  </p>
                  <p className="text-sm mt-1">{alert.message}</p>
                  {alert.patient.bed && (
                    <p className="text-xs mt-1 opacity-75">
                      Floor {alert.patient.bed.room.floor.floorNumber} • Room{' '}
                      {alert.patient.bed.room.roomNumber} • Bed{' '}
                      {alert.patient.bed.bedNumber}
                    </p>
                  )}
                </div>
                <span className="badge badge-sm capitalize">{alert.severity}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs opacity-75">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
