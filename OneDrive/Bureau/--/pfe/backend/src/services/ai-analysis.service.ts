import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  Alert,
  AlertSeverity,
  AlertStatus,
  AlertType,
  Prediction,
  PredictionType,
  VitalSigns,
} from '../models';
import logger from '../utils/logger';

export type AiAlertCandidate = {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  description?: string;
  confidence?: number;
};

export type AiAnalysisResult = {
  ok: boolean;
  patientId: string;
  generatedAt: string;
  latestVitals?: {
    HR?: number;
    SpO2?: number;
    Temperature?: number;
  };
  models?: {
    anomaly?: any;
    status?: any;
    cardiac?: any;
    respiratory?: any;
  };
  alerts: AiAlertCandidate[];
  recommendations: string[];
  modelErrors?: string[];
  source: 'python-models' | 'fallback-rules';
};

const PYTHON_TIMEOUT_MS = 25_000;
const inFlightPatientAnalyses = new Map<string, Promise<any>>();

const resolveBridgePaths = (): { scriptPath: string; modelDir: string } => {
  const candidates = [
    path.resolve(process.cwd(), 'model'),
    path.resolve(process.cwd(), '..', 'model'),
    path.resolve(__dirname, '..', '..', '..', 'model'),
    path.resolve(__dirname, '..', '..', '..', '..', 'model'),
  ];

  for (const candidate of candidates) {
    const script = path.join(candidate, 'predict_bridge.py');
    if (fs.existsSync(script)) {
      return {
        scriptPath: script,
        modelDir: candidate,
      };
    }
  }

  // Keep deterministic fallback to first candidate for error messaging downstream.
  return {
    scriptPath: path.join(candidates[0], 'predict_bridge.py'),
    modelDir: candidates[0],
  };
};

const severityFromString = (value: unknown): AlertSeverity => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CRITICAL') return AlertSeverity.CRITICAL;
  if (normalized === 'HIGH') return AlertSeverity.HIGH;
  if (normalized === 'MEDIUM') return AlertSeverity.MEDIUM;
  return AlertSeverity.LOW;
};

const typeFromString = (value: unknown): AlertType => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === AlertType.CRITICAL_VITAL_SIGN) return AlertType.CRITICAL_VITAL_SIGN;
  if (normalized === AlertType.VITAL_SIGN_ANOMALY) return AlertType.VITAL_SIGN_ANOMALY;
  if (normalized === AlertType.PREDICTION_WARNING) return AlertType.PREDICTION_WARNING;
  if (normalized === AlertType.PATIENT_DETERIORATION) return AlertType.PATIENT_DETERIORATION;
  return AlertType.VITAL_SIGN_ANOMALY;
};

const runPythonAnalysis = async (payload: { patientId: string; vitals: any[] }): Promise<any> => {
  const { scriptPath, modelDir } = resolveBridgePaths();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`AI bridge script not found: ${scriptPath}`);
  }

  const runCommand = (command: string, args: string[]) =>
    new Promise<any>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: modelDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL || '2',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`AI bridge timed out after ${PYTHON_TIMEOUT_MS}ms`));
      }, PYTHON_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.stdin.on('error', (error: any) => {
        // Python may terminate early (missing deps/runtime error), causing EPIPE/EOF on stdin.
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`AI bridge stdin error: ${error?.message || error}`));
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (code !== 0) {
          return reject(new Error(`AI bridge exited with code ${code}: ${stderr || stdout}`));
        }

        try {
          const normalizedOutput = (stdout || '').trim();
          const lines = normalizedOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          const candidate =
            lines
              .slice()
              .reverse()
              .find((line) => line.startsWith('{') && line.endsWith('}')) ||
            normalizedOutput;

          const parsed = JSON.parse(candidate || '{}');
          resolve(parsed);
        } catch (error: any) {
          reject(
            new Error(
              `AI bridge returned invalid JSON: ${error?.message || 'parse error'}. Raw stdout: ${stdout.slice(0, 400)}`
            )
          );
        }
      });

      try {
        child.stdin.end(JSON.stringify(payload));
      } catch (error: any) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`AI bridge input write failed: ${error?.message || error}`));
      }
    });

  try {
    return await runCommand('python', [scriptPath]);
  } catch (error: any) {
    if (String(error?.message || '').toLowerCase().includes('enoent')) {
      return runCommand('py', ['-3', scriptPath]);
    }
    throw error;
  }
};

