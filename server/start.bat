@echo off
REM Restify Test Server Startup Script for Windows

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║       Starting Restify Test Server...                      ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found
    echo Please run this script from the server directory:
    echo   cd server ^&^& start.bat
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo.
)

REM Start the server
echo ✅ Starting server on http://localhost:3000
echo.
echo Available endpoints:
echo   * Web Form:           http://localhost:3000/test-form
echo   * Generic Form Data:  POST http://localhost:3000/api/form-data
echo   * JSON Field:         POST http://localhost:3000/api/json-field
echo   * XML Field:          POST http://localhost:3000/api/xml-field
echo   * Mixed Content:      POST http://localhost:3000/api/mixed-content
echo   * File Upload:        POST http://localhost:3000/api/file-upload
echo.
echo 📖 Documentation:
echo   * Quick Start:       server/QUICK-START.md
echo   * Full Docs:         server/README.md
echo.
echo To stop the server, press Ctrl+C
echo.

call npm start
pause
