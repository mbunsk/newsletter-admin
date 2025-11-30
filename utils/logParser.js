/**
 * Log File Parser Utility
 * 
 * Parses log files from validatorai.com to extract idea submissions
 */

import axios from 'axios';
import config from '../config.js';
import { getDateString, getDateStringDaysAgo } from './dateUtils.js';

/**
 * Parse date from log filename (e.g., "251103" -> "2025-11-03")
 * @param {string} dateStr - Date string in YYMMDD format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function parseLogDate(dateStr) {
  if (!dateStr || dateStr.length !== 6) {
    return null;
  }
  
  const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
  const month = dateStr.substring(2, 4);
  const day = dateStr.substring(4, 6);
  
  // Validate date
  const date = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Get log filename for a specific date
 * @param {Date} date - Date object
 * @returns {string} Log filename (e.g., "free_tool_log251103.txt")
 */
export function getLogFilename(date = new Date()) {
  const year = String(date.getFullYear()).substring(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `free_tool_log${year}${month}${day}.txt`;
}

/**
 * Fetch log file from URL
 * @param {string} url - URL of the log file
 * @returns {Promise<string>} Log file content
 */
async function fetchLogFile(url) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': config.crawler.userAgent
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching log file ${url}:`, error.message);
    throw error;
  }
}

/**
 * Parse idea from log line
 * @param {string} line - Log line
 * @returns {Object|null} Parsed idea object or null
 */
function parseIdeaLine(line) {
  if (!line || !line.trim()) {
    return null;
  }
  
  // Try to extract idea data from log line
  // Adjust parsing logic based on actual log format
  const trimmed = line.trim();
  
  // Common log formats to handle:
  // 1. JSON format: {"title": "...", "category": "...", ...}
  // 2. Tab-separated: title\tcategory\tdescription
  // 3. Pipe-separated: title|category|description
  // 4. CSV format: title,category,description
  
  let idea = null;
  
  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      idea = JSON.parse(trimmed);
    } catch (e) {
      // Not JSON, continue with other formats
    }
  }
  
  // Try tab-separated
  if (!idea && trimmed.includes('\t')) {
    const parts = trimmed.split('\t');
    if (parts.length >= 2) {
      idea = {
        title: parts[0]?.trim(),
        category: parts[1]?.trim(),
        description: parts[2]?.trim() || '',
        raw: trimmed
      };
    }
  }
  
  // Try pipe-separated (handle both simple format and named field format)
  if (!idea && trimmed.includes('|')) {
    // Check if it's the named field format: "Email: ... | startup_idea: ... | problem_to_solve: ..."
    if (trimmed.includes('startup_idea:') || trimmed.includes('problem_to_solve:')) {
      // Parse named fields format
      const emailMatch = trimmed.match(/Email:\s*([^|]+)/i);
      const ideaMatch = trimmed.match(/startup_idea:\s*([^|]+)/i);
      const targetMatch = trimmed.match(/target_customers:\s*([^|]+)/i);
      const problemMatch = trimmed.match(/problem_to_solve:\s*([^|]+)/i);
      const websiteNeedMatch = trimmed.match(/website_need\s*:\s*([^|]+)/i);
      const websiteNeed = websiteNeedMatch ? websiteNeedMatch[1].trim() : '';
      
      idea = {
        email: emailMatch ? emailMatch[1].trim() : '',
        title: ideaMatch ? ideaMatch[1].trim() : '',
        target_customers: targetMatch ? targetMatch[1].trim() : '',
        problem: problemMatch ? problemMatch[1].trim() : null,
        description: ideaMatch ? ideaMatch[1].trim() : '',
        website_need: websiteNeed,
        raw: trimmed
      };
    } else {
      // Simple pipe-separated format: title|category|description
      const parts = trimmed.split('|');
      if (parts.length >= 2) {
        idea = {
          title: parts[0]?.trim(),
          category: parts[1]?.trim(),
          description: parts[2]?.trim() || '',
          raw: trimmed
        };
      }
    }
  }
  
  // Try CSV
  if (!idea && trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      idea = {
        title: parts[0],
        category: parts[1],
        description: parts[2] || '',
        raw: trimmed
      };
    }
  }
  
  // Fallback: treat entire line as title if no structure found
  if (!idea && trimmed.length > 0) {
    idea = {
      title: trimmed,
      category: 'general',
      description: '',
      raw: trimmed
    };
  }
  
  return idea;
}

/**
 * Parse log file content into ideas array
 * @param {string} content - Log file content
 * @param {string} date - Date string (YYYY-MM-DD) for this log
 * @returns {Array} Array of parsed ideas
 */
export function parseLogContent(content, date = null) {
  if (!content) {
    return [];
  }
  
  const lines = content.split('\n');
  const ideas = [];
  
  for (const line of lines) {
    const idea = parseIdeaLine(line);
    if (idea) {
      // Add date if provided
      if (date) {
        idea.date = date;
        idea.created_at = new Date(date).toISOString();
      }
      
      // Extract keywords from title and description
      if (idea.title || idea.description) {
        const text = `${idea.title || ''} ${idea.description || ''}`.toLowerCase();
        const keywords = extractKeywords(text);
        idea.keywords = keywords;
      }
      
      // Extract problem statement - use existing problem field if already parsed, otherwise try to extract
      if (!idea.problem) {
        idea.problem = extractProblem(idea.title, idea.description);
      }
      
      ideas.push(idea);
    }
  }
  
  return ideas;
}

/**
 * Extract problem statement from idea
 * @param {string} title - Idea title
 * @param {string} description - Idea description
 * @returns {string|null} Problem statement or null
 */
function extractProblem(title, description) {
  const text = `${title || ''} ${description || ''}`;
  
  // Look for pipe-separated problem statements first (common in logs)
  // Format: "| problem_to_solve: ..." or "| problem: ..."
  const pipeProblemMatch = text.match(/\|\s*problem[_\s]*to[_\s]*solve[:\s]+(.+?)(?:\||$)/i);
  if (pipeProblemMatch && pipeProblemMatch[1] && pipeProblemMatch[1].trim().length > 10) {
    return pipeProblemMatch[1].trim();
  }
  
  // Common problem indicators with improved patterns
  const problemPatterns = [
    /problem[:\s]+(.+?)(?:\.|$|;)/i,
    /problem_to_solve[:\s]+(.+?)(?:\.|$|;)/i,
    /issue[:\s]+(.+?)(?:\.|$|;)/i,
    /challenge[:\s]+(.+?)(?:\.|$|;)/i,
    /pain[:\s]+(.+?)(?:\.|$|;)/i,
    /difficulty[:\s]+(.+?)(?:\.|$|;)/i,
    /struggling[:\s]+(.+?)(?:\.|$|;)/i,
    /can't[:\s]+(.+?)(?:\.|$|;)/i,
    /cannot[:\s]+(.+?)(?:\.|$|;)/i,
    /unable[:\s]+(.+?)(?:\.|$|;)/i,
    /lack[:\s]+(.+?)(?:\.|$|;)/i,
    /need[:\s]+(.+?)(?:\.|$|;)/i,
    /want[:\s]+(.+?)(?:\.|$|;)/i,
    /solving[:\s]+(.+?)(?:\.|$|;)/i,
    /address[:\s]+(.+?)(?:\.|$|;)/i,
    /we're\s+solving[:\s]+(.+?)(?:\.|$|;)/i
  ];
  
  for (const pattern of problemPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 10) {
      return match[1].trim();
    }
  }
  
  // If no explicit problem found, try to infer from description
  if (description && description.length > 20) {
    // Look for sentences that might describe a problem
    const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (lower.includes('problem') || lower.includes('issue') || 
          lower.includes('challenge') || lower.includes('difficult') ||
          lower.includes('hard') || lower.includes('struggle') ||
          lower.includes("can't") || lower.includes("cannot") ||
          lower.includes('pain point') || lower.includes('frustration')) {
        return sentence.trim();
      }
    }
  }
  
  return null;
}

/**
 * Extract keywords from text
 * @param {string} text - Text to extract keywords from
 * @returns {Array} Array of keywords
 */
function extractKeywords(text) {
  // Common startup/tech keywords
  const commonKeywords = [
    'ai', 'artificial intelligence', 'machine learning', 'ml',
    'saas', 'software as a service', 'platform',
    'fintech', 'financial technology', 'payment', 'banking',
    'healthcare', 'health', 'medical', 'telehealth',
    'ecommerce', 'marketplace', 'retail',
    'education', 'edtech', 'learning',
    'real estate', 'proptech',
    'food', 'restaurant', 'delivery',
    'transportation', 'mobility', 'logistics',
    'energy', 'sustainability', 'green',
    'pet', 'animal', 'veterinary',
    'fitness', 'wellness', 'sports'
  ];
  
  const keywords = [];
  const lowerText = text.toLowerCase();
  
  // Check for common keywords
  for (const keyword of commonKeywords) {
    if (lowerText.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  
  // Extract single words (3+ characters)
  const words = text.match(/\b\w{3,}\b/g) || [];
  keywords.push(...words.slice(0, 10)); // Limit to avoid too many keywords
  
  // Remove duplicates and return
  return [...new Set(keywords)];
}

/**
 * Parse Base44 click log line (format: "Email: ... | Keyword: ... | IP: ...")
 * @param {string} line - Log line
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Object|null} Parsed click entry
 */
function parseBase44Line(line, date) {
  if (!line || !line.trim()) {
    return null;
  }

  const trimmed = line.trim();
  const emailMatch = trimmed.match(/Email:\s*([^|]+)/i);
  const keywordMatch = trimmed.match(/Keyword:\s*([^|]+)/i);
  const ipMatch = trimmed.match(/IP:\s*([^|]+)/i);

  const email = emailMatch ? emailMatch[1].trim() : '';
  const keyword = keywordMatch ? keywordMatch[1].trim() : '';
  const ip = ipMatch ? ipMatch[1].trim() : '';

  if (!email && !keyword && !ip) {
    return null;
  }

  return {
    email,
    keyword,
    ip,
    date,
    raw: trimmed
  };
}

/**
 * Fetch and parse overall log file
 * @returns {Promise<Array>} Array of all ideas
 */
export async function fetchOverallLog() {
  try {
    const url = 'https://validatorai.com/postback/free_tool_log.txt';
    console.log(`Fetching overall log from ${url}...`);
    
    const content = await fetchLogFile(url);
    const ideas = parseLogContent(content);
    
    console.log(`Parsed ${ideas.length} ideas from overall log`);
    return ideas;
  } catch (error) {
    console.error('Error fetching overall log:', error.message);
    return [];
  }
}

/**
 * Fetch and parse daily log file for a specific date
 * @param {Date} date - Date to fetch log for
 * @returns {Promise<Array>} Array of ideas for that date
 */
export async function fetchDailyLog(date = new Date()) {
  try {
    const filename = getLogFilename(date);
    const url = `https://validatorai.com/postback/${filename}`;
    const dateStr = getDateString(date);
    
    console.log(`Fetching daily log for ${dateStr} from ${url}...`);
    
    const content = await fetchLogFile(url);
    const ideas = parseLogContent(content, dateStr);
    
    console.log(`Parsed ${ideas.length} ideas from daily log for ${dateStr}`);
    return ideas;
  } catch (error) {
    // Daily logs might not exist for all dates, so this is expected
    if (error.response && error.response.status === 404) {
      console.log(`Daily log not found for ${getDateString(date)}`);
      return [];
    }
    console.error(`Error fetching daily log for ${getDateString(date)}:`, error.message);
    return [];
  }
}

