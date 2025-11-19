/**
 * Internal Data Collector
 * 
 * Pulls idea stats, clusters, and validation data from log files
 */

import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { getDateString, getLookbackRange, calculateWoWChange, getDateDaysAgo } from '../utils/dateUtils.js';
import { 
  fetchOverallLog, 
  fetchDailyLogs, 
  fetchChartData,
  fetchBase44Clicks,
  parseLogDate 
} from '../utils/logParser.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get categories with counts and week-over-week changes from chart data
 * @param {Array} currentEntries - Chart entries from current period
 * @param {Array} previousEntries - Chart entries from previous period
 * @returns {Array} Array of category stats
 */
function getCategoryStatsFromChart(currentEntries, previousEntries) {
  // Count categories in current period
  const currentCounts = {};
  currentEntries.forEach(entry => {
    // Handle categories that may contain "/" (e.g., "SaaS / HealthTech")
    const categories = (entry.category || 'general').split('/').map(c => c.trim().toLowerCase());
    categories.forEach(cat => {
      if (cat) {
        currentCounts[cat] = (currentCounts[cat] || 0) + 1;
      }
    });
  });
  
  // Count categories in previous period
  const previousCounts = {};
  previousEntries.forEach(entry => {
    const categories = (entry.category || 'general').split('/').map(c => c.trim().toLowerCase());
    categories.forEach(cat => {
      if (cat) {
        previousCounts[cat] = (previousCounts[cat] || 0) + 1;
      }
    });
  });
  
  // Calculate stats with week-over-week changes
  const categories = [];
  const allCategories = new Set([
    ...Object.keys(currentCounts),
    ...Object.keys(previousCounts)
  ]);
  
  for (const category of allCategories) {
    const current = currentCounts[category] || 0;
    const previous = previousCounts[category] || 0;
    const delta = calculateWoWChange(current, previous);
    
    categories.push({
      name: category,
      count: current,
      delta: delta
    });
  }
  
  // Sort by count descending
  categories.sort((a, b) => b.count - a.count);
  
  return categories;
}

/**
 * Get categories with counts and week-over-week changes from ideas (fallback)
 * @param {Array} currentIdeas - Ideas from current period
 * @param {Array} previousIdeas - Ideas from previous period
 * @returns {Array} Array of category stats
 */
function getCategoryStats(currentIdeas, previousIdeas) {
  // Count categories in current period
  const currentCounts = {};
  currentIdeas.forEach(idea => {
    const category = (idea.category || 'general').toLowerCase().trim();
    currentCounts[category] = (currentCounts[category] || 0) + 1;
  });
  
  // Count categories in previous period
  const previousCounts = {};
  previousIdeas.forEach(idea => {
    const category = (idea.category || 'general').toLowerCase().trim();
    previousCounts[category] = (previousCounts[category] || 0) + 1;
  });
  
  // Calculate stats with week-over-week changes
  const categories = [];
  const allCategories = new Set([
    ...Object.keys(currentCounts),
    ...Object.keys(previousCounts)
  ]);
  
  for (const category of allCategories) {
    const current = currentCounts[category] || 0;
    const previous = previousCounts[category] || 0;
    const delta = calculateWoWChange(current, previous);
    
    categories.push({
      name: category,
      count: current,
      delta: delta
    });
  }
  
  // Sort by count descending
  categories.sort((a, b) => b.count - a.count);
  
  return categories;
}

/**
 * Detect idea clusters using keyword grouping
 * @param {Array} ideas - Array of ideas
 * @param {Array} previousIdeas - Ideas from previous period for WoW calculation
 * @returns {Array} Array of cluster stats
 */
