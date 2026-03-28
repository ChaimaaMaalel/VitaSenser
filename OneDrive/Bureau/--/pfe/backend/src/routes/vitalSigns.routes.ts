import { Router } from 'express';
import { authenticate } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

// Placeholder - vital signs routes
router.post('/', (req, res) => res.json({ success: true }));
router.get('/:patientId', (req, res) => res.json({ success: true, data: { vitals: [] } }));

export default router;
