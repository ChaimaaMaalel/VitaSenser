import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { feedback } from '../services/feedback';
import { colors } from '../theme/colors';
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

type RealismLevel = 'CLEAN' | 'REALISTIC' | 'NOISY';

type BedSimulation = {
  _id: string;
  bedNumber: string;
  status: string;
  room?: {
    roomNumber?: string;
    type?: string;
  };
  patient?: {
    firstName?: string;
    lastName?: string;
  };
  simulator?: {
    profile?: SimulationProfile;
    intervalMs?: number;
    signalConnectionStatus?: 'ONLINE' | 'OFFLINE' | 'ERROR';
    latestSignal?: {
      heartRate?: number;
      temperature?: number;
      spO2?: number;
      glucose?: number;
      timestamp?: string;
    };
  };
  runtime?: {
    running?: boolean;
  };
};

type Diagnostics = {
  connected: boolean;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY' | 'IDLE';
  tickCount: number;
  eventCount: number;
  currentProfile?: SimulationProfile;
  sessionId?: string;
  lastTickAt?: string;
  lastError?: string;
};

type Session = {
  id: string;
  mode: 'STANDARD' | 'TIMELINE' | 'REPLAY';
  startedAt: string;
  endedAt?: string;
  points?: unknown[];
};

type ScenarioStep = {
  profile: SimulationProfile;
  durationSec: string;
};

