import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { Bed, VitalSigns, VitalSource } from '../models';

const router = Router();
router.use(authenticate);

router.post('/', async (req, res) => {
	const {
		patientId,
		bedId,
		heartRate,
		temperature,
		spO2,
		glucose,
		systolicBP,
		diastolicBP,
		respiratoryRate,
		source,
	} = req.body || {};

	const resolvedSource = Object.values(VitalSource).includes(source)
		? source
		: VitalSource.DEVICE;

	let resolvedBedId = bedId;
	if (!resolvedBedId && patientId) {
		const bed = await Bed.findOne({ patient: patientId }).select('_id').lean();
		resolvedBedId = bed?._id;
	}

	if (!resolvedBedId) {
		return res.status(400).json({
			success: false,
			error: { message: 'bedId is required (directly or via patient assignment)', statusCode: 400 },
		});
	}

	const vital = await VitalSigns.create({
		patient: patientId || undefined,
		bed: resolvedBedId,
		heartRate,
		temperature,
		spO2,
		glucose,
		systolicBP,
		diastolicBP,
		respiratoryRate,
		source: resolvedSource,
	});

	res.status(201).json({
		success: true,
		data: { vital },
	});
});

router.get('/', async (req, res) => {
	const { patientId, bedId, limit = 50 } = req.query;

	const filter: Record<string, unknown> = {};
	if (patientId) filter.patient = patientId;
	if (bedId) filter.bed = bedId;

	const vitals = await VitalSigns.find(filter)
		.sort({ timestamp: -1 })
		.limit(Number(limit))
		.lean();

	res.json({
		success: true,
		data: { vitals },
	});
});

router.get('/patient/:patientId', async (req, res) => {
	const { patientId } = req.params;
	const { limit = 50 } = req.query;

	const vitals = await VitalSigns.find({ patient: patientId })
		.sort({ timestamp: -1 })
		.limit(Number(limit))
		.lean();

	res.json({
		success: true,
		data: { vitals },
	});
});

router.get('/bed/:bedId', async (req, res) => {
	const { bedId } = req.params;
	const { limit = 50 } = req.query;

	const vitals = await VitalSigns.find({ bed: bedId })
		.sort({ timestamp: -1 })
		.limit(Number(limit))
		.lean();

	res.json({
		success: true,
		data: { vitals },
	});
});

export default router;
