import { Types } from 'mongoose';
import {
  Alert,
  AlertSeverity,
  AlertStatus,
  AlertType,
  Bed,
  Patient,
  SimulationProfile,
  SignalConnectionStatus,
  SignalSource,
  VitalSigns,
  VitalSource,
} from '../models';
import { emitToRoom } from '../realtime/socket';
import logger from '../utils/logger';

export type RealismLevel = 'CLEAN' | 'REALISTIC' | 'NOISY';

export interface ScenarioStep {
  profile: SimulationProfile;
  durationSec: number;
}

interface RecordedPoint {
  timestamp: string;
  profile: SimulationProfile;
  heartRate: number;
  temperature: number;
  spO2: number;
  glucose: number;
}

interface RecordedSession {
  id: string;
  bedId: string;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY';
  startedAt: string;
  endedAt?: string;
  intervalMs: number;
  realismLevel: RealismLevel;
  timeline?: ScenarioStep[];
  sourceSessionId?: string;
  points: RecordedPoint[];
}

interface SimulationDiagnostics {
  bedId: string;
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
}

interface SimulationRuntime {
  bedId: string;
  profile: SimulationProfile;
  intervalMs: number;
  timer: NodeJS.Timeout;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY';
  realismLevel: RealismLevel;
  timeline?: {
    steps: ScenarioStep[];
    stepIndex: number;
    stepEndsAt: number;
  };
  replay?: {
    sourceSessionId: string;
    points: RecordedPoint[];
    cursor: number;
    speedMultiplier: number;
  };
  sessionId: string;
}

interface GeneratedSignal {
  heartRate: number;
  temperature: number;
  spO2: number;
  glucose: number;
}

const runtimes = new Map<string, SimulationRuntime>();
const sessionsByBed = new Map<string, RecordedSession[]>();
const activeSessionByBed = new Map<string, RecordedSession>();
const diagnosticsByBed = new Map<string, SimulationDiagnostics>();
const SIMULATION_ALERT_COOLDOWN_MS = 20_000;

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const jitter = (base: number, variance: number): number => {
  const delta = (Math.random() - 0.5) * variance * 2;
  return base + delta;
};

const ensureDiagnostics = (bedId: string): SimulationDiagnostics => {
  const existing = diagnosticsByBed.get(bedId);
  if (existing) return existing;

  const created: SimulationDiagnostics = {
    bedId,
    connected: false,
    mode: 'IDLE',
    tickCount: 0,
    eventCount: 0,
  };
  diagnosticsByBed.set(bedId, created);
  return created;
};

const beginSession = (
  bedId: string,
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY',
  intervalMs: number,
  realismLevel: RealismLevel,
  extras?: Pick<RecordedSession, 'timeline' | 'sourceSessionId'>
): RecordedSession => {
  const session: RecordedSession = {
    id: new Types.ObjectId().toString(),
    bedId,
    mode,
    startedAt: new Date().toISOString(),
    intervalMs,
    realismLevel,
    timeline: extras?.timeline,
    sourceSessionId: extras?.sourceSessionId,
    points: [],
  };

  const list = sessionsByBed.get(bedId) || [];
  list.unshift(session);
  sessionsByBed.set(bedId, list.slice(0, 50));
  activeSessionByBed.set(bedId, session);

  return session;
};

const endSession = (bedId: string) => {
  const active = activeSessionByBed.get(bedId);
  if (!active) return;
  if (!active.endedAt) {
    active.endedAt = new Date().toISOString();
  }
  activeSessionByBed.delete(bedId);
};

