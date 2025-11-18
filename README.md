# Startup Idea Terminal

Automated newsletter generator that combines internal idea analytics with external startup and funding signals.

## Overview

This project runs daily to:
1. Collect internal idea statistics, clusters, and validation data
2. Gather external startup signals from Crunchbase, Product Hunt, Hacker News, TechCrunch, VentureBeat, Google Trends, and Reddit
3. Merge and analyze data to generate insights
4. Build an HTML newsletter
5. Push to Beehiiv as a draft

## Setup

### Prerequisites

- Node.js 18+ 
- PostgreSQL (local, Docker, or Render.com managed)
- npm or yarn
- Docker & Docker Compose (optional, for containerized setup)

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file and add your API keys and credentials:
   - `OPENAI_API_KEY` - Required for AI summarization and translation
   - `CRUNCHBASE_API_KEY` - Optional, for Crunchbase funding data
   - `PRODUCT_HUNT_API_KEY` - Optional, for Product Hunt launches
   - `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` - Optional, for Reddit posts
   - `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` - Optional, for auto-publishing
   - Database credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)

**Important:** The `.env` file is already in `.gitignore` and will NOT be committed to version control. All sensitive data should be stored in `.env`, not in `config.js`.

### Environment Variables

All sensitive configuration is stored in `.env` file. See `.env.example` for a template with all available variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=startup_ideas
DB_USER=postgres
DB_PASSWORD=your_password

# OpenAI API Configuration
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini

# Crunchbase API Configuration
CRUNCHBASE_API_KEY=your_key_here

# Product Hunt API Configuration
PRODUCT_HUNT_API_KEY=your_key_here

# Reddit API Configuration
REDDIT_CLIENT_ID=your_id_here
REDDIT_CLIENT_SECRET=your_secret_here

# Beehiiv API Configuration
BEEHIIV_API_KEY=your_key_here
BEEHIIV_PUBLICATION_ID=your_publication_id_here

# For Render.com or cloud providers, use DATABASE_URL instead of individual DB_* vars:
# DATABASE_URL=postgresql://user:password@host:port/database
```

## Project Structure

```
/startup-terminal
├── /collectors
│   ├── internal.js          # Internal data collector
│   └── external.js          # External data collector
├── /processors
│   ├── mergeData.js         # Merges internal & external data
│   └── generateInsights.js  # Generates AI insights
├── /newsletter
│   ├── template.html        # Newsletter template
│   ├── builder.js           # Builds newsletter from template
│   └── beehiivPush.js       # Pushes to Beehiiv
├── /utils
│   ├── aiSummarizer.js      # OpenAI integration
│   ├── rssFetcher.js        # RSS feed fetcher
│   ├── crawler.js           # Web crawler
│   └── dateUtils.js         # Date utilities
├── /scheduler
│   └── dailyJob.js          # Daily job orchestrator
├── /data
│   ├── /internal            # Internal data JSON files
│   ├── /external            # External data JSON files
│   ├── /merged              # Merged data JSON files
│   └── /insights            # Generated insights JSON files
├── /output                  # Generated HTML newsletters
├── /logs                    # Application logs
├── config.js                # Configuration
├── package.json             # Dependencies
└── README.md                # This file
```

## Usage

### Run Daily Job

```bash
npm start
```

Or manually run individual steps:

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

## Database Setup

### Option 1: Local PostgreSQL

1. Install PostgreSQL locally
2. Create database: `createdb startup_ideas`
3. Run migration: `npm run migrate`

### Option 2: Docker Compose

Start PostgreSQL and app in containers:

```bash
npm run docker:up
```

The database is automatically initialized. View logs with:
```bash
npm run docker:logs
```

### Option 3: Render.com

1. Create a PostgreSQL database in Render dashboard
2. Render automatically provides `DATABASE_URL` environment variable
3. Link the database to your service
4. Run migration: `npm run migrate`

## Scheduling

### Cron Job

Add to your crontab:

```bash
0 6 * * * cd /path/to/startup-terminal && node scheduler/dailyJob.js >> logs/cron.log 2>&1
```

### Render.com Scheduled Jobs

1. Create a new "Background Worker" service in Render
2. Set the start command: `node scheduler/dailyJob.js`
3. Configure scheduled execution via Render's cron scheduler

### Docker Cron

Add to your Dockerfile or docker-compose.yml to run daily via cron inside container.

## Development

The project is modular with clear TODOs in each file. Expand each module as needed:

1. **Collectors**: Implement database queries and API calls
2. **Processors**: Add data merging and analysis logic
3. **Newsletter**: Customize template and builder
4. **Utils**: Enhance utility functions as needed

## Output

- Daily JSON files stored in `/data/` with date stamps (YYYY-MM-DD.json)
- HTML newsletters in `/output/YYYY-MM-DD.html`
- Logs in `/logs/daily.log`

## License

ISC


