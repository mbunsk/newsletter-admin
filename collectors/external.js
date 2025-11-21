/**
 * External Data Collector
 * 
 * Fetches data from:
 * - Crunchbase API (funding announcements)
 * - Product Hunt API (daily launches)
 * - Hacker News API (Show HN and startup posts)
 * - TechCrunch RSS / VentureBeat RSS
 * - Google Trends API
 * - Reddit API (r/startups, r/entrepreneur, r/SaaS)
 */

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { getDateString } from '../utils/dateUtils.js';
import { fetchRSSFeed } from '../utils/rssFetcher.js';
import { crawlPage } from '../utils/crawler.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Format funding amount from Crunchbase API
 * @param {number} amount - Amount in USD
 * @returns {string} Formatted amount (e.g., "12M", "1.5B")
 */
function formatFundingAmount(amount) {
  if (!amount || amount === 0) return 'N/A';
  
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(1)}B`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(0)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  
  return `$${amount.toLocaleString()}`;
}

/**
 * Fetch funding announcements from Crunchbase
 * @returns {Promise<Array>} Array of funding announcements
 */
async function fetchCrunchbaseFunding() {
  try {
    // Check if Crunchbase API is configured
    if (!config.crunchbase.enabled || !config.crunchbase.apiKey) {
      console.log('Crunchbase API not configured. Using placeholder data.');
      // Return placeholder data
      const funding = [
      {
        company: 'FactoryOS',
        amount: '12M',
        category: 'vertical saas',
        date: new Date().toISOString(),
        source: 'crunchbase'
      },
      {
        company: 'AI Agents Inc',
        amount: '25M',
        category: 'ai',
        date: new Date().toISOString(),
        source: 'crunchbase'
      }
    ];
    
    console.log(`Using ${funding.length} placeholder funding announcements`);
    return funding;
    }
    
    console.log('Fetching Crunchbase funding data from API...');
    
    try {
      // Crunchbase API v4 endpoint for funding rounds
      const url = `${config.crunchbase.baseUrl}/searches/funding_rounds`;
      const params = {
        user_key: config.crunchbase.apiKey,
        field_ids: 'name,announced_on,money_raised,organization_identifier,organization_categories',
        limit: config.collection.maxResultsPerSource,
        order: [
          {
            field_id: 'announced_on',
            sort: 'desc'
          }
        ]
      };
      
      const response = await axios.get(url, { 
        params,
        timeout: config.crawler.timeout,
        headers: {
          'User-Agent': config.crawler.userAgent
        }
      });
      
      if (response.data && response.data.entities) {
        const funding = response.data.entities.map(entity => {
          const props = entity.properties || {};
          const org = props.organization_identifier || {};
          const categories = props.organization_categories || [];
          
          // Extract category from organization categories
          let category = 'general';
          if (categories.length > 0) {
            const cat = categories[0];
            // Map Crunchbase categories to our categories
            if (cat.includes('Artificial Intelligence') || cat.includes('Machine Learning')) {
              category = 'ai';
            } else if (cat.includes('Financial') || cat.includes('Fintech')) {
              category = 'fintech';
            } else if (cat.includes('SaaS') || cat.includes('Software')) {
              category = 'vertical saas';
            } else {
              category = cat.toLowerCase().replace(/\s+/g, '-');
            }
          }
          
          // Format amount
          const amount = props.money_raised ? formatFundingAmount(props.money_raised) : 'N/A';
          
          return {
            company: org.name || props.name || 'Unknown',
            amount: amount,
            category: category,
            date: props.announced_on || new Date().toISOString(),
            source: 'crunchbase',
            round_type: props.funding_type || null
          };
        });
        
        console.log(`Fetched ${funding.length} funding announcements from Crunchbase API`);
        return funding;
      }
      
      // If response structure is different, return empty and log
      console.warn('Unexpected Crunchbase API response structure');
      return [];
      
    } catch (error) {
      console.error('Error calling Crunchbase API:', error.message);
      if (error.response) {
        console.error('API Response:', error.response.status, error.response.data);
      }
      // Return empty array on error
      return [];
    }
    
  } catch (error) {
    console.error('Error fetching Crunchbase data:', error.message);
    return [];
  }
}

/**
 * Get Product Hunt OAuth2 access token
 * @returns {Promise<string|null>} Access token or null if failed
 */
async function getProductHuntAccessToken() {
  try {
    // If dev token is provided, use it directly
    if (config.productHunt.devToken) {
      console.log('Using Product Hunt dev token');
      return config.productHunt.devToken;
    }
    
    // Otherwise, use OAuth2 client credentials flow
    if (!config.productHunt.apiKey || !config.productHunt.apiSecret) {
      return null;
    }
    
    console.log('Obtaining Product Hunt OAuth2 access token...');
    const response = await axios.post(
      config.productHunt.tokenUrl,
      {
        client_id: config.productHunt.apiKey,
        client_secret: config.productHunt.apiSecret,
        grant_type: 'client_credentials'
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: config.crawler.timeout
      }
    );
    
    if (response.data && response.data.access_token) {
      console.log('Successfully obtained Product Hunt access token');
      return response.data.access_token;
    }
    
    console.warn('Failed to obtain access token from Product Hunt OAuth2');
    return null;
    
  } catch (error) {
    console.error('Error obtaining Product Hunt access token:', error.message);
    if (error.response) {
      console.error('OAuth2 Response:', error.response.status, error.response.data);
    }
    return null;
  }
}

async function fetchProductHuntLaunches() {
  try {
    // Check if Product Hunt API is configured
    if (!config.productHunt.enabled) {
      console.log('Product Hunt API not configured. Using placeholder data.');
      return getProductHuntPlaceholderData();
    }
    
    console.log('Fetching Product Hunt launches...');
    
    try {
      // Get access token (dev token or OAuth2)
      const accessToken = await getProductHuntAccessToken();
      if (!accessToken) {
        console.warn('Failed to obtain Product Hunt access token. Using placeholder data.');
        return getProductHuntPlaceholderData();
      }
      
      // Product Hunt uses GraphQL API with OAuth2
      const query = `
        query {
          posts(first: 50, order: VOTES) {
            edges {
              node {
                id
                name
                tagline
                website
                votesCount
                createdAt
                topics {
                  edges {
                    node {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const response = await axios.post(
        config.productHunt.baseUrl,
        { query },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: config.crawler.timeout
        }
      );
      
      if (response.data && response.data.data && response.data.data.posts) {
        const launches = response.data.data.posts.edges.map(edge => {
          const post = edge.node;
          const topics = post.topics?.edges?.map(t => t.node.name) || [];
          
          return {
            name: post.name,
            description: post.tagline || '',
            source: 'product hunt',
            url: post.website || `https://www.producthunt.com/posts/${post.id}`,
            votes: post.votesCount || 0,
            topics: topics,
            date: post.createdAt || new Date().toISOString()
          };
        });
        
        console.log(`Fetched ${launches.length} launches from Product Hunt API`);
        return launches;
      }
      
      console.warn('Unexpected Product Hunt API response structure');
      if (response.data) {
        console.log('Response data:', JSON.stringify(response.data, null, 2));
      }
      return getProductHuntPlaceholderData();
      
    } catch (error) {
      console.error('Error calling Product Hunt API:', error.message);
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        console.error(`API Response: ${status}`, errorData);
        
        // If 401 (unauthorized) or 403 (forbidden), the token is invalid
        // Fall back to placeholder data
        if (status === 401 || status === 403) {
          console.warn('Product Hunt API authentication failed. Falling back to placeholder data.');
          return getProductHuntPlaceholderData();
        }
      }
      // For other errors, also fall back to placeholder
      return getProductHuntPlaceholderData();
    }
    
  } catch (error) {
    console.error('Error fetching Product Hunt data:', error.message);
    return getProductHuntPlaceholderData();
  }
}

/**
 * Get placeholder Product Hunt data when API is unavailable
 * @returns {Array} Array of placeholder launch data
 */
function getProductHuntPlaceholderData() {
  return [
    {
      name: 'ReptileRx',
      description: 'Telehealth platform for reptile owners',
      source: 'product hunt',
      url: 'https://www.producthunt.com/posts/reptile-rx',
      votes: 245,
      date: new Date().toISOString()
    },
    {
      name: 'AI Agent Builder',
      description: 'No-code tool for building AI agents',
      source: 'product hunt',
      url: 'https://www.producthunt.com/posts/ai-agent-builder',
      votes: 189,
      date: new Date().toISOString()
    }
  ];
}

/**
 * Fetch startup-related posts from Hacker News
 * @returns {Promise<Array>} Array of HN posts
 */
async function fetchHackerNewsPosts() {
  try {
    console.log('Fetching Hacker News posts...');
    
    // Hacker News API endpoints
    const topStoriesUrl = `${config.hackerNews.baseUrl}/topstories.json`;
    const showHNUrl = `${config.hackerNews.baseUrl}/showstories.json`;
    
    // Get story IDs
    const [topStoriesResponse, showHNResponse] = await Promise.all([
      axios.get(topStoriesUrl),
      axios.get(showHNUrl)
    ]);
    
    const storyIds = [
      ...topStoriesResponse.data.slice(0, 20),
      ...showHNResponse.data.slice(0, 10)
    ];
    
    // Fetch story details
    const storyPromises = storyIds.slice(0, config.collection.maxResultsPerSource).map(id =>
      axios.get(`${config.hackerNews.baseUrl}/item/${id}.json`)
        .then(res => res.data)
        .catch(() => null)
    );
    
    const stories = await Promise.all(storyPromises);
    
    // Filter for startup-related content
    const startupStories = stories
      .filter(story => story && (
        story.title.toLowerCase().includes('startup') ||
        story.title.toLowerCase().includes('launch') ||
        story.title.toLowerCase().includes('show hn') ||
        story.url
      ))
      .map(story => ({
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        score: story.score || 0,
        source: 'hacker news',
        date: new Date(story.time * 1000).toISOString()
      }));
    
    console.log(`Fetched ${startupStories.length} startup stories from Hacker News`);
    return startupStories;
    
  } catch (error) {
    console.error('Error fetching Hacker News data:', error.message);
    return [];
  }
}

/**
 * Fetch articles from TechCrunch RSS feeds (multiple feeds)
 * @returns {Promise<Object>} Object with articles and funding data extracted from Venture feed
 */
async function fetchTechCrunchFeeds() {
  try {
    console.log('Fetching TechCrunch RSS feeds...');
    
    const techcrunchFeeds = Array.isArray(config.rss.techcrunch) 
      ? config.rss.techcrunch 
      : [config.rss.techcrunch];
    
    const allArticles = [];
    const ventureArticles = []; // Articles from venture feed (for funding data)
    
    for (const feedUrl of techcrunchFeeds) {
      try {
        const items = await fetchRSSFeed(feedUrl, 20);
        const articles = items.map(item => ({
          title: item.title,
          description: item.description,
          url: item.link,
          source: item.source,
          date: item.pubDate,
          category: item.category,
          feedType: feedUrl.includes('/category/venture/') ? 'venture' : 
                   feedUrl.includes('?s=signals') ? 'signals' : 'main'
        }));
        
        allArticles.push(...articles);
        
        // Track venture feed articles separately for funding extraction
        if (feedUrl.includes('/category/venture/')) {
          ventureArticles.push(...articles);
        }
        
        // Small delay between feeds
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`Error fetching TechCrunch feed ${feedUrl}:`, error.message);
        // Continue with other feeds
      }
    }
    
    // Remove duplicates based on URL
    const uniqueArticles = [];
    const seenUrls = new Set();
    for (const article of allArticles) {
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        uniqueArticles.push(article);
      }
    }
    
    console.log(`Fetched ${uniqueArticles.length} unique articles from ${techcrunchFeeds.length} TechCrunch feeds`);
    console.log(`Venture feed articles: ${ventureArticles.length}`);
    
    return {
      articles: uniqueArticles,
      ventureArticles: ventureArticles
    };
    
  } catch (error) {
    console.error('Error fetching TechCrunch feeds:', error.message);
    return { articles: [], ventureArticles: [] };
  }
}

