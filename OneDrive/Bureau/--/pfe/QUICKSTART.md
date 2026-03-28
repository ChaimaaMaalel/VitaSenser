# 🚀 Quick Start Guide - Smart Hospital

This guide will get your Smart Hospital system up and running in **5 minutes**.

---

## ⚡ Super Fast Setup (Windows)

### Step 1: Install MongoDB
```powershell
# Download and install MongoDB from: https://www.mongodb.com/try/download/community
# Or use Chocolatey:
choco install mongodb

# Start MongoDB service
net start MongoDB
```

### Step 2: Run Automated Setup
```powershell
.\setup.ps1
```

### Step 3: Create Database
```powershell
# MongoDB creates database automatically on first use
# Just make sure MongoDB is running!
```

### Step 4: Configure Environment
```powershell
# Edit backend/.env
# MONGODB_URI="mongodb://localhost:27017/smart_hospital"
```

### Step 5: Initialize Database
```powershell
cd backend
npm run seed
```

### Step 6: Start Everything
```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### Step 6: Open Browser
Visit: **http://localhost:3000**

Login with:
- Email: `doctor@hospital.com`
- Password: `password123`

---

## 🎯 That's It!

You should now see the Smart Hospital dashboard with:
- ✅ Live patient statistics
- ✅ Recent alerts
- ✅ Patient overview
- ✅ Real-time monitoring

---

## 📚 Next Steps

1. **Explore the Dashboard** - Click around and familiarize yourself with the UI
2. **View Patients** - Navigate to Patients page to see admitted patients
3. **Check Alerts** - Visit Alerts page to see critical notifications
4. **Manage Hospital** - Configure floors, rooms, and beds
5. **Check Database** - Run `npm run prisma:studio` to view data

---

## 🐛 Troubleshooting

### "Database connection failed"
```powershell
# Make sure PostgreSQL is running
Get-Service postgresql*

# If not running, start it
Start-Service postgresql-x64-14
```

### "Port 5000 already in use"
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual number)
taskkill /PID 1234 /F
```

### "npm install failed"
```powershell
# Clear cache and retry
npm cache clean --force
rm -r node_modules
npm install
```

---

## 🔑 Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hospital.com | password123 |
| Doctor | doctor@hospital.com | password123 |
| Nurse | nurse@hospital.com | password123 |

---

## 📊 Sample Data Included

After running `npm run seed`, you'll have:
- 👥 **6 Users** (1 Admin, 2 Doctors, 3 Nurses)
- 🏥 **1 Hospital** with 3 floors
- 🚪 **10 Rooms** (5 ICU + 5 General)
- 🛏️ **30+ Beds** ready for patients
- 👨‍⚕️ **3 Sample Patients** with vital signs
- 🚨 **2 Active Alerts** (1 critical, 1 medium)
- 📋 **2 Medical Protocols**
- 🤖 **AI Predictions** for high-risk patient

---

## 🛠️ Development Tools

### Open Prisma Studio (Database GUI)
```powershell
cd backend
npm run prisma:studio
```
Opens at: http://localhost:5555

### View Backend Logs
```powershell
cd backend
cat logs/combined.log
```

### Test API Endpoints
Use Thunder Client or Postman to test:
- `POST http://localhost:5000/api/v1/auth/login`
- `GET http://localhost:5000/api/v1/patients`
- `GET http://localhost:5000/api/v1/dashboard/stats`

---

## 📱 Frontend Features

- ✅ **Responsive Design** - Works on desktop, tablet, mobile
- ✅ **Dark Theme** - Professional medical UI
- ✅ **Real-time Updates** - WebSocket integration
- ✅ **Role-based Access** - Different views for Admin/Doctor/Nurse
- ✅ **Data Visualization** - Charts for vital signs
- ✅ **Toast Notifications** - User-friendly alerts

---

## 🎨 Tech Stack Highlights

**Backend:**
- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL
- JWT Authentication
- Socket.IO WebSockets

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS
- Zustand State Management
- Recharts Visualization

**AI/ML:**
- Python + TensorFlow
- LSTM, Random Forest models
- Real-time predictions

---

## 📖 Full Documentation

For more details, see:
- [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) - Complete installation instructions
- [backend/README.md](backend/README.md) - Backend API documentation
- [frontend/README.md](frontend/README.md) - Frontend component guide
- [model/README.md](model/README.md) - AI models documentation

---

## 💡 Pro Tips

1. **Use VS Code** with extensions: Prisma, ESLint, Tailwind CSS IntelliSense
2. **Enable Auto-save** in VS Code for faster development
3. **Use Prisma Studio** to quickly view and edit database records
4. **Check Logs** regularly in `/backend/logs/` for debugging
5. **Use Browser DevTools** to inspect API calls and WebSocket events

---

## 🎓 Learning Path

1. ✅ Complete initial setup
2. 📚 Read backend API documentation
3. 🎨 Explore frontend components
4. 🗄️ Understand database schema (Prisma Studio)
5. 🔐 Test authentication flow
6. 📡 Implement WebSocket events
7. 🤖 Integrate AI prediction models
8. 🚀 Deploy to production

---

**Happy Coding! 🏥💙**

For questions: Check `docs/` folder or review code comments
