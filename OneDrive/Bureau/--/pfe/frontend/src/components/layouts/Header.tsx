import { useEffect, useRef, useState } from 'react';
import { Bell, Moon, Search, Settings, Sun } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { useLanguageStore } from '../../store/languageStore';
import { t } from '../../lib/i18n';
import { useThemeStore } from '../../store/themeStore';

interface AssignmentNotification {
  id: string;
  patientId?: string;
  patientName?: string;
  message: string;
  assignedAt: string;
  read: boolean;
}

interface AssignmentSocketPayload {
  notificationId?: string;
  patientId?: string;
  patientName?: string;
  message?: string;
  assignedAt?: string;
}

interface NotificationApiRecord {
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
}

const buildSocketUrl = (): string => {
  const fromEnv = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const apiBase = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (apiBase && apiBase.trim().length > 0) {
    return apiBase.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
  }

  return 'http://localhost:5000';
};

export default function Header() {
  const { user } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const { theme, setTheme } = useThemeStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AssignmentNotification[]>([]);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsMenuRef = useRef<HTMLDivElement | null>(null);

  const languageOptions = [
    { value: 'en' as const, label: 'English', flagSrc: '/flags/usa.svg', flagAlt: 'USA flag' },
    { value: 'fr' as const, label: 'Francais', flagSrc: '/flags/france.svg', flagAlt: 'France flag' },
  ];
  const themeOptions = [
    {
      value: 'light' as const,
      label: language === 'fr' ? 'Clair' : 'Light',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
    },
    {
      value: 'dark' as const,
      label: language === 'fr' ? 'Sombre' : 'Dark',
      icon: <Moon className="w-4 h-4 text-slate-400" />,
    },
  ];
  const unreadCount = notifications.reduce((count, notification) => {
    return notification.read ? count : count + 1;
  }, 0);

  useEffect(() => {
    if (!user?.id) return;

    let isCancelled = false;

    const loadNotifications = async () => {
      try {
        const response = await api.get('/notifications', {
          params: { limit: 20 },
        });

        const rawNotifications = (response.data?.data?.notifications || []) as NotificationApiRecord[];
        const mappedNotifications: AssignmentNotification[] = rawNotifications.map((item) => {
          const patientName =
            item.patient && (item.patient.firstName || item.patient.lastName)
              ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim()
              : undefined;

          return {
            id: item._id || item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            patientId: item.patient?._id,
            patientName,
            message: item.message || '',
            assignedAt: item.createdAt || item.assignedAt || new Date().toISOString(),
            read: Boolean(item.isRead),
          };
        });

        if (!isCancelled) {
          setNotifications(mappedNotifications);
        }
      } catch {
        if (!isCancelled) {
          setNotifications([]);
        }
      }
    };

    loadNotifications();

    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }

      if (
        notificationsMenuRef.current &&
        !notificationsMenuRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    const hasUnread = notifications.some((notification) => !notification.read);
    if (!hasUnread) return;

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true }))
    );

    try {
      await api.patch('/notifications/read-all');
    } catch {
      // Keep optimistic UI state even if the request fails.
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    if (user.role !== 'DOCTOR' && user.role !== 'NURSE') return;

    const socket: Socket = io(buildSocketUrl(), {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    const subscribe = () => {
      socket.emit('subscribe-user', user.id);
    };

    const onAssignmentCreated = (payload: AssignmentSocketPayload) => {
      const fallbackMessage =
        language === 'fr'
          ? `Vous avez un nouveau patient assigne${payload.patientName ? `: ${payload.patientName}` : ''}`
          : `You have a new patient assignment${payload.patientName ? `: ${payload.patientName}` : ''}`;

      const nextNotification: AssignmentNotification = {
        id: payload.notificationId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        patientId: payload.patientId,
        patientName: payload.patientName,
        message: payload.message || fallbackMessage,
        assignedAt: payload.assignedAt || new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [nextNotification, ...prev].slice(0, 20));
    };

    socket.on('connect', subscribe);
    socket.on('assignment:created', onAssignmentCreated);

    return () => {
      socket.emit('unsubscribe-user', user.id);
      socket.off('connect', subscribe);
      socket.off('assignment:created', onAssignmentCreated);
      socket.disconnect();
    };
  }, [language, user?.id, user?.role]);

  const toggleNotifications = () => {
    setIsNotificationsOpen((prev) => {
      const next = !prev;
      if (next) {
        void markAllAsRead();
      }
      return next;
    });
    setIsSettingsOpen(false);
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t(language, 'header.searchPlaceholder')}
            className="input pl-10 bg-gray-50"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notificationsMenuRef}>
          <button
            type="button"
            onClick={toggleNotifications}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label={language === 'fr' ? 'Notifications' : 'Notifications'}
            aria-expanded={isNotificationsOpen}
            aria-haspopup="menu"
          >
            <Bell className="w-6 h-6 text-gray-600" />
            {unreadCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[1.1rem] text-center font-semibold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>

          {isNotificationsOpen ? (
            <div
              className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white shadow-lg"
              role="menu"
              aria-label={language === 'fr' ? 'Liste des notifications' : 'Notifications list'}
            >
              <div className="px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-800">
                  {language === 'fr' ? 'Notifications' : 'Notifications'}
                </p>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500 text-center">
                    {language === 'fr'
                      ? 'Aucune nouvelle notification'
                      : 'No new notifications'}
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="px-4 py-3 border-b border-gray-100 last:border-b-0"
                    >
                      <p className="text-sm text-gray-800 leading-5">{notification.message}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(notification.assignedAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

       

        {/* Settings */}
        <div className="relative" ref={settingsMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen((prev) => !prev);
              setIsNotificationsOpen(false);
            }}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            title={language === 'fr' ? 'Parametres' : 'Settings'}
            aria-label={language === 'fr' ? 'Parametres' : 'Settings'}
            aria-expanded={isSettingsOpen}
            aria-haspopup="menu"
          >
            <Settings className="w-6 h-6 text-gray-600" />
          </button>

          {isSettingsOpen ? (
            <div
              className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg p-2"
              role="menu"
              aria-label={language === 'fr' ? 'Parametres' : 'Settings'}
            >
              <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {language === 'fr' ? 'Langue' : 'Language'}
              </p>
              <div className="mb-2">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value)}
                    className={`flex w-full items-center justify-between gap-2 px-2 py-2 rounded-md text-left text-sm hover:bg-gray-50 ${
                      language === option.value ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                    }`}
                    role="menuitemradio"
                    aria-checked={language === option.value}
                  >
                    <span className="flex items-center gap-2">
                      <img
                        src={option.flagSrc}
                        alt={option.flagAlt}
                        className="w-6 h-4 rounded-sm border border-gray-200 object-cover"
                      />
                      <span>{option.label}</span>
                    </span>
                    {language === option.value ? <span className="text-xs">✓</span> : null}
                  </button>
                ))}
              </div>

              <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-200 mt-1 pt-2">
                {language === 'fr' ? 'Theme' : 'Theme'}
              </p>
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-2 rounded-md text-left text-sm hover:bg-gray-50 ${
                    theme === option.value ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                  }`}
                  role="menuitemradio"
                  aria-checked={theme === option.value}
                >
                  <span className="flex items-center gap-2">
                    {option.icon}
                    <span>{option.label}</span>
                  </span>
                  {theme === option.value ? <span className="text-xs">✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