/**
 * Extract funding data from TechCrunch Venture feed articles
 * @param {Array} ventureArticles - Articles from TechCrunch Venture feed
 * @returns {Array} Array of funding announcements
 */
function extractFundingFromVentureArticles(ventureArticles) {
  const funding = [];
  
  for (const article of ventureArticles) {
    const title = article.title || '';
    const description = article.description || '';
    const text = `${title} ${description}`.toLowerCase();
    
    // Look for funding patterns in title/description
    const fundingPatterns = [
      /raised\s+(\$?[\d.]+[kmb]?)/i,
      /raised\s+(\$?[\d,]+)/i,
      /(\$?[\d.]+[kmb]?)\s+round/i,
      /(\$?[\d.]+[kmb]?)\s+series\s+[a-z]/i,
      /(\$?[\d.]+[kmb]?)\s+funding/i,
      /(\$?[\d.]+[kmb]?)\s+investment/i,
      /secured\s+(\$?[\d.]+[kmb]?)/i,
      /(\$?[\d.]+[kmb]?)\s+seed/i,
      /(\$?[\d.]+[kmb]?)\s+from\s+investors/i
    ];
    
    // Extract company name (usually first part of title before funding amount)
    let companyName = title.split(' raised')[0]
      .split(' secures')[0]
      .split(' raises')[0]
      .split(' gets')[0]
      .split(' closes')[0]
      .split(' raises')[0]
      .trim();
    
    // Clean up company name
    companyName = companyName.replace(/^(Why|How|What|When|Where)\s+/i, '');
    companyName = companyName.split(' ').slice(0, 3).join(' '); // Limit to first 3 words
    
    for (const pattern of fundingPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let amount = match[1];
        
        // Normalize amount format
        if (!amount.startsWith('$')) {
          amount = '$' + amount;
        }
        
        // Determine category from article content
        let category = 'general';
        if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) {
          category = 'ai';
        } else if (text.includes('saas') || text.includes('software')) {
          category = 'vertical saas';
        } else if (text.includes('fintech') || text.includes('financial')) {
          category = 'fintech';
        } else if (text.includes('health') || text.includes('medical')) {
          category = 'healthtech';
        }
        
        funding.push({
          company: companyName || 'Unknown',
          amount: amount,
          category: category,
          date: article.date || new Date().toISOString(),
          source: 'techcrunch-venture',
          url: article.url,
          title: article.title
        });
        
        // Only extract one funding amount per article
        break;
      }
    }
  }
  
  return funding;
}

