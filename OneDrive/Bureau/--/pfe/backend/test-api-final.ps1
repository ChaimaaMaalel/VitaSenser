# Smart Hospital API Test Script
$baseUrl = "http://localhost:5000/api/v1"

Write-Host "`n🏥 Smart Hospital API Test Suite`n" -ForegroundColor Cyan

# Test 1: Login
Write-Host "1. Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@hospital.com"
    password = "Admin@123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -Content Type "application/json"
    $token = $loginResponse.data.accessToken
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.data.user.firstName) $($loginResponse.data.user.lastName)" -ForegroundColor Gray
    Write-Host "   Role: $($loginResponse.data.user.role)`n" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Login failed: $_`n" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

# Test 2: Dashboard Stats
Write-Host "2. Testing Dashboard Stats..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/dashboard/stats" -Method Get -Headers $headers
    Write-Host "   ✓ Dashboard stats retrieved" -ForegroundColor Green
    Write-Host "   Total Patients: $($stats.data.totalPatients)" -ForegroundColor Gray
    Write-Host "   Critical Alerts: $($stats.data.criticalAlerts)" -ForegroundColor Gray
    $bedOccupancy = $stats.data.bedOccupancyRate
    Write-Host "   Bed Occupancy: $bedOccupancy percent`n" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Dashboard stats failed: $_`n" -ForegroundColor Red
}

# Test 3: Get Patients (with URL encoding)
Write-Host "3. Testing Get Patients..." -ForegroundColor Yellow
try {
    $patientsUrl = "$baseUrl/patients?page=1" + [System.Uri]::EscapeDataString("&") + "limit=5"
    $patients = Invoke-RestMethod -Uri "$baseUrl/patients?page=1" -Method Get -Headers $headers
    Write-Host "   ✓ Patients retrieved" -ForegroundColor Green
    Write-Host "   Total: $($patients.data.total)" -ForegroundColor Gray
    Write-Host "   Page: $($patients.data.page) of $($patients.data.pages)" -ForegroundColor Gray
    foreach ($patient in $patients.data.patients) {
        Write-Host "   - $($patient.firstName) $($patient.lastName) ($($patient.status))" - ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "   ✗ Get patients failed: $_`n" -ForegroundColor Red
}

# Test 4: Recent Alerts  
Write-Host "4. Testing Recent Alerts..." -ForegroundColor Yellow
try {
    $alerts = Invoke-RestMethod -Uri "$baseUrl/dashboard/recent-alerts?limit=5" -Method Get -Headers $headers
    Write-Host "   ✓ Recent alerts retrieved" -ForegroundColor Green
    Write-Host "   Count: $($alerts.data.alerts.Count)" -ForegroundColor Gray
    foreach ($alert in $alerts.data.alerts) {
        Write-Host "   - $($alert.type): $($alert.message) [$($alert.severity)]" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "   ✗ Recent alerts failed: $_`n" -ForegroundColor Red
}

# Test 5: Occupancy Data
Write-Host "5. Testing Occupancy Data..." -ForegroundColor Yellow
try {
    $occupancy = Invoke-RestMethod -Uri "$baseUrl/dashboard/occupancy" -Method Get -Headers $headers
    Write-Host "   ✓ Occupancy data retrieved" -ForegroundColor Green
    Write-Host "   Floors: $($occupancy.data.floors.Count)" -ForegroundColor Gray
    foreach ($floor in $occupancy.data.floors) {
        $occupancyPercent = $floor.occupancyRate
        Write-Host "   - $($floor.name): $($floor.occupiedBeds)/$($floor.totalBeds) beds ($occupancyPercent percent)" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "   ✗ Occupancy data failed: $_`n" -ForegroundColor Red
}

# Test 6: Patients Overview
Write-Host "6. Testing Patients Overview..." -ForegroundColor Yellow
try {
    $overview = Invoke-RestMethod -Uri "$baseUrl/dashboard/patients-overview" -Method Get -Headers $headers
    Write-Host "   ✓ Patients overview retrieved" -ForegroundColor Green
    Write-Host "   Total Patients: $($overview.data.patientsWithAlerts.Count)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ✗ Patients overview failed: $_`n" -ForegroundColor Red
}

Write-Host "✅ API Tests Completed!`n" -ForegroundColor Cyan
