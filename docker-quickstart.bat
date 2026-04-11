@echo off
REM Quick Start Script for Smoke Station Delivery Docker Setup (Windows)

echo.
echo 🐳 Docker Setup - Smoke Station Delivery
echo ========================================
echo.

REM Check if Docker is running
docker ps >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

REM Create .env if it doesn't exist
if not exist ".env" (
    echo 📝 Creating .env from .env.example...
    copy .env.example .env
    echo ✅ .env created. Please review and update sensitive values.
) else (
    echo ✅ .env already exists
)

echo.

REM Build images
echo 🔨 Building Docker images... (this may take 2-5 minutes)
docker compose build --pull

if errorlevel 1 (
    echo ❌ Build failed
    pause
    exit /b 1
)

echo.

REM Start services
echo 🚀 Starting services...
docker compose up -d

if errorlevel 1 (
    echo ❌ Failed to start services
    pause
    exit /b 1
)

echo.

REM Wait for database
echo ⏳ Waiting for database to be healthy...
setlocal enabledelayedexpansion
set max_attempts=30
set attempt=0

:wait_loop
if %attempt% geq %max_attempts% (
    echo ⚠️  Database health check timed out, but services may still be starting...
    goto status_check
)

docker compose exec -T db pg_isready -U backend_user >nul 2>&1
if errorlevel 0 (
    echo ✅ Database is healthy
    goto status_check
)

echo    (attempt %attempt%/%max_attempts%)
timeout /t 2 /nobreak >nul
set /a attempt+=1
goto wait_loop

:status_check
echo.

REM Display service status
echo 📊 Service Status:
docker compose ps

echo.

REM Display URLs
echo 🌐 Access Points:
echo    - Frontend:  http://localhost
echo    - API:       http://localhost:3000/api
echo    - Database:  localhost:5432

echo.
echo ✅ Setup complete!
echo.

REM Display next steps
echo 📚 Next Steps:
echo    1. View backend logs:  docker compose logs -f backend
echo    2. View all logs:      docker compose logs -f
echo    3. Stop services:      docker compose down
echo    4. Remove volumes:     docker compose down -v
echo.
echo For more info, see: DOCKER_SETUP.md

pause
