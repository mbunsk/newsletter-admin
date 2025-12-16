/**
 * Test script to parse Idea Generator log files
 * This will help debug the parsing logic
 */

import axios from 'axios';
import { fetchIdeaGeneratorData } from './utils/logParser.js';

const urls = [
  'https://validatorai.com/postback/gen-idea-log.txt',
  'https://validatorai.com/api/gen-idea-log.txt'
];

async function testParser() {
  console.log('=== Testing Idea Generator Parser ===\n');
  
  for (const url of urls) {
    console.log(`\n--- Testing: ${url} ---`);
    
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!response.data) {
        console.log('❌ No data returned');
        continue;
      }
      
      const allLines = response.data.split('\n');
      console.log(`📊 Total lines: ${allLines.length}`);
      
      // Show first 50 lines to understand format
      console.log('\n📝 First 50 lines:');
      allLines.slice(0, 50).forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed) {
          console.log(`${idx + 1}: ${trimmed.substring(0, 150)}`);
        }
      });
      
      // Count Date: lines
      const dateLines = allLines.filter(line => line.trim().match(/^Date:\d{4}-\d{2}-\d{2}/i));
      const selectedIdeaLines = allLines.filter(line => line.trim().match(/^Date:\d{4}-\d{2}-\d{2}\s*\|\s*Selected Idea:/i));
      const emailLines = allLines.filter(line => line.trim().toLowerCase().startsWith('email:'));
      
      console.log(`\n📈 Statistics:`);
      console.log(`  Date: lines: ${dateLines.length}`);
      console.log(`  Selected Idea lines: ${selectedIdeaLines.length}`);
      console.log(`  Email: lines: ${emailLines.length}`);
      
      // Show sample Date: lines
      console.log(`\n📅 Sample Date: lines (first 10):`);
      dateLines.slice(0, 10).forEach((line, idx) => {
        console.log(`  ${idx + 1}: ${line.trim().substring(0, 100)}`);
      });
      
      // Show sample Selected Idea lines
      if (selectedIdeaLines.length > 0) {
        console.log(`\n✅ Sample Selected Idea lines (first 5):`);
        selectedIdeaLines.slice(0, 5).forEach((line, idx) => {
          console.log(`  ${idx + 1}: ${line.trim().substring(0, 150)}`);
        });
      }
      
      // Try to identify entry boundaries
      console.log(`\n🔍 Entry Analysis:`);
      let entryCount = 0;
      let currentEntryStart = -1;
      const entries = [];
      
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i].trim();
        const isDateLine = line.match(/^Date:\d{4}-\d{2}-\d{2}/i);
        const isSelectedIdeaLine = line.match(/^Date:\d{4}-\d{2}-\d{2}\s*\|\s*Selected Idea:/i);
        
        if (isDateLine && !isSelectedIdeaLine) {
          // New entry starts
          if (currentEntryStart >= 0) {
            // Save previous entry
            entries.push({
              start: currentEntryStart,
              end: i - 1,
              lines: allLines.slice(currentEntryStart, i)
            });
          }
          currentEntryStart = i;
          entryCount++;
        }
      }
      
      // Save last entry
      if (currentEntryStart >= 0) {
        entries.push({
          start: currentEntryStart,
          end: allLines.length - 1,
          lines: allLines.slice(currentEntryStart)
        });
      }
      
      console.log(`  Found ${entryCount} entries`);
      
      // Show first entry in detail
      if (entries.length > 0) {
        console.log(`\n📋 First Entry (lines ${entries[0].start + 1}-${entries[0].end + 1}):`);
        entries[0].lines.slice(0, 30).forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(`  ${idx + 1}: ${trimmed.substring(0, 120)}`);
          }
        });
      }
      
      // Now test the actual parser
      console.log(`\n🔧 Testing Parser Function:`);
      const parsedEntries = await fetchIdeaGeneratorData(7);
      console.log(`  Parsed entries: ${parsedEntries.length}`);
      
      if (parsedEntries.length > 0) {
        console.log(`\n✅ Sample Parsed Entry:`);
        console.log(JSON.stringify(parsedEntries[0], null, 2));
      } else {
        console.log(`\n❌ No entries parsed successfully`);
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

testParser().catch(console.error);

