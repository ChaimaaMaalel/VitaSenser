import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import * as dashboardController from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);

// Role-based dashboard (primary endpoint)
router.get('/', dashboardController.getRoleBasedDashboard);

// Dashboard overview stats (legacy)
router.get('/stats', dashboardController.getDashboardStats);

// Recent alerts
router.get('/recent-alerts', dashboardController.getRecentAlerts);

// Patients overview
router.get('/patients-overview', dashboardController.getPatientsOverview);

// Hospital occupancy
router.get('/occupancy', dashboardController.getOccupancyData);

export default router;