function getClusters(ideas, previousIdeas, categories = [], problemHeatmap = []) {
  // Strategy 1: Group ideas by common keywords (if available)
  const keywordGroups = {};
  let keywordBasedClusters = [];
  
  ideas.forEach(idea => {
    const keywords = idea.keywords || [];
    // Look for common keyword combinations
    keywords.forEach(keyword => {
      if (keyword.length >= 3) { // Only meaningful keywords
        keywordGroups[keyword] = keywordGroups[keyword] || [];
        keywordGroups[keyword].push(idea);
      }
    });
  });
  
  // Calculate previous period counts for WoW
  const previousKeywordCounts = {};
  previousIdeas.forEach(idea => {
    const keywords = idea.keywords || [];
    keywords.forEach(keyword => {
      if (keyword.length >= 3) {
        previousKeywordCounts[keyword] = (previousKeywordCounts[keyword] || 0) + 1;
      }
    });
  });
  
  // Convert to cluster format
  for (const [keyword, groupIdeas] of Object.entries(keywordGroups)) {
    if (groupIdeas.length >= config.collection.clusterThreshold) {
      const current = groupIdeas.length;
      const previous = previousKeywordCounts[keyword] || 0;
      const wow = calculateWoWChange(current, previous);
      
      keywordBasedClusters.push({
        name: keyword,
        count: current,
        wow: wow
      });
    }
  }
  
  // Strategy 2: Use top categories as clusters (if keyword-based clusters are insufficient)
  const categoryBasedClusters = [];
  if (keywordBasedClusters.length < 3 && categories.length > 0) {
    // Use top categories with significant growth as clusters
    const topCategories = categories
      .filter(cat => cat.count >= 10 && cat.delta > 0.1) // At least 10 submissions and 10% growth
      .slice(0, 5);
    
    topCategories.forEach(cat => {
      categoryBasedClusters.push({
        name: cat.name,
        count: cat.count,
        wow: cat.delta
      });
    });
  }
  
  // Strategy 3: Use problem heatmap as clusters (if still insufficient)
  const problemBasedClusters = [];
  if (keywordBasedClusters.length + categoryBasedClusters.length < 3 && problemHeatmap.length > 0) {
    // Use top problems as clusters
    const topProblems = problemHeatmap
      .filter(prob => prob.count >= 20) // At least 20 mentions
      .slice(0, 3);
    
    topProblems.forEach(prob => {
      problemBasedClusters.push({
        name: prob.problem.substring(0, 60), // Truncate long problem names
        count: prob.count,
        wow: prob.delta || 0
      });
    });
  }
  
  // Combine all cluster sources, prioritizing keyword-based
  const allClusters = [
    ...keywordBasedClusters,
    ...categoryBasedClusters,
    ...problemBasedClusters
  ];
  
  // Remove duplicates (same name)
  const uniqueClusters = [];
  const seenNames = new Set();
  for (const cluster of allClusters) {
    const normalizedName = cluster.name.toLowerCase().trim();
    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      uniqueClusters.push(cluster);
    }
  }
  
  // Sort by count descending
  uniqueClusters.sort((a, b) => b.count - a.count);
  
  return uniqueClusters.slice(0, 20); // Top 20 clusters
}

/**
 * Calculate signal score for an idea
 * @param {Object} idea - Idea object
 * @returns {number} Signal score (0-100)
 */
function calculateSignalScore(idea) {
  let score = 0;
  
  // Clear problem (30 points)
  if (idea.problem && idea.problem.length > 10) {
    score += 30;
  } else if (idea.description && idea.description.length > 50) {
    score += 15; // Partial credit for description
  }
  
  // Named competitor (20 points)
  const competitorKeywords = ['competitor', 'alternative', 'vs', 'like', 'similar to', 'instead of'];
  const text = `${idea.title || ''} ${idea.description || ''}`.toLowerCase();
  if (competitorKeywords.some(keyword => text.includes(keyword))) {
    score += 20;
  }
  
  // Concise description (20 points)
  const descLength = (idea.description || '').length;
  if (descLength > 0 && descLength < 200) {
    score += 20;
  } else if (descLength >= 200 && descLength < 500) {
    score += 10;
  }
  
  // Category specified (10 points)
  if (idea.category && idea.category !== 'general') {
    score += 10;
  }
  
  // Keywords present (10 points)
  if (idea.keywords && idea.keywords.length > 0) {
    score += 10;
  }
  
  // Validation indicators (10 points)
  const status = (idea.status || '').toLowerCase();
  if (status.includes('mvp') || status.includes('launched') || status.includes('paying')) {
    score += 10;
  }
  
  return Math.min(100, score);
}

/**
 * Normalize problem name for comparison
 * @param {string} problem - Problem string
 * @returns {string} Normalized problem name
 */
