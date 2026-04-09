import { AlertTriangle, BellRing } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface EmergencyAlertRecord {
  _id?: string;
  id?: string;
  type?: string;
  severity?: string;
  status?: string;
  message?: string;
  timestamp?: string;
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    bed?: {
      _id?: string;
      bedNumber?: string;
      room?: {
        _id?: string;
        roomNumber?: string;
        name?: string;
      } | null;
    } | null;
  } | null;
  vitalSigns?: {
    bed?: {
      _id?: string;
      bedNumber?: string;
      room?: {
        _id?: string;
        roomNumber?: string;
        name?: string;
      } | null;
    } | null;
  } | null;
}

interface EmergencyAlertModalProps {
  isOpen: boolean;
  alerts: EmergencyAlertRecord[];
  language: 'en' | 'fr';
  onClose: () => void;
  onAcknowledge: () => void;
  onOpenAlerts: () => void;
  isAcknowledgeLoading?: boolean;
}

const tr = (language: 'en' | 'fr', en: string, fr: string) =>
  language === 'fr' ? fr : en;

const getAlertId = (alert: EmergencyAlertRecord) => alert._id || alert.id || '';

const getPatientName = (alert: EmergencyAlertRecord) => {
  if (!alert.patient) return null;
  const firstName = alert.patient.firstName || '';
  const lastName = alert.patient.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || null;
};

const getPatientLocation = (alert: EmergencyAlertRecord) => {
  const bed = alert.patient?.bed || alert.vitalSigns?.bed || null;
  const room = bed?.room || null;

  const roomNumber = room?.roomNumber || null;
  const roomName = room?.name || null;
  const bedNumber = bed?.bedNumber || null;

  return {
    roomNumber,
    roomName,
    bedNumber,
  };
};

