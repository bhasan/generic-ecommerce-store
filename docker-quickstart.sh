#!/bin/bash

# Quick Start Script for Generic Ecommerce Store Delivery Docker Setup

set -e

echo "🐳 Docker Setup - Generic Ecommerce Store Delivery"
echo "========================================"
echo

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop or Docker daemon."
    exit 1
fi

echo "✅ Docker is running"
echo

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env created. Please review and update sensitive values."
else
    echo "✅ .env already exists"
fi

echo

# Build images
echo "🔨 Building Docker images... (this may take 2-5 minutes)"
docker compose build --pull

echo

# Start services
echo "🚀 Starting services..."
docker compose up -d

echo

# Wait for database to be healthy
echo "⏳ Waiting for database to be healthy..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T db pg_isready -U "${DB_USER:-backend_user}" &> /dev/null; then
        echo "✅ Database is healthy"
        break
    fi
    echo "   (attempt $((attempt + 1))/$max_attempts)"
    sleep 2
    ((attempt++))
done

if [ $attempt -eq $max_attempts ]; then
    echo "⚠️  Database health check timed out, but services may still be starting..."
fi

echo

# Display service status
echo "📊 Service Status:"
docker compose ps

echo

# Display URLs
echo "🌐 Access Points:"
echo "   - Frontend:  http://localhost"
echo "   - API:       http://localhost:3000/api"
echo "   - Database:  localhost:5432"

echo

echo "✅ Setup complete!"
echo

# Display next steps
echo "📚 Next Steps:"
echo "   1. View backend logs:  docker compose logs -f backend"
echo "   2. View all logs:      docker compose logs -f"
echo "   3. Stop services:      docker compose down"
echo "   4. Remove volumes:     docker compose down -v"
echo

echo "For more info, see: DOCKER_SETUP.md"
