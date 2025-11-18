# Render.com Deployment Guide

This guide covers deploying the Newsletter Admin Dashboard and Worker to Render.com using Docker.

## Quick Start

1. **Fork/Clone this repository** to your GitHub account
2. **Create a new Render account** at https://render.com
3. **Connect your GitHub repository** to Render
4. **Use the `render.yaml` file** for automatic service setup, OR follow manual setup below

## Automatic Setup (Recommended)

If you have a `render.yaml` file in your repository:

1. Go to Render Dashboard → New → Blueprint
2. Connect your GitHub repository
3. Render will automatically detect `render.yaml` and create all services
4. Configure environment variables in the Render dashboard
5. Deploy!

## Manual Setup

### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard → New → PostgreSQL
2. Name: `newsletter-db`
3. Database: `startup_ideas`
4. User: `newsletter_user`
5. Region: Choose closest to your users
6. **Copy the `DATABASE_URL`** - you'll need this

### Step 2: Create Web Service (Admin Dashboard)

1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - **Name**: `newsletter-admin`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Docker Context**: `.`
   - **Docker Command**: `npm run admin`
   - **Health Check Path**: `/health`
   - **Port**: `4000`

4. **Environment Variables**:
   ```
   DATABASE_URL=<from PostgreSQL service>
   OPENAI_API_KEY=sk-...
   ADMIN_PORT=4000
   SESSION_SECRET=<generate a random secret>
   ```
   Plus any optional API keys (Crunchbase, Product Hunt, Reddit, Beehiiv)

5. Click "Create Web Service"

### Step 3: Create Background Worker (Newsletter Generation)

1. Go to Render Dashboard → New → Background Worker
2. Connect your GitHub repository
3. Configure:
   - **Name**: `newsletter-worker`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Docker Context**: `.`
   - **Docker Command**: `npm start`

4. **Environment Variables** (same as web service):
   ```
   DATABASE_URL=<from PostgreSQL service>
   OPENAI_API_KEY=sk-...
   ```
   Plus any optional API keys

5. **Schedule** (optional):
   - Enable "Cron Schedule"
   - Schedule: `0 6 * * *` (runs daily at 6 AM UTC)

6. Click "Create Background Worker"

### Step 4: Run Database Migration

1. Go to your **Web Service** → Shell
2. Run: `npm run migrate`
3. Verify tables were created

## Environment Variables

### Required
- `DATABASE_URL` - Automatically provided when you link PostgreSQL
- `OPENAI_API_KEY` - Required for AI insights generation

### Optional (for external data sources)
- `CRUNCHBASE_API_KEY`
- `PRODUCT_HUNT_API_KEY`, `PRODUCT_HUNT_API_SECRET`, `PRODUCT_HUNT_DEV_TOKEN`
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`

### Admin Dashboard
- `ADMIN_PORT` - Default: 4000
- `SESSION_SECRET` - Random secret for session encryption (generate one!)

## Post-Deployment

### 1. Access Admin Dashboard

Your web service will have a URL like: `https://newsletter-admin.onrender.com`

**Login Credentials**:
- Username: `nladmin`
- Password: `nlpw123`

⚠️ **IMPORTANT**: Change the password in production by updating `admin/server.js`!

### 2. Test Newsletter Generation

1. Log into the admin dashboard
2. Click "Run Newsletter Pipeline"
3. Monitor the logs to ensure everything works
4. Check the `/output` directory for generated newsletters

### 3. Set Up Scheduled Execution

Option A: Use Render's Cron Schedule (recommended)
- In your Background Worker settings
- Enable "Cron Schedule"
- Set: `0 6 * * *` (daily at 6 AM UTC)

Option B: Use external cron service
- Set up a service like EasyCron or cron-job.org
- Point to: `https://newsletter-worker.onrender.com` (if you add a webhook endpoint)

## Troubleshooting

### Database Connection Issues

1. **Check DATABASE_URL**: Ensure it's correctly linked from PostgreSQL service
2. **Verify database is running**: Check PostgreSQL service status
3. **Test connection**: Use Render Shell to run `npm run migrate`

### Build Failures

1. **Check Dockerfile**: Ensure it builds locally first
2. **Check logs**: Review build logs in Render dashboard
3. **Verify dependencies**: Ensure `package.json` is correct

### Admin Dashboard Not Loading

1. **Check health endpoint**: Visit `/health` - should return `{"status":"ok"}`
2. **Check logs**: Review web service logs
3. **Verify port**: Ensure `ADMIN_PORT=4000` is set

### Newsletter Generation Fails

1. **Check API keys**: Verify OpenAI API key is set
2. **Check logs**: Review worker logs for errors
3. **Test manually**: Use admin dashboard to trigger pipeline
4. **Verify data sources**: Check if external APIs are accessible

## Security Recommendations

1. **Change default admin password** in `admin/server.js`
2. **Use strong SESSION_SECRET** (generate with: `openssl rand -hex 32`)
3. **Enable HTTPS** (automatic on Render)
4. **Restrict database access** to necessary services only
5. **Rotate API keys** regularly
6. **Monitor logs** for suspicious activity

## Monitoring

- **Logs**: View in Render dashboard for each service
- **Metrics**: Monitor service health and response times
- **Alerts**: Set up alerts for failed deployments or service downtime

## Cost Optimization

- **Use Starter plans** for development/testing
- **Scale down** when not in use (Render auto-sleeps free tier)
- **Monitor API usage** (OpenAI, external APIs) to control costs
- **Use environment groups** for staging/production separation

## Support

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
- Project Issues: Check repository issues

