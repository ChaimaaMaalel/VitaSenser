import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { UserRole } from '../models';
import logger from '../utils/logger';
import { Patient, Alert, Bed, VitalSigns, Floor, Room, Doctor, Nurse } from '../models';

// Get role-based dashboard data
export const getRoleBasedDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user?.role;
    
    switch (userRole) {
      case UserRole.ADMIN:
        return getDashboardStats(req, res);
      case UserRole.DOCTOR:
        return getDoctorDashboard(req, res);
      case UserRole.NURSE:
        return getNurseDashboard(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid user role', statusCode: 400 },
        });
    }
  } catch (error: any) {
    logger.error('Get role-based dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch dashboard', statusCode: 500 },
    });
  }
};

// Get dashboard statistics (ADMIN view)
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalPatients,
      activePatients,
      criticalPatients,
      activeAlerts,
      criticalAlerts,
      totalBeds,
      occupiedBeds,
    ] = await Promise.all([
      Patient.countDocuments(),
      Patient.countDocuments({
        status: { $in: ['ADMITTED', 'IN_TREATMENT', 'STABLE', 'CRITICAL'] },
      }),
      Patient.countDocuments({ status: 'CRITICAL' }),
      Alert.countDocuments({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }),
      Alert.countDocuments({
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
        severity: 'CRITICAL',
      }),
      Bed.countDocuments(),
      Bed.countDocuments({ status: 'OCCUPIED' }),
    ]);

    const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

    res.json({
      success: true,
      data: {
        role: 'ADMIN',
        patients: {
          total: totalPatients,
          active: activePatients,
          critical: criticalPatients,
        },
        alerts: {
          active: activeAlerts,
          critical: criticalAlerts,
        },
        beds: {
          total: totalBeds,
          occupied: occupiedBeds,
          available: totalBeds - occupiedBeds,
          occupancyRate: Math.round(occupancyRate * 10) / 10,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch dashboard stats', statusCode: 500 },
    });
  }
};

// Get doctor dashboard
export const getDoctorDashboard = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', statusCode: 401 },
      });
    }

    // Get doctor's info and assigned patients
    const doctor = await Doctor.findById(req.user.id)
      .populate({
        path: 'patients',
        select: '_id firstName lastName status bed diagnosis',
        populate: {
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        }
      })
      .lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Doctor not found', statusCode: 404 },
      });
    }

    const patientIds = doctor.patients.map((p: any) => p._id);

    // Get doctor's patients stats
    const [
      totalAssignedPatients,
      criticalPatients,
      activeAlerts,
      criticalAlerts,
    ] = await Promise.all([
      Patient.countDocuments({ _id: { $in: patientIds } }),
      Patient.countDocuments({
        _id: { $in: patientIds },
        status: 'CRITICAL',
      }),
      Alert.countDocuments({
        patient: { $in: patientIds },
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
      }),
      Alert.countDocuments({
        patient: { $in: patientIds },
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
        severity: 'CRITICAL',
      }),
    ]);

    // Get doctor's recent alerts
    const recentAlerts = await Alert.find({
      patient: { $in: patientIds },
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
    })
      .limit(10)
      .sort({ timestamp: -1 })
      .populate({
        path: 'patient',
        select: '_id firstName lastName bed',
        populate: {
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        }
      })
      .lean();

    res.json({
      success: true,
      data: {
        role: 'DOCTOR',
        doctor: {
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization,
          department: doctor.department,
        },
        patients: {
          total: totalAssignedPatients,
          critical: criticalPatients,
          list: doctor.patients,
        },
        alerts: {
          active: activeAlerts,
          critical: criticalAlerts,
          recent: recentAlerts,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get doctor dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch doctor dashboard', statusCode: 500 },
    });
  }
};

