import fs from 'fs/promises';
import path from 'path';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import logger from '../utils/logger';
import {
  Patient,
  Bed,
  VitalSigns,
  Alert,
  PatientEvent,
  PatientEventSeverity,
  PatientEventType,
  Prediction,
  PatientDossierFile,
  DossierCategory,
  Doctor,
  Nurse,
  Notification,
  NotificationType,
  UserRole,
  BedStatus,
} from '../models';
import { emitToRoom } from '../realtime/socket';

const patientPopulateConfig = [
  {
    path: 'bed',
    populate: {
      path: 'room',
      populate: {
        path: 'floor',
      },
    },
  },
  {
    path: 'assignedDoctor',
    populate: {
      path: 'user',
      select: 'firstName lastName specialization',
    },
  },
  {
    path: 'assignedNurses',
    populate: {
      path: 'user',
      select: 'firstName lastName role',
    },
  },
];

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
};

const normalizeId = (value: unknown): string | null => {
  if (!value) return null;
  try {
    const id = String(value).trim();
    return id.length ? id : null;
  } catch {
    return null;
  }
};

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const ids = values
    .map((value) => normalizeId(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(ids)];
};

const dossierCategorySet = new Set<DossierCategory>([
  'irm',
  'scanner',
  'radiology',
  'lab',
  'prescription',
  'report',
  'other',
]);

const toDossierCategory = (value: unknown): DossierCategory => {
  const normalized = String(value || 'other').toLowerCase() as DossierCategory;
  if (dossierCategorySet.has(normalized)) {
    return normalized;
  }
  return 'other';
};

const syncDoctorAssignment = async (
  patientId: string,
  previousDoctorId?: unknown,
  nextDoctorId?: unknown
) => {
  const previousId = normalizeId(previousDoctorId);
  const nextId = normalizeId(nextDoctorId);

  if (previousId && previousId !== nextId) {
    await Doctor.findByIdAndUpdate(previousId, { $pull: { patients: patientId } });
  }

  if (nextId) {
    await Doctor.findByIdAndUpdate(nextId, { $addToSet: { patients: patientId } });
  }
};

const syncNurseAssignments = async (
  patientId: string,
  previousNurseIds: unknown,
  nextNurseIds: unknown
) => {
  const previousIds = normalizeIdList(previousNurseIds);
  const nextIds = normalizeIdList(nextNurseIds);

  const toRemove = previousIds.filter((id) => !nextIds.includes(id));
  const toAdd = nextIds.filter((id) => !previousIds.includes(id));

  await Promise.all([
    ...toRemove.map((nurseId) =>
      Nurse.findByIdAndUpdate(nurseId, { $pull: { patients: patientId } })
    ),
    ...toAdd.map((nurseId) =>
      Nurse.findByIdAndUpdate(nurseId, { $addToSet: { patients: patientId } })
    ),
  ]);
};

const clearPatientAssignments = async (
  patientId: string,
  doctorId?: unknown,
  nurseIds?: unknown
) => {
  const normalizedDoctorId = normalizeId(doctorId);
  const normalizedNurseIds = normalizeIdList(nurseIds);

  await Promise.all([
    normalizedDoctorId
      ? Doctor.findByIdAndUpdate(normalizedDoctorId, { $pull: { patients: patientId } })
      : Promise.resolve(),
    ...normalizedNurseIds.map((nurseId) =>
      Nurse.findByIdAndUpdate(nurseId, { $pull: { patients: patientId } })
    ),
  ]);
};

const getPatientDisplayName = (firstName?: string, lastName?: string) => {
  return `${firstName || ''} ${lastName || ''}`.trim() || 'a patient';
};