/**
 * Fetch and parse multiple daily logs
 * @param {number} days - Number of days to fetch (starting from today, going backwards)
 * @returns {Promise<Array>} Array of all ideas from the date range
 */
export async function fetchDailyLogs(days = 30) {
  const allIdeas = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const ideas = await fetchDailyLog(date);
    allIdeas.push(...ideas);
    
    // Small delay to avoid overwhelming the server
    if (i < days - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`Fetched ${allIdeas.length} total ideas from ${days} days of logs`);
  return allIdeas;
}

/**
 * Parse tool_chart.txt line (pipe-separated: date|email|name|score|category)
 * @param {string} line - Line from tool_chart.txt
 * @returns {Object|null} Parsed chart entry or null
 */
function parseChartLine(line) {
  if (!line || !line.trim()) {
    return null;
  }
  
  const parts = line.trim().split('|').map(p => p.trim());
  if (parts.length < 5) {
    return null;
  }
  
  const [dateStr, email, name, scoreStr, category] = parts;
  
  // Parse date
  let date = null;
  try {
    date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      date = null;
    }
  } catch (e) {
    // Invalid date
  }
  
  // Parse score
  const score = parseInt(scoreStr, 10) || 0;
  
  return {
    date: dateStr,
    dateObj: date,
    email: email || '',
    name: name || '',
    score: score,
    category: category || 'general',
    raw: line
  };
}

