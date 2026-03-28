import { useEffect, useState } from 'react';
import { AlertTriangle, Activity, Bell, Users } from 'lucide-react';
import api from '../lib/api';
import StatsCard from '../components/dashboard/StatsCard';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const totalAlerts = alerts.length;
  const criticalAlerts = alerts.filter(
    (alert: any) => (alert.severity || '').toUpperCase() === 'CRITICAL'
  ).length;
  const nonCriticalAlerts = Math.max(totalAlerts - criticalAlerts, 0);
  const impactedPatients = new Set(
    alerts
      .map(
        (alert: any) => alert.patient?._id || alert.patient?.id || alert.patient?.lastName
      )
      .filter(Boolean)
  ).size;

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await api.get('/dashboard/recent-alerts?limit=20');
      setAlerts(response.data.data.alerts);
    } catch (error) {
      console.error('Failed to fetch alerts');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-orange-500" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-600 mt-1">Active alerts and notifications</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Alerts"
          value={totalAlerts}
          subtitle={`${criticalAlerts} critical`}
          icon={AlertTriangle}
          color="orange"
        />
        <StatsCard
          title="Critical Alerts"
          value={criticalAlerts}
          subtitle="Immediate action"
          icon={Activity}
          color="red"
        />
        <StatsCard
          title="Other Alerts"
          value={nonCriticalAlerts}
          subtitle="High & medium"
          icon={Bell}
          color="blue"
        />
        <StatsCard
          title="Impacted Patients"
          value={impactedPatients}
          subtitle="Unique patients"
          icon={Users}
          color="green"
        />
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No active alerts</p>
          </div>
        ) : (
          alerts.map((alert: any) => (
            <div key={alert.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {alert.patient.firstName} {alert.patient.lastName}
                  </h3>
                  <p className="text-gray-600 mt-1">{alert.message}</p>
                  <span className={`badge badge-${alert.severity === 'CRITICAL' ? 'danger' : 'warning'} mt-2`}>
                    {alert.severity}
                  </span>
                </div>
                <button className="btn btn-primary btn-sm">Acknowledge</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