/**
 * Extract funding announcements from generic RSS articles
 * @param {Array} articles - RSS articles
 * @param {string} sourceLabel - Source identifier
 * @returns {Array} Array of funding announcements
 */
function extractFundingFromRssArticles(articles, sourceLabel = 'rss') {
  const funding = [];
  const amountPatterns = [
    /\$[\d,.]+\s?(?:million|billion|m|b|k)?/i,
    /[\d,.]+\s?(?:million|billion)\s+(?:round|raise|funding|investment)/i
  ];
  const companySplitTokens = [' raises', ' raise', ' lands', ' secures', ' nabs', ' bags', ' scores', ':', ' gets'];

  for (const article of articles) {
    const title = article.title || '';
    const rawDescription = (article.description || '').replace(/<[^>]+>/g, ' ');
    const text = `${title} ${rawDescription}`;
    const lowerText = text.toLowerCase();

    let amountMatch = null;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amountMatch = match[0];
        break;
      }
    }

    if (!amountMatch) {
      continue;
    }

    let companyName = title;
    for (const token of companySplitTokens) {
      const idx = companyName.toLowerCase().indexOf(token.trim());
      if (idx > 0) {
        companyName = companyName.substring(0, idx);
        break;
      }
    }
    companyName = companyName.trim() || 'Unknown';

    const category = determineCategoryFromText(lowerText);

    funding.push({
      company: companyName,
      amount: normalizeFundingAmount(amountMatch),
      category,
      date: article.date || new Date().toISOString(),
      source: sourceLabel,
      url: article.url,
      title: article.title
    });
  }

  return funding;
}

