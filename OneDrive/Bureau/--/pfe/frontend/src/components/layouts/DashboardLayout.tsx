import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import Sidebar from './Sidebar';
import Header from './Header';
import EmergencyAlertModal from './EmergencyAlertModal';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';

interface AlertRecord {
  _id?: string;
  id?: string;
  createdAt?: string;
  type?: string;
  severity?: string;
  status?: string;
  message?: string;
  timestamp?: string;
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    bed?: {
      _id?: string;
      bedNumber?: string;
      room?: {
        _id?: string;
        roomNumber?: string;
        name?: string;
      } | null;
    } | null;
  } | null;
  vitalSigns?: {
    bed?: {
      _id?: string;
      bedNumber?: string;
      room?: {
        _id?: string;
        roomNumber?: string;
        name?: string;
      } | null;
    } | null;
  } | null;
}

const getAlertId = (alert: AlertRecord | null) => {
  if (!alert) return null;
  return alert._id || alert.id || null;
};

const getAlertTimestampMs = (alert: AlertRecord | null) => {
  if (!alert) return 0;
  const candidates = [alert.timestamp, alert.createdAt];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
};

const isUrgentEmergencyAlert = (alert: AlertRecord) => {
  const severity = String(alert.severity || '').toUpperCase();
  const type = String(alert.type || '').toUpperCase();
  const status = String(alert.status || '').toUpperCase();
  const message = String(alert.message || '').toLowerCase();

  if (status === 'RESOLVED') {
    return false;
  }

  return (
    severity === 'CRITICAL' ||
    type === 'EMERGENCY' ||
    message.includes('help') ||
    message.includes('urgent') ||
    message.includes('assistance')
  );
};

