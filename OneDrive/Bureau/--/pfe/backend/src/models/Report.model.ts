import mongoose, { Schema, Document, Types } from 'mongoose';

export enum ReportType {
  PATIENT_SUMMARY = 'PATIENT_SUMMARY',
  HOSPITAL_OCCUPANCY = 'HOSPITAL_OCCUPANCY',
  ALERT_STATISTICS = 'ALERT_STATISTICS',
  STAFF_PERFORMANCE = 'STAFF_PERFORMANCE',
  FINANCIAL = 'FINANCIAL',
  QUALITY_METRICS = 'QUALITY_METRICS',
  CUSTOM = 'CUSTOM'
}

export interface IReport extends Document {
  title: string;
  type: ReportType;
  generatedBy: Types.ObjectId;
  generatedAt: Date;
  startDate?: Date;
  endDate?: Date;
  data: any;
  filters?: any;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  generate(): Promise<void>;
  exportPDF(): Promise<Buffer>;
  exportExcel(): Promise<Buffer>;
}

const reportSchema = new Schema<IReport>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(ReportType),
      required: true,
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    startDate: Date,
    endDate: Date,
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    filters: Schema.Types.Mixed,
    summary: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
reportSchema.index({ generatedBy: 1, generatedAt: -1 });
reportSchema.index({ type: 1, generatedAt: -1 });

// Methods
reportSchema.methods.generate = async function (): Promise<void> {
  // Implementation depends on report type
  switch (this.type) {
    case ReportType.PATIENT_SUMMARY:
      await this.generatePatientSummary();
      break;
    case ReportType.HOSPITAL_OCCUPANCY:
      await this.generateOccupancyReport();
      break;
    case ReportType.ALERT_STATISTICS:
      await this.generateAlertStatistics();
      break;
    default:
      throw new Error(`Report type ${this.type} not implemented`);
  }
  
  await this.save();
};

reportSchema.methods.generatePatientSummary = async function () {
  const Patient = mongoose.model('Patient');
  const VitalSigns = mongoose.model('VitalSigns');
  const Alert = mongoose.model('Alert');
  
  const patients = await Patient.find({
    admissionDate: { $gte: this.startDate, $lte: this.endDate }
  });
  
  this.data = {
    totalPatients: patients.length,
    byStatus: await Patient.aggregate([
      { $match: { admissionDate: { $gte: this.startDate, $lte: this.endDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    averageStay: await this.calculateAverageStay(patients),
  };
};

reportSchema.methods.generateOccupancyReport = async function () {
  const Bed = mongoose.model('Bed');
  
  const [totalBeds, occupiedBeds] = await Promise.all([
    Bed.countDocuments(),
    Bed.countDocuments({ status: 'OCCUPIED' })
  ]);
  
  this.data = {
    totalBeds,
    occupiedBeds,
    availableBeds: totalBeds - occupiedBeds,
    occupancyRate: ((occupiedBeds / totalBeds) * 100).toFixed(2),
  };
};

reportSchema.methods.generateAlertStatistics = async function () {
  const Alert = mongoose.model('Alert');
  
  this.data = await Alert.aggregate([
    { $match: { timestamp: { $gte: this.startDate, $lte: this.endDate } } },
    {
      $group: {
        _id: { severity: '$severity', status: '$status' },
        count: { $sum: 1 }
      }
    }
  ]);
};

reportSchema.methods.calculateAverageStay = async function (patients: any[]) {
  const stays = patients
    .filter(p => p.dischargeDate)
    .map(p => {
      const admission = new Date(p.admissionDate).getTime();
      const discharge = new Date(p.dischargeDate).getTime();
      return (discharge - admission) / (1000 * 60 * 60 * 24); // days
    });
  
  if (stays.length === 0) return 0;
  return (stays.reduce((a, b) => a + b, 0) / stays.length).toFixed(2);
};

reportSchema.methods.exportPDF = async function (): Promise<Buffer> {
  // Implementation for PDF export (using libraries like pdfkit)
  throw new Error('PDF export not implemented');
};

reportSchema.methods.exportExcel = async function (): Promise<Buffer> {
  // Implementation for Excel export (using libraries like exceljs)
  throw new Error('Excel export not implemented');
};

export const Report = mongoose.model<IReport>('Report', reportSchema);
