# 🍃 MongoDB Setup Guide - Smart Hospital

This guide will help you install and configure MongoDB for the Smart Hospital project.

---

## 📦 Installation

### Windows

#### Option 1: MongoDB Installer (Recommended)

1. Download MongoDB Community Server:
   - Visit: https://www.mongodb.com/try/download/community
   - Select: Windows x64
   - Click: Download

2. Run the installer (`mongodb-windows-x86_64-X.X.X.msi`)
   - Choose "Complete" installation
   - ✅ Check "Install MongoDB as a Service"
   - ✅ Check "Install MongoDB Compass" (GUI tool)

3. Verify installation:
```powershell
mongo --version
# or
mongod --version
```

#### Option 2: Using Chocolatey

```powershell
choco install mongodb
choco install mongodb-compass  # Optional GUI
```

#### Option 3: Using Docker

```powershell
docker pull mongo:latest
docker run -d -p 27017:27017 --name smart-hospital-mongo mongo:latest
```

---

## 🚀 Quick Start

### Start MongoDB Service

```powershell
# Windows Service (if installed as service)
net start MongoDB

# Or using mongod directly
mongod --dbpath C:\data\db
```

### Create Database

```powershell
# Connect to MongoDB
mongo

# Switch to database (creates if doesn't exist)
use smart_hospital

# Exit
exit
```

---

## ⚙️ Configuration

### 1. Create Data Directory

```powershell
# Create default data directory
mkdir C:\data\db

# Or custom location
mkdir C:\mongodb\data
```

### 2. Configure MongoDB

Create config file: `C:\mongodb\mongod.cfg`

```yaml
systemLog:
  destination: file
  path: C:\mongodb\logs\mongod.log
  logAppend: true

storage:
  dbPath: C:\mongodb\data
  journal:
    enabled: true

net:
  port: 27017
  bindIp: 127.0.0.1

security:
  authorization: enabled
```

### 3. Start with Configuration

```powershell
mongod --config C:\mongodb\mongod.cfg
```

---

## 🔐 Security Setup (Production)

### Create Admin User

```javascript
// Connect to MongoDB
mongo

// Switch to admin database
use admin

// Create admin user
db.createUser({
  user: "admin",
  pwd: "your-secure-password",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})

// Exit and reconnect with authentication
exit
```

### Connect with Authentication

```javascript
mongo -u admin -p your-secure-password --authenticationDatabase admin
```

### Create Application User

```javascript
use smart_hospital

db.createUser({
  user: "smart_hospital_user",
  pwd: "app-password",
  roles: [
    { role: "readWrite", db: "smart_hospital" }
  ]
})
```

### Update Connection String

```env
# Without authentication (development)
MONGODB_URI="mongodb://localhost:27017/smart_hospital"

# With authentication (production)
MONGODB_URI="mongodb://smart_hospital_user:app-password@localhost:27017/smart_hospital"
```

---

## 🛠️ MongoDB Compass (GUI Tool)

### Installation

Installed automatically with MongoDB or download separately:
https://www.mongodb.com/products/compass

### Connect to Database

1. Open MongoDB Compass
2. Connection string: `mongodb://localhost:27017`
3. Click "Connect"
4. Select database: `smart_hospital`

### Features

- 📊 Visual query builder
- 📈 Schema analyzer
- 🔍 Index management
- 📝 Document editor
- 📊 Aggregation pipeline builder

---

## 🚀 Backend Integration

### 1. Install Dependencies

```powershell
cd backend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:

```env
MONGODB_URI="mongodb://localhost:27017/smart_hospital"
```

### 3. Run Migrations (Seed Data)

```powershell
npm run seed
```

### 4. Start Backend

```powershell
npm run dev
```

---

## 📊 Database Structure

After seeding, you'll have these collections:

```
smart_hospital/
├── users (Admin, Doctor, Nurse)
├── hospitals
├── floors
├── rooms
├── beds
├── patients
├── vitalsigns
├── alerts
├── predictions
├── medicalprotocols
├── interventions
├── reports
└── auditlogs
```

---

## 🔍 Useful MongoDB Commands

### Database Operations

```javascript
// Show all databases
show dbs

// Switch to database
use smart_hospital

// Show collections
show collections

// Count documents
db.users.countDocuments()
db.patients.countDocuments()
```

### Query Examples

```javascript
// Find all users
db.users.find().pretty()

// Find admins only
db.users.find({ role: "ADMIN" })

// Find critical patients
db.patients.find({ status: "CRITICAL" })

// Find recent alerts
db.alerts.find().sort({ timestamp: -1 }).limit(10)

// Aggregate: Count patients by status
db.patients.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

### Backup & Restore

```powershell
# Backup database
mongodump --db smart_hospital --out C:\backup

# Restore database
mongorestore --db smart_hospital C:\backup\smart_hospital
```

---

## 🐛 Troubleshooting

### MongoDB Service Won't Start

```powershell
# Check if port 27017 is in use
netstat -ano | findstr :27017

# Kill process using port
taskkill /PID <PID> /F

# Remove lock file
del C:\data\db\mongod.lock

# Repair database
mongod --repair --dbpath C:\data\db

# Restart service
net start MongoDB
```

### Connection Refused

1. Check if MongoDB is running:
```powershell
Get-Service -Name MongoDB*
```

2. Check MongoDB logs:
```powershell
cat C:\mongodb\logs\mongod.log
```

3. Verify port 27017 is open:
```powershell
Test-NetConnection -ComputerName localhost -Port 27017
```

### Permission Issues

Run PowerShell as Administrator:
```powershell
# Set data directory permissions
icacls C:\data\db /grant Users:F
```

---

## 📈 Performance Optimization

### Create Indexes

```javascript
use smart_hospital

// User indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ role: 1 })

// Patient indexes
db.patients.createIndex({ assignedDoctor: 1 })
db.patients.createIndex({ status: 1 })
db.patients.createIndex({ admissionDate: -1 })

// VitalSigns indexes
db.vitalsigns.createIndex({ patient: 1, timestamp: -1 })

// Alert indexes
db.alerts.createIndex({ patient: 1, status: 1 })
db.alerts.createIndex({ severity: 1, timestamp: -1 })
```

### View Indexes

```javascript
db.users.getIndexes()
db.patients.getIndexes()
```

---

## 🌐 Cloud MongoDB (Atlas)

### Setup MongoDB Atlas (Free Tier)

1. Sign up: https://www.mongodb.com/cloud/atlas
2. Create cluster (M0 Free Tier)
3. Create database user
4. Whitelist IP: `0.0.0.0/0` (all IPs) or specific IP
5. Get connection string

### Connection String

```env
MONGODB_URI="mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/smart_hospital?retryWrites=true&w=majority"
```

---

## 📚 MongoDB Resources

- **Official Docs:** https://docs.mongodb.com/
- **Node.js Driver:** https://mongodb.github.io/node-mongodb-native/
- **Mongoose ODM:** https://mongoosejs.com/
- **MongoDB University:** https://university.mongodb.com/ (Free courses)

---

## ✅ Checklist

- [ ] MongoDB installed
- [ ] MongoDB service running
- [ ] Database created (`smart_hospital`)
- [ ] Backend `.env` configured
- [ ] Dependencies installed (`npm install`)
- [ ] Database seeded (`npm run seed`)
- [ ] Backend started (`npm run dev`)
- [ ] MongoDB Compass connected (optional)

---

**You're all set! 🎉**

Navigate to: http://localhost:5000/health to verify backend is running!
