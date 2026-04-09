import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatCard } from '../components/StatCard';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import { api } from '../services/api';
import { useI18n } from '../i18n/useI18n';

type DashboardResponse = {
  role?: 'ADMIN' | 'DOCTOR' | 'NURSE';
  patients?: {
    total?: number;
    active?: number;
    critical?: number;
    list?: Array<{
      _id: string;
      firstName?: string;
      lastName?: string;
      status?: string;
    }>;
  };
  alerts?: {
    active?: number;
    critical?: number;
    recent?: Array<{
      _id: string;
      severity?: string;
      message?: string;
      patientId?: {
        firstName?: string;
        lastName?: string;
      };
    }>;
  };
  beds?: {
    total?: number;
    occupied?: number;
    available?: number;
    occupancyRate?: number;
  };
  doctor?: {
    specialization?: string;
    department?: string;
  };
  nurse?: {
    shift?: string;
    department?: string;
  };
};

function severityColor(severity?: string) {
  const value = String(severity || '').toUpperCase();
  if (value === 'CRITICAL') return colors.danger;
  if (value === 'HIGH' || value === 'MODERATE') return colors.warning;
  return colors.info;
}

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  const role = user?.role || 'NURSE';

  const roleInfo = useMemo(() => {
    if (role === 'DOCTOR') {
      return dashboard?.doctor?.department || dashboard?.doctor?.specialization || '--';
    }
    if (role === 'NURSE') {
      return dashboard?.nurse?.department || dashboard?.nurse?.shift || '--';
    }
    return `Beds: ${dashboard?.beds?.total || 0}`;
  }, [dashboard, role]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/dashboard');
        setDashboard(response.data?.data || null);
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || t('dashboard.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View style={{ gap: 4, flex: 1 }}>
          <Text style={styles.title}>{t('dashboard.title')}</Text>
          <Text style={styles.subtitle}>{t('dashboard.welcome', { name: user?.firstName || 'User' })}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={logout}>
          <MaterialCommunityIcons name="logout" size={18} color="#fff" />
          <Text style={styles.logoutText}>{t('dashboard.logout')}</Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.subtitle}>{t('dashboard.loading')}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <StatCard
        title={t('dashboard.totalPatients')}
        value={dashboard?.patients?.total || 0}
        subtitle={t('dashboard.activePatients', { count: dashboard?.patients?.active || 0 })}
        icon={<MaterialCommunityIcons name="account-group" size={24} color={colors.primary} />}
      />
      <StatCard
        title={t('dashboard.criticalAlerts')}
        value={dashboard?.alerts?.critical || 0}
        subtitle={t('dashboard.activeAlerts', { count: dashboard?.alerts?.active || 0 })}
        icon={<MaterialCommunityIcons name="alert" size={24} color={colors.danger} />}
      />
      <StatCard
        title={t('dashboard.role')}
        value={role}
        subtitle={roleInfo}
        icon={<MaterialCommunityIcons name="shield-account" size={24} color={colors.warning} />}
      />

      {role === 'ADMIN' ? (
        <StatCard
          title={t('dashboard.bedOccupancy')}
          value={`${dashboard?.beds?.occupancyRate || 0}%`}
          subtitle={t('dashboard.occupiedBeds', {
            occupied: dashboard?.beds?.occupied || 0,
            total: dashboard?.beds?.total || 0,
          })}
          icon={<MaterialCommunityIcons name="bed" size={24} color={colors.info} />}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('dashboard.recentAlerts')}</Text>
        {(dashboard?.alerts?.recent || []).length === 0 ? (
          <Text style={styles.subtitle}>{t('dashboard.noRecentAlerts')}</Text>
        ) : (
          (dashboard?.alerts?.recent || []).slice(0, 6).map((item) => (
            <View key={item._id} style={styles.alertRow}>
              <View style={[styles.dot, { backgroundColor: severityColor(item.severity) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertText}>{item.message || 'Alert'}</Text>
                <Text style={styles.alertSub}>
                  {item.patientId?.firstName || ''} {item.patientId?.lastName || ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('dashboard.assignedPatients')}</Text>
        {(dashboard?.patients?.list || []).length === 0 ? (
          <Text style={styles.subtitle}>{t('dashboard.noAssignedPatients')}</Text>
        ) : (
          (dashboard?.patients?.list || []).slice(0, 6).map((item) => (
            <View key={item._id} style={styles.patientRow}>
              <Text style={styles.patientName}>{item.firstName} {item.lastName}</Text>
              <Text style={styles.patientStatus}>{String(item.status || 'STABLE').toUpperCase()}</Text>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
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
  subtitle: {
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  alertText: {
    color: colors.text,
    fontWeight: '600',
  },
  alertSub: {
    color: colors.textMuted,
    fontSize: 12,
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  patientName: {
    color: colors.text,
    fontWeight: '600',
  },
  patientStatus: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
