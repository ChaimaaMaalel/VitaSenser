import mongoose, { Schema, Document, Types } from 'mongoose';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

export enum PatientStatus {
  STABLE = 'STABLE',
  CRITICAL = 'CRITICAL',
  MODERATE = 'MODERATE',
  RECOVERING = 'RECOVERING',
  DISCHARGED = 'DISCHARGED'
}

export interface IPatient extends Document {
  firstName: string;
  lastName: string;
  profilePicture?: string;
  dateOfBirth: Date;
  gender: Gender;
  bloodType?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phoneNumber?: string;
  emergencyContact?: string;
  emergencyContactPhone?: string;
  medicalHistory?: string;
  allergies: string[];
  currentMedications?: string;
  diagnosis?: string;
  admissionDate?: Date;
  dischargeDate?: Date;
  status: PatientStatus;
  bed?: Types.ObjectId;
  assignedDoctor?: Types.ObjectId;
  assignedNurses: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  admit(bedId: string, doctorId: string): Promise<void>;
  discharge(): Promise<void>;
  transfer(newBedId: string): Promise<void>;
  getLatestVitals(): Promise<any>;
  getActiveAlerts(): Promise<any[]>;
}

const patientSchema = new Schema<IPatient>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    profilePicture: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: Object.values(Gender),
      required: true,
    },
    bloodType: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
    phoneNumber: String,
    emergencyContact: String,
    emergencyContactPhone: String,
    medicalHistory: String,
    allergies: {
      type: [String],
      default: [],
    },
    currentMedications: String,
    diagnosis: String,
    admissionDate: Date,
    dischargeDate: Date,
    status: {
      type: String,
      enum: Object.values(PatientStatus),
      default: PatientStatus.STABLE,
    },
    bed: {
      type: Schema.Types.ObjectId,
      ref: 'Bed',
    },
    assignedDoctor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedNurses: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes
patientSchema.index({ assignedDoctor: 1 });
patientSchema.index({ status: 1 });
patientSchema.index({ admissionDate: -1 });

// Methods
patientSchema.methods.admit = async function (bedId: string, doctorId: string): Promise<void> {
  const Bed = mongoose.model('Bed');
  const bed = await Bed.findById(bedId);
  
  if (!bed) throw new Error('Bed not found');
  if (bed.status !== 'AVAILABLE') throw new Error('Bed not available');
  
  this.bed = bedId as any;
  this.assignedDoctor = doctorId as any;
  this.admissionDate = new Date();
  this.status = PatientStatus.STABLE;
  
  await bed.assignPatient(this._id);
  await this.save();
};

patientSchema.methods.discharge = async function (): Promise<void> {
  if (this.bed) {
    const Bed = mongoose.model('Bed');
    const bed = await Bed.findById(this.bed);
    if (bed) {
      await bed.releasePatient();
    }
  }
  
  this.dischargeDate = new Date();
  this.status = PatientStatus.DISCHARGED;
  this.bed = undefined;
  await this.save();
};

patientSchema.methods.transfer = async function (newBedId: string): Promise<void> {
  const Bed = mongoose.model('Bed');
  
  // Release current bed
  if (this.bed) {
    const oldBed = await Bed.findById(this.bed);
    if (oldBed) {
      await oldBed.releasePatient();
    }
  }
  
  // Assign new bed
  const newBed = await Bed.findById(newBedId);
  if (!newBed) throw new Error('New bed not found');
  if (newBed.status !== 'AVAILABLE') throw new Error('New bed not available');
  
  await newBed.assignPatient(this._id);
  this.bed = newBedId as any;
  await this.save();
};

patientSchema.methods.getLatestVitals = async function () {
  const VitalSigns = mongoose.model('VitalSigns');
  
  return await VitalSigns.findOne({ patient: this._id })
    .sort({ timestamp: -1 })
    .limit(1);
};

patientSchema.methods.getActiveAlerts = async function () {
  const Alert = mongoose.model('Alert');
  
  return await Alert.find({
    patient: this._id,
    status: { $in: ['PENDING', 'ACKNOWLEDGED'] }
  }).sort({ timestamp: -1 });
};

export const Patient = mongoose.model<IPatient>('Patient', patientSchema);
