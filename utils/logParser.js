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
 * Get advice filename for a specific date
 * Format: tool_advise_{YYMMDD}.txt
 * @param {Date} date - Date object (defaults to today)
 * @returns {string} Advice filename
 */
export function getAdviceFilename(date = new Date()) {
  const year = String(date.getFullYear()).substring(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `tool_advise_${year}${month}${day}.txt`;
}

/**
 * Fetch and parse advice data from a single date file
 * @param {Date|string} date - Date object or date string (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of parsed advice entries
 */
async function fetchAdviceDataForDate(date) {
  try {
    const dateObj = date instanceof Date ? date : new Date(date + 'T00:00:00');
    const filename = getAdviceFilename(dateObj);
    const url = `https://validatorai.com/postback/${filename}`;
    
    const content = await fetchLogFile(url);
    if (!content) {
      return [];
    }
    
    // Parse lines
    const lines = content.split('\n');
    const entries = [];
    
    for (const line of lines) {
      const entry = parseAdviceLine(line);
      if (entry && entry.advice && entry.advice.trim().length > 10) {
        entries.push(entry);
      }
    }
    
    return entries;
  } catch (error) {
    // Silently fail for individual dates (file might not exist)
    return [];
  }
}

/**
 * Fetch and parse advice data from the last N days
 * This function fetches advice data from tool_advise_{YYMMDD}.txt files
 * @param {number} days - Number of days to fetch (defaults to 7)
 * @param {string|null} startDate - Start date string (YYYY-MM-DD), defaults to today
 * @returns {Promise<Array>} Array of parsed advice entries (deduplicated)
 */
export async function fetchAdviceData(days = 7, startDate = null) {
  try {
    const allEntries = [];
    const baseDate = startDate ? new Date(startDate + 'T00:00:00') : new Date();
    const seenEntries = new Set();
    let totalFetched = 0;
    let duplicateCount = 0;
    let filesFound = 0;
    
    console.log(`Fetching advice data from last ${days} days...`);
    
    for (let i = 0; i < days; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() - i);
      const dateStr = getDateString(date);
      const filename = getAdviceFilename(date);
      
      const entries = await fetchAdviceDataForDate(date);
      
      if (entries.length > 0) {
        filesFound++;
        totalFetched += entries.length;
        
        // Deduplicate based on advice content
        for (const entry of entries) {
          const adviceKey = entry.advice.substring(0, 100).toLowerCase().trim();
          if (!seenEntries.has(adviceKey)) {
            seenEntries.add(adviceKey);
            allEntries.push(entry);
          } else {
            duplicateCount++;
          }
        }
      }
      
      // Small delay to avoid overwhelming the server
      if (i < days - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Fetched ${allEntries.length} unique advice entries from ${filesFound} files (${totalFetched} total entries, ${duplicateCount} duplicates removed)`);
    return allEntries;
  } catch (error) {
    console.warn('Advice data not available:', error.message);
    return [];
  }
}

/**
 * Clean Idea Generator entry according to mandatory data cleaning rules
 * @param {Object} entry - Idea Generator entry
 * @returns {boolean} True if entry should be kept, false if filtered out
 */
function cleanIdeaGeneratorEntry(entry) {
  if (!entry) return false;
  
  // Check required fields (email is optional)
  const industry = (entry.industry || '').trim();
  const skills = (entry.skills || entry.skillsResources || '').trim();
  const problem = (entry.problem || '').trim();
  const customer = (entry.customer || '').trim();
  
  // Filter out incomplete entries (need at least 3 of the 4 fields: industry, skills, problem, customer)
  const fieldCount = [industry, skills, problem, customer].filter(f => f && f.length > 0).length;
  if (fieldCount < 3) {
    return false;
  }
  
  // Filter out entries with blank, "n/a", "none", "idk", or equivalent
  const blankPatterns = /^(n\/a|none|idk|na|n\.a\.|null|undefined|\s*)$/i;
  if (blankPatterns.test(industry) || blankPatterns.test(skills) || 
      blankPatterns.test(problem) || blankPatterns.test(customer)) {
    return false;
  }
  
  // Combine all text fields for pattern detection
  const allText = `${industry} ${skills} ${problem} ${customer}`.toLowerCase();
  
  // Filter out non-English responses (basic check - if >50% non-ASCII, likely not English)
  const nonAsciiCount = (allText.match(/[^\x00-\x7F]/g) || []).length;
  if (nonAsciiCount > allText.length * 0.5) {
    return false;
  }
  
  // Filter out gibberish, keyboard spam, emoji-noise
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const emojiCount = (allText.match(emojiPattern) || []).length;
  if (emojiCount > 10) { // Too many emojis
    return false;
  }
  
  // Filter out entries dominated by special characters or symbols
  const specialCharPattern = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
  const specialCharCount = (allText.match(specialCharPattern) || []).length;
  if (specialCharCount > allText.length * 0.3) { // More than 30% special chars
    return false;
  }
  
  // Filter out entries that are too short (likely incomplete)
  if (allText.length < 20) {
    return false;
  }
  
  // Filter out entries with repeated patterns (bot behavior)
  const words = allText.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
    return false; // Too many repeated words
  }
  
  // Filter out entries that describe no identifiable human customer
  const customerLower = customer.toLowerCase();
  const humanCustomerPatterns = /(everyone|all|anyone|people|users|customers|clients|businesses|companies)/i;
  if (customerLower.length < 5 || (!humanCustomerPatterns.test(customerLower) && customerLower.length < 10)) {
    // If customer is too vague or too short, might not be identifiable
    if (customerLower.length < 10 && !humanCustomerPatterns.test(customerLower)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Parse Idea Generator log line
 * @param {string} line - Log line
 * @returns {Object|null} Parsed entry or null
 */
function parseIdeaGeneratorLine(line) {
  if (!line || !line.trim()) {
    return null;
  }
  
  const trimmed = line.trim();
  
  // Try JSON format first
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        date: parsed.date || parsed.timestamp || '',
        email: parsed.email || '',
        industry: parsed.industry || '',
        skills: parsed.skills || parsed.skillsResources || parsed.domainExperience || '',
        problem: parsed.problem || '',
        customer: parsed.customer || parsed.targetCustomer || '',
        ideas: parsed.ideas || parsed.generatedIdeas || [],
        raw: trimmed
      };
    } catch (e) {
      // Not JSON, continue
    }
  }
  
  // Try pipe-separated format
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length >= 5) {
      return {
        date: parts[0] || '',
        email: parts[1] || '',
        industry: parts[2] || '',
        skills: parts[3] || '',
        problem: parts[4] || '',
        customer: parts[5] || '',
        ideas: parts.length > 6 ? parts.slice(6) : [],
        raw: trimmed
      };
    }
  }
  
  // Try tab-separated
  if (trimmed.includes('\t')) {
    const parts = trimmed.split('\t').map(p => p.trim());
    if (parts.length >= 5) {
      return {
        date: parts[0] || '',
        email: parts[1] || '',
        industry: parts[2] || '',
        skills: parts[3] || '',
        problem: parts[4] || '',
        customer: parts[5] || '',
        ideas: parts.length > 6 ? parts.slice(6) : [],
        raw: trimmed
      };
    }
  }
  
  return null;
}

/**
 * Fetch Idea Generator data from log file
 * @param {string} url - URL of the log file
 * @returns {Promise<Array>} Array of cleaned Idea Generator entries
 */
/**
 * Parse multi-line Idea Generator entry
 * Format appears to be:
 * Email: [email]
 * Generate 10 business idea based on these criteria inputted by the user.
 * Industry you like to explore or are Knowledgeable about: [industry]
 * Skills/Resources: [skills]
 * Problem: [problem]
 * Customer: [customer]
 * (optional) Generated ideas...
 * @param {Array<string>} lines - Array of lines for one entry
 * @returns {Object|null} Parsed entry or null
 */
function parseMultiLineIdeaGeneratorEntry(lines) {
  if (!lines || lines.length < 3) {
    return null;
  }
  
  const entry = {
    date: '',
    email: '', // Optional - not always present
    industry: '',
    skills: '',
    problem: '',
    customer: '',
    ideas: [],
    selectedIdea: '',
    raw: lines.join('\n')
  };
  
  // Extract date from first line (Date:YYYY-MM-DD)
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const dateMatch = firstLine.match(/^Date:(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      entry.date = dateMatch[1];
    } else {
      // If first line doesn't have date, this might not be a valid entry
      return null;
    }
  }
  
  // Parse each line looking for field labels
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
    
    // Extract selected idea (Date:YYYY-MM-DD | Selected Idea: ...)
    if (line.match(/^Date:\d{4}-\d{2}-\d{2}\s*\|\s*Selected Idea:/i)) {
      const selectedMatch = line.match(/Selected Idea:\s*(.+)/i);
      if (selectedMatch) {
        entry.selectedIdea = selectedMatch[1].trim();
      } else if (nextLine) {
        entry.selectedIdea = nextLine;
        i++; // Skip next line
      }
      continue;
    }
    
    // Extract email
    if (line.toLowerCase().startsWith('email:')) {
      entry.email = line.substring(6).trim();
      // Sometimes email value is on next line
      if (!entry.email && nextLine && !nextLine.toLowerCase().includes('generate')) {
        entry.email = nextLine;
        i++; // Skip next line
      }
    }
    // Extract date (if present)
    else if (line.toLowerCase().startsWith('date:')) {
      entry.date = line.substring(5).trim();
    }
    // Extract industry - handle "Industry you like to explore or are Knowledgeable about:"
    else if (line.toLowerCase().includes('industry') || line.toLowerCase().includes('knowledgeable about')) {
      const match = line.match(/industry.*?:\s*(.+)/i) || line.match(/knowledgeable about.*?:\s*(.+)/i);
      if (match && match[1].trim()) {
        entry.industry = match[1].trim();
      } else if (nextLine && !nextLine.toLowerCase().includes('generate') && !nextLine.toLowerCase().includes('what resources') && !nextLine.toLowerCase().includes('what problem')) {
        // Industry value might be on next line
        entry.industry = nextLine;
        i++; // Skip next line
      }
    }
    // Extract skills/resources - handle "What resources do you have?:"
    else if (line.toLowerCase().includes('what resources') || line.toLowerCase().includes('resources do you have')) {
      const match = line.match(/what resources.*?:\s*(.+)/i) || line.match(/resources do you have.*?:\s*(.+)/i);
      if (match && match[1].trim()) {
        entry.skills = match[1].trim();
      } else if (nextLine && !nextLine.toLowerCase().includes('what problem') && !nextLine.toLowerCase().includes('who needs')) {
        // Skills value might be on next line
        entry.skills = nextLine;
        i++; // Skip next line
      }
    }
    // Extract problem - handle "What problem do you want to solve?:"
    else if (line.toLowerCase().includes('what problem') || line.toLowerCase().includes('problem do you want to solve')) {
      const match = line.match(/what problem.*?:\s*(.+)/i) || line.match(/problem do you want to solve.*?:\s*(.+)/i);
      if (match && match[1].trim()) {
        entry.problem = match[1].trim();
      } else if (nextLine && !nextLine.toLowerCase().includes('who needs') && !nextLine.toLowerCase().includes('------------------------------------------------------')) {
        entry.problem = nextLine;
        i++; // Skip next line
      }
    }
    // Extract customer - handle "Who needs a solution?:"
    else if (line.toLowerCase().includes('who needs') || line.toLowerCase().includes('who needs a solution')) {
      const match = line.match(/who needs.*?:\s*(.+)/i) || line.match(/who needs a solution.*?:\s*(.+)/i);
      if (match && match[1].trim()) {
        entry.customer = match[1].trim();
      } else if (nextLine && !nextLine.toLowerCase().includes('------------------------------------------------------') && !nextLine.toLowerCase().includes('date:')) {
        entry.customer = nextLine;
        i++; // Skip next line
      }
    }
    // Skip the header line "Generate 10 business idea..."
    else if (line.toLowerCase().includes('generate') && line.toLowerCase().includes('business idea')) {
      continue;
    }
    // Collect generated ideas (if present)
    else if (line.match(/^\d+\./) || line.match(/^idea\s*\d+/i)) {
      entry.ideas.push(line);
    }
  }
  
  // Entry is valid if we have date and at least industry, skills, problem, or customer
  // Email is optional
  if (entry.date && (entry.industry || entry.skills || entry.problem || entry.customer)) {
    return entry;
  }
  
  return null;
}

async function fetchIdeaGeneratorDataFromUrl(url) {
  try {
    console.log(`Fetching Idea Generator data from ${url}...`);
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (!response.data) {
      console.warn(`No data returned from ${url}`);
      return [];
    }
    
    const allLines = response.data.split('\n');
    console.log(`Found ${allLines.length} total lines in ${url}`);
    
    // Parse multi-line entries (entries are separated by blank lines or "Email:" markers)
    const entries = [];
    const seenEntries = new Set();
    let currentEntryLines = [];
    let parsedCount = 0;
    let cleanedCount = 0;
    let duplicateCount = 0;
    
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const trimmed = line.trim();
      
      // Check if this is the start of a new entry (Date:YYYY-MM-DD format)
      // Format: Date:2025-10-29 (without "Selected Idea")
      const dateMatch = trimmed.match(/^Date:(\d{4}-\d{2}-\d{2})(\s*\|.*)?$/i);
      const isSelectedIdeaLine = trimmed.match(/^Date:\d{4}-\d{2}-\d{2}\s*\|\s*Selected Idea:/i);
      
      if (dateMatch && !isSelectedIdeaLine && currentEntryLines.length > 0) {
        // Parse the previous entry
        const entry = parseMultiLineIdeaGeneratorEntry(currentEntryLines);
        if (entry) {
          parsedCount++;
          if (cleanIdeaGeneratorEntry(entry)) {
            cleanedCount++;
            const entryKey = `${entry.email}|${entry.industry}|${entry.problem}`.toLowerCase();
            if (!seenEntries.has(entryKey)) {
              seenEntries.add(entryKey);
              entries.push(entry);
            } else {
              duplicateCount++;
            }
          }
        }
        // Start new entry
        currentEntryLines = [line];
      } else if (trimmed || currentEntryLines.length > 0) {
        // "Selected Idea" line is part of the previous entry
        if (isSelectedIdeaLine) {
          currentEntryLines.push(line);
        }
        // Check if this is a new entry start (Date: without Selected Idea)
        else if (dateMatch && !isSelectedIdeaLine && currentEntryLines.length === 0) {
          currentEntryLines = [line];
        } else {
          // Add line to current entry (including blank lines within an entry)
          currentEntryLines.push(line);
        }
      }
    }
    
    // Parse the last entry
    if (currentEntryLines.length > 0) {
      const entry = parseMultiLineIdeaGeneratorEntry(currentEntryLines);
      if (entry) {
        parsedCount++;
        if (cleanIdeaGeneratorEntry(entry)) {
          cleanedCount++;
          const entryKey = `${entry.email}|${entry.industry}|${entry.problem}`.toLowerCase();
          if (!seenEntries.has(entryKey)) {
            seenEntries.add(entryKey);
            entries.push(entry);
          } else {
            duplicateCount++;
          }
        }
      }
    }
    
    
    console.log(`Parsed ${parsedCount} entries, ${cleanedCount} passed cleaning, ${duplicateCount} duplicates, ${entries.length} unique entries from ${url}`);
    return entries;
  } catch (error) {
    console.warn(`Could not fetch Idea Generator data from ${url}:`, error.message);
    return [];
  }
}

/**
 * Fetch Idea Generator data from both URLs
 * @param {number} days - Number of days to fetch (for future date-based fetching)
 * @returns {Promise<Array>} Array of cleaned Idea Generator entries
 */
export async function fetchIdeaGeneratorData(days = 7) {
  try {
    const allEntries = [];
    const seenEntries = new Set();
    
    // Try both URLs
    const urls = [
      'https://validatorai.com/postback/gen-idea-log.txt',
      'https://validatorai.com/api/gen-idea-log.txt'
    ];
    
    for (const url of urls) {
      const entries = await fetchIdeaGeneratorDataFromUrl(url);
      
      for (const entry of entries) {
        // Create unique key to avoid duplicates across URLs
        const entryKey = `${entry.email}|${entry.industry}|${entry.problem}`.toLowerCase();
        if (!seenEntries.has(entryKey)) {
          seenEntries.add(entryKey);
          allEntries.push(entry);
        }
      }
      
      // Small delay between requests
      if (url !== urls[urls.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const cleanedCount = allEntries.length;
    const totalFetched = allEntries.length; // We already filtered during parsing
    
    console.log(`Fetched ${cleanedCount} cleaned Idea Generator entries from ${urls.length} sources`);
    
    // If fewer than 20% of submissions survived filtering, log a note
    // (We don't have the original count, so we'll note if we have very few entries)
    if (cleanedCount < 50) {
      console.warn('Note: A large portion of Idea Generator submissions may have been incomplete or unusable, which itself signals high uncertainty among early founders.');
    }
    
    return allEntries;
  } catch (error) {
    console.warn('Idea Generator data not available:', error.message);
    return [];
  }
}