const fallbackAnalysis = (patientId: string, vitals: any[]): AiAnalysisResult => {
  const latest = vitals[0] || {};
  const hr = Number(latest.heartRate);
  const spO2 = Number(latest.spO2);
  const temperature = Number(latest.temperature);

  const alerts: AiAlertCandidate[] = [];
  const recommendations: string[] = [];

  const isCritical =
    (Number.isFinite(hr) && (hr >= 130 || hr <= 42)) ||
    (Number.isFinite(spO2) && spO2 < 90) ||
    (Number.isFinite(temperature) && (temperature >= 39.2 || temperature < 35.2));

  const isWarning =
    (Number.isFinite(hr) && (hr > 110 || hr < 52)) ||
    (Number.isFinite(spO2) && spO2 < 94) ||
    (Number.isFinite(temperature) && (temperature >= 38.2 || temperature < 36.0));

  if (isCritical) {
    alerts.push({
      type: AlertType.CRITICAL_VITAL_SIGN,
      severity: AlertSeverity.CRITICAL,
      message: 'Fallback AI: critical vital signs detected',
      description: `HR=${Number.isFinite(hr) ? hr : 'N/A'}, SpO2=${Number.isFinite(spO2) ? spO2 : 'N/A'}, Temp=${Number.isFinite(temperature) ? temperature : 'N/A'}`,
      confidence: 0.65,
    });
    recommendations.push('Escalate patient to immediate medical review.');
  } else if (isWarning) {
    alerts.push({
      type: AlertType.PATIENT_DETERIORATION,
      severity: AlertSeverity.HIGH,
      message: 'Fallback AI: warning vital trend detected',
      description: 'One or more vitals are outside nominal range.',
      confidence: 0.55,
    });
    recommendations.push('Increase monitoring frequency and re-check measurements.');
  } else {
    recommendations.push('Vitals currently stable. Continue routine monitoring.');
  }

  const fallbackStatus = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Stable';
  const fallbackRiskLevel = isCritical ? 'High' : isWarning ? 'Medium' : 'Low';
  const fallbackConfidence = isCritical ? 0.84 : isWarning ? 0.71 : 0.66;
  const fallbackAnomalyScore = isCritical ? 0.86 : isWarning ? 0.58 : 0.14;
  const fallbackRespCurrent = Number.isFinite(spO2) ? spO2 : 97;
  const fallbackRespPredicted = Number(
    Math.max(70, Math.min(100, fallbackRespCurrent - (isCritical ? 3 : isWarning ? 1.2 : 0.2))).toFixed(1)
  );

  return {
    ok: true,
    patientId,
    generatedAt: new Date().toISOString(),
    latestVitals: {
      HR: Number.isFinite(hr) ? hr : undefined,
      SpO2: Number.isFinite(spO2) ? spO2 : undefined,
      Temperature: Number.isFinite(temperature) ? temperature : undefined,
    },
    models: {
      anomaly: {
        is_anomaly: isCritical || isWarning,
        anomaly_score: fallbackAnomalyScore,
        alert_level: isCritical ? 'HIGH' : isWarning ? 'MEDIUM' : 'NONE',
      },
      status: {
        status: fallbackStatus,
        confidence: fallbackConfidence,
        alert_level: isCritical ? 'HIGH' : isWarning ? 'MEDIUM' : 'LOW',
      },
      cardiac: {
        risk_level: fallbackRiskLevel,
        risk_probability: Number((isCritical ? 0.82 : isWarning ? 0.56 : 0.22).toFixed(2)),
        risk_percentage: `${isCritical ? 82 : isWarning ? 56 : 22}%`,
      },
      respiratory: {
        predicted_spo2: fallbackRespPredicted,
        current_spo2: fallbackRespCurrent,
        change: Number((fallbackRespPredicted - fallbackRespCurrent).toFixed(1)),
        horizon_minutes: 30,
        alert: fallbackRespPredicted < 92,
      },
    },
    alerts,
    recommendations,
    modelErrors: ['python bridge unavailable; fallback rules used'],
    source: 'fallback-rules',
  };
};

