# 🏥 Smart Hospital - Installation & Setup Guide

## 📋 Prerequisites

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)
- **Python** (v3.9+) - For AI models
- **Git** - [Download](https://git-scm.com/)

---

## 🚀 Quick Start (Windows)

### Option 1: Automated Installation

```powershell
# Run the automated setup script
.\setup.ps1
```

### Option 2: Manual Installation

#### 1️⃣ Setup PostgreSQL Database

```powershell
# Create database
psql -U postgres
CREATE DATABASE smart_hospital;
\q
```

#### 2️⃣ Backend Setup

```powershell
# Navigate to backend folder
cd backend

# Install dependencies
npm install

# Copy environment file
copy .env.example .env

# Edit .env file with your database credentials
# DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/smart_hospital?schema=public"

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

**Backend will run on:** http://localhost:5000

#### 3️⃣ Frontend Setup

```powershell
# Open new terminal
cd frontend

# Install dependencies
npm install

# Copy environment file
copy .env.example .env

# Start development server
npm run dev
```

**Frontend will run on:** http://localhost:3000

---

## 🗄️ Database Setup (Detailed)

### Install PostgreSQL

1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run installer (default port: 5432)
3. Remember your postgres password!

### Create Database

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database
CREATE DATABASE smart_hospital;

-- Create user (optional)
CREATE USER smart_admin WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE smart_hospital TO smart_admin;

-- Exit
\q
```

### Configure Backend .env

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/smart_hospital?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this"
PORT=5000
NODE_ENV=development
```

### Run Migrations

```powershell
cd backend
npm run prisma:migrate
```

This will create all database tables automatically!

---

## 📊 Seed Sample Data (Optional)

```powershell
cd backend
npm run seed
```

This creates:
- ✅ Admin user: `admin@hospital.com` / `password123`
- ✅ Doctor user: `doctor@hospital.com` / `password123`
- ✅ Nurse user: `nurse@hospital.com` / `password123`
- ✅ Sample hospital floors, rooms, beds
- ✅ Sample patients

---

## 🧪 Testing the Application

### 1. Start Backend

```powershell
cd backend
npm run dev
```

You should see:
```
🚀 Smart Hospital Backend is running on port 5000
📡 Environment: development
🔗 API: http://localhost:5000/api/v1
⚡ WebSocket: ws://localhost:5000
```

### 2. Start Frontend

```powershell
cd frontend
npm run dev
```

You should see:
```
VITE v5.0.10  ready in 500 ms
➜  Local:   http://localhost:3000/
```

### 3. Open Browser

Visit: http://localhost:3000

Login with:
- **Email:** `doctor@hospital.com`
- **Password:** `password123`

---

## 🔧 Development Tools

### Prisma Studio (Database GUI)

```powershell
cd backend
npm run prisma:studio
```

Opens at: http://localhost:5555

### Backend API Documentation

Visit: http://localhost:5000/health

### View Logs

```powershell
# Backend logs
cd backend
cat logs/combined.log
```

---

## 🏗️ Project Structure

```
pfe/
├── backend/              # Node.js + Express API
│   ├── prisma/          # Database schema & migrations
│   ├── src/
│   │   ├── controllers/ # Request handlers
│   │   ├── routes/      # API routes
│   │   ├── middlewares/ # Auth, error handling
│   │   ├── utils/       # Helpers
│   │   └── server.ts    # Main entry point
│   └── package.json
│
├── frontend/            # React + TypeScript
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route pages
│   │   ├── store/       # State management
│   │   ├── lib/         # API client
│   │   └── App.tsx      # Main app
│   └── package.json
│
└── model/               # Python AI models
    ├── model_lstm.py
    ├── inference.py
    └── requirements.txt
```

---

## 🐛 Common Issues

### Port Already in Use

```powershell
# Check what's using port 5000
netstat -ano | findstr :5000

# Kill the process
taskkill /PID <PID> /F

# Or change port in .env
PORT=5001
```

### Database Connection Error

```powershell
# Check if PostgreSQL is running
Get-Service -Name postgresql*

# Start PostgreSQL if stopped
Start-Service postgresql-x64-14
```

### Prisma Migration Errors

```powershell
# Reset database (⚠️ deletes all data)
npm run prisma:migrate reset

# Or manually
npx prisma migrate reset --force
```

### Frontend Not Loading

```powershell
# Clear node_modules and reinstall
rm -r node_modules
npm install

# Clear cache
npm cache clean --force
```

---

## 📦 Production Build

### Backend

```powershell
cd backend
npm run build
npm start
```

### Frontend

```powershell
cd frontend
npm run build
npm run preview
```

---

## 🔐 Security Checklist

Before deploying:

- [ ] Change `JWT_SECRET` in `.env`
- [ ] Use strong database password
- [ ] Update `CORS_ORIGIN` to production URL
- [ ] Enable HTTPS
- [ ] Use environment variables (never commit `.env`)
- [ ] Run security audit: `npm audit fix`

---

## 📚 Next Steps

1. ✅ Setup Backend & Frontend
2. ✅ Login to dashboard
3. 📊 Explore dashboard statistics
4. 👥 Add sample patients
5. 🚨 Test alert system
6. 🏥 Configure hospital structure
7. 🧠 Integrate AI models (see `/model` folder)

---

## 💡 Tips

- Use **VS Code** with extensions:
  - Prisma
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense

- Enable **auto-save** in VS Code

- Use **Postman** or **Thunder Client** for API testing

---

## 📞 Support

For issues or questions:
- Check `/backend/README.md`
- Check `/frontend/README.md`
- Review error logs in `/backend/logs/`

---

## 🎉 You're Ready!

Your Smart Hospital system is now running!

**Backend:** http://localhost:5000  
**Frontend:** http://localhost:3000  
**Prisma Studio:** http://localhost:5555

Happy coding! 🚀