const emitAssignmentNotifications = async (params: {
  patientId: string;
  patientName: string;
  doctorId?: string | null;
  nurseIds?: string[];
}) => {
  const { patientId, patientName, doctorId, nurseIds = [] } = params;
  const message = `You have a new patient assignment: ${patientName}`;

  const notificationInputs: Array<{
    user: string;
    recipientRole: UserRole;
  }> = [];

  if (doctorId) {
    notificationInputs.push({
      user: doctorId,
      recipientRole: UserRole.DOCTOR,
    });
  }

  for (const nurseId of nurseIds) {
    notificationInputs.push({
      user: nurseId,
      recipientRole: UserRole.NURSE,
    });
  }

  if (notificationInputs.length === 0) {
    return;
  }

  try {
    const createdNotifications = await Notification.insertMany(
      notificationInputs.map((input) => ({
        user: input.user,
        type: NotificationType.ASSIGNMENT,
        message,
        patient: patientId,
        recipientRole: input.recipientRole,
        isRead: false,
      }))
    );

    createdNotifications.forEach((notification) => {
      emitToRoom(`user:${String(notification.user)}`, 'assignment:created', {
        notificationId: String(notification._id),
        kind: 'new-assignment',
        recipientRole: notification.recipientRole,
        patientId,
        patientName,
        assignedAt: notification.createdAt,
        message: notification.message,
      });
    });
  } catch (error: any) {
    logger.warn(`Failed to persist/emit assignment notifications: ${error?.message || error}`);
  }
};

const assignBedToPatient = async (patientId: string, bedId: string) => {
  const bed = await Bed.findOneAndUpdate(
    { _id: bedId, status: BedStatus.AVAILABLE },
    { status: BedStatus.OCCUPIED, patient: patientId },
    { new: true }
  )
    .populate({
      path: 'room',
      select: 'roomNumber',
      populate: { path: 'floor', select: 'floorNumber' },
    })
    .lean();

  if (!bed) {
    return null;
  }

  await Patient.findByIdAndUpdate(patientId, { bed: bedId });
  return bed;
};

const releaseBedFromPatient = async (
  patientId: string,
  bedId?: string | null,
  options?: { preservePatientReference?: boolean }
) => {
  if (!bedId) return;
  const updates: Promise<any>[] = [
    Bed.findByIdAndUpdate(bedId, {
      status: BedStatus.AVAILABLE,
      patient: null,
    }),
  ];

  if (!options?.preservePatientReference) {
    updates.push(Patient.findByIdAndUpdate(patientId, { $set: { bed: null } }));
  }

  await Promise.all(updates);
};

// Get all patients
export const getAllPatients = async (req: AuthRequest, res: Response) => {
  try {
    const { status, doctorId, page = 1, limit = 10 } = req.query;
    
    const filter: any = {};
    
    if (status) filter.status = status;
    if (doctorId) filter.assignedDoctor = doctorId;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .populate(patientPopulateConfig)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      Patient.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        patients,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    logger.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch patients', statusCode: 500 },
    });
  }
};

// Metadata for patient management
export const getPatientMetadata = async (req: AuthRequest, res: Response) => {
  try {
    const [doctors, nurses, beds] = await Promise.all([
      Doctor.find({ isActive: true })
        .select('_id firstName lastName specialization')
        .lean(),
      Nurse.find({ isActive: true })
        .select('_id firstName lastName shift')
        .lean(),
      Bed.find({ status: BedStatus.AVAILABLE })
        .populate({
          path: 'room',
          select: 'roomNumber',
          populate: { path: 'floor', select: 'floorNumber' },
        })
        .select('_id bedNumber status room')
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        doctors,
        nurses,
        beds,
      },
    });
  } catch (error: any) {
    logger.error('Get patient metadata error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load patient metadata', statusCode: 500 },
    });
  }
};

// Get patient by ID
export const getPatientById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findById(id)
      .populate(patientPopulateConfig)
      .lean();

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    // Get related data
    const [vitalSigns, alerts, predictions, events] = await Promise.all([
      VitalSigns.find({ $or: [{ patient: id }, { patientId: id as any }] })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
      Alert.find({ 
        $or: [{ patient: id }, { patientId: id as any }],
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
      })
        .sort({ timestamp: -1 })
        .lean(),
      Prediction.find({ $or: [{ patient: id }, { patientId: id as any }] })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
      PatientEvent.find({ patient: id })
        .sort({ eventTime: -1 })
        .limit(30)
        .lean(),
    ]);

    res.json({
      success: true,
      data: { 
        patient: {
          ...patient,
          vitalSigns,
          alerts,
          predictions,
          events,
        }
      },
    });
  } catch (error: any) {
    logger.error('Get patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch patient', statusCode: 500 },
    });
  }
};

