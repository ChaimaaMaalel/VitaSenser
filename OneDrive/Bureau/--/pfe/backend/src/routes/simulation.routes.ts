import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { SimulationProfile, UserRole } from '../models';
import {
  getBedDiagnostics,
  getSimulationStatus,
  listBedSessions,
  listSimulationBeds,
  publishManualSignal,
  startBedReplay,
  setBedSimulationProfile,
  startBedSimulation,
  startBedTimelineSimulation,
  stopBedSimulation,
  RealismLevel,
} from '../services/simulation.service';
import logger from '../utils/logger';

const router = Router();

const parseRealismLevel = (value: unknown): RealismLevel => {
  const normalized = String(value || 'REALISTIC').toUpperCase();
  if (normalized === 'CLEAN' || normalized === 'NOISY' || normalized === 'REALISTIC') {
    return normalized;
  }
  return 'REALISTIC';
};

router.use(authenticate);

router.get('/beds', async (req, res) => {
  try {
    const beds = await listSimulationBeds();
    res.json({
      success: true,
      data: { beds },
    });
  } catch (error: any) {
    logger.error('List simulation beds failed:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list simulation beds', statusCode: 500 },
    });
  }
});

router.get('/beds/:bedId/status', async (req, res) => {
  try {
    const status = await getSimulationStatus(req.params.bedId);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bed not found', statusCode: 404 },
      });
    }

    res.json({
      success: true,
      data: { status },
    });
  } catch (error: any) {
    logger.error('Get simulation status failed:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get simulation status', statusCode: 500 },
    });
  }
});

router.post(
  '/beds/:bedId/start',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req: AuthRequest, res) => {
    try {
      const profileRaw = String(req.body?.profile || SimulationProfile.STABLE).toUpperCase();
      const allowedProfiles = new Set<string>(Object.values(SimulationProfile));
      const profile = allowedProfiles.has(profileRaw)
        ? (profileRaw as SimulationProfile)
        : SimulationProfile.STABLE;

      const intervalInput = Number(req.body?.intervalMs);
      const intervalMs = Number.isFinite(intervalInput)
        ? Math.max(500, Math.min(60_000, intervalInput))
        : 1000;
      const realismLevel = parseRealismLevel(req.body?.realismLevel);

      await startBedSimulation(req.params.bedId, profile, intervalMs, realismLevel);
      const status = await getSimulationStatus(req.params.bedId);

      res.json({
        success: true,
        message: 'Simulation started successfully',
        data: { status },
      });
    } catch (error: any) {
      logger.error('Start simulation failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error?.message || 'Failed to start simulation', statusCode: 500 },
      });
    }
  }
);

router.post(
  '/beds/:bedId/stop',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req, res) => {
    try {
      await stopBedSimulation(req.params.bedId);
      const status = await getSimulationStatus(req.params.bedId);

      res.json({
        success: true,
        message: 'Simulation stopped successfully',
        data: { status },
      });
    } catch (error: any) {
      logger.error('Stop simulation failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error?.message || 'Failed to stop simulation', statusCode: 500 },
      });
    }
  }
);

router.patch(
  '/beds/:bedId/profile',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req, res) => {
    try {
      const profileRaw = String(req.body?.profile || '').toUpperCase();
      if (!Object.values(SimulationProfile).includes(profileRaw as SimulationProfile)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid simulation profile', statusCode: 400 },
        });
      }

      const intervalInput = Number(req.body?.intervalMs);
      const intervalMs = Number.isFinite(intervalInput)
        ? Math.max(500, Math.min(60_000, intervalInput))
        : undefined;
      const realismLevel = parseRealismLevel(req.body?.realismLevel);

      await setBedSimulationProfile(
        req.params.bedId,
        profileRaw as SimulationProfile,
        intervalMs,
        realismLevel
      );
      const status = await getSimulationStatus(req.params.bedId);

      res.json({
        success: true,
        message: 'Simulation profile updated',
        data: { status },
      });
    } catch (error: any) {
      logger.error('Update simulation profile failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error?.message || 'Failed to update simulation profile', statusCode: 500 },
      });
    }
  }
);

router.post(
  '/beds/:bedId/timeline/start',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req, res) => {
    try {
      const stepsRaw = Array.isArray(req.body?.steps) ? req.body.steps : [];
      const steps = stepsRaw.map((step: any) => ({
        profile: String(step?.profile || '').toUpperCase() as SimulationProfile,
        durationSec: Number(step?.durationSec || 1),
      }));

      const intervalInput = Number(req.body?.intervalMs);
      const intervalMs = Number.isFinite(intervalInput)
        ? Math.max(500, Math.min(60_000, intervalInput))
        : 1000;
      const realismLevel = parseRealismLevel(req.body?.realismLevel);

      await startBedTimelineSimulation(req.params.bedId, steps, intervalMs, realismLevel);
      const status = await getSimulationStatus(req.params.bedId);

      res.json({
        success: true,
        message: 'Timeline simulation started',
        data: { status },
      });
    } catch (error: any) {
      logger.error('Start timeline simulation failed:', error);
      res.status(400).json({
        success: false,
        error: { message: error?.message || 'Failed to start timeline simulation', statusCode: 400 },
      });
    }
  }
);

router.post(
  '/beds/:bedId/replay/start',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId || '').trim();
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: { message: 'sessionId is required', statusCode: 400 },
        });
      }

      const speedInput = Number(req.body?.speedMultiplier || 1);
      const speedMultiplier = Number.isFinite(speedInput) ? speedInput : 1;

      await startBedReplay(req.params.bedId, sessionId, speedMultiplier);
      const status = await getSimulationStatus(req.params.bedId);

      res.json({
        success: true,
        message: 'Replay started',
        data: { status },
      });
    } catch (error: any) {
      logger.error('Start replay failed:', error);
      res.status(400).json({
        success: false,
        error: { message: error?.message || 'Failed to start replay', statusCode: 400 },
      });
    }
  }
);

router.get('/beds/:bedId/sessions', async (req, res) => {
  try {
    const sessions = listBedSessions(req.params.bedId);
    res.json({
      success: true,
      data: { sessions },
    });
  } catch (error: any) {
    logger.error('List sessions failed:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list sessions', statusCode: 500 },
    });
  }
});

router.get('/beds/:bedId/diagnostics', async (req, res) => {
  try {
    const diagnostics = getBedDiagnostics(req.params.bedId);
    res.json({
      success: true,
      data: { diagnostics },
    });
  } catch (error: any) {
    logger.error('Get diagnostics failed:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get diagnostics', statusCode: 500 },
    });
  }
});

router.post(
  '/beds/:bedId/manual-signal',
  authorize(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR),
  async (req, res) => {
    try {
      const payload = await publishManualSignal(req.params.bedId, {
        heartRate: req.body?.heartRate,
        temperature: req.body?.temperature,
        spO2: req.body?.spO2,
        glucose: req.body?.glucose,
      });

      if (!payload) {
        return res.status(404).json({
          success: false,
          error: { message: 'Bed not found', statusCode: 404 },
        });
      }

      res.json({
        success: true,
        message: 'Manual signal published',
        data: { signal: payload },
      });
    } catch (error: any) {
      logger.error('Publish manual signal failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error?.message || 'Failed to publish manual signal', statusCode: 500 },
      });
    }
  }
);

export default router;
