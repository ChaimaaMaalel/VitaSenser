import mongoose, { Schema, Document, Types } from 'mongoose';

export enum AlertType {
  CRITICAL_VITAL_SIGN = 'CRITICAL_VITAL_SIGN',
  VITAL_SIGN_ANOMALY = 'VITAL_SIGN_ANOMALY',
  PREDICTION_WARNING = 'PREDICTION_WARNING',
  PATIENT_DETERIORATION = 'PATIENT_DETERIORATION',
  EQUIPMENT_FAILURE = 'EQUIPMENT_FAILURE',
  MEDICATION_DUE = 'MEDICATION_DUE',
  EMERGENCY = 'EMERGENCY'
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum AlertStatus {
  PENDING = 'PENDING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED'
}

export interface IAlert extends Document {
  patient: Types.ObjectId;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  description?: string;
  timestamp: Date;
  status: AlertStatus;
  triggeredBy: Types.ObjectId;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  vitalSigns?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  acknowledge(userId: string): Promise<void>;
  escalate(): Promise<void>;
  resolve(): Promise<void>;
  notify(userId: string): Promise<void>;
}

const alertSchema = new Schema<IAlert>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(AlertType),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(AlertSeverity),
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    description: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(AlertStatus),
      default: AlertStatus.PENDING,
      index: true,
    },
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    acknowledgedAt: Date,
    vitalSigns: {
      type: Schema.Types.ObjectId,
      ref: 'VitalSigns',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
alertSchema.index({ patient: 1, status: 1, timestamp: -1 });
alertSchema.index({ severity: 1, status: 1 });

// Methods
alertSchema.methods.acknowledge = async function (userId: string): Promise<void> {
  this.status = AlertStatus.ACKNOWLEDGED;
  this.acknowledgedBy = userId as any;
  this.acknowledgedAt = new Date();
  await this.save();
};

alertSchema.methods.escalate = async function (): Promise<void> {
  this.status = AlertStatus.ESCALATED;
  this.severity = this.severity === AlertSeverity.CRITICAL 
    ? AlertSeverity.CRITICAL 
    : AlertSeverity.CRITICAL;
  await this.save();
};

alertSchema.methods.resolve = async function (): Promise<void> {
  this.status = AlertStatus.RESOLVED;
  await this.save();
};

alertSchema.methods.notify = async function (userId: string): Promise<void> {
  // Implementation for notification system
  // This could integrate with WebSocket, email, SMS, etc.
  console.log(`Notifying user ${userId} about alert ${this._id}`);
};

export const Alert = mongoose.model<IAlert>('Alert', alertSchema);
