import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { api } from '../services/api';
import { colors, statusColors } from '../theme/colors';
import { StatCard } from '../components/StatCard';
import { useLanguageStore } from '../store/languageStore';

type AlertItem = {
  _id?: string;
  id?: string;
  patient?: {
    _id?: string;
    id?: string;
    firstName?: string;
    lastName?: string;
  };
  type?: string;
  severity?: string;
  status?: string;
  message?: string;
  description?: string;
  timestamp?: string;
};

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type StatusFilter = 'ALL' | 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED';
type TimeFilter = 'ALL' | '1H' | '6H' | '24H' | '7D';

const pageSize = 10;

export function AlertsScreen() {
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24H');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

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
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      setActionLoadingId(alertId);
      await api.post(`/alerts/${alertId}/resolve`);
      await fetchAlerts(false, true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalAlerts = alerts.length;
  const criticalAlerts = alerts.filter(
    (alert) => String(alert.severity || '').toUpperCase() === 'CRITICAL'
  ).length;
  const pendingAlerts = alerts.filter(
    (alert) => String(alert.status || '').toUpperCase() === 'PENDING'
  ).length;
  const impactedPatients = new Set(
    alerts
      .map((alert) => alert.patient?._id || alert.patient?.id || alert.patient?.lastName)
      .filter(Boolean)
  ).size;

  const availableTypes = useMemo(() => {
    const set = new Set(
      alerts
        .map((alert) => String(alert.type || '').toUpperCase())
        .filter((value) => Boolean(value))
    );
    return Array.from(set).sort();
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

    return alerts.filter((alert) => {
      const patientName = `${alert.patient?.firstName || ''} ${alert.patient?.lastName || ''}`
        .trim()
        .toLowerCase();
      const message = String(alert.message || '').toLowerCase();
      const description = String(alert.description || '').toLowerCase();
      const type = String(alert.type || '').toUpperCase();
      const status = String(alert.status || '').toUpperCase();
      const severity = String(alert.severity || '').toUpperCase();

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
        const ts = alert.timestamp ? new Date(alert.timestamp).getTime() : 0;
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
    void fetchAlerts(false, false);

    const interval = setInterval(() => {
      void fetchAlerts(false, true);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{tr('Alerts', 'Alertes')}</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void fetchAlerts(false, true)}>
          <Text style={styles.refreshBtnText}>{tr('Refresh', 'Actualiser')}</Text>
        </Pressable>
      </View>
      <Text style={styles.subTitle}>
        {tr('Last refresh', 'Derniere actualisation')}: {lastRefreshAt ? lastRefreshAt.toLocaleTimeString() : '--'}
      </Text>

      <StatCard
        title={tr('Total Alerts', 'Total alertes')}
        value={totalAlerts}
        subtitle={tr(`${criticalAlerts} critical`, `${criticalAlerts} critiques`)}
        icon={<MaterialCommunityIcons name="alert-outline" size={24} color={colors.warning} />}
      />
      <StatCard
        title={tr('Pending Alerts', 'Alertes en attente')}
        value={pendingAlerts}
        subtitle={tr(`${impactedPatients} impacted patients`, `${impactedPatients} patients impactes`)}
        icon={<MaterialCommunityIcons name="bell-outline" size={24} color={colors.primary} />}
      />

      <View style={styles.filterCard}>
        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search patient, message, type...', 'Rechercher patient, message, type...')}
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{tr('Severity', 'Severite')}</Text>
          <View style={styles.chipWrap}>
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as SeverityFilter[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => setSeverityFilter(value)}
                style={[styles.chip, severityFilter === value ? styles.chipActive : null]}
              >
                <Text style={severityFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{tr('Status', 'Statut')}</Text>
          <View style={styles.chipWrap}>
            {(['ALL', 'PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED'] as StatusFilter[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => setStatusFilter(value)}
                style={[styles.chip, statusFilter === value ? styles.chipActive : null]}
              >
                <Text style={statusFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{tr('Time', 'Temps')}</Text>
          <View style={styles.chipWrap}>
            {(['ALL', '1H', '6H', '24H', '7D'] as TimeFilter[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => setTimeFilter(value)}
                style={[styles.chip, timeFilter === value ? styles.chipActive : null]}
              >
                <Text style={timeFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{tr('Type', 'Type')}</Text>
          <View style={styles.chipWrap}>
            <Pressable
              onPress={() => setTypeFilter('ALL')}
              style={[styles.chip, typeFilter === 'ALL' ? styles.chipActive : null]}
            >
              <Text style={typeFilter === 'ALL' ? styles.chipTextActive : styles.chipText}>ALL</Text>
            </Pressable>
            {availableTypes.map((value) => (
              <Pressable
                key={value}
                onPress={() => setTypeFilter(value)}
                style={[styles.chip, typeFilter === value ? styles.chipActive : null]}
              >
                <Text style={typeFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {initialLoading && alerts.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}

      <FlatList
        data={paginatedAlerts}
        keyExtractor={(item) => item._id || item.id || Math.random().toString(36)}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchAlerts(false, true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.meta}>{tr('No alerts found for current filters', 'Aucune alerte pour les filtres actifs')}</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const sev = String(item.severity || 'MEDIUM').toUpperCase();
          const status = String(item.status || 'PENDING').toUpperCase();
          const alertId = item._id || item.id || '';
          const isBusy = actionLoadingId === alertId;
          return (
            <View style={styles.card}>
              <Text style={styles.patientName}>
                {item.patient?.firstName || tr('Unknown', 'Inconnu')} {item.patient?.lastName || tr('Patient', 'Patient')}
              </Text>
              <Text style={styles.message}>{item.message || tr('Alert', 'Alerte')}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

              <View style={styles.row}>
                <Text style={styles.meta}>{item.type || '--'}</Text>
                <View style={[styles.sev, { backgroundColor: statusColors[sev as keyof typeof statusColors] || colors.warning }]}>
                  <Text style={styles.sevText}>{sev}</Text>
                </View>
              </View>

              <View style={styles.row}>
                <Text style={styles.meta}>{tr('Status', 'Statut')}: {status}</Text>
                <Text style={styles.meta}>
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : '--'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.actionBtnPrimary}
                  disabled={isBusy || !alertId}
                  onPress={() => void handleAcknowledge(alertId)}
                >
                  {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnPrimaryText}>{tr('Acknowledge', 'Accuser reception')}</Text>}
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  disabled={isBusy || !alertId}
                  onPress={() => void handleResolve(alertId)}
                >
                  <Text style={styles.actionBtnSecondaryText}>{tr('Resolve', 'Resoudre')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {filteredAlerts.length > 0 ? (
        <View style={styles.paginationRow}>
          <Text style={styles.meta}>
            {tr('Page', 'Page')} {currentPage}/{totalPages} • {filteredAlerts.length} {tr('alerts', 'alertes')}
          </Text>
          <View style={styles.paginationBtns}>
            <Pressable
              style={styles.pageBtn}
              onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              <Text style={styles.pageBtnText}>{tr('Prev', 'Prec')}</Text>
            </Pressable>
            <Pressable
              style={styles.pageBtn}
              onPress={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              <Text style={styles.pageBtnText}>{tr('Next', 'Suiv')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subTitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  refreshBtn: {
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  refreshBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterGroup: {
    gap: 6,
  },
  filterLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  chipTextActive: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  patientName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  message: {
    color: colors.text,
    fontWeight: '600',
  },
  desc: {
    color: colors.textMuted,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: colors.textMuted,
  },
  sev: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sevText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  actionRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtnPrimary: {
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnSecondary: {
    minWidth: 85,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  actionBtnSecondaryText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  paginationRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  paginationBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  pageBtn: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  pageBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
});
