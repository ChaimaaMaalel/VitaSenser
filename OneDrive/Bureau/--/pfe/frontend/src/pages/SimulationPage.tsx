import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Play, Square, SlidersHorizontal, Thermometer, Droplets, HeartPulse } from 'lucide-react';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';

type SimulationProfile =
  | 'STABLE'
  | 'MODERATE'
  | 'CRITICAL'
  | 'TACHYCARDIA'
  | 'BRADYCARDIA'
  | 'ARRHYTHMIA'
  | 'HYPOXEMIA'
  | 'HYPERGLYCEMIA'
  | 'SEPSIS_LIKE'
  | 'AI_TEST_ANOMALY'
  | 'AI_TEST_PREDICTION'
  | 'AI_TEST_CARDIAC'
  | 'AI_TEST_RESPIRATORY'
  | 'AI_TEST_FULLSTACK'
  | 'CUSTOM';

type BedSimulation = {
  _id: string;
  bedNumber: string;
  status: string;
  room?: {
    roomNumber?: string;
    type?: string;
  };
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
  };
  simulator?: {
    enabled?: boolean;
    profile?: SimulationProfile;
    intervalMs?: number;
    signalConnectionStatus?: 'ONLINE' | 'OFFLINE' | 'ERROR';
    lastSignalAt?: string;
    latestSignal?: {
      heartRate?: number;
      temperature?: number;
      spO2?: number;
      glucose?: number;
      timestamp?: string;
      source?: string;
    };
  };
  runtime?: {
    running?: boolean;
  };
};

const simulationProfiles: SimulationProfile[] = [
  'STABLE',
  'MODERATE',
  'CRITICAL',
  'TACHYCARDIA',
  'BRADYCARDIA',
  'ARRHYTHMIA',
  'HYPOXEMIA',
  'HYPERGLYCEMIA',
  'SEPSIS_LIKE',
  'AI_TEST_ANOMALY',
  'AI_TEST_PREDICTION',
  'AI_TEST_CARDIAC',
  'AI_TEST_RESPIRATORY',
  'AI_TEST_FULLSTACK',
  'CUSTOM',
];

const aiOneClickScenario: ScenarioStep[] = [
  { profile: 'STABLE', durationSec: 20 },
  { profile: 'AI_TEST_PREDICTION', durationSec: 30 },
  { profile: 'AI_TEST_ANOMALY', durationSec: 25 },
  { profile: 'AI_TEST_CARDIAC', durationSec: 25 },
  { profile: 'AI_TEST_RESPIRATORY', durationSec: 25 },
  { profile: 'AI_TEST_FULLSTACK', durationSec: 30 },
  { profile: 'STABLE', durationSec: 20 },
];

type TrendPoint = {
  timestamp: string;
  heartRate: number | null;
  temperature: number | null;
  spO2: number | null;
  glucose: number | null;
};

type RealismLevel = 'CLEAN' | 'REALISTIC' | 'NOISY';

type ScenarioStep = {
  profile: SimulationProfile;
  durationSec: number;
};

type SimulationSession = {
  id: string;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY';
  startedAt: string;
  endedAt?: string;
  intervalMs: number;
  realismLevel: RealismLevel;
  points: Array<{
    timestamp: string;
    profile: SimulationProfile;
    heartRate: number;
    temperature: number;
    spO2: number;
    glucose: number;
  }>;
};

type Diagnostics = {
  connected: boolean;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY' | 'IDLE';
  tickCount: number;
  eventCount: number;
  lastTickAt?: string;
  lastEmitAt?: string;
  lastError?: string;
  currentStepIndex?: number;
  currentProfile?: SimulationProfile;
  sessionId?: string;
};

type VitalMetric = 'heartRate' | 'temperature' | 'spO2' | 'glucose';
type SeverityLevel = 'normal' | 'warning' | 'critical';

const MAX_TREND_POINTS = 30;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toTrendPoint = (signal: any, timestamp: string): TrendPoint => ({
  timestamp,
  heartRate: toNumberOrNull(signal?.heartRate),
  temperature: toNumberOrNull(signal?.temperature),
  spO2: toNumberOrNull(signal?.spO2 ?? signal?.oxygenSaturation),
  glucose: toNumberOrNull(signal?.glucose ?? signal?.glucoseLevel ?? signal?.bloodSugar),
});

const buildSocketUrl = (): string => {
  const fromEnv = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;
  if (fromEnv) return fromEnv;

  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  return baseUrl.replace(/\/api\/v\d+$/, '');
};

const appendTrendPoint = (
  current: TrendPoint[],
  point: TrendPoint
): TrendPoint[] => {
  return [...current, point].slice(-MAX_TREND_POINTS);
};

