import mongoose, { Schema, Document, Types } from 'mongoose';
import { emitToRoom } from '../realtime/socket';

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

alertSchema.pre('save', function (next) {
  this.$locals.wasNew = this.isNew;
  next();
});

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

alertSchema.post('save', async function (doc) {
  try {
    if (!doc.$locals?.wasNew) return;

    const status = String(doc.status || '').toUpperCase();
    const severity = String(doc.severity || '').toUpperCase();
    const type = String(doc.type || '').toUpperCase();
    const message = String(doc.message || '').toLowerCase();

    const isUrgent =
      status !== AlertStatus.RESOLVED &&
      (
        severity === AlertSeverity.CRITICAL ||
        type === AlertType.EMERGENCY ||
        message.includes('help') ||
        message.includes('urgent') ||
        message.includes('assistance')
      );

    if (!isUrgent) return;

    const PatientModel = mongoose.model<any>('Patient');
    const assignment: any = await PatientModel.findById(doc.patient)
      .select('assignedDoctor assignedNurses')
      .lean();

    const assignedUserIds = [
      assignment?.assignedDoctor ? String(assignment.assignedDoctor) : null,
      ...((assignment?.assignedNurses || []).map((id: any) => String(id))),
    ].filter((id): id is string => Boolean(id));

    if (assignedUserIds.length === 0) return;

    await doc.populate([
      { path: 'patient', select: '_id firstName lastName status bed gender dateOfBirth' },
      {
        path: 'patient.bed',
        select: '_id bedNumber room',
        populate: { path: 'room', select: '_id roomNumber name' },
      },
      { path: 'vitalSigns', select: 'heartRate spO2 temperature glucose timestamp source bed' },
      {
        path: 'vitalSigns.bed',
        select: '_id bedNumber room',
        populate: { path: 'room', select: '_id roomNumber name' },
      },
    ]);
    const alertForSocket: any = doc.toObject();

    const isUsableBed = (bed: any) => {
      return Boolean(
        bed &&
        typeof bed === 'object' &&
        ((bed.bedNumber && String(bed.bedNumber).trim()) || bed.room)
      );
    };

    const currentBed = alertForSocket?.patient?.bed;
    const hasUsablePatientBed = isUsableBed(currentBed);

    if (!hasUsablePatientBed && alertForSocket?.patient?._id) {
      const BedModel = mongoose.model<any>('Bed');
      let fallbackBed: any = null;

      if (currentBed && typeof currentBed !== 'object') {
        fallbackBed = await BedModel.findById(currentBed)
          .select('_id bedNumber room patient')
          .populate({ path: 'room', select: '_id roomNumber name' })
          .lean();
      }

      if (!fallbackBed) {
        fallbackBed = await BedModel.findOne({ patient: alertForSocket.patient._id })
          .select('_id bedNumber room patient')
          .populate({ path: 'room', select: '_id roomNumber name' })
          .lean();
      }

      if (fallbackBed) {
        alertForSocket.patient.bed = fallbackBed;
      }
    }

    assignedUserIds.forEach((userId) => {
      emitToRoom(`user:${userId}`, 'alert:created', {
        kind: 'emergency-alert',
        alert: alertForSocket,
      });
    });
  } catch (error) {
    console.warn('Failed to emit realtime alert:', error);
  }
});

export const Alert = mongoose.model<IAlert>('Alert', alertSchema);