const buildSocketUrl = (): string => {
  const fromEnv = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;
  if (fromEnv) return fromEnv;

  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  return baseUrl.replace(/\/api\/v\d+$/, '');
};

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const language = useLanguageStore((state) => state.language);
  const isEmergencyModalAllowed =
    user?.role === 'DOCTOR' || user?.role === 'NURSE';

  const [modalAlerts, setModalAlerts] = useState<AlertRecord[]>([]);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isAcknowledgeLoading, setIsAcknowledgeLoading] = useState(false);
  const dismissedAlertsUntilRef = useRef<Map<string, number>>(new Map());
  const hasUrgentBaselineRef = useRef(false);
  const seenUrgentAlertIdsRef = useRef<Set<string>>(new Set());
  const modalSessionStartedAtRef = useRef<number>(Date.now());

  const isAlertSnoozed = (alertId: string) => {
    const snoozedUntil = dismissedAlertsUntilRef.current.get(alertId);
    if (!snoozedUntil) return false;
    if (Date.now() >= snoozedUntil) {
      dismissedAlertsUntilRef.current.delete(alertId);
      return false;
    }
    return true;
  };

  useEffect(() => {
    const refreshCurrentUser = async () => {
      if (!user?.id) return;

      try {
        const response = await api.get(`/users/${user.id}`);
        const latestUser = response.data?.data?.user;
        if (!latestUser) return;

        updateUser({
          id: latestUser._id || latestUser.id || user.id,
          firstName: latestUser.firstName,
          lastName: latestUser.lastName,
          email: latestUser.email,
          role: latestUser.role,
          profilePicture: latestUser.profilePicture,
          roleDetails: latestUser.roleDetails,
        });
      } catch {
        // Keep existing auth user data if refresh fails.
      }
    };

    refreshCurrentUser();
  }, [user?.id, updateUser]);

  useEffect(() => {
    if (!user?.id || !isEmergencyModalAllowed) {
      setIsEmergencyModalOpen(false);
      setModalAlerts([]);
      hasUrgentBaselineRef.current = false;
      seenUrgentAlertIdsRef.current.clear();
      modalSessionStartedAtRef.current = Date.now();
      return;
    }

    let isCancelled = false;

    const checkUrgentAlerts = async () => {
      try {
        const response = await api.get('/alerts?limit=40');
        const alerts = (response.data?.data?.alerts || []) as AlertRecord[];

        const urgentAlerts = alerts
          .filter(isUrgentEmergencyAlert)
          .map((alert) => ({
            alert,
            alertId: getAlertId(alert),
          }))
          .filter(
            (entry): entry is { alert: AlertRecord; alertId: string } =>
              Boolean(entry.alertId)
          );

        if (urgentAlerts.length === 0) {
          return;
        }

        // Baseline pass: mark existing urgent alerts as seen without opening modal.
        if (!hasUrgentBaselineRef.current) {
          hasUrgentBaselineRef.current = true;
          const sessionStartTs = modalSessionStartedAtRef.current;

          const freshUrgentAlerts = urgentAlerts.filter((entry) => {
            const ts = getAlertTimestampMs(entry.alert);
            return (
              ts > 0 &&
              ts >= sessionStartTs - 1000 &&
              !seenUrgentAlertIdsRef.current.has(entry.alertId) &&
              !isAlertSnoozed(entry.alertId)
            );
          });

          urgentAlerts.forEach((entry) => {
            seenUrgentAlertIdsRef.current.add(entry.alertId);
          });

          if (freshUrgentAlerts.length === 0) {
            return;
          }

          if (isCancelled) return;

          setModalAlerts((current) => {
            const byId = new Map<string, AlertRecord>();

            current.forEach((item) => {
              const itemId = getAlertId(item);
              if (itemId) byId.set(itemId, item);
            });

            freshUrgentAlerts.forEach((entry) => {
              byId.set(entry.alertId, entry.alert);
            });

            return Array.from(byId.values());
          });

          setIsEmergencyModalOpen(true);
          return;
        }

        const newUrgentAlerts = urgentAlerts.filter(
          (entry) =>
            !seenUrgentAlertIdsRef.current.has(entry.alertId) &&
            !isAlertSnoozed(entry.alertId)
        );

        if (newUrgentAlerts.length === 0) {
          return;
        }

        newUrgentAlerts.forEach((entry) => {
          seenUrgentAlertIdsRef.current.add(entry.alertId);
        });

        if (isCancelled) return;

        setModalAlerts((current) => {
          const byId = new Map<string, AlertRecord>();

          current.forEach((item) => {
            const itemId = getAlertId(item);
            if (itemId) byId.set(itemId, item);
          });

          newUrgentAlerts.forEach((entry) => {
            byId.set(entry.alertId, entry.alert);
          });

          return Array.from(byId.values());
        });

        setIsEmergencyModalOpen(true);
      } catch {
        // Silent fail; modal flow retries on next interval.
      }
    };

    void checkUrgentAlerts();

    const handleWindowFocus = () => {
      void checkUrgentAlerts();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkUrgentAlerts();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      void checkUrgentAlerts();
    }, 5000);

    return () => {
      isCancelled = true;
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [isEmergencyModalAllowed, user?.id, location.pathname]);

  useEffect(() => {
    if (!user?.id || !isEmergencyModalAllowed) return;

    const socket: Socket = io(buildSocketUrl(), {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    const subscribe = () => {
      socket.emit('subscribe-user', user.id);
    };

    const onAlertCreated = (payload: { alert?: AlertRecord | null }) => {
      const alert = payload?.alert;
      if (!alert || !isUrgentEmergencyAlert(alert)) return;

      const alertId = getAlertId(alert);
      if (!alertId) return;
      if (seenUrgentAlertIdsRef.current.has(alertId)) return;
      if (isAlertSnoozed(alertId)) return;

      seenUrgentAlertIdsRef.current.add(alertId);

      setModalAlerts((current) => {
        const byId = new Map<string, AlertRecord>();

        current.forEach((item) => {
          const itemId = getAlertId(item);
          if (itemId) byId.set(itemId, item);
        });

        byId.set(alertId, alert);
        return Array.from(byId.values());
      });

      setIsEmergencyModalOpen(true);
    };

    socket.on('connect', subscribe);
    socket.on('alert:created', onAlertCreated);

    return () => {
      socket.emit('unsubscribe-user', user.id);
      socket.off('connect', subscribe);
      socket.off('alert:created', onAlertCreated);
      socket.disconnect();
    };
  }, [isEmergencyModalAllowed, user?.id]);

  const dismissEmergencyModal = () => {
    modalAlerts.forEach((alert) => {
      const alertId = getAlertId(alert);
      if (alertId) {
        // Dismiss acts as a short snooze so unresolved emergencies can reappear.
        dismissedAlertsUntilRef.current.set(alertId, Date.now() + 2 * 60 * 1000);
      }
    });

    setIsEmergencyModalOpen(false);
    setModalAlerts([]);
  };

  const handleOpenAlertsPage = () => {
    setIsEmergencyModalOpen(false);
    setModalAlerts([]);
    navigate('/alerts');
  };

  const handleAcknowledgeEmergency = async () => {
    const alertIds = modalAlerts
      .map((alert) => getAlertId(alert))
      .filter((id): id is string => Boolean(id));

    if (alertIds.length === 0) return;

    try {
      setIsAcknowledgeLoading(true);

      const results = await Promise.allSettled(
        alertIds.map((alertId) => api.post(`/alerts/${alertId}/acknowledge`))
      );

      const failedIds = new Set<string>();

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedIds.add(alertIds[index]);
        }
      });

      if (failedIds.size > 0) {
        setModalAlerts((current) =>
          current.filter((alert) => {
            const alertId = getAlertId(alert);
            return alertId ? failedIds.has(alertId) : false;
          })
        );
        setIsEmergencyModalOpen(true);
      } else {
        setIsEmergencyModalOpen(false);
        setModalAlerts([]);
      }
    } catch {
      // Keep modal open if acknowledge fails.
    } finally {
      setIsAcknowledgeLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

        {isEmergencyModalAllowed ? (
          <EmergencyAlertModal
            isOpen={isEmergencyModalOpen}
            alerts={modalAlerts}
            language={language}
            onClose={dismissEmergencyModal}
            onAcknowledge={handleAcknowledgeEmergency}
            onOpenAlerts={handleOpenAlertsPage}
            isAcknowledgeLoading={isAcknowledgeLoading}
          />
        ) : null}
      </div>
    </div>
  );
}
