import mongoose, { Schema, Document, Types } from 'mongoose';

export enum InterventionType {
  MEDICATION = 'MEDICATION',
  PROCEDURE = 'PROCEDURE',
  MONITORING = 'MONITORING',
  EMERGENCY = 'EMERGENCY',
  CONSULTATION = 'CONSULTATION',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER'
}

export interface IIntervention extends Document {
  patient: Types.ObjectId;
  performedBy: Types.ObjectId;
  type: InterventionType;
  description: string;
  timestamp: Date;
  relatedAlert?: Types.ObjectId;
  outcome?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  record(): Promise<void>;
  update(outcome: string): Promise<void>;
}

const interventionSchema = new Schema<IIntervention>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(InterventionType),
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    relatedAlert: {
      type: Schema.Types.ObjectId,
      ref: 'Alert',
    },
    outcome: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
interventionSchema.index({ patient: 1, timestamp: -1 });
interventionSchema.index({ performedBy: 1, timestamp: -1 });

// Methods
interventionSchema.methods.record = async function (): Promise<void> {
  await this.save();
  
  // If there's a related alert, update it
  if (this.relatedAlert) {
    const Alert = mongoose.model('Alert');
    await Alert.findByIdAndUpdate(this.relatedAlert, {
      status: 'ACKNOWLEDGED'
    });
  }
};

interventionSchema.methods.update = async function (outcome: string): Promise<void> {
  this.outcome = outcome;
  await this.save();
};

export const Intervention = mongoose.model<IIntervention>('Intervention', interventionSchema);