function normalizeProblemName(problem) {
  return problem.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50); // Use first 50 chars for normalization
}

/**
 * Check if two normalized strings are similar (fuzzy match)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} True if strings are similar
 */
function areNormalizedSimilar(str1, str2) {
  if (str1 === str2) return true;
  
  // Check if one contains the other (for substring matches)
  if (str1.length > 20 && str2.length > 20) {
    if (str1.includes(str2) || str2.includes(str1)) return true;
  }
  
  // Check word overlap (at least 60% of words should match)
  const words1 = str1.split(/\s+/).filter(w => w.length > 3);
  const words2 = str2.split(/\s+/).filter(w => w.length > 3);
  if (words1.length === 0 || words2.length === 0) return false;
  
  const commonWords = words1.filter(w => words2.includes(w));
  const minWords = Math.min(words1.length, words2.length);
  return commonWords.length >= Math.ceil(minWords * 0.6);
}

/**
 * Extract meaningful keywords from a problem statement
 * Filters out common stop words and focuses on domain-specific terms
 * @param {string} problem - Problem string
 * @returns {Array} Array of meaningful keywords
 */
function extractMeaningfulKeywords(problem) {
  const lower = problem.toLowerCase();
  
  // Common stop words to filter out (too generic)
  const stopWords = new Set([
    'this', 'that', 'these', 'those', 'with', 'from', 'have', 'has', 'had',
    'been', 'being', 'were', 'where', 'when', 'what', 'which', 'who',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'more', 'most', 'much', 'many', 'some', 'any', 'all', 'each', 'every',
    'very', 'too', 'also', 'just', 'only', 'even', 'still', 'already',
    'time', 'times', 'way', 'ways', 'thing', 'things', 'one', 'ones',
    'make', 'makes', 'made', 'take', 'takes', 'took', 'get', 'gets', 'got',
    'give', 'gives', 'gave', 'come', 'comes', 'came', 'go', 'goes', 'went',
    'see', 'sees', 'saw', 'know', 'knows', 'knew', 'think', 'thinks', 'thought',
    'want', 'wants', 'wanted', 'need', 'needs', 'needed', 'use', 'uses', 'used',
    'find', 'finds', 'found', 'work', 'works', 'worked', 'try', 'tries', 'tried'
  ]);
  
  // Extract words (5+ chars for better specificity, or important 4-char words)
  const allWords = lower.match(/\b\w{4,}\b/g) || [];
  
  // Filter out stop words and focus on meaningful terms
  const meaningfulWords = allWords.filter(word => {
    // Keep words that are 5+ chars (likely domain-specific)
    if (word.length >= 5) return true;
    
    // Keep important 4-char words that aren't stop words
    if (word.length === 4 && !stopWords.has(word)) {
      // Keep domain-specific 4-char words
      const domainWords = ['cost', 'price', 'paid', 'free', 'safe', 'fast', 'slow', 'easy', 'hard'];
      return domainWords.includes(word);
    }
    
    return false;
  });
  
  return [...new Set(meaningfulWords)]; // Remove duplicates
}

/**
 * Group similar problems together using improved keyword matching
 * @param {Array} problems - Array of problem strings
 * @returns {Array} Grouped problems with normalized names
 */
