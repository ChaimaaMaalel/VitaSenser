import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function DashboardLayout() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

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
      </div>
    </div>
  );
}
