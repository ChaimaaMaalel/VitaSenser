import { NavLink } from 'react-router-dom';
import {
  Activity,
  LayoutDashboard,
  Users,
  AlertTriangle,
  Building2,
  SlidersHorizontal,
  UserCog,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { resolveMediaUrl } from '../../lib/media';
import clsx from 'clsx';
import { useLanguageStore } from '../../store/languageStore';
import { t, type TranslationKey } from '../../lib/i18n';

type UserRole = 'ADMIN' | 'DOCTOR' | 'NURSE';
type NavigationItem = {
  labelKey: TranslationKey;
  href: string;
  icon: any;
  roles?: UserRole[];
};

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { language } = useLanguageStore();

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  const profileImageUrl = resolveMediaUrl(user?.profilePicture);

  const navigation: NavigationItem[] = [
    { labelKey: 'nav.dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
    { labelKey: 'nav.patients' as const, href: '/patients', icon: Users },
    { labelKey: 'nav.alerts' as const, href: '/alerts', icon: AlertTriangle, roles: ['DOCTOR', 'NURSE'] },
    {
      labelKey: 'nav.simulation' as const,
      href: '/simulation',
      icon: SlidersHorizontal,
      roles: ['ADMIN'],
    },
    { labelKey: 'nav.hospital' as const, href: '/hospital', icon: Building2, roles: ['ADMIN'] },
    { labelKey: 'nav.users' as const, href: '/users', icon: UserCog, roles: ['ADMIN'] },
  ];
  const roleKeyByRole: Record<UserRole, TranslationKey> = {
    ADMIN: 'role.admin',
    DOCTOR: 'role.doctor',
    NURSE: 'role.nurse',
  };
  const userRoleLabel = user?.role ? t(language, roleKeyByRole[user.role]) : '';

  const filteredNavigation = navigation.filter(
    (item) => !item.roles || (user?.role ? item.roles.includes(user.role) : false)
  );

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 border-b border-gray-200 flex items-center px-6">
        <Activity className="w-8 h-8 text-primary-600" />
        <span className="ml-3 text-xl font-bold text-gray-900">Vita Senser</span>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          {profileImageUrl ? (
            <img
            
              src={profileImageUrl}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-700 font-semibold text-sm">{initials || 'U'}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-500 capitalize">{userRoleLabel}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {filteredNavigation.map((item) => (
          <NavLink
            key={item.labelKey}
            to={item.href}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {t(language, item.labelKey)}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {t(language, 'auth.signOut')}
        </button>
      </div>
    </div>
  );
}
