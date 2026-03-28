import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IHospital extends Document {
  name: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  capacity?: number;
  floors: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  getOccupancyRate(): Promise<number>;
  getTotalBeds(): Promise<number>;
  getAvailableBeds(): Promise<number>;
}

const hospitalSchema = new Schema<IHospital>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phoneNumber: String,
    email: {
      type: String,
      lowercase: true,
    },
    capacity: Number,
    floors: [{
      type: Schema.Types.ObjectId,
      ref: 'Floor',
    }],
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

// Methods
hospitalSchema.methods.getOccupancyRate = async function (): Promise<number> {
  const totalBeds = await this.getTotalBeds();
  if (totalBeds === 0) return 0;
  
  const availableBeds = await this.getAvailableBeds();
  return ((totalBeds - availableBeds) / totalBeds) * 100;
};

hospitalSchema.methods.getTotalBeds = async function (): Promise<number> {
  const Bed = mongoose.model('Bed');
  const Floor = mongoose.model('Floor');
  
  const floors = await Floor.find({ _id: { $in: this.floors } });
  const roomIds = floors.flatMap(f => f.rooms);
  const beds = await Bed.countDocuments({ room: { $in: roomIds } });
  
  return beds;
};

hospitalSchema.methods.getAvailableBeds = async function (): Promise<number> {
  const Bed = mongoose.model('Bed');
  const Floor = mongoose.model('Floor');
  
  const floors = await Floor.find({ _id: { $in: this.floors } });
  const roomIds = floors.flatMap(f => f.rooms);
  const beds = await Bed.countDocuments({ 
    room: { $in: roomIds },
    status: 'AVAILABLE'
  });
  
  return beds;
};

export const Hospital = mongoose.model<IHospital>('Hospital', hospitalSchema);
