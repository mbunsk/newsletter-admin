# Testing Newsletter with Different Dates

You can now test the newsletter generation for any date to see how it looks for different weekdays (Monday, Tuesday, Wednesday, Thursday, Friday).

## Quick Start

### Option 1: Using the Test Script (Recommended)

Run the full pipeline for a specific date:

```bash
# Using npm script
npm run test:date -- 2025-11-18

# Or directly
node scripts/testDate.js 2025-11-18
```

This will:
1. Collect internal data for that date
2. Collect external data for that date
3. Merge the data
4. Generate insights (with weekday-specific sections)
5. Build the newsletter HTML

### Option 2: Run Individual Steps

You can also run each step individually with a date:

```bash
# Collect internal data
docker-compose exec app npm run collect:internal -- 2025-11-18
# Or: node collectors/internal.js 2025-11-18

# Collect external data
docker-compose exec app npm run collect:external -- 2025-11-18
# Or: node collectors/external.js 2025-11-18

# Merge data
docker-compose exec app npm run merge -- 2025-11-18
# Or: node processors/mergeData.js 2025-11-18

# Generate insights
docker-compose exec app npm run insights -- 2025-11-18
# Or: node processors/generateInsights.js 2025-11-18

# Build newsletter
docker-compose exec app npm run build -- 2025-11-18
# Or: node newsletter/builder.js 2025-11-18
```

## Date Format

Use the format: `YYYY-MM-DD`

Examples:
- `2025-11-18` (Tuesday)
- `2025-11-17` (Monday)
- `2025-11-19` (Wednesday)
- `2025-11-20` (Thursday)
- `2025-11-21` (Friday)

## Viewing the Results

After generation, view the newsletter at:
```
http://localhost:4000/output/YYYY-MM-DD.html
```

For example:
- `http://localhost:4000/output/2025-11-18.html` (Tuesday newsletter)
- `http://localhost:4000/output/2025-11-17.html` (Monday newsletter)

## Weekday-Specific Sections

The newsletter will automatically generate different sections based on the weekday:

- **Monday**: Idea Futures Index, Weekend Spikes, Weekly Watchlist, One Major Cluster, Micro-Trends
- **Tuesday**: Top 3 New Clusters, Customer Pain Analysis, Opportunities in the Gaps, Early Market Signals, Dealflow
- **Wednesday**: Idea Futures Index, Deep Clustering Report, Validation Reality Check, Deal Radar, Wednesday Experiment
- **Thursday**: Why Ideas Fail, Execution Gaps, Monthly Progress, Anti-Hype Section, Category Deep Dive
- **Friday**: Top 10 Ideas of the Week, Cluster-of-the-Week, Founder-of-the-Week, Micro Funding Roundup

## Notes

- The date determines which weekday sections are generated
- Data files will be saved with the specified date (e.g., `data/internal/2025-11-18.json`)
- If you don't specify a date, it will use today's date
- The newsletter will use the weekday of the specified date to determine which sections to include

