import mongoose, { Schema, Document, Types } from 'mongoose';

export enum RoomType {
  ICU = 'ICU',
  GENERAL = 'GENERAL',
  EMERGENCY = 'EMERGENCY',
  SURGERY = 'SURGERY',
  ISOLATION = 'ISOLATION'
}

export interface IRoom extends Document {
  roomNumber: string;
  name?: string;
  type: RoomType;
  capacity: number;
  floor: Types.ObjectId;
  beds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isAvailable(): Promise<boolean>;
  getOccupiedBeds(): Promise<number>;
  getAvailableBeds(): Promise<any[]>;
}

const roomSchema = new Schema<IRoom>(
  {
    roomNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(RoomType),
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    floor: {
      type: Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    beds: [{
      type: Schema.Types.ObjectId,
      ref: 'Bed',
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

// Compound index for unique room number per floor
roomSchema.index({ floor: 1, roomNumber: 1 }, { unique: true });

// Methods
roomSchema.methods.isAvailable = async function (): Promise<boolean> {
  const availableBeds = await this.getAvailableBeds();
  return availableBeds.length > 0;
};

roomSchema.methods.getOccupiedBeds = async function (): Promise<number> {
  const Bed = mongoose.model('Bed');
  
  return await Bed.countDocuments({
    _id: { $in: this.beds },
    status: 'OCCUPIED'
  });
};

roomSchema.methods.getAvailableBeds = async function () {
  const Bed = mongoose.model('Bed');
  
  return await Bed.find({
    _id: { $in: this.beds },
    status: 'AVAILABLE'
  });
};

export const Room = mongoose.model<IRoom>('Room', roomSchema);