const applyRealism = (signal: GeneratedSignal, realismLevel: RealismLevel): GeneratedSignal => {
  const adjusted = { ...signal };

  if (realismLevel === 'CLEAN') {
    return adjusted;
  }

  const noiseFactor = realismLevel === 'NOISY' ? 1.8 : 1.0;
  adjusted.heartRate = Math.round(clamp(jitter(adjusted.heartRate, 2.2 * noiseFactor), 20, 220));
  adjusted.temperature = Number(clamp(jitter(adjusted.temperature, 0.08 * noiseFactor), 30, 45).toFixed(1));
  adjusted.spO2 = Number(clamp(jitter(adjusted.spO2, 0.6 * noiseFactor), 40, 100).toFixed(1));
  adjusted.glucose = Math.round(clamp(jitter(adjusted.glucose, 3.5 * noiseFactor), 30, 600));

  if (realismLevel === 'NOISY' && Math.random() < 0.08) {
    // Occasional sensor artifact spikes.
    adjusted.heartRate = Math.round(clamp(adjusted.heartRate + jitter(0, 20), 20, 220));
    adjusted.spO2 = Number(clamp(adjusted.spO2 + jitter(0, 4), 40, 100).toFixed(1));
  }

  return adjusted;
};

const byProfile = (profile: SimulationProfile): GeneratedSignal => {
  switch (profile) {
    case SimulationProfile.TACHYCARDIA:
      return {
        heartRate: Math.round(clamp(jitter(138, 14), 90, 210)),
        temperature: Number(clamp(jitter(37.5, 0.5), 35, 41).toFixed(1)),
        spO2: Number(clamp(jitter(95, 2), 80, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(150, 24), 60, 320)),
      };
    case SimulationProfile.BRADYCARDIA:
      return {
        heartRate: Math.round(clamp(jitter(46, 8), 25, 70)),
        temperature: Number(clamp(jitter(36.5, 0.3), 34, 39).toFixed(1)),
        spO2: Number(clamp(jitter(96, 2), 82, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(105, 18), 50, 240)),
      };
    case SimulationProfile.ARRHYTHMIA:
      return {
        heartRate: Math.round(clamp(jitter(102, 35), 35, 210)),
        temperature: Number(clamp(jitter(37.0, 0.4), 34, 40).toFixed(1)),
        spO2: Number(clamp(jitter(94, 3), 75, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(135, 30), 55, 340)),
      };
    case SimulationProfile.HYPOXEMIA:
      return {
        heartRate: Math.round(clamp(jitter(112, 16), 50, 200)),
        temperature: Number(clamp(jitter(37.2, 0.4), 34, 40).toFixed(1)),
        spO2: Number(clamp(jitter(86, 4.5), 60, 95).toFixed(1)),
        glucose: Math.round(clamp(jitter(128, 20), 55, 300)),
      };
    case SimulationProfile.HYPERGLYCEMIA:
      return {
        heartRate: Math.round(clamp(jitter(96, 12), 45, 180)),
        temperature: Number(clamp(jitter(37.1, 0.3), 34, 40).toFixed(1)),
        spO2: Number(clamp(jitter(97, 1.5), 85, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(292, 42), 160, 500)),
      };
    case SimulationProfile.SEPSIS_LIKE:
      return {
        heartRate: Math.round(clamp(jitter(128, 15), 70, 210)),
        temperature: Number(clamp(jitter(39.1, 0.6), 36, 42).toFixed(1)),
        spO2: Number(clamp(jitter(91, 3.5), 70, 99).toFixed(1)),
        glucose: Math.round(clamp(jitter(218, 34), 90, 420)),
      };
    case SimulationProfile.AI_TEST_ANOMALY:
      return {
        heartRate: Math.round(clamp(jitter(118, 42), 35, 220)),
        temperature: Number(clamp(jitter(38.0, 1.1), 34, 42).toFixed(1)),
        spO2: Number(clamp(jitter(90, 6.5), 60, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(210, 65), 50, 500)),
      };
    case SimulationProfile.AI_TEST_PREDICTION:
      return {
        // Pre-critical pattern: warning zone values designed to trigger predictive insights
        // while often staying just above hard critical thresholds.
        heartRate: Math.round(clamp(jitter(112, 10), 70, 140)),
        temperature: Number(clamp(jitter(37.9, 0.35), 36.8, 39.0).toFixed(1)),
        spO2: Number(clamp(jitter(93.2, 1.8), 90.5, 96.0).toFixed(1)),
        glucose: Math.round(clamp(jitter(182, 20), 120, 240)),
      };
    case SimulationProfile.AI_TEST_CARDIAC:
      return {
        heartRate: Math.round(clamp(jitter(142, 24), 55, 220)),
        temperature: Number(clamp(jitter(37.2, 0.4), 35, 41).toFixed(1)),
        spO2: Number(clamp(jitter(95, 2.4), 80, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(138, 22), 60, 300)),
      };
    case SimulationProfile.AI_TEST_RESPIRATORY:
      return {
        heartRate: Math.round(clamp(jitter(110, 12), 60, 200)),
        temperature: Number(clamp(jitter(37.3, 0.5), 35, 41).toFixed(1)),
        spO2: Number(clamp(jitter(88, 4.8), 60, 96).toFixed(1)),
        glucose: Math.round(clamp(jitter(126, 20), 60, 280)),
      };
    case SimulationProfile.AI_TEST_FULLSTACK:
      return {
        heartRate: Math.round(clamp(jitter(132, 18), 45, 220)),
        temperature: Number(clamp(jitter(38.9, 0.7), 35, 42).toFixed(1)),
        spO2: Number(clamp(jitter(87, 4.2), 55, 97).toFixed(1)),
        glucose: Math.round(clamp(jitter(248, 44), 70, 520)),
      };
    case SimulationProfile.CRITICAL:
      return {
        heartRate: Math.round(clamp(jitter(132, 16), 40, 220)),
        temperature: Number(clamp(jitter(39.0, 0.6), 34, 42).toFixed(1)),
        spO2: Number(clamp(jitter(88, 4), 65, 99).toFixed(1)),
        glucose: Math.round(clamp(jitter(245, 38), 50, 450)),
      };
    case SimulationProfile.MODERATE:
      return {
        heartRate: Math.round(clamp(jitter(104, 12), 45, 190)),
        temperature: Number(clamp(jitter(37.9, 0.4), 34, 41).toFixed(1)),
        spO2: Number(clamp(jitter(93.5, 2.2), 75, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(176, 28), 55, 380)),
      };
    case SimulationProfile.CUSTOM:
    case SimulationProfile.STABLE:
    default:
      return {
        heartRate: Math.round(clamp(jitter(78, 7), 45, 160)),
        temperature: Number(clamp(jitter(36.9, 0.2), 34, 40).toFixed(1)),
        spO2: Number(clamp(jitter(98, 1.2), 88, 100).toFixed(1)),
        glucose: Math.round(clamp(jitter(112, 18), 50, 250)),
      };
  }
};