function normalizeFundingAmount(rawAmount) {
  if (!rawAmount) return 'Undisclosed';
  let amount = rawAmount.trim();
  if (!amount.startsWith('$')) {
    amount = `$${amount}`;
  }
  amount = amount
    .replace(/\s+(million)/i, 'M')
    .replace(/\s+(billion)/i, 'B')
    .replace(/\s+(thousand)/i, 'K')
    .replace(/million/i, 'M')
    .replace(/billion/i, 'B')
    .replace(/thousand/i, 'K')
    .replace(/\s+/g, '');
  return amount;
}

function determineCategoryFromText(text) {
  if (!text) return 'general';
  if (text.includes('artificial intelligence') || text.includes('ai') || text.includes('machine learning')) return 'ai';
  if (text.includes('saas') || text.includes('software')) return 'vertical saas';
  if (text.includes('fintech') || text.includes('financial')) return 'fintech';
  if (text.includes('health') || text.includes('medical')) return 'healthtech';
  if (text.includes('robotic') || text.includes('hardware')) return 'hardware';
  return 'general';
}

function mergeFundingLists(...lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    list.forEach(deal => {
      if (!deal || !deal.company) return;
      const key = `${deal.company.toLowerCase()}|${deal.amount || ''}|${deal.source || ''}`;
      if (!seen.has(key)) {
        merged.push(deal);
        seen.add(key);
      }
    });
  }
  return merged;
}

