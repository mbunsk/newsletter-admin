# Quick Start Guide

## Initial Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure API Keys**
   - Copy `.env.example` to `.env` (if it exists)
   - Or edit `config.js` directly with your API keys:
     - OpenAI API key (required for insights)
     - Database connection (PostgreSQL/Supabase)
     - Beehiiv API key (optional, for auto-publishing)
     - Other API keys as needed

3. **Set Up Database**
   - Ensure your PostgreSQL database is running
   - Update database credentials in `config.js` or `.env`
   - The database should have an `ideas` table (or adjust queries in `collectors/internal.js`)

## Running the Pipeline

### Run Complete Daily Pipeline
```bash
npm start
```

### Run Individual Steps
```bash
# Collect internal data
npm run collect:internal

# Collect external data
npm run collect:external

# Merge data
npm run merge

# Generate insights
npm run insights

# Build newsletter
npm run build
```

## Testing Individual Components

Each module can be run independently:

```bash
# Test internal collector
node collectors/internal.js

# Test external collector
node collectors/external.js

# Test merge
node processors/mergeData.js

# Test insights generation
node processors/generateInsights.js

# Test newsletter builder
node newsletter/builder.js

# Test Beehiiv push (skip if API not configured)
node newsletter/beehiivPush.js
```

## Next Steps

1. **Implement Database Queries**: Update `collectors/internal.js` with actual SQL queries for your database schema
2. **Configure External APIs**: Add real API keys and implement actual API calls in `collectors/external.js`
3. **Customize Template**: Modify `newsletter/template.html` to match your brand
4. **Set Up Scheduling**: Configure cron job or Supabase scheduled function

## Troubleshooting

- **Database Connection Errors**: Check database credentials and ensure PostgreSQL is running
- **API Errors**: Verify API keys are correct in `config.js`
- **Missing Data Files**: Run collectors first before running processors
- **OpenAI Errors**: Ensure you have sufficient API credits and correct model access

## File Structure Overview

- `/collectors` - Data collection modules
- `/processors` - Data processing and AI insight generation
- `/newsletter` - Newsletter template and builder
- `/utils` - Reusable utility functions
- `/scheduler` - Daily job orchestrator
- `/data` - JSON data storage (internal, external, merged, insights)
- `/output` - Generated HTML newsletters
- `/logs` - Application logs


