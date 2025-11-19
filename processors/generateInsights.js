/**
 * Insights Generator
 * 
 * Uses AI to generate concise newsletter-ready summaries from merged data
 */

import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { getDateString } from '../utils/dateUtils.js';
import { generateMultipleInsights, translateToEnglish } from '../utils/aiSummarizer.js';
import { loadAndMerge } from './mergeData.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get weekday name from date string
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {string} Weekday name (Monday, Tuesday, etc.)
 */
function getWeekdayName(dateStr) {
  const date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
  if (Number.isNaN(date.getTime())) {
    // Fallback to current day if date is invalid
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Prepare data blocks for AI summarization
 * @param {Object} mergedData - Merged data object
 * @param {string} targetDate - Date string (YYYY-MM-DD)
 * @returns {Promise<Object>} Data blocks organized by section
 */
async function prepareDataBlocks(mergedData, targetDate) {
  const blocks = {};
  
  // Extract weekday and add to all blocks
  const newsletter_day = getWeekdayName(targetDate);
  const base44 = mergedData.internal.base44 || { totalClicks: 0, topKeywords: [], entries: [] };
  
  // Add newsletter_day to all data blocks so the AI router can use it
  blocks._metadata = {
    newsletter_day: newsletter_day,
    date: targetDate
  };
  
  // Idea Futures Index
  blocks.idea_futures = {
    categories: mergedData.internal.categories || [],
    trends: mergedData.external.trends || [],
    summary: `Total categories tracked: ${mergedData.internal.categories.length}`,
    topCategory: mergedData.internal.categories[0] || null
  };
  
  // Clustering Report - Include actual data for AI analysis
  blocks.clustering = {
    clusters: mergedData.internal.clusters || [],
    totalClusters: mergedData.internal.clusters.length,
    topCluster: mergedData.internal.clusters[0] || null,
    correlations: mergedData.correlations.filter(c => c.type === 'cluster_launch'),
    // Add actual data for AI to analyze
    categories: mergedData.internal.categories || [],
    topCategories: (mergedData.internal.categories || []).slice(0, 10),
    problemHeatmap: mergedData.internal.problemHeatmap || [],
    topProblems: (mergedData.internal.problemHeatmap || []).slice(0, 5),
    totalIdeas: mergedData.internal.metadata?.totalIdeas || 0,
    // Sample idea titles/descriptions for pattern recognition (limit to avoid token limits)
    sampleIdeas: (mergedData.internal.ideas || []).slice(0, 20).map(idea => ({
      title: idea.title || '',
      description: (idea.description || '').substring(0, 200),
      category: idea.category || '',
      problem: (idea.problem || '').substring(0, 150)
    }))
  };
  
  // Validation Reality Check
  blocks.validation = {
    stats: mergedData.internal.validation || {},
    summary: `MVP: ${((mergedData.internal.validation.mvp || 0) * 100).toFixed(1)}%, Paying: ${((mergedData.internal.validation.paying || 0) * 100).toFixed(1)}%`
  };
  
  // Deal Radar
  blocks.deal_radar = {
    funding: mergedData.external.funding || [],
    launches: mergedData.external.launches || [],
    topFunding: mergedData.external.funding.slice(0, 5),
    correlations: mergedData.correlations.filter(c => c.type === 'category_funding')
  };
  
  // Trends
  blocks.trends = {
    trends: mergedData.external.trends || [],
    topTrends: mergedData.external.trends.slice(0, 5),
    correlations: mergedData.correlations.filter(c => c.type === 'category_trend')
  };
  
        // Problem Heatmap - translate problems to English (must be done before using translatedProblems)
        const problemHeatmap = mergedData.internal.problemHeatmap || [];
        const translatedProblems = [];
        for (const problem of problemHeatmap) {
          const translated = { ...problem };
          if (translated.problem) {
            translated.problem = await translateToEnglish(translated.problem);
          }
          if (translated.examples && Array.isArray(translated.examples)) {
            translated.examples = [];
            for (const example of problem.examples.slice(0, 3)) {
              translated.examples.push(await translateToEnglish(example));
            }
          }
          translatedProblems.push(translated);
        }
        
        blocks.problem_heatmap = {
          problems: translatedProblems,
          topProblems: translatedProblems.slice(0, 5)
        };
  
  // Tuesday: Early Market Signals
  blocks.early_market_signals = {
    categories: mergedData.internal.categories || [],
    clusters: mergedData.internal.clusters || [],
    problems: translatedProblems,
    launches: mergedData.external.launches || [],
    funding: mergedData.external.funding || [],
    trends: mergedData.external.trends || [],
    reddit: mergedData.external.reddit || []
  };
  
  // Tuesday: Opportunities in the Gaps
  blocks.opportunities_in_gaps = {
    categories: mergedData.internal.categories || [],
    problems: translatedProblems,
    validation: mergedData.internal.validation || {},
    clusters: mergedData.internal.clusters || [],
    funding: mergedData.external.funding || [],
    // Calculate gaps: high problem frequency but low execution
    executionGaps: mergedData.internal.categories?.filter(cat => {
      const problemCount = translatedProblems.filter(p => 
        p.category === cat.name || p.examples?.some(e => e.toLowerCase().includes(cat.name.toLowerCase()))
      ).length;
      return problemCount > 5 && (cat.count || 0) < 10; // High problems, low ideas
    }) || []
  };
  
  // Signal Score
  blocks.signal_score = {
    score: mergedData.internal.signalScore || {},
    average: mergedData.internal.signalScore?.average || 0,
    topDecile: mergedData.internal.signalScore?.topDecile || 0,
    rules: mergedData.internal.signalScore?.rules || {}
  };
  
  // Signal Boost (external news validation)
  blocks.signal_boost = {
    articles: mergedData.external.articles || [],
    funding: mergedData.external.funding || [],
    correlations: mergedData.correlations || []
  };

  const totalIdeas = (mergedData.internal.categories || []).reduce(
    (sum, category) => sum + (category.count || 0),
    0
  );

  blocks.execution_gaps = {
    validation: mergedData.internal.validation || {},
    categories: mergedData.internal.categories || [],
    signalScore: mergedData.internal.signalScore || {},
    base44,
    summary: `Base44 clicks captured: ${base44.totalClicks}`
  };

  blocks.monthly_progress = {
    validation: mergedData.internal.validation || {},
    totalIdeas,
    base44,
    categories: mergedData.internal.categories || []
  };

  blocks.wednesday_experiment = {
    totalIdeas,
    validation: mergedData.internal.validation || {},
    categories: mergedData.internal.categories || []
  };

  blocks.founder_field_note = {
    problems: translatedProblems,
    categories: mergedData.internal.categories || []
  };

  blocks.tomorrows_question = {
    trends: mergedData.external.trends || [],
    correlations: mergedData.correlations || [],
    categories: mergedData.internal.categories || []
  };

  blocks.one_thing_today = {
    categories: mergedData.internal.categories || [],
    validation: mergedData.internal.validation || {}
  };
  
  // Add newsletter_day to each block for the AI router
  Object.keys(blocks).forEach(key => {
    if (blocks[key] && typeof blocks[key] === 'object' && !Array.isArray(blocks[key])) {
      blocks[key].newsletter_day = newsletter_day;
    }
  });
  
  // Create a daily_analysis block that contains all sections for the router
  // This allows the AI to route based on weekday and generate all required sections
  blocks.daily_analysis = {
    newsletter_day: newsletter_day,
    ...blocks, // Include all other blocks so the router has access to all data
    _metadata: blocks._metadata
  };
  
  return blocks;
}

/**
 * Generate insights from merged data
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object>} Generated insights
 */
export async function generateInsights(date = null) {
  const targetDate = date || getDateString();
  console.log(`Generating insights for date: ${targetDate} (today: ${new Date().toISOString()})...`);
  
  try {
    
    // Load merged data
    let mergedData;
    try {
      mergedData = await loadAndMerge(targetDate);
    } catch (error) {
      // If merge fails, try loading directly
      const mergedPath = path.join(__dirname, '..', config.paths.merged, `${targetDate}.json`);
      const content = await fs.readFile(mergedPath, 'utf-8');
      mergedData = JSON.parse(content);
    }
    
    // Prepare data blocks (include targetDate for weekday extraction)
    const dataBlocks = await prepareDataBlocks(mergedData, targetDate);
    
    // Generate AI insights
    console.log('Calling AI to generate insights...');
    const insights = await generateMultipleInsights(dataBlocks);
    
    // Compile final insights object
    const result = {
      date: targetDate,
      summary_blocks: {
        // Common sections
        idea_futures: insights.idea_futures || '',
        clustering: insights.clustering || '',
        validation: insights.validation || '',
        deal_radar: insights.deal_radar || '',
        trends: insights.trends || '',
        problem_heatmap: insights.problem_heatmap || '',
        signal_score: insights.signal_score || '',
        signal_boost: insights.signal_boost || '',
        // Tuesday sections
        opportunities_in_gaps: insights.opportunities_in_gaps || '',
        early_market_signals: insights.early_market_signals || '',
        // Wednesday sections
        wednesday_experiment: insights.wednesday_experiment || '',
        founder_field_note: insights.founder_field_note || '',
        tomorrows_question: insights.tomorrows_question || '',
        one_thing_today: insights.one_thing_today || '',
        // Monday sections
        weekend_spikes: insights.weekend_spikes || '',
        weekly_watchlist: insights.weekly_watchlist || '',
        // Thursday sections
        why_ideas_fail: insights.why_ideas_fail || '',
        execution_gaps: insights.execution_gaps || '',
        monthly_progress: insights.monthly_progress || '',
        anti_hype_section: insights.anti_hype_section || '',
        category_teardown: insights.category_teardown || '',
        // Friday sections
        weekly_top_10_ideas: insights.weekly_top_10_ideas || '',
        cluster_of_the_week: insights.cluster_of_the_week || '',
        founder_of_the_week: insights.founder_of_the_week || '',
        high_confidence_opportunities: insights.high_confidence_opportunities || '',
        weekend_challenge: insights.weekend_challenge || '',
        monday_preview: insights.monday_preview || ''
      },
           raw_data: {
             internal: {
               categories: mergedData.internal.categories,
               clusters: mergedData.internal.clusters,
               validation: mergedData.internal.validation,
               problemHeatmap: dataBlocks.problem_heatmap.problems, // Use translated problems
              signalScore: mergedData.internal.signalScore,
              base44: mergedData.internal.base44,
              ideas: mergedData.internal.ideas,
              metadata: mergedData.internal.metadata
             },
        categories: mergedData.internal.categories,
        clusters: mergedData.internal.clusters,
        validation: mergedData.internal.validation,
        funding: mergedData.external.funding,
        launches: mergedData.external.launches,
        trends: mergedData.external.trends,
        reddit: mergedData.external.reddit,
        articles: mergedData.external.articles,
        correlations: mergedData.correlations
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: config.openai.model
      }
    };
    
    // Save insights
    await saveInsights(result);
    
    console.log('Insights generated successfully');
    return result;
    
  } catch (error) {
    console.error('Error generating insights:', error);
    throw error;
  }
}

/**
 * Save generated insights to file
 * @param {Object} insights - Insights data
 */
async function saveInsights(insights) {
  try {
    const dataDir = path.join(__dirname, '..', config.paths.insights);
    await fs.mkdir(dataDir, { recursive: true });
    
    const filename = path.join(dataDir, `${insights.date}.json`);
    await fs.writeFile(filename, JSON.stringify(insights, null, 2));
    
    console.log(`Saved insights to ${filename}`);
  } catch (error) {
    console.error('Error saving insights:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node processors/generateInsights.js 2025-11-18
  const date = process.argv[2] || null;
  generateInsights(date)
    .then(insights => {
      console.log('Insights generated:', JSON.stringify(insights.summary_blocks, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Insights generation failed:', error);
      process.exit(1);
    });
}