/**
 * Fetch and parse chart data from tool_chart.txt
 * @returns {Promise<Array>} Array of parsed chart entries
 */
export async function fetchChartData() {
  try {
    const url = 'https://validatorai.com/postback/tool_chart.txt';
    console.log(`Fetching chart data from ${url}...`);
    
    const content = await fetchLogFile(url);
    if (!content) {
      return [];
    }
    
    // Parse pipe-separated lines
    const lines = content.split('\n');
    const entries = [];
    const seenEntries = new Set();
    let duplicateCount = 0;
    
    for (const line of lines) {
      const entry = parseChartLine(line);
      if (entry) {
        const key = `${entry.date}|${entry.email}|${entry.name}|${entry.score}|${entry.category}`.toLowerCase();
        if (!seenEntries.has(key)) {
          seenEntries.add(key);
          entries.push(entry);
        } else {
          duplicateCount++;
        }
      }
    }
    
    console.log(`Parsed ${entries.length} unique entries from tool_chart.txt${duplicateCount > 0 ? ` (deduped ${duplicateCount} duplicates)` : ''}`);
    return entries;
  } catch (error) {
    console.warn('Chart data not available:', error.message);
    return [];
  }
}

/**
 * Fetch Base44 click logs for a specific date
 * @param {string|null} date - Date string (YYYY-MM-DD). Defaults to today.
 * @returns {Promise<Array>} Array of click entries
 */
