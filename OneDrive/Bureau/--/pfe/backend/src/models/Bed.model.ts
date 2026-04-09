import mongoose, { Schema, Document, Types } from 'mongoose';

export enum BedStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED'
}

export enum SimulationProfile {
  STABLE = 'STABLE',
  MODERATE = 'MODERATE',
  CRITICAL = 'CRITICAL',
  TACHYCARDIA = 'TACHYCARDIA',
  BRADYCARDIA = 'BRADYCARDIA',
  ARRHYTHMIA = 'ARRHYTHMIA',
  HYPOXEMIA = 'HYPOXEMIA',
  HYPERGLYCEMIA = 'HYPERGLYCEMIA',
  SEPSIS_LIKE = 'SEPSIS_LIKE',
  AI_TEST_ANOMALY = 'AI_TEST_ANOMALY',
  AI_TEST_PREDICTION = 'AI_TEST_PREDICTION',
  AI_TEST_CARDIAC = 'AI_TEST_CARDIAC',
  AI_TEST_RESPIRATORY = 'AI_TEST_RESPIRATORY',
  AI_TEST_FULLSTACK = 'AI_TEST_FULLSTACK',
  CUSTOM = 'CUSTOM'
}

export enum SignalConnectionStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  ERROR = 'ERROR'
}

export enum SignalSource {
  SIMULATOR = 'SIMULATOR',
  DEVICE = 'DEVICE',
  MANUAL = 'MANUAL'
}

export interface ILatestSignal {
  heartRate?: number;
  temperature?: number;
  spO2?: number;
  glucose?: number;
  timestamp?: Date;
  source?: SignalSource;
}

export interface ISimulatorSettings {
  enabled: boolean;
  profile: SimulationProfile;
  intervalMs: number;
  signalConnectionStatus: SignalConnectionStatus;
  lastSignalAt?: Date;
  latestSignal?: ILatestSignal;
}

export interface IBed extends Document {
  bedNumber: string;
  status: BedStatus;
  room: Types.ObjectId;
  patient?: Types.ObjectId;
  simulator: ISimulatorSettings;
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
    simulator: {
      enabled: {
        type: Boolean,
        default: false,
      },
      profile: {
        type: String,
        enum: Object.values(SimulationProfile),
        default: SimulationProfile.STABLE,
      },
      intervalMs: {
        type: Number,
        min: 500,
        default: 1000,
      },
      signalConnectionStatus: {
        type: String,
        enum: Object.values(SignalConnectionStatus),
        default: SignalConnectionStatus.OFFLINE,
      },
      lastSignalAt: {
        type: Date,
      },
      latestSignal: {
        heartRate: { type: Number, min: 0, max: 300 },
        temperature: { type: Number, min: 30, max: 45 },
        spO2: { type: Number, min: 0, max: 100 },
        glucose: { type: Number, min: 0, max: 1000 },
        timestamp: { type: Date },
        source: {
          type: String,
          enum: Object.values(SignalSource),
        },
      },
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
