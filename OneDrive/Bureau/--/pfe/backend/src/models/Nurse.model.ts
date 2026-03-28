import mongoose, { Schema, Document, Types } from 'mongoose';
import { User, IUser } from './User.model';

export enum ShiftType {
  DAY = 'DAY',
  NIGHT = 'NIGHT',
  EVENING = 'EVENING'
}

export interface INurse extends IUser {
  shift: ShiftType;
  certificationLevel?: string;
  department?: string;
  assignedFloor?: Types.ObjectId;
  patients: Types.ObjectId[];
}

const nurseSchema = new Schema<INurse>({
  shift: {
    type: String,
    enum: Object.values(ShiftType),
    required: true,
  },
  certificationLevel: {
    type: String,
  },
  department: {
    type: String,
  },
  assignedFloor: {
    type: Schema.Types.ObjectId,
    ref: 'Floor',
  },
  patients: [{
    type: Schema.Types.ObjectId,
    ref: 'Patient',
  }],
});

// Methods
nurseSchema.methods.viewAssignedPatients = function () {
  return this.populate('patients');
};

nurseSchema.methods.updatePatientVitals = function (patientId: string) {
  // Implementation for updating patient vitals
};

nurseSchema.methods.acknowledgeAlert = function (alertId: string) {
  // Implementation for acknowledging alerts
};

nurseSchema.methods.recordIntervention = function (patientId: string) {
  // Implementation for recording interventions
};

nurseSchema.methods.transferPatient = function (patientId: string, newBedId: string) {
  // Implementation for transferring patients
};

export const Nurse = User.discriminator<INurse>('NURSE', nurseSchema);
