import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import * as patientController from '../controllers/patient.controller';
import { UserRole } from '../models';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Patient metadata for CRUD operations
router.get(
  '/metadata',
  authorize(UserRole.ADMIN, UserRole.NURSE),
  patientController.getPatientMetadata
);

// Get all patients (accessible to all authenticated users)
router.get('/', patientController.getAllPatients);

// Get patient by ID
router.get('/:id', patientController.getPatientById);

// Create patient (Admin, Doctor)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.NURSE),
  patientController.createPatient
);

// Update patient
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.NURSE),
  patientController.updatePatient
);

// Admit patient to bed
router.post(
  '/:id/admit',
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE),
  patientController.admitPatient
);

// Discharge patient
router.post(
  '/:id/discharge',
  authorize(UserRole.ADMIN, UserRole.DOCTOR),
  patientController.dischargePatient
);

// Get patient vitals
router.get('/:id/vitals', patientController.getPatientVitals);

// Get patient alerts
router.get('/:id/alerts', patientController.getPatientAlerts);

// Delete patient (Admin only)
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.NURSE),
  patientController.deletePatient
);

export default router;
