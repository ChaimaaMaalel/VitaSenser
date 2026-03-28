import mongoose, { Schema, Document, Types } from 'mongoose';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface IVitalSigns extends Document {
  patient: Types.ObjectId;
  timestamp: Date;
  heartRate?: number;
  spO2?: number;
  temperature?: number;
  ecgData?: number[];
  systolicBP?: number;
  diastolicBP?: number;
  respiratoryRate?: number;
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isAbnormal(): boolean;
  calculateRisk(): RiskLevel;
}

const vitalSignsSchema = new Schema<IVitalSigns>(
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
    heartRate: {
      type: Number,
      min: 0,
      max: 300,
    },
    spO2: {
      type: Number,
      min: 0,
      max: 100,
    },
    temperature: {
      type: Number,
      min: 30,
      max: 45,
    },
    ecgData: [Number],
    systolicBP: {
      type: Number,
      min: 0,
      max: 300,
    },
    diastolicBP: {
      type: Number,
      min: 0,
      max: 200,
    },
    respiratoryRate: {
      type: Number,
      min: 0,
      max: 100,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
vitalSignsSchema.index({ patient: 1, timestamp: -1 });

// Methods
vitalSignsSchema.methods.isAbnormal = function (): boolean {
  const abnormalConditions = [
    this.heartRate && (this.heartRate < 60 || this.heartRate > 100),
    this.spO2 && this.spO2 < 95,
    this.temperature && (this.temperature < 36 || this.temperature > 38),
    this.systolicBP && (this.systolicBP < 90 || this.systolicBP > 140),
    this.diastolicBP && (this.diastolicBP < 60 || this.diastolicBP > 90),
    this.respiratoryRate && (this.respiratoryRate < 12 || this.respiratoryRate > 20),
  ];
  
  return abnormalConditions.some(condition => condition === true);
};

vitalSignsSchema.methods.calculateRisk = function (): RiskLevel {
  let riskScore = 0;
  
  // Heart rate
  if (this.heartRate) {
    if (this.heartRate < 40 || this.heartRate > 120) riskScore += 3;
    else if (this.heartRate < 60 || this.heartRate > 100) riskScore += 1;
  }
  
  // SpO2
  if (this.spO2) {
    if (this.spO2 < 90) riskScore += 3;
    else if (this.spO2 < 95) riskScore += 2;
  }
  
  // Temperature
  if (this.temperature) {
    if (this.temperature < 35 || this.temperature > 39) riskScore += 3;
    else if (this.temperature < 36 || this.temperature > 38) riskScore += 1;
  }
  
  // Blood pressure
  if (this.systolicBP && this.diastolicBP) {
    if (this.systolicBP < 80 || this.systolicBP > 180) riskScore += 3;
    else if (this.systolicBP < 90 || this.systolicBP > 140) riskScore += 1;
    
    if (this.diastolicBP < 50 || this.diastolicBP > 110) riskScore += 2;
    else if (this.diastolicBP < 60 || this.diastolicBP > 90) riskScore += 1;
  }
  
  // Respiratory rate
  if (this.respiratoryRate) {
    if (this.respiratoryRate < 8 || this.respiratoryRate > 30) riskScore += 3;
    else if (this.respiratoryRate < 12 || this.respiratoryRate > 20) riskScore += 1;
  }
  
  // Determine risk level
  if (riskScore >= 7) return RiskLevel.CRITICAL;
  if (riskScore >= 4) return RiskLevel.HIGH;
  if (riskScore >= 2) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
};

export const VitalSigns = mongoose.model<IVitalSigns>('VitalSigns', vitalSignsSchema);