/**
 * Fetch articles from RSS feeds (VentureBeat and other non-TechCrunch feeds)
 * @returns {Promise<Array>} Array of articles
 */
async function fetchRSSArticles() {
  try {
    console.log('Fetching RSS articles (non-TechCrunch)...');
    
    const feeds = [];
    
    // Add VentureBeat
    if (config.rss.venturebeat) {
      feeds.push(config.rss.venturebeat);
    }
    
    // Add any other RSS feeds (excluding TechCrunch which is handled separately)
    Object.entries(config.rss).forEach(([key, value]) => {
      if (key !== 'techcrunch' && key !== 'venturebeat' && typeof value === 'string') {
        feeds.push(value);
      }
    });
    
    const articles = [];
    
    for (const feedUrl of feeds) {
      try {
        // Add query parameters for TechRanch feed
        let urlToFetch = feedUrl;
        if (feedUrl.toLowerCase().includes('techranch')) {
          const separator = feedUrl.includes('?') ? '&' : '?';
          urlToFetch = `${feedUrl}${separator}orderby=date&order=DESC`;
        }
        
        const items = await fetchRSSFeed(urlToFetch, 20);
        articles.push(...items.map(item => ({
          title: item.title,
          description: item.description,
          url: item.link,
          source: item.source,
          date: item.pubDate,
          category: item.category
        })));
        
        // Small delay between feeds
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`Error fetching RSS feed ${feedUrl}:`, error.message);
        // Continue with other feeds
      }
    }
    
    console.log(`Fetched ${articles.length} articles from non-TechCrunch RSS feeds`);
    return articles;
    
  } catch (error) {
    console.error('Error fetching RSS articles:', error.message);
    return [];
  }
}

/**
 * Map category names to Google Trends-friendly keywords
 * @param {string} categoryName - Category name from internal data
 * @returns {string|null} Google Trends keyword or null if not trackable
 */
