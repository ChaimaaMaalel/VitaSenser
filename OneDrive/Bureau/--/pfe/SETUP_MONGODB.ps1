# Smart Hospital - MongoDB Setup Script for Windows
# Run this script in PowerShell as Administrator

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   Smart Hospital - MongoDB Setup" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if running as Administrator
function Test-Administrator {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Check admin privileges
if (-not (Test-Administrator)) {
    Write-Host "❌ This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Step 1: Check if MongoDB is already installed
Write-Host "🔍 Checking for existing MongoDB installation..." -ForegroundColor Yellow
$mongoPath = Get-Command mongod -ErrorAction SilentlyContinue

if ($mongoPath) {
    Write-Host "✅ MongoDB is already installed at: $($mongoPath.Source)" -ForegroundColor Green
    $version = & mongod --version | Select-String "db version"
    Write-Host "   Version: $version" -ForegroundColor Cyan
} else {
    Write-Host "❌ MongoDB not found. Installing..." -ForegroundColor Yellow
    
    # Step 2: Check if Chocolatey is installed
    $chocoPath = Get-Command choco -ErrorAction SilentlyContinue
    
    if (-not $chocoPath) {
        Write-Host "📦 Installing Chocolatey package manager..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "✅ Chocolatey installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "✅ Chocolatey is already installed" -ForegroundColor Green
    }
    
    # Step 3: Install MongoDB using Chocolatey
    Write-Host "📦 Installing MongoDB (this may take a few minutes)..." -ForegroundColor Yellow
    choco install mongodb -y
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MongoDB installed successfully!" -ForegroundColor Green
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Host "❌ MongoDB installation failed" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Create MongoDB data directory
Write-Host ""
Write-Host "📁 Setting up MongoDB data directory..." -ForegroundColor Yellow
$dataDir = "C:\data\db"

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "✅ Created directory: $dataDir" -ForegroundColor Green
} else {
    Write-Host "✅ Data directory already exists: $dataDir" -ForegroundColor Green
}

# Step 5: Create MongoDB log directory
$logDir = "C:\data\log"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-Host "✅ Created log directory: $logDir" -ForegroundColor Green
}

# Step 6: Start MongoDB service
Write-Host ""
Write-Host "🚀 Starting MongoDB service..." -ForegroundColor Yellow

$mongoService = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue

if ($mongoService) {
    if ($mongoService.Status -eq "Running") {
        Write-Host "✅ MongoDB service is already running" -ForegroundColor Green
    } else {
        Start-Service MongoDB
        Write-Host "✅ MongoDB service started" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  MongoDB service not found. Starting manually..." -ForegroundColor Yellow
    Start-Process -FilePath "mongod" -ArgumentList "--dbpath `"$dataDir`" --logpath `"$logDir\mongod.log`"" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "✅ MongoDB started manually" -ForegroundColor Green
}

# Step 7: Test MongoDB connection
Write-Host ""
Write-Host "🧪 Testing MongoDB connection..." -ForegroundColor Yellow

Start-Sleep -Seconds 2

$mongoClient = Get-Command mongosh -ErrorAction SilentlyContinue
if (-not $mongoClient) {
    $mongoClient = Get-Command mongo -ErrorAction SilentlyContinue
}

if ($mongoClient) {
    $testResult = & $mongoClient.Name --eval "db.version()" --quiet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MongoDB connection successful!" -ForegroundColor Green
        Write-Host "   MongoDB Version: $testResult" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Could not connect to MongoDB" -ForegroundColor Yellow
    }
}

# Step 8: Install backend dependencies
Write-Host ""
Write-Host "📦 Installing backend dependencies..." -ForegroundColor Yellow

$backendPath = Join-Path $PSScriptRoot "backend"

if (Test-Path $backendPath) {
    Push-Location $backendPath
    
    Write-Host "Running: npm install" -ForegroundColor Cyan
    npm install
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    }
    
    Pop-Location
} else {
    Write-Host "⚠️  Backend folder not found at: $backendPath" -ForegroundColor Yellow
}

# Step 9: Setup environment variables
Write-Host ""
Write-Host "⚙️  Setting up environment variables..." -ForegroundColor Yellow

$envFile = Join-Path $backendPath ".env"
$envExample = Join-Path $backendPath ".env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "✅ Created .env file from .env.example" -ForegroundColor Green
        Write-Host "⚠️  Don't forget to update your .env file with actual values!" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  .env.example not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Step 10: Display summary
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "           Setup Complete! ✅" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "   • MongoDB installed and running" -ForegroundColor White
Write-Host "   • Data directory: $dataDir" -ForegroundColor White
Write-Host "   • Connection URI: mongodb://localhost:27017" -ForegroundColor White
Write-Host "   • Backend dependencies installed" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Edit backend/.env file with your settings" -ForegroundColor Yellow
Write-Host "   2. Run: cd backend" -ForegroundColor Yellow
Write-Host "   3. Run: npm run seed    # Seed sample data" -ForegroundColor Yellow
Write-Host "   4. Run: npm run dev     # Start development server" -ForegroundColor Yellow
Write-Host ""
Write-Host "📊 Useful Commands:" -ForegroundColor Cyan
Write-Host "   • Connect to MongoDB:  mongosh" -ForegroundColor White
Write-Host "   • Stop MongoDB:        net stop MongoDB" -ForegroundColor White
Write-Host "   • Start MongoDB:       net start MongoDB" -ForegroundColor White
Write-Host "   • View databases:      mongosh --eval 'show dbs'" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   • MONGODB_SETUP.md - Complete MongoDB guide" -ForegroundColor White
Write-Host "   • MIGRATION_SUMMARY.md - Migration details" -ForegroundColor White
Write-Host "   • QUICKSTART.md - Quick start guide" -ForegroundColor White
Write-Host ""
Write-Host "Happy coding! 🎉" -ForegroundColor Green
Write-Host ""