const profiles: SimulationProfile[] = [
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

export function SimulationScreen() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const canControl = user?.role === 'ADMIN' || user?.role === 'NURSE' || user?.role === 'DOCTOR';

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [beds, setBeds] = useState<BedSimulation[]>([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [bedSearch, setBedSearch] = useState('');
  const [runningFilter, setRunningFilter] = useState<'ALL' | 'RUNNING' | 'STOPPED'>('ALL');

  const [profile, setProfile] = useState<SimulationProfile>('STABLE');
  const [realismLevel, setRealismLevel] = useState<RealismLevel>('REALISTIC');
  const [intervalMs, setIntervalMs] = useState('1000');

  const [manualHeartRate, setManualHeartRate] = useState('80');
  const [manualTemperature, setManualTemperature] = useState('37');
  const [manualSpO2, setManualSpO2] = useState('98');
  const [manualGlucose, setManualGlucose] = useState('110');

  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [replaySpeed, setReplaySpeed] = useState('1');
  const [timelineSteps, setTimelineSteps] = useState<ScenarioStep[]>([
    { profile: 'STABLE', durationSec: '20' },
    { profile: 'TACHYCARDIA', durationSec: '15' },
    { profile: 'HYPOXEMIA', durationSec: '15' },
    { profile: 'STABLE', durationSec: '20' },
  ]);

  const selectedBed = useMemo(
    () => beds.find((bed) => bed._id === selectedBedId) || null,
    [beds, selectedBedId]
  );

  const filteredBeds = useMemo(() => {
    const needle = bedSearch.trim().toLowerCase();

    return beds.filter((bed) => {
      const patientName = `${bed.patient?.firstName || ''} ${bed.patient?.lastName || ''}`.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        String(bed.bedNumber || '').toLowerCase().includes(needle) ||
        String(bed.room?.roomNumber || '').toLowerCase().includes(needle) ||
        patientName.includes(needle);

      const running = Boolean(bed.runtime?.running);
      const matchesRunning =
        runningFilter === 'ALL' ||
        (runningFilter === 'RUNNING' && running) ||
        (runningFilter === 'STOPPED' && !running);

      return matchesSearch && matchesRunning;
    });
  }, [beds, bedSearch, runningFilter]);

  const fetchBeds = async () => {
    try {
      setLoading(true);
      const response = await api.get('/simulation/beds');
      const nextBeds: BedSimulation[] = response.data?.data?.beds || [];
      setBeds(nextBeds);

      if (!selectedBedId && nextBeds.length > 0) {
        const first = nextBeds[0];
        setSelectedBedId(first._id);
        setProfile(first.simulator?.profile || 'STABLE');
        setIntervalMs(String(first.simulator?.intervalMs || 1000));
      }
    } catch {
      // Keep simple error handling to avoid blocking controls.
    } finally {
      setLoading(false);
    }
  };

  const fetchDiagnostics = async (bedId: string) => {
    if (!bedId) return;
    try {
      const response = await api.get(`/simulation/beds/${bedId}/diagnostics`);
      setDiagnostics(response.data?.data?.diagnostics || null);
    } catch {
      setDiagnostics(null);
    }
  };

  const fetchSessions = async (bedId: string) => {
    if (!bedId) return;
    try {
      const response = await api.get(`/simulation/beds/${bedId}/sessions`);
      setSessions(response.data?.data?.sessions || []);
    } catch {
      setSessions([]);
    }
  };

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    try {
      setActionLoading(true);
      await action();
      await fetchBeds();
      if (selectedBedId) {
        await Promise.all([fetchDiagnostics(selectedBedId), fetchSessions(selectedBedId)]);
      }
      if (successMessage) {
        feedback.success(successMessage);
      }
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Simulation action failed', 'Echec action simulation'));
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    void fetchBeds();
  }, []);

  useEffect(() => {
    if (!selectedBed) return;
    setProfile(selectedBed.simulator?.profile || 'STABLE');
    setIntervalMs(String(selectedBed.simulator?.intervalMs || 1000));
    void fetchDiagnostics(selectedBed._id);
    void fetchSessions(selectedBed._id);
  }, [selectedBed?._id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!selectedBedId) return;
      void fetchBeds();
      void fetchDiagnostics(selectedBedId);
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedBedId]);

  const startSimulation = async () => {
    if (!selectedBedId) return;
    await runAction(async () => {
      await api.post(`/simulation/beds/${selectedBedId}/start`, {
        profile,
        realismLevel,
        intervalMs: Number(intervalMs) || 1000,
      });
    }, tr('Simulation started', 'Simulation demarree'));
  };

  const stopSimulation = async () => {
    if (!selectedBedId) return;
    await runAction(async () => {
      await api.post(`/simulation/beds/${selectedBedId}/stop`);
    }, tr('Simulation stopped', 'Simulation arretee'));
  };

  const updateProfile = async () => {
    if (!selectedBedId) return;
    await runAction(async () => {
      await api.patch(`/simulation/beds/${selectedBedId}/profile`, {
        profile,
        realismLevel,
        intervalMs: Number(intervalMs) || 1000,
      });
    }, tr('Simulation profile updated', 'Profil simulation mis a jour'));
  };

  const sendManualSignal = async () => {
    if (!selectedBedId) return;
    await runAction(async () => {
      await api.post(`/simulation/beds/${selectedBedId}/manual-signal`, {
        heartRate: Number(manualHeartRate),
        temperature: Number(manualTemperature),
        spO2: Number(manualSpO2),
        glucose: Number(manualGlucose),
      });
    }, tr('Manual signal sent', 'Signal manuel envoye'));
  };

  const startReplay = async (sessionId: string) => {
    if (!selectedBedId || !sessionId) return;
    await runAction(async () => {
      await api.post(`/simulation/beds/${selectedBedId}/replay/start`, {
        sessionId,
        speedMultiplier: Number(replaySpeed) || 1,
      });
    }, tr('Replay started', 'Replay demarre'));
  };

  const addTimelineStep = () => {
    setTimelineSteps((prev) => [...prev, { profile: 'STABLE', durationSec: '15' }]);
  };

  const updateTimelineProfile = (index: number, nextProfile: SimulationProfile) => {
    setTimelineSteps((prev) =>
      prev.map((step, idx) => (idx === index ? { ...step, profile: nextProfile } : step))
    );
  };

  const updateTimelineDuration = (index: number, durationSec: string) => {
    setTimelineSteps((prev) =>
      prev.map((step, idx) => (idx === index ? { ...step, durationSec } : step))
    );
  };

  const removeTimelineStep = (index: number) => {
    setTimelineSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const startTimeline = async () => {
    if (!selectedBedId) return;
    if (timelineSteps.length === 0) {
      feedback.info(tr('Add at least one timeline step', 'Ajoutez au moins une etape timeline'));
      return;
    }

    const normalizedSteps = timelineSteps
      .map((step) => ({
        profile: step.profile,
        durationSec: Number(step.durationSec),
      }))
      .filter((step) => Number.isFinite(step.durationSec) && step.durationSec > 0);

    if (normalizedSteps.length === 0) {
      feedback.info(tr('Timeline durations must be positive numbers', 'Les durees timeline doivent etre positives'));
      return;
    }

    await runAction(async () => {
      await api.post(`/simulation/beds/${selectedBedId}/timeline/start`, {
        steps: normalizedSteps,
        realismLevel,
        intervalMs: Number(intervalMs) || 1000,
      });
    }, tr('Timeline started', 'Timeline demarree'));
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{tr('Simulation', 'Simulation')}</Text>
          <Text style={styles.subtitle}>{tr('Bed simulation control center', 'Centre de controle simulation lits')}</Text>
        </View>
        <Pressable style={styles.secondaryBtn} onPress={() => void fetchBeds()}>
          <Text style={styles.secondaryBtnText}>{tr('Refresh', 'Actualiser')}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search bed, room, patient', 'Rechercher lit, salle, patient')}
          placeholderTextColor={colors.textMuted}
          value={bedSearch}
          onChangeText={setBedSearch}
        />
        <View style={styles.chipsRow}>
          {(['ALL', 'RUNNING', 'STOPPED'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setRunningFilter(value)}
              style={[styles.chip, runningFilter === value ? styles.chipActive : null]}
            >
              <Text style={runningFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <ActivityIndicator color={colors.primary} /> : null}

        {filteredBeds.map((bed) => {
          const isSelected = selectedBedId === bed._id;
          return (
            <Pressable
              key={bed._id}
              style={[styles.bedCard, isSelected ? styles.bedCardActive : null]}
              onPress={() => setSelectedBedId(bed._id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{tr('Bed', 'Lit')} {bed.bedNumber} • {tr('Room', 'Salle')} {bed.room?.roomNumber || '--'}</Text>
                <Text style={styles.meta}>
                  {bed.runtime?.running ? tr('RUNNING', 'EN COURS') : tr('STOPPED', 'ARRETEE')} • {bed.simulator?.profile || 'STABLE'} • {bed.simulator?.signalConnectionStatus || '--'}
                </Text>
              </View>
              <View style={styles.runningBadge}>
                <Text style={styles.runningBadgeText}>{bed.runtime?.running ? tr('LIVE', 'LIVE') : tr('IDLE', 'IDLE')}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedBed ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tr('Simulation Controls', 'Controles simulation')}</Text>

            <Text style={styles.fieldLabel}>{tr('Profile', 'Profil')}</Text>
            <View style={styles.chipsRow}>
              {profiles.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setProfile(value)}
                  style={[styles.chip, profile === value ? styles.chipActive : null]}
                >
                  <Text style={profile === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{tr('Realism', 'Realisme')}</Text>
            <View style={styles.chipsRow}>
              {(['CLEAN', 'REALISTIC', 'NOISY'] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setRealismLevel(value)}
                  style={[styles.chip, realismLevel === value ? styles.chipActive : null]}
                >
                  <Text style={realismLevel === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={tr('Interval ms', 'Intervalle ms')}
              placeholderTextColor={colors.textMuted}
              value={intervalMs}
              onChangeText={setIntervalMs}
              keyboardType="numeric"
            />

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryBtn, !canControl ? styles.btnDisabled : null]}
                disabled={!canControl || actionLoading}
                onPress={() => void startSimulation()}
              >
                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tr('Start', 'Demarrer')}</Text>}
              </Pressable>
              <Pressable
                style={[styles.warningBtn, !canControl ? styles.btnDisabled : null]}
                disabled={!canControl || actionLoading}
                onPress={() => void updateProfile()}
              >
                <Text style={styles.warningBtnText}>{tr('Update Profile', 'Mettre a jour profil')}</Text>
              </Pressable>
              <Pressable
                style={[styles.dangerBtn, !canControl ? styles.btnDisabled : null]}
                disabled={!canControl || actionLoading}
                onPress={() => void stopSimulation()}
              >
                <Text style={styles.dangerBtnText}>{tr('Stop', 'Arreter')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tr('Manual Signal', 'Signal manuel')}</Text>
            <View style={styles.formGrid}>
              <TextInput
                style={styles.inputHalf}
                placeholder={tr('Heart rate', 'Frequence cardiaque')}
                placeholderTextColor={colors.textMuted}
                value={manualHeartRate}
                onChangeText={setManualHeartRate}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.inputHalf}
                placeholder={tr('Temperature', 'Temperature')}
                placeholderTextColor={colors.textMuted}
                value={manualTemperature}
                onChangeText={setManualTemperature}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.inputHalf}
                placeholder={tr('SpO2', 'SpO2')}
                placeholderTextColor={colors.textMuted}
                value={manualSpO2}
                onChangeText={setManualSpO2}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.inputHalf}
                placeholder={tr('Glucose', 'Glucose')}
                placeholderTextColor={colors.textMuted}
                value={manualGlucose}
                onChangeText={setManualGlucose}
                keyboardType="numeric"
              />
            </View>

            <Pressable
              style={[styles.primaryBtn, !canControl ? styles.btnDisabled : null]}
              disabled={!canControl || actionLoading}
              onPress={() => void sendManualSignal()}
            >
              <Text style={styles.primaryBtnText}>{tr('Push Signal', 'Envoyer signal')}</Text>
            </Pressable>

            <Text style={styles.meta}>
              Latest: HR {selectedBed.simulator?.latestSignal?.heartRate ?? '--'} • Temp {selectedBed.simulator?.latestSignal?.temperature ?? '--'} • SpO2 {selectedBed.simulator?.latestSignal?.spO2 ?? '--'} • Glucose {selectedBed.simulator?.latestSignal?.glucose ?? '--'}
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tr('Diagnostics', 'Diagnostics')}</Text>
            <Text style={styles.meta}>{tr('Mode', 'Mode')}: {diagnostics?.mode || 'IDLE'}</Text>
            <Text style={styles.meta}>{tr('Connected', 'Connecte')}: {diagnostics?.connected ? tr('YES', 'OUI') : tr('NO', 'NON')}</Text>
            <Text style={styles.meta}>{tr('Tick count', 'Nombre ticks')}: {diagnostics?.tickCount ?? 0}</Text>
            <Text style={styles.meta}>{tr('Event count', 'Nombre evenements')}: {diagnostics?.eventCount ?? 0}</Text>
            <Text style={styles.meta}>{tr('Current profile', 'Profil actuel')}: {diagnostics?.currentProfile || '--'}</Text>
            <Text style={styles.meta}>{tr('Session id', 'Id session')}: {diagnostics?.sessionId || '--'}</Text>
            <Text style={styles.meta}>{tr('Last tick', 'Dernier tick')}: {diagnostics?.lastTickAt ? new Date(diagnostics.lastTickAt).toLocaleString() : '--'}</Text>
            {diagnostics?.lastError ? <Text style={styles.error}>{tr('Last error', 'Derniere erreur')}: {diagnostics.lastError}</Text> : null}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.timelineHeaderRow}>
              <Text style={styles.sectionTitle}>{tr('Timeline Mode', 'Mode timeline')}</Text>
              <Pressable style={styles.secondaryBtn} onPress={addTimelineStep}>
                <Text style={styles.secondaryBtnText}>{tr('Add Step', 'Ajouter etape')}</Text>
              </Pressable>
            </View>

            {timelineSteps.map((step, index) => (
              <View key={`${step.profile}-${index}`} style={styles.timelineStepCard}>
                <Text style={styles.fieldLabel}>{tr('Step', 'Etape')} {index + 1}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={tr('Duration (sec)', 'Duree (sec)')}
                  placeholderTextColor={colors.textMuted}
                  value={step.durationSec}
                  onChangeText={(value) => updateTimelineDuration(index, value)}
                  keyboardType="numeric"
                />
                <View style={styles.chipsRow}>
                  {profiles.map((value) => (
                    <Pressable
                      key={`${value}-${index}`}
                      onPress={() => updateTimelineProfile(index, value)}
                      style={[styles.chip, step.profile === value ? styles.chipActive : null]}
                    >
                      <Text style={step.profile === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.timelineActionsRow}>
                  <Pressable
                    style={styles.iconDangerBtn}
                    disabled={timelineSteps.length <= 1}
                    onPress={() => removeTimelineStep(index)}
                  >
                    <Text style={styles.iconDangerBtnText}>{tr('Remove', 'Supprimer')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <Pressable
              style={[styles.warningBtn, !canControl ? styles.btnDisabled : null]}
              disabled={!canControl || actionLoading}
              onPress={() => void startTimeline()}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.warningBtnText}>{tr('Start Timeline', 'Demarrer timeline')}</Text>}
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tr('Replay Sessions', 'Sessions replay')}</Text>
            <TextInput
              style={styles.input}
              placeholder={tr('Replay speed (1 = normal)', 'Vitesse replay (1 = normale)')}
              placeholderTextColor={colors.textMuted}
              value={replaySpeed}
              onChangeText={setReplaySpeed}
              keyboardType="numeric"
            />

            {sessions.length === 0 ? (
              <Text style={styles.meta}>{tr('No sessions available.', 'Aucune session disponible.')}</Text>
            ) : (
              sessions.map((session) => (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{session.mode} • {session.id}</Text>
                    <Text style={styles.meta}>
                      {new Date(session.startedAt).toLocaleString()} • {(session.points || []).length} points
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.secondaryBtn, !canControl ? styles.btnDisabled : null]}
                    disabled={!canControl || actionLoading}
                    onPress={() => void startReplay(session.id)}
                  >
                    <Text style={styles.secondaryBtnText}>{tr('Replay', 'Replay')}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  bedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bedCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#eff6ff',
  },
  itemTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  runningBadge: {
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  runningBadgeText: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 11,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inputHalf: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryBtn: {
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  warningBtn: {
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  warningBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  dangerBtn: {
    borderRadius: 10,
    backgroundColor: colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineStepCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  timelineActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  iconDangerBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
  },
  iconDangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  sessionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
