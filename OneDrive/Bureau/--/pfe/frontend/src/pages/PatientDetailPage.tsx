import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, Heart, Thermometer, Wind, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import api from '../lib/api';
import { format } from 'date-fns';

// 3D Hospital Room Component
function HospitalRoom3D() {
  return (
    <>
      {/* Hospital Bed */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[2, 0.2, 3]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
      
      {/* Bed Frame */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.2, 0.1, 3.2]} />
        <meshStandardMaterial color="#2d3748" />
      </mesh>

      {/* Pillow */}
      <mesh position={[0, 0.5, -1]}>
        <boxGeometry args={[1, 0.2, 0.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* Blanket */}
      <mesh position={[0, 0.45, 0.2]}>
        <boxGeometry args={[1.8, 0.1, 2]} />
        <meshStandardMaterial color="#60a5fa" />
      </mesh>

      {/* Patient (simplified head) */}
      <mesh position={[0, 0.6, -0.5]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#f0d9c4" />
      </mesh>

      {/* Heart Rate Monitor */}
      <group position={[1.5, 1.5, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.7, 0.1]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[0.4, 0.5, 0.01]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* IV Stand */}
      <group position={[-1.2, 1, -0.5]}>
        <mesh>
          <cylinderGeometry args={[0.02, 0.02, 2, 16]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.3, 0.05, 0.1, 16]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh position={[0.2, 0.7, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
          <meshStandardMaterial color="#e0f2fe" transparent opacity={0.6} />
        </mesh>
      </group>

      {/* Bedside Table */}
      <mesh position={[-1.5, 0.4, 1]}>
        <boxGeometry args={[0.6, 0.8, 0.5]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 2, -3]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      <mesh position={[-3, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color="#f9fafb" />
      </mesh>

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 3, 0]} intensity={1} />
      <spotLight position={[2, 3, 2]} angle={0.3} penumbra={1} intensity={0.5} castShadow />
    </>
  );
}

// Vital Signs Card Component
interface VitalSignProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
}

function VitalSignCard({ icon, label, value, unit, status, trend }: VitalSignProps) {
  const statusColors = {
    normal: 'bg-green-50 border-green-200 text-green-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→',
  };

  return (
    <div className={`border-2 rounded-lg p-4 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        {trend && (
          <span className="text-2xl font-bold">{trendIcons[trend]}</span>
        )}
      </div>
      <div className="text-3xl font-bold">
        {value} <span className="text-lg font-normal">{unit}</span>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [vitalSigns, setVitalSigns] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'heartRate' | 'bloodPressure' | 'oxygenSaturation' | 'temperature'>('heartRate');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const [patientRes, vitalsRes] = await Promise.all([
          api.get(`/patients/${id}`),
          api.get(`/patients/${id}/vitals`),
        ]);

        setPatient(patientRes.data.data.patient);
        setVitalSigns(vitalsRes.data.data.vitals || []);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch patient data:', error);
        setLoading(false);
      }
    };

    if (id) {
      fetchPatientData();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Patient not found</p>
        </div>
      </div>
    );
  }

  const latestVitals = vitalSigns[0] || {};
  
  // Prepare chart data
  const chartData = vitalSigns.slice(0, 20).reverse().map((vital) => ({
    time: format(new Date(vital.timestamp), 'HH:mm'),
    heartRate: vital.heartRate,
    systolic: vital.bloodPressureSystolic,
    diastolic: vital.bloodPressureDiastolic,
    oxygen: vital.oxygenSaturation,
    temperature: vital.temperature,
  }));

  const metricConfig = {
    heartRate: {
      label: 'Heart Rate',
      dataKey: 'heartRate',
      color: '#ef4444',
      unit: 'bpm',
      normalRange: [60, 100],
    },
    bloodPressure: {
      label: 'Blood Pressure',
      dataKey: 'systolic',
      secondaryKey: 'diastolic',
      color: '#3b82f6',
      unit: 'mmHg',
      normalRange: [90, 140],
    },
    oxygenSaturation: {
      label: 'Oxygen Saturation',
      dataKey: 'oxygen',
      color: '#10b981',
      unit: '%',
      normalRange: [95, 100],
    },
    temperature: {
      label: 'Temperature',
      dataKey: 'temperature',
      color: '#f59e0b',
      unit: '°C',
      normalRange: [36.5, 37.5],
    },
  };

  const currentMetric = metricConfig[selectedMetric];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-gray-600 mt-1">
              MRN: {patient.medicalRecordNumber} • Age: {patient.age} • Gender: {patient.gender}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-full font-semibold ${
            patient.status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
            patient.status === 'IN_TREATMENT' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            {patient.status}
          </div>
        </div>
      </div>

      {/* 3D Hospital Room Visualization */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Hospital Room - 3D View</h2>
          <p className="text-sm text-gray-600">Drag to rotate • Scroll to zoom</p>
        </div>
        <div className="h-96">
          <Canvas shadows>
            <PerspectiveCamera makeDefault position={[4, 3, 4]} />
            <OrbitControls 
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              minDistance={3}
              maxDistance={10}
            />
            <Environment preset="city" />
            <HospitalRoom3D />
          </Canvas>
        </div>
      </div>

      {/* Current Vital Signs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <VitalSignCard
          icon={<Heart className="w-5 h-5" />}
          label="Heart Rate"
          value={latestVitals.heartRate || '--'}
          unit="bpm"
          status={
            latestVitals.heartRate >= 60 && latestVitals.heartRate <= 100 ? 'normal' :
            latestVitals.heartRate > 100 && latestVitals.heartRate <= 120 ? 'warning' : 'critical'
          }
          trend="stable"
        />
        <VitalSignCard
          icon={<Activity className="w-5 h-5" />}
          label="Blood Pressure"
          value={`${latestVitals.bloodPressureSystolic || '--'}/${latestVitals.bloodPressureDiastolic || '--'}`}
          unit="mmHg"
          status={
            latestVitals.bloodPressureSystolic >= 90 && latestVitals.bloodPressureSystolic <= 140 ? 'normal' :
            latestVitals.bloodPressureSystolic > 140 && latestVitals.bloodPressureSystolic <= 160 ? 'warning' : 'critical'
          }
          trend="down"
        />
        <VitalSignCard
          icon={<Wind className="w-5 h-5" />}
          label="Oxygen Saturation"
          value={latestVitals.oxygenSaturation || '--'}
          unit="%"
          status={
            latestVitals.oxygenSaturation >= 95 ? 'normal' :
            latestVitals.oxygenSaturation >= 90 ? 'warning' : 'critical'
          }
          trend="stable"
        />
        <VitalSignCard
          icon={<Thermometer className="w-5 h-5" />}
          label="Temperature"
          value={latestVitals.temperature || '--'}
          unit="°C"
          status={
            latestVitals.temperature >= 36.5 && latestVitals.temperature <= 37.5 ? 'normal' :
            latestVitals.temperature >= 37.5 && latestVitals.temperature <= 38 ? 'warning' : 'critical'
          }
          trend="up"
        />
      </div>

      {/* Interactive Charts */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Vital Signs Monitoring</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedMetric('heartRate')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedMetric === 'heartRate'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-2" />
                Heart Rate
              </button>
              <button
                onClick={() => setSelectedMetric('bloodPressure')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedMetric === 'bloodPressure'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Activity className="w-4 h-4 inline mr-2" />
                BP
              </button>
              <button
                onClick={() => setSelectedMetric('oxygenSaturation')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedMetric === 'oxygenSaturation'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Wind className="w-4 h-4 inline mr-2" />
                SpO2
              </button>
              <button
                onClick={() => setSelectedMetric('temperature')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedMetric === 'temperature'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Thermometer className="w-4 h-4 inline mr-2" />
                Temp
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentMetric.color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={currentMetric.color} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={currentMetric.dataKey}
                  stroke={currentMetric.color}
                  fillOpacity={1}
                  fill="url(#colorMetric)"
                  strokeWidth={2}
                />
                {currentMetric.secondaryKey && (
                  <Area
                    type="monotone"
                    dataKey={currentMetric.secondaryKey}
                    stroke="#9333ea"
                    fillOpacity={0.3}
                    fill="#c084fc"
                    strokeWidth={2}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Current</div>
              <div className="text-2xl font-bold text-gray-900">
                {chartData[chartData.length - 1]?.[currentMetric.dataKey] || '--'} 
                <span className="text-sm font-normal text-gray-600 ml-2">{currentMetric.unit}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Average</div>
              <div className="text-2xl font-bold text-gray-900">
                {chartData.length > 0 
                  ? Math.round(chartData.reduce((sum, d) => sum + (d[currentMetric.dataKey] || 0), 0) / chartData.length)
                  : '--'
                }
                <span className="text-sm font-normal text-gray-600 ml-2">{currentMetric.unit}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Normal Range</div>
              <div className="text-2xl font-bold text-gray-900">
                {currentMetric.normalRange[0]} - {currentMetric.normalRange[1]}
                <span className="text-sm font-normal text-gray-600 ml-2">{currentMetric.unit}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Medical Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Blood Type:</span>
              <span className="font-medium">{patient.bloodType || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Allergies:</span>
              <span className="font-medium">{patient.allergies?.join(', ') || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Admission Date:</span>
              <span className="font-medium">
                {patient.admissionDate ? format(new Date(patient.admissionDate), 'PPp') : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Room:</span>
              <span className="font-medium">{patient.bed?.room?.roomNumber || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bed:</span>
              <span className="font-medium">{patient.bed?.bedNumber || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Care Team</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Attending Doctor:</span>
              <span className="font-medium">
                {patient.assignedDoctor?.user?.firstName} {patient.assignedDoctor?.user?.lastName || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Specialization:</span>
              <span className="font-medium">{patient.assignedDoctor?.specialization || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Assigned Nurses:</span>
              <span className="font-medium">{patient.assignedNurses?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
