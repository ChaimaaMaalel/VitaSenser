import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import { ScreenContainer } from '../components/ScreenContainer';
import { api } from '../services/api';
import { feedback } from '../services/feedback';
import { getSocketUrl } from '../services/socket';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { useNotificationStore } from '../store/notificationStore';
import { colors } from '../theme/colors';

type NotificationItem = {
  _id?: string;
  id?: string;
  message?: string;
  createdAt?: string;
  assignedAt?: string;
  isRead?: boolean;
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
  } | null;
};

type AssignmentSocketPayload = {
  notificationId?: string;
  patientId?: string;
  patientName?: string;
  message?: string;
  assignedAt?: string;
};

export function NotificationsScreen() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const incrementUnread = useNotificationStore((state) => state.incrementUnread);

  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const parseNotificationId = (item: NotificationItem) => item._id || item.id || '';

  const fetchNotifications = async (silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get('/notifications', {
        params: { limit: 50 },
      });

      const nextNotifications: NotificationItem[] = response.data?.data?.notifications || [];
      const unreadCount = Number(response.data?.data?.unreadCount || 0);

      setNotifications(nextNotifications);
      setUnreadCount(unreadCount);
    } catch (err: any) {
      feedback.error(
        err?.response?.data?.error?.message ||
          tr('Failed to load notifications', 'Echec du chargement des notifications')
      );
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const markOneAsRead = async (id: string) => {
    if (!id) return;

    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((current) =>
        current.map((item) => {
          const currentId = parseNotificationId(item);
          if (currentId !== id) return item;
          return {
            ...item,
            isRead: true,
          };
        })
      );
      const unread = notifications.filter((item) => !item.isRead && parseNotificationId(item) !== id).length;
      setUnreadCount(unread);
    } catch (err: any) {
      feedback.error(
        err?.response?.data?.error?.message ||
          tr('Failed to mark notification as read', 'Echec de la mise a jour de notification')
      );
    }
  };

  const markAllAsRead = async () => {
    try {
      setMarkingAll(true);
      await api.patch('/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      feedback.success(tr('All notifications marked as read', 'Toutes les notifications sont lues'));
    } catch (err: any) {
      feedback.error(
        err?.response?.data?.error?.message ||
          tr('Failed to mark all notifications', 'Echec de la mise a jour des notifications')
      );
    } finally {
      setMarkingAll(false);
    }
  };

  useEffect(() => {
    void fetchNotifications(false);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchNotifications(true);
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    const subscribe = () => {
      socket.emit('subscribe-user', user.id);
    };

    const onAssignmentCreated = (payload: AssignmentSocketPayload) => {
      const patientSuffix = payload.patientName ? `: ${payload.patientName}` : '';
      const fallbackMessage = tr(
        `You have a new patient assignment${patientSuffix}`,
        `Vous avez une nouvelle affectation patient${patientSuffix}`
      );

      const nextNotification: NotificationItem = {
        _id: payload.notificationId,
        message: payload.message || fallbackMessage,
        assignedAt: payload.assignedAt || new Date().toISOString(),
        isRead: false,
        patient: payload.patientName
          ? {
              _id: payload.patientId,
              firstName: payload.patientName,
              lastName: '',
            }
          : null,
      };

      setNotifications((current) => [nextNotification, ...current].slice(0, 50));
      incrementUnread();
    };

    socket.on('connect', subscribe);
    socket.on('assignment:created', onAssignmentCreated);
    socketRef.current = socket;

    return () => {
      socket.emit('unsubscribe-user', user.id);
      socket.off('connect', subscribe);
      socket.off('assignment:created', onAssignmentCreated);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [incrementUnread, language, user?.id]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'UNREAD') {
      return notifications.filter((item) => !item.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{tr('Notifications', 'Notifications')}</Text>
          <Text style={styles.subtitle}>
            {tr('Assignments and system updates', 'Affectations et mises a jour systeme')}
          </Text>
        </View>
        <Pressable style={styles.secondaryBtn} onPress={() => void fetchNotifications(true)}>
          {refreshing ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.secondaryBtnText}>{tr('Refresh', 'Actualiser')}</Text>}
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.chip, filter === 'ALL' ? styles.chipActive : null]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={filter === 'ALL' ? styles.chipTextActive : styles.chipText}>{tr('All', 'Tous')}</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, filter === 'UNREAD' ? styles.chipActive : null]}
          onPress={() => setFilter('UNREAD')}
        >
          <Text style={filter === 'UNREAD' ? styles.chipTextActive : styles.chipText}>{tr('Unread', 'Non lus')}</Text>
        </Pressable>

        <Pressable style={[styles.primaryBtn, markingAll ? styles.btnDisabled : null]} onPress={() => void markAllAsRead()} disabled={markingAll}>
          {markingAll ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tr('Mark all read', 'Tout marquer lu')}</Text>}
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => parseNotificationId(item) || `${item.message || 'notif'}-${item.createdAt || item.assignedAt}`}
        scrollEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchNotifications(true)} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={styles.emptyText}>{tr('No notifications', 'Aucune notification')}</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const id = parseNotificationId(item);
          const isRead = Boolean(item.isRead);
          const patientName = item.patient
            ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim()
            : '';
          const createdAt = item.createdAt || item.assignedAt;

          return (
            <View style={[styles.card, !isRead ? styles.cardUnread : null]}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardMessage}>{item.message || tr('Notification', 'Notification')}</Text>
                {!isRead ? <View style={styles.unreadDot} /> : null}
              </View>
              {patientName ? <Text style={styles.cardMeta}>{patientName}</Text> : null}
              <Text style={styles.cardMeta}>{createdAt ? new Date(createdAt).toLocaleString() : '--'}</Text>

              {!isRead ? (
                <Pressable style={styles.secondaryBtn} onPress={() => void markOneAsRead(id)}>
                  <Text style={styles.secondaryBtnText}>{tr('Mark as read', 'Marquer comme lu')}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  cardUnread: {
    borderColor: '#93c5fd',
    backgroundColor: '#f8fbff',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardMessage: {
    color: colors.text,
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 10,
  },
  secondaryBtn: {
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