const computeVariation = (series: TrendPoint[], key: keyof Omit<TrendPoint, 'timestamp'>): number | null => {
  const values = series
    .map((point) => point[key])
    .filter((value): value is number => typeof value === 'number');

  if (values.length < 2) return null;
  return Number((Math.max(...values) - Math.min(...values)).toFixed(1));
};

const getMetricSeverity = (metric: VitalMetric, value: number | null): SeverityLevel => {
  if (value === null) return 'normal';

  switch (metric) {
    case 'heartRate':
      if (value < 50 || value > 130) return 'critical';
      if (value < 60 || value > 100) return 'warning';
      return 'normal';
    case 'temperature':
      if (value < 35 || value > 39) return 'critical';
      if (value < 36 || value > 38) return 'warning';
      return 'normal';
    case 'spO2':
      if (value < 90) return 'critical';
      if (value < 95) return 'warning';
      return 'normal';
    case 'glucose':
      if (value < 70 || value > 250) return 'critical';
      if (value < 80 || value > 180) return 'warning';
      return 'normal';
    default:
      return 'normal';
  }
};

const severityStyles: Record<
  SeverityLevel,
  {
    card: string;
    border: string;
    label: string;
    value: string;
    line: string;
  }
> = {
  normal: {
    card: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'text-emerald-700',
    value: 'text-emerald-900',
    line: '#059669',
  },
  warning: {
    card: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'text-amber-700',
    value: 'text-amber-900',
    line: '#d97706',
  },
  critical: {
    card: 'bg-rose-50',
    border: 'border-rose-200',
    label: 'text-rose-700',
    value: 'text-rose-900',
    line: '#e11d48',
  },
};

