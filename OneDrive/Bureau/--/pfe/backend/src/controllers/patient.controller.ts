import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import logger from '../utils/logger';
import {
  Patient,
  Bed,
  VitalSigns,
  Alert,
  Prediction,
  Doctor,
  Nurse,
  UserRole,
  BedStatus,
} from '../models';

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
    const [vitalSigns, alerts, predictions] = await Promise.all([
      VitalSigns.find({ patientId: id })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
      Alert.find({ 
        patientId: id,
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
      })
        .sort({ timestamp: -1 })
        .lean(),
      Prediction.find({ patientId: id })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);

    res.json({
      success: true,
      data: { 
        patient: {
          ...patient,
          vitalSigns,
          alerts,
          predictions
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
      .select('_id assignedDoctor')
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

    const filter: any = { patientId: id };

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

    const filter: any = { patientId: id };
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