// Get nurse dashboard
export const getNurseDashboard = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', statusCode: 401 },
      });
    }

    // Get nurse's info
    const nurse = await Nurse.findById(req.user.id)
      .populate({
        path: 'patients',
        select: '_id firstName lastName status bed diagnosis',
        populate: {
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        }
      })
      .populate({
        path: 'assignedFloor',
        populate: {
          path: 'rooms',
          populate: {
            path: 'beds',
            populate: {
              path: 'patient',
              select: '_id firstName lastName status',
            }
          }
        }
      })
      .lean();

    if (!nurse) {
      return res.status(404).json({
        success: false,
        error: { message: 'Nurse not found', statusCode: 404 },
      });
    }

    const patientIds = nurse.patients.map((p: any) => p._id);

    // Get nurse's patients stats
    const [
      totalAssignedPatients,
      criticalPatients,
      activeAlerts,
      criticalAlerts,
    ] = await Promise.all([
      Patient.countDocuments({ _id: { $in: patientIds } }),
      Patient.countDocuments({
        _id: { $in: patientIds },
        status: 'CRITICAL',
      }),
      Alert.countDocuments({
        patient: { $in: patientIds },
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
      }),
      Alert.countDocuments({
        patient: { $in: patientIds },
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
        severity: 'CRITICAL',
      }),
    ]);

    // Get nurse's recent alerts
    const recentAlerts = await Alert.find({
      patient: { $in: patientIds },
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
    })
      .limit(10)
      .sort({ timestamp: -1 })
      .populate({
        path: 'patient',
        select: '_id firstName lastName bed',
        populate: {
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        }
      })
      .lean();

    // Get floor occupancy if assigned
    let floorOccupancy = null;
    if (nurse.assignedFloor) {
      const floor = nurse.assignedFloor as any;
      const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
      
      const totalBeds = rooms.reduce((sum: number, room: any) => {
        const beds = Array.isArray(room.beds) ? room.beds : [];
        return sum + beds.length;
      }, 0);
      
      const occupiedBeds = rooms.reduce((sum: number, room: any) => {
        const beds = Array.isArray(room.beds) ? room.beds : [];
        return sum + beds.filter((bed: any) => bed.status === 'OCCUPIED').length;
      }, 0);

      floorOccupancy = {
        floorNumber: floor.floorNumber,
        name: floor.name,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      };
    }

    res.json({
      success: true,
      data: {
        role: 'NURSE',
        nurse: {
          name: `${nurse.firstName} ${nurse.lastName}`,
          shift: nurse.shift,
          certificationLevel: nurse.certificationLevel,
          department: nurse.department,
        },
        patients: {
          total: totalAssignedPatients,
          critical: criticalPatients,
          list: nurse.patients,
        },
        alerts: {
          active: activeAlerts,
          critical: criticalAlerts,
          recent: recentAlerts,
        },
        floorOccupancy,
      },
    });
  } catch (error: any) {
    logger.error('Get nurse dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch nurse dashboard', statusCode: 500 },
    });
  }
};

// Get recent alerts
export const getRecentAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 10 } = req.query;

    const alerts = await Alert.find({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } })
      .limit(Number(limit))
      .sort({ timestamp: -1 })
      .populate({
        path: 'patient',
        select: '_id firstName lastName bed',
        populate: {
          path: 'bed',
          populate: {
            path: 'room',
            populate: { path: 'floor' }
          }
        }
      })
      .populate('vitalSigns')
      .lean();

    res.json({
      success: true,
      data: { alerts },
    });
  } catch (error: any) {
    logger.error('Get recent alerts error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch alerts', statusCode: 500 },
    });
  }
};

// Get patients overview
export const getPatientsOverview = async (req: AuthRequest, res: Response) => {
  try {
    // Group patients by status
    const patientsByStatus = await Patient.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          _count: '$count',
          _id: 0
        }
      }
    ]);

    // Get patients with active alerts
    const activeAlertIds = await Alert.distinct('patient', {
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
    });

    const patientsWithActiveAlerts = await Patient.find({
      _id: { $in: activeAlertIds },
      status: { $in: ['ADMITTED', 'IN_TREATMENT', 'STABLE', 'CRITICAL'] },
    })
      .select('_id firstName lastName status bed')
      .populate({
        path: 'bed',
        populate: {
          path: 'room',
          populate: { path: 'floor' }
        }
      })
      .limit(20)
      .lean();

    // Get latest alert for each patient
    const patientsWithAlerts = await Promise.all(
      patientsWithActiveAlerts.map(async (patient: any) => {
        const alerts = await Alert.find({
          patient: patient._id,
          status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
        })
          .sort({ timestamp: -1 })
          .limit(1)
          .lean();
        
        return {
          ...patient,
          alerts
        };
      })
    );

    res.json({
      success: true,
      data: {
        statusDistribution: patientsByStatus,
        patientsWithAlerts,
      },
    });
  } catch (error: any) {
    logger.error('Get patients overview error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch patients overview', statusCode: 500 },
    });
  }
};

// Get occupancy data
export const getOccupancyData = async (req: AuthRequest, res: Response) => {
  try {
    const floors = await Floor.find()
      .populate({
        path: 'rooms',
        populate: {
          path: 'beds'
        }
      })
      .lean();

    const occupancyByFloor = await Promise.all(floors.map(async (floor: any) => {
      const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
      
      const totalBeds = rooms.reduce((sum: number, room: any) => {
        const beds = Array.isArray(room.beds) ? room.beds : [];
        return sum + beds.length;
      }, 0);
      
      const occupiedBeds = rooms.reduce((sum: number, room: any) => {
        const beds = Array.isArray(room.beds) ? room.beds : [];
        return sum + beds.filter((bed: any) => bed.status === 'OCCUPIED').length;
      }, 0);

      return {
        floorId: floor._id,
        floorNumber: floor.floorNumber,
        name: floor.name,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        rooms: rooms.map((room: any) => {
          const beds = Array.isArray(room.beds) ? room.beds : [];
          return {
            roomId: room._id,
            roomNumber: room.roomNumber,
            type: room.type,
            totalBeds: beds.length,
            occupiedBeds: beds.filter((bed: any) => bed.status === 'OCCUPIED').length,
          };
        }),
      };
    }));

    res.json({
      success: true,
      data: { floors: occupancyByFloor },
    });
  } catch (error: any) {
    logger.error('Get occupancy data error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch occupancy data', statusCode: 500 },
    });
  }
};