export const analyzePatientWithAi = async (
  patientId: string,
  vitals: any[]
): Promise<AiAnalysisResult> => {
  const payloadVitals = [...vitals]
    .reverse()
    .map((v) => ({
      timestamp: v.timestamp,
      heartRate: v.heartRate,
      spO2: v.spO2,
      temperature: v.temperature,
      glucose: v.glucose,
    }));

  try {
    const response = await runPythonAnalysis({ patientId, vitals: payloadVitals });

    const alertsRaw = Array.isArray(response?.alerts) ? response.alerts : [];
    const alerts: AiAlertCandidate[] = alertsRaw.map((alert: any) => ({
      type: typeFromString(alert?.type),
      severity: severityFromString(alert?.severity),
      message: String(alert?.message || 'AI generated alert'),
      description: alert?.description ? String(alert.description) : undefined,
      confidence: Number.isFinite(Number(alert?.confidence)) ? Number(alert.confidence) : undefined,
    }));

    return {
      ok: Boolean(response?.ok),
      patientId,
      generatedAt: String(response?.generatedAt || new Date().toISOString()),
      latestVitals: response?.latestVitals,
      models: response?.models || {},
      alerts,
      recommendations: Array.isArray(response?.recommendations)
        ? response.recommendations.map((item: any) => String(item))
        : [],
      modelErrors: Array.isArray(response?.modelErrors)
        ? response.modelErrors.map((item: any) => String(item))
        : [],
      source: 'python-models',
    };
  } catch (error: any) {
    logger.warn(`AI python analysis failed for patient ${patientId}: ${error?.message || error}`);
    return fallbackAnalysis(patientId, vitals);
  }
};