// Create patient
export const createPatient = async (req: AuthRequest, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      profilePicture,
      dateOfBirth,
      gender,
      bloodType,
      medicalHistory,
      allergies,
      assignedDoctorId,
      assignedNurseIds = [],
      bedId,
      status,
    } = req.body;
    const uploadedProfilePicture = req.file
      ? `/uploads/profile-pictures/${req.file.filename}`
      : undefined;
    const resolvedAllergies = parseStringArray(allergies);
    const resolvedNurseIds = parseStringArray(assignedNurseIds);

    const nurseAssignments =
      req.user?.role === UserRole.NURSE
        ? [req.user.id]
        : resolvedNurseIds
        ? resolvedNurseIds
        : [];

    const patient = await Patient.create({
      firstName,
      lastName,
      profilePicture: uploadedProfilePicture || profilePicture || undefined,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      bloodType,
      medicalHistory,
      allergies: resolvedAllergies,
      status,
      assignedDoctor: assignedDoctorId || undefined,
      assignedNurses: nurseAssignments,
    });

    await Promise.all([
      syncDoctorAssignment(patient._id.toString(), undefined, patient.assignedDoctor),
      syncNurseAssignments(patient._id.toString(), [], patient.assignedNurses),
    ]);

    if (bedId) {
      const assignedBed = await assignBedToPatient(patient._id.toString(), bedId);
      if (!assignedBed) {
        await Patient.findByIdAndDelete(patient._id);
        return res.status(400).json({
          success: false,
          error: { message: 'Selected bed is not available', statusCode: 400 },
        });
      }
    }

    const populatedPatient = await Patient.findById(patient._id)
      .populate(patientPopulateConfig)
      .lean();

    await emitAssignmentNotifications({
      patientId: patient._id.toString(),
      patientName: getPatientDisplayName(patient.firstName, patient.lastName),
      doctorId: normalizeId(patient.assignedDoctor),
      nurseIds: normalizeIdList(patient.assignedNurses),
    });

    logger.info(`Patient created: ${patient.firstName} ${patient.lastName} (ID: ${patient._id})`);

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: { patient: populatedPatient },
    });
  } catch (error: any) {
    logger.error('Create patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create patient', statusCode: 500 },
    });
  }
};

// Update patient
export const updatePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      assignedDoctorId,
      assignedNurseIds,
      bedId,
      removeProfilePicture,
      ...updateData
    } = req.body;

    if (req.file) {
      updateData.profilePicture = `/uploads/profile-pictures/${req.file.filename}`;
    } else if (removeProfilePicture === 'true' || removeProfilePicture === true) {
      updateData.profilePicture = undefined;
    } else if (Object.prototype.hasOwnProperty.call(updateData, 'profilePicture')) {
      updateData.profilePicture = updateData.profilePicture || undefined;
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'allergies')) {
      updateData.allergies = parseStringArray(updateData.allergies);
    }

    const resolvedNurseIds = parseStringArray(assignedNurseIds);

    const patientDoc = await Patient.findById(id);

    if (!patientDoc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    const previousDoctorId = patientDoc.assignedDoctor;
    const previousNurseIds = [...patientDoc.assignedNurses];

    Object.assign(patientDoc, updateData);

    if (typeof assignedDoctorId !== 'undefined') {
      patientDoc.assignedDoctor = assignedDoctorId || undefined;
    }

    if (req.user?.role === UserRole.NURSE) {
      patientDoc.assignedNurses = [req.user.id] as any;
    } else if (resolvedNurseIds.length > 0 || typeof assignedNurseIds !== 'undefined') {
      patientDoc.assignedNurses = resolvedNurseIds as any;
    }

    const currentBedId = patientDoc.bed ? patientDoc.bed.toString() : null;

    if (typeof bedId !== 'undefined') {
      if (!bedId && currentBedId) {
        await releaseBedFromPatient(patientDoc._id.toString(), currentBedId);
        patientDoc.bed = undefined as any;
      } else if (bedId && bedId !== currentBedId) {
        const assignedBed = await assignBedToPatient(patientDoc._id.toString(), bedId);
        if (!assignedBed) {
          return res.status(400).json({
            success: false,
            error: { message: 'Selected bed is not available', statusCode: 400 },
          });
        }
        if (currentBedId) {
          await releaseBedFromPatient(patientDoc._id.toString(), currentBedId, {
            preservePatientReference: true,
          });
        }
        patientDoc.bed = bedId as any;
      }
    }

    await patientDoc.save();

    await Promise.all([
      syncDoctorAssignment(
        patientDoc._id.toString(),
        previousDoctorId,
        patientDoc.assignedDoctor
      ),
      syncNurseAssignments(
        patientDoc._id.toString(),
        previousNurseIds,
        patientDoc.assignedNurses
      ),
    ]);

    const previousDoctorNormalized = normalizeId(previousDoctorId);
    const nextDoctorNormalized = normalizeId(patientDoc.assignedDoctor);
    const previousNurseNormalized = normalizeIdList(previousNurseIds);
    const nextNurseNormalized = normalizeIdList(patientDoc.assignedNurses);

    const newDoctorAssignment =
      nextDoctorNormalized && nextDoctorNormalized !== previousDoctorNormalized
        ? nextDoctorNormalized
        : null;
    const newNurseAssignments = nextNurseNormalized.filter(
      (nurseId) => !previousNurseNormalized.includes(nurseId)
    );

    if (newDoctorAssignment || newNurseAssignments.length > 0) {
      await emitAssignmentNotifications({
        patientId: patientDoc._id.toString(),
        patientName: getPatientDisplayName(patientDoc.firstName, patientDoc.lastName),
        doctorId: newDoctorAssignment,
        nurseIds: newNurseAssignments,
      });
    }

    const patient = await Patient.findById(patientDoc._id)
      .populate(patientPopulateConfig)
      .lean();

    logger.info(`Patient updated: ${id}`);

    res.json({
      success: true,
      message: 'Patient updated successfully',
      data: { patient },
    });
  } catch (error: any) {
    logger.error('Update patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update patient', statusCode: 500 },
    });
  }
};

