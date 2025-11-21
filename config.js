/**
 * Configuration file for Startup Idea Terminal
 * 
 * TODO: Add your API keys and database credentials
 * Consider using environment variables (.env) for production
 */

import dotenv from 'dotenv';
dotenv.config();

export default {
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'startup_ideas',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    // PostgreSQL connection string format:
    // postgresql://user:password@host:port/database
    // Used for Render.com and Docker deployments
    connectionString: process.env.DATABASE_URL || null
  },

  // OpenAI API Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || null, // Will use fallback if null
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: 1000,
    temperature: 0.7,
    enabled: !!process.env.OPENAI_API_KEY // Track if API key is configured
  },

  // Crunchbase API Configuration
  crunchbase: {
    apiKey: process.env.CRUNCHBASE_API_KEY || null,
    baseUrl: 'https://api.crunchbase.com/api/v4',
    enabled: !!process.env.CRUNCHBASE_API_KEY
  },

  // Product Hunt API Configuration
  productHunt: {
    apiKey: process.env.PRODUCT_HUNT_API_KEY || null,
    apiSecret: process.env.PRODUCT_HUNT_API_SECRET || null,
    devToken: process.env.PRODUCT_HUNT_DEV_TOKEN || null,
    baseUrl: 'https://api.producthunt.com/v2/api/graphql',
    tokenUrl: 'https://api.producthunt.com/v2/oauth/token',
    enabled: !!(process.env.PRODUCT_HUNT_DEV_TOKEN || (process.env.PRODUCT_HUNT_API_KEY && process.env.PRODUCT_HUNT_API_SECRET))
  },

  // Hacker News API
  hackerNews: {
    baseUrl: 'https://hacker-news.firebaseio.com/v0'
  },

  // RSS Feeds
  rss: {
    techcrunch: [
      'https://techcrunch.com/feed/',
      'https://techcrunch.com/category/venture/feed/',
      'https://techcrunch.com/category/startups/feed/',
      'https://techcrunch.com/feed/?s=signals'
    ],
    venturebeat: 'https://venturebeat.com/feed/',
    crunchbaseFunding: 'https://news.crunchbase.com/feed/?s=fund',
    techfundingnews: 'https://techfundingnews.com/?s=funding&feed=rss2'
  },

  // Google Trends API (if using unofficial package)
  googleTrends: {
    enabled: true
  },

  // Reddit API Configuration
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID || null,
    clientSecret: process.env.REDDIT_CLIENT_SECRET || null,
    userAgent: 'StartupIdeaTerminal/1.0',
    subreddits: ['startups', 'entrepreneur', 'SaaS'],
    enabled: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
  },

  // Beehiiv API Configuration
  beehiiv: {
    apiKey: process.env.BEEHIIV_API_KEY || null,
    publicationId: process.env.BEEHIIV_PUBLICATION_ID || null,
    baseUrl: 'https://api.beehiiv.com/v2',
    enabled: !!(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID)
  },

  // File Paths
  paths: {
    data: './data',
    internal: './data/internal',
    external: './data/external',
    merged: './data/merged',
    insights: './data/insights',
    output: './output',
    logs: './logs'
  },

  // Crawler Configuration
  crawler: {
    userAgent: 'Mozilla/5.0 (compatible; StartupIdeaTerminal/1.0; +https://startupideaterminal.com)',
    timeout: 30000,
    respectRobotsTxt: true,
    delay: 1000 // Delay between requests in ms
  },

  // Data Collection Settings
  collection: {
    lookbackDays: 365, // How many days of historical data to analyze
    maxResultsPerSource: 50, // Limit results per external source
    clusterThreshold: 5 // Minimum ideas to form a cluster
  },

  // Log File Sources
  logFiles: {
    baseUrl: 'https://validatorai.com/postback',
    overallLog: 'free_tool_log.txt',
    chartData: 'tool_chart.txt',
    dailyLogPattern: 'free_tool_log{YYMMDD}.txt' // e.g., free_tool_log251103.txt
  },

  // Newsletter Settings
  newsletter: {
    title: 'THE STARTUP IDEA TERMINAL',
    author: 'ValidatorAI Team',
    edition: '',
    tagline: 'The only newsletter that shows you what 250,000 founders are building before those companies exist',
    closingNote: `That's it for Pattern Watch. Reply with the cluster that surprised you most — we read every response.`,
    sponsor: {
      name: 'Base44',
      intro: 'Need a landing page to test your idea in 48 hours?',
      pitch: 'Base44 mocks one up in 44 seconds.',
      offer: 'First 100 ValidatorAI readers get $10 credit with code TERMINAL.',
      url: 'https://validatorai.com/click/?a=base44'
    },
    autoPublish: false // Set to true to auto-publish instead of draft
  }
};


