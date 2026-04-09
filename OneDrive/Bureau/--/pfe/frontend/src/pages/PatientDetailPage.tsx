import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Heart, Thermometer, Droplets, Moon, Wind, Activity, AlertCircle, Plus, Pencil, Trash2, FileUp, Download, FolderOpen } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';
import { format } from 'date-fns';
import { useLanguageStore } from '../store/languageStore';

interface TrendPoint {
  index: number;
  value: number;
}

interface VitalRecord {
  timestamp: string;
  heartRate?: number;
  temperature?: number;
  spO2?: number;
  glucose?: number;
  sleepHours?: number;
}

type EventType = 'alert' | 'medication' | 'intervention' | 'procedure' | 'note' | 'ai_insight';
type EventSeverity = 'critical' | 'warning' | 'normal';

interface PatientTimelineEvent {
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
}

type DossierCategory = 'irm' | 'scanner' | 'radiology' | 'lab' | 'prescription' | 'report' | 'other';

interface PatientDossierFile {
  _id: string;
  category: DossierCategory;
  label?: string;
  notes?: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string;
}

type SleepComputation = {
  totalSleepHours: number;
  sleepEfficiency: number;
  series: TrendPoint[];
};

const rangeHoursMap = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 7 * 24,
} as const;

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
  sleepHours: toNumberOrUndefined(vital?.sleepHours),
});

const buildSocketUrl = (): string => {
  const fromEnv = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;
  if (fromEnv) return fromEnv;

  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  return baseUrl.replace(/\/api\/v\d+$/, '');
};

const buildUploadUrl = (relativePath?: string): string => {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const origin = buildSocketUrl().replace(/\/$/, '');
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${origin}${normalizedPath}`;
};

const formatFileSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
};

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const computeAge = (dateOfBirth?: string | Date): number | null => {
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

type DerivedPatientStatus = 'CRITICAL' | 'MODERATE' | 'STABLE' | 'RECOVERING' | 'DISCHARGED';

const deriveLiveStatus = (
  vitals: {
    heartRate?: number;
    temperature?: number;
    spO2?: number;
    glucose?: number;
  },
  fallbackStatus?: string
): DerivedPatientStatus => {
  const hr = toNumberOrUndefined(vitals.heartRate);
  const temp = toNumberOrUndefined(vitals.temperature);
  const spo2 = toNumberOrUndefined(vitals.spO2);
  const glu = toNumberOrUndefined(vitals.glucose);

  // If no vitals yet, rely on persisted status.
  if (hr === undefined && temp === undefined && spo2 === undefined && glu === undefined) {
    const normalized = String(fallbackStatus || '').toUpperCase();
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

const computeSleepFromVitals = (
  vitals: VitalRecord[],
  lookbackHours: number
): SleepComputation => {
  if (!Array.isArray(vitals) || vitals.length < 2) {
    return { totalSleepHours: 0, sleepEfficiency: 0, series: [] };
  }

  const cutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000;

  const points = vitals
    .map((vital) => ({
      ...vital,
      ts: new Date(vital.timestamp).getTime(),
      heartRate: toNumberOrUndefined(vital.heartRate),
      spO2: toNumberOrUndefined(vital.spO2),
      temperature: toNumberOrUndefined(vital.temperature),
    }))
    .filter((vital) => Number.isFinite(vital.ts) && vital.ts >= cutoffMs)
    .sort((a, b) => a.ts - b.ts);

  if (points.length < 2) {
    return { totalSleepHours: 0, sleepEfficiency: 0, series: [] };
  }

  const intervals = points
    .slice(1)
    .map((point, idx) => (point.ts - points[idx].ts) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0 && minutes <= 30)
    .sort((a, b) => a - b);

  const medianIntervalMinutes = intervals.length
    ? intervals[Math.floor(intervals.length / 2)]
    : 1;

  // Adapt hysteresis to sampling cadence so 1s simulator streams don't need many real minutes.
  const onsetRequiredMinutes = clampNumber(medianIntervalMinutes * 10, 0.5, 10);
  const wakeRequiredMinutes = clampNumber(medianIntervalMinutes * 3, 0.2, 3);

  const isAsleepCandidate = (current: typeof points[number], previous?: typeof points[number]) => {
    if (
      current.heartRate === undefined ||
      current.spO2 === undefined ||
      current.temperature === undefined
    ) {
      return false;
    }

    const baselineResting =
      current.heartRate >= 48 &&
      current.heartRate <= 88 &&
      current.spO2 >= 92 &&
      current.temperature >= 35.7 &&
      current.temperature <= 37.8;

    if (!baselineResting) return false;

    if (!previous) return true;

    const stableDrift =
      previous.heartRate !== undefined &&
      previous.spO2 !== undefined &&
      previous.temperature !== undefined &&
      Math.abs(current.heartRate - previous.heartRate) <= 12 &&
      Math.abs(current.spO2 - previous.spO2) <= 4 &&
      Math.abs(current.temperature - previous.temperature) <= 0.5;

    return stableDrift;
  };

  let sleepState = false;
  let asleepCandidateMinutes = 0;
  let awakeCandidateMinutes = 0;
  let totalWindowMinutes = 0;
  let totalSleepMinutes = 0;

  const series: TrendPoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = index > 0 ? points[index - 1] : undefined;

    const rawDeltaMinutes = next
      ? (next.ts - current.ts) / 60000
      : medianIntervalMinutes;
    const deltaMinutes = clampNumber(rawDeltaMinutes, 1 / 60, 5);

    totalWindowMinutes += deltaMinutes;

    const asleepCandidate = isAsleepCandidate(current, previous);

    if (!sleepState) {
      if (asleepCandidate) {
        asleepCandidateMinutes += deltaMinutes;
        if (asleepCandidateMinutes >= onsetRequiredMinutes) {
          sleepState = true;
          awakeCandidateMinutes = 0;
        }
      } else {
        asleepCandidateMinutes = 0;
      }
    } else {
      if (!asleepCandidate) {
        awakeCandidateMinutes += deltaMinutes;
        if (awakeCandidateMinutes >= wakeRequiredMinutes) {
          sleepState = false;
          asleepCandidateMinutes = 0;
        }
      } else {
        awakeCandidateMinutes = 0;
      }
    }

    if (sleepState) {
      totalSleepMinutes += deltaMinutes;
    }

    series.push({
      index,
      value: Number((totalSleepMinutes / 60).toFixed(2)),
    });
  }

  const totalSleepHours = Number((totalSleepMinutes / 60).toFixed(2));
  const sleepEfficiency = totalWindowMinutes > 0
    ? Number(((totalSleepMinutes / totalWindowMinutes) * 100).toFixed(1))
    : 0;

  return {
    totalSleepHours,
    sleepEfficiency,
    series,
  };
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  accentClass: string;
  children?: React.ReactNode;
}

function MetricCard({ icon, label, value, unit, accentClass, children }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accentClass}`}>
            {icon}
          </div>
          <span className="font-medium text-gray-800">{label}</span>
        </div>
      </div>
      <div className="text-3xl font-semibold text-gray-900">
        {value} <span className="text-lg font-normal text-gray-600">{unit}</span>
      </div>
      {children}
    </div>
  );
}

