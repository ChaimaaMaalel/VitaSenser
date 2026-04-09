import { RouteProp, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
  Easing,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { io } from 'socket.io-client';
import { LineChart } from 'react-native-chart-kit';
import { ScreenContainer } from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { api, API_BASE_URL } from '../services/api';
import { colors } from '../theme/colors';
import { StatCard } from '../components/StatCard';
import { FlatList } from 'react-native';
import { useLanguageStore } from '../store/languageStore';

type PatientDetailRoute = RouteProp<RootStackParamList, 'PatientDetail'>;
type VitalMetricKey = 'heartRate' | 'temperature' | 'spO2' | 'glucose';
type ChartRange = '1h' | '6h' | '24h' | '7d';

type VitalRecord = {
  timestamp: string;
  heartRate?: number;
  temperature?: number;
  spO2?: number;
  glucose?: number;
};

type EventType = 'alert' | 'medication' | 'intervention' | 'procedure' | 'note' | 'ai_insight';
type EventSeverity = 'critical' | 'warning' | 'normal';

type PatientTimelineEvent = {
  _id: string;
  type: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  reason?: string;
  details?: string;
  notes: string[];
  actor?: string;
  eventTime: string;
};

type DossierCategory = 'irm' | 'scanner' | 'radiology' | 'lab' | 'prescription' | 'report' | 'other';

type PatientDossierFile = {
  _id: string;
  category: DossierCategory;
  label?: string;
  notes?: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string;
};

type EventDraft = {
  type: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  reason: string;
  details: string;
  notesText: string;
  actor: string;
  eventTime: string;
};

type AiAnalysis = {
  models?: {
    anomaly?: { is_anomaly?: boolean; anomaly_score?: number };
    status?: { status?: string; confidence?: number };
    cardiac?: { risk_level?: string; risk_percentage?: string };
    respiratory?: { predicted_spo2?: number; horizon_minutes?: number };
  };
  alerts?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    description?: string;
  }>;
  recommendations?: string[];
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeVital = (vital: any): VitalRecord => ({
  timestamp: vital?.timestamp || vital?.createdAt || new Date().toISOString(),
  heartRate: toNumberOrUndefined(vital?.heartRate),
  temperature: toNumberOrUndefined(vital?.temperature),
  spO2: toNumberOrUndefined(vital?.spO2 ?? vital?.oxygenSaturation),
  glucose: toNumberOrUndefined(vital?.glucose ?? vital?.glucoseLevel ?? vital?.bloodSugar),
});

const buildSocketUrl = (): string => {
  return API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
};

const buildUploadUrl = (relativePath?: string) => {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const base = buildSocketUrl();
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${normalized}`;
};

const formatFileSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
};

const computeAge = (dateOfBirth?: string): number | null => {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (!Number.isFinite(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasBirthdayPassed =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return Math.max(0, age);
};

const deriveStatus = (vitals: {
  heartRate?: number;
  temperature?: number;
  spO2?: number;
  glucose?: number;
}, fallback?: string) => {
  const hr = toNumberOrUndefined(vitals.heartRate);
  const temp = toNumberOrUndefined(vitals.temperature);
  const spo2 = toNumberOrUndefined(vitals.spO2);
  const glu = toNumberOrUndefined(vitals.glucose);

  if (hr === undefined && temp === undefined && spo2 === undefined && glu === undefined) {
    const normalized = String(fallback || '').toUpperCase();
    if (normalized === 'CRITICAL') return 'CRITICAL';
    if (normalized === 'MODERATE' || normalized === 'IN_TREATMENT') return 'MODERATE';
    if (normalized === 'RECOVERING') return 'RECOVERING';
    if (normalized === 'DISCHARGED') return 'DISCHARGED';
    return 'STABLE';
  }

  const isCritical =
    (hr !== undefined && (hr >= 130 || hr <= 42)) ||
    (spo2 !== undefined && spo2 < 90) ||
    (temp !== undefined && (temp >= 39.2 || temp < 35.2)) ||
    (glu !== undefined && (glu >= 260 || glu < 55));

  if (isCritical) return 'CRITICAL';

  const isModerate =
    (hr !== undefined && (hr > 110 || hr < 52)) ||
    (spo2 !== undefined && spo2 < 94) ||
    (temp !== undefined && (temp >= 38.2 || temp < 36.0)) ||
    (glu !== undefined && (glu > 190 || glu < 70));

  if (isModerate) return 'MODERATE';
  return 'STABLE';
};

const initialEventDraft: EventDraft = {
  type: 'note',
  severity: 'normal',
  title: '',
  description: '',
  reason: '',
  details: '',
  notesText: '',
  actor: '',
  eventTime: new Date().toISOString().slice(0, 16),
};

const CHART_WIDTH = Math.max(240, Dimensions.get('window').width - 70);

const rangeHoursMap: Record<ChartRange, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 24 * 7,
};

const metricThresholds: Record<
  VitalMetricKey,
  {
    domainMin: number;
    domainMax: number;
    normalMin: number;
    normalMax: number;
    warningMin: number;
    warningMax: number;
    unit: string;
  }
> = {
  heartRate: {
    domainMin: 35,
    domainMax: 160,
    normalMin: 60,
    normalMax: 100,
    warningMin: 52,
    warningMax: 110,
    unit: 'bpm',
  },
  temperature: {
    domainMin: 34,
    domainMax: 41,
    normalMin: 36.5,
    normalMax: 37.5,
    warningMin: 36.0,
    warningMax: 38.2,
    unit: 'C',
  },
  spO2: {
    domainMin: 70,
    domainMax: 100,
    normalMin: 95,
    normalMax: 100,
    warningMin: 94,
    warningMax: 100,
    unit: '%',
  },
  glucose: {
    domainMin: 40,
    domainMax: 320,
    normalMin: 70,
    normalMax: 140,
    warningMin: 70,
    warningMax: 190,
    unit: 'mg/dL',
  },
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const getVitalsInRange = (allVitals: VitalRecord[], hours: number): VitalRecord[] => {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return allVitals.filter((item) => {
    const ts = new Date(item.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
};

const computeMetricStats = (allVitals: VitalRecord[], key: VitalMetricKey) => {
  const values = allVitals
    .map((item) => toNumberOrUndefined(item[key]))
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) {
    return {
      min: null as number | null,
      max: null as number | null,
      avg: null as number | null,
      current: null as number | null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const current = values[values.length - 1];

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    current: Number(current.toFixed(2)),
  };
};

const getThresholdLevel = (metric: VitalMetricKey, value?: number) => {
  if (value === undefined) return 'unknown';
  const th = metricThresholds[metric];
  if (value < th.warningMin || value > th.warningMax) return 'critical';
  if (value < th.normalMin || value > th.normalMax) return 'warning';
  return 'normal';
};

const getThresholdMarkerLeftPercent = (metric: VitalMetricKey, value?: number) => {
  if (value === undefined) return 0;
  const th = metricThresholds[metric];
  const ratio = (value - th.domainMin) / (th.domainMax - th.domainMin);
  return clamp(ratio * 100, 0, 100);
};

const buildVitalChartData = (
  vitals: VitalRecord[],
  key: VitalMetricKey,
  maxPoints = 12
) => {
  const points = [...vitals]
    .reverse()
    .map((item) => ({
      ts: item.timestamp,
      value: toNumberOrUndefined(item[key]),
    }))
    .filter((item) => item.value !== undefined)
    .slice(-maxPoints);

  if (points.length === 0) {
    return {
      labels: ['-'],
      datasets: [{ data: [0] }],
    };
  }

  return {
    labels: points.map((item) => {
      const d = new Date(item.ts);
      if (!Number.isFinite(d.getTime())) return '-';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }),
    datasets: [{ data: points.map((item) => Number(item.value)) }],
  };
};

export function PatientDetailScreen() {
  const route = useRoute<PatientDetailRoute>();
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const formatGender = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '--';
    if (normalized === 'male' || normalized === 'm') return tr('Male', 'Homme');
    if (normalized === 'female' || normalized === 'f') return tr('Female', 'Femme');
    if (normalized === 'other') return tr('Other', 'Autre');
    return value || '--';
  };
  const formatPatientStatus = (value?: string) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'CRITICAL') return tr('CRITICAL', 'CRITIQUE');
    if (normalized === 'MODERATE' || normalized === 'IN_TREATMENT') return tr('MODERATE', 'MODERE');
    if (normalized === 'RECOVERING') return tr('RECOVERING', 'RECUPERATION');
    if (normalized === 'DISCHARGED') return tr('DISCHARGED', 'SORTI');
    if (normalized === 'STABLE') return tr('STABLE', 'STABLE');
    return normalized || '--';
  };
  const formatThresholdLevel = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical') return tr('CRITICAL', 'CRITIQUE');
    if (normalized === 'warning') return tr('WARNING', 'ALERTE');
    if (normalized === 'normal') return tr('NORMAL', 'NORMAL');
    return tr('NO DATA', 'PAS DE DONNEES');
  };
  const formatEventType = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'alert') return tr('Alert', 'Alerte');
    if (normalized === 'medication') return tr('Medication', 'Medication');
    if (normalized === 'intervention') return tr('Intervention', 'Intervention');
    if (normalized === 'procedure') return tr('Procedure', 'Procedure');
    if (normalized === 'note') return tr('Note', 'Note');
    if (normalized === 'ai_insight') return tr('AI Insight', 'Apercu IA');
    return value || '--';
  };
  const formatEventSeverity = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical') return tr('CRITICAL', 'CRITIQUE');
    if (normalized === 'warning') return tr('WARNING', 'ALERTE');
    if (normalized === 'normal') return tr('NORMAL', 'NORMAL');
    return value ? String(value).toUpperCase() : '--';
  };
  const formatDossierCategory = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'irm') return tr('MRI', 'IRM');
    if (normalized === 'scanner') return tr('CT Scan', 'Scanner');
    if (normalized === 'radiology') return tr('Radiology', 'Radiologie');
    if (normalized === 'lab') return tr('Lab', 'Laboratoire');
    if (normalized === 'prescription') return tr('Prescription', 'Prescription');
    if (normalized === 'report') return tr('Report', 'Rapport');
    if (normalized === 'other') return tr('Other', 'Autre');
    return value || '--';
  };
  const formatAiStatus = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '--';
    if (normalized === 'critical') return tr('Critical', 'Critique');
    if (normalized === 'warning') return tr('Warning', 'Alerte');
    if (normalized === 'moderate') return tr('Moderate', 'Modere');
    if (normalized === 'stable') return tr('Stable', 'Stable');
    if (normalized === 'normal') return tr('Normal', 'Normal');
    return value || '--';
  };
  const formatAiSeverity = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '--';
    if (normalized === 'high' || normalized === 'critical') return tr('HIGH', 'ELEVEE');
    if (normalized === 'medium' || normalized === 'warning') return tr('MEDIUM', 'MOYENNE');
    if (normalized === 'low' || normalized === 'normal') return tr('LOW', 'FAIBLE');
    return String(value).toUpperCase();
  };
  const formatCardiacRisk = (value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '--';
    if (normalized === 'high' || normalized === 'critical') return tr('High', 'Eleve');
    if (normalized === 'moderate' || normalized === 'medium') return tr('Moderate', 'Modere');
    if (normalized === 'low') return tr('Low', 'Faible');
    return value || '--';
  };
  const patientId = route.params.patientId;
  const [patient, setPatient] = useState<any>(null);
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<PatientTimelineEvent[]>([]);
  const [dossierFiles, setDossierFiles] = useState<PatientDossierFile[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<ChartRange>('24h');
  const [selectedMetric, setSelectedMetric] = useState<VitalMetricKey>('temperature');
  const [livePulseTick, setLivePulseTick] = useState(0);
  const [recentlyUpdatedMetrics, setRecentlyUpdatedMetrics] = useState<Record<VitalMetricKey, boolean>>({
    heartRate: false,
    temperature: false,
    spO2: false,
    glucose: false,
  });

  const [eventFilter, setEventFilter] = useState<'all' | EventType>('all');
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>(initialEventDraft);
  const [eventCrudLoading, setEventCrudLoading] = useState(false);

  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierActionLoading, setDossierActionLoading] = useState(false);
  const [dossierCategory, setDossierCategory] = useState<DossierCategory>('irm');
  const [dossierLabel, setDossierLabel] = useState('');
  const [dossierNotes, setDossierNotes] = useState('');
  const [pickedDossierFile, setPickedDossierFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const clearMetricUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const latestVitals = vitals[0] || {};
  const heartRate = toNumberOrUndefined(latestVitals.heartRate);
  const temperature = toNumberOrUndefined(latestVitals.temperature);
  const spO2 = toNumberOrUndefined(latestVitals.spO2);
  const glucose = toNumberOrUndefined(latestVitals.glucose);

  const computedStatus = deriveStatus(
    {
      heartRate,
      temperature,
      spO2,
      glucose,
    },
    patient?.status
  );

  const statusBadgeStyle =
    computedStatus === 'CRITICAL'
      ? styles.statusDanger
      : computedStatus === 'MODERATE'
        ? styles.statusWarning
        : computedStatus === 'RECOVERING'
          ? styles.statusInfo
          : computedStatus === 'DISCHARGED'
            ? styles.statusMuted
            : styles.statusSuccess;

  const filteredTimelineEvents = useMemo(() => {
    if (eventFilter === 'all') return timelineEvents;
    return timelineEvents.filter((event) => event.type === eventFilter);
  }, [eventFilter, timelineEvents]);

  const rangedVitals = useMemo(
    () => getVitalsInRange(vitals, rangeHoursMap[selectedRange]),
    [vitals, selectedRange]
  );

  const heartRateChartData = useMemo(
    () => buildVitalChartData(rangedVitals, 'heartRate'),
    [rangedVitals]
  );
  const temperatureChartData = useMemo(
    () => buildVitalChartData(rangedVitals, 'temperature'),
    [rangedVitals]
  );
  const spO2ChartData = useMemo(
    () => buildVitalChartData(rangedVitals, 'spO2'),
    [rangedVitals]
  );
  const glucoseChartData = useMemo(
    () => buildVitalChartData(rangedVitals, 'glucose'),
    [rangedVitals]
  );

  const heartRateStats = useMemo(() => computeMetricStats(rangedVitals, 'heartRate'), [rangedVitals]);
  const temperatureStats = useMemo(() => computeMetricStats(rangedVitals, 'temperature'), [rangedVitals]);
  const spO2Stats = useMemo(() => computeMetricStats(rangedVitals, 'spO2'), [rangedVitals]);
  const glucoseStats = useMemo(() => computeMetricStats(rangedVitals, 'glucose'), [rangedVitals]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  const chartConfig = {
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(2, 132, 199, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    propsForBackgroundLines: {
      stroke: '#e5e7eb',
    },
    propsForDots: {
      r: '2.5',
      strokeWidth: '1',
      stroke: '#0369a1',
    },
  };

  const fetchPatient = async () => {
    const response = await api.get(`/patients/${patientId}`);
    setPatient(response.data?.data?.patient || null);
  };

  const fetchVitals = async () => {
    const response = await api.get(`/patients/${patientId}/vitals`);
    setVitals((response.data?.data?.vitals || []).map((item: any) => normalizeVital(item)));
  };

  const fetchAiAnalysis = async (silent = false) => {
    if (!silent) setAiError(null);
    try {
      const response = await api.get(`/ai/patients/${patientId}/analysis?limit=700`);
      setAiAnalysis(response.data?.data?.analysis || null);
    } catch {
      setAiError('Primary AI service unavailable.');
    }
  };

  const fetchEvents = async () => {
    const response = await api.get(`/patients/${patientId}/events?limit=200`);
    setTimelineEvents(response.data?.data?.events || []);
  };

  const fetchDossier = async () => {
    try {
      setDossierLoading(true);
      const response = await api.get(`/patients/${patientId}/dossier`);
      setDossierFiles(response.data?.data?.files || []);
    } finally {
      setDossierLoading(false);
    }
  };

  const fetchAll = async (isPull = false) => {
    if (isPull) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      await Promise.all([fetchPatient(), fetchVitals(), fetchAiAnalysis(), fetchEvents(), fetchDossier()]);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load patient detail');
    } finally {
      if (isPull) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const resetEventModal = () => {
    setShowEventModal(false);
    setEditingEventId(null);
    setEventDraft(initialEventDraft);
  };

  const openAddEvent = () => {
    setEditingEventId(null);
    setEventDraft(initialEventDraft);
    setShowEventModal(true);
  };

  const openEditEvent = (event: PatientTimelineEvent) => {
    setEditingEventId(event._id);
    setEventDraft({
      type: event.type,
      severity: event.severity,
      title: event.title || '',
      description: event.description || '',
      reason: event.reason || '',
      details: event.details || '',
      notesText: Array.isArray(event.notes) ? event.notes.join(', ') : '',
      actor: event.actor || '',
      eventTime: event.eventTime ? new Date(event.eventTime).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    });
    setShowEventModal(true);
  };

  const submitEvent = async () => {
    if (!eventDraft.title.trim() || !eventDraft.description.trim()) {
      Alert.alert(tr('Validation', 'Validation'), tr('Title and description are required.', 'Titre et description sont requis.'));
      return;
    }

    const payload = {
      type: eventDraft.type,
      severity: eventDraft.severity,
      title: eventDraft.title.trim(),
      description: eventDraft.description.trim(),
      reason: eventDraft.reason.trim() || undefined,
      details: eventDraft.details.trim() || undefined,
      notes: eventDraft.notesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      actor: eventDraft.actor.trim() || undefined,
      eventTime: eventDraft.eventTime
        ? new Date(eventDraft.eventTime).toISOString()
        : undefined,
    };

    try {
      setEventCrudLoading(true);
      if (editingEventId) {
        await api.put(`/patients/${patientId}/events/${editingEventId}`, payload);
      } else {
        await api.post(`/patients/${patientId}/events`, payload);
      }
      resetEventModal();
      await fetchEvents();
    } catch (err: any) {
      Alert.alert(tr('Error', 'Erreur'), err?.response?.data?.error?.message || tr('Failed to save event', 'Echec de sauvegarde evenement'));
    } finally {
      setEventCrudLoading(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    Alert.alert(tr('Delete event', 'Supprimer evenement'), tr('Are you sure you want to delete this event?', 'Voulez-vous vraiment supprimer cet evenement ?'), [
      { text: tr('Cancel', 'Annuler'), style: 'cancel' },
      {
        text: tr('Delete', 'Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            setEventCrudLoading(true);
            await api.delete(`/patients/${patientId}/events/${eventId}`);
            await fetchEvents();
          } finally {
            setEventCrudLoading(false);
          }
        },
      },
    ]);
  };

  const pickDossierFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    });

    if (result.canceled) return;
    setPickedDossierFile(result.assets[0]);
  };

  const uploadDossierFile = async () => {
    if (!pickedDossierFile) {
      Alert.alert(tr('Validation', 'Validation'), tr('Please pick a file first.', 'Veuillez choisir un fichier d abord.'));
      return;
    }

    try {
      setDossierActionLoading(true);
      const formData = new FormData();
      formData.append('category', dossierCategory);
      formData.append('label', dossierLabel.trim());
      formData.append('notes', dossierNotes.trim());
      formData.append('file', {
        uri: pickedDossierFile.uri,
        type: pickedDossierFile.mimeType || 'application/octet-stream',
        name: pickedDossierFile.name || 'dossier-file',
      } as any);

      await api.post(`/patients/${patientId}/dossier/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setShowDossierModal(false);
      setDossierCategory('irm');
      setDossierLabel('');
      setDossierNotes('');
      setPickedDossierFile(null);
      await fetchDossier();
    } catch (err: any) {
      Alert.alert(tr('Error', 'Erreur'), err?.response?.data?.error?.message || tr('Failed to upload dossier file', 'Echec du telechargement du dossier'));
    } finally {
      setDossierActionLoading(false);
    }
  };

  const deleteDossierFile = async (fileId: string) => {
    Alert.alert(tr('Delete file', 'Supprimer fichier'), tr('Delete this dossier file?', 'Supprimer ce fichier dossier ?'), [
      { text: tr('Cancel', 'Annuler'), style: 'cancel' },
      {
        text: tr('Delete', 'Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            setDossierActionLoading(true);
            await api.delete(`/patients/${patientId}/dossier/${fileId}`);
            await fetchDossier();
          } finally {
            setDossierActionLoading(false);
          }
        },
      },
    ]);
  };

  const openDossierFile = async (path: string) => {
    const url = buildUploadUrl(path);
    if (!url) return;
    await Linking.openURL(url);
  };

  useEffect(() => {
    void fetchAll(false);
  }, [patientId]);

  useEffect(() => {
    const socket = io(buildSocketUrl(), {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const subscribe = () => {
      socket.emit('subscribe-patient', patientId);
    };

    socket.on('connect', subscribe);
    socket.on('patient-vitals:update', (payload: any) => {
      const payloadPatientId = payload?.patientId ? String(payload.patientId) : '';
      if (payloadPatientId && payloadPatientId !== patientId) return;

      const normalized = normalizeVital({
        ...payload?.signal,
        timestamp: payload?.timestamp,
      });

      if (!normalized.timestamp) return;

      setVitals((current) => {
        const deduped = current.filter((item) => item.timestamp !== normalized.timestamp);
        return [normalized, ...deduped].slice(0, 200);
      });

      const updatedMetrics: VitalMetricKey[] = [];
      if (normalized.heartRate !== undefined) updatedMetrics.push('heartRate');
      if (normalized.temperature !== undefined) updatedMetrics.push('temperature');
      if (normalized.spO2 !== undefined) updatedMetrics.push('spO2');
      if (normalized.glucose !== undefined) updatedMetrics.push('glucose');

      if (updatedMetrics.length > 0) {
        setRecentlyUpdatedMetrics((current) => {
          const next = { ...current };
          updatedMetrics.forEach((metric) => {
            next[metric] = true;
          });
          return next;
        });
        setLivePulseTick((current) => current + 1);

        if (clearMetricUpdateTimerRef.current) {
          clearTimeout(clearMetricUpdateTimerRef.current);
        }
        clearMetricUpdateTimerRef.current = setTimeout(() => {
          setRecentlyUpdatedMetrics({
            heartRate: false,
            temperature: false,
            spO2: false,
            glucose: false,
          });
          clearMetricUpdateTimerRef.current = null;
        }, 1400);
      }

      setLastLiveUpdate(new Date());
    });

    subscribe();

    return () => {
      socket.emit('unsubscribe-patient', patientId);
      socket.disconnect();
    };
  }, [patientId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchAiAnalysis(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [patientId]);

  useEffect(() => {
    if (livePulseTick === 0) return;

    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [livePulseTick, pulseAnim]);

  const aiAlerts = Array.isArray(aiAnalysis?.alerts) ? aiAnalysis?.alerts || [] : [];
  const aiRecommendations = Array.isArray(aiAnalysis?.recommendations)
    ? aiAnalysis?.recommendations || []
    : [];

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!patient) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>{tr('Patient Detail', 'Detail patient')}</Text>
        <Text style={styles.subtitle}>{tr('Patient not found.', 'Patient introuvable.')}</Text>
      </ScreenContainer>
    );
  }

  const age = computeAge(patient.dateOfBirth);
  const metricMeta: Record<
    VitalMetricKey,
    {
      label: string;
      color: string;
      unit: string;
      hint: string;
      chartData: { labels: string[]; datasets: { data: number[] }[] };
      stats: { min: number | null; max: number | null; avg: number | null; current: number | null };
      currentValue?: number;
    }
  > = {
    heartRate: {
      label: 'Heart Rate',
      color: '#e11d48',
      unit: 'bpm',
      hint: 'Normal: 60-100 bpm • Warning: 52-110 bpm • Critical outside warning',
      chartData: heartRateChartData,
      stats: heartRateStats,
      currentValue: heartRate,
    },
    temperature: {
      label: 'Temperature',
      color: '#d97706',
      unit: 'C',
      hint: 'Normal: 36.5-37.5 C • Warning: 36.0-38.2 C • Critical outside warning',
      chartData: temperatureChartData,
      stats: temperatureStats,
      currentValue: temperature,
    },
    spO2: {
      label: 'SpO2',
      color: '#0891b2',
      unit: '%',
      hint: 'Normal: 95-100% • Warning: 94-100% • Critical below 94%',
      chartData: spO2ChartData,
      stats: spO2Stats,
      currentValue: spO2,
    },
    glucose: {
      label: 'Glucose',
      color: '#0284c7',
      unit: 'mg/dL',
      hint: 'Normal: 70-140 mg/dL • Warning: 70-190 mg/dL • Critical outside warning',
      chartData: glucoseChartData,
      stats: glucoseStats,
      currentValue: glucose,
    },
  };
  const selectedMetricMeta = metricMeta[selectedMetric];
  const selectedMetricLevel = getThresholdLevel(selectedMetric, selectedMetricMeta.currentValue);
  const selectedMetricBadgeStyle =
    selectedMetricLevel === 'critical'
      ? styles.badgeCritical
      : selectedMetricLevel === 'warning'
        ? styles.badgeWarning
        : selectedMetricLevel === 'normal'
          ? styles.badgeNormal
          : styles.badgeUnknown;
  const selectedMetricBadgeLabel = formatThresholdLevel(selectedMetricLevel);

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{patient.firstName} {patient.lastName}</Text>
          <Text style={styles.subtitle}>MRN: {patient.medicalRecordNumber || patient._id || patient.id || '--'} • {tr('Age', 'Age')}: {age ?? '--'}</Text>
          <Text style={styles.subtitle}>{tr('Gender', 'Genre')}: {formatGender(patient.gender)} • {tr('Last Live', 'Dernier Live')}: {lastLiveUpdate ? lastLiveUpdate.toLocaleTimeString() : '--'}</Text>
        </View>
        <View style={[styles.statusBadge, statusBadgeStyle]}>
          <Text style={styles.statusBadgeText}>{formatPatientStatus(computedStatus)}</Text>
        </View>
      </View>

      <Pressable style={styles.refreshBtn} onPress={() => void fetchAll(true)}>
        <Text style={styles.refreshBtnText}>{tr('Refresh data', 'Actualiser donnees')}</Text>
      </Pressable>

      {refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <StatCard title={tr('Heart Rate', 'Frequence cardiaque')} value={heartRate ?? '--'} subtitle="bpm" />
      <StatCard title={tr('Temperature', 'Temperature')} value={temperature !== undefined ? `${temperature.toFixed(1)}` : '--'} subtitle="C" />
      <StatCard title="SpO2" value={spO2 ?? '--'} subtitle="%" />
      <StatCard title={tr('Glucose', 'Glucose')} value={glucose ?? '--'} subtitle="mg/dL" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('Live Vital Trends', 'Tendances vitales en direct')}</Text>
        <Text style={styles.subtitle}>{tr('Recent points from patient vitals stream', 'Points recents du flux vital patient')}</Text>

        <View style={styles.rangeChipRow}>
          {(['1h', '6h', '24h', '7d'] as ChartRange[]).map((range) => (
            <Pressable
              key={range}
              onPress={() => setSelectedRange(range)}
              style={[styles.rangeChip, selectedRange === range ? styles.rangeChipActive : null]}
            >
              <Text style={selectedRange === range ? styles.rangeChipTextActive : styles.rangeChipText}>{range}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.metricToggleWrap}>
          {(['heartRate', 'temperature', 'spO2', 'glucose'] as VitalMetricKey[]).map((metric) => {
            const meta = metricMeta[metric];
            const level = getThresholdLevel(metric, meta.currentValue);
            const levelStyle =
              level === 'critical'
                ? styles.metricBadgeCritical
                : level === 'warning'
                  ? styles.metricBadgeWarning
                  : level === 'normal'
                    ? styles.metricBadgeNormal
                    : styles.metricBadgeUnknown;

            return (
              <Pressable
                key={metric}
                onPress={() => setSelectedMetric(metric)}
                style={[
                  styles.metricToggleBtn,
                  selectedMetric === metric ? styles.metricToggleBtnActive : null,
                ]}
              >
                <Text style={selectedMetric === metric ? styles.metricToggleTextActive : styles.metricToggleText}>
                  {meta.label}
                </Text>
                <Text style={styles.metricToggleValue}>
                  {meta.currentValue !== undefined ? `${meta.currentValue.toFixed(1)} ${meta.unit}` : '--'}
                </Text>
                <View style={[styles.metricStatusBadge, levelStyle]}>
                  <Text style={styles.metricStatusBadgeText}>{formatThresholdLevel(level)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          style={[
            styles.chartBlock,
            recentlyUpdatedMetrics[selectedMetric]
              ? {
                  transform: [{ scale: pulseScale }],
                }
              : null,
          ]}
        >
          <View style={styles.chartHeaderRow}>
            <View style={styles.chartHeaderTitleWrap}>
              <Text style={styles.chartTitle}>{selectedMetricMeta.label} ({selectedMetricMeta.unit})</Text>
              <Animated.View
                style={[
                  styles.liveDot,
                  {
                    backgroundColor: selectedMetricMeta.color,
                    opacity: recentlyUpdatedMetrics[selectedMetric] ? pulseOpacity : 0.25,
                    transform: [{ scale: recentlyUpdatedMetrics[selectedMetric] ? pulseScale : 1 }],
                  },
                ]}
              />
            </View>
            <View style={[styles.levelBadge, selectedMetricBadgeStyle]}>
              <Text style={styles.levelBadgeText}>{selectedMetricBadgeLabel}</Text>
            </View>
          </View>

          <LineChart
            data={selectedMetricMeta.chartData}
            width={CHART_WIDTH}
            height={220}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => {
                if (selectedMetric === 'heartRate') return `rgba(225, 29, 72, ${opacity})`;
                if (selectedMetric === 'temperature') return `rgba(217, 119, 6, ${opacity})`;
                if (selectedMetric === 'spO2') return `rgba(8, 145, 178, ${opacity})`;
                return `rgba(2, 132, 199, ${opacity})`;
              },
              propsForDots: {
                r: '2.5',
                strokeWidth: '1',
                stroke: selectedMetricMeta.color,
              },
            }}
            withInnerLines
            withOuterLines={false}
            withVerticalLabels
            withHorizontalLabels
            withShadow={false}
            bezier
            fromZero={false}
            style={styles.chart}
          />

          <View style={styles.statGrid}>
            <Text style={styles.statText}>{tr('Current', 'Actuel')}: {selectedMetricMeta.stats.current ?? '--'} {selectedMetricMeta.unit}</Text>
            <Text style={styles.statText}>{tr('Avg', 'Moy')}: {selectedMetricMeta.stats.avg ?? '--'} {selectedMetricMeta.unit}</Text>
            <Text style={styles.statText}>{tr('Min', 'Min')}: {selectedMetricMeta.stats.min ?? '--'} {selectedMetricMeta.unit}</Text>
            <Text style={styles.statText}>{tr('Max', 'Max')}: {selectedMetricMeta.stats.max ?? '--'} {selectedMetricMeta.unit}</Text>
          </View>

          <View style={styles.thresholdBarWrap}>
            <View style={styles.thresholdBar}>
              <View style={[styles.thresholdSeg, styles.thresholdCritical]} />
              <View style={[styles.thresholdSeg, styles.thresholdWarning]} />
              <View style={[styles.thresholdSeg, styles.thresholdNormal]} />
              <View style={[styles.thresholdSeg, styles.thresholdWarning]} />
              <View style={[styles.thresholdSeg, styles.thresholdCritical]} />
            </View>
            <View
              style={[
                styles.thresholdMarker,
                {
                  left: `${getThresholdMarkerLeftPercent(selectedMetric, selectedMetricMeta.currentValue)}%`,
                  backgroundColor:
                    selectedMetricLevel === 'critical'
                      ? colors.danger
                      : selectedMetricLevel === 'warning'
                        ? colors.warning
                        : selectedMetricLevel === 'normal'
                          ? colors.success
                          : '#64748b',
                },
              ]}
            />
          </View>
          <Text style={styles.thresholdHint}>{selectedMetricMeta.hint}</Text>
        </Animated.View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('AI Clinical Analysis', 'Analyse clinique IA')}</Text>
        {aiError ? <Text style={styles.error}>{aiError}</Text> : null}
        <Text style={styles.value}>{tr('Anomaly', 'Anomalie')}: {aiAnalysis?.models?.anomaly?.is_anomaly ? tr('Detected', 'Detectee') : tr('Not detected', 'Non detectee')}</Text>
        <Text style={styles.value}>
          {tr('Status', 'Statut')}: {formatAiStatus(aiAnalysis?.models?.status?.status)}
          {aiAnalysis?.models?.status?.confidence !== undefined
            ? ` (${(Number(aiAnalysis.models.status.confidence) * 100).toFixed(1)}%)`
            : ''}
        </Text>
        <Text style={styles.value}>
          {tr('Cardiac Risk', 'Risque cardiaque')}: {formatCardiacRisk(aiAnalysis?.models?.cardiac?.risk_level)}
          {aiAnalysis?.models?.cardiac?.risk_percentage ? ` (${aiAnalysis.models.cardiac.risk_percentage})` : ''}
        </Text>
        <Text style={styles.value}>
          {tr('Respiratory Forecast', 'Prevision respiratoire')}: {aiAnalysis?.models?.respiratory?.predicted_spo2 !== undefined
            ? `${Number(aiAnalysis.models.respiratory.predicted_spo2).toFixed(1)}%`
            : '--'}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>{tr('AI Alerts', 'Alertes IA')}</Text>
        {aiAlerts.length === 0 ? (
          <Text style={styles.subtitle}>{tr('No AI alerts generated.', 'Aucune alerte IA generee.')}</Text>
        ) : (
          aiAlerts.map((item, index) => (
            <View key={`${item.type || 'alert'}-${index}`} style={styles.subCard}>
              <Text style={styles.value}>{item.message || 'AI alert'}</Text>
              <Text style={styles.subtitle}>{formatAiSeverity(item.severity || 'MEDIUM')}</Text>
              <Text style={styles.subtitle}>{item.description || '--'}</Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>{tr('Recommendations', 'Recommandations')}</Text>
        {aiRecommendations.length === 0 ? (
          <Text style={styles.subtitle}>{tr('No recommendations.', 'Aucune recommandation.')}</Text>
        ) : (
          aiRecommendations.map((text, idx) => (
            <Text key={`rec-${idx}`} style={styles.value}>• {text}</Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>{tr('Timeline + Events', 'Timeline + Evenements')}</Text>
          <Pressable style={styles.primaryBtn} onPress={openAddEvent}>
            <Text style={styles.primaryBtnText}>{tr('Add event', 'Ajouter evenement')}</Text>
          </Pressable>
        </View>

        <View style={styles.chipWrap}>
          {(['all', 'alert', 'intervention', 'medication', 'procedure', 'note', 'ai_insight'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setEventFilter(value)}
              style={[styles.chip, eventFilter === value ? styles.chipActive : null]}
            >
              <Text style={eventFilter === value ? styles.chipTextActive : styles.chipText}>{value === 'all' ? tr('All', 'Tous') : formatEventType(value)}</Text>
            </Pressable>
          ))}
        </View>

        {filteredTimelineEvents.length === 0 ? (
          <Text style={styles.subtitle}>{tr('No events found for this filter.', 'Aucun evenement pour ce filtre.')}</Text>
        ) : (
          filteredTimelineEvents.map((event) => (
            <View key={event._id} style={styles.eventCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.value}>{event.title}</Text>
                <Text style={styles.subtitle}>{new Date(event.eventTime).toLocaleString()}</Text>
              </View>
              <Text style={styles.subtitle}>{formatEventType(event.type)} • {formatEventSeverity(event.severity)}</Text>
              <Text style={styles.value}>{event.description}</Text>
              {event.reason ? <Text style={styles.subtitle}>{tr('Reason', 'Raison')}: {event.reason}</Text> : null}
              {event.details ? <Text style={styles.subtitle}>{tr('Details', 'Details')}: {event.details}</Text> : null}
              {event.notes?.length ? <Text style={styles.subtitle}>{tr('Notes', 'Notes')}: {event.notes.join(', ')}</Text> : null}
              <Text style={styles.subtitle}>{tr('By', 'Par')}: {event.actor || '--'}</Text>
              <View style={styles.rowEnd}>
                <Pressable style={styles.secondaryBtn} onPress={() => openEditEvent(event)} disabled={eventCrudLoading}>
                  <Text style={styles.secondaryBtnText}>{tr('Edit', 'Modifier')}</Text>
                </Pressable>
                <Pressable style={styles.dangerBtn} onPress={() => void deleteEvent(event._id)} disabled={eventCrudLoading}>
                  <Text style={styles.dangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>{tr('Patient Dossier', 'Dossier patient')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setShowDossierModal(true)}>
            <Text style={styles.primaryBtnText}>{tr('Add file', 'Ajouter fichier')}</Text>
          </Pressable>
        </View>

        {dossierLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {dossierFiles.length === 0 ? <Text style={styles.subtitle}>{tr('No dossier files.', 'Aucun fichier dossier.')}</Text> : null}

        {dossierFiles.map((file) => (
          <View key={file._id} style={styles.eventCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.value}>{file.label || file.originalName}</Text>
              <Text style={styles.subtitle}>{formatDossierCategory(file.category)}</Text>
            </View>
            <Text style={styles.subtitle}>{file.originalName}</Text>
            <Text style={styles.subtitle}>{formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleString()}</Text>
            {file.notes ? <Text style={styles.subtitle}>{file.notes}</Text> : null}

            <View style={styles.rowEnd}>
              <Pressable style={styles.secondaryBtn} onPress={() => void openDossierFile(file.path)} disabled={dossierActionLoading}>
                <Text style={styles.secondaryBtnText}>{tr('Open', 'Ouvrir')}</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={() => void deleteDossierFile(file._id)} disabled={dossierActionLoading}>
                <Text style={styles.dangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Modal visible={showEventModal} animationType="slide" onRequestClose={resetEventModal}>
        <View style={styles.modalRoot}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>{editingEventId ? tr('Edit Event', 'Modifier evenement') : tr('Add Event', 'Ajouter evenement')}</Text>
            <Pressable style={styles.secondaryBtn} onPress={resetEventModal}>
              <Text style={styles.secondaryBtnText}>{tr('Close', 'Fermer')}</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ key: 'event-form' }]}
            keyExtractor={(item) => item.key}
            renderItem={() => (
              <View style={styles.modalForm}>
                <TextInput
                  style={styles.input}
                  placeholder={tr('Type (alert/medication/intervention/procedure/note/ai_insight)', 'Type (alerte/medication/intervention/procedure/note/apercu_ia)')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.type}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, type: value as EventType }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Severity (normal/warning/critical)', 'Severite (normal/avertissement/critique)')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.severity}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, severity: value as EventSeverity }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Title', 'Titre')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.title}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, title: value }))}
                />
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  placeholder={tr('Description', 'Description')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.description}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, description: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Reason', 'Raison')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.reason}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, reason: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Details', 'Details')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.details}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, details: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Notes (comma separated)', 'Notes (separees par virgules)')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.notesText}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, notesText: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Actor', 'Acteur')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.actor}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, actor: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Event time (YYYY-MM-DDTHH:mm)', 'Heure evenement (YYYY-MM-DDTHH:mm)')}
                  placeholderTextColor={colors.textMuted}
                  value={eventDraft.eventTime}
                  onChangeText={(value) => setEventDraft((prev) => ({ ...prev, eventTime: value }))}
                />

                <View style={styles.rowEnd}>
                  <Pressable style={styles.secondaryBtn} onPress={resetEventModal} disabled={eventCrudLoading}>
                    <Text style={styles.secondaryBtnText}>{tr('Cancel', 'Annuler')}</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={() => void submitEvent()} disabled={eventCrudLoading}>
                    {eventCrudLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{editingEventId ? tr('Update', 'Mettre a jour') : tr('Add', 'Ajouter')}</Text>}
                  </Pressable>
                </View>
              </View>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showDossierModal} animationType="slide" onRequestClose={() => setShowDossierModal(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>{tr('Add Dossier File', 'Ajouter fichier dossier')}</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => setShowDossierModal(false)}>
              <Text style={styles.secondaryBtnText}>{tr('Close', 'Fermer')}</Text>
            </Pressable>
          </View>

          <View style={styles.modalForm}>
            <TextInput
              style={styles.input}
              placeholder={tr('Category (irm/scanner/radiology/lab/prescription/report/other)', 'Categorie (irm/scanner/radiologie/labo/prescription/rapport/autre)')}
              placeholderTextColor={colors.textMuted}
              value={dossierCategory}
              onChangeText={(value) => setDossierCategory(value as DossierCategory)}
            />
            <TextInput
              style={styles.input}
              placeholder={tr('Label', 'Label')}
              placeholderTextColor={colors.textMuted}
              value={dossierLabel}
              onChangeText={setDossierLabel}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              multiline
              placeholder={tr('Notes', 'Notes')}
              placeholderTextColor={colors.textMuted}
              value={dossierNotes}
              onChangeText={setDossierNotes}
            />

            <Pressable style={styles.secondaryBtn} onPress={() => void pickDossierFile()}>
              <Text style={styles.secondaryBtnText}>{pickedDossierFile ? pickedDossierFile.name : tr('Pick file', 'Choisir fichier')}</Text>
            </Pressable>

            <View style={styles.rowEnd}>
              <Pressable style={styles.secondaryBtn} onPress={() => setShowDossierModal(false)} disabled={dossierActionLoading}>
                <Text style={styles.secondaryBtnText}>{tr('Cancel', 'Annuler')}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => void uploadDossierFile()} disabled={dossierActionLoading}>
                {dossierActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tr('Upload', 'Televerser')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 16,
  },
  value: {
    color: colors.text,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  refreshBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  refreshBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  statusDanger: {
    backgroundColor: colors.danger,
  },
  statusWarning: {
    backgroundColor: colors.warning,
  },
  statusInfo: {
    backgroundColor: colors.info,
  },
  statusMuted: {
    backgroundColor: '#64748b',
  },
  statusSuccess: {
    backgroundColor: colors.success,
  },
  subCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    backgroundColor: '#f8fafc',
    gap: 3,
  },
  chartBlock: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  rangeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rangeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  rangeChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  rangeChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  rangeChipTextActive: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  metricToggleWrap: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricToggleBtn: {
    flexGrow: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  metricToggleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  metricToggleText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  metricToggleTextActive: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  metricToggleValue: {
    color: colors.textMuted,
    fontSize: 11,
  },
  metricStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metricStatusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  metricBadgeCritical: {
    backgroundColor: colors.danger,
  },
  metricBadgeWarning: {
    backgroundColor: colors.warning,
  },
  metricBadgeNormal: {
    backgroundColor: colors.success,
  },
  metricBadgeUnknown: {
    backgroundColor: '#64748b',
  },
  chartTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
    marginLeft: 6,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  chartHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  levelBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeCritical: {
    backgroundColor: colors.danger,
  },
  badgeWarning: {
    backgroundColor: colors.warning,
  },
  badgeNormal: {
    backgroundColor: colors.success,
  },
  badgeUnknown: {
    backgroundColor: '#64748b',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  chart: {
    borderRadius: 10,
  },
  statGrid: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  thresholdBarWrap: {
    marginTop: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  thresholdBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thresholdSeg: {
    flex: 1,
  },
  thresholdNormal: {
    backgroundColor: '#dcfce7',
  },
  thresholdWarning: {
    backgroundColor: '#fef3c7',
  },
  thresholdCritical: {
    backgroundColor: '#fee2e2',
  },
  thresholdMarker: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 14,
    borderRadius: 4,
    marginLeft: -5,
  },
  thresholdHint: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  chipTextActive: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  eventCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowEnd: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 85,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryBtn: {
    borderRadius: 10,
    backgroundColor: '#eef2f7',
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 85,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  dangerBtn: {
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 85,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  modalForm: {
    gap: 10,
    paddingBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