export default function SimulationPage() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [beds, setBeds] = useState<BedSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [bedTrends, setBedTrends] = useState<Record<string, TrendPoint[]>>({});

  const [selectedBedId, setSelectedBedId] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<SimulationProfile>('STABLE');
  const [realismLevel, setRealismLevel] = useState<RealismLevel>('REALISTIC');
  const [intervalMs, setIntervalMs] = useState(1000);

  const [manualHeartRate, setManualHeartRate] = useState(80);
  const [manualTemperature, setManualTemperature] = useState(37);
  const [manualSpO2, setManualSpO2] = useState(98);
  const [manualGlucose, setManualGlucose] = useState(110);
  const [bedSearch, setBedSearch] = useState('');
  const [runningFilter, setRunningFilter] = useState<'ALL' | 'RUNNING' | 'STOPPED'>('ALL');
  const [profileFilter, setProfileFilter] = useState<'ALL' | SimulationProfile>('ALL');
  const [timelineSteps, setTimelineSteps] = useState<ScenarioStep[]>([
    { profile: 'STABLE', durationSec: 20 },
    { profile: 'TACHYCARDIA', durationSec: 15 },
    { profile: 'HYPOXEMIA', durationSec: 15 },
    { profile: 'STABLE', durationSec: 20 },
  ]);
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const oneClickScenarioDurationSec = useMemo(
    () => aiOneClickScenario.reduce((sum, step) => sum + step.durationSec, 0),
    []
  );

  const canControlSimulation =
    user?.role === 'ADMIN' || user?.role === 'NURSE' || user?.role === 'DOCTOR';
  const canPushManualSignal = canControlSimulation || user?.role === 'DOCTOR';
  const socketRef = useRef<Socket | null>(null);
  const bedsRef = useRef<BedSimulation[]>([]);
  const subscribedBedsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bedsRef.current = beds;
  }, [beds]);

  const selectedBed = useMemo(
    () => beds.find((bed) => bed._id === selectedBedId) || null,
    [beds, selectedBedId]
  );

  const filteredBeds = useMemo(() => {
    const normalizedSearch = bedSearch.trim().toLowerCase();

    return beds.filter((bed) => {
      const running = Boolean(bed.runtime?.running);
      const bedProfile = bed.simulator?.profile || 'STABLE';
      const patientName = bed.patient
        ? `${bed.patient.firstName || ''} ${bed.patient.lastName || ''}`.trim()
        : '';

      const matchesSearch =
        !normalizedSearch ||
        String(bed.bedNumber || '').toLowerCase().includes(normalizedSearch) ||
        String(bed.room?.roomNumber || '').toLowerCase().includes(normalizedSearch) ||
        String(bed.room?.type || '').toLowerCase().includes(normalizedSearch) ||
        patientName.toLowerCase().includes(normalizedSearch);

      const matchesRunning =
        runningFilter === 'ALL' ||
        (runningFilter === 'RUNNING' && running) ||
        (runningFilter === 'STOPPED' && !running);

      const matchesProfile = profileFilter === 'ALL' || bedProfile === profileFilter;

      return matchesSearch && matchesRunning && matchesProfile;
    });
  }, [beds, bedSearch, runningFilter, profileFilter]);

  const selectedBedTrend = useMemo(
    () => (selectedBed ? bedTrends[selectedBed._id] || [] : []),
    [bedTrends, selectedBed]
  );

  const selectedVariation = useMemo(
    () => ({
      heartRate: computeVariation(selectedBedTrend, 'heartRate'),
      temperature: computeVariation(selectedBedTrend, 'temperature'),
      spO2: computeVariation(selectedBedTrend, 'spO2'),
      glucose: computeVariation(selectedBedTrend, 'glucose'),
    }),
    [selectedBedTrend]
  );

  const selectedVitalSeverity = useMemo(() => {
    const latest = selectedBed?.simulator?.latestSignal;
    return {
      heartRate: getMetricSeverity('heartRate', toNumberOrNull(latest?.heartRate)),
      temperature: getMetricSeverity('temperature', toNumberOrNull(latest?.temperature)),
      spO2: getMetricSeverity('spO2', toNumberOrNull(latest?.spO2)),
      glucose: getMetricSeverity('glucose', toNumberOrNull(latest?.glucose)),
    } as Record<VitalMetric, SeverityLevel>;
  }, [selectedBed]);

  const seedTrendFromBedSnapshot = (nextBeds: BedSimulation[]) => {
    setBedTrends((previous) => {
      const updated = { ...previous };

      nextBeds.forEach((bed) => {
        if (updated[bed._id] && updated[bed._id].length > 0) return;

        const latest = bed.simulator?.latestSignal;
        if (!latest) return;

        const timestamp = latest.timestamp || new Date().toISOString();
        updated[bed._id] = [toTrendPoint(latest, timestamp)];
      });

      return updated;
    });
  };

  const loadInitialTrends = async (bedIds: string[]) => {
    if (bedIds.length === 0) return;

    const results = await Promise.allSettled(
      bedIds.map((bedId) => api.get(`/vital-signs/bed/${bedId}?limit=${MAX_TREND_POINTS}`))
    );

    const nextTrends: Record<string, TrendPoint[]> = {};

    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;

      const bedId = bedIds[index];
      const vitals = result.value.data?.data?.vitals || [];
      const points = [...vitals]
        .reverse()
        .map((vital: any) =>
          toTrendPoint(vital, vital?.timestamp || vital?.createdAt || new Date().toISOString())
        );

      if (points.length > 0) {
        nextTrends[bedId] = points.slice(-MAX_TREND_POINTS);
      }
    });

    if (Object.keys(nextTrends).length > 0) {
      setBedTrends((previous) => ({
        ...previous,
        ...nextTrends,
      }));
    }
  };

  const fetchBeds = async (keepLoading = false) => {
    if (!keepLoading) setLoading(true);
    try {
      const response = await api.get('/simulation/beds');
      const nextBeds: BedSimulation[] = response.data?.data?.beds || [];
      setBeds(nextBeds);
      seedTrendFromBedSnapshot(nextBeds);

      if (!selectedBedId && nextBeds.length > 0) {
        const firstBed = nextBeds[0];
        setSelectedBedId(firstBed._id);
        setSelectedProfile(firstBed.simulator?.profile || 'STABLE');
        setIntervalMs(firstBed.simulator?.intervalMs || 1000);
      }

      if (!keepLoading) {
        await loadInitialTrends(nextBeds.map((bed) => bed._id));
      }
    } catch (error) {
      toast.error(tr('Failed to load simulation beds', 'Echec du chargement des lits de simulation'));
    } finally {
      if (!keepLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBeds();
  }, []);

  useEffect(() => {
    const socketUrl = buildSocketUrl();
    const socket = io(socketUrl, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);

      // Re-join all current bed rooms on every (re)connect.
      bedsRef.current.forEach((bed) => {
        socket.emit('subscribe-bed', bed._id);
        subscribedBedsRef.current.add(bed._id);
      });
    });
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('bed-signal:update', (payload: any) => {
      const bedId = String(payload?.bedId || '');
      if (!bedId) return;

      const signal = payload?.signal || {};
      const timestamp = payload?.timestamp || new Date().toISOString();

      setBeds((previous) =>
        previous.map((bed) => {
          if (bed._id !== bedId) return bed;
          return {
            ...bed,
            simulator: {
              ...bed.simulator,
              signalConnectionStatus: 'ONLINE',
              lastSignalAt: timestamp,
              latestSignal: {
                ...(bed.simulator?.latestSignal || {}),
                heartRate: signal.heartRate,
                temperature: signal.temperature,
                spO2: signal.spO2,
                glucose: signal.glucose,
                source: payload?.source,
                timestamp,
              },
            },
          };
        })
      );

      const trendPoint = toTrendPoint(signal, timestamp);
      setBedTrends((previous) => ({
        ...previous,
        [bedId]: appendTrendPoint(previous[bedId] || [], trendPoint),
      }));
    });

    socket.on('bed-simulation:status', (payload: any) => {
      const bedId = String(payload?.bedId || '');
      if (!bedId) return;

      setBeds((previous) =>
        previous.map((bed) => {
          if (bed._id !== bedId) return bed;

          return {
            ...bed,
            runtime: {
              ...(bed.runtime || {}),
              running: Boolean(payload?.running),
            },
            simulator: {
              ...bed.simulator,
              profile: payload?.profile || bed.simulator?.profile,
              intervalMs: payload?.intervalMs || bed.simulator?.intervalMs,
              signalConnectionStatus: payload?.running ? 'ONLINE' : 'OFFLINE',
              enabled: Boolean(payload?.running),
            },
          };
        })
      );
    });

    return () => {
      const subscribedBeds = subscribedBedsRef.current;
      subscribedBeds.forEach((bedId) => {
        socket.emit('unsubscribe-bed', bedId);
      });
      subscribedBeds.clear();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const nextBedIds = new Set<string>(beds.map((bed) => bed._id));

    nextBedIds.forEach((bedId) => {
      if (!subscribedBedsRef.current.has(bedId)) {
        socket.emit('subscribe-bed', bedId);
        subscribedBedsRef.current.add(bedId);
      }
    });

    [...subscribedBedsRef.current].forEach((bedId) => {
      if (!nextBedIds.has(bedId)) {
        socket.emit('unsubscribe-bed', bedId);
        subscribedBedsRef.current.delete(bedId);
      }
    });
  }, [beds]);

  useEffect(() => {
    const runningBeds = beds.filter((bed) => Boolean(bed.runtime?.running));
    if (runningBeds.length === 0) return;

    // Fallback refresh keeps values moving if socket transport/subscription is unstable.
    const timer = window.setInterval(() => {
      void fetchBeds(true);
    }, socketConnected ? 3000 : 1500);

    return () => window.clearInterval(timer);
  }, [beds, socketConnected]);

  useEffect(() => {
    if (!selectedBed) return;

    setSelectedProfile(selectedBed.simulator?.profile || 'STABLE');
    setIntervalMs(selectedBed.simulator?.intervalMs || 1000);

    const latest = selectedBed.simulator?.latestSignal;
    if (latest?.heartRate) setManualHeartRate(Math.round(latest.heartRate));
    if (typeof latest?.temperature === 'number') setManualTemperature(Number(latest.temperature));
    if (typeof latest?.spO2 === 'number') setManualSpO2(Math.round(latest.spO2));
    if (typeof latest?.glucose === 'number') setManualGlucose(Math.round(latest.glucose));
  }, [selectedBed]);

  const refreshAfterAction = async () => {
    await fetchBeds(true);
    if (selectedBed) {
      await Promise.all([fetchSessions(selectedBed._id), fetchDiagnostics(selectedBed._id)]);
    }
  };

  const fetchSessions = async (bedId: string) => {
    try {
      const response = await api.get(`/simulation/beds/${bedId}/sessions`);
      setSessions(response.data?.data?.sessions || []);
    } catch {
      // Non-blocking panel.
    }
  };

  const fetchDiagnostics = async (bedId: string) => {
    try {
      const response = await api.get(`/simulation/beds/${bedId}/diagnostics`);
      setDiagnostics(response.data?.data?.diagnostics || null);
    } catch {
      // Non-blocking panel.
    }
  };

  const handleStart = async () => {
    if (!selectedBed) return;
    if (!canControlSimulation) {
      toast.error(tr('You do not have permission to start simulation', 'Vous n avez pas la permission de demarrer la simulation'));
      return;
    }

    try {
      setActionLoading(true);
      await api.post(`/simulation/beds/${selectedBed._id}/start`, {
        profile: selectedProfile,
        intervalMs,
        realismLevel,
      });
      toast.success(tr(`Simulation started for Bed ${selectedBed.bedNumber}`, `Simulation demarree pour le lit ${selectedBed.bedNumber}`));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to start simulation', 'Echec du demarrage de simulation'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!selectedBed) return;
    if (!canControlSimulation) {
      toast.error(tr('You do not have permission to stop simulation', 'Vous n avez pas la permission d arreter la simulation'));
      return;
    }

    try {
      setActionLoading(true);
      await api.post(`/simulation/beds/${selectedBed._id}/stop`);
      toast.success(tr(`Simulation stopped for Bed ${selectedBed.bedNumber}`, `Simulation arretee pour le lit ${selectedBed.bedNumber}`));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to stop simulation', 'Echec de arret de simulation'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleProfileSelection = async (nextProfile: SimulationProfile) => {
    setSelectedProfile(nextProfile);

    if (!selectedBed || !selectedBed.runtime?.running || !canControlSimulation) {
      return;
    }

    try {
      setActionLoading(true);
      await api.patch(`/simulation/beds/${selectedBed._id}/profile`, {
        profile: nextProfile,
        intervalMs,
        realismLevel,
      });
      toast.success(tr('Profile applied live', 'Profil applique en direct'));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to apply profile live', 'Echec de application du profil en direct'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublishManualSignal = async () => {
    if (!selectedBed) return;
    if (!canPushManualSignal) {
      toast.error(tr('You do not have permission to publish manual signals', 'Vous n avez pas la permission de publier des signaux manuels'));
      return;
    }

    try {
      setActionLoading(true);
      await api.post(`/simulation/beds/${selectedBed._id}/manual-signal`, {
        heartRate: manualHeartRate,
        temperature: Number(manualTemperature.toFixed(1)),
        spO2: manualSpO2,
        glucose: manualGlucose,
      });
      toast.success(tr('Manual signal published', 'Signal manuel publie'));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to publish manual signal', 'Echec de publication du signal manuel'));
    } finally {
      setActionLoading(false);
    }
  };

  const updateTimelineStep = (
    index: number,
    patch: Partial<ScenarioStep>
) => {
    setTimelineSteps((previous) =>
      previous.map((step, stepIndex) =>
        stepIndex === index
          ? {
              ...step,
              ...patch,
            }
          : step
      )
    );
  };

  const handleStartTimeline = async () => {
    if (!selectedBed) return;
    try {
      setActionLoading(true);
      await api.post(`/simulation/beds/${selectedBed._id}/timeline/start`, {
        steps: timelineSteps,
        intervalMs,
        realismLevel,
      });
      toast.success(tr('Timeline simulation started', 'Simulation timeline demarree'));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to start timeline', 'Echec du demarrage timeline'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunOneClickAiScenario = async () => {
    if (!selectedBed) return;
    if (!canControlSimulation) {
      toast.error(tr('You do not have permission to run AI scenarios', 'Vous n avez pas la permission dexecuter des scenarios IA'));
      return;
    }

    try {
      setActionLoading(true);

      // Keep this runner deterministic for repeatable AI tests.
      setTimelineSteps(aiOneClickScenario);
      setIntervalMs(1000);
      setRealismLevel('REALISTIC');

      await api.post(`/simulation/beds/${selectedBed._id}/timeline/start`, {
        steps: aiOneClickScenario,
        intervalMs: 1000,
        realismLevel: 'REALISTIC',
      });

      toast.success(
        tr(
          `AI one-click scenario started (${oneClickScenarioDurationSec}s)`,
          `Scenario IA one-click demarre (${oneClickScenarioDurationSec}s)`
        )
      );
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message ||
          tr('Failed to run AI one-click scenario', 'Echec du lancement du scenario IA one-click')
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartReplay = async (sessionId: string) => {
    if (!selectedBed) return;
    try {
      setActionLoading(true);
      await api.post(`/simulation/beds/${selectedBed._id}/replay/start`, {
        sessionId,
        speedMultiplier: replaySpeed,
      });
      toast.success(tr('Replay started', 'Replay demarre'));
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || tr('Failed to start replay', 'Echec du demarrage replay'));
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBed) {
      setSessions([]);
      setDiagnostics(null);
      return;
    }

    void Promise.all([
      fetchSessions(selectedBed._id),
      fetchDiagnostics(selectedBed._id),
    ]);
  }, [selectedBedId]);

  useEffect(() => {
    if (!selectedBed) return;

    const timer = window.setInterval(() => {
      void fetchDiagnostics(selectedBed._id);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [selectedBedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tr('Simulation Management', 'Gestion de simulation')}</h1>
            <p className="text-gray-600 mt-1">{tr('Control real-time bed vital simulation profiles and manual overrides', 'Controler les profils de simulation vitale des lits en temps reel et les ajustements manuels')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`badge ${socketConnected ? 'badge-success' : 'badge-warning'}`}>
            {socketConnected ? tr('Live Socket Connected', 'Socket en direct connecte') : tr('Socket Disconnected', 'Socket deconnecte')}
          </span>

          <button className="btn btn-secondary" onClick={() => fetchBeds()}>
            {tr('Refresh', 'Actualiser')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900">{tr('Beds', 'Lits')}</h2>
            <span className="text-xs text-gray-500">
              {filteredBeds.length}/{beds.length}
            </span>
          </div>

          <div className="space-y-3 mb-4">
            <input
              className="input"
              placeholder="Search bed, room, type, patient..."
              value={bedSearch}
              onChange={(e) => setBedSearch(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                className="input"
                value={runningFilter}
                onChange={(e) => setRunningFilter(e.target.value as 'ALL' | 'RUNNING' | 'STOPPED')}
              >
                <option value="ALL">All status</option>
                <option value="RUNNING">Running</option>
                <option value="STOPPED">Stopped</option>
              </select>

              <select
                className="input"
                value={profileFilter}
                onChange={(e) => setProfileFilter(e.target.value as 'ALL' | SimulationProfile)}
              >
                <option value="ALL">All profiles</option>
                {simulationProfiles.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto">
            {filteredBeds.map((bed) => {
              const running = Boolean(bed.runtime?.running);
              const connection = bed.simulator?.signalConnectionStatus || 'OFFLINE';
              const active = selectedBedId === bed._id;
              const bedHeartSeverity = getMetricSeverity(
                'heartRate',
                toNumberOrNull(bed.simulator?.latestSignal?.heartRate)
              );

              return (
                <button
                  key={bed._id}
                  onClick={() => setSelectedBedId(bed._id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    active ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">Bed {bed.bedNumber}</p>
                    <span className={`badge ${running ? 'badge-success' : 'badge-warning'}`}>
                      {running ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Room {bed.room?.roomNumber || '-'} • {bed.room?.type || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Patient: {bed.patient ? `${bed.patient.firstName || ''} ${bed.patient.lastName || ''}`.trim() : 'Unassigned'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">Connection: {connection}</p>

                  <div className="h-16 mt-3 bg-white rounded-md border border-gray-200 px-1 py-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={(bedTrends[bed._id] || []).map((point, index) => ({
                          index,
                          heartRate: point.heartRate,
                        }))}
                      >
                        <Line
                          type="monotone"
                          dataKey="heartRate"
                          stroke={severityStyles[bedHeartSeverity].line}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </button>
              );
            })}

            {filteredBeds.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg">
                No beds match current search/filter.
              </div>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2 space-y-6">
          {!selectedBed ? (
            <p className="text-gray-500">Select a bed to manage simulation</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Bed {selectedBed.bedNumber}</h2>
                  <p className="text-gray-600">
                    Room {selectedBed.room?.roomNumber || '-'} • Status {selectedBed.status}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-success"
                    onClick={handleStart}
                    disabled={actionLoading || !canControlSimulation}
                  >
                    <Play className="w-4 h-4" /> Start
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleStop}
                    disabled={actionLoading || !canControlSimulation}
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Profile</label>
                  <select
                    className="input mt-1"
                    value={selectedProfile}
                    onChange={(e) => {
                      void handleProfileSelection(e.target.value as SimulationProfile);
                    }}
                  >
                    {simulationProfiles.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    If simulation is running, profile changes are applied instantly.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Interval (ms)</label>
                  <input
                    className="input mt-1"
                    type="number"
                    min={500}
                    max={60000}
                    step={100}
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value || 1000))}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" className="btn btn-secondary !py-1 !px-2 text-xs" onClick={() => setIntervalMs(1000)}>
                      1s
                    </button>
                    <button type="button" className="btn btn-secondary !py-1 !px-2 text-xs" onClick={() => setIntervalMs(2000)}>
                      2s
                    </button>
                    <button type="button" className="btn btn-secondary !py-1 !px-2 text-xs" onClick={() => setIntervalMs(3000)}>
                      3s
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Realism</label>
                  <select
                    className="input mt-1"
                    value={realismLevel}
                    onChange={(e) => setRealismLevel(e.target.value as RealismLevel)}
                  >
                    <option value="CLEAN">CLEAN</option>
                    <option value="REALISTIC">REALISTIC</option>
                    <option value="NOISY">NOISY</option>
                  </select>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Scenario Timeline</h3>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={handleRunOneClickAiScenario}
                      disabled={actionLoading || !canControlSimulation}
                    >
                      Run AI One-Click Scenario
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleStartTimeline}
                      disabled={actionLoading || !canControlSimulation}
                    >
                      Start Timeline
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  One-click scenario covers anomaly, cardiac, respiratory, and full-stack AI stress patterns in about {oneClickScenarioDurationSec} seconds.
                </p>

                <div className="space-y-2">
                  {timelineSteps.map((step, index) => (
                    <div key={`step-${index}`} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-1 text-xs text-gray-500">#{index + 1}</span>
                      <select
                        className="input col-span-7"
                        value={step.profile}
                        onChange={(e) => updateTimelineStep(index, { profile: e.target.value as SimulationProfile })}
                      >
                        {simulationProfiles.map((profile) => (
                          <option key={profile} value={profile}>
                            {profile}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input col-span-3"
                        type="number"
                        min={1}
                        value={step.durationSec}
                        onChange={(e) => updateTimelineStep(index, { durationSec: Math.max(1, Number(e.target.value || 1)) })}
                      />
                      <span className="col-span-1 text-xs text-gray-500">s</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setTimelineSteps((prev) => [...prev, { profile: selectedProfile, durationSec: 15 }])}
                  >
                    Add Step
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setTimelineSteps((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
                  >
                    Remove Last
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Session Recording & Replay</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Speed x</span>
                    <input
                      className="input !w-24"
                      type="number"
                      min={0.25}
                      max={8}
                      step={0.25}
                      value={replaySpeed}
                      onChange={(e) => setReplaySpeed(Math.max(0.25, Math.min(8, Number(e.target.value || 1))))}
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {sessions.length === 0 && (
                    <p className="text-sm text-gray-500">No sessions recorded yet.</p>
                  )}
                  {sessions.map((session) => (
                    <div key={session.id} className="p-3 border border-gray-200 rounded-lg flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {session.mode} • {session.points.length} points • {session.realismLevel}
                        </p>
                        <p className="text-xs text-gray-500">
                          Started {new Date(session.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleStartReplay(session.id)}
                        disabled={actionLoading || session.points.length === 0 || !canControlSimulation}
                      >
                        Replay
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Live Connection Diagnostics</h3>
                {diagnostics ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Mode</p>
                      <p className="font-semibold text-gray-900">{diagnostics.mode}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Connected</p>
                      <p className="font-semibold text-gray-900">{diagnostics.connected ? 'YES' : 'NO'}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Ticks</p>
                      <p className="font-semibold text-gray-900">{diagnostics.tickCount}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Events</p>
                      <p className="font-semibold text-gray-900">{diagnostics.eventCount}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Current Profile</p>
                      <p className="font-semibold text-gray-900">{diagnostics.currentProfile || '-'}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Timeline Step</p>
                      <p className="font-semibold text-gray-900">{typeof diagnostics.currentStepIndex === 'number' ? diagnostics.currentStepIndex + 1 : '-'}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Last Tick</p>
                      <p className="font-semibold text-gray-900">{diagnostics.lastTickAt ? new Date(diagnostics.lastTickAt).toLocaleTimeString() : '-'}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-gray-600">Last Error</p>
                      <p className="font-semibold text-gray-900 truncate">{diagnostics.lastError || '-'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Diagnostics not available.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-4 rounded-lg border ${severityStyles[selectedVitalSeverity.heartRate].border} ${severityStyles[selectedVitalSeverity.heartRate].card}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <HeartPulse className="w-4 h-4 text-rose-600" />
                    <p className={`text-sm font-semibold ${severityStyles[selectedVitalSeverity.heartRate].label}`}>Heart Rate</p>
                  </div>
                  <p className={`text-2xl font-bold ${severityStyles[selectedVitalSeverity.heartRate].value}`}>{selectedBed.simulator?.latestSignal?.heartRate ?? '-'} bpm</p>
                </div>

                <div className={`p-4 rounded-lg border ${severityStyles[selectedVitalSeverity.temperature].border} ${severityStyles[selectedVitalSeverity.temperature].card}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="w-4 h-4 text-amber-600" />
                    <p className={`text-sm font-semibold ${severityStyles[selectedVitalSeverity.temperature].label}`}>Temperature</p>
                  </div>
                  <p className={`text-2xl font-bold ${severityStyles[selectedVitalSeverity.temperature].value}`}>{selectedBed.simulator?.latestSignal?.temperature ?? '-'} C</p>
                </div>

                <div className={`p-4 rounded-lg border ${severityStyles[selectedVitalSeverity.spO2].border} ${severityStyles[selectedVitalSeverity.spO2].card}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-4 h-4 text-blue-600" />
                    <p className={`text-sm font-semibold ${severityStyles[selectedVitalSeverity.spO2].label}`}>SpO2</p>
                  </div>
                  <p className={`text-2xl font-bold ${severityStyles[selectedVitalSeverity.spO2].value}`}>{selectedBed.simulator?.latestSignal?.spO2 ?? '-'} %</p>
                </div>

                <div className={`p-4 rounded-lg border ${severityStyles[selectedVitalSeverity.glucose].border} ${severityStyles[selectedVitalSeverity.glucose].card}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <p className={`text-sm font-semibold ${severityStyles[selectedVitalSeverity.glucose].label}`}>Glucose</p>
                  </div>
                  <p className={`text-2xl font-bold ${severityStyles[selectedVitalSeverity.glucose].value}`}>{selectedBed.simulator?.latestSignal?.glucose ?? '-'} mg/dL</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">Live Vital Variation (Last {selectedBedTrend.length} points)</h3>
                  <p className="text-xs text-gray-500">Updates instantly from socket events</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                  <div className={`p-3 rounded-lg border ${severityStyles[selectedVitalSeverity.heartRate].border} ${severityStyles[selectedVitalSeverity.heartRate].card}`}>
                    <p className={`text-xs font-semibold ${severityStyles[selectedVitalSeverity.heartRate].label}`}>Heart Rate Variation</p>
                    <p className={`text-lg font-bold ${severityStyles[selectedVitalSeverity.heartRate].value}`}>{selectedVariation.heartRate ?? '-'} bpm</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${severityStyles[selectedVitalSeverity.temperature].border} ${severityStyles[selectedVitalSeverity.temperature].card}`}>
                    <p className={`text-xs font-semibold ${severityStyles[selectedVitalSeverity.temperature].label}`}>Temperature Variation</p>
                    <p className={`text-lg font-bold ${severityStyles[selectedVitalSeverity.temperature].value}`}>{selectedVariation.temperature ?? '-'} C</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${severityStyles[selectedVitalSeverity.spO2].border} ${severityStyles[selectedVitalSeverity.spO2].card}`}>
                    <p className={`text-xs font-semibold ${severityStyles[selectedVitalSeverity.spO2].label}`}>SpO2 Variation</p>
                    <p className={`text-lg font-bold ${severityStyles[selectedVitalSeverity.spO2].value}`}>{selectedVariation.spO2 ?? '-'} %</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${severityStyles[selectedVitalSeverity.glucose].border} ${severityStyles[selectedVitalSeverity.glucose].card}`}>
                    <p className={`text-xs font-semibold ${severityStyles[selectedVitalSeverity.glucose].label}`}>Glucose Variation</p>
                    <p className={`text-lg font-bold ${severityStyles[selectedVitalSeverity.glucose].value}`}>{selectedVariation.glucose ?? '-'} mg/dL</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Heart Rate</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={selectedBedTrend.map((point, index) => ({ index, value: point.heartRate }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="index" hide />
                          <YAxis domain={[40, 200]} />
                          <Tooltip />
                          <Line dataKey="value" stroke={severityStyles[selectedVitalSeverity.heartRate].line} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Temperature</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={selectedBedTrend.map((point, index) => ({ index, value: point.temperature }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="index" hide />
                          <YAxis domain={[34, 42]} />
                          <Tooltip />
                          <Line dataKey="value" stroke={severityStyles[selectedVitalSeverity.temperature].line} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">SpO2</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={selectedBedTrend.map((point, index) => ({ index, value: point.spO2 }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="index" hide />
                          <YAxis domain={[65, 100]} />
                          <Tooltip />
                          <Line dataKey="value" stroke={severityStyles[selectedVitalSeverity.spO2].line} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Glucose</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={selectedBedTrend.map((point, index) => ({ index, value: point.glucose }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="index" hide />
                          <YAxis domain={[40, 450]} />
                          <Tooltip />
                          <Line dataKey="value" stroke={severityStyles[selectedVitalSeverity.glucose].line} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Manual Signal Override</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="p-4 rounded-lg border border-gray-200 bg-white">
                    <p className="text-sm font-medium text-gray-700">Heart Rate: {manualHeartRate} bpm</p>
                    <input
                      className="w-full mt-2"
                      type="range"
                      min={40}
                      max={200}
                      step={1}
                      value={manualHeartRate}
                      onChange={(e) => setManualHeartRate(Number(e.target.value))}
                    />
                  </label>

                  <label className="p-4 rounded-lg border border-gray-200 bg-white">
                    <p className="text-sm font-medium text-gray-700">Temperature: {manualTemperature.toFixed(1)} C</p>
                    <input
                      className="w-full mt-2"
                      type="range"
                      min={34}
                      max={42}
                      step={0.1}
                      value={manualTemperature}
                      onChange={(e) => setManualTemperature(Number(e.target.value))}
                    />
                  </label>

                  <label className="p-4 rounded-lg border border-gray-200 bg-white">
                    <p className="text-sm font-medium text-gray-700">SpO2: {manualSpO2} %</p>
                    <input
                      className="w-full mt-2"
                      type="range"
                      min={65}
                      max={100}
                      step={1}
                      value={manualSpO2}
                      onChange={(e) => setManualSpO2(Number(e.target.value))}
                    />
                  </label>

                  <label className="p-4 rounded-lg border border-gray-200 bg-white">
                    <p className="text-sm font-medium text-gray-700">Glucose: {manualGlucose} mg/dL</p>
                    <input
                      className="w-full mt-2"
                      type="range"
                      min={40}
                      max={450}
                      step={1}
                      value={manualGlucose}
                      onChange={(e) => setManualGlucose(Number(e.target.value))}
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    className="btn btn-primary"
                    onClick={handlePublishManualSignal}
                    disabled={actionLoading || !canPushManualSignal}
                  >
                    Publish Manual Signal
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