// Admit patient
export const admitPatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { bedId, assignedDoctorId } = req.body;

    const existingPatient = await Patient.findById(id)
      .select('_id firstName lastName assignedDoctor')
      .lean();

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    // Check if bed is available
    const bed = await Bed.findById(bedId).lean();

    if (!bed || bed.status !== 'AVAILABLE') {
      return res.status(400).json({
        success: false,
        error: { message: 'Bed is not available', statusCode: 400 },
      });
    }

    // Update patient and bed
    const [patient] = await Promise.all([
      Patient.findByIdAndUpdate(
        id,
        {
          bed: bedId,
          assignedDoctor: assignedDoctorId,
          status: 'IN_TREATMENT',
          admissionDate: new Date(),
        },
        { new: true }
      )
        .populate({
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        })
        .populate({
          path: 'assignedDoctor',
          populate: {
            path: 'user'
          }
        })
        .lean(),
      Bed.findByIdAndUpdate(bedId, { status: 'OCCUPIED' }),
    ]);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    await syncDoctorAssignment(
      existingPatient._id.toString(),
      existingPatient.assignedDoctor,
      assignedDoctorId
    );

    const previousDoctorId = normalizeId(existingPatient.assignedDoctor);
    const nextDoctorId = normalizeId(assignedDoctorId);

    if (nextDoctorId && nextDoctorId !== previousDoctorId) {
      await emitAssignmentNotifications({
        patientId: existingPatient._id.toString(),
        patientName: getPatientDisplayName(existingPatient.firstName, existingPatient.lastName),
        doctorId: nextDoctorId,
      });
    }

    logger.info(`Patient admitted: ${id} to bed ${bedId}`);

    res.json({
      success: true,
      message: 'Patient admitted successfully',
      data: { patient },
    });
  } catch (error: any) {
    logger.error('Admit patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to admit patient', statusCode: 500 },
    });
  }
};

// Discharge patient
export const dischargePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const patientData = await Patient.findById(id).select('bed').lean();

    if (!patientData) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    const updatePromises: Promise<any>[] = [
      Patient.findByIdAndUpdate(
        id,
        {
          status: 'DISCHARGED',
          dischargeDate: new Date(),
          bed: null,
        },
        { new: true }
      ).lean()
    ];

    if (patientData.bed) {
      updatePromises.push(
        Bed.findByIdAndUpdate(patientData.bed, { status: 'AVAILABLE' })
      );
    }

    const [patient] = await Promise.all(updatePromises);

    logger.info(`Patient discharged: ${id}`);

    res.json({
      success: true,
      message: 'Patient discharged successfully',
      data: { patient },
    });
  } catch (error: any) {
    logger.error('Discharge patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to discharge patient', statusCode: 500 },
    });
  }
};

