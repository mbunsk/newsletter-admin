# Deployment Checklist for Render.com

## ✅ Ready for Deployment

### Docker Configuration
- ✅ `Dockerfile` - Configured for production with port 4000 exposed
- ✅ `.dockerignore` - Excludes unnecessary files from Docker build
- ✅ `docker-compose.yml` - Ready for local development (not needed on Render)

### Application Configuration
- ✅ `config.js` - Uses environment variables for all sensitive data
- ✅ Database connection supports `DATABASE_URL` (Render's format)
- ✅ Admin dashboard with authentication
- ✅ Health check endpoint at `/health`

### Documentation
- ✅ `render.yaml` - Blueprint for automatic Render setup
- ✅ `RENDER_DEPLOYMENT.md` - Complete deployment guide
- ✅ `DEPLOYMENT.md` - General deployment documentation

### Required Files
- ✅ Database migration script (`database/migrate.js`)
- ✅ All npm scripts configured
- ✅ Environment variable handling

## ⚠️ Before Deploying

### 1. Security Updates (CRITICAL)

**Change Admin Password**:
- Edit `admin/server.js`
- Change `ADMIN_PASSWORD` from `nlpw123` to a strong password
- Or move to environment variable: `ADMIN_PASSWORD`

**Generate Session Secret**:
- Generate a random secret: `openssl rand -hex 32`
- Set as `SESSION_SECRET` environment variable in Render

### 2. Environment Variables to Set in Render

**Required**:
```
DATABASE_URL=<auto-provided from PostgreSQL>
OPENAI_API_KEY=sk-...
SESSION_SECRET=<generate random secret>
ADMIN_PORT=4000
```

**Optional** (for full functionality):
```
CRUNCHBASE_API_KEY=...
PRODUCT_HUNT_API_KEY=...
PRODUCT_HUNT_API_SECRET=...
PRODUCT_HUNT_DEV_TOKEN=...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
BEEHIIV_API_KEY=...
BEEHIIV_PUBLICATION_ID=...
```

### 3. Database Setup

1. Create PostgreSQL database in Render
2. Run migration: `npm run migrate` (via Render Shell)
3. Verify tables were created

### 4. Test Locally First

```bash
# Build Docker image
docker build -t newsletter-test .

# Run with environment variables
docker run -p 4000:4000 \
  -e DATABASE_URL=your_db_url \
  -e OPENAI_API_KEY=your_key \
  -e SESSION_SECRET=your_secret \
  newsletter-test
```

## 📋 Deployment Steps

1. **Push to GitHub** (if not already)
2. **Connect to Render**:
   - Option A: Use `render.yaml` blueprint (automatic)
   - Option B: Manual setup (follow `RENDER_DEPLOYMENT.md`)
3. **Set environment variables** in Render dashboard
4. **Run database migration** via Render Shell
5. **Test admin dashboard** at your Render URL
6. **Test newsletter generation** via admin dashboard
7. **Set up scheduled execution** (cron or external scheduler)

## 🔍 Post-Deployment Verification

- [ ] Admin dashboard loads at `/`
- [ ] Health check works at `/health`
- [ ] Login works with credentials
- [ ] Database migration completed
- [ ] Newsletter pipeline runs successfully
- [ ] Generated newsletters appear in `/output`
- [ ] Scheduled job runs (if configured)

## 🚨 Known Limitations

1. **File Persistence**: Render's filesystem is ephemeral
   - **Solution**: Use Render's persistent disk or external storage (S3) for data/output
   - Or: Store data in database instead of filesystem

2. **Volume Mounts**: `docker-compose.yml` volume mounts won't work on Render
   - **Solution**: Render uses managed PostgreSQL, not docker-compose
   - Data directories are created in container, but won't persist between deployments
   - Consider storing JSON files in database or external storage

3. **Background Worker**: Needs to be set up separately
   - Use Render's Background Worker service
   - Or use scheduled jobs feature

## 💡 Recommendations

1. **Use Render's Persistent Disk** for `/app/data` and `/app/output` directories
2. **Set up log aggregation** (Logtail, Datadog) for better monitoring
3. **Use environment groups** for staging/production separation
4. **Enable auto-deploy** from main branch
5. **Set up alerts** for failed deployments or service downtime
6. **Monitor API usage** to control costs (especially OpenAI)

## 📝 Next Steps After Deployment

1. Test all functionality
2. Monitor logs for errors
3. Set up scheduled newsletter generation
4. Configure Beehiiv integration (if using)
5. Set up monitoring and alerts
6. Document any custom configurations

