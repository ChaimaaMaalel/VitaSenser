import mongoose, { Schema, Document, Types } from 'mongoose';

export enum PatientEventType {
  ALERT = 'alert',
  MEDICATION = 'medication',
  INTERVENTION = 'intervention',
  PROCEDURE = 'procedure',
  NOTE = 'note',
  AI_INSIGHT = 'ai_insight',
}

export enum PatientEventSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  NORMAL = 'normal',
}

export interface IPatientEvent extends Document {
  patient: Types.ObjectId;
  type: PatientEventType;
  severity: PatientEventSeverity;
  title: string;
  description: string;
  reason?: string;
  details?: string;
  notes: string[];
  actor?: string;
  eventTime: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const patientEventSchema = new Schema<IPatientEvent>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(PatientEventType),
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: Object.values(PatientEventSeverity),
      default: PatientEventSeverity.NORMAL,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    details: {
      type: String,
      trim: true,
    },
    notes: {
      type: [String],
      default: [],
    },
    actor: {
      type: String,
      trim: true,
    },
    eventTime: {
      type: Date,
      default: Date.now,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

patientEventSchema.index({ patient: 1, eventTime: -1 });

export const PatientEvent = mongoose.model<IPatientEvent>('PatientEvent', patientEventSchema);
