/**
 * Lightweight Web Crawler Utility
 * 
 * Respects robots.txt and crawls pages for content extraction
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import config from '../config.js';

/**
 * Fetch robots.txt and parse it
 * @param {string} baseUrl - Base URL of the website
 * @returns {Promise<Object|null>} Parsed robots.txt or null
 */
async function getRobotsTxt(baseUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await axios.get(robotsUrl, {
      timeout: config.crawler.timeout,
      headers: { 'User-Agent': config.crawler.userAgent }
    });
    
    // Simple robots.txt parser
    return parseRobotsTxt(response.data);
  } catch (error) {
    console.warn(`Could not fetch robots.txt from ${baseUrl}:`, error.message);
    return null;
  }
}

/**
 * Simple robots.txt parser
 * @param {string} robotsTxt - Content of robots.txt
 * @returns {Object} Parsed rules
 */
function parseRobotsTxt(robotsTxt) {
  const rules = {
    disallowed: [],
    allowed: [],
    crawlDelay: null
  };
  
  const lines = robotsTxt.split('\n');
  let currentUserAgent = '*';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    
    const directive = trimmed.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmed.substring(colonIndex + 1).trim();
    
    if (directive === 'user-agent') {
      currentUserAgent = value;
    } else if (directive === 'disallow' && value) {
      rules.disallowed.push(value);
    } else if (directive === 'allow' && value) {
      rules.allowed.push(value);
    } else if (directive === 'crawl-delay') {
      rules.crawlDelay = parseInt(value) || null;
    }
  }
  
  return rules;
}

/**
 * Check if URL is allowed by robots.txt
 * @param {string} url - URL to check
 * @param {Object} robotsRules - Parsed robots.txt rules
 * @returns {boolean} True if allowed
 */
function isUrlAllowed(url, robotsRules) {
  if (!robotsRules || !config.crawler.respectRobotsTxt) {
    return true;
  }
  
  const urlPath = new URL(url).pathname;
  
  // Check if any disallowed path matches
  for (const disallowed of robotsRules.disallowed) {
    if (urlPath.startsWith(disallowed)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Crawl a single page and extract content
 * @param {string} url - URL to crawl
 * @param {Object} options - Crawl options
 * @returns {Promise<Object>} Extracted content
 */
export async function crawlPage(url, options = {}) {
  const {
    respectRobots = config.crawler.respectRobotsTxt,
    timeout = config.crawler.timeout,
    selectors = {
      title: 'title, h1',
      description: 'meta[name="description"], article p, .article-content',
      content: 'article, .content, main'
    }
  } = options;
  
  try {
    // Check robots.txt if enabled
    if (respectRobots) {
      const baseUrl = new URL(url).origin;
      const robotsRules = await getRobotsTxt(baseUrl);
      
      if (!isUrlAllowed(url, robotsRules)) {
        throw new Error(`URL ${url} is disallowed by robots.txt`);
      }
      
      // Respect crawl delay
      if (robotsRules.crawlDelay) {
        await new Promise(resolve => setTimeout(resolve, robotsRules.crawlDelay * 1000));
      }
    }
    
    // Fetch the page
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': config.crawler.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    // Parse HTML
    const $ = cheerio.load(response.data);
    
    // Extract content using selectors
    const title = $(selectors.title).first().text().trim() || 
                  $('title').text().trim() || 
                  $('h1').first().text().trim();
    
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       $(selectors.description).first().text().trim().substring(0, 200);
    
    const content = $(selectors.content).first().text().trim() ||
                   $('body').text().trim();
    
    // Extract metadata
    const metadata = {
      author: $('meta[name="author"]').attr('content') ||
              $('[rel="author"]').text().trim() ||
              $('.author').first().text().trim(),
      publishedDate: $('meta[property="article:published_time"]').attr('content') ||
                    $('time[datetime]').attr('datetime') ||
                    $('.published-date').first().text().trim(),
      category: $('meta[property="article:section"]').attr('content') ||
               $('.category').first().text().trim()
    };
    
    return {
      url,
      title,
      description: description.substring(0, 500),
      content: content.substring(0, 2000), // Limit content length
      metadata,
      fetchedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error crawling ${url}:`, error.message);
    throw error;
  }
}

/**
 * Crawl multiple pages with rate limiting
 * @param {Array<string>} urls - Array of URLs to crawl
 * @param {Object} options - Crawl options
 * @returns {Promise<Array>} Array of crawled content
 */
export async function crawlPages(urls, options = {}) {
  const { delay = config.crawler.delay, maxConcurrent = 3 } = options;
  const results = [];
  
  // Process in batches to respect rate limits
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(url => 
      crawlPage(url, options).catch(error => {
        console.error(`Failed to crawl ${url}:`, error.message);
        return null;
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null));
    
    // Delay between batches
    if (i + maxConcurrent < urls.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

/**
 * Extract links from a page
 * @param {string} url - URL to extract links from
 * @returns {Promise<Array>} Array of extracted links
 */
export async function extractLinks(url) {
  try {
    const response = await axios.get(url, {
      timeout: config.crawler.timeout,
      headers: { 'User-Agent': config.crawler.userAgent }
    });
    
    const $ = cheerio.load(response.data);
    const links = [];
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();
      
      if (href) {
        try {
          const absoluteUrl = new URL(href, url).href;
          links.push({ url: absoluteUrl, text });
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    return links;
  } catch (error) {
    console.error(`Error extracting links from ${url}:`, error.message);
    return [];
  }
}

