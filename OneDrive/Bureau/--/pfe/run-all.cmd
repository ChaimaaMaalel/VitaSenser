@echo off
setlocal

rem Launch backend, frontend, and app in the same window (background processes).
set ROOT=%~dp0

start "backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"
start "frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"
start "app" cmd /k "cd /d "%ROOT%app" && npm start"

echo All services started in this window.
echo Press Ctrl+C to stop this launcher (services will keep running until you close their npm processes).
pause