function mapCategoryToTrendKeyword(categoryName) {
  if (!categoryName) return null;
  
  const normalized = categoryName.toLowerCase().trim();
  
  // Direct mappings for common categories
  const categoryMap = {
    'saas (software as a service)': 'SaaS',
    'saas': 'SaaS',
    'ai': 'artificial intelligence',
    'edtech': 'edtech',
    'healthtech': 'healthtech',
    'e-commerce': 'ecommerce',
    'ecommerce': 'ecommerce',
    'fintech': 'fintech',
    'platforms': 'platform software',
    'tech': 'technology startup',
    'consulting': 'business consulting',
    'manufacturing': 'manufacturing technology',
    'fashion': 'fashion tech',
    'energytech': 'energy technology',
    'brick and mortar': 'retail technology',
    'services': 'service business'
  };
  
  // Check direct mapping first
  if (categoryMap[normalized]) {
    return categoryMap[normalized];
  }
  
  // Check if category name contains key terms
  if (normalized.includes('tech')) {
    return normalized.replace(/tech/i, 'tech').trim();
  }
  
  // If category is short and clean, use it directly
  if (normalized.length <= 20 && /^[a-z\s]+$/.test(normalized)) {
    return normalized;
  }
  
  return null;
}

/**
 * Fetch Google Trends data
 * @param {Array} topCategories - Optional array of top categories from internal data
 * @returns {Promise<Array>} Array of trend data
 */
async function fetchGoogleTrends(topCategories = null) {
  try {
    console.log('Fetching Google Trends data...');
    
    // Import google-trends-api
    const googleTrends = (await import('google-trends-api')).default;
    
    // Strategic keywords that should always be tracked (important trends)
    const strategicKeywords = [
      'ai agents',
      'vertical saas',
      'SaaS',
      'startup'
    ];
    
    // Build keyword list: strategic + dynamic from categories
    let keywords = [...strategicKeywords];
    
    // Add dynamic keywords from top categories (prioritize high-growth)
    if (Array.isArray(topCategories) && topCategories.length > 0) {
      // Sort by growth (delta) and count, prioritize high-growth categories
      const sortedCategories = [...topCategories]
        .filter(cat => cat.count >= 10) // Only categories with meaningful volume
        .sort((a, b) => {
          // Prioritize high growth, then high count
          const aScore = (a.delta || 0) * 0.6 + (a.count || 0) * 0.4;
          const bScore = (b.delta || 0) * 0.6 + (b.count || 0) * 0.4;
          return bScore - aScore;
        })
        .slice(0, 8); // Top 8 categories
      
      for (const category of sortedCategories) {
        const keyword = mapCategoryToTrendKeyword(category.name);
        if (keyword && !keywords.includes(keyword)) {
          keywords.push(keyword);
        }
      }
    }
    
    // Fallback to static list if no categories provided
    if (keywords.length === strategicKeywords.length) {
      keywords.push('pet tech', 'fintech', 'venture capital');
    }
    
    console.log(`Google Trends keywords selected: ${keywords.slice(0, 5).join(', ')} (tracking top 5)`);
    
    const trends = [];
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // Fetch trends for each keyword
    for (const keyword of keywords.slice(0, 5)) { // Limit to 5 to avoid rate limits
      try {
        const results = await googleTrends.interestOverTime({
          keyword: keyword,
          startTime: weekAgo,
          endTime: today,
          geo: 'US' // Can be changed to 'world' or specific country
        });
        
        const data = JSON.parse(results);
        
        if (data.default && data.default.timelineData && data.default.timelineData.length > 0) {
          // Calculate average interest
          const values = data.default.timelineData.map(d => d.value[0] || 0);
          const currentAvg = values.slice(-7).reduce((a, b) => a + b, 0) / 7; // Last week
          const previousAvg = values.slice(-14, -7).reduce((a, b) => a + b, 0) / 7; // Week before
          
          const interestChange = previousAvg > 0 ? (currentAvg - previousAvg) / previousAvg : 0;
          
          trends.push({
            keyword: keyword,
            interest_change: interestChange,
            current_interest: currentAvg,
            source: 'google trends'
          });
        }
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.warn(`Error fetching trend for "${keyword}":`, error.message);
        // Continue with other keywords
      }
    }
    
    // If no trends fetched, use fallback
    if (trends.length === 0) {
      console.log('Using fallback Google Trends data');
      return [
        {
          keyword: 'ai agents',
          interest_change: -0.19,
          source: 'google trends'
        },
        {
          keyword: 'vertical saas',
          interest_change: 0.31,
          source: 'google trends'
        },
        {
          keyword: 'pet tech',
          interest_change: 0.12,
          source: 'google trends'
        }
      ];
    }
    
    console.log(`Fetched ${trends.length} trends from Google Trends`);
    return trends;
    
  } catch (error) {
    console.error('Error fetching Google Trends data:', error.message);
    // Return fallback data
    return [
      {
        keyword: 'ai agents',
        interest_change: -0.19,
        source: 'google trends'
      },
      {
        keyword: 'vertical saas',
        interest_change: 0.31,
        source: 'google trends'
      }
    ];
  }
}

