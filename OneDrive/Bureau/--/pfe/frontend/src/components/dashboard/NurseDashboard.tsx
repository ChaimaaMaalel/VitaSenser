import { useEffect, useState } from 'react';
import { Users, AlertTriangle, Activity, Heart } from 'lucide-react';
import api from '../../lib/api';
import StatsCard from './StatsCard';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { resolveMediaUrl } from '../../lib/media';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  status: string;
  bedId?: {
    bedNumber: string;
    roomId?: {
      roomNumber: string;
      floorId?: {
        floorNumber: number;
      };
    };
  };
}

interface Alert {
  _id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  patientId?: {
    firstName: string;
    lastName: string;
    bedId?: {
      bedNumber: string;
      roomId?: {
        roomNumber: string;
        floorId?: {
          floorNumber: number;
        };
      };
    };
  };
}

interface FloorOccupancy {
  floorNumber: number;
  name: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
}

interface NurseDashboardData {
  role: string;
  nurse: {
    name: string;
    shift: string;
    certificationLevel?: string;
    department?: string;
  };
  patients: {
    total: number;
    critical: number;
    list: Patient[];
  };
  alerts: {
    active: number;
    critical: number;
    recent: Alert[];
  };
  floorOccupancy?: FloorOccupancy;
}

export default function NurseDashboard() {
  const user = useAuthStore((state) => state.user);
  const [dashboardData, setDashboardData] = useState<NurseDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  const profileImageUrl = resolveMediaUrl(user?.profilePicture);

  useEffect(() => {
    fetchNurseDashboard();
  }, []);

  const fetchNurseDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setDashboardData(response.data.data);
    } catch (error: any) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800';
      case 'IN_TREATMENT':
        return 'bg-orange-100 text-orange-800';
      case 'STABLE':
        return 'bg-green-100 text-green-800';
      case 'ADMITTED':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getShiftColor = (shift: string) => {
    switch (shift) {
      case 'DAY':
        return 'bg-yellow-100 text-yellow-800';
      case 'NIGHT':
        return 'bg-indigo-100 text-indigo-800';
      case 'EVENING':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nurse Info Card */}
      <div className="card bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-stretch gap-4 mb-4">
          <div className="w-28 h-28 shrink-0">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt="Profile"
                className="h-full w-full rounded-2xl object-cover border border-green-200"
              />
            ) : (
              <div className="h-full w-full rounded-2xl bg-green-100 text-green-700 font-semibold flex items-center justify-center text-2xl">
                {initials || 'N'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{dashboardData?.nurse.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className={clsx('badge capitalize', getShiftColor(dashboardData?.nurse.shift || ''))}>
                {dashboardData?.nurse.shift} Shift
              </span>
              {dashboardData?.nurse.certificationLevel && (
                <span className="badge bg-blue-100 text-blue-800">
                  {dashboardData.nurse.certificationLevel}
                </span>
              )}
            </div>
            {dashboardData?.nurse.department && (
              <p className="text-sm text-gray-600 mt-2">
                Department: {dashboardData.nurse.department}
              </p>
            )}
          </div>
          <div className="flex items-start">
            <Heart className="w-12 h-12 text-green-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Assigned Patients"
          value={dashboardData?.patients.total || 0}
          subtitle="Total assigned"
          icon={Users}
          color="blue"
        />
        <StatsCard
          title="Critical Patients"
          value={dashboardData?.patients.critical || 0}
          subtitle="Require attention"
          icon={Activity}
          color="red"
        />
        <StatsCard
          title="Active Alerts"
          value={dashboardData?.alerts.active || 0}
          subtitle={`${dashboardData?.alerts.critical || 0} critical`}
          icon={AlertTriangle}
          color="orange"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Patients */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">My Patients</h2>
            <Users className="w-5 h-5 text-blue-500" />
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {dashboardData?.patients.list && dashboardData.patients.list.length > 0 ? (
              dashboardData.patients.list.map((patient) => (
                <div key={patient._id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {patient.bedId?.roomId?.floorId?.floorNumber && (
                          <>
                            Floor {patient.bedId.roomId.floorId.floorNumber} •{' '}
                          </>
                        )}
                        {patient.bedId?.roomId?.roomNumber && (
                          <>
                            Room {patient.bedId.roomId.roomNumber} •{' '}
                          </>
                        )}
                        {patient.bedId?.bedNumber && <>Bed {patient.bedId.bedNumber}</>}
                      </p>
                    </div>
                    <span className={clsx('badge text-xs capitalize', getStatusColor(patient.status))}>
                      {patient.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No assigned patients</p>
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Alerts</h2>
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {dashboardData?.alerts.recent && dashboardData.alerts.recent.length > 0 ? (
              dashboardData.alerts.recent.map((alert) => (
                <div
                  key={alert._id}
                  className={clsx(
                    'p-3 rounded-lg border-2',
                    getSeverityColor(alert.severity)
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">
                        {alert.patientId?.firstName} {alert.patientId?.lastName}
                      </p>
                      <p className="text-sm mt-1">{alert.message}</p>
                      {alert.patientId?.bedId && (
                        <p className="text-xs mt-1 opacity-75">
                          {alert.patientId.bedId.roomId?.floorId?.floorNumber && (
                            <>Floor {alert.patientId.bedId.roomId.floorId.floorNumber} • </>
                          )}
                          {alert.patientId.bedId.roomId?.roomNumber && (
                            <>Room {alert.patientId.bedId.roomId.roomNumber} • </>
                          )}
                          {alert.patientId.bedId.bedNumber && (
                            <>Bed {alert.patientId.bedId.bedNumber}</>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="badge badge-sm capitalize">{alert.severity}</span>
                  </div>
                  <div className="text-xs opacity-75 mt-2">
                    {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No active alerts</p>
            )}
          </div>
        </div>
      </div>

      {/* Floor Occupancy */}
      {dashboardData?.floorOccupancy && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Floor Occupancy</h2>
            <Heart className="w-5 h-5 text-green-500" />
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">
                  {dashboardData.floorOccupancy.name} (Floor {dashboardData.floorOccupancy.floorNumber})
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {dashboardData.floorOccupancy.occupancyRate}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-green-400 to-green-600"
                  style={{
                    width: `${dashboardData.floorOccupancy.occupancyRate}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs text-gray-600">
                <span>{dashboardData.floorOccupancy.occupiedBeds} occupied</span>
                <span>{dashboardData.floorOccupancy.availableBeds} available</span>
                <span>{dashboardData.floorOccupancy.totalBeds} total</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
