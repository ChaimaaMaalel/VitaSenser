import mongoose, { Schema, Document, Types } from 'mongoose';
import { User, IUser } from './User.model';

export interface IDoctor extends IUser {
  specialization: string;
  licenseNumber: string;
  department?: string;
  patients: Types.ObjectId[];
}

const doctorSchema = new Schema<IDoctor>({
  specialization: {
    type: String,
    required: true,
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true,
  },
  department: {
    type: String,
  },
  patients: [{
    type: Schema.Types.ObjectId,
    ref: 'Patient',
  }],
});

// Methods
doctorSchema.methods.viewPatients = function () {
  return this.populate('patients');
};

doctorSchema.methods.assignPatient = function (patientId: string) {
  if (!this.patients.includes(patientId as any)) {
    this.patients.push(patientId as any);
  }
  return this.save();
};

doctorSchema.methods.validateAlert = function (alertId: string) {
  // Implementation for validating alerts
};

doctorSchema.methods.prescribeTreatment = function (patientId: string) {
  // Implementation for prescribing treatment
};

doctorSchema.methods.viewPatientHistory = function () {
  // Implementation for viewing patient history
};

doctorSchema.methods.createMedicalProtocol = function () {
  // Implementation for creating medical protocols
};

export const Doctor = User.discriminator<IDoctor>('DOCTOR', doctorSchema);
