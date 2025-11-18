# Database Setup

This directory contains database initialization and migration scripts.

## Files

- `init.sql` - Database schema initialization script
- `migrate.js` - Node.js script to run migrations

## Setup Options

### Option 1: Local PostgreSQL

1. Install PostgreSQL locally
2. Create database:
   ```bash
   createdb startup_ideas
   ```
3. Run migration:
   ```bash
   npm run migrate
   ```

### Option 2: Docker Compose

The database is automatically initialized when you start Docker Compose:

```bash
docker-compose up -d
```

The `init.sql` script runs automatically via the `docker-entrypoint-initdb.d` directory.

### Option 3: Manual SQL

Run the SQL file directly:

```bash
psql -U postgres -d startup_ideas -f database/init.sql
```

## Database Schema

### Main Tables

- `ideas` - Stores user-submitted startup ideas
  - `id` - Primary key
  - `title` - Idea title
  - `description` - Full description
  - `category` - Category (ai, fintech, pet tech, etc.)
  - `keywords` - Array of keywords for clustering
  - `status` - Current status (submitted, mvp, paying, launched)
  - `mrr` - Monthly Recurring Revenue (if applicable)
  - `created_at` - Creation timestamp
  - `updated_at` - Last update timestamp
  - `user_id` - Optional user reference
  - `metadata` - JSONB field for flexible additional data

### Views

- `category_stats` - Pre-computed category statistics

### Indexes

- Indexes on `category`, `created_at`, `status`, and `keywords` for fast queries
- GIN index on keywords array for efficient clustering queries

## Connecting from Application

The application uses the `pg` library and supports two connection methods:

1. **Connection String** (recommended for production):
   ```env
   DATABASE_URL=postgresql://user:password@host:port/database
   ```

2. **Individual Parameters** (good for local development):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=startup_ideas
   DB_USER=postgres
   DB_PASSWORD=your_password
   ```

## Migration

To run migrations manually:

```bash
npm run migrate
```

This will:
- Connect to the database
- Execute all SQL in `init.sql`
- Verify tables were created
- Display table structure

## Notes

- The migration script uses `IF NOT EXISTS` clauses, so it's safe to run multiple times
- Sample data is commented out in `init.sql` - uncomment if you want test data
- Adjust permissions and security settings based on your deployment needs

