import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { Patient, VitalSigns } from '../models';
import { analyzeAndPersistPatientAi } from '../services/ai-analysis.service';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

router.get('/patients/:id/analysis', async (req: AuthRequest, res) => {
  try {
    const patientId = String(req.params.id || '').trim();
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Patient id is required', statusCode: 400 },
      });
    }

    const patient = await Patient.findById(patientId).select('_id firstName lastName').lean();
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    const limitInput = Number(req.query.limit);
    const limit = Number.isFinite(limitInput) ? Math.max(60, Math.min(2000, limitInput)) : 700;

    const result = await analyzeAndPersistPatientAi(
      patientId,
      String(req.user?.id || ''),
      limit
    );

    res.json({
      success: true,
      data: {
        patient,
        vitalsCount: result.vitalsCount,
        analysis: result.analysis,
        persistedAlertsCount: result.persistedAlerts.length,
        persistedPredictionsCount: result.persistedPredictions.length,
      },
    });
  } catch (error: any) {
    logger.error('AI patient analysis failed:', error);
    res.status(500).json({
      success: false,
      error: { message: error?.message || 'AI analysis failed', statusCode: 500 },
    });
  }
});

router.post('/patients/:id/analysis/refresh', async (req: AuthRequest, res) => {
  try {
    const patientId = String(req.params.id || '').trim();
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Patient id is required', statusCode: 400 },
      });
    }

    const hasVitals = await VitalSigns.exists({ patient: patientId });
    if (!hasVitals) {
      return res.status(404).json({
        success: false,
        error: { message: 'No vitals found for this patient', statusCode: 404 },
      });
    }

    const limitInput = Number(req.body?.limit);
    const limit = Number.isFinite(limitInput) ? Math.max(60, Math.min(2000, limitInput)) : 700;

    const result = await analyzeAndPersistPatientAi(
      patientId,
      String(req.user?.id || ''),
      limit
    );

    res.json({
      success: true,
      message: 'AI analysis refreshed',
      data: {
        vitalsCount: result.vitalsCount,
        analysis: result.analysis,
        persistedAlertsCount: result.persistedAlerts.length,
        persistedPredictionsCount: result.persistedPredictions.length,
      },
    });
  } catch (error: any) {
    logger.error('AI refresh failed:', error);
    res.status(500).json({
      success: false,
      error: { message: error?.message || 'AI refresh failed', statusCode: 500 },
    });
  }
});

export default router;