function groupSimilarProblems(problems) {
  const problemGroups = [];
  const problemData = [];
  
  // Extract keywords from each problem
  problems.forEach((problem, index) => {
    if (!problem || problem.length < 10) return;
    
    const keywords = extractMeaningfulKeywords(problem);
    
    // Skip if no meaningful keywords found
    if (keywords.length === 0) return;
    
    problemData.push({ 
      index, 
      keywords, 
      original: problem,
      normalized: normalizeProblemName(problem)
    });
  });
  
  // Group problems with similar keywords
  const used = new Set();
  
  problemData.forEach(data => {
    if (used.has(data.index)) return;
    
    const group = {
      name: data.original.substring(0, 150), // Use first problem as group name
      problems: [data.original],
      count: 1,
      keywords: data.keywords,
      normalized: data.normalized
    };
    
    // Find similar problems
    problemData.forEach(otherData => {
      if (used.has(otherData.index) || data.index === otherData.index) return;
      
      // Check normalized name similarity first (most reliable)
      const nameSimilar = areNormalizedSimilar(data.normalized, otherData.normalized);
      if (nameSimilar) {
        group.problems.push(otherData.original);
        group.count++;
        used.add(otherData.index);
        return;
      }
      
      // Calculate keyword similarity (require at least 2 common keywords)
      const commonKeywords = data.keywords.filter(k => otherData.keywords.includes(k));
      
      // Require minimum 2 meaningful keyword matches
      if (commonKeywords.length < 2) return;
      
      // Calculate similarity score
      const totalKeywords = new Set([...data.keywords, ...otherData.keywords]).size;
      const similarity = totalKeywords > 0 ? commonKeywords.length / totalKeywords : 0;
      
      // Require 50% similarity (increased from 30%) AND at least 2 common keywords
      if (similarity >= 0.5 && commonKeywords.length >= 2) {
        group.problems.push(otherData.original);
        group.count++;
        used.add(otherData.index);
      }
    });
    
    if (group.count > 0) {
      problemGroups.push(group);
      used.add(data.index);
    }
  });
  
  return problemGroups;
}

/**
 * Get problem heatmap from ideas (extract actual problems, not categories)
 * @param {Array} ideas - Array of ideas with problem fields
 * @param {Array} previousIdeas - Ideas from previous period for WoW calculation
 * @returns {Array} Array of top problems with counts and trends
 */
