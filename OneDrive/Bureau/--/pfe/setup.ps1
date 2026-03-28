# Smart Hospital Setup Script
# Automates installation of Backend + Frontend

Write-Host "🏥 Smart Hospital - Automated Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found! Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check PostgreSQL
try {
    $pgVersion = psql --version
    Write-Host "✅ PostgreSQL installed: $pgVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  PostgreSQL not found in PATH" -ForegroundColor Yellow
    Write-Host "   Make sure PostgreSQL is installed and running" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📦 Installing Backend..." -ForegroundColor Cyan
Write-Host ""

# Backend Setup
Set-Location backend

if (Test-Path "node_modules") {
    Write-Host "⏭️  Backend dependencies already installed" -ForegroundColor Yellow
} else {
    Write-Host "📥 Installing backend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Backend installation failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Backend dependencies installed" -ForegroundColor Green
}

# Copy .env if not exists
if (!(Test-Path ".env")) {
    Write-Host "📄 Creating .env file..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env created (please configure DATABASE_URL)" -ForegroundColor Green
}

Write-Host ""
Write-Host "📦 Installing Frontend..." -ForegroundColor Cyan
Write-Host ""

# Frontend Setup
Set-Location ../frontend

if (Test-Path "node_modules") {
    Write-Host "⏭️  Frontend dependencies already installed" -ForegroundColor Yellow
} else {
    Write-Host "📥 Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Frontend installation failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green
}

# Copy .env if not exists
if (!(Test-Path ".env")) {
    Write-Host "📄 Creating .env file..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env created" -ForegroundColor Green
}

Set-Location ..

Write-Host ""
Write-Host "✨ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Configure backend/.env with your PostgreSQL credentials" -ForegroundColor White
Write-Host "   DATABASE_URL='postgresql://postgres:PASSWORD@localhost:5432/smart_hospital'" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Create database:" -ForegroundColor White
Write-Host "   psql -U postgres -c 'CREATE DATABASE smart_hospital;'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Run database migrations:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   npm run prisma:migrate" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Start development servers:" -ForegroundColor White
Write-Host "   Terminal 1: cd backend && npm run dev" -ForegroundColor Gray
Write-Host "   Terminal 2: cd frontend && npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "🚀 Happy Coding!" -ForegroundColor Cyan
