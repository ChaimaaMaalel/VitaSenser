import { Bell, Search } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { resolveMediaUrl } from '../../lib/media';

export default function Header() {
  const { user } = useAuthStore();

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  const profileImageUrl = resolveMediaUrl(user?.profilePicture);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search patients, alerts..."
            className="input pl-10 bg-gray-50"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-6 h-6 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50">
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt="Profile"
              className="w-6 h-6 rounded-full object-cover border border-primary-200"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{initials || 'U'}</span>
            </div>
          )}
          <span className="text-sm font-medium text-primary-700 capitalize">
            {user?.role.toLowerCase()}
          </span>
        </div>
      </div>
    </header>
  );
}
