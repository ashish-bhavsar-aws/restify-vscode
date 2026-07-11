#!/bin/bash

# Restify Test Server Startup Script

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║       Starting Restify Test Server...                      ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "Please run this script from the server directory:"
    echo "  cd server && bash start.sh"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Start the server
echo "✅ Starting server on http://localhost:3000"
echo ""
echo "Available endpoints:"
echo "  • Web Form:           http://localhost:3000/test-form"
echo "  • Generic Form Data:  POST http://localhost:3000/api/form-data"
echo "  • JSON Field:         POST http://localhost:3000/api/json-field"
echo "  • XML Field:          POST http://localhost:3000/api/xml-field"
echo "  • Mixed Content:      POST http://localhost:3000/api/mixed-content"
echo "  • File Upload:        POST http://localhost:3000/api/file-upload"
echo ""
echo "📖 Documentation:"
echo "  • Quick Start:       server/QUICK-START.md"
echo "  • Full Docs:         server/README.md"
echo ""
echo "To stop the server, press Ctrl+C"
echo ""

npm start
