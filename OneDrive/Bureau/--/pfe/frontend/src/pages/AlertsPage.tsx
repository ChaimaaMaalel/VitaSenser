import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Activity, Bell, Users } from 'lucide-react';
import api from '../lib/api';
import StatsCard from '../components/dashboard/StatsCard';
import { useLanguageStore } from '../store/languageStore';
import { format } from 'date-fns';

export default function AlertsPage() {
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | '1H' | '6H' | '24H' | '7D'>('24H');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchAlerts = async (refreshAi = false, silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }

      const response = await api.get(
        `/alerts?limit=80&includeResolved=true${refreshAi ? '&refreshAi=true' : ''}`,
        { timeout: 12000 }
      );
      setAlerts(response.data?.data?.alerts || []);
      setLastRefreshAt(new Date());
    } catch (error) {
      console.error('Failed to fetch alerts');
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      setActionLoadingId(alertId);
      await api.post(`/alerts/${alertId}/acknowledge`);
      await fetchAlerts(false, true);
    } catch (error) {
      console.error('Failed to acknowledge alert');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      setActionLoadingId(alertId);
      await api.post(`/alerts/${alertId}/resolve`);
      await fetchAlerts(false, true);
    } catch (error) {
      console.error('Failed to resolve alert');
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalAlerts = alerts.length;
  const criticalAlerts = alerts.filter(
    (alert: any) => (alert.severity || '').toUpperCase() === 'CRITICAL'
  ).length;
  const impactedPatients = new Set(
    alerts
      .map(
        (alert: any) => alert.patient?._id || alert.patient?.id || alert.patient?.lastName
      )
      .filter(Boolean)
  ).size;

  const pendingAlerts = useMemo(
    () => alerts.filter((alert: any) => String(alert.status || '').toUpperCase() === 'PENDING').length,
    [alerts]
  );

  const availableTypes = useMemo(() => {
    const types = Array.from(
      new Set(
        alerts
          .map((alert: any) => String(alert.type || '').toUpperCase())
          .filter((type: string) => Boolean(type))
      )
    );
    return types.sort();
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const now = Date.now();
    const rangeMs =
      timeFilter === '1H'
        ? 1 * 60 * 60 * 1000
        : timeFilter === '6H'
        ? 6 * 60 * 60 * 1000
        : timeFilter === '24H'
        ? 24 * 60 * 60 * 1000
        : timeFilter === '7D'
        ? 7 * 24 * 60 * 60 * 1000
        : null;

    return alerts.filter((alert: any) => {
      const patientName = `${alert?.patient?.firstName || ''} ${alert?.patient?.lastName || ''}`.trim().toLowerCase();
      const message = String(alert?.message || '').toLowerCase();
      const description = String(alert?.description || '').toLowerCase();
      const type = String(alert?.type || '').toUpperCase();
      const status = String(alert?.status || '').toUpperCase();
      const severity = String(alert?.severity || '').toUpperCase();

      const matchesSearch =
        !normalizedSearch ||
        patientName.includes(normalizedSearch) ||
        message.includes(normalizedSearch) ||
        description.includes(normalizedSearch) ||
        type.toLowerCase().includes(normalizedSearch);

      const matchesSeverity = severityFilter === 'ALL' || severity === severityFilter;
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
      const matchesType = typeFilter === 'ALL' || type === typeFilter;

      let matchesTime = true;
      if (rangeMs !== null) {
        const ts = alert?.timestamp ? new Date(alert.timestamp).getTime() : 0;
        matchesTime = Number.isFinite(ts) && ts >= now - rangeMs;
      }

      return matchesSearch && matchesSeverity && matchesStatus && matchesType && matchesTime;
    });
  }, [alerts, searchTerm, severityFilter, statusFilter, typeFilter, timeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));

  const paginatedAlerts = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, severityFilter, statusFilter, typeFilter, timeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    fetchAlerts(false, false);

    const interval = setInterval(() => {
      fetchAlerts(false, true);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-orange-500" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{tr('Alerts', 'Alertes')}</h1>
          <p className="text-gray-600 mt-1">{tr('AI-powered alerts from live and simulated vitals', 'Alertes basees sur IA depuis les signaux en direct et simules')}</p>
          <p className="text-xs text-gray-500 mt-1">
            {tr('Last refresh:', 'Dernier rafraichissement:')} {lastRefreshAt ? format(lastRefreshAt, 'HH:mm:ss') : '--'}
            {refreshing ? ` • ${tr('Refreshing...', 'Actualisation...')}` : ''}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title={tr('Total Alerts', 'Total alertes')}
          value={totalAlerts}
          subtitle={tr(`${criticalAlerts} critical`, `${criticalAlerts} critiques`)}
          icon={AlertTriangle}
          color="orange"
        />
        <StatsCard
          title={tr('Critical Alerts', 'Alertes critiques')}
          value={criticalAlerts}
          subtitle={tr('Immediate action', 'Action immediate')}
          icon={Activity}
          color="red"
        />
        <StatsCard
          title={tr('Pending Alerts', 'Alertes en attente')}
          value={pendingAlerts}
          subtitle={tr('Need triage', 'Necessitent un triage')}
          icon={Bell}
          color="blue"
        />
        <StatsCard
          title={tr('Impacted Patients', 'Patients impactes')}
          value={impactedPatients}
          subtitle={tr('Unique patients', 'Patients uniques')}
          icon={Users}
          color="green"
        />
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Search & Filters</h3>
          <span className="text-xs text-gray-500">
            Showing {filteredAlerts.length} / {alerts.length}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <input
            className="input"
            placeholder={tr('Search patient, message, type...', 'Rechercher patient, message, type...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="input"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')}
          >
            <option value="ALL">All severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED')}
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="ESCALATED">ESCALATED</option>
          </select>

          <select
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as 'ALL' | '1H' | '6H' | '24H' | '7D')}
          >
            <option value="ALL">All time</option>
            <option value="1H">Last 1h</option>
            <option value="6H">Last 6h</option>
            <option value="24H">Last 24h</option>
            <option value="7D">Last 7d</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {initialLoading && alerts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">{tr('Refreshing AI alerts...', 'Rafraichissement des alertes IA...')}</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">{tr('No alerts found for current filters', 'Aucune alerte pour les filtres actuels')}</p>
          </div>
        ) : (
          paginatedAlerts.map((alert: any) => (
            <div key={alert._id || alert.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {alert.patient?.firstName || 'Unknown'} {alert.patient?.lastName || 'Patient'}
                  </h3>
                  <p className="text-gray-600 mt-1">{alert.message}</p>
                  {alert.description && (
                    <p className="text-xs text-gray-500 mt-1">{alert.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`badge badge-${alert.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>
                      {alert.type}
                    </span>
                    <span className={`badge badge-${String(alert.status || '').toUpperCase() === 'PENDING' ? 'info' : 'success'}`}>
                      {alert.status}
                    </span>
                    <span className={`badge badge-${alert.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>
                    {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {tr('Time:', 'Heure:')} {alert.timestamp ? format(new Date(alert.timestamp), 'PPp') : '--'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 ml-3">
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(alert._id || alert.id)}
                    disabled={actionLoadingId === (alert._id || alert.id)}
                    className="btn btn-primary btn-sm"
                  >
                    {tr('Acknowledge', 'Accuser reception')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolve(alert._id || alert.id)}
                    disabled={actionLoadingId === (alert._id || alert.id)}
                    className="btn btn-outline btn-sm"
                  >
                    {tr('Resolve', 'Resoudre')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {filteredAlerts.length > 0 && (
        <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-sm text-gray-600">
            Page {currentPage} / {totalPages} • {filteredAlerts.length} alerts
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