export const persistAiOutcomes = async (
  patientId: string,
  analysis: AiAnalysisResult,
  triggeredByUserId: string,
  latestVitalId?: string
) => {
  const persistedAlerts: any[] = [];
  const persistedPredictions: any[] = [];

  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000);

  for (const alert of analysis.alerts) {
    const duplicate = await Alert.findOne({
      patient: patientId,
      type: alert.type,
      message: alert.message,
      status: { $in: [AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.ESCALATED] },
      timestamp: { $gte: recentCutoff },
    })
      .select('_id')
      .lean();

    if (duplicate) continue;

    const created = await Alert.create({
      patient: patientId,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      description: [alert.description, `AI source: ${analysis.source}`, alert.confidence !== undefined ? `AI confidence: ${(alert.confidence * 100).toFixed(1)}%` : null]
        .filter(Boolean)
        .join(' | '),
      triggeredBy: triggeredByUserId,
      vitalSigns: latestVitalId || undefined,
    });

    persistedAlerts.push(created);
  }

  const models = analysis.models || {};

  if (models.status) {
    const confidence = Number(models.status?.confidence);
    const statusName = String(models.status?.status || 'Stable').toLowerCase();
    const statusValue = statusName === 'critical' ? 2 : statusName === 'warning' ? 1 : 0;

    const duplicate = await Prediction.findOne({
      patient: patientId,
      type: PredictionType.RISK_CLASSIFICATION,
      modelType: 'RANDOM_FOREST',
      timestamp: { $gte: recentCutoff },
    })
      .select('_id')
      .lean();

    if (!duplicate) {
      const prediction = await Prediction.create({
        patient: patientId,
        type: PredictionType.RISK_CLASSIFICATION,
        modelType: 'RANDOM_FOREST',
        predictedValue: statusValue,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.6,
        timeHorizon: 30,
        inputData: analysis.latestVitals || {},
        metadata: models.status,
      });
      persistedPredictions.push(prediction);
    }
  }

  if (models.anomaly) {
    const score = Number(models.anomaly?.anomaly_score);
    const duplicate = await Prediction.findOne({
      patient: patientId,
      type: PredictionType.ANOMALY_DETECTION,
      modelType: 'ISOLATION_FOREST',
      timestamp: { $gte: recentCutoff },
    })
      .select('_id')
      .lean();

    if (!duplicate) {
      const prediction = await Prediction.create({
        patient: patientId,
        type: PredictionType.ANOMALY_DETECTION,
        modelType: 'ISOLATION_FOREST',
        predictedValue: Number.isFinite(score) ? score : 0,
        confidence: 0.75,
        timeHorizon: 5,
        inputData: analysis.latestVitals || {},
        metadata: models.anomaly,
      });
      persistedPredictions.push(prediction);
    }
  }

  if (models.respiratory) {
    const spo2 = Number(models.respiratory?.predicted_spo2);
    const duplicate = await Prediction.findOne({
      patient: patientId,
      type: PredictionType.SPO2_FORECAST,
      modelType: 'LSTM',
      timestamp: { $gte: recentCutoff },
    })
      .select('_id')
      .lean();

    if (!duplicate && Number.isFinite(spo2)) {
      const prediction = await Prediction.create({
        patient: patientId,
        type: PredictionType.SPO2_FORECAST,
        modelType: 'LSTM',
        predictedValue: spo2,
        confidence: 0.8,
        timeHorizon: Number(models.respiratory?.horizon_minutes) || 30,
        inputData: analysis.latestVitals || {},
        metadata: models.respiratory,
      });
      persistedPredictions.push(prediction);
    }
  }

  return { persistedAlerts, persistedPredictions };
};

export const analyzeAndPersistPatientAi = async (
  patientId: string,
  triggeredByUserId: string,
  limit = 700
) => {
  const dedupeKey = String(patientId || '').trim();
  if (!dedupeKey) {
    throw new Error('patientId is required for AI analysis');
  }

  const existingAnalysis = inFlightPatientAnalyses.get(dedupeKey);
  if (existingAnalysis) {
    return existingAnalysis;
  }

  const analysisPromise = (async () => {
    const vitals = await VitalSigns.find({ patient: patientId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const analysis = await analyzePatientWithAi(patientId, vitals);
    const latestVitalId = vitals[0]?._id ? String(vitals[0]._id) : undefined;

    let persisted = { persistedAlerts: [] as any[], persistedPredictions: [] as any[] };
    try {
      if (triggeredByUserId) {
        persisted = await persistAiOutcomes(patientId, analysis, triggeredByUserId, latestVitalId);
      } else {
        logger.warn(`AI persistence skipped for patient ${patientId}: missing triggeredByUserId`);
      }
    } catch (error: any) {
      logger.error(`AI persistence failed for patient ${patientId}: ${error?.message || error}`);
      // Keep analysis available to API consumers even when DB persistence fails.
    }

    return {
      analysis,
      vitalsCount: vitals.length,
      ...persisted,
    };
  })();

  inFlightPatientAnalyses.set(dedupeKey, analysisPromise);

  try {
    return await analysisPromise;
  } finally {
    const current = inFlightPatientAnalyses.get(dedupeKey);
    if (current === analysisPromise) {
      inFlightPatientAnalyses.delete(dedupeKey);
    }
  }
};
