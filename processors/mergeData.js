/**
 * Data Merger
 * 
 * Merges internal and external JSON data into a single dataset
 */

import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { getDateString } from '../utils/dateUtils.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load JSON data from file
 * @param {string} filepath - Path to JSON file
 * @returns {Promise<Object>} Parsed JSON data
 */
async function loadJsonFile(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading JSON file ${filepath}:`, error.message);
    throw error;
  }
}

/**
 * Find correlations between internal and external data
 * @param {Object} internal - Internal data
 * @param {Object} external - External data
 * @returns {Array} Array of correlations
 */
function findCorrelations(internal, external) {
  const correlations = [];
  
  // Match categories with funding
  if (internal.categories && external.funding) {
    internal.categories.forEach(category => {
      const matchingFunding = external.funding.filter(f =>
        f.category && f.category.toLowerCase().includes(category.name.toLowerCase())
      );
      
      if (matchingFunding.length > 0) {
        correlations.push({
          type: 'category_funding',
          category: category.name,
          categoryDelta: category.delta,
          fundingCount: matchingFunding.length,
          fundingAmounts: matchingFunding.map(f => f.amount),
          message: `${category.name} category ↑${(category.delta * 100).toFixed(1)}% and ${matchingFunding.length} funding announcement(s)`
        });
      }
    });
  }
  
  // Match clusters with launches
  if (internal.clusters && external.launches) {
    internal.clusters.forEach(cluster => {
      const matchingLaunches = external.launches.filter(launch =>
        launch.name.toLowerCase().includes(cluster.name.toLowerCase()) ||
        launch.description.toLowerCase().includes(cluster.name.toLowerCase())
      );
      
      if (matchingLaunches.length > 0) {
        correlations.push({
          type: 'cluster_launch',
          cluster: cluster.name,
          clusterCount: cluster.count,
          launchCount: matchingLaunches.length,
          launches: matchingLaunches.map(l => l.name),
          message: `Cluster "${cluster.name}" (${cluster.count} ideas) has ${matchingLaunches.length} related launch(es)`
        });
      }
    });
  }
  
  // Match trends with categories
  if (internal.categories && external.trends) {
    internal.categories.forEach(category => {
      const matchingTrends = external.trends.filter(trend =>
        trend.keyword.toLowerCase().includes(category.name.toLowerCase()) ||
        category.name.toLowerCase().includes(trend.keyword.toLowerCase())
      );
      
      if (matchingTrends.length > 0) {
        correlations.push({
          type: 'category_trend',
          category: category.name,
          trends: matchingTrends,
          message: `${category.name} category aligns with ${matchingTrends.length} trending keyword(s)`
        });
      }
    });
  }
  
  return correlations;
}

/**
 * Merge internal and external data
 * @param {Object} internal - Internal data
 * @param {Object} external - External data
 * @returns {Object} Merged data
 */
export function mergeData(internal, external) {
  const merged = {
    date: internal.date || external.date || getDateString(),
    internal: {
      categories: internal.categories || [],
      clusters: internal.clusters || [],
      validation: internal.validation || {},
      problemHeatmap: internal.problemHeatmap || [],
      signalScore: internal.signalScore || {},
      ideas: internal.ideas || [], // Include ideas for AI analysis
      metadata: internal.metadata || {} // Include metadata for totalIdeas count
    },
    external: {
      funding: external.funding || [],
      launches: external.launches || [],
      hackerNews: external.hackerNews || [],
      articles: external.articles || [],
      trends: external.trends || [],
      reddit: external.reddit || []
    },
    correlations: findCorrelations(internal, external),
    metadata: {
      mergedAt: new Date().toISOString(),
      internalDate: internal.date,
      externalDate: external.date
    }
  };
  
  return merged;
}

/**
 * Load and merge data from files
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object>} Merged data
 */
export async function loadAndMerge(date = null) {
  const targetDate = date || getDateString();
  console.log(`Merging data for date: ${targetDate} (today: ${new Date().toISOString()})...`);
  
  try {
    const internalPath = path.join(__dirname, '..', config.paths.internal, `${targetDate}.json`);
    const externalPath = path.join(__dirname, '..', config.paths.external, `${targetDate}.json`);
    
    // Check if files exist
    try {
      await fs.access(internalPath);
      await fs.access(externalPath);
    } catch (error) {
      throw new Error(`Data files not found for date ${targetDate}. Please run collectors first.`);
    }
    
    // Load both files
    const [internal, external] = await Promise.all([
      loadJsonFile(internalPath),
      loadJsonFile(externalPath)
    ]);
    
    // Merge data
    const merged = mergeData(internal, external);
    
    // Save merged data
    await saveMergedData(merged);
    
    console.log('Data merged successfully');
    return merged;
    
  } catch (error) {
    console.error('Error merging data:', error.message);
    throw error;
  }
}

/**
 * Save merged data to file
 * @param {Object} data - Merged data
 */
async function saveMergedData(data) {
  try {
    const dataDir = path.join(__dirname, '..', config.paths.merged);
    await fs.mkdir(dataDir, { recursive: true });
    
    const filename = path.join(dataDir, `${data.date}.json`);
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    
    console.log(`Saved merged data to ${filename}`);
  } catch (error) {
    console.error('Error saving merged data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node processors/mergeData.js 2025-11-18
  const date = process.argv[2] || null;
  loadAndMerge(date)
    .then(data => {
      console.log('Merge complete:', JSON.stringify(data, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Merge failed:', error);
      process.exit(1);
    });
}