export async function fetchBase44Clicks(date = null) {
  const targetDate = date || getDateString();
  const url = `https://validatorai.com/click/logs/${encodeURIComponent(targetDate)}-base44.txt`;

  try {
    console.log(`Fetching Base44 clicks from ${url}...`);
    const content = await fetchLogFile(url);
    if (!content) {
      return [];
    }

    const lines = content.split('\n');
    const entries = [];
    const seen = new Set();

    for (const line of lines) {
      const entry = parseBase44Line(line, targetDate);
      if (entry) {
        const key = `${entry.date}|${entry.email}|${entry.keyword}|${entry.ip}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(entry);
        }
      }
    }

    console.log(`Parsed ${entries.length} Base44 click entries for ${targetDate}`);
    return entries;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Base44 click log not found for ${targetDate}`);
      return [];
    }
    console.warn(`Error fetching Base44 clicks for ${targetDate}:`, error.message);
    return [];
  }
}

/**
 * Fetch Base44 click logs for multiple days
 * @param {number} days - Number of days to fetch (starting from today, going backwards). Defaults to 7.
 * @param {string|null} startDate - Optional start date (YYYY-MM-DD). If provided, fetches from this date backwards.
 * @returns {Promise<Array>} Array of all click entries from the date range
 */
export async function fetchBase44ClicksMultiple(days = 7, startDate = null) {
  const allClicks = [];
  const baseDate = startDate ? new Date(startDate) : new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    const dateStr = getDateString(date);
    
    const clicks = await fetchBase44Clicks(dateStr);
    allClicks.push(...clicks);
    
    // Small delay to avoid overwhelming the server
    if (i < days - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`Fetched ${allClicks.length} total Base44 clicks from ${days} days of logs`);
  return allClicks;
}

/**
 * Parse advice line from tool_advise file
 * Format may vary, but typically contains: date|email|idea|advice
 * @param {string} line - Line from tool_advise file
 * @returns {Object|null} Parsed advice entry or null
 */
function parseAdviceLine(line) {
  if (!line || !line.trim()) {
    return null;
  }
  
  const trimmed = line.trim();
  
  // Try pipe-separated format first (most common)
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      return {
        date: parts[0] || '',
        email: parts[1] || '',
        idea: parts[2] || '',
        advice: parts.slice(3).join('|') || '', // Advice may contain pipes
        raw: trimmed
      };
    }
  }
  
  // Try JSON format
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        date: parsed.date || '',
        email: parsed.email || '',
        idea: parsed.idea || parsed.name || parsed.title || '',
        advice: parsed.advice || parsed.feedback || parsed.hint || parsed.instruction || '',
        raw: trimmed
      };
    } catch (e) {
      // Not JSON, continue
    }
  }
  
  // Try tab-separated
  if (trimmed.includes('\t')) {
    const parts = trimmed.split('\t').map(p => p.trim());
    if (parts.length >= 3) {
      return {
        date: parts[0] || '',
        email: parts[1] || '',
        idea: parts[2] || '',
        advice: parts.slice(3).join('\t') || '',
        raw: trimmed
      };
    }
  }
  
  // Fallback: treat entire line as advice if it's substantial
  if (trimmed.length > 20) {
    return {
      date: '',
      email: '',
      idea: '',
      advice: trimmed,
      raw: trimmed
    };
  }
  
  return null;
}

/**
 * Fetch and parse advice data from tool_advise_250516.txt
 * This file contains AI-generated advice, hints, and instructions given to founders
 * @returns {Promise<Array>} Array of parsed advice entries
 */
export async function fetchAdviceData() {
  try {
    const url = 'https://validatorai.com/postback/tool_advise_250516.txt';
    console.log(`Fetching advice data from ${url}...`);
    
    const content = await fetchLogFile(url);
    if (!content) {
      return [];
    }
    
    // Parse lines
    const lines = content.split('\n');
    const entries = [];
    const seenEntries = new Set();
    let duplicateCount = 0;
    
    for (const line of lines) {
      const entry = parseAdviceLine(line);
      if (entry && entry.advice && entry.advice.trim().length > 10) {
        // Create a key for deduplication (based on advice content)
        const adviceKey = entry.advice.substring(0, 100).toLowerCase().trim();
        if (!seenEntries.has(adviceKey)) {
          seenEntries.add(adviceKey);
          entries.push(entry);
        } else {
          duplicateCount++;
        }
      }
    }
    
    console.log(`Parsed ${entries.length} unique advice entries${duplicateCount > 0 ? ` (deduped ${duplicateCount} duplicates)` : ''}`);
    return entries;
  } catch (error) {
    console.warn('Advice data not available:', error.message);
    return [];
  }
}

