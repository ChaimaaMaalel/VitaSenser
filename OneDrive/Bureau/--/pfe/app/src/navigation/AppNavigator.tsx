import { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import { AppTabParamList, RootStackParamList } from './types';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PatientsScreen } from '../screens/PatientsScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { SimulationScreen } from '../screens/SimulationScreen';
import { HospitalScreen } from '../screens/HospitalScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { PatientDetailScreen } from '../screens/PatientDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { useI18n } from '../i18n/useI18n';
import { useNotificationStore } from '../store/notificationStore';
import { api } from '../services/api';
import { getSocketUrl } from '../services/socket';

const Tab = createBottomTabNavigator<AppTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function AppTabs() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const { t } = useI18n();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const incrementUnread = useNotificationStore((state) => state.incrementUnread);

  useEffect(() => {
    if (!user?.id) return;

    let isCancelled = false;

    const syncUnreadCount = async () => {
      try {
        const response = await api.get('/notifications', {
          params: { limit: 1 },
        });
        const nextUnread = Number(response.data?.data?.unreadCount || 0);
        if (!isCancelled) {
          setUnreadCount(nextUnread);
        }
      } catch {
        // Keep previous badge value on transient failures.
      }
    };

    void syncUnreadCount();
    const poller = setInterval(() => {
      void syncUnreadCount();
    }, 20000);

    const socket: Socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    const subscribe = () => {
      socket.emit('subscribe-user', user.id);
    };

    const onAssignmentCreated = () => {
      incrementUnread();
    };

    socket.on('connect', subscribe);
    socket.on('assignment:created', onAssignmentCreated);

    return () => {
      isCancelled = true;
      clearInterval(poller);
      socket.emit('unsubscribe-user', user.id);
      socket.off('connect', subscribe);
      socket.off('assignment:created', onAssignmentCreated);
      socket.disconnect();
    };
  }, [incrementUnread, setUnreadCount, user?.id]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabel:
          route.name === 'Dashboard'
            ? t('tabs.dashboard')
            : route.name === 'Patients'
              ? t('tabs.patients')
              : route.name === 'Alerts'
                ? t('tabs.alerts')
                : route.name === 'Notifications'
                  ? t('tabs.notifications')
                  : route.name === 'Simulation'
                    ? t('tabs.simulation')
                    : route.name === 'Hospital'
                      ? t('tabs.hospital')
                      : route.name === 'Users'
                        ? t('tabs.users')
                        : t('tabs.settings'),
        tabBarBadge:
          route.name === 'Notifications' && unreadCount > 0
            ? unreadCount > 99
              ? '99+'
              : unreadCount
            : undefined,
        tabBarIcon: ({ color, size }) => {
          const iconByRoute: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
            Dashboard: 'view-dashboard-outline',
            Patients: 'account-group-outline',
            Alerts: 'alert-outline',
            Notifications: 'bell-outline',
            Simulation: 'chart-line-variant',
            Hospital: 'hospital-building',
            Users: 'account-cog-outline',
            Settings: 'cog-outline',
          };
          return <MaterialCommunityIcons name={iconByRoute[route.name]} color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Patients" component={PatientsScreen} />
      {(role === 'DOCTOR' || role === 'NURSE' || role === 'ADMIN') && (
        <Tab.Screen name="Alerts" component={AlertsScreen} />
      )}
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      {role === 'ADMIN' && <Tab.Screen name="Simulation" component={SimulationScreen} />}
      {role === 'ADMIN' && <Tab.Screen name="Hospital" component={HospitalScreen} />}
      {role === 'ADMIN' && <Tab.Screen name="Users" component={UsersScreen} />}
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { t } = useI18n();

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isAuthenticated ? (
          <>
            <Stack.Screen
              name="AppTabs"
              component={AppTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PatientDetail"
              component={PatientDetailScreen}
              options={{ title: `${t('tabs.patients')} detail` }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
