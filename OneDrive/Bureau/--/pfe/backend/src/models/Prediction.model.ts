import mongoose, { Schema, Document, Types } from 'mongoose';

export enum PredictionType {
  SPO2_FORECAST = 'SPO2_FORECAST',
  HEART_RATE_FORECAST = 'HEART_RATE_FORECAST',
  RISK_CLASSIFICATION = 'RISK_CLASSIFICATION',
  ANOMALY_DETECTION = 'ANOMALY_DETECTION',
  PATIENT_DETERIORATION = 'PATIENT_DETERIORATION'
}

export interface IPrediction extends Document {
  patient: Types.ObjectId;
  timestamp: Date;
  type: PredictionType;
  modelType: string;
  predictedValue: number;
  confidence: number;
  timeHorizon: number; // minutes
  inputData: any;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  getAccuracy(): Promise<number>;
}

const predictionSchema = new Schema<IPrediction>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(PredictionType),
      required: true,
    },
    modelType: {
      type: String,
      required: true, // e.g., 'LSTM', 'RANDOM_FOREST', 'ISOLATION_FOREST'
    },
    predictedValue: {
      type: Number,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    timeHorizon: {
      type: Number,
      required: true, // in minutes
    },
    inputData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
predictionSchema.index({ patient: 1, timestamp: -1 });
predictionSchema.index({ type: 1, timestamp: -1 });

// Methods
predictionSchema.methods.getAccuracy = async function (): Promise<number> {
  // This would compare predicted value with actual value after timeHorizon has passed
  const VitalSigns = mongoose.model('VitalSigns');
  
  const targetTime = new Date(this.timestamp.getTime() + this.timeHorizon * 60000);
  
  const actualVitals = await VitalSigns.findOne({
    patient: this.patient,
    timestamp: { $gte: targetTime, $lte: new Date(targetTime.getTime() + 300000) } // ±5 minutes
  });
  
  if (!actualVitals) return 0;
  
  let actualValue: number | undefined;
  switch (this.type) {
    case PredictionType.SPO2_FORECAST:
      actualValue = actualVitals.spO2;
      break;
    case PredictionType.HEART_RATE_FORECAST:
      actualValue = actualVitals.heartRate;
      break;
  }
  
  if (!actualValue) return 0;
  
  // Calculate accuracy as 1 - (absolute error / actual value)
  const absoluteError = Math.abs(this.predictedValue - actualValue);
  const accuracy = Math.max(0, 1 - (absoluteError / actualValue));
  
  return accuracy;
};

export const Prediction = mongoose.model<IPrediction>('Prediction', predictionSchema);
