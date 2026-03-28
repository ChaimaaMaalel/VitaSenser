# Test API endpoints for Smart Hospital

$baseUrl = "http://localhost:5000/api/v1"

Write-Host "Testing Smart Hospital API..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1. Testing health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get
    Write-Host "   ✓ Health check passed" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Health check failed: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: Login
Write-Host "2. Testing login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "admin@hospital.com"
        password = "Admin@123"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.accessToken
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.data.user.firstName) $($loginResponse.data.user.lastName)" -ForegroundColor Gray
    Write-Host "   Role: $($loginResponse.data.user.role)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Login failed: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 3: Dashboard stats
Write-Host "3. Testing dashboard stats..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $token"
    }
    $stats = Invoke-RestMethod -Uri "$baseUrl/dashboard/stats" -Method Get -Headers $headers
    Write-Host "   ✓ Dashboard stats retrieved" -ForegroundColor Green
    Write-Host "   Total Patients: $($stats.data.totalPatients)" -ForegroundColor Gray
    Write-Host "   Critical Alerts: $($stats.data.criticalAlerts)" -ForegroundColor Gray
    Write-Host "   Bed Occupancy: $($stats.data.bedOccupancyRate)%" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Dashboard stats failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get patients
Write-Host "4. Testing get patients..." -ForegroundColor Yellow
try {
    $patients = Invoke-RestMethod -Uri "$baseUrl/patients?page=1&limit=5" -Method Get -Headers $headers
    Write-Host "   ✓ Patients retrieved" -ForegroundColor Green
    Write-Host "   Total: $($patients.data.total)" -ForegroundColor Gray
    Write-Host "   Page: $($patients.data.page) of $($patients.data.pages)" -ForegroundColor Gray
    foreach ($patient in $patients.data.patients) {
        Write-Host "   - $($patient.firstName) $($patient.lastName) ($($patient.status))" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Get patients failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 5: Recent alerts
Write-Host "5. Testing recent alerts..." -ForegroundColor Yellow
try {
    $alerts = Invoke-RestMethod -Uri "$baseUrl/dashboard/recent-alerts?limit=5" -Method Get -Headers $headers
    Write-Host "   ✓ Recent alerts retrieved" -ForegroundColor Green
    Write-Host "   Count: $($alerts.data.alerts.Count)" -ForegroundColor Gray
    foreach ($alert in $alerts.data.alerts) {
        Write-Host "   - $($alert.type): $($alert.message) [$($alert.severity)]" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Recent alerts failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 6: Occupancy data
Write-Host "6. Testing occupancy data..." -ForegroundColor Yellow
try {
    $occupancy = Invoke-RestMethod -Uri "$baseUrl/dashboard/occupancy" -Method Get -Headers $headers
    Write-Host "   ✓ Occupancy data retrieved" -ForegroundColor Green
    Write-Host "   Floors: $($occupancy.data.floors.Count)" -ForegroundColor Gray
    foreach ($floor in $occupancy.data.floors) {
        Write-Host "   - $($floor.name): $($floor.occupiedBeds)/$($floor.totalBeds) beds ($($floor.occupancyRate)%)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Occupancy data failed: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "API Tests Completed!" -ForegroundColor Cyan
