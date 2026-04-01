import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { UserRole } from '../models';
import { User, Admin, Doctor, Nurse } from '../models';
import { profilePictureUpload } from '../middlewares/upload';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('-password')
      .lean();
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error: any) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch users', statusCode: 500 },
    });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', statusCode: 404 },
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error: any) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch user', statusCode: 500 },
    });
  }
});

// Update user
router.put('/:id', authorize(UserRole.ADMIN), profilePictureUpload, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      profilePicture,
      role,
      specialization,
      licenseNumber,
      shift,
      certificationLevel,
      department,
      removeProfilePicture,
    } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', statusCode: 404 },
      });
    }

    // Update basic fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;
    if (req.file) {
      user.profilePicture = `/uploads/profile-pictures/${req.file.filename}`;
    } else if (removeProfilePicture === 'true' || removeProfilePicture === true) {
      user.profilePicture = undefined;
    } else if (typeof profilePicture !== 'undefined') {
      user.profilePicture = profilePicture || undefined;
    }

    // Update role-specific fields
    if (user.role === UserRole.DOCTOR) {
      const doctor = await Doctor.findById(user._id);
      if (doctor) {
        doctor.specialization = specialization || doctor.specialization;
        doctor.licenseNumber = licenseNumber || doctor.licenseNumber;
        doctor.department = department || doctor.department;
        await doctor.save();
      }
    } else if (user.role === UserRole.NURSE) {
      const nurse = await Nurse.findById(user._id);
      if (nurse) {
        nurse.shift = shift || nurse.shift;
        nurse.certificationLevel = certificationLevel || nurse.certificationLevel;
        nurse.department = department || nurse.department;
        await nurse.save();
      }
    } else if (user.role === UserRole.ADMIN) {
      const admin = await Admin.findById(user._id);
      if (admin) {
        admin.department = department || admin.department;
        await admin.save();
      }
    }

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password').lean();
    
    logger.info(`User updated: ${user.email}`);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser },
    });
  } catch (error: any) {
    logger.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to update user', statusCode: 500 },
    });
  }
});

// Delete user (soft delete by setting isActive to false)
router.delete('/:id', authorize(UserRole.ADMIN), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', statusCode: 404 },
      });
    }

    logger.info(`User deleted: ${user.email}`);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete user', statusCode: 500 },
    });
  }
});

export default router;