const isCriticalSignal = (signal: GeneratedSignal): boolean => {
  return (
    signal.heartRate >= 130 ||
    signal.heartRate <= 42 ||
    signal.spO2 < 90 ||
    signal.temperature >= 39.2 ||
    signal.temperature < 35.2 ||
    signal.glucose >= 260 ||
    signal.glucose < 55
  );
};

const maybeCreateSimulationCriticalAlert = async (params: {
  patientId: string;
  triggeredByUserId: string;
  signal: GeneratedSignal;
  vitalId: string;
}) => {
  const { patientId, triggeredByUserId, signal, vitalId } = params;
  if (!isCriticalSignal(signal)) return;

  const duplicateCutoff = new Date(Date.now() - SIMULATION_ALERT_COOLDOWN_MS);
  const existing = await Alert.findOne({
    patient: patientId,
    type: AlertType.CRITICAL_VITAL_SIGN,
    severity: AlertSeverity.CRITICAL,
    status: { $in: [AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.ESCALATED] },
    timestamp: { $gte: duplicateCutoff },
  })
    .select('_id')
    .lean();

  if (existing) return;

  await Alert.create({
    patient: patientId,
    type: AlertType.CRITICAL_VITAL_SIGN,
    severity: AlertSeverity.CRITICAL,
    message: 'Current vital signs exceed safe thresholds',
    description: `HR=${signal.heartRate}, SpO2=${signal.spO2}, Temp=${signal.temperature}, Glucose=${signal.glucose}`,
    triggeredBy: triggeredByUserId,
    vitalSigns: vitalId,
    status: AlertStatus.PENDING,
  });
};

