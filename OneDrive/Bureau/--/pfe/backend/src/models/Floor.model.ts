import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFloor extends Document {
  floorNumber: number;
  name: string;
  description?: string;
  hospital: Types.ObjectId;
  rooms: Types.ObjectId[];
  assignedNurses: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  getOccupancyRate(): Promise<number>;
  getAvailableRooms(): Promise<any[]>;
  getTotalBeds(): Promise<number>;
}

const floorSchema = new Schema<IFloor>(
  {
    floorNumber: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    hospital: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
    },
    rooms: [{
      type: Schema.Types.ObjectId,
      ref: 'Room',
    }],
    assignedNurses: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
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

// Compound index for unique floor number per hospital
floorSchema.index({ hospital: 1, floorNumber: 1 }, { unique: true });

// Methods
floorSchema.methods.getOccupancyRate = async function (): Promise<number> {
  const Room = mongoose.model('Room');
  const Bed = mongoose.model('Bed');
  
  const rooms = await Room.find({ _id: { $in: this.rooms } });
  const bedIds = rooms.flatMap(r => r.beds);
  
  const totalBeds = bedIds.length;
  if (totalBeds === 0) return 0;
  
  const occupiedBeds = await Bed.countDocuments({
    _id: { $in: bedIds },
    status: 'OCCUPIED'
  });
  
  return (occupiedBeds / totalBeds) * 100;
};

floorSchema.methods.getAvailableRooms = async function () {
  const Room = mongoose.model('Room');
  
  const rooms = await Room.find({ _id: { $in: this.rooms } }).populate('beds');
  
  return rooms.filter(room => {
    const availableBeds = room.beds.filter((bed: any) => bed.status === 'AVAILABLE');
    return availableBeds.length > 0;
  });
};

floorSchema.methods.getTotalBeds = async function (): Promise<number> {
  const Room = mongoose.model('Room');
  const Bed = mongoose.model('Bed');
  
  const rooms = await Room.find({ _id: { $in: this.rooms } });
  const bedIds = rooms.flatMap(r => r.beds);
  
  return bedIds.length;
};

export const Floor = mongoose.model<IFloor>('Floor', floorSchema);
