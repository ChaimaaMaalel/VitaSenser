import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { UserRole, Floor, Room, Bed, Hospital } from '../models';
import logger from '../utils/logger';
import { AuthRequest } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

// ==================== FLOORS ====================
// Get all floors
router.get('/floors', async (req: AuthRequest, res) => {
  try {
    const floors = await Floor.find()
      .populate('rooms')
      .populate('createdBy', 'firstName lastName email')
      .sort({ floorNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: { floors }
    });
  } catch (error: any) {
    logger.error('Get floors error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch floors', statusCode: 500 },
    });
  }
});

// Get floor by ID
router.get('/floors/:id', async (req: AuthRequest, res) => {
  try {
    const floor = await Floor.findById(req.params.id)
      .populate('rooms')
      .populate('createdBy', 'firstName lastName email');

    if (!floor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Floor not found', statusCode: 404 },
      });
    }

    res.json({
      success: true,
      data: { floor }
    });
  } catch (error: any) {
    logger.error('Get floor error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch floor', statusCode: 500 },
    });
  }
});

// Create floor
router.post('/floors', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { floorNumber, name, description, hospital } = req.body;

    if (!floorNumber || !name) {
      return res.status(400).json({
        success: false,
        error: { message: 'Floor number and name are required', statusCode: 400 },
      });
    }

    const floor = await Floor.create({
      floorNumber,
      name,
      description,
      hospital,
      createdBy: req.user?.id,
      rooms: [],
      assignedNurses: [],
    });

    logger.info(`Floor created: ${name} (Floor ${floorNumber})`);

    res.status(201).json({
      success: true,
      message: 'Floor created successfully',
      data: { floor }
    });
  } catch (error: any) {
    logger.error('Create floor error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to create floor', statusCode: 500 },
    });
  }
});

// Update floor
router.put('/floors/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;

    const floor = await Floor.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    ).populate('rooms');

    if (!floor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Floor not found', statusCode: 404 },
      });
    }

    logger.info(`Floor updated: ${floor.name}`);

    res.json({
      success: true,
      message: 'Floor updated successfully',
      data: { floor }
    });
  } catch (error: any) {
    logger.error('Update floor error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update floor', statusCode: 500 },
    });
  }
});

// Delete floor
router.delete('/floors/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const floor = await Floor.findByIdAndDelete(req.params.id);

    if (!floor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Floor not found', statusCode: 404 },
      });
    }

    // Delete all rooms in this floor
    await Room.deleteMany({ floor: req.params.id });

    logger.info(`Floor deleted: ${floor.name}`);

    res.json({
      success: true,
      message: 'Floor deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete floor error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete floor', statusCode: 500 },
    });
  }
});

// ==================== ROOMS ====================
// Get all rooms
router.get('/rooms', async (req: AuthRequest, res) => {
  try {
    const rooms = await Room.find()
      .populate('floor', 'floorNumber name')
      .populate('beds')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    res.json({
      success: true,
      data: { rooms }
    });
  } catch (error: any) {
    logger.error('Get rooms error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch rooms', statusCode: 500 },
    });
  }
});

// Create room
router.post('/rooms', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { roomNumber, name, type, capacity, floor } = req.body;

    if (!roomNumber || !type || !capacity || !floor) {
      return res.status(400).json({
        success: false,
        error: { message: 'Required fields missing', statusCode: 400 },
      });
    }

    const room = await Room.create({
      roomNumber,
      name,
      type,
      capacity,
      floor,
      createdBy: req.user?.id,
      beds: [],
    });

    // Add room to floor
    await Floor.findByIdAndUpdate(floor, { $push: { rooms: room._id } });

    logger.info(`Room created: ${roomNumber} (${type})`);

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: { room }
    });
  } catch (error: any) {
    logger.error('Create room error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to create room', statusCode: 500 },
    });
  }
});

// Update room
router.put('/rooms/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { name, type, capacity } = req.body;

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { name, type, capacity },
      { new: true }
    ).populate('floor').populate('beds');

    if (!room) {
      return res.status(404).json({
        success: false,
        error: { message: 'Room not found', statusCode: 404 },
      });
    }

    logger.info(`Room updated: ${room.roomNumber}`);

    res.json({
      success: true,
      message: 'Room updated successfully',
      data: { room }
    });
  } catch (error: any) {
    logger.error('Update room error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update room', statusCode: 500 },
    });
  }
});

// Delete room
router.delete('/rooms/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        error: { message: 'Room not found', statusCode: 404 },
      });
    }

    // Remove room from floor and delete beds
    await Floor.findByIdAndUpdate(room.floor, { $pull: { rooms: req.params.id } });
    await Bed.deleteMany({ room: req.params.id });

    logger.info(`Room deleted: ${room.roomNumber}`);

    res.json({
      success: true,
      message: 'Room deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete room error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete room', statusCode: 500 },
    });
  }
});

// ==================== BEDS ====================
// Get all beds
router.get('/beds', async (req: AuthRequest, res) => {
  try {
    const beds = await Bed.find()
      .populate('room', 'roomNumber type')
      .populate('patient', 'firstName lastName')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    res.json({
      success: true,
      data: { beds }
    });
  } catch (error: any) {
    logger.error('Get beds error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch beds', statusCode: 500 },
    });
  }
});

// Create bed
router.post('/beds', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { bedNumber, status, room } = req.body;

    if (!bedNumber || !room) {
      return res.status(400).json({
        success: false,
        error: { message: 'Bed number and room are required', statusCode: 400 },
      });
    }

    const bed = await Bed.create({
      bedNumber,
      status: status || 'AVAILABLE',
      room,
      createdBy: req.user?.id,
    });

    // Add bed to room
    await Room.findByIdAndUpdate(room, { $push: { beds: bed._id } });

    logger.info(`Bed created: ${bedNumber}`);

    res.status(201).json({
      success: true,
      message: 'Bed created successfully',
      data: { bed }
    });
  } catch (error: any) {
    logger.error('Create bed error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to create bed', statusCode: 500 },
    });
  }
});

// Update bed
router.put('/beds/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;

    const bed = await Bed.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('room').populate('patient');

    if (!bed) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bed not found', statusCode: 404 },
      });
    }

    logger.info(`Bed updated: ${bed.bedNumber}`);

    res.json({
      success: true,
      message: 'Bed updated successfully',
      data: { bed }
    });
  } catch (error: any) {
    logger.error('Update bed error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update bed', statusCode: 500 },
    });
  }
});

// Delete bed
router.delete('/beds/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const bed = await Bed.findByIdAndDelete(req.params.id);

    if (!bed) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bed not found', statusCode: 404 },
      });
    }

    // Remove bed from room
    await Room.findByIdAndUpdate(bed.room, { $pull: { beds: req.params.id } });

    logger.info(`Bed deleted: ${bed.bedNumber}`);

    res.json({
      success: true,
      message: 'Bed deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete bed error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete bed', statusCode: 500 },
    });
  }
});

export default router;
