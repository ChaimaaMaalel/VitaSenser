import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICondition {
  parameter: string; // e.g., 'heartRate', 'spO2'
  operator: string;  // e.g., '<', '>', '==', '<=', '>='
  value: number;
}

export enum ActionType {
  ALERT = 'ALERT',
  MEDICATION = 'MEDICATION',
  PROCEDURE = 'PROCEDURE',
  NOTIFICATION = 'NOTIFICATION',
  EMERGENCY_CALL = 'EMERGENCY_CALL'
}

export interface IAction {
  type: ActionType;
  description: string;
  priority: number;
}

export interface IMedicalProtocol extends Document {
  name: string;
  description?: string;
  category?: string;
  conditions: ICondition[];
  actions: IAction[];
  steps?: string[];
  requiredEquipment?: string[];
  estimatedDuration?: number;
  createdBy: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  evaluate(vitalSigns: any): boolean;
  execute(patientId: string): Promise<void>;
}

const conditionSchema = new Schema<ICondition>({
  parameter: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    required: true,
    enum: ['<', '>', '==', '<=', '>=', '!='],
  },
  value: {
    type: Number,
    required: true,
  },
}, { _id: false });

const actionSchema = new Schema<IAction>({
  type: {
    type: String,
    enum: Object.values(ActionType),
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  priority: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
}, { _id: false });

const medicalProtocolSchema = new Schema<IMedicalProtocol>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: String,
    category: String,
    conditions: [conditionSchema],
    actions: [actionSchema],
    steps: [String],
    requiredEquipment: [String],
    estimatedDuration: Number, // in minutes
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Methods
medicalProtocolSchema.methods.evaluate = function (vitalSigns: any): boolean {
  if (!this.conditions || this.conditions.length === 0) return false;
  
  return this.conditions.every((condition: any) => {
    const value = vitalSigns[condition.parameter];
    if (value === undefined) return false;
    
    switch (condition.operator) {
      case '<': return value < condition.value;
      case '>': return value > condition.value;
      case '==': return value === condition.value;
      case '<=': return value <= condition.value;
      case '>=': return value >= condition.value;
      case '!=': return value !== condition.value;
      default: return false;
    }
  });
};

medicalProtocolSchema.methods.execute = async function (patientId: string): Promise<void> {
  // Implementation for executing protocol actions
  const Alert = mongoose.model('Alert');
  const Intervention = mongoose.model('Intervention');
  
  // Sort actions by priority
  const sortedActions = this.actions.sort((a: any, b: any) => b.priority - a.priority);
  
  for (const action of sortedActions) {
    switch (action.type) {
      case ActionType.ALERT:
        await Alert.create({
          patient: patientId,
          type: 'PROTOCOL_TRIGGERED',
          severity: action.priority >= 8 ? 'CRITICAL' : 'HIGH',
          message: `Protocol: ${this.name}`,
          description: action.description,
          triggeredBy: this.createdBy,
        });
        break;
      
      case ActionType.NOTIFICATION:
        // Send notification to medical staff
        console.log(`Notification: ${action.description}`);
        break;
      
      // Add more action handlers as needed
    }
  }
};

export const MedicalProtocol = mongoose.model<IMedicalProtocol>('MedicalProtocol', medicalProtocolSchema);
