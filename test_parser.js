import { parseLogContent } from './utils/logParser.js';
import axios from 'axios';

async function test() {
  try {
    const content = (await axios.get('https://validatorai.com/postback/free_tool_log.txt', { timeout: 10000 })).data;
    const ideas = parseLogContent(content);
    const withProblems = ideas.filter(i => i.problem && i.problem.length > 10);
    
    console.log(`Total ideas parsed: ${ideas.length}`);
    console.log(`Ideas with problems: ${withProblems.length}`);
    
    if (withProblems.length > 0) {
      console.log('\nSample problems:');
      withProblems.slice(0, 10).forEach((idea, i) => {
        console.log(`${i+1}. "${idea.problem}"`);
      });
    } else {
      console.log('\nNo problems found. Checking first few ideas:');
      ideas.slice(0, 5).forEach((idea, i) => {
        console.log(`${i+1}. Title: "${idea.title}"`);
        console.log(`   Problem field: "${idea.problem || 'null'}"`);
        console.log(`   Raw: ${idea.raw?.substring(0, 100)}...`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();