// Get patient vitals
export const getPatientVitals = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50, timeRange } = req.query;

    const filter: any = { $or: [{ patient: id }, { patientId: id as any }] };

    if (timeRange) {
      const hours = Number(timeRange);
      filter.timestamp = {
        $gte: new Date(Date.now() - hours * 60 * 60 * 1000),
      };
    }

    const vitals = await VitalSigns.find(filter)
      .limit(Number(limit))
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: { vitals },
    });
  } catch (error: any) {
    logger.error('Get patient vitals error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch vitals', statusCode: 500 },
    });
  }
};

// Get patient alerts
export const getPatientAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const filter: any = { $or: [{ patient: id }, { patientId: id as any }] };
    if (status) filter.status = status;

    const alerts = await Alert.find(filter)
      .populate('vitalSignsId')
      .populate({
        path: 'acknowledgedById',
        select: '_id firstName lastName role'
      })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: { alerts },
    });
  } catch (error: any) {
    logger.error('Get patient alerts error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch alerts', statusCode: 500 },
    });
  }
};

// Get patient timeline events
export const getPatientEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, severity, limit = 100, from, to } = req.query;

    const filter: any = { patient: id };

    if (type && Object.values(PatientEventType).includes(String(type).toLowerCase() as PatientEventType)) {
      filter.type = String(type).toLowerCase();
    }

    if (
      severity &&
      Object.values(PatientEventSeverity).includes(String(severity).toLowerCase() as PatientEventSeverity)
    ) {
      filter.severity = String(severity).toLowerCase();
    }

    if (from || to) {
      filter.eventTime = {};
      if (from) filter.eventTime.$gte = new Date(String(from));
      if (to) filter.eventTime.$lte = new Date(String(to));
    }

    const events = await PatientEvent.find(filter)
      .sort({ eventTime: -1 })
      .limit(Math.max(1, Math.min(300, Number(limit))))
      .lean();

    res.json({
      success: true,
      data: { events },
    });
  } catch (error: any) {
    logger.error('Get patient events error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch patient events', statusCode: 500 },
    });
  }
};

// Create patient timeline event
export const createPatientEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      type,
      severity,
      title,
      description,
      reason,
      details,
      notes,
      actor,
      eventTime,
    } = req.body || {};

    const normalizedType = String(type || '').toLowerCase();
    const normalizedSeverity = String(severity || PatientEventSeverity.NORMAL).toLowerCase();

    if (!Object.values(PatientEventType).includes(normalizedType as PatientEventType)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid event type', statusCode: 400 },
      });
    }

    if (!Object.values(PatientEventSeverity).includes(normalizedSeverity as PatientEventSeverity)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid event severity', statusCode: 400 },
      });
    }

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: { message: 'title and description are required', statusCode: 400 },
      });
    }

    const parsedNotes = parseStringArray(notes);

    const event = await PatientEvent.create({
      patient: id,
      type: normalizedType,
      severity: normalizedSeverity,
      title: String(title),
      description: String(description),
      reason: reason ? String(reason) : undefined,
      details: details ? String(details) : undefined,
      notes: parsedNotes,
      actor: actor ? String(actor) : req.user?.email || 'System',
      eventTime: eventTime ? new Date(String(eventTime)) : new Date(),
      createdBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      message: 'Patient event created successfully',
      data: { event },
    });
  } catch (error: any) {
    logger.error('Create patient event error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create patient event', statusCode: 500 },
    });
  }
};