export default function EmergencyAlertModal({
  isOpen,
  alerts,
  language,
  onClose,
  onAcknowledge,
  onOpenAlerts,
  isAcknowledgeLoading = false,
}: EmergencyAlertModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousAlertIdsRef = useRef<Set<string>>(new Set());
  const clearHighlightsTimeoutRef = useRef<number | null>(null);
  const clearBannerTimeoutRef = useRef<number | null>(null);
  const [highlightedAlertIds, setHighlightedAlertIds] = useState<Set<string>>(new Set());
  const [newCasesCount, setNewCasesCount] = useState(0);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio('/sound.mp3');
      audio.loop = true;
      audio.preload = 'auto';
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isOpen && alerts.length > 0) {
      void audio.play().catch(() => {
        // Browser autoplay policies can block audio until user interaction.
      });
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }, [isOpen, alerts.length]);

  useEffect(() => {
    return () => {
      if (clearHighlightsTimeoutRef.current !== null) {
        window.clearTimeout(clearHighlightsTimeoutRef.current);
      }
      if (clearBannerTimeoutRef.current !== null) {
        window.clearTimeout(clearBannerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      previousAlertIdsRef.current = new Set();
      setHighlightedAlertIds(new Set());
      setNewCasesCount(0);
      if (clearHighlightsTimeoutRef.current !== null) {
        window.clearTimeout(clearHighlightsTimeoutRef.current);
        clearHighlightsTimeoutRef.current = null;
      }
      if (clearBannerTimeoutRef.current !== null) {
        window.clearTimeout(clearBannerTimeoutRef.current);
        clearBannerTimeoutRef.current = null;
      }
      return;
    }

    const currentIds = alerts
      .map((alert) => getAlertId(alert))
      .filter((id): id is string => Boolean(id));

    if (currentIds.length === 0) {
      return;
    }

    if (previousAlertIdsRef.current.size === 0) {
      previousAlertIdsRef.current = new Set(currentIds);
      return;
    }

    const addedIds = currentIds.filter(
      (id) => !previousAlertIdsRef.current.has(id)
    );
    previousAlertIdsRef.current = new Set(currentIds);

    if (addedIds.length === 0) {
      return;
    }

    setHighlightedAlertIds((prev) => {
      const next = new Set(prev);
      addedIds.forEach((id) => next.add(id));
      return next;
    });
    setNewCasesCount(addedIds.length);

    if (clearHighlightsTimeoutRef.current !== null) {
      window.clearTimeout(clearHighlightsTimeoutRef.current);
    }
    if (clearBannerTimeoutRef.current !== null) {
      window.clearTimeout(clearBannerTimeoutRef.current);
    }

    clearHighlightsTimeoutRef.current = window.setTimeout(() => {
      setHighlightedAlertIds(new Set());
      clearHighlightsTimeoutRef.current = null;
    }, 5000);

    clearBannerTimeoutRef.current = window.setTimeout(() => {
      setNewCasesCount(0);
      clearBannerTimeoutRef.current = null;
    }, 4000);
  }, [isOpen, alerts]);

  if (!isOpen || alerts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="emergency-modal-vibrate w-full max-w-2xl rounded-xl border-2 border-red-300 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-5 py-4 rounded-t-xl">
          <div className="rounded-full bg-red-100 p-2">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
              {tr(language, 'Emergency Alert', 'Alerte d urgence')}
            </p>
            <h2 className="text-lg font-bold text-red-800">
              {alerts.length > 1
                ? tr(
                    language,
                    `Immediate medical assistance required (${alerts.length} cases)`,
                    `Assistance medicale immediate requise (${alerts.length} cas)`
                  )
                : tr(
                    language,
                    'Immediate medical assistance required',
                    'Assistance medicale immediate requise'
                  )}
            </h2>
          </div>
          <BellRing className="h-5 w-5 text-red-500 animate-pulse" />
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-3">
          {newCasesCount > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-100 px-3 py-2">
              <p className="text-sm font-semibold text-red-800">
                {tr(
                  language,
                  `+${newCasesCount} new case${newCasesCount > 1 ? 's' : ''} just arrived`,
                  `+${newCasesCount} nouveau${newCasesCount > 1 ? 'x' : ''} cas vient d arriver`
                )}
              </p>
            </div>
          ) : null}

          {alerts.map((alert) => {
            const patientName = getPatientName(alert);
            const patientLocation = getPatientLocation(alert);
            const alertId = getAlertId(alert);
            const isNewlyAdded = Boolean(alertId) && highlightedAlertIds.has(alertId);

            return (
              <div
                key={alertId || `${alert.timestamp || ''}-${alert.message || ''}`}
                className={`rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-2 ${
                  isNewlyAdded ? 'emergency-case-added' : ''
                }`}
              >
                {isNewlyAdded ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                    {tr(language, 'New case added', 'Nouveau cas ajoute')}
                  </p>
                ) : null}

                {patientName ? (
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">
                      {tr(language, 'Patient', 'Patient')}:
                    </span>{' '}
                    {patientName}
                  </p>
                ) : null}

                {patientLocation.roomNumber || patientLocation.roomName || patientLocation.bedNumber ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-2">
                      {tr(language, 'Patient Location', 'Emplacement du patient')}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">
                        {tr(language, 'Room', 'Chambre')}: {patientLocation.roomNumber || patientLocation.roomName || '-'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-rose-700 px-3 py-1 text-sm font-semibold text-white">
                        {tr(language, 'Bed', 'Lit')}: {patientLocation.bedNumber || '-'}
                      </span>
                    </div>
                  </div>
                ) : null}

                <p className="text-sm text-gray-800 leading-6">
                  {alert.message ||
                    tr(
                      language,
                      'Critical patient condition detected.',
                      'Etat critique detecte pour le patient.'
                    )}
                </p>

                <div className="flex flex-wrap gap-2">
                  <span className="badge badge-danger">
                    {String(alert.severity || '').toUpperCase() || 'CRITICAL'}
                  </span>
                  <span className="badge badge-warning">
                    {String(alert.type || '').toUpperCase() || 'EMERGENCY'}
                  </span>
                  <span className="badge badge-info">
                    {String(alert.status || '').toUpperCase() || 'PENDING'}
                  </span>
                </div>

                {alert.timestamp ? (
                  <p className="text-xs text-gray-500">
                    {tr(language, 'Detected at', 'Detecte a')}:{' '}
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {tr(language, 'Dismiss', 'Fermer')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onOpenAlerts}>
            {tr(language, 'Open Alerts Page', 'Ouvrir la page alertes')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onAcknowledge}
            disabled={isAcknowledgeLoading}
          >
            {isAcknowledgeLoading
              ? tr(language, 'Acknowledging...', 'Confirmation...')
              : alerts.length > 1
                ? tr(language, 'Acknowledge All', 'Confirmer tout')
                : tr(language, 'Acknowledge Now', 'Confirmer maintenant')}
          </button>
        </div>
      </div>
    </div>
  );
}
