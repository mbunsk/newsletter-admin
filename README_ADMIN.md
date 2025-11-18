# Admin Dashboard - Usage Guide

## Overview

The admin dashboard provides a web interface to manually trigger newsletter generation and view previously generated newsletters. Everything runs inside Docker containers.

## Setup

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Start Docker containers**:
   ```bash
   docker-compose up -d
   ```

3. **Start the admin server** (inside the Docker container):
   ```bash
   docker-compose exec app npm run admin
   ```

   Or set it to run automatically by updating `docker-compose.yml` to include:
   ```yaml
   command: npm run admin
   ```

## Accessing the Dashboard

Once the admin server is running, open your browser to:
- **Main Dashboard**: `http://localhost:4000`
- **Newsletter History**: `http://localhost:4000/history`

The port can be customized by setting `ADMIN_PORT` in your `.env` file or environment:
```bash
ADMIN_PORT=5050 docker-compose exec app npm run admin
```

## Features

### Main Dashboard (`/`)

- **Run Pipeline Button**: Triggers the complete newsletter generation pipeline:
  1. Collect Internal Data (`npm run collect:internal`)
  2. Collect External Data (`npm run collect:external`)
  3. Merge Data (`npm run merge`)
  4. Generate Insights (`npm run insights`)
  5. Build Newsletter (`npm run build`)

- **Real-time Status**: Shows current pipeline status, active step, and live logs
- **Auto-refresh**: Status updates every 4 seconds while pipeline is running

### Newsletter History (`/history`)

- Lists all previously generated newsletters from `/output` directory
- Shows file name, size, modification date
- Provides direct links to view/download each newsletter

## How It Works

The admin server automatically detects whether it's running:
- **Inside Docker**: Uses direct `npm run` commands
- **On Host**: Uses `docker-compose exec app npm run ...` commands

This allows the same code to work in both environments.

## API Endpoints

- `POST /api/run` - Start the newsletter generation pipeline
- `GET /api/status` - Get current pipeline status and logs
- `GET /api/newsletters` - List all generated newsletters
- `GET /api/steps` - Get pipeline step definitions

## Troubleshooting

**Admin server won't start:**
- Check that Docker containers are running: `docker-compose ps`
- Check logs: `docker-compose logs app`
- Verify port 4000 is not in use

**Pipeline fails:**
- Check the logs in the admin dashboard
- Verify all API keys are set in `.env`
- Check database connection: `docker-compose exec app npm run migrate`

**Can't access dashboard:**
- Verify the admin server is running: `docker-compose exec app ps aux | grep node`
- Check port mapping in `docker-compose.yml`
- Try accessing via container IP if localhost doesn't work

