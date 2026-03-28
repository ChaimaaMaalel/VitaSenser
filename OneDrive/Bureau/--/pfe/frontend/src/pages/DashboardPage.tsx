import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import DoctorDashboard from '../components/dashboard/DoctorDashboard';
import NurseDashboard from '../components/dashboard/NurseDashboard';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to Smart Hospital monitoring system</p>
      </div>

      {/* Role-based Dashboard Content */}
      {user?.role === 'ADMIN' && <AdminDashboard />}
      {user?.role === 'DOCTOR' && <DoctorDashboard />}
      {user?.role === 'NURSE' && <NurseDashboard />}
    </div>
  );
}