const persistSignal = async (
  bedId: string,
  profile: SimulationProfile,
  source: VitalSource,
  overrideSignal?: Partial<GeneratedSignal>,
  realismLevel: RealismLevel = 'REALISTIC'
) => {
  const bed = await Bed.findById(bedId).select('_id patient simulator createdBy').lean();
  if (!bed) {
    stopBedSimulation(bedId);
    return null;
  }

  const generated = applyRealism(byProfile(profile), realismLevel);
  const signal: GeneratedSignal = {
    heartRate: overrideSignal?.heartRate ?? generated.heartRate,
    temperature: overrideSignal?.temperature ?? generated.temperature,
    spO2: overrideSignal?.spO2 ?? generated.spO2,
    glucose: overrideSignal?.glucose ?? generated.glucose,
  };

  const now = new Date();
  const patientId = bed.patient ? String(bed.patient) : undefined;

  const vitalPayload: Record<string, unknown> = {
    bed: new Types.ObjectId(bedId),
    timestamp: now,
    source,
    heartRate: signal.heartRate,
    temperature: signal.temperature,
    spO2: signal.spO2,
    glucose: signal.glucose,
  };

  if (patientId) {
    vitalPayload.patient = new Types.ObjectId(patientId);
  }

  const vital = await VitalSigns.create(vitalPayload);

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.lastSignalAt': now,
      'simulator.signalConnectionStatus': SignalConnectionStatus.ONLINE,
      'simulator.latestSignal.heartRate': signal.heartRate,
      'simulator.latestSignal.temperature': signal.temperature,
      'simulator.latestSignal.spO2': signal.spO2,
      'simulator.latestSignal.glucose': signal.glucose,
      'simulator.latestSignal.timestamp': now,
      'simulator.latestSignal.source':
        source === VitalSource.MANUAL ? SignalSource.MANUAL : SignalSource.SIMULATOR,
    },
  });

  const payload = {
    bedId,
    patientId: patientId || null,
    profile,
    source,
    signal,
    timestamp: now.toISOString(),
    vitalId: String(vital._id),
  };

  emitToRoom(`bed:${bedId}`, 'bed-signal:update', payload);
  if (patientId) {
    emitToRoom(`patient:${patientId}`, 'patient-vitals:update', payload);

    try {
      const patient = await Patient.findById(patientId)
        .select('assignedDoctor assignedNurses')
        .lean();

      const triggeredByUserId =
        (patient?.assignedDoctor ? String(patient.assignedDoctor) : null) ||
        ((patient?.assignedNurses && patient.assignedNurses.length > 0)
          ? String(patient.assignedNurses[0])
          : null) ||
        (bed.createdBy ? String((bed as any).createdBy) : null);

      if (triggeredByUserId) {
        await maybeCreateSimulationCriticalAlert({
          patientId,
          triggeredByUserId,
          signal,
          vitalId: String(vital._id),
        });
      }
    } catch (error: any) {
      logger.warn(`Simulation alert creation failed for patient ${patientId}: ${error?.message || error}`);
    }
  }

  const diagnostics = ensureDiagnostics(bedId);
  diagnostics.tickCount += 1;
  diagnostics.eventCount += 1;
  diagnostics.lastTickAt = now.toISOString();
  diagnostics.lastEmitAt = now.toISOString();
  diagnostics.currentProfile = profile;
  diagnostics.connected = true;

  const activeSession = activeSessionByBed.get(bedId);
  if (activeSession) {
    activeSession.points.push({
      timestamp: now.toISOString(),
      profile,
      heartRate: signal.heartRate,
      temperature: signal.temperature,
      spO2: signal.spO2,
      glucose: signal.glucose,
    });
  }

  return payload;
};

