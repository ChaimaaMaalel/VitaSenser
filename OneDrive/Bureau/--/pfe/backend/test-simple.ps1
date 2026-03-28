# Simple API Test
$baseUrl = "http://localhost:5000/api/v1"

Write-Host "`nTesting Smart Hospital API...`n" -ForegroundColor Cyan

# Test 1: Login
Write-Host "1. Login..." -ForegroundColor Yellow
$loginBody = '{"email":"admin@hospital.com","password":"Admin@123"}'
$login = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $login.data.accessToken
Write-Host "   OK - User: $($login.data.user.firstName) $($login.data.user.lastName)`n" -ForegroundColor Green

$headers = @{
    Authorization = "Bearer $token"
}

# Test 2: Dashboard Stats
Write-Host "2. Dashboard Stats..." -ForegroundColor Yellow
$stats = Invoke-RestMethod -Uri "$baseUrl/dashboard/stats" -Headers $headers
Write-Host "   OK - Patients: $($stats.data.totalPatients), Alerts: $($stats.data.criticalAlerts)`n" -ForegroundColor Green

# Test 3: Get Patients
Write-Host "3. Get Patients..." -ForegroundColor Yellow
$patients = Invoke-RestMethod -Uri "$baseUrl/patients" -Headers $headers
Write-Host "   OK - Total: $($patients.data.total)`n" -ForegroundColor Green

# Test 4: Recent Alerts
Write-Host "4. Recent Alerts..." -ForegroundColor Yellow
$alerts = Invoke-RestMethod -Uri "$baseUrl/dashboard/recent-alerts" -Headers $headers
Write-Host "   OK - Alerts: $($alerts.data.alerts.Count)`n" -ForegroundColor Green

# Test 5: Occupancy Data
Write-Host "5. Occupancy Data..." -ForegroundColor Yellow
$occupancy = Invoke-RestMethod -Uri "$baseUrl/dashboard/occupancy" -Headers $headers
Write-Host "   OK - Floors: $($occupancy.data.floors.Count)`n" -ForegroundColor Green

Write-Host "All tests passed!`n" -ForegroundColor Cyan
