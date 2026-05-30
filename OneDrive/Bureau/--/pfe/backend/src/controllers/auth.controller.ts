import { Response } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { AuthRequest } from '../middlewares/auth';
import { User, Admin, Doctor, Nurse, UserRole } from '../models';

// Register user
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const {
      email,
      password,
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
      permissions,
    } = req.body;
    const uploadedProfilePicture = req.file
      ? `/uploads/profile-pictures/${req.file.filename}`
      : undefined;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: { message: 'User already exists', statusCode: 400 },
      });
    }

    // Create user based on role using discriminators
    let user;
    
    switch (role) {
      case UserRole.ADMIN:
        user = await Admin.create({
          email,
          password,
          firstName,
          lastName,
          phone,
          profilePicture: uploadedProfilePicture || profilePicture,
          role: UserRole.ADMIN,
          permissions: permissions || ['ALL'],
          department: department || 'Administration',
        });
        break;
        
      case UserRole.DOCTOR:
        user = await Doctor.create({
          email,
          password,
          firstName,
          lastName,
          phone,
          profilePicture: uploadedProfilePicture || profilePicture,
          role: UserRole.DOCTOR,
          specialization: specialization || 'General',
          licenseNumber: licenseNumber || `DOC-${Date.now()}`,
          department: department || 'General',
          patients: [],
        });
        break;
        
      case UserRole.NURSE:
        user = await Nurse.create({
          email,
          password,
          firstName,
          lastName,
          phone,
          profilePicture: uploadedProfilePicture || profilePicture,
          role: UserRole.NURSE,
          shift: shift || 'DAY',
          certificationLevel: certificationLevel || 'RN',
          department: department || 'General',
          patients: [],
        });
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid role', statusCode: 400 },
        });
    }

    logger.info(`New user registered: ${user.email} (${user.role})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user },
    });
  } catch (error: any) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to register user', statusCode: 500 },
    });
  }
};

// Login
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.isActive) {
      logger.warn('Login failed: user not found or inactive', {
        email,
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials', statusCode: 401 },
      });
    }

    // Verify password using the model method
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      logger.warn('Login failed: invalid password', {
        email,
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials', statusCode: 401 },
      });
    }

    // Generate tokens
    // @ts-ignore - TypeScript has issues with jwt.sign overloads
    const accessToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // @ts-ignore - TypeScript has issues with jwt.sign overloads
    const refreshToken = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    logger.info(`User logged in: ${user.email}`);

    // Return user without password
    const userResponse = user.toJSON();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error: any) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Login failed', statusCode: 500 },
    });
  }
};

// Refresh token
export const refreshToken = async (req: AuthRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { message: 'Refresh token required', statusCode: 400 },
      });
    }

    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
    ) as { userId: string };

    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid refresh token', statusCode: 401 },
      });
    }

    // @ts-ignore - TypeScript has issues with jwt.sign overloads
    const newAccessToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (error: any) {
    logger.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      error: { message: 'Invalid refresh token', statusCode: 401 },
    });
  }
};

// Logout
export const logout = async (req: AuthRequest, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};