// Update patient timeline event
export const updatePatientEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id, eventId } = req.params;
    const payload = req.body || {};

    const event = await PatientEvent.findOne({ _id: eventId, patient: id });
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient event not found', statusCode: 404 },
      });
    }

    if (typeof payload.type !== 'undefined') {
      const nextType = String(payload.type).toLowerCase();
      if (!Object.values(PatientEventType).includes(nextType as PatientEventType)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid event type', statusCode: 400 },
        });
      }
      event.type = nextType as PatientEventType;
    }

    if (typeof payload.severity !== 'undefined') {
      const nextSeverity = String(payload.severity).toLowerCase();
      if (!Object.values(PatientEventSeverity).includes(nextSeverity as PatientEventSeverity)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid event severity', statusCode: 400 },
        });
      }
      event.severity = nextSeverity as PatientEventSeverity;
    }

    if (typeof payload.title !== 'undefined') event.title = String(payload.title);
    if (typeof payload.description !== 'undefined') event.description = String(payload.description);
    if (typeof payload.reason !== 'undefined') event.reason = payload.reason ? String(payload.reason) : undefined;
    if (typeof payload.details !== 'undefined') event.details = payload.details ? String(payload.details) : undefined;
    if (typeof payload.notes !== 'undefined') event.notes = parseStringArray(payload.notes);
    if (typeof payload.actor !== 'undefined') event.actor = payload.actor ? String(payload.actor) : undefined;
    if (typeof payload.eventTime !== 'undefined') {
      event.eventTime = payload.eventTime ? new Date(String(payload.eventTime)) : event.eventTime;
    }

    await event.save();

    res.json({
      success: true,
      message: 'Patient event updated successfully',
      data: { event },
    });
  } catch (error: any) {
    logger.error('Update patient event error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update patient event', statusCode: 500 },
    });
  }
};

// Delete patient timeline event
export const deletePatientEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id, eventId } = req.params;

    const event = await PatientEvent.findOneAndDelete({ _id: eventId, patient: id }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient event not found', statusCode: 404 },
      });
    }

    res.json({
      success: true,
      message: 'Patient event deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete patient event error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete patient event', statusCode: 500 },
    });
  }
};

// Get patient dossier files
export const getPatientDossierFiles = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const files = await PatientDossierFile.find({ patient: id })
      .sort({ uploadedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: { files },
    });
  } catch (error: any) {
    logger.error('Get patient dossier files error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch patient dossier files', statusCode: 500 },
    });
  }
};

// Upload patient dossier file
export const uploadPatientDossierFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: 'No file uploaded', statusCode: 400 },
      });
    }

    const category = toDossierCategory(req.body?.category);
    const label = req.body?.label ? String(req.body.label).trim() : undefined;
    const notes = req.body?.notes ? String(req.body.notes).trim() : undefined;

    const uploadedFile = await PatientDossierFile.create({
      patient: id,
      category,
      label,
      notes,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/patient-dossier/${req.file.filename}`,
      uploadedBy: req.user?.id,
      uploadedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Patient dossier file uploaded successfully',
      data: { file: uploadedFile },
    });
  } catch (error: any) {
    logger.error('Upload patient dossier file error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to upload patient dossier file', statusCode: 500 },
    });
  }
};

// Delete patient dossier file
export const deletePatientDossierFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id, fileId } = req.params;

    const fileRecord = await PatientDossierFile.findOneAndDelete({
      _id: fileId,
      patient: id,
    }).lean();

    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        error: { message: 'Dossier file not found', statusCode: 404 },
      });
    }

    const relativePath = String(fileRecord.path || '').replace(/^\/+/, '');
    if (relativePath) {
      const absolutePath = path.join(process.cwd(), relativePath);
      try {
        await fs.unlink(absolutePath);
      } catch {
        logger.warn(`Dossier file missing on disk: ${absolutePath}`);
      }
    }

    res.json({
      success: true,
      message: 'Dossier file deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete patient dossier file error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete patient dossier file', statusCode: 500 },
    });
  }
};

// Delete patient
export const deletePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findById(id).select('bed assignedDoctor assignedNurses');

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Patient not found', statusCode: 404 },
      });
    }

    if (patient.bed) {
      await releaseBedFromPatient(patient._id.toString(), patient.bed.toString());
    }

    await clearPatientAssignments(
      patient._id.toString(),
      patient.assignedDoctor,
      patient.assignedNurses
    );

    await Patient.findByIdAndDelete(id);

    logger.info(`Patient deleted: ${id}`);

    res.json({
      success: true,
      message: 'Patient deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete patient error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete patient', statusCode: 500 },
    });
  }
};
