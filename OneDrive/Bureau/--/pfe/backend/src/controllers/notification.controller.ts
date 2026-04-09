import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import { Notification } from '../models';
import logger from '../utils/logger';

const toObjectId = (value: string) => {
  if (!Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
};

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', statusCode: 401 },
      });
    }

    const limitInput = Number(req.query.limit);
    const pageInput = Number(req.query.page);
    const limit = Number.isFinite(limitInput)
      ? Math.max(1, Math.min(100, limitInput))
      : 20;
    const page = Number.isFinite(pageInput) ? Math.max(1, pageInput) : 1;
    const unreadOnly =
      String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const filter: Record<string, unknown> = { user: userId };
    if (unreadOnly) {
      filter.isRead = false;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'patient', select: '_id firstName lastName' })
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: userId, isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    logger.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch notifications', statusCode: 500 },
    });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', statusCode: 401 },
      });
    }

    const notificationId = req.params.id;
    const objectId = toObjectId(notificationId);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid notification id', statusCode: 400 },
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: objectId,
        user: userId,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: { message: 'Notification not found', statusCode: 404 },
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: { notification },
    });
  } catch (error: any) {
    logger.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to mark notification as read', statusCode: 500 },
    });
  }
};

export const markAllNotificationsRead = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', statusCode: 401 },
      });
    }

    const now = new Date();
    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true, readAt: now } }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error: any) {
    logger.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to mark all notifications as read',
        statusCode: 500,
      },
    });
  }
};
