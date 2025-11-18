/**
 * Test Newsletter Generation for a Specific Date
 * 
 * Usage: node scripts/testDate.js 2025-11-18
 * Or: npm run test:date -- 2025-11-18
 */

import { collectInternalData } from '../collectors/internal.js';
import { collectExternalData } from '../collectors/external.js';
import { loadAndMerge } from '../processors/mergeData.js';
import { generateInsights } from '../processors/generateInsights.js';
import { buildNewsletter } from '../newsletter/builder.js';
import { getDateString } from '../utils/dateUtils.js';

async function testDate(dateStr) {
  const date = dateStr || getDateString();
  
  console.log('='.repeat(60));
  console.log(`Testing Newsletter Generation for Date: ${date}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Collect Internal Data
    console.log('\n[1/5] Collecting Internal Data...');
    await collectInternalData(date);
    console.log('✓ Internal data collected');
    
    // Step 2: Collect External Data
    console.log('\n[2/5] Collecting External Data...');
    await collectExternalData(date);
    console.log('✓ External data collected');
    
    // Step 3: Merge Data
    console.log('\n[3/5] Merging Data...');
    await loadAndMerge(date);
    console.log('✓ Data merged');
    
    // Step 4: Generate Insights
    console.log('\n[4/5] Generating Insights...');
    await generateInsights(date);
    console.log('✓ Insights generated');
    
    // Step 5: Build Newsletter
    console.log('\n[5/5] Building Newsletter...');
    const outputPath = await buildNewsletter(date);
    console.log('✓ Newsletter built');
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Newsletter generated successfully for ${date}`);
    console.log(`📄 Output: ${outputPath}`);
    console.log('='.repeat(60));
    
    // Show weekday
    const dateObj = new Date(date + 'T00:00:00');
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`📅 Weekday: ${weekday}`);
    console.log(`🌐 View at: http://localhost:4000/output/${date}.html`);
    
  } catch (error) {
    console.error('\n❌ Error during newsletter generation:', error);
    process.exit(1);
  }
}

// Get date from command line arguments
const dateArg = process.argv[2];

if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2025-11-18)');
  process.exit(1);
}

testDate(dateArg);