/**
 * Fetch posts from Reddit
 * @returns {Promise<Array>} Array of Reddit posts
 */
async function fetchRedditPosts() {
  try {
    // Check if Reddit API is configured
    if (!config.reddit.enabled || !config.reddit.clientId || !config.reddit.clientSecret) {
      console.log('Reddit API not configured. Using placeholder data.');
      // Return placeholder data
      const posts = [
        {
          title: 'Just launched my SaaS product',
          subreddit: 'startups',
          score: 45,
          url: 'https://reddit.com/r/startups/...',
          source: 'reddit'
        }
      ];
      
      console.log(`Using ${posts.length} placeholder posts from Reddit`);
      return posts;
    }
    
    console.log('Fetching Reddit posts...');
    
    try {
      // Step 1: Get OAuth2 access token
      const tokenResponse = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        new URLSearchParams({
          grant_type: 'client_credentials'
        }),
        {
          auth: {
            username: config.reddit.clientId,
            password: config.reddit.clientSecret
          },
          headers: {
            'User-Agent': config.reddit.userAgent,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: config.crawler.timeout
        }
      );
      
      const accessToken = tokenResponse.data.access_token;
      
      if (!accessToken) {
        throw new Error('Failed to obtain Reddit access token');
      }
      
      // Step 2: Fetch posts from each subreddit
      const allPosts = [];
      
      for (const subreddit of config.reddit.subreddits) {
        try {
          const response = await axios.get(
            `https://oauth.reddit.com/r/${subreddit}/hot.json`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': config.reddit.userAgent
              },
              params: {
                limit: 10,
                raw_json: 1
              },
              timeout: config.crawler.timeout
            }
          );
          
          if (response.data && response.data.data && response.data.data.children) {
            const subredditPosts = response.data.data.children
              .filter(child => child.data && !child.data.stickied) // Exclude stickied posts
              .map(child => {
                const data = child.data;
                return {
                  title: data.title,
                  subreddit: subreddit,
                  score: data.score || 0,
                  url: `https://reddit.com${data.permalink}`,
                  source: 'reddit',
                  date: new Date(data.created_utc * 1000).toISOString(),
                  num_comments: data.num_comments || 0
                };
              });
            
            allPosts.push(...subredditPosts);
          }
          
          // Small delay between subreddit requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.warn(`Error fetching from r/${subreddit}:`, error.message);
          // Continue with other subreddits
        }
      }
      
      // Sort by score and limit results
      allPosts.sort((a, b) => b.score - a.score);
      const topPosts = allPosts.slice(0, config.collection.maxResultsPerSource);
      
      console.log(`Fetched ${topPosts.length} posts from Reddit`);
      return topPosts;
      
    } catch (error) {
      console.error('Error fetching Reddit data:', error.message);
      if (error.response) {
        console.error('API Response:', error.response.status, error.response.data);
      }
      // Return empty array on error
      return [];
    }
    
  } catch (error) {
    console.error('Error fetching Reddit data:', error.message);
    return [];
  }
}

/**
 * Main collection function
 * @returns {Promise<Object>} Collected external data
 */
