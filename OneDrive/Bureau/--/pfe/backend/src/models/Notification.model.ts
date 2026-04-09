import mongoose, { Document, Schema, Types } from 'mongoose';
import { UserRole } from './User.model';

export enum NotificationType {
  ASSIGNMENT = 'ASSIGNMENT',
}

export interface INotification extends Document {
  user: Types.ObjectId;
  type: NotificationType;
  message: string;
  patient?: Types.ObjectId;
  recipientRole?: UserRole;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
    },
    recipientRole: {
      type: String,
      enum: Object.values(UserRole),
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);