function getProblemHeatmap(ideas, previousIdeas) {
  // Extract all problems from ideas
  const allProblems = [];
  ideas.forEach(idea => {
    if (idea.problem && idea.problem.length > 10) {
      allProblems.push(idea.problem);
    }
  });
  
  if (allProblems.length === 0) {
    return [];
  }
  
  // Group similar problems
  const problemGroups = groupSimilarProblems(allProblems);
  
  // Count problems in previous period for WoW calculation
  const previousProblemCounts = {};
  previousIdeas.forEach(idea => {
    if (idea.problem && idea.problem.length > 10) {
      const normalized = normalizeProblemName(idea.problem);
      previousProblemCounts[normalized] = (previousProblemCounts[normalized] || 0) + 1;
    }
  });
  
  // Convert groups to heatmap format
  const heatmap = problemGroups.map(group => {
    const normalized = group.normalized;
    const current = group.count;
    const previous = previousProblemCounts[normalized] || 0;
    const delta = calculateWoWChange(current, previous);
    
    // Select best examples that are most similar to the group name
    const groupNameNormalized = normalizeProblemName(group.name);
    const examples = group.problems
      .map(problem => ({
        problem,
        similarity: areNormalizedSimilar(groupNameNormalized, normalizeProblemName(problem)) ? 1 : 0
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(item => item.problem);
    
    return {
      problem: group.name.substring(0, 150), // Limit length for display
      count: current,
      delta: delta,
      examples: examples.length > 0 ? examples : group.problems.slice(0, 3) // Show 3 most similar examples
    };
  });
  
  // Sort by count descending
  heatmap.sort((a, b) => b.count - a.count);
  
  return heatmap.slice(0, 10); // Top 10 problems
}

/**
 * Get problem heatmap from chart data (fallback - low-scoring entries indicate problems)
 * @param {Array} chartEntries - Array of chart entries
 * @returns {Array} Array of top problems with counts
 */
function getProblemHeatmapFromChart(chartEntries) {
  const problemCounts = {};
  
  // Focus on low-scoring entries (score < 60) as problem indicators
  // These represent areas where submissions are struggling
  const lowScoreThreshold = 60;
  
  chartEntries.forEach(entry => {
    if (entry.score < lowScoreThreshold) {
      // Use category as problem area indicator
      const category = entry.category || 'general';
      // Split by "/" to handle multiple categories (e.g., "SaaS / HealthTech")
      const categories = category.split('/').map(c => c.trim());
      categories.forEach(cat => {
        if (cat && cat.length > 2) {
          // Clean up category name (remove common suffixes in parentheses)
          let cleanCat = cat.replace(/\s*\([^)]*\)/g, '').trim();
          if (!cleanCat) cleanCat = cat.trim();
          
          // Normalize to lowercase for counting
          const problem = cleanCat.toLowerCase();
          if (problem.length > 2) {
            problemCounts[problem] = (problemCounts[problem] || 0) + 1;
          }
        }
      });
    }
  });
  
  // If we don't have enough low-score problems, also include most common categories
  // as "focus areas" that need attention
  if (Object.keys(problemCounts).length < 5) {
    const allCategoryCounts = {};
    chartEntries.forEach(entry => {
      const category = entry.category || 'general';
      const categories = category.split('/').map(c => c.trim());
      categories.forEach(cat => {
        if (cat && cat.length > 2) {
          let cleanCat = cat.replace(/\s*\([^)]*\)/g, '').trim();
          if (!cleanCat) cleanCat = cat.trim();
          const normalized = cleanCat.toLowerCase();
          if (normalized.length > 2) {
            allCategoryCounts[normalized] = (allCategoryCounts[normalized] || 0) + 1;
          }
        }
      });
    });
    
    // Add top categories that aren't already in problemCounts
    const sortedCategories = Object.entries(allCategoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedCategories.forEach(([cat, count]) => {
      if (!problemCounts[cat] && count >= 3) {
        problemCounts[cat] = count;
      }
    });
  }
  
  // Convert to array and sort
  const problems = Object.entries(problemCounts)
    .map(([problem, count]) => ({ problem, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 problems
  
  return problems;
}


/**
 * Get average signal score
 * @param {Array} ideas - Array of ideas
 * @returns {Object} Signal score stats
 */
function getSignalScoreStats(ideas) {
  if (!ideas || ideas.length === 0) {
    return {
      average: 0,
      topDecile: 0,
      distribution: {}
    };
  }
  
  // Calculate scores for all ideas
  const scores = ideas.map(idea => calculateSignalScore(idea));
  scores.sort((a, b) => b - a);
  
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const topDecileIndex = Math.floor(scores.length * 0.1);
  const topDecile = scores[topDecileIndex] || 0;
  
  // Count ideas passing rules
  const rules = {
    clearProblem: 0,
    namedCompetitor: 0,
    conciseDescription: 0
  };
  
  ideas.forEach(idea => {
    if (idea.problem && idea.problem.length > 10) rules.clearProblem++;
    const text = `${idea.title || ''} ${idea.description || ''}`.toLowerCase();
    if (['competitor', 'alternative', 'vs', 'like'].some(k => text.includes(k))) {
      rules.namedCompetitor++;
    }
    const descLength = (idea.description || '').length;
    if (descLength > 0 && descLength < 200) rules.conciseDescription++;
  });
  
  const total = ideas.length;
  
  return {
    average: Math.round(average * 10) / 10,
    topDecile: Math.round(topDecile * 10) / 10,
    rules: {
      clearProblem: total > 0 ? Math.round((rules.clearProblem / total) * 100) : 0,
      namedCompetitor: total > 0 ? Math.round((rules.namedCompetitor / total) * 100) : 0,
      conciseDescription: total > 0 ? Math.round((rules.conciseDescription / total) * 100) : 0
    }
  };
}

/**
 * Get validation statistics from ideas
 * @param {Array} ideas - Array of ideas
 * @returns {Object} Validation stats
 */
function getValidationStats(ideas) {
  if (!ideas || ideas.length === 0) {
    return {
      mvp: 0,
      paying: 0,
      mrr: 0,
      launched: 0
    };
  }
  
  let mvpCount = 0;
  let payingCount = 0;
  let launchedCount = 0;
  
  // Check ideas for validation indicators
  ideas.forEach(idea => {
    const status = (idea.status || '').toLowerCase();
    const title = (idea.title || '').toLowerCase();
    const description = (idea.description || '').toLowerCase();
    const text = `${title} ${description}`;
    
    // Check for MVP indicators
    if (status.includes('mvp') || 
        text.includes('mvp') || 
        text.includes('minimum viable product') ||
        text.includes('prototype')) {
      mvpCount++;
    }
    
    // Check for paying customer indicators
    if (status.includes('paying') || 
        status.includes('revenue') ||
        text.includes('paying customers') ||
        text.includes('revenue') ||
        text.includes('mrr') ||
        text.includes('arr')) {
      payingCount++;
    }
    
    // Check for launched indicators
    if (status.includes('launched') || 
        status.includes('live') ||
        text.includes('launched') ||
        text.includes('live') ||
        text.includes('public')) {
      launchedCount++;
    }
  });
  
  const total = ideas.length;
  
  return {
    mvp: total > 0 ? mvpCount / total : 0,
    paying: total > 0 ? payingCount / total : 0,
    mrr: total > 0 ? payingCount / total : 0, // Using paying as proxy for MRR
    launched: total > 0 ? launchedCount / total : 0
  };
}

/**
 * Filter ideas by date range
 * @param {Array} ideas - Array of ideas
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filtered ideas
 */
function filterIdeasByDateRange(ideas, startDate, endDate) {
  return ideas.filter(idea => {
    if (!idea.date && !idea.created_at) {
      return false; // Skip ideas without dates
    }
    
    const ideaDate = idea.date ? new Date(idea.date) : new Date(idea.created_at);
    return ideaDate >= startDate && ideaDate <= endDate;
  });
}

/**
 * Main collection function
 * @returns {Promise<Object>} Collected internal data
 */
export async function collectInternalData(date = null) {
  const today = date || getDateString();
  console.log(`Starting internal data collection for date: ${today} (today: ${new Date().toISOString()})...`);
  
  try {
    // Fetch log files
    console.log('Fetching log files...');
    const [overallIdeas, dailyIdeas, chartEntries, base44ClicksRaw] = await Promise.all([
      fetchOverallLog(),
      fetchDailyLogs(30), // Fetch last 30 days of daily logs
      fetchChartData(),
      fetchBase44Clicks(today)
    ]);
    
    // Combine all ideas
    const allIdeas = [...overallIdeas, ...dailyIdeas];
    
    // Remove duplicates based on title (simple deduplication)
    const uniqueIdeas = [];
    const seenTitles = new Set();
    allIdeas.forEach(idea => {
      const titleKey = (idea.title || '').toLowerCase().trim();
      if (titleKey && !seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        uniqueIdeas.push(idea);
      }
    });
    
    console.log(`Total unique ideas: ${uniqueIdeas.length}`);
    console.log(`Total chart entries: ${chartEntries.length}`);
    console.log(`Base44 clicks for ${today}: ${base44ClicksRaw.length}`);
    
    // Get date ranges for calculations
    const currentWeekStart = getDateDaysAgo(7);
    const previousWeekStart = getDateDaysAgo(14);
    const now = new Date();
    
    // Filter chart entries by date ranges
    const filterChartEntriesByDate = (entries, startDate, endDate) => {
      return entries.filter(entry => {
        if (!entry.dateObj) return false;
        return entry.dateObj >= startDate && entry.dateObj <= endDate;
      });
    };
    
    const currentWeekChartEntries = filterChartEntriesByDate(chartEntries, currentWeekStart, now);
    const previousWeekChartEntries = filterChartEntriesByDate(chartEntries, previousWeekStart, currentWeekStart);
    
    // Filter ideas by date ranges (for fallback/clusters)
    const currentWeekIdeas = filterIdeasByDateRange(uniqueIdeas, currentWeekStart, now);
    const previousWeekIdeas = filterIdeasByDateRange(uniqueIdeas, previousWeekStart, currentWeekStart);
    const lookbackRange = getLookbackRange(config.collection.lookbackDays);
    const lookbackIdeas = filterIdeasByDateRange(uniqueIdeas, lookbackRange.startDate, lookbackRange.endDate);
    
    console.log(`Current week chart entries: ${currentWeekChartEntries.length}`);
    console.log(`Previous week chart entries: ${previousWeekChartEntries.length}`);
    console.log(`Current week ideas: ${currentWeekIdeas.length}`);
    console.log(`Previous week ideas: ${previousWeekIdeas.length}`);
    console.log(`Lookback period ideas: ${lookbackIdeas.length}`);
    
    // Calculate stats - prioritize chart data for categories (Section 1)
    let categories;
    if (chartEntries.length > 0) {
      // Use chart data for categories (Section 1)
      categories = getCategoryStatsFromChart(currentWeekChartEntries, previousWeekChartEntries);
      console.log(`Categories from chart data: ${categories.length}`);
    } else {
      // Fallback to ideas data
      categories = getCategoryStats(currentWeekIdeas, previousWeekIdeas);
    }
    
    // Problem Heatmap (Section 2) - always use ideas data to extract actual problems
    // This extracts real problem statements from idea descriptions, not categories
    // Use current week ideas for fair WoW comparison (not all uniqueIdeas which includes all time)
    // For WoW comparison, compare current week vs previous week
    const ideasForProblems = currentWeekIdeas.length > 0 ? currentWeekIdeas : (uniqueIdeas.length > 0 ? uniqueIdeas : lookbackIdeas);
    const previousIdeasForProblems = previousWeekIdeas.length > 0 ? previousWeekIdeas : [];
    
    let problemHeatmap = getProblemHeatmap(ideasForProblems, previousIdeasForProblems);
    console.log(`Problems extracted from ${ideasForProblems.length} ideas: ${problemHeatmap.length}`);
    
    // Translate problem statements to English
    if (problemHeatmap.length > 0) {
      const { translateToEnglish } = await import('../utils/aiSummarizer.js');
      for (const problem of problemHeatmap) {
        if (problem.problem) {
          problem.problem = await translateToEnglish(problem.problem);
        }
        if (problem.examples && Array.isArray(problem.examples)) {
          for (let i = 0; i < problem.examples.length; i++) {
            problem.examples[i] = await translateToEnglish(problem.examples[i]);
          }
        }
      }
    }
    
    // If no problems found in ideas, fallback to chart data
    if (problemHeatmap.length === 0 && chartEntries.length > 0) {
      problemHeatmap = getProblemHeatmapFromChart(chartEntries);
      console.log(`Problems from chart data (fallback): ${problemHeatmap.length}`);
    }
    
    // Other stats from ideas
    // Pass categories and problemHeatmap to getClusters for fallback clustering
    const clusters = getClusters(lookbackIdeas, previousWeekIdeas, categories, problemHeatmap);
    const validation = getValidationStats(uniqueIdeas);
    const signalScore = getSignalScoreStats(uniqueIdeas);

    // Aggregate Base44 click data (top keywords)
    const base44KeywordCounts = {};
    base44ClicksRaw.forEach(click => {
      const keyword = (click.keyword || 'unknown').toLowerCase();
      base44KeywordCounts[keyword] = (base44KeywordCounts[keyword] || 0) + 1;
    });

    const base44TopKeywords = Object.entries(base44KeywordCounts)
      .map(([keyword, count]) => ({
        keyword,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const base44 = {
      totalClicks: base44ClicksRaw.length,
      topKeywords: base44TopKeywords,
      entries: base44ClicksRaw
    };
    
    const data = {
      date: today,
      categories,
      clusters,
      validation,
      problemHeatmap,
      signalScore,
      base44,
      ideas: uniqueIdeas.slice(0, 100), // Include sample ideas for AI analysis (limit to 100 to avoid large files)
      metadata: {
        collectedAt: new Date().toISOString(),
        lookbackDays: config.collection.lookbackDays,
        totalIdeas: uniqueIdeas.length,
        totalChartEntries: chartEntries.length,
        currentWeekCount: currentWeekIdeas.length,
        previousWeekCount: previousWeekIdeas.length,
        currentWeekChartCount: currentWeekChartEntries.length,
        previousWeekChartCount: previousWeekChartEntries.length,
        base44Clicks: base44ClicksRaw.length
      }
    };
    
    // Save to file
    await saveData(data);
    
    console.log('Internal data collection completed');
    return data;
    
  } catch (error) {
    console.error('Error collecting internal data:', error);
    throw error;
  }
}

/**
 * Save collected data to JSON file
 * @param {Object} data - Data to save
 */
async function saveData(data) {
  try {
    const dataDir = path.join(__dirname, '..', config.paths.internal);
    await fs.mkdir(dataDir, { recursive: true });
    
    const filename = path.join(dataDir, `${data.date}.json`);
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    
    console.log(`Saved internal data to ${filename}`);
  } catch (error) {
    console.error('Error saving internal data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node collectors/internal.js 2025-11-18
  const date = process.argv[2] || null;
  collectInternalData(date)
    .then(data => {
      console.log('Collection complete:', JSON.stringify(data, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Collection failed:', error);
      process.exit(1);
    });
}

