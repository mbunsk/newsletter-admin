/**
 * Database Migration Script
 * 
 * Runs the database schema initialization
 * Run this once to set up your database tables
 */

import pg from 'pg';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize database connection
 */
async function getDbClient() {
  const client = new Client(
    config.database.connectionString ? {
      connectionString: config.database.connectionString
    } : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password
    }
  );
  
  await client.connect();
  return client;
}

/**
 * Run migration
 */
async function migrate() {
  let client;
  
  try {
    console.log('Connecting to database...');
    client = await getDbClient();
    console.log('✓ Connected to database');
    
    // Read SQL file
    const sqlPath = join(__dirname, 'init.sql');
    console.log(`Reading migration file: ${sqlPath}`);
    const sql = await readFile(sqlPath, 'utf-8');
    
    // Execute SQL
    console.log('Running migration...');
    await client.query(sql);
    console.log('✓ Migration completed successfully');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    console.log('\nCreated tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Check if ideas table exists and show structure
    const ideasCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ideas'
      ORDER BY ordinal_position
    `);
    
    if (ideasCheck.rows.length > 0) {
      console.log('\nIdeas table structure:');
      ideasCheck.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    }
    
    console.log('\n✓ Database setup complete!');
    
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    if (error.code === '42P07') {
      console.log('Note: Some tables may already exist. This is okay.');
    } else {
      throw error;
    }
  } finally {
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\nMigration script finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nMigration script failed:', error);
    process.exit(1);
  });

