/**
 * Daily Job Scheduler
 * 
 * Orchestrates the entire daily pipeline:
 * 1. Collect internal data
 * 2. Collect external data
 * 3. Merge data
 * 4. Generate insights
 * 5. Build newsletter
 * 6. Push to Beehiiv (optional)
 */

import { collectInternalData } from '../collectors/internal.js';
import { collectExternalData } from '../collectors/external.js';
import { loadAndMerge } from '../processors/mergeData.js';
import { generateInsights } from '../processors/generateInsights.js';
import { buildNewsletter } from '../newsletter/builder.js';
import { pushToBeehiiv } from '../newsletter/beehiivPush.js';
import { getDateString } from '../utils/dateUtils.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Log message to file and console
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, error, warn)
 */
async function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // Console output
  console.log(logMessage);
  
  // File output
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    await fs.mkdir(logDir, { recursive: true });
    
    const logFile = path.join(logDir, 'daily.log');
    await fs.appendFile(logFile, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

/**
 * Run the complete daily pipeline
 * @param {Object} options - Pipeline options
 * @returns {Promise<Object>} Pipeline results
 */
export async function runDailyPipeline(options = {}) {
  const {
    skipBeehiiv = false,
    date = null,
    stopOnError = false
  } = options;
  
  const targetDate = date || getDateString();
  const results = {
    date: targetDate,
    startedAt: new Date().toISOString(),
    steps: {},
    errors: [],
    completed: false
  };
  
  try {
    await log(`Starting daily pipeline for ${targetDate}`);
    
    // Step 1: Collect Internal Data
    await log('Step 1: Collecting internal data...');
    try {
      results.steps.internal = await collectInternalData();
      await log('✓ Internal data collected successfully');
    } catch (error) {
      const errorMsg = `Failed to collect internal data: ${error.message}`;
      await log(errorMsg, 'error');
      results.errors.push({ step: 'internal', error: errorMsg });
      if (stopOnError) throw error;
    }
    
    // Step 2: Collect External Data
    await log('Step 2: Collecting external data...');
    try {
      results.steps.external = await collectExternalData();
      await log('✓ External data collected successfully');
    } catch (error) {
      const errorMsg = `Failed to collect external data: ${error.message}`;
      await log(errorMsg, 'error');
      results.errors.push({ step: 'external', error: errorMsg });
      if (stopOnError) throw error;
    }
    
    // Step 3: Merge Data
    await log('Step 3: Merging data...');
    try {
      results.steps.merged = await loadAndMerge(targetDate);
      await log('✓ Data merged successfully');
    } catch (error) {
      const errorMsg = `Failed to merge data: ${error.message}`;
      await log(errorMsg, 'error');
      results.errors.push({ step: 'merge', error: errorMsg });
      if (stopOnError) throw error;
    }
    
    // Step 4: Generate Insights
    await log('Step 4: Generating insights...');
    try {
      results.steps.insights = await generateInsights(targetDate);
      await log('✓ Insights generated successfully');
    } catch (error) {
      const errorMsg = `Failed to generate insights: ${error.message}`;
      await log(errorMsg, 'error');
      results.errors.push({ step: 'insights', error: errorMsg });
      if (stopOnError) throw error;
    }
    
    // Step 5: Build Newsletter
    await log('Step 5: Building newsletter...');
    try {
      results.steps.newsletter = await buildNewsletter(targetDate);
      await log(`✓ Newsletter built: ${results.steps.newsletter}`);
    } catch (error) {
      const errorMsg = `Failed to build newsletter: ${error.message}`;
      await log(errorMsg, 'error');
      results.errors.push({ step: 'newsletter', error: errorMsg });
      if (stopOnError) throw error;
    }
    
    // Step 6: Push to Beehiiv (optional)
    if (!skipBeehiiv) {
      await log('Step 6: Pushing to Beehiiv...');
      try {
        results.steps.beehiiv = await pushToBeehiiv(targetDate, true);
        await log('✓ Newsletter pushed to Beehiiv successfully');
      } catch (error) {
        const errorMsg = `Failed to push to Beehiiv: ${error.message}`;
        await log(errorMsg, 'error');
        results.errors.push({ step: 'beehiiv', error: errorMsg });
        // Don't fail pipeline if Beehiiv push fails
      }
    } else {
      await log('Step 6: Skipping Beehiiv push (skipBeehiiv=true)');
    }
    
    results.completed = true;
    results.completedAt = new Date().toISOString();
    results.duration = new Date(results.completedAt) - new Date(results.startedAt);
    
    await log(`Pipeline completed successfully in ${results.duration}ms`);
    
    return results;
    
  } catch (error) {
    results.completed = false;
    results.failedAt = new Date().toISOString();
    results.finalError = error.message;
    
    await log(`Pipeline failed: ${error.message}`, 'error');
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    skipBeehiiv: args.includes('--skip-beehiiv'),
    stopOnError: args.includes('--stop-on-error')
  };
  
  runDailyPipeline(options)
    .then(results => {
      console.log('\n=== Pipeline Results ===');
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.completed ? 0 : 1);
    })
    .catch(error => {
      console.error('\n=== Pipeline Failed ===');
      console.error(error);
      process.exit(1);
    });
}


