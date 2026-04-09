import express, { Application } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createServer } from 'http';

import { connectDatabase } from './config/database';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import logger from './utils/logger';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import patientRoutes from './routes/patient.routes';
import hospitalRoutes from './routes/hospital.routes';
import alertRoutes from './routes/alert.routes';
import vitalSignsRoutes from './routes/vitalSigns.routes';
import dashboardRoutes from './routes/dashboard.routes';
import simulationRoutes from './routes/simulation.routes';
import aiRoutes from './routes/ai.routes';
import notificationRoutes from './routes/notification.routes';
import { setSocketServer } from './realtime/socket';

// Load environment variables
dotenv.config();

const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setSocketServer(io);

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API Routes
const API_VERSION = process.env.API_VERSION || 'v1';
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/patients`, patientRoutes);
app.use(`/api/${API_VERSION}/hospital`, hospitalRoutes);
app.use(`/api/${API_VERSION}/alerts`, alertRoutes);
app.use(`/api/${API_VERSION}/vital-signs`, vitalSignsRoutes);
app.use(`/api/${API_VERSION}/dashboard`, dashboardRoutes);
app.use(`/api/${API_VERSION}/simulation`, simulationRoutes);
app.use(`/api/${API_VERSION}/ai`, aiRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`WebSocket client connected: ${socket.id}`);

  socket.on('subscribe-patient', (patientId: string) => {
    socket.join(`patient:${patientId}`);
    logger.info(`Client ${socket.id} subscribed to patient ${patientId}`);
  });

  socket.on('subscribe-bed', (bedId: string) => {
    socket.join(`bed:${bedId}`);
    logger.info(`Client ${socket.id} subscribed to bed ${bedId}`);
  });

  socket.on('subscribe-user', (userId: string) => {
    socket.join(`user:${userId}`);
    logger.info(`Client ${socket.id} subscribed to user ${userId}`);
  });

  socket.on('unsubscribe-patient', (patientId: string) => {
    socket.leave(`patient:${patientId}`);
    logger.info(`Client ${socket.id} unsubscribed from patient ${patientId}`);
  });

  socket.on('unsubscribe-bed', (bedId: string) => {
    socket.leave(`bed:${bedId}`);
    logger.info(`Client ${socket.id} unsubscribed from bed ${bedId}`);
  });

  socket.on('unsubscribe-user', (userId: string) => {
    socket.leave(`user:${userId}`);
    logger.info(`Client ${socket.id} unsubscribed from user ${userId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`WebSocket client disconnected: ${socket.id}`);
  });
});

// Export io for use in other modules
export { io };

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();
    
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Smart Hospital Backend is running on port ${PORT}`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API: http://localhost:${PORT}/api/${API_VERSION}`);
      logger.info(`⚡ WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
