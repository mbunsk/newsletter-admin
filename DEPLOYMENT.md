# Deployment Guide

This guide covers deploying the Startup Idea Terminal to Render.com and using Docker.

## Render.com Deployment

### Prerequisites

1. Render.com account
2. GitHub repository (or connect via Git)
3. PostgreSQL database (created in Render dashboard)

### Steps

1. **Create PostgreSQL Database**
   - Go to Render Dashboard → New → PostgreSQL
   - Choose a name and region
   - Note the `DATABASE_URL` (automatically provided)

2. **Create Background Worker Service**
   - Go to Render Dashboard → New → Background Worker
   - Connect your repository
   - Set build command: `npm install`
   - Set start command: `node scheduler/dailyJob.js`

3. **Configure Environment Variables**
   Add these in Render dashboard:
   ```
   DATABASE_URL=<auto-provided from PostgreSQL service>
   OPENAI_API_KEY=your_key_here
   CRUNCHBASE_API_KEY=your_key_here
   PRODUCT_HUNT_API_KEY=your_key_here
   REDDIT_CLIENT_ID=your_id_here
   REDDIT_CLIENT_SECRET=your_secret_here
   BEEHIIV_API_KEY=your_key_here
   BEEHIIV_PUBLICATION_ID=your_id_here
   ```

4. **Set Up Scheduled Execution**
   - In your Background Worker service settings
   - Enable "Cron Schedule"
   - Set schedule: `0 6 * * *` (runs daily at 6 AM UTC)
   - Or use Render's scheduled job feature

5. **Run Initial Migration**
   - Use Render Shell or connect via SSH
   - Run: `npm run migrate`

### Render.com Tips

- Use Render's built-in PostgreSQL (auto-managed)
- Enable auto-deploy from main branch
- Set up health checks if running as web service
- Monitor logs in Render dashboard
- Use environment groups for staging/production

## Docker Deployment

### Local Development with Docker

1. **Start Services**
   ```bash
   npm run docker:up
   ```

2. **Run Migration**
   ```bash
   docker-compose exec app npm run migrate
   ```

3. **Run Daily Job**
   ```bash
   docker-compose exec app npm start
   ```

4. **View Logs**
   ```bash
   npm run docker:logs
   ```

5. **Stop Services**
   ```bash
   npm run docker:down
   ```

### Production Docker Deployment

1. **Build Image**
   ```bash
   docker build -t startup-ideas-terminal .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name startup-ideas \
     --env-file .env \
     -v $(pwd)/data:/app/data \
     -v $(pwd)/output:/app/output \
     -v $(pwd)/logs:/app/logs \
     startup-ideas-terminal
   ```

3. **Set Up Cron in Container**
   Add to Dockerfile or use external scheduler:
   ```dockerfile
   # Install cron
   RUN apk add --no-cache dcron
   
   # Add cron job
   RUN echo "0 6 * * * cd /app && node scheduler/dailyJob.js" | crontab -
   ```

### Docker Compose for Production

For production, use a production-ready docker-compose.yml:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  app:
    build: .
    restart: always
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      # ... other env vars
    depends_on:
      - postgres
    networks:
      - app-network
    # Add cron service or use external scheduler

networks:
  app-network:
    driver: bridge

volumes:
  postgres_data:
```

## Environment Variables

### Required
- `DATABASE_URL` or database connection parameters
- `OPENAI_API_KEY`

### Optional
- `CRUNCHBASE_API_KEY`
- `PRODUCT_HUNT_API_KEY`
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
- `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID`

### Example .env File

```env
# Database (use DATABASE_URL for production)
DATABASE_URL=postgresql://user:password@host:5432/database
# OR
DB_HOST=localhost
DB_PORT=5432
DB_NAME=startup_ideas
DB_USER=postgres
DB_PASSWORD=your_password

# OpenAI (Required)
OPENAI_API_KEY=sk-...

# Optional APIs
CRUNCHBASE_API_KEY=your_key
PRODUCT_HUNT_API_KEY=your_key
REDDIT_CLIENT_ID=your_id
REDDIT_CLIENT_SECRET=your_secret
BEEHIIV_API_KEY=your_key
BEEHIIV_PUBLICATION_ID=your_id
```

## Health Checks

### Render.com
- Health check endpoint (if running as web service)
- Monitor background worker logs

### Docker
- PostgreSQL health check included in docker-compose.yml
- Monitor container logs: `docker-compose logs -f`

## Troubleshooting

### Database Connection Issues

1. **Render.com**: Ensure database is linked to your service
2. **Docker**: Check if postgres container is running: `docker-compose ps`
3. **Local**: Verify PostgreSQL is running: `pg_isready`

### Migration Issues

- Run migration manually: `npm run migrate`
- Check database logs for errors
- Verify connection string format

### API Errors

- Check API keys in environment variables
- Verify API rate limits
- Check network connectivity

## Security Considerations

1. **Never commit `.env` files** - Use environment variables
2. **Use strong database passwords** in production
3. **Rotate API keys** regularly
4. **Use secrets management** (Render Secrets, Docker Secrets, etc.)
5. **Limit database access** to necessary IPs/containers

## Monitoring

- Set up log aggregation (e.g., Logtail, Datadog)
- Monitor error rates
- Track API usage and costs
- Set up alerts for failed jobs