export default function PatientDetailPage() {
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [vitalSigns, setVitalSigns] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBodyMetric, setActiveBodyMetric] = useState<'temperature' | 'heartRate' | 'glucose' | 'sleep'>('temperature');
  const [eventFilter, setEventFilter] = useState<'all' | EventType>('all');
  const [timelineDateFilterMode, setTimelineDateFilterMode] = useState<'all_time' | 'day'>('all_time');
  const [timelineSelectedDate, setTimelineSelectedDate] = useState<string>('');
  const [selectedRange, setSelectedRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<PatientTimelineEvent[]>([]);
  const [eventCrudLoading, setEventCrudLoading] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventSelectionMode, setEventSelectionMode] = useState<'edit' | 'delete' | null>(null);
  const [dossierFiles, setDossierFiles] = useState<PatientDossierFile[]>([]);
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierActionLoading, setDossierActionLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [dossierDraft, setDossierDraft] = useState<{
    category: DossierCategory;
    label: string;
    notes: string;
    file: File | null;
  }>({
    category: 'irm',
    label: '',
    notes: '',
    file: null,
  });
  const [eventDraft, setEventDraft] = useState<{
    type: EventType;
    severity: EventSeverity;
    title: string;
    description: string;
    reason: string;
    details: string;
    notesText: string;
    actor: string;
    eventTime: string;
  }>({
    type: 'note',
    severity: 'normal',
    title: '',
    description: '',
    reason: '',
    details: '',
    notesText: '',
    actor: '',
    eventTime: new Date().toISOString().slice(0, 16),
  });
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [liveSeries, setLiveSeries] = useState<TrendPoint[]>([]);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLastRefresh, setAiLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const [patientRes, vitalsRes] = await Promise.all([
          api.get(`/patients/${id}`),
          api.get(`/patients/${id}/vitals`),
        ]);

        setPatient(patientRes.data.data.patient);
        setVitalSigns((vitalsRes.data.data.vitals || []).map((vital: any) => normalizeVital(vital)));
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

  const fetchPatientEvents = async () => {
    if (!id) return;
    try {
      const response = await api.get(`/patients/${id}/events?limit=200`);
      setTimelineEvents(response.data?.data?.events || []);
    } catch (error) {
      console.error('Failed to fetch patient events:', error);
    }
  };

  const fetchPatientDossier = async () => {
    if (!id) return;
    try {
      setDossierLoading(true);
      const response = await api.get(`/patients/${id}/dossier`);
      setDossierFiles(response.data?.data?.files || []);
    } catch (error) {
      console.error('Failed to fetch patient dossier files:', error);
      setDossierError('Unable to load dossier files.');
    } finally {
      setDossierLoading(false);
    }
  };

  const latestVitals = vitalSigns[0] || {};
  const latestVitalsRef = useRef<any>({});
  latestVitalsRef.current = latestVitals;

  useEffect(() => {
    if (!id) return;

    const socket: Socket = io(buildSocketUrl(), {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const subscribe = () => {
      socket.emit('subscribe-patient', id);
    };

    socket.on('connect', subscribe);
    socket.on('patient-vitals:update', (payload: any) => {
      const payloadPatientId = payload?.patientId ? String(payload.patientId) : '';
      if (payloadPatientId && payloadPatientId !== id) return;

      const normalized = normalizeVital({
        ...payload?.signal,
        timestamp: payload?.timestamp,
      });

      if (!normalized.timestamp) return;

      setVitalSigns((previous) => {
        const deduped = previous.filter((vital) => vital.timestamp !== normalized.timestamp);
        return [normalized, ...deduped].slice(0, 200);
      });
      setLastLiveUpdate(new Date());
    });

    subscribe();

    return () => {
      socket.emit('unsubscribe-patient', id);
      socket.disconnect();
    };
  }, [id]);

  const fetchAiAnalysis = async (silent = false) => {
    if (!id) return;
    if (!silent) setAiLoading(true);
    setAiError(null);

    try {
      const response = await api.get(`/ai/patients/${id}/analysis?limit=700`);
      setAiAnalysis(response.data?.data?.analysis || null);
      setAiLastRefresh(new Date());
    } catch (error: any) {
      const fallbackHeartRate = toNumberOrUndefined(latestVitalsRef.current?.heartRate);
      const fallbackOxygen = toNumberOrUndefined(latestVitalsRef.current?.spO2);
      const fallbackTemperature = toNumberOrUndefined(latestVitalsRef.current?.temperature);

      const fallbackSeverity =
        (fallbackHeartRate !== undefined && (fallbackHeartRate >= 130 || fallbackHeartRate <= 42)) ||
        (fallbackOxygen !== undefined && fallbackOxygen < 90) ||
        (fallbackTemperature !== undefined && (fallbackTemperature >= 39.2 || fallbackTemperature < 35.2))
          ? 'CRITICAL'
          : (fallbackHeartRate !== undefined && (fallbackHeartRate > 110 || fallbackHeartRate < 52)) ||
            (fallbackOxygen !== undefined && fallbackOxygen < 94) ||
            (fallbackTemperature !== undefined && (fallbackTemperature >= 38.2 || fallbackTemperature < 36.0))
          ? 'HIGH'
          : 'MEDIUM';

      setAiAnalysis({
        models: {
          anomaly: {
            is_anomaly: fallbackSeverity !== 'MEDIUM',
            anomaly_score: fallbackSeverity === 'CRITICAL' ? 0.85 : fallbackSeverity === 'HIGH' ? 0.62 : 0.18,
          },
          status: {
            status: fallbackSeverity === 'CRITICAL' ? 'Critical' : fallbackSeverity === 'HIGH' ? 'Warning' : 'Stable',
            confidence: fallbackSeverity === 'CRITICAL' ? 0.84 : fallbackSeverity === 'HIGH' ? 0.72 : 0.68,
          },
          cardiac: {
            risk_level: fallbackSeverity === 'CRITICAL' ? 'High' : fallbackSeverity === 'HIGH' ? 'Medium' : 'Low',
            risk_percentage: fallbackSeverity === 'CRITICAL' ? '82%' : fallbackSeverity === 'HIGH' ? '54%' : '21%',
          },
          respiratory: {
            predicted_spo2: (fallbackOxygen ?? 97) - (fallbackSeverity === 'CRITICAL' ? 3 : fallbackSeverity === 'HIGH' ? 1 : 0),
            horizon_minutes: 30,
          },
        },
        alerts:
          fallbackSeverity === 'MEDIUM'
            ? []
            : [
                {
                  type: 'FALLBACK_AI_ALERT',
                  severity: fallbackSeverity,
                  message: 'Fallback AI analysis is active',
                  description: 'Primary AI API was unavailable; local threshold logic is being used.',
                },
              ],
        recommendations:
          fallbackSeverity === 'CRITICAL'
            ? ['Immediate clinical reassessment is recommended.', 'Confirm sensor quality and escalate to physician.']
            : fallbackSeverity === 'HIGH'
            ? ['Increase monitoring frequency.', 'Repeat vitals in a short interval.']
            : ['Continue routine monitoring.'],
      });
      setAiError('Primary AI service unavailable, showing local fallback analysis.');
    } finally {
      if (!silent) setAiLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchAiAnalysis();
    fetchPatientEvents();
    fetchPatientDossier();

    const interval = setInterval(() => {
      fetchAiAnalysis(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [id]);

  const resetDossierDraft = () => {
    setDossierDraft({
      category: 'irm',
      label: '',
      notes: '',
      file: null,
    });
    setShowDossierModal(false);
  };

  const handleUploadDossierFile = async () => {
    if (!id || !dossierDraft.file) return;

    try {
      setDossierActionLoading(true);
      setDossierError(null);

      const formData = new FormData();
      formData.append('file', dossierDraft.file);
      formData.append('category', dossierDraft.category);
      formData.append('label', dossierDraft.label.trim());
      formData.append('notes', dossierDraft.notes.trim());

      await api.post(`/patients/${id}/dossier/upload`, formData);
      await fetchPatientDossier();
      resetDossierDraft();
    } catch (error) {
      console.error('Failed to upload dossier file:', error);
      setDossierError('Failed to upload dossier file.');
    } finally {
      setDossierActionLoading(false);
    }
  };

  const handleDeleteDossierFile = async (fileId: string) => {
    if (!id) return;

    try {
      setDossierActionLoading(true);
      setDossierError(null);
      await api.delete(`/patients/${id}/dossier/${fileId}`);
      await fetchPatientDossier();
    } catch (error) {
      console.error('Failed to delete dossier file:', error);
      setDossierError('Failed to delete dossier file.');
    } finally {
      setDossierActionLoading(false);
    }
  };

  const handleExportDossierPdf = async () => {
    if (!patient) return;

    try {
      setDossierError(null);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 12;
      const contentWidth = pageWidth - marginX * 2;
      const topStart = 30;
      const bottomLimit = pageHeight - 14;
      let y = topStart;
      let currentPage = 1;

      const drawHeaderFooter = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Vita Sensor - PATIENT DOSSIER REPORT', marginX, 8.5);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, marginX, 14);
        doc.text(`Page ${currentPage}`, pageWidth - marginX - 16, 14);

        doc.setTextColor(75, 85, 99);
        doc.setFontSize(8.5);
        doc.text('Confidential clinical document', marginX, pageHeight - 6);
      };

      const addPage = () => {
        doc.addPage();
        currentPage += 1;
        drawHeaderFooter();
        y = topStart;
      };

      const ensureSpace = (requiredHeight = 8) => {
        if (y + requiredHeight > bottomLimit) {
          addPage();
        }
      };

      const sectionTitle = (title: string) => {
        ensureSpace(12);
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, y - 1, contentWidth, 8, 'FD');
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(title, marginX + 2, y + 4.3);
        y += 10;
      };

      const writeLabelValue = (label: string, value: string) => {
        const safeValue = value && String(value).trim().length > 0 ? value : '--';
        const lines = doc.splitTextToSize(`${label}: ${safeValue}`, contentWidth);
        ensureSpace(lines.length * 5 + 1);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        lines.forEach((line: string) => {
          doc.text(line, marginX, y);
          y += 4.8;
        });
      };

      const writeParagraph = (text: string) => {
        const safeValue = text && String(text).trim().length > 0 ? text : '--';
        const lines = doc.splitTextToSize(safeValue, contentWidth);
        ensureSpace(lines.length * 5 + 1);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        lines.forEach((line: string) => {
          doc.text(line, marginX, y);
          y += 4.8;
        });
      };

      const loadImageData = async (url: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
        return new Promise((resolve) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              resolve(null);
              return;
            }

            ctx.drawImage(image, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight });
          };

          image.onerror = () => resolve(null);
          image.src = url;
        });
      };

      drawHeaderFooter();

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`Patient: ${(patient.firstName || '')} ${(patient.lastName || '')}`.trim(), marginX, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`MRN: ${displayMrn}  |  Status: ${dynamicStatus}  |  Dossier Files: ${dossierFiles.length}  |  Events: ${timelineEvents.length}`, marginX, y);
      y += 8;

      sectionTitle('1) Patient Identity & Contact');
      writeLabelValue('First Name', patient.firstName || '--');
      writeLabelValue('Last Name', patient.lastName || '--');
      writeLabelValue('Medical Record Number (MRN)', displayMrn);
      writeLabelValue('Age', computedAge !== null ? String(computedAge) : '--');
      writeLabelValue('Gender', patient.gender || '--');
      writeLabelValue('Date of Birth', patient.dateOfBirth ? format(new Date(patient.dateOfBirth), 'yyyy-MM-dd') : '--');
      writeLabelValue('Blood Type', patient.bloodType || '--');
      writeLabelValue('Phone Number', patient.phoneNumber || '--');
      writeLabelValue('Emergency Contact', patient.emergencyContact || '--');
      writeLabelValue('Emergency Contact Phone', patient.emergencyContactPhone || '--');
      writeLabelValue('Address', [patient.address, patient.city, patient.state, patient.zipCode].filter(Boolean).join(', ') || '--');

      y += 1;
      sectionTitle('2) Clinical Summary');
      writeLabelValue('Status', dynamicStatus);
      writeLabelValue('Diagnosis', patient.diagnosis || '--');
      writeLabelValue('Medical History', patient.medicalHistory || '--');
      writeLabelValue('Current Medications', patient.currentMedications || '--');
      writeLabelValue('Allergies', Array.isArray(patient.allergies) && patient.allergies.length > 0 ? patient.allergies.join(', ') : '--');
      writeLabelValue('Admission Date', patient.admissionDate ? format(new Date(patient.admissionDate), 'yyyy-MM-dd HH:mm') : '--');
      writeLabelValue('Discharge Date', patient.dischargeDate ? format(new Date(patient.dischargeDate), 'yyyy-MM-dd HH:mm') : '--');

      y += 1;
      sectionTitle('3) Current Vitals & Monitoring');
      writeLabelValue('Heart Rate', heartRate !== undefined ? `${heartRate} bpm` : '--');
      writeLabelValue('Temperature', temperature !== undefined ? `${temperature.toFixed(1)} C` : '--');
      writeLabelValue('Oxygen Saturation (SpO2)', oxygenSaturation !== undefined ? `${oxygenSaturation}%` : '--');
      writeLabelValue('Glucose', glucoseLevel !== undefined ? `${glucoseLevel} mg/dL` : '--');
      writeLabelValue('Estimated Sleep Hours', `${sleepHours.toFixed(1)} h`);
      writeLabelValue('Sleep Efficiency', `${sleepComputation.sleepEfficiency.toFixed(1)}%`);
      writeLabelValue('Last Real-time Update', lastLiveUpdate ? format(lastLiveUpdate, 'yyyy-MM-dd HH:mm:ss') : '--');

    

      y += 1;
      sectionTitle('6) Dossier Attachments & Image Previews');
      if (dossierFiles.length === 0) {
        writeParagraph('No dossier files uploaded.');
      } else {
        for (let index = 0; index < dossierFiles.length; index += 1) {
          const file = dossierFiles[index];
          const fileTitle = `${index + 1}. [${String(file.category).toUpperCase()}] ${file.label || file.originalName}`;

          ensureSpace(14);
          doc.setDrawColor(229, 231, 235);
          doc.setFillColor(248, 250, 252);
          doc.rect(marginX, y - 1.5, contentWidth, 7.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.8);
          doc.setTextColor(17, 24, 39);
          doc.text(fileTitle, marginX + 2, y + 3);
          y += 8;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.2);
          doc.setTextColor(55, 65, 81);
          writeParagraph(`Original Name: ${file.originalName}`);
          writeParagraph(`Mime Type: ${file.mimeType}`);
          writeParagraph(`Size: ${formatFileSize(file.size)} | Uploaded: ${file.uploadedAt ? format(new Date(file.uploadedAt), 'yyyy-MM-dd HH:mm:ss') : '--'}`);
          if (file.notes) writeParagraph(`Notes: ${file.notes}`);

          if (file.mimeType.startsWith('image/')) {
            const imageUrl = buildUploadUrl(file.path);
            const imageData = await loadImageData(imageUrl);

            if (imageData) {
              const imageMaxWidth = contentWidth - 4;
              const imageMaxHeight = 70;
              const widthRatio = imageMaxWidth / imageData.width;
              const heightRatio = imageMaxHeight / imageData.height;
              const ratio = Math.min(widthRatio, heightRatio, 1);
              const renderWidth = imageData.width * ratio;
              const renderHeight = imageData.height * ratio;

              ensureSpace(renderHeight + 6);
              doc.addImage(imageData.dataUrl, 'JPEG', marginX + 2, y, renderWidth, renderHeight);
              y += renderHeight + 3;
            } else {
              writeParagraph('Image preview unavailable in PDF export.');
            }
          }

          y += 1;
        }
      }

      doc.save(`patient-dossier-report-${displayMrn}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
    } catch (error) {
      console.error('Failed to export dossier PDF:', error);
      setDossierError('Failed to export dossier PDF.');
    }
  };

  const resetEventDraft = () => {
    setEditingEventId(null);
    setShowEventModal(false);
    setEventDraft({
      type: 'note',
      severity: 'normal',
      title: '',
      description: '',
      reason: '',
      details: '',
      notesText: '',
      actor: '',
      eventTime: new Date().toISOString().slice(0, 16),
    });
  };

  const handleSubmitEvent = async () => {
    if (!id) return;
    if (!eventDraft.title.trim() || !eventDraft.description.trim()) return;

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
      eventTime: eventDraft.eventTime ? new Date(eventDraft.eventTime).toISOString() : undefined,
    };

    try {
      setEventCrudLoading(true);
      if (editingEventId) {
        await api.put(`/patients/${id}/events/${editingEventId}`, payload);
      } else {
        await api.post(`/patients/${id}/events`, payload);
      }
      await fetchPatientEvents();
      resetEventDraft();
    } catch (error) {
      console.error('Failed to save patient event:', error);
    } finally {
      setEventCrudLoading(false);
    }
  };

  const handleEditEvent = (event: PatientTimelineEvent) => {
    setEditingEventId(event._id);
    setShowEventModal(true);
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
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!id) return;
    try {
      setEventCrudLoading(true);
      await api.delete(`/patients/${id}/events/${eventId}`);
      await fetchPatientEvents();
      if (editingEventId === eventId) {
        resetEventDraft();
      }
    } catch (error) {
      console.error('Failed to delete patient event:', error);
    } finally {
      setEventCrudLoading(false);
    }
  };

  const handleOpenAddEvent = () => {
    resetEventDraft();
    setShowEventModal(true);
  };

  const handleOpenEventSelection = (mode: 'edit' | 'delete') => {
    setEventSelectionMode(mode);
  };

  const handleSelectEventForAction = async (event: PatientTimelineEvent) => {
    if (eventSelectionMode === 'edit') {
      setEventSelectionMode(null);
      handleEditEvent(event);
      return;
    }

    if (eventSelectionMode === 'delete') {
      await handleDeleteEvent(event._id);
      setEventSelectionMode(null);
    }
  };

  const heartSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.heartRate) || 0 }))
      .filter((point) => point.value > 0);

    return trend;
  }, [vitalSigns]);

  const glucoseSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({
        index,
        value: Number(vital.glucose) || 0,
      }))
      .filter((point) => point.value > 0);

    return trend;
  }, [vitalSigns]);

  const temperatureSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.temperature) || 0 }))
      .filter((point) => point.value > 0);

    return trend;
  }, [vitalSigns]);

  const sleepComputation = useMemo(() => {
    return computeSleepFromVitals(vitalSigns, rangeHoursMap[selectedRange]);
  }, [vitalSigns, selectedRange]);

  const sleepSeries = useMemo<TrendPoint[]>(() => {
    return sleepComputation.series;
  }, [sleepComputation.series]);

  const oxygenSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.spO2) || 0 }))
      .filter((point) => point.value > 0);

    return trend;
  }, [vitalSigns]);

  const ecgSeries = useMemo<TrendPoint[]>(() => {
    const fallback = [0.1, 0.2, 0.15, 1.5, -0.5, 0.25, 0.1, 0.2, 0.15, 1.4, -0.45, 0.25, 0.1];

    return fallback.map((value, index) => ({ index, value }));
  }, []);

  const temperature = toNumberOrUndefined(latestVitals.temperature);
  const heartRate = toNumberOrUndefined(latestVitals.heartRate);
  const glucoseLevel = toNumberOrUndefined(latestVitals.glucose);
  const oxygenSaturation = toNumberOrUndefined(latestVitals.spO2);
  const sleepHours = sleepComputation.totalSleepHours;
  const safeHeartRate = heartRate ?? 0;
  const safeOxygenSaturation = oxygenSaturation ?? 0;
  const sleepProgress = Math.min(100, Math.round(sleepComputation.sleepEfficiency));
  const computedAge = computeAge(patient?.dateOfBirth);
  const displayMrn = patient?.medicalRecordNumber || patient?._id || patient?.id || '--';
  const dynamicStatus = deriveLiveStatus(
    {
      heartRate,
      temperature,
      spO2: oxygenSaturation,
      glucose: glucoseLevel,
    },
    patient?.status
  );

  const statusBadgeClass =
    dynamicStatus === 'CRITICAL'
      ? 'bg-red-100 text-red-700'
      : dynamicStatus === 'MODERATE'
      ? 'bg-yellow-100 text-yellow-700'
      : dynamicStatus === 'RECOVERING'
      ? 'bg-emerald-100 text-emerald-700'
      : dynamicStatus === 'DISCHARGED'
      ? 'bg-slate-200 text-slate-700'
      : 'bg-green-100 text-green-700';

  const bodyMetricConfig = {
    temperature: {
      label: tr('Temperature', 'Temperature'),
      value: temperature !== undefined ? `${temperature.toFixed(1)} °C` : '--',
      unit: '°C',
      normalRange: '36.5 - 37.5 °C',
      color: '#b45309',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-100',
      textClass: 'text-amber-700',
      series: temperatureSeries,
    },
    heartRate: {
      label: tr('Heart Rate', 'Frequence cardiaque'),
      value: heartRate !== undefined ? `${heartRate} bpm` : '--',
      unit: 'bpm',
      normalRange: '60 - 100 bpm',
      color: '#be123c',
      bgClass: 'bg-rose-50',
      borderClass: 'border-rose-100',
      textClass: 'text-rose-700',
      series: heartSeries,
    },
    glucose: {
      label: tr('Glucose', 'Glucose'),
      value: glucoseLevel !== undefined ? `${glucoseLevel} mg/dL` : '--',
      unit: 'mg/dL',
      normalRange: '70 - 140 mg/dL',
      color: '#0369a1',
      bgClass: 'bg-sky-50',
      borderClass: 'border-sky-100',
      textClass: 'text-sky-700',
      series: glucoseSeries,
    },
    sleep: {
      label: tr('Sleep', 'Sommeil'),
      value: `${sleepHours.toFixed(1)} h`,
      unit: 'h',
      normalRange: '7 - 9 h',
      color: '#4338ca',
      bgClass: 'bg-indigo-50',
      borderClass: 'border-indigo-100',
      textClass: 'text-indigo-700',
      series: sleepSeries,
    },
  } as const;

  const activeBodyMetricConfig = bodyMetricConfig[activeBodyMetric];

  const rangePointMap = {
    '1h': 6,
    '6h': 12,
    '24h': 24,
    '7d': 28,
  } as const;

  const rangedActiveSeries = useMemo(() => {
    const desiredPoints = rangePointMap[selectedRange];
    const series = activeBodyMetricConfig.series;

    return series.length > desiredPoints ? series.slice(series.length - desiredPoints) : series;
  }, [activeBodyMetricConfig.series, selectedRange]);

  useEffect(() => {
    if (isLiveTracking) {
      setLiveSeries(rangedActiveSeries);
    }
  }, [rangedActiveSeries, activeBodyMetric]);

  useEffect(() => {
    if (!isLiveTracking) {
      return;
    }
    setLiveSeries(rangedActiveSeries);
    if (!lastLiveUpdate && rangedActiveSeries.length > 0) {
      setLastLiveUpdate(new Date());
    }
  }, [isLiveTracking, rangedActiveSeries, lastLiveUpdate]);

  const displayedSeries = isLiveTracking ? rangedActiveSeries : liveSeries;

  const activeMetricStats = useMemo(() => {
    if (displayedSeries.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        current: 0,
        delta: 0,
      };
    }

    const values = displayedSeries.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const current = values[values.length - 1];
    const previous = values[values.length - 2] ?? current;
    const delta = current - previous;

    return {
      min,
      max,
      avg,
      current,
      delta,
    };
  }, [displayedSeries]);

  const filteredTimelineEvents = useMemo(() => {
    const mapped = timelineEvents.map((event) => ({
      ...event,
      time: event.eventTime ? new Date(event.eventTime) : new Date(),
      id: event._id,
    }));

    const typeFiltered =
      eventFilter === 'all' ? mapped : mapped.filter((event) => event.type === eventFilter);

    if (timelineDateFilterMode === 'all_time') {
      return typeFiltered;
    }

    if (!timelineSelectedDate) {
      return typeFiltered;
    }

    const selectedDay = new Date(`${timelineSelectedDate}T00:00:00`);
    if (!Number.isFinite(selectedDay.getTime())) {
      return typeFiltered;
    }

    const dayStart = new Date(selectedDay);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDay);
    dayEnd.setHours(23, 59, 59, 999);

    return typeFiltered.filter((event) => event.time >= dayStart && event.time <= dayEnd);
  }, [eventFilter, timelineDateFilterMode, timelineSelectedDate, timelineEvents]);

  const aiAlerts = useMemo(() => {
    return Array.isArray(aiAnalysis?.alerts) ? aiAnalysis.alerts : [];
  }, [aiAnalysis]);

  const aiRecommendations = useMemo(() => {
    return Array.isArray(aiAnalysis?.recommendations) ? aiAnalysis.recommendations : [];
  }, [aiAnalysis]);

  const sensorStates = useMemo(
    () => [
      {
        name: 'Cardiac Sensor',
        status: 'online',
        battery: 86,
        signal: 92,
      },
      {
        name: 'Oximeter',
        status: safeOxygenSaturation < 92 ? 'offline' : 'online',
        battery: 64,
        signal: safeOxygenSaturation < 92 ? 0 : 78,
      },
      {
        name: 'Glucose Patch',
        status: 'online',
        battery: 49,
        signal: 73,
      },
    ],
    [safeOxygenSaturation]
  );

  const comparisonInsights = useMemo(() => {
    const yesterdayHeartAvg = Math.max(safeHeartRate - 8, 75);
    const previousShiftHeartAvg = Math.max(safeHeartRate - 5, 78);
    const todayVsYesterday = ((safeHeartRate - yesterdayHeartAvg) / yesterdayHeartAvg) * 100;
    const shiftVsShift = ((safeHeartRate - previousShiftHeartAvg) / previousShiftHeartAvg) * 100;

    return {
      todayVsYesterday,
      shiftVsShift,
      yesterdayHeartAvg,
      previousShiftHeartAvg,
    };
  }, [safeHeartRate]);

  const eventTypeStyles = {
    alert: 'bg-rose-50 text-rose-700 border-rose-200',
    medication: 'bg-sky-50 text-sky-700 border-sky-200',
    intervention: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    procedure: 'bg-violet-50 text-violet-700 border-violet-200',
    note: 'bg-amber-50 text-amber-700 border-amber-200',
    ai_insight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  } as const;

  const severityDotStyles = {
    critical: 'bg-rose-600',
    warning: 'bg-amber-500',
    normal: 'bg-emerald-500',
  } as const;

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
          <p className="text-gray-600">{tr('Patient not found', 'Patient introuvable')}</p>
        </div>
      </div>
    );
  }

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
              {tr('MRN', 'DMP')}: {displayMrn} • {tr('Age', 'Age')}: {computedAge ?? '--'} • {tr('Gender', 'Genre')}: {patient.gender ?? '--'}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-full font-semibold ${statusBadgeClass}`}>
            {dynamicStatus}
          </div>
        </div>
      </div>

      

      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Thermometer className="w-5 h-5 text-amber-700" />}
            label="Temperature"
            value={temperature !== undefined ? temperature.toFixed(1) : '--'}
            unit="°C"
            accentClass="bg-amber-100"
          />
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Heart className="w-5 h-5 text-rose-700" />}
            label="Heart Rate"
            value={heartRate ?? '--'}
            unit="bpm"
            accentClass="bg-rose-100"
          >
            <div className="mt-3 h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={heartSeries}>
                  <Line type="monotone" dataKey="value" stroke="#e11d48" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2">{tr('ECG-style trend', 'Tendance style ECG')}</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Droplets className="w-5 h-5 text-sky-700" />}
            label="Glucose Level"
            value={glucoseLevel ?? '--'}
            unit="mg/dL"
            accentClass="bg-sky-100"
          >
            <div className="mt-3 h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={glucoseSeries}>
                  <Line type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2">{tr('Trend line', 'Courbe de tendance')}</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Wind className="w-5 h-5 text-cyan-700" />}
            label="Oxygen"
            value={oxygenSaturation ?? '--'}
            unit="%"
            accentClass="bg-cyan-100"
          >
            <div className="mt-3 h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oxygenSeries}>
                  <Line type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2">SpO2 trend</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Activity className="w-5 h-5 text-red-700" />}
            label="ECG"
            value={heartRate ?? '--'}
            unit="bpm"
            accentClass="bg-red-100"
          >
            <div className="mt-3 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ecgSeries}>
                  <Line type="linear" dataKey="value" stroke="#dc2626" strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2">{tr('Live ECG waveform', 'Onde ECG en direct')}</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Moon className="w-5 h-5 text-indigo-700" />}
            label="Sleep Time"
            value={sleepHours.toFixed(1)}
            unit="hours"
            accentClass="bg-indigo-100"
          >
            <div className="mt-3">
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${sleepProgress}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-8 gap-1">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded ${index < Math.round(sleepHours) ? 'bg-indigo-400' : 'bg-gray-200'}`}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">{tr('Sleep timeline (target: 8h)', 'Chronologie de sommeil (objectif: 8h)')}</p>
          </MetricCard>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{tr('Human Body Visualization', 'Visualisation du corps humain')}</h3>
        <p className="text-sm text-gray-600 mb-4">{tr('Visual overview of the patient body status using picture mode.', 'Vue visuelle de etat du corps du patient avec mode image.')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">{tr('Range', 'Plage')}:</span>
            {(['1h', '6h', '24h', '7d'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setSelectedRange(range)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedRange === range
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLiveTracking((prev) => !prev)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                isLiveTracking
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {isLiveTracking ? tr('Live ON', 'Direct ON') : tr('Live OFF', 'Direct OFF')}
            </button>
            <span className="text-xs text-gray-500">
              {isLiveTracking
                ? `${tr('Last update', 'Derniere mise a jour')}: ${lastLiveUpdate ? format(lastLiveUpdate, 'HH:mm:ss') : tr('waiting...', 'en attente...')}`
                : tr('Real-time paused', 'Temps reel en pause')}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <img
              src="/assets/pictures/humain3D.png"
              alt="Human body visualization"
              className="w-full h-auto object-contain"
            />
          </div>
          <div className="space-y-4">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {(Object.keys(bodyMetricConfig) as Array<keyof typeof bodyMetricConfig>).map((metricKey) => {
                const metric = bodyMetricConfig[metricKey];
                const isActive = activeBodyMetric === metricKey;

                return (
                  <button
                    key={metricKey}
                    type="button"
                    onClick={() => setActiveBodyMetric(metricKey)}
                    className={`min-w-[155px] flex-1 rounded-lg p-3 border text-left transition-all ${metric.bgClass} ${metric.borderClass} ${
                      isActive ? 'ring-2 ring-offset-1 shadow-sm' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: metric.color,
                            boxShadow: `0 0 0 2px ${metric.color}33`,
                          }
                        : undefined
                    }
                  >
                    <div className="text-gray-700 font-medium">{metric.label}</div>
                    <div className={`font-semibold ${metric.textClass}`}>{metric.value}</div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{activeBodyMetricConfig.label} {tr('Curve', 'Courbe')}</span>
                <span className={`text-sm font-semibold ${activeBodyMetricConfig.textClass}`}>{activeBodyMetricConfig.value}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                  {tr('Normal', 'Normal')}: {activeBodyMetricConfig.normalRange}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                  {tr('Window', 'Fenetre')}: {tr('Last', 'Derniers')} {displayedSeries.length} {tr('points', 'points')} ({selectedRange})
                </span>
                {isLiveTracking && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 font-medium">
                    {tr('Following in real time', 'Suivi en temps reel')}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 font-medium ${activeMetricStats.delta >= 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {tr('Trend', 'Tendance')}: {activeMetricStats.delta >= 0 ? '+' : ''}{activeMetricStats.delta.toFixed(2)} {activeBodyMetricConfig.unit}
                </span>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="index"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickFormatter={(value) => `T${Number(value) + 1}`}
                      axisLine={{ stroke: '#d1d5db' }}
                      tickLine={{ stroke: '#d1d5db' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      width={42}
                      axisLine={{ stroke: '#d1d5db' }}
                      tickLine={{ stroke: '#d1d5db' }}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${Number(value).toFixed(2)} ${activeBodyMetricConfig.unit}`, activeBodyMetricConfig.label]}
                      labelFormatter={(label) => `Time Point: T${Number(label) + 1}`}
                      contentStyle={{
                        borderRadius: '10px',
                        borderColor: '#e5e7eb',
                        boxShadow: '0 10px 20px rgba(0,0,0,0.08)'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={activeBodyMetricConfig.color}
                      strokeWidth={2.5}
                      dot={{ r: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Current</p>
                  <p className="text-sm font-semibold text-gray-900">{activeMetricStats.current.toFixed(2)} {activeBodyMetricConfig.unit}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Average</p>
                  <p className="text-sm font-semibold text-gray-900">{activeMetricStats.avg.toFixed(2)} {activeBodyMetricConfig.unit}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Min</p>
                  <p className="text-sm font-semibold text-gray-900">{activeMetricStats.min.toFixed(2)} {activeBodyMetricConfig.unit}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Max</p>
                  <p className="text-sm font-semibold text-gray-900">{activeMetricStats.max.toFixed(2)} {activeBodyMetricConfig.unit}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">AI Clinical Analysis</h3>
            <button
              type="button"
              onClick={() => fetchAiAnalysis()}
              className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700"
            >
              {aiLoading ? 'Refreshing...' : 'Refresh AI'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            AI models (Isolation Forest, Random Forest, Logistic Regression, LSTM) analyze live/simulated vitals and generate alerts, predictions, and recommendations.
          </p>

          {aiError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 mb-3">
              {aiError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Anomaly</p>
              <p className="text-sm font-semibold text-gray-900">
                {aiAnalysis?.models?.anomaly?.is_anomaly ? 'Detected' : 'Not detected'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Score: {Number(aiAnalysis?.models?.anomaly?.anomaly_score || 0).toFixed(3)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Status Classification</p>
              <p className="text-sm font-semibold text-gray-900">
                {aiAnalysis?.models?.status?.status || 'N/A'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Confidence: {(Number(aiAnalysis?.models?.status?.confidence || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Cardiac Risk</p>
              <p className="text-sm font-semibold text-gray-900">
                {aiAnalysis?.models?.cardiac?.risk_level || 'N/A'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {aiAnalysis?.models?.cardiac?.risk_percentage || 'No probability'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Respiratory Forecast</p>
              <p className="text-sm font-semibold text-gray-900">
                {Number(aiAnalysis?.models?.respiratory?.predicted_spo2 || 0).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Horizon: {aiAnalysis?.models?.respiratory?.horizon_minutes || 30} min
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {aiAlerts.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                No AI alerts generated.
              </div>
            ) : (
              aiAlerts.map((alert: any, index: number) => (
                <div key={`${alert?.type || 'alert'}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{alert?.message || 'AI alert'}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${String(alert?.severity || '').toUpperCase() === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : String(alert?.severity || '').toUpperCase() === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                      {String(alert?.severity || 'MEDIUM').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{alert?.description || 'No details available'}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-indigo-700 mb-2">AI Recommendations</p>
            <ul className="list-disc pl-4 space-y-1 text-sm text-indigo-900">
              {aiRecommendations.length === 0 ? (
                <li>No recommendation available yet.</li>
              ) : (
                aiRecommendations.map((recommendation: string, idx: number) => (
                  <li key={`ai-rec-${idx}`}>{recommendation}</li>
                ))
              )}
            </ul>
            <p className="text-[11px] text-indigo-600 mt-2">
              Last AI refresh: {aiLastRefresh ? format(aiLastRefresh, 'HH:mm:ss') : 'never'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Sensor Connectivity</h3>
          <div className="space-y-3">
            {sensorStates.map((sensor) => (
              <div key={sensor.name} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-800">{sensor.name}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sensor.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {sensor.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <p>Battery: {sensor.battery}%</p>
                  <p>Signal Quality: {sensor.signal}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Today vs Yesterday</h3>
          <p className="text-sm text-gray-600">Heart Rate Today: <span className="font-semibold text-gray-900">{heartRate} bpm</span></p>
          <p className="text-sm text-gray-600">Heart Rate Yesterday Avg: <span className="font-semibold text-gray-900">{comparisonInsights.yesterdayHeartAvg.toFixed(0)} bpm</span></p>
          <p className={`text-sm font-semibold mt-2 ${comparisonInsights.todayVsYesterday >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            Delta: {comparisonInsights.todayVsYesterday >= 0 ? '+' : ''}{comparisonInsights.todayVsYesterday.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Current Shift vs Previous Shift</h3>
          <p className="text-sm text-gray-600">Current Shift HR: <span className="font-semibold text-gray-900">{heartRate} bpm</span></p>
          <p className="text-sm text-gray-600">Previous Shift Avg HR: <span className="font-semibold text-gray-900">{comparisonInsights.previousShiftHeartAvg.toFixed(0)} bpm</span></p>
          <p className={`text-sm font-semibold mt-2 ${comparisonInsights.shiftVsShift >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            Delta: {comparisonInsights.shiftVsShift >= 0 ? '+' : ''}{comparisonInsights.shiftVsShift.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Patient Dossier</h3>
            <p className="text-sm text-gray-600">
              Upload and manage exam files (IRM, scanner, reports, lab docs) and export a PDF summary.
            </p>
          </div>
          <div className="flex items-center gap-2 md:self-start">
            <button
              type="button"
              title="Add Dossier File"
              aria-label="Add Dossier File"
              className="h-10 px-3 rounded-full border border-gray-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
              onClick={() => setShowDossierModal(true)}
              disabled={dossierActionLoading}
            >
              <FileUp className="w-4 h-4" />
              <span className="text-xs font-semibold">Add file</span>
            </button>
            <button
              type="button"
              title="Export Dossier PDF"
              aria-label="Export Dossier PDF"
              className="h-10 px-3 rounded-full border border-gray-200 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
              onClick={() => {
                void handleExportDossierPdf();
              }}
              disabled={dossierActionLoading}
            >
              <Download className="w-4 h-4" />
              <span className="text-xs font-semibold">Export PDF</span>
            </button>
          </div>
        </div>

        {dossierError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 mb-3">
            {dossierError}
          </div>
        )}

        {dossierLoading ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Loading dossier files...
          </div>
        ) : dossierFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No dossier files yet. Add your first IRM/report file.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {dossierFiles.map((file) => {
              const fileUrl = buildUploadUrl(file.path);
              const isImage = file.mimeType.startsWith('image/');

              return (
                <div key={file._id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200">
                      {String(file.category).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-full border border-gray-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center justify-center"
                      title="Delete file"
                      aria-label="Delete file"
                      disabled={dossierActionLoading}
                      onClick={() => {
                        void handleDeleteDossierFile(file._id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {isImage ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="block rounded-md overflow-hidden border border-gray-200 mb-2">
                      <img src={fileUrl} alt={file.label || file.originalName} className="w-full h-40 object-cover" />
                    </a>
                  ) : (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-gray-200 bg-white h-40 flex flex-col items-center justify-center text-gray-600 mb-2"
                    >
                      <FolderOpen className="w-7 h-7 mb-2" />
                      <span className="text-xs font-medium">Open file</span>
                    </a>
                  )}

                  <p className="text-sm font-semibold text-gray-900 truncate" title={file.label || file.originalName}>
                    {file.label || file.originalName}
                  </p>
                  <p className="text-xs text-gray-600 truncate" title={file.originalName}>{file.originalName}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatFileSize(file.size)} • {format(new Date(file.uploadedAt), 'PPp')}</p>
                  {file.notes && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{file.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Timeline + Events</h3>
            <p className="text-sm text-gray-600">Chronological patient activity feed for alerts, actions, medication, procedures, and notes.</p>
          </div>
          <div className="flex items-center gap-2 md:self-start">
            <button
              type="button"
              title="Add Event"
              aria-label="Add Event"
              className="h-10 w-10 rounded-full border border-gray-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-center"
              onClick={handleOpenAddEvent}
              disabled={eventCrudLoading}
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              type="button"
              title="Edit Event"
              aria-label="Edit Event"
              className="h-10 w-10 rounded-full border border-gray-200 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center justify-center"
              onClick={() => handleOpenEventSelection('edit')}
              disabled={eventCrudLoading || timelineEvents.length === 0}
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              type="button"
              title="Delete Event"
              aria-label="Delete Event"
              className="h-10 w-10 rounded-full border border-gray-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center justify-center"
              onClick={() => handleOpenEventSelection('delete')}
              disabled={eventCrudLoading || timelineEvents.length === 0}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'alert', 'intervention', 'medication', 'procedure', 'note', 'ai_insight'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setEventFilter(filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                eventFilter === filter
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-600">Date:</span>
          <button
            type="button"
            onClick={() => setTimelineDateFilterMode('all_time')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              timelineDateFilterMode === 'all_time'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All time
          </button>
          <button
            type="button"
            onClick={() => setTimelineDateFilterMode('day')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              timelineDateFilterMode === 'day'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Choose day
          </button>

          {timelineDateFilterMode === 'day' && (
            <input
              type="date"
              className="input !py-1.5 !text-xs min-w-[165px]"
              value={timelineSelectedDate}
              onChange={(e) => setTimelineSelectedDate(e.target.value)}
            />
          )}

          {timelineDateFilterMode === 'day' && timelineSelectedDate && (
            <button
              type="button"
              className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              onClick={() => setTimelineSelectedDate('')}
            >
              Clear date
            </button>
          )}
        </div>

        <div className="space-y-4">
          {filteredTimelineEvents.map((event, index) => (
            <div key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${severityDotStyles[event.severity as keyof typeof severityDotStyles]}`} />
                {index < filteredTimelineEvents.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-2" />}
              </div>

              <button
                type="button"
                onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${eventTypeStyles[event.type as keyof typeof eventTypeStyles]}`}>
                      {event.type.toUpperCase()}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-900">{event.title}</h4>
                  </div>
                  <span className="text-xs text-gray-500">{format(event.time, 'PPp')}</span>
                </div>
                <p className="text-sm text-gray-700">{event.description}</p>
                <p className="text-xs text-indigo-700 mt-2 font-medium">{event.reason}</p>
                <p className="text-xs text-gray-500 mt-2">By: {event.actor}</p>

                {expandedEventId === event.id && (
                  <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Details</p>
                    <p className="text-xs text-gray-600">{event.details}</p>
                    <p className="text-xs font-semibold text-gray-700 mt-2 mb-1">Notes</p>
                    <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1">
                      {event.notes.map((note: string, noteIdx: number) => (
                        <li key={`${event.id}-note-${noteIdx}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </button>
            </div>
          ))}

          {filteredTimelineEvents.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No events found for this filter.
            </div>
          )}
        </div>
      </div>

      {showDossierModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-xl border border-gray-200 shadow-xl p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-gray-900">Add Dossier File</h4>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={resetDossierDraft}
                disabled={dossierActionLoading}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <select
                className="input"
                value={dossierDraft.category}
                onChange={(e) => setDossierDraft((prev) => ({ ...prev, category: e.target.value as DossierCategory }))}
              >
                <option value="irm">irm</option>
                <option value="scanner">scanner</option>
                <option value="radiology">radiology</option>
                <option value="lab">lab</option>
                <option value="prescription">prescription</option>
                <option value="report">report</option>
                <option value="other">other</option>
              </select>

              <input
                className="input"
                placeholder="Label (example: IRM Brain 2026-04-09)"
                value={dossierDraft.label}
                onChange={(e) => setDossierDraft((prev) => ({ ...prev, label: e.target.value }))}
              />

              <textarea
                className="input min-h-[90px]"
                placeholder="Notes"
                value={dossierDraft.notes}
                onChange={(e) => setDossierDraft((prev) => ({ ...prev, notes: e.target.value }))}
              />

              <input
                className="input"
                type="file"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] || null;
                  setDossierDraft((prev) => ({ ...prev, file: selectedFile }));
                }}
              />
              <p className="text-xs text-gray-500">Accepted: images, PDF, and common clinical document formats.</p>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetDossierDraft}
                disabled={dossierActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={dossierActionLoading || !dossierDraft.file}
                onClick={() => {
                  void handleUploadDossierFile();
                }}
              >
                Upload File
              </button>
            </div>
          </div>
        </div>
      )}

      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-xl p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-gray-900">
                {editingEventId ? 'Edit Event' : 'Add Event'}
              </h4>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={resetEventDraft}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="input"
                value={eventDraft.type}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, type: e.target.value as EventType }))}
              >
                <option value="alert">alert</option>
                <option value="intervention">intervention</option>
                <option value="medication">medication</option>
                <option value="procedure">procedure</option>
                <option value="note">note</option>
                <option value="ai_insight">ai_insight</option>
              </select>
              <select
                className="input"
                value={eventDraft.severity}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, severity: e.target.value as EventSeverity }))}
              >
                <option value="normal">normal</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
              <input
                className="input"
                placeholder="Title"
                value={eventDraft.title}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Actor"
                value={eventDraft.actor}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, actor: e.target.value }))}
              />
              <input
                className="input md:col-span-2"
                placeholder="Description"
                value={eventDraft.description}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, description: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Reason"
                value={eventDraft.reason}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, reason: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Details"
                value={eventDraft.details}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, details: e.target.value }))}
              />
              <input
                className="input md:col-span-2"
                placeholder="Notes (comma separated)"
                value={eventDraft.notesText}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, notesText: e.target.value }))}
              />
              <input
                className="input"
                type="datetime-local"
                value={eventDraft.eventTime}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, eventTime: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetEventDraft}
                disabled={eventCrudLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={eventCrudLoading || !eventDraft.title.trim() || !eventDraft.description.trim()}
                onClick={() => {
                  void handleSubmitEvent();
                }}
              >
                {editingEventId ? 'Update Event' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {eventSelectionMode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-xl p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-gray-900">
                {eventSelectionMode === 'edit' ? 'Select Event To Edit' : 'Select Event To Delete'}
              </h4>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEventSelectionMode(null)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {timelineEvents.map((event) => (
                <button
                  key={event._id}
                  type="button"
                  className="w-full text-left rounded-lg border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    void handleSelectEventForAction(event);
                  }}
                  disabled={eventCrudLoading}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-600 truncate">{event.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${eventTypeStyles[event.type as keyof typeof eventTypeStyles]}`}>
                      {event.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{format(new Date(event.eventTime), 'PPp')}</p>
                </button>
              ))}

              {timelineEvents.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                  No events available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