export async function collectExternalData(date = null) {
  const today = date || getDateString();
  console.log(`Starting external data collection for date: ${today} (today: ${new Date().toISOString()})...`);
  
  try {
    // Fetch TechCrunch feeds first (includes venture feed for funding extraction)
    const techcrunchData = await fetchTechCrunchFeeds();
    
    // Extract funding from TechCrunch Venture feed
    const techcrunchFunding = extractFundingFromVentureArticles(techcrunchData.ventureArticles);
    
    // Try to load internal data to get top categories for dynamic Google Trends keywords
    let topCategories = null;
    try {
      const internalDataPath = path.join(__dirname, '..', 'data', 'internal', `${today}.json`);
      const internalData = JSON.parse(await fs.readFile(internalDataPath, 'utf-8'));
      topCategories = internalData.categories || null;
      if (topCategories) {
        console.log(`Loaded ${topCategories.length} categories from internal data for dynamic Google Trends keywords`);
      }
    } catch (error) {
      // Internal data not available yet, will use static keywords
      console.log('Internal data not available, using static Google Trends keywords');
    }
    
    // Fetch from all other sources in parallel
    const [crunchbaseFunding, launches, hackerNews, rssArticles, trends, reddit] = await Promise.all([
      fetchCrunchbaseFunding(),
      fetchProductHuntLaunches(),
      fetchHackerNewsPosts(),
      fetchRSSArticles(),
      fetchGoogleTrends(topCategories),
      fetchRedditPosts()
    ]);
    
    // Extract funding from RSS sources (Crunchbase News, TechFundingNews, etc.)
    const crunchbaseNewsArticles = rssArticles.filter(article => (article.source || '').toLowerCase().includes('crunchbase'));
    const techFundingNewsArticles = rssArticles.filter(article => (article.source || '').toLowerCase().includes('techfundingnews'));
    const rssFunding = [
      ...extractFundingFromRssArticles(crunchbaseNewsArticles, 'crunchbase-news'),
      ...extractFundingFromRssArticles(techFundingNewsArticles, 'techfundingnews')
    ];

    // Combine funding sources: prioritize Crunchbase API, but include TechCrunch + RSS extracts
    const hasRealCrunchbase = crunchbaseFunding.length > 0 && !(crunchbaseFunding.length === 2 && crunchbaseFunding[0].company === 'FactoryOS');
    let funding;
    if (hasRealCrunchbase) {
      funding = mergeFundingLists(crunchbaseFunding, techcrunchFunding, rssFunding);
    } else if (rssFunding.length) {
      console.log(`Using ${techcrunchFunding.length} TechCrunch deals plus ${rssFunding.length} RSS funding items`);
      funding = mergeFundingLists(techcrunchFunding, rssFunding);
    } else {
      console.log(`Using ${techcrunchFunding.length} funding announcements from TechCrunch Venture feed`);
      funding = techcrunchFunding;
    }
    funding = funding.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Combine all articles (TechCrunch + other RSS feeds)
    const allArticles = [...techcrunchData.articles, ...rssArticles];
    
    const data = {
      date: today,
      funding,
      launches,
      hackerNews,
      articles: allArticles,
      trends,
      reddit,
      metadata: {
        collectedAt: new Date().toISOString(),
        sources: {
          crunchbase: crunchbaseFunding.length,
          techcrunchVenture: techcrunchFunding.length,
          productHunt: launches.length,
          hackerNews: hackerNews.length,
          rss: allArticles.length,
          googleTrends: trends.length,
          reddit: reddit.length
        }
      }
    };
    
    // Save to file
    await saveData(data);
    
    console.log('External data collection completed');
    return data;
    
  } catch (error) {
    console.error('Error collecting external data:', error);
    throw error;
  }
}

/**
 * Save collected data to JSON file
 * @param {Object} data - Data to save
 */
async function saveData(data) {
  try {
    const dataDir = path.join(__dirname, '..', config.paths.external);
    await fs.mkdir(dataDir, { recursive: true });
    
    const filename = path.join(dataDir, `${data.date}.json`);
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    
    console.log(`Saved external data to ${filename}`);
  } catch (error) {
    console.error('Error saving external data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node collectors/external.js 2025-11-18
  const date = process.argv[2] || null;
  collectExternalData(date)
    .then(data => {
      console.log('Collection complete:', JSON.stringify(data, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Collection failed:', error);
      process.exit(1);
    });
}


