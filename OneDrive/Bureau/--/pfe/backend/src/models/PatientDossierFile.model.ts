import mongoose, { Document, Schema, Types } from 'mongoose';

export type DossierCategory =
  | 'irm'
  | 'scanner'
  | 'radiology'
  | 'lab'
  | 'prescription'
  | 'report'
  | 'other';

export interface IPatientDossierFile extends Document {
  patient: Types.ObjectId;
  category: DossierCategory;
  label?: string;
  notes?: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dossierCategoryValues: DossierCategory[] = [
  'irm',
  'scanner',
  'radiology',
  'lab',
  'prescription',
  'report',
  'other',
];

const patientDossierFileSchema = new Schema<IPatientDossierFile>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: dossierCategoryValues,
      default: 'other',
      required: true,
    },
    label: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storedName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

patientDossierFileSchema.index({ patient: 1, uploadedAt: -1 });

export const PatientDossierFile = mongoose.model<IPatientDossierFile>(
  'PatientDossierFile',
  patientDossierFileSchema
);
