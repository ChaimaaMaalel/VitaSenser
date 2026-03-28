# Smart Hospital Backend - MongoDB + Mongoose

Backend API pour le système Smart Hospital avec MongoDB comme base de données.

##Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure MongoDB connection in .env
# MONGODB_URI="mongodb://localhost:27017/smart_hospital"

# Seed database (optional)
npm run seed
```

## Development

```bash
# Start MongoDB (if not running as service)
net start MongoDB

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Tech Stack

- **Database:** MongoDB 6.0+
- **ODM:** Mongoose 8.0
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Language:** TypeScript
- **Auth:** JWT
- **Real-time:** Socket.IO

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout

### Patients
- `GET /api/v1/patients` - Get all patients
- `GET /api/v1/patients/:id` - Get patient by ID
- `POST /api/v1/patients` - Create patient
- `PUT /api/v1/patients/:id` - Update patient
- `POST /api/v1/patients/:id/admit` - Admit patient
- `POST /api/v1/patients/:id/discharge` - Discharge patient

### Dashboard
- `GET /api/v1/dashboard/stats` - Get dashboard statistics
- `GET /api/v1/dashboard/recent-alerts` - Get recent alerts
- `GET /api/v1/dashboard/patients-overview` - Get patients overview
- `GET /api/v1/dashboard/occupancy` - Get hospital occupancy

## WebSocket Events

- `subscribe-patient` - Subscribe to patient updates
- `unsubscribe-patient` - Unsubscribe from patient updates
- `new-alert` - New alert created
- `vital-signs-update` - New vital signs data
