/**
 * RSS Feed Fetcher Utility
 * 
 * Fetches and parses RSS feeds from various sources
 */

import RSSParser from 'rss-parser';
import axios from 'axios';
import config from '../config.js';

const parser = new RSSParser({
  timeout: config.crawler.timeout,
  customFields: {
    item: ['description', 'content:encoded']
  }
});

/**
 * Fetch and parse RSS feed
 * @param {string} url - RSS feed URL
 * @param {number} maxItems - Maximum number of items to return
 * @returns {Promise<Array>} Array of parsed feed items
 */
export async function fetchRSSFeed(url, maxItems = config.collection.maxResultsPerSource) {
  try {
    console.log(`Fetching RSS feed: ${url}`);
    
    const feed = await parser.parseURL(url);
    
    const items = feed.items.slice(0, maxItems).map(item => ({
      title: item.title || '',
      description: item.contentSnippet || item.content || item.description || '',
      link: item.link || '',
      pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      source: extractSourceFromUrl(url),
      category: extractCategory(item)
    }));
    
    console.log(`Fetched ${items.length} items from ${url}`);
    return items;
    
  } catch (error) {
    console.error(`Error fetching RSS feed ${url}:`, error.message);
    return [];
  }
}

/**
 * Fetch multiple RSS feeds in parallel
 * @param {Array<string>} urls - Array of RSS feed URLs
 * @param {number} maxItems - Maximum items per feed
 * @returns {Promise<Object>} Object with feed URLs as keys and items as values
 */
export async function fetchMultipleRSSFeeds(urls, maxItems = config.collection.maxResultsPerSource) {
  const promises = urls.map(url => fetchRSSFeed(url, maxItems));
  const results = await Promise.allSettled(promises);
  
  const feeds = {};
  urls.forEach((url, index) => {
    if (results[index].status === 'fulfilled') {
      feeds[url] = results[index].value;
    } else {
      console.error(`Failed to fetch ${url}:`, results[index].reason);
      feeds[url] = [];
    }
  });
  
  return feeds;
}

/**
 * Extract source name from URL
 * @param {string} url - RSS feed URL
 * @returns {string} Source name
 */
function extractSourceFromUrl(url) {
  if (url.includes('techcrunch.com')) return 'TechCrunch';
  if (url.includes('venturebeat.com')) return 'VentureBeat';
  return new URL(url).hostname.replace('www.', '');
}

/**
 * Extract category from RSS item
 * @param {Object} item - RSS item
 * @returns {string} Category name
 */
function extractCategory(item) {
  // Try to extract category from various fields
  if (item.categories && item.categories.length > 0) {
    return item.categories[0];
  }
  if (item.category) {
    return item.category;
  }
  // TODO: Implement category extraction from title/description using keywords
  return 'general';
}

/**
 * Filter RSS items by keywords
 * @param {Array} items - RSS items
 * @param {Array<string>} keywords - Keywords to filter by
 * @returns {Array} Filtered items
 */
export function filterItemsByKeywords(items, keywords) {
  if (!keywords || keywords.length === 0) return items;
  
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  return items.filter(item => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    return lowerKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Fetch RSS feed with error handling and retry
 * @param {string} url - RSS feed URL
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} maxItems - Maximum items to return
 * @returns {Promise<Array>} Array of parsed items
 */
export async function fetchRSSFeedWithRetry(url, maxRetries = 3, maxItems = config.collection.maxResultsPerSource) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchRSSFeed(url, maxItems);
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed for ${url}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
  
  console.error(`Failed to fetch ${url} after ${maxRetries} attempts:`, lastError.message);
  return [];
}