const getActiveProfileForRuntime = (runtime: SimulationRuntime): SimulationProfile => {
  if (runtime.mode !== 'TIMELINE' || !runtime.timeline) {
    return runtime.profile;
  }

  const nowMs = Date.now();
  while (runtime.timeline.stepIndex < runtime.timeline.steps.length && nowMs >= runtime.timeline.stepEndsAt) {
    runtime.timeline.stepIndex += 1;
    if (runtime.timeline.stepIndex < runtime.timeline.steps.length) {
      const next = runtime.timeline.steps[runtime.timeline.stepIndex];
      runtime.timeline.stepEndsAt = nowMs + next.durationSec * 1000;
    }
  }

  if (runtime.timeline.stepIndex >= runtime.timeline.steps.length) {
    return runtime.profile;
  }

  return runtime.timeline.steps[runtime.timeline.stepIndex].profile;
};

const runRuntimeTick = async (runtime: SimulationRuntime) => {
  try {
    if (runtime.mode === 'REPLAY' && runtime.replay) {
      const replayPoint = runtime.replay.points[runtime.replay.cursor];
      if (!replayPoint) {
        await stopBedSimulation(runtime.bedId);
        return;
      }

      await persistSignal(
        runtime.bedId,
        replayPoint.profile,
        VitalSource.SIMULATOR,
        {
          heartRate: replayPoint.heartRate,
          temperature: replayPoint.temperature,
          spO2: replayPoint.spO2,
          glucose: replayPoint.glucose,
        },
        runtime.realismLevel
      );

      runtime.replay.cursor += 1;
      const diagnostics = ensureDiagnostics(runtime.bedId);
      diagnostics.mode = 'REPLAY';
      diagnostics.currentStepIndex = runtime.replay.cursor;
      diagnostics.sessionId = runtime.sessionId;
      return;
    }

    const activeProfile = getActiveProfileForRuntime(runtime);

    if (runtime.mode === 'TIMELINE' && runtime.timeline && runtime.timeline.stepIndex >= runtime.timeline.steps.length) {
      await stopBedSimulation(runtime.bedId);
      return;
    }

    await persistSignal(runtime.bedId, activeProfile, VitalSource.SIMULATOR, undefined, runtime.realismLevel);

    const diagnostics = ensureDiagnostics(runtime.bedId);
    diagnostics.mode = runtime.mode;
    diagnostics.currentProfile = activeProfile;
    diagnostics.currentStepIndex = runtime.timeline?.stepIndex;
    diagnostics.sessionId = runtime.sessionId;
  } catch (error: any) {
    logger.error(`Simulation tick failed for bed ${runtime.bedId}:`, error);
    const diagnostics = ensureDiagnostics(runtime.bedId);
    diagnostics.lastError = error?.message || String(error);

    await Bed.findByIdAndUpdate(runtime.bedId, {
      $set: {
        'simulator.signalConnectionStatus': SignalConnectionStatus.ERROR,
      },
    });
  }
};

export const listSimulationBeds = async (): Promise<any[]> => {
  const beds = await Bed.find()
    .populate('room', 'roomNumber type')
    .populate('patient', 'firstName lastName')
    .select('_id bedNumber status simulator room patient')
    .lean();

  return beds.map((bed) => ({
    ...bed,
    runtime: {
      running: runtimes.has(String(bed._id)),
      diagnostics: diagnosticsByBed.get(String(bed._id)) || ensureDiagnostics(String(bed._id)),
    },
  }));
};

export const getSimulationStatus = async (bedId: string): Promise<any | null> => {
  const bed = await Bed.findById(bedId)
    .populate('room', 'roomNumber type')
    .populate('patient', 'firstName lastName')
    .select('_id bedNumber status simulator room patient')
    .lean();

  if (!bed) return null;

  return {
    ...bed,
    runtime: {
      running: runtimes.has(String(bed._id)),
      diagnostics: diagnosticsByBed.get(String(bed._id)) || ensureDiagnostics(String(bed._id)),
    },
  };
};

