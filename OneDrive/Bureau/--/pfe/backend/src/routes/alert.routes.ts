import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { Alert, AlertStatus, Patient, Bed } from '../models';
import { analyzeAndPersistPatientAi } from '../services/ai-analysis.service';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
	try {
		const limitInput = Number(req.query.limit);
		const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(200, limitInput)) : 50;
		const status = String(req.query.status || '').toUpperCase();
		const includeResolved = String(req.query.includeResolved || '').toLowerCase() === 'true';
		const refreshAi = String(req.query.refreshAi || '').toLowerCase() === 'true';

		if (refreshAi) {
			const activePatients = await Patient.find({
				status: { $in: ['STABLE', 'CRITICAL', 'MODERATE', 'RECOVERING'] },
			})
				.select('_id')
				.limit(25)
				.lean();

			await Promise.all(
				activePatients.map(async (patient) => {
					try {
						await analyzeAndPersistPatientAi(String(patient._id), String(req.user?.id || ''), 700);
					} catch (error) {
						logger.warn(`AI refresh failed for patient ${patient._id}: ${error}`);
					}
				})
			);
		}

		const filter: Record<string, any> = {};

		if (status && Object.values(AlertStatus).includes(status as AlertStatus)) {
			filter.status = status;
		} else if (!includeResolved) {
			filter.status = { $in: [AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.ESCALATED] };
		}

		const alerts = await Alert.find(filter)
			.sort({ timestamp: -1 })
			.limit(limit)
			.populate({ path: 'patient', select: '_id firstName lastName status bed gender dateOfBirth' })
			.populate({ path: 'patient.bed', select: '_id bedNumber room', populate: { path: 'room', select: '_id roomNumber name' } })
			.populate({ path: 'vitalSigns', select: 'heartRate spO2 temperature glucose timestamp source bed' })
			.populate({ path: 'vitalSigns.bed', select: '_id bedNumber room', populate: { path: 'room', select: '_id roomNumber name' } })
			.populate({ path: 'acknowledgedBy', select: '_id email role' })
			.lean();

		const isUsableBed = (bed: any) => {
			return Boolean(
				bed &&
				typeof bed === 'object' &&
				((bed.bedNumber && String(bed.bedNumber).trim()) || bed.room)
			);
		};

		const missingPatientIds = new Set<string>();
		const candidateBedIds = new Set<string>();

		alerts.forEach((alert: any) => {
			const patientId = alert?.patient?._id ? String(alert.patient._id) : '';
			if (!patientId) return;

			const bedValue = alert?.patient?.bed;
			if (isUsableBed(bedValue)) return;

			if (bedValue && typeof bedValue !== 'object') {
				candidateBedIds.add(String(bedValue));
			}

			missingPatientIds.add(patientId);
		});

		if (missingPatientIds.size > 0 || candidateBedIds.size > 0) {
			const fallbackBeds = await Bed.find({
				$or: [
					{ patient: { $in: [...missingPatientIds] } },
					{ _id: { $in: [...candidateBedIds] } },
				],
			})
				.select('_id bedNumber room patient')
				.populate({ path: 'room', select: '_id roomNumber name' })
				.lean();

			const bedByPatientId = new Map<string, any>();
			const bedById = new Map<string, any>();

			fallbackBeds.forEach((bed: any) => {
				const bedId = bed?._id ? String(bed._id) : '';
				if (bedId && !bedById.has(bedId)) {
					bedById.set(bedId, bed);
				}

				const patientId = bed?.patient ? String(bed.patient) : '';
				if (patientId && !bedByPatientId.has(patientId)) {
					bedByPatientId.set(patientId, bed);
				}
			});

			alerts.forEach((alert: any) => {
				const patientId = alert?.patient?._id ? String(alert.patient._id) : '';
				if (!patientId) return;

				const bedValue = alert?.patient?.bed;
				if (isUsableBed(bedValue)) return;

				const fallbackByBedId =
					bedValue && typeof bedValue !== 'object'
						? bedById.get(String(bedValue))
						: null;
				const fallbackByPatientId = bedByPatientId.get(patientId);

				const fallbackBed = fallbackByBedId || fallbackByPatientId;
				if (fallbackBed) {
					alert.patient.bed = fallbackBed;
				}
			});
		}

		res.json({
			success: true,
			data: {
				alerts,
			},
		});
	} catch (error: any) {
		logger.error('List alerts failed:', error);
		res.status(500).json({
			success: false,
			error: { message: error?.message || 'Failed to fetch alerts', statusCode: 500 },
		});
	}
});

router.post('/:id/acknowledge', async (req: AuthRequest, res) => {
	try {
		const alert = await Alert.findById(req.params.id);
		if (!alert) {
			return res.status(404).json({
				success: false,
				error: { message: 'Alert not found', statusCode: 404 },
			});
		}

		await alert.acknowledge(String(req.user?.id || ''));

		res.json({
			success: true,
			message: 'Alert acknowledged',
			data: { alertId: alert._id },
		});
	} catch (error: any) {
		logger.error('Acknowledge alert failed:', error);
		res.status(500).json({
			success: false,
			error: { message: error?.message || 'Failed to acknowledge alert', statusCode: 500 },
		});
	}
});

router.post('/:id/resolve', async (req: AuthRequest, res) => {
	try {
		const alert = await Alert.findById(req.params.id);
		if (!alert) {
			return res.status(404).json({
				success: false,
				error: { message: 'Alert not found', statusCode: 404 },
			});
		}

		await alert.resolve();

		res.json({
			success: true,
			message: 'Alert resolved',
			data: { alertId: alert._id },
		});
	} catch (error: any) {
		logger.error('Resolve alert failed:', error);
		res.status(500).json({
			success: false,
			error: { message: error?.message || 'Failed to resolve alert', statusCode: 500 },
		});
	}
});

export default router;
