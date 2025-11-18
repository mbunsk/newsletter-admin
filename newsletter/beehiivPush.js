/**
 * Beehiiv API Integration
 * 
 * Pushes newsletter to Beehiiv as draft or published
 */

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { getDateString } from '../utils/dateUtils.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get Beehiiv API headers
 * @returns {Object} Headers object
 */
function getHeaders() {
  return {
    'Authorization': `Bearer ${config.beehiiv.apiKey}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Read HTML newsletter file
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<string>} HTML content
 */
async function readNewsletterHtml(date) {
  const newsletterPath = path.join(__dirname, '..', config.paths.output, `${date}.html`);
  return await fs.readFile(newsletterPath, 'utf-8');
}

/**
 * Create a post in Beehiiv
 * @param {string} htmlContent - HTML content of newsletter
 * @param {string} date - Date string
 * @returns {Promise<Object>} Created post data
 */
async function createPost(htmlContent, date) {
  try {
    const url = `${config.beehiiv.baseUrl}/publications/${config.beehiiv.publicationId}/posts`;
    
    const payload = {
      title: `${config.newsletter.title} - ${date}`,
      content_html: htmlContent,
      status: config.newsletter.autoPublish ? 'published' : 'draft',
      // TODO: Add more fields as needed (tags, scheduled_at, etc.)
    };
    
    const response = await axios.post(url, payload, {
      headers: getHeaders()
    });
    
    return response.data;
    
  } catch (error) {
    if (error.response) {
      console.error('Beehiiv API Error:', error.response.data);
      throw new Error(`Beehiiv API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Update an existing post in Beehiiv
 * @param {string} postId - Post ID
 * @param {string} htmlContent - HTML content
 * @param {string} date - Date string
 * @returns {Promise<Object>} Updated post data
 */
async function updatePost(postId, htmlContent, date) {
  try {
    const url = `${config.beehiiv.baseUrl}/publications/${config.beehiiv.publicationId}/posts/${postId}`;
    
    const payload = {
      title: `${config.newsletter.title} - ${date}`,
      content_html: htmlContent
    };
    
    const response = await axios.patch(url, payload, {
      headers: getHeaders()
    });
    
    return response.data;
    
  } catch (error) {
    if (error.response) {
      console.error('Beehiiv API Error:', error.response.data);
      throw new Error(`Beehiiv API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Get list of posts from Beehiiv
 * @param {number} limit - Number of posts to retrieve
 * @returns {Promise<Array>} Array of posts
 */
async function getPosts(limit = 10) {
  try {
    const url = `${config.beehiiv.baseUrl}/publications/${config.beehiiv.publicationId}/posts`;
    
    const response = await axios.get(url, {
      headers: getHeaders(),
      params: { limit }
    });
    
    return response.data.data || [];
    
  } catch (error) {
    if (error.response) {
      console.error('Beehiiv API Error:', error.response.data);
      throw new Error(`Beehiiv API error: ${error.response.status}`);
    }
    throw error;
  }
}

/**
 * Push newsletter to Beehiiv
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @param {boolean} updateIfExists - Update existing post if found
 * @returns {Promise<Object>} Beehiiv post data
 */
export async function pushToBeehiiv(date = null, updateIfExists = false) {
  const targetDate = date || getDateString();
  
  try {
    console.log(`Pushing newsletter to Beehiiv for ${targetDate}...`);
    
    // Check if API key is configured
    if (!config.beehiiv.enabled || !config.beehiiv.apiKey || !config.beehiiv.publicationId) {
      console.warn('Beehiiv API not configured. Skipping push to Beehiiv.');
      return {
        skipped: true,
        message: 'Beehiiv API not configured. Newsletter saved locally only.',
        date: targetDate
      };
    }
    
    // Read newsletter HTML
    const htmlContent = await readNewsletterHtml(targetDate);
    
    // Check if post already exists
    if (updateIfExists) {
      const posts = await getPosts(50);
      const existingPost = posts.find(post => 
        post.title && post.title.includes(targetDate)
      );
      
      if (existingPost) {
        console.log(`Updating existing post: ${existingPost.id}`);
        return await updatePost(existingPost.id, htmlContent, targetDate);
      }
    }
    
    // Create new post
    const result = await createPost(htmlContent, targetDate);
    
    console.log(`Newsletter pushed to Beehiiv: ${result.id || 'Success'}`);
    return result;
    
  } catch (error) {
    console.error('Error pushing to Beehiiv:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  pushToBeehiiv()
    .then(result => {
      console.log('Beehiiv push successful:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Beehiiv push failed:', error);
      process.exit(1);
    });
}