export const startBedSimulation = async (
  bedId: string,
  profile: SimulationProfile,
  intervalMs: number,
  realismLevel: RealismLevel = 'REALISTIC'
) => {
  await stopBedSimulation(bedId);

  const session = beginSession(bedId, 'STANDARD', intervalMs, realismLevel);

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.enabled': true,
      'simulator.profile': profile,
      'simulator.intervalMs': intervalMs,
      'simulator.signalConnectionStatus': SignalConnectionStatus.ONLINE,
    },
  });

  const timer = setInterval(() => {
    const runtime = runtimes.get(bedId);
    if (!runtime) return;
    void runRuntimeTick(runtime);
  }, intervalMs);

  runtimes.set(bedId, {
    bedId,
    profile,
    intervalMs,
    timer,
    mode: 'STANDARD',
    realismLevel,
    sessionId: session.id,
  });

  const diagnostics = ensureDiagnostics(bedId);
  diagnostics.connected = true;
  diagnostics.mode = 'STANDARD';
  diagnostics.currentProfile = profile;
  diagnostics.currentStepIndex = 0;
  diagnostics.sessionId = session.id;

  await persistSignal(bedId, profile, VitalSource.SIMULATOR, undefined, realismLevel);

  emitToRoom(`bed:${bedId}`, 'bed-simulation:status', {
    bedId,
    running: true,
    profile,
    intervalMs,
    mode: 'STANDARD',
    realismLevel,
  });
};

export const startBedTimelineSimulation = async (
  bedId: string,
  steps: ScenarioStep[],
  intervalMs: number,
  realismLevel: RealismLevel = 'REALISTIC'
) => {
  if (!steps.length) {
    throw new Error('Timeline requires at least one step');
  }

  await stopBedSimulation(bedId);
  const normalizedSteps = steps
    .map((step) => ({
      profile: step.profile,
      durationSec: Math.max(1, Number(step.durationSec || 1)),
    }))
    .filter((step) => Object.values(SimulationProfile).includes(step.profile));

  if (!normalizedSteps.length) {
    throw new Error('Timeline steps are invalid');
  }

  const session = beginSession(bedId, 'TIMELINE', intervalMs, realismLevel, {
    timeline: normalizedSteps,
  });

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.enabled': true,
      'simulator.profile': normalizedSteps[0].profile,
      'simulator.intervalMs': intervalMs,
      'simulator.signalConnectionStatus': SignalConnectionStatus.ONLINE,
    },
  });

  const timer = setInterval(() => {
    const runtime = runtimes.get(bedId);
    if (!runtime) return;
    void runRuntimeTick(runtime);
  }, intervalMs);

  runtimes.set(bedId, {
    bedId,
    profile: normalizedSteps[0].profile,
    intervalMs,
    timer,
    mode: 'TIMELINE',
    realismLevel,
    timeline: {
      steps: normalizedSteps,
      stepIndex: 0,
      stepEndsAt: Date.now() + normalizedSteps[0].durationSec * 1000,
    },
    sessionId: session.id,
  });

  const diagnostics = ensureDiagnostics(bedId);
  diagnostics.connected = true;
  diagnostics.mode = 'TIMELINE';
  diagnostics.currentProfile = normalizedSteps[0].profile;
  diagnostics.currentStepIndex = 0;
  diagnostics.sessionId = session.id;

  await persistSignal(bedId, normalizedSteps[0].profile, VitalSource.SIMULATOR, undefined, realismLevel);

  emitToRoom(`bed:${bedId}`, 'bed-simulation:status', {
    bedId,
    running: true,
    profile: normalizedSteps[0].profile,
    intervalMs,
    mode: 'TIMELINE',
    timeline: normalizedSteps,
    realismLevel,
  });
};

