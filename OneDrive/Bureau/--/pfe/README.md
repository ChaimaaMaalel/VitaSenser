# 🏥 Smart Hospital - IoT Medical Monitoring System

A comprehensive, professional-grade hospital monitoring system with real-time patient tracking, AI-powered predictions, and intelligent alerting.

## 🌟 Features

### 👥 Multi-Role System
- **Admin** - Full system control, user management, hospital configuration
- **Doctor** - Patient management, medical protocols, alert validation
- **Nurse** - Patient monitoring, vital signs updates, alert acknowledgment

### 📊 Real-Time Monitoring
- Live patient vital signs (HR, SpO2, Temperature, ECG)
- WebSocket-based real-time updates
- Customizable dashboards per role

### 🤖 AI-Powered Predictions
- **LSTM Model** - Predict SpO2 30 minutes in advance
- **Isolation Forest** - Anomaly detection
- **Random Forest** - Patient status classification
- **Logistic Regression** - Cardiac risk assessment

### 🚨 Intelligent Alert System
- Multi-level severity (Critical, High, Medium, Low)
- Real-time notifications
- Alert acknowledgment workflow
- Intervention tracking

### 🏥 Hospital Management
- Multi-floor support
- Room & bed management
- Occupancy tracking
- Resource allocation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  - Dashboard  - Patients  - Alerts  - Hospital Mgmt     │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/REST + WebSocket
┌─────────────────┴───────────────────────────────────────┐
│                 BACKEND (Node.js + Express)              │
│  - Auth  - API Routes  - Real-time Events               │
└─────────────────┬──────────────┬────────────────────────┘
                  │              │
        ┌─────────┴───┐    ┌─────┴──────────┐
        │ PostgreSQL  │    │  AI Service    │
        │  (Prisma)   │    │   (Python)     │
        └─────────────┘    └────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- PostgreSQL v14+
- Python 3.9+ (for AI models)

### Installation

```bash
# 1. Clone repository
git clone <your-repo-url>
cd pfe

# 2. Run automated setup (Windows)
.\setup.ps1

# 3. Configure environment
# Edit backend/.env with your database credentials

# 4. Setup database
cd backend
npm run prisma:migrate
npm run seed  # Optional: creates sample data

# 5. Start servers
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Visit: **http://localhost:3000**

---

## 📁 Project Structure

```
pfe/
├── backend/              # Node.js + Express + TypeScript
│   ├── prisma/          # Database schema
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── utils/
│   │   └── server.ts
│   └── package.json
│
├── frontend/            # React + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/
│   │   └── App.tsx
│   └── package.json
│
├── model/               # AI Models (Python)
│   ├── model_lstm.py
│   ├── inference.py
│   └── requirements.txt
│
└── docs/                # Documentation
  └── class_diagram.mmd
```

---

## 🔐 Default Credentials

```
Admin:  admin@hospital.com  / password123
Doctor: doctor@hospital.com / password123
Nurse:  nurse@hospital.com  / password123
```

---

## 🛠️ Tech Stack

### Backend
- **Node.js + Express** - REST API
- **TypeScript** - Type safety
- **Prisma ORM** - Database management
- **PostgreSQL** - Database
- **Socket.IO** - Real-time communication
- **JWT** - Authentication
- **Winston** - Logging

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Router** - Navigation
- **Recharts** - Data visualization
- **Lucide React** - Icons
- **Axios** - HTTP client

### AI/ML
- **TensorFlow/Keras** - LSTM model
- **Scikit-learn** - ML algorithms
- **Python** - AI service

---

## 📊 Database Schema

See [class_diagram.mmd](docs/class_diagram.mmd) for complete UML diagram.

**Main Entities:**
- Users (Admin, Doctor, Nurse)
- Hospital Structure (Floors, Rooms, Beds)
- Patients
- Vital Signs
- Alerts
- Predictions
- Medical Protocols
- Interventions
- Audit Logs

---

## 🧪 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/refresh` - Refresh token

### Patients
- `GET /api/v1/patients` - List patients
- `POST /api/v1/patients` - Create patient
- `GET /api/v1/patients/:id` - Get patient details
- `POST /api/v1/patients/:id/admit` - Admit patient
- `POST /api/v1/patients/:id/discharge` - Discharge patient

### Dashboard
- `GET /api/v1/dashboard/stats` - Dashboard statistics
- `GET /api/v1/dashboard/recent-alerts` - Recent alerts
- `GET /api/v1/dashboard/patients-overview` - Patients overview

Full API documentation: See [backend/README.md](backend/README.md)

---

## 🔧 Development

### Backend Development

```bash
cd backend

# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production
npm start

# Database management
npm run prisma:studio  # Opens GUI
npm run prisma:migrate # Run migrations
```

### Frontend Development

```bash
cd frontend

# Development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📈 Features Roadmap

- [x] Multi-role authentication
- [x] Real-time dashboard
- [x] Patient management
- [x] Alert system
- [x] Hospital structure management
- [ ] AI model integration (Python service)
- [ ] WebSocket real-time updates
- [ ] Advanced analytics & reports
- [ ] Mobile app (React Native)
- [ ] Email/SMS notifications
- [ ] Multi-hospital support

---

## 🤝 Contributing

This is a PFE (Projet de Fin d'Études) project.

---

## 📄 License

MIT License - See LICENSE file

---

## 👨‍💻 Authors

Smart Hospital Team - PFE 2024

---

## 📚 Documentation

- [Installation Guide](INSTALLATION_GUIDE.md)
- [Backend Documentation](backend/README.md)
- [Frontend Documentation](frontend/README.md)
- [AI Models Guide](model/README.md)

---

## 🎯 System Requirements

- **Minimum:**
  - CPU: Dual-core 2.0 GHz
  - RAM: 4 GB
  - Storage: 10 GB

- **Recommended:**
  - CPU: Quad-core 2.5 GHz+
  - RAM: 8 GB+
  - Storage: 20 GB SSD

---

## 🐛 Known Issues

None at the moment. Report issues via GitHub Issues.

---

## 🙏 Acknowledgments

- Medical domain expertise consultants
- Open-source community
- University supervisors

---

**Made with ❤️ for improving hospital care quality**
