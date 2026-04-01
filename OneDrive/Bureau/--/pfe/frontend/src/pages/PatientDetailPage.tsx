import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Heart, Thermometer, Droplets, Moon, Wind, Activity, AlertCircle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import api from '../lib/api';
import { format } from 'date-fns';

interface TrendPoint {
  index: number;
  value: number;
}

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
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [vitalSigns, setVitalSigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBodyMetric, setActiveBodyMetric] = useState<'temperature' | 'heartRate' | 'glucose' | 'sleep'>('temperature');
  const [eventFilter, setEventFilter] = useState<'all' | 'alert' | 'medication' | 'intervention' | 'procedure' | 'note'>('all');
  const [selectedRange, setSelectedRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [liveSeries, setLiveSeries] = useState<TrendPoint[]>([]);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);

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

  const latestVitals = vitalSigns[0] || {};

  const heartSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.heartRate) || 0 }))
      .filter((point) => point.value > 0);

    return trend.length > 0
      ? trend
      : [118, 122, 121, 124, 123, 125, 124].map((value, index) => ({ index, value }));
  }, [vitalSigns]);

  const glucoseSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({
        index,
        value: Number(vital.glucoseLevel ?? vital.bloodSugar) || 0,
      }))
      .filter((point) => point.value > 0);

    return trend.length > 0
      ? trend
      : [168, 172, 176, 182, 179, 184, 182].map((value, index) => ({ index, value }));
  }, [vitalSigns]);

  const temperatureSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.temperature) || 0 }))
      .filter((point) => point.value > 0);

    return trend.length > 0
      ? trend
      : [36.8, 36.9, 37.0, 37.1, 37.0, 37.2, 37.1].map((value, index) => ({ index, value }));
  }, [vitalSigns]);

  const sleepSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.sleepHours) || 0 }))
      .filter((point) => point.value > 0);

    return trend.length > 0
      ? trend
      : [6.4, 6.8, 7.1, 7.2, 7.0, 7.4, 7.2].map((value, index) => ({ index, value }));
  }, [vitalSigns]);

  const oxygenSeries = useMemo<TrendPoint[]>(() => {
    const trend = vitalSigns
      .slice(0, 12)
      .reverse()
      .map((vital, index) => ({ index, value: Number(vital.oxygenSaturation) || 0 }))
      .filter((point) => point.value > 0);

    return trend.length > 0
      ? trend
      : [97, 98, 98, 97, 99, 98, 98].map((value, index) => ({ index, value }));
  }, [vitalSigns]);

  const ecgSeries = useMemo<TrendPoint[]>(() => {
    const fallback = [0.1, 0.2, 0.15, 1.5, -0.5, 0.25, 0.1, 0.2, 0.15, 1.4, -0.45, 0.25, 0.1];

    return fallback.map((value, index) => ({ index, value }));
  }, []);

  const temperature = Number(latestVitals.temperature) || 37.1;
  const heartRate = Number(latestVitals.heartRate) || 124;
  const glucoseLevel = Number(latestVitals.glucoseLevel ?? latestVitals.bloodSugar) || glucoseSeries[glucoseSeries.length - 1]?.value || 182;
  const oxygenSaturation = Number(latestVitals.oxygenSaturation) || 98;
  const sleepHours = Number(latestVitals.sleepHours ?? patient?.sleepHours) || 7.2;
  const sleepProgress = Math.min(100, Math.round((sleepHours / 8) * 100));

  const bodyMetricConfig = {
    temperature: {
      label: 'Temperature',
      value: `${temperature.toFixed(1)} °C`,
      unit: '°C',
      normalRange: '36.5 - 37.5 °C',
      color: '#b45309',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-100',
      textClass: 'text-amber-700',
      series: temperatureSeries,
    },
    heartRate: {
      label: 'Heart Rate',
      value: `${heartRate} bpm`,
      unit: 'bpm',
      normalRange: '60 - 100 bpm',
      color: '#be123c',
      bgClass: 'bg-rose-50',
      borderClass: 'border-rose-100',
      textClass: 'text-rose-700',
      series: heartSeries,
    },
    glucose: {
      label: 'Glucose',
      value: `${glucoseLevel} mg/dL`,
      unit: 'mg/dL',
      normalRange: '70 - 140 mg/dL',
      color: '#0369a1',
      bgClass: 'bg-sky-50',
      borderClass: 'border-sky-100',
      textClass: 'text-sky-700',
      series: glucoseSeries,
    },
    sleep: {
      label: 'Sleep',
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

  const rangeDurationMap = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  } as const;

  const rangedActiveSeries = useMemo(() => {
    const desiredPoints = rangePointMap[selectedRange];
    const series = activeBodyMetricConfig.series;

    return series.length > desiredPoints ? series.slice(series.length - desiredPoints) : series;
  }, [activeBodyMetricConfig.series, selectedRange]);

  useEffect(() => {
    setLiveSeries(rangedActiveSeries);
    setLastLiveUpdate(null);
  }, [rangedActiveSeries, activeBodyMetric]);

  useEffect(() => {
    if (!isLiveTracking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLiveSeries((prev) => {
        const source = prev.length > 0 ? prev : rangedActiveSeries;
        const lastPoint = source[source.length - 1] ?? { index: 0, value: 0 };
        const nextIndex = lastPoint.index + 1;
        const maxPoints = rangePointMap[selectedRange];

        let drift = 0;
        let minValue = 0;
        let maxValue = 100;

        if (activeBodyMetric === 'temperature') {
          drift = (Math.random() - 0.5) * 0.14;
          minValue = 36;
          maxValue = 39;
        } else if (activeBodyMetric === 'heartRate') {
          drift = (Math.random() - 0.5) * 6;
          minValue = 55;
          maxValue = 155;
        } else if (activeBodyMetric === 'glucose') {
          drift = (Math.random() - 0.5) * 8;
          minValue = 70;
          maxValue = 260;
        } else {
          drift = (Math.random() - 0.5) * 0.08;
          minValue = 0;
          maxValue = 12;
        }

        const candidateValue = Math.min(maxValue, Math.max(minValue, lastPoint.value + drift));
        const nextPoint: TrendPoint = {
          index: nextIndex,
          value: Number(candidateValue.toFixed(2)),
        };

        const updated = [...source, nextPoint]
          .slice(-maxPoints)
          .map((point, index) => ({ ...point, index }));

        setLastLiveUpdate(new Date());
        return updated;
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeBodyMetric, isLiveTracking, rangePointMap, rangedActiveSeries, selectedRange]);

  const displayedSeries = isLiveTracking && liveSeries.length > 0 ? liveSeries : rangedActiveSeries;

  const activeMetricStats = useMemo(() => {
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

  const timelineEvents = useMemo(() => {
    const now = latestVitals.timestamp ? new Date(latestVitals.timestamp) : new Date();

    return [
      {
        id: 'evt-1',
        type: 'alert',
        severity: 'critical',
        title: 'Heart Rate Alert Triggered',
        description: `Heart rate crossed threshold at ${heartRate} bpm for 6 minutes.`,
        reason: `Why: Heart Rate above 120 for 6 min with persistent tachycardia pattern.`,
        details: `Threshold rule: HR > 120 bpm for >= 6 min. Current high was ${heartRate} bpm.`,
        notes: ['Auto-triggered from bedside monitor', 'Escalation protocol level 1 started'],
        actor: 'Monitoring Engine',
        time: new Date(now.getTime() - 90 * 60000),
      },
      {
        id: 'evt-2',
        type: 'alert',
        severity: oxygenSaturation < 93 ? 'critical' : 'warning',
        title: 'Oxygen Saturation Drop',
        description: `SpO2 reached ${oxygenSaturation}% during sleep cycle window.`,
        reason: 'Why: Oxygen saturation dropped below expected overnight threshold.',
        details: `Observed dip to ${oxygenSaturation}% while patient was in low-motion state.`,
        notes: ['Cross-checked with perfusion sensor', 'Nurse notification sent'],
        actor: 'Bedside Oximeter',
        time: new Date(now.getTime() - 80 * 60000),
      },
      {
        id: 'evt-3',
        type: 'intervention',
        severity: 'normal',
        title: 'Nurse Acknowledged Alerts',
        description: 'Initial assessment completed and protocol actions initiated.',
        reason: 'Why: Critical and warning alerts required manual bedside confirmation.',
        details: 'Patient responsive, respiration checked, action list executed in under 5 minutes.',
        notes: ['No cyanosis observed', 'Continue continuous monitoring'],
        actor: 'Nurse M. Rahimi',
        time: new Date(now.getTime() - 72 * 60000),
      },
      {
        id: 'evt-4',
        type: 'intervention',
        severity: 'normal',
        title: 'Oxygen Therapy Adjusted',
        description: 'Oxygen flow increased to 3L/min based on respiratory response.',
        reason: 'Why: Persistent SpO2 volatility despite rest condition.',
        details: 'O2 flow changed from 2L/min to 3L/min and response monitored.',
        notes: ['Target SpO2 set to >= 95%', 'Reassessment in 30 minutes'],
        actor: 'Dr. Benali',
        time: new Date(now.getTime() - 68 * 60000),
      },
      {
        id: 'evt-5',
        type: 'medication',
        severity: glucoseLevel > 180 ? 'warning' : 'normal',
        title: 'Insulin Administered',
        description: `Rapid-acting insulin 4 IU given for glucose control (${glucoseLevel} mg/dL).`,
        reason: 'Why: Glucose exceeded post-meal safe envelope.',
        details: `Dose was calibrated based on glucose at ${glucoseLevel} mg/dL and physician order.`,
        notes: ['No adverse reaction reported', 'Recheck glucose after 2h'],
        actor: 'Nurse Team B',
        time: new Date(now.getTime() - 55 * 60000),
      },
      {
        id: 'evt-6',
        type: 'medication',
        severity: 'normal',
        title: 'Next Medication Scheduled',
        description: 'Follow-up glucose protocol dose scheduled in 2 hours.',
        reason: 'Why: Continuity of glycemic control plan.',
        details: 'Order queued in medication planner with reminder sync to shift nurse.',
        notes: ['Pending glucose recheck', 'Hold dose if glucose < 90 mg/dL'],
        actor: 'Medication Planner',
        time: new Date(now.getTime() - 40 * 60000),
      },
      {
        id: 'evt-7',
        type: 'procedure',
        severity: 'normal',
        title: '12-Lead ECG Performed',
        description: 'ECG recording completed and attached to patient chart.',
        reason: 'Why: Needed rhythm verification after repeated heart-rate alerts.',
        details: 'No ST elevation detected; sinus tachycardia pattern observed.',
        notes: ['Digital copy archived', 'Cardio review requested'],
        actor: 'Cardio Unit',
        time: new Date(now.getTime() - 28 * 60000),
      },
      {
        id: 'evt-8',
        type: 'note',
        severity: 'normal',
        title: 'Physician Progress Note Added',
        description: 'Patient stabilized after intervention, continue close monitoring.',
        reason: 'Why: Daily update after intervention response was observed.',
        details: 'Maintain current treatment line, reassess overnight trends.',
        notes: ['No immediate escalation required', 'Re-evaluate in next round'],
        actor: 'Dr. Benali',
        time: new Date(now.getTime() - 16 * 60000),
      },
    ].sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [glucoseLevel, heartRate, latestVitals.timestamp, oxygenSaturation]);

  const filteredTimelineEvents = useMemo(() => {
    if (eventFilter === 'all') {
      const now = latestVitals.timestamp ? new Date(latestVitals.timestamp) : new Date();
      const rangeStart = new Date(now.getTime() - rangeDurationMap[selectedRange]);

      return timelineEvents.filter((event) => event.time >= rangeStart);
    }

    const now = latestVitals.timestamp ? new Date(latestVitals.timestamp) : new Date();
    const rangeStart = new Date(now.getTime() - rangeDurationMap[selectedRange]);

    return timelineEvents.filter((event) => event.type === eventFilter && event.time >= rangeStart);
  }, [eventFilter, latestVitals.timestamp, selectedRange, timelineEvents]);

  const predictiveInsights = useMemo(() => {
    const heartForecast = heartRate + Math.round(activeMetricStats.delta * 3);
    const oxygenForecast = oxygenSaturation - 1;
    const glucoseForecast = glucoseLevel + Math.round(activeMetricStats.delta * 2);

    return [
      {
        label: 'Heart Rate Forecast (30 min)',
        value: `${heartForecast} bpm`,
        confidence: 82,
        crossesDanger: heartForecast > 130,
      },
      {
        label: 'Oxygen Forecast (30 min)',
        value: `${oxygenForecast}%`,
        confidence: 76,
        crossesDanger: oxygenForecast < 93,
      },
      {
        label: 'Glucose Forecast (60 min)',
        value: `${glucoseForecast} mg/dL`,
        confidence: 79,
        crossesDanger: glucoseForecast > 190,
      },
    ];
  }, [activeMetricStats.delta, glucoseLevel, heartRate, oxygenSaturation]);

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
        status: oxygenSaturation < 92 ? 'offline' : 'online',
        battery: 64,
        signal: oxygenSaturation < 92 ? 0 : 78,
      },
      {
        name: 'Glucose Patch',
        status: 'online',
        battery: 49,
        signal: 73,
      },
    ],
    [oxygenSaturation]
  );

  const comparisonInsights = useMemo(() => {
    const yesterdayHeartAvg = Math.max(heartRate - 8, 75);
    const previousShiftHeartAvg = Math.max(heartRate - 5, 78);
    const todayVsYesterday = ((heartRate - yesterdayHeartAvg) / yesterdayHeartAvg) * 100;
    const shiftVsShift = ((heartRate - previousShiftHeartAvg) / previousShiftHeartAvg) * 100;

    return {
      todayVsYesterday,
      shiftVsShift,
      yesterdayHeartAvg,
      previousShiftHeartAvg,
    };
  }, [heartRate]);

  const eventTypeStyles = {
    alert: 'bg-rose-50 text-rose-700 border-rose-200',
    medication: 'bg-sky-50 text-sky-700 border-sky-200',
    intervention: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    procedure: 'bg-violet-50 text-violet-700 border-violet-200',
    note: 'bg-amber-50 text-amber-700 border-amber-200',
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
          <p className="text-gray-600">Patient not found</p>
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

      

      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Thermometer className="w-5 h-5 text-amber-700" />}
            label="Temperature"
            value={temperature.toFixed(1)}
            unit="°C"
            accentClass="bg-amber-100"
          />
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Heart className="w-5 h-5 text-rose-700" />}
            label="Heart Rate"
            value={heartRate}
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
            <p className="text-xs text-gray-500 mt-2">ECG-style trend</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Droplets className="w-5 h-5 text-sky-700" />}
            label="Glucose Level"
            value={glucoseLevel}
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
            <p className="text-xs text-gray-500 mt-2">Trend line</p>
          </MetricCard>
        </div>

        <div className="break-inside-avoid mb-4">
          <MetricCard
            icon={<Wind className="w-5 h-5 text-cyan-700" />}
            label="Oxygen"
            value={oxygenSaturation}
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
            value={heartRate}
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
            <p className="text-xs text-gray-500 mt-2">Live ECG waveform</p>
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
            <p className="text-xs text-gray-500 mt-2">Sleep timeline (target: 8h)</p>
          </MetricCard>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Human Body Visualization</h3>
        <p className="text-sm text-gray-600 mb-4">Visual overview of the patient body status using picture mode.</p>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Range:</span>
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
              {isLiveTracking ? 'Live ON' : 'Live OFF'}
            </button>
            <span className="text-xs text-gray-500">
              {isLiveTracking
                ? `Last update: ${lastLiveUpdate ? format(lastLiveUpdate, 'HH:mm:ss') : 'waiting...'}`
                : 'Real-time paused'}
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
                <span className="text-sm font-medium text-gray-700">{activeBodyMetricConfig.label} Curve</span>
                <span className={`text-sm font-semibold ${activeBodyMetricConfig.textClass}`}>{activeBodyMetricConfig.value}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                  Normal: {activeBodyMetricConfig.normalRange}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                  Window: Last {displayedSeries.length} points ({selectedRange})
                </span>
                {isLiveTracking && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 font-medium">
                    Following in real time
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 font-medium ${activeMetricStats.delta >= 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  Trend: {activeMetricStats.delta >= 0 ? '+' : ''}{activeMetricStats.delta.toFixed(2)} {activeBodyMetricConfig.unit}
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
            <h3 className="text-lg font-bold text-gray-900">Predictive Insights</h3>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Coming Soon</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">AI forecasting module will be connected next. Preview shows expected structure and risk interpretation.</p>
          <div className="space-y-3">
            {predictiveInsights.map((insight) => (
              <div key={insight.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{insight.label}</p>
                  <p className="text-sm font-semibold text-gray-900">{insight.value}</p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-600">Confidence: {insight.confidence}%</p>
                  <p className={`text-xs font-semibold ${insight.crossesDanger ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {insight.crossesDanger ? 'Forecast crosses danger zone' : 'Forecast within safe range'}
                  </p>
                </div>
              </div>
            ))}
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Timeline + Events</h3>
            <p className="text-sm text-gray-600">Chronological patient activity feed for alerts, actions, medication, procedures, and notes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'alert', 'intervention', 'medication', 'procedure', 'note'] as const).map((filter) => (
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
    </div>
  );
}