export const startBedReplay = async (
  bedId: string,
  sourceSessionId: string,
  speedMultiplier = 1
) => {
  const sessions = sessionsByBed.get(bedId) || [];
  const source = sessions.find((session) => session.id === sourceSessionId);
  if (!source || !source.points.length) {
    throw new Error('Replay source session not found or empty');
  }

  await stopBedSimulation(bedId);

  const safeSpeed = Math.max(0.25, Math.min(8, speedMultiplier || 1));
  const replayInterval = Math.max(200, Math.round(source.intervalMs / safeSpeed));

  const session = beginSession(bedId, 'REPLAY', replayInterval, source.realismLevel, {
    sourceSessionId,
  });

  const timer = setInterval(() => {
    const runtime = runtimes.get(bedId);
    if (!runtime) return;
    void runRuntimeTick(runtime);
  }, replayInterval);

  runtimes.set(bedId, {
    bedId,
    profile: source.points[0].profile,
    intervalMs: replayInterval,
    timer,
    mode: 'REPLAY',
    realismLevel: source.realismLevel,
    replay: {
      sourceSessionId,
      points: source.points,
      cursor: 0,
      speedMultiplier: safeSpeed,
    },
    sessionId: session.id,
  });

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.enabled': true,
      'simulator.profile': source.points[0].profile,
      'simulator.intervalMs': replayInterval,
      'simulator.signalConnectionStatus': SignalConnectionStatus.ONLINE,
    },
  });

  const diagnostics = ensureDiagnostics(bedId);
  diagnostics.connected = true;
  diagnostics.mode = 'REPLAY';
  diagnostics.currentProfile = source.points[0].profile;
  diagnostics.currentStepIndex = 0;
  diagnostics.sessionId = session.id;

  emitToRoom(`bed:${bedId}`, 'bed-simulation:status', {
    bedId,
    running: true,
    profile: source.points[0].profile,
    intervalMs: replayInterval,
    mode: 'REPLAY',
    sourceSessionId,
    speedMultiplier: safeSpeed,
  });
};

export const stopBedSimulation = async (bedId: string) => {
  const runtime = runtimes.get(bedId);
  if (runtime) {
    clearInterval(runtime.timer);
    runtimes.delete(bedId);
  }

  endSession(bedId);

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.enabled': false,
      'simulator.signalConnectionStatus': SignalConnectionStatus.OFFLINE,
    },
  });

  emitToRoom(`bed:${bedId}`, 'bed-simulation:status', {
    bedId,
    running: false,
  });

  const diagnostics = ensureDiagnostics(bedId);
  diagnostics.connected = false;
  diagnostics.mode = 'IDLE';
  diagnostics.currentStepIndex = undefined;
};

export const setBedSimulationProfile = async (
  bedId: string,
  profile: SimulationProfile,
  intervalMs?: number,
  realismLevel?: RealismLevel
) => {
  const current = runtimes.get(bedId);
  const nextInterval = intervalMs ?? current?.intervalMs ?? 1000;
  const nextRealism = realismLevel || current?.realismLevel || 'REALISTIC';

  await Bed.findByIdAndUpdate(bedId, {
    $set: {
      'simulator.profile': profile,
      'simulator.intervalMs': nextInterval,
    },
  });

  if (current) {
    await startBedSimulation(bedId, profile, nextInterval, nextRealism);
  }
};

export const publishManualSignal = async (
  bedId: string,
  signal: Partial<GeneratedSignal>
) => {
  const bed = await Bed.findById(bedId).select('_id simulator.profile').lean();
  if (!bed) return null;

  const profile = bed.simulator?.profile || SimulationProfile.CUSTOM;
  return persistSignal(bedId, profile, VitalSource.MANUAL, signal, 'CLEAN');
};

export const listBedSessions = (bedId: string): RecordedSession[] => {
  return (sessionsByBed.get(bedId) || []).map((session) => ({
    ...session,
    points: session.points.slice(-300),
  }));
};

export const getBedDiagnostics = (bedId: string): SimulationDiagnostics => {
  const runtime = runtimes.get(bedId);
  const diagnostics = ensureDiagnostics(bedId);
  if (runtime) {
    diagnostics.mode = runtime.mode;
    diagnostics.currentProfile = runtime.profile;
    diagnostics.connected = true;
    diagnostics.sessionId = runtime.sessionId;
    if (runtime.timeline) {
      diagnostics.currentStepIndex = runtime.timeline.stepIndex;
    }
  }
  return diagnostics;
};
