import mongoose, { Schema, Document, Types } from 'mongoose';

export enum BedStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED'
}

export interface IBed extends Document {
  bedNumber: string;
  status: BedStatus;
  room: Types.ObjectId;
  patient?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  assignPatient(patientId: string): Promise<void>;
  releasePatient(): Promise<void>;
  isOccupied(): boolean;
}

const bedSchema = new Schema<IBed>(
  {
    bedNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(BedStatus),
      default: BedStatus.AVAILABLE,
    },
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique bed number per room
bedSchema.index({ room: 1, bedNumber: 1 }, { unique: true });

// Methods
bedSchema.methods.assignPatient = async function (patientId: string): Promise<void> {
  this.patient = patientId as any;
  this.status = BedStatus.OCCUPIED;
  await this.save();
};

bedSchema.methods.releasePatient = async function (): Promise<void> {
  this.patient = undefined;
  this.status = BedStatus.AVAILABLE;
  await this.save();
};

bedSchema.methods.isOccupied = function (): boolean {
  return this.status === BedStatus.OCCUPIED && !!this.patient;
};

export const Bed = mongoose.model<IBed>('Bed', bedSchema);
