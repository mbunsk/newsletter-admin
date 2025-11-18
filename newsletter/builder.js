/**
 * Newsletter Builder
 *
 * Generates the Pattern Watch HTML newsletter using the daily insights JSON.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { getDateString } from '../utils/dateUtils.js';
import { translateToEnglish } from '../utils/aiSummarizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatLongDate(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  const parts = text
    .split(/\r?\n+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  return parts.map(part => `<p>${part}</p>`).join('');
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0%';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) {
    return 'Undisclosed';
  }
  if (typeof amount === 'number') {
    if (amount >= 1_000_000_000) {
      return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}K`;
    }
    return `$${amount.toLocaleString()}`;
  }
  if (typeof amount === 'string') {
    return amount.startsWith('$') ? amount : `$${amount}`;
  }
  return 'Undisclosed';
}

async function loadInsights(date) {
  try {
    const insightsPath = path.join(__dirname, '..', config.paths.insights, `${date}.json`);
    const content = await fs.readFile(insightsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Insights file not found for ${date}. Please run generateInsights first.`);
  }
}

function buildIdeaFuturesSection(text, categories = []) {
  // Filter and sort movers:
  // 1. Filter out new categories (delta = 1) with very low counts (< 5) - these are noise
  // 2. Sort by a combination of delta and count (weighted score)
  // 3. This ensures we show meaningful trends, not just new categories with 1-2 submissions
  const movers = Array.isArray(categories)
    ? [...categories]
        .filter(cat => {
          if (typeof cat.delta !== 'number') return false;
          const count = cat.count || 0;
          const delta = cat.delta;
          // Filter out new categories (delta = 1) with very low counts
          if (delta === 1 && count < 5) return false;
          return true;
        })
        .sort((a, b) => {
          // Weighted score: delta * 0.7 + normalized_count * 0.3
          // This prioritizes high deltas but also considers volume
          const aCount = a.count || 0;
          const bCount = b.count || 0;
          const maxCount = Math.max(...categories.map(c => c.count || 0), 1);
          const aScore = (a.delta || 0) * 0.7 + (aCount / maxCount) * 0.3;
          const bScore = (b.delta || 0) * 0.7 + (bCount / maxCount) * 0.3;
          return bScore - aScore;
        })
        .slice(0, 5)
    : [];

  const totalIdeas = Array.isArray(categories)
    ? categories.reduce((sum, cat) => sum + (cat.count || 0), 0)
    : 0;

  // Calculate market share percentages (what % of total ideas each category represents)
  // This ensures percentages add up to 100% when viewing all categories
  const moverRows = movers
    .map(cat => {
      const delta = cat.delta || 0;
      const deltaPercent = Math.round(delta * 100);
      const count = cat.count || 0;
      
      // Calculate market share (percentage of total ideas) - for reference only
      const marketShare = totalIdeas > 0 ? (count / totalIdeas) * 100 : 0;
      const marketSharePercent = Math.round(marketShare);
      
      // Create text-based bar chart (13 characters total)
      // Bars represent WoW change percentage (scaled to fit 0-100% range)
      const barLength = 13;
      let filledBlocks = 0;
      
      // Scale bars based on WoW change percentage
      // Normalize delta to 0-100% range for visualization
      // For positive deltas: scale 0-200% to 0-13 blocks (capping at 200% = full bar)
      // For negative deltas: show as empty bar
      if (deltaPercent > 0) {
        // Scale: 0% = 0 blocks, 100% = 13 blocks, 200%+ = 13 blocks (capped)
        // This makes the bar length proportional to the growth rate
        const normalizedDelta = Math.min(deltaPercent, 200); // Cap at 200% for visualization
        filledBlocks = Math.round((normalizedDelta / 200) * barLength);
        // Ensure at least 1 block if there's any positive growth
        filledBlocks = Math.max(1, Math.min(barLength, filledBlocks));
      } else if (deltaPercent < 0) {
        // For negative growth, show a small bar proportional to the decline
        // Scale: -100% = 0 blocks, 0% = 13 blocks
        const normalizedDelta = Math.max(deltaPercent, -100); // Cap at -100%
        filledBlocks = Math.round(((100 + normalizedDelta) / 100) * barLength);
        filledBlocks = Math.max(0, Math.min(barLength, filledBlocks));
      } else {
        // Zero change: show minimal bar
        filledBlocks = 1;
      }
      
      const emptyBlocks = barLength - filledBlocks;
      const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
      
      // Show WoW change percentage in the label (this is the growth rate, not market share)
      // For new categories (delta = 1), show "NEW" if count is low, otherwise show the percentage
      let deltaLabel;
      if (delta === 1 && count < 10) {
        // Very new category with low count - show as "NEW"
        deltaLabel = 'NEW';
      } else {
        // Normal percentage display (WoW change)
        deltaLabel = `${deltaPercent >= 0 ? '+' : ''}${deltaPercent}%`;
      }
      
      const icon = deltaPercent >= 25 ? '🔥' : deltaPercent <= -15 ? '❄️' : '';
      
      // Format: Category name (padded), bar (market share), percentage (WoW change), icon
      const categoryName = (cat.name || 'Unknown').padEnd(20, ' ');
      
      return `
        <div class="mover-text-row">
          <span class="mover-category">${categoryName}</span>
          <span class="mover-bar-text">${bar}</span>
          <span class="mover-percent">${deltaLabel}</span>
          ${icon ? `<span class="mover-icon-text">${icon}</span>` : ''}
        </div>
      `;
    })
    .join('');

  const volumeNote = totalIdeas > 0
    ? `<div class="metric-note">VOLUME: ${totalIdeas.toLocaleString()} new ideas submitted${movers.length > 0 ? ` (↑ ${Math.round(((movers[0]?.delta || 0) * 100))}% vs last period)` : ''}</div>`
    : '';

  const summary = text ? formatParagraphs(text) : '<p>No trend commentary available.</p>';

  return `
    <section class="section">
      <h2><span>📊</span> IDEA FUTURES INDEX</h2>
      ${movers.length ? `<div style="margin-bottom: 16px;"><strong>24HR MOVERS:</strong></div><div class="mover-text-list">${moverRows}</div>` : ''}
      ${volumeNote}
      ${summary}
    </section>
  `;
}

function buildClusteringSection(text, clusters = [], weekday = null) {
  // Determine title based on weekday
  let title = 'THE CLUSTERING REPORT';
  let icon = '🎯';
  
  if (weekday && weekday.toLowerCase() === 'monday') {
    title = 'ONE MAJOR CLUSTER';
    icon = '🔍';
    // For Monday, show only the first cluster (ONE major cluster)
    clusters = Array.isArray(clusters) ? clusters.slice(0, 1) : [];
  } else if (weekday && weekday.toLowerCase() === 'tuesday') {
    title = 'TOP 3 NEW CLUSTERS';
    icon = '🆕';
    // For Tuesday, show top 3 new clusters
    clusters = Array.isArray(clusters) ? clusters.slice(0, 3) : [];
  } else if (weekday && weekday.toLowerCase() === 'wednesday') {
    title = 'DEEP CLUSTERING REPORT';
    icon = '🎯';
    // For Wednesday, show all clusters (deep report)
    clusters = Array.isArray(clusters) ? clusters : [];
  } else {
    // Default: show up to 3 clusters
    clusters = Array.isArray(clusters) ? clusters.slice(0, 3) : [];
  }
  
  const cards = Array.isArray(clusters)
    ? clusters.map((cluster, index) => {
        const wowPercent = Math.round((cluster.wow || 0) * 100);
        const wowLabel = `${wowPercent >= 0 ? '+' : ''}${wowPercent}% WoW`;
        const countLabel = cluster.count ? cluster.count.toLocaleString() : 0;
        return `
          <div class="cluster-card">
            <h3>CLUSTER #${index + 1}: ${cluster.name}</h3>
            <div class="cluster-details">n=${countLabel} submissions · ${wowLabel}</div>
          </div>
        `;
      }).join('')
    : '';

  const summary = text ? formatParagraphs(text) : '';

  return `
    <section class="section">
      <h2><span>${icon}</span> ${title}</h2>
      ${summary || '<p>No cluster insights available today.</p>'}
      ${cards}
    </section>
  `;
}

function buildTrendsSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No micro-trends detected.</p>';
  return `
    <section class="section">
      <h2><span>📊</span> MICRO-TRENDS</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildValidationSection(text, validation = {}) {
  const tilesData = [
    { label: 'MVP Ready', value: validation.mvp },
    { label: 'Paying Customers', value: validation.paying },
    { label: 'Launched', value: validation.launched }
  ];

  const tiles = tilesData
    .filter(tile => typeof tile.value === 'number')
    .map(tile => `
      <div class="validation-tile">
        <div class="label">${tile.label}</div>
        <div class="value">${formatPercent(tile.value)}</div>
      </div>
    `)
    .join('');

  const summary = text ? formatParagraphs(text) : '';

  return `
    <section class="section">
      <h2><span>🔬</span> VALIDATION REALITY CHECK</h2>
      ${tiles ? `<div class="validation-grid">${tiles}</div>` : ''}
      ${summary || '<p>No validation metrics available.</p>'}
    </section>
  `;
}

function buildDealRadarSection(text, funding = []) {
  const deals = Array.isArray(funding) ? funding.slice(0, 3) : [];

  const cards = deals.map(deal => {
    const amount = formatAmount(deal.amount);
    const category = deal.category ? deal.category : 'General';
    const source = deal.source ? deal.source : '';
    return `
      <div class="deal-card">
        <h3>🔹 ${deal.company} <span>${amount}</span></h3>
        <p>${category}${source ? ` · Source: ${source}` : ''}</p>
      </div>
    `;
  }).join('');

  const summary = text ? formatParagraphs(text) : '';

  return `
    <section class="section">
      <h2><span>💰</span> DEAL RADAR: WHAT MONEY IS CHASING</h2>
      ${summary || '<p>No funding signal captured today.</p>'}
      ${cards || '<div class="note-card"><p>No deals recorded for this window.</p></div>'}
    </section>
  `;
}

function buildExperimentSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No experiment results to share today.</p>';
  return `
    <section class="section">
      <h2><span>🧪</span> THE WEDNESDAY EXPERIMENT</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildFounderFieldNoteSection(text) {
  if (!text) {
    return '';
  }
  return `
    <section class="section">
      <h2><span>🎓</span> FOUNDER FIELD NOTE</h2>
      <blockquote>${formatParagraphs(text)}</blockquote>
    </section>
  `;
}

function buildTomorrowQuestionSection(text) {
  if (!text) {
    return '';
  }
  return `
    <section class="section">
      <h2><span>🔮</span> TOMORROW'S QUESTION</h2>
      <div class="note-card">
        ${formatParagraphs(text)}
      </div>
    </section>
  `;
}

function buildOneThingSection(text) {
  const content = text
    ? formatParagraphs(text)
    : '<p>Take 30 minutes to list 50 prospects who feel the pain you’re solving. Need help? Reply and we’ll nudge you.</p>';
  return `
    <section class="section">
      <h2><span>🎯</span> ONE THING TO DO TODAY</h2>
      <div class="cta-card">
        ${content}
      </div>
    </section>
  `;
}

function buildClosingSection(text) {
  if (!text) {
    return '';
  }
  return `
    <section class="section">
      <div class="note-card">
        ${formatParagraphs(text)}
      </div>
    </section>
  `;
}

function buildSponsorSection(sponsor) {
  if (!sponsor || Object.values(sponsor).every(value => !value)) {
    return '';
  }

  const lines = [
    sponsor.name ? `<strong>${sponsor.name}</strong>` : null,
    sponsor.intro || null,
    sponsor.pitch || null,
    sponsor.offer || null
  ]
    .filter(Boolean)
    .map(line => `<p>${line}</p>`)
    .join('');

  const link = sponsor.url
    ? `<p><a href="${sponsor.url}" style="color:#78350f; font-weight:600; text-decoration:none;">Learn more →</a></p>`
    : '';

  return `
    <section class="section">
      <h2><span>💡</span> SPONSORED</h2>
      <div class="sponsor-card">
        ${lines}
        ${link}
      </div>
    </section>
  `;
}

// Monday-specific sections
function buildWeekendSpikesSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No weekend activity spikes detected.</p>';
  return `
    <section class="section">
      <h2><span>📈</span> WEEKEND SPIKES</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildWeeklyWatchlistSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No watchlist items this week.</p>';
  return `
    <section class="section">
      <h2><span>👀</span> THIS WEEK'S WATCHLIST</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

// Tuesday-specific sections
function buildProblemHeatmapSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No customer pain analysis available.</p>';
  return `
    <section class="section">
      <h2><span>🔥</span> CUSTOMER PAIN ANALYSIS</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildOpportunitiesInGapsSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No opportunity gaps identified.</p>';
  return `
    <section class="section">
      <h2><span>🔍</span> OPPORTUNITIES IN THE GAPS</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildEarlyMarketSignalsSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No early market signals detected.</p>';
  return `
    <section class="section">
      <h2><span>📡</span> EARLY MARKET SIGNALS</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

// Thursday-specific sections
function buildWhyIdeasFailSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No failure analysis available.</p>';
  return `
    <section class="section">
      <h2><span>❌</span> WHY IDEAS FAIL</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildExecutionGapsSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No execution gap analysis available.</p>';
  return `
    <section class="section">
      <h2><span>⚡</span> EXECUTION GAPS</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildMonthlyProgressSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No monthly progress data available.</p>';
  return `
    <section class="section">
      <h2><span>📊</span> MONTHLY PROGRESS SNAPSHOT</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildAntiHypeSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No anti-hype analysis available.</p>';
  return `
    <section class="section">
      <h2><span>🚫</span> MARKETS TO AVOID</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildCategoryTeardownSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No category deep dive available.</p>';
  return `
    <section class="section">
      <h2><span>🔍</span> CATEGORY DEEP DIVE</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

// Friday-specific sections
function buildWeeklyTop10Section(text) {
  const content = text ? formatParagraphs(text) : '<p>No top ideas available.</p>';
  return `
    <section class="section">
      <h2><span>🏆</span> TOP 10 IDEAS OF THE WEEK</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildClusterOfWeekSection(text, clusters = []) {
  const content = text ? formatParagraphs(text) : '<p>No cluster of the week selected.</p>';
  const topCluster = clusters[0];
  const clusterInfo = topCluster ? `<div class="cluster-card"><h3>${topCluster.name}</h3><div class="cluster-details">n=${topCluster.count} submissions</div></div>` : '';
  return `
    <section class="section">
      <h2><span>⭐</span> CLUSTER OF THE WEEK</h2>
      ${clusterInfo}
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildFounderOfWeekSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No founder of the week selected.</p>';
  return `
    <section class="section">
      <h2><span>👤</span> FOUNDER OF THE WEEK</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildHighConfidenceSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No high-confidence opportunities identified.</p>';
  return `
    <section class="section">
      <h2><span>🎯</span> HIGH-CONFIDENCE OPPORTUNITIES</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildWeekendChallengeSection(text) {
  const content = text ? formatParagraphs(text) : '<p>No weekend challenge this week.</p>';
  return `
    <section class="section">
      <h2><span>🏁</span> THE WEEKEND CHALLENGE</h2>
      <div class="cta-card">
        ${content}
      </div>
    </section>
  `;
}

function buildMondayPreviewSection(text) {
  const content = text ? formatParagraphs(text) : '<p>Preview coming soon.</p>';
  return `
    <section class="section">
      <h2><span>🔮</span> PREVIEW OF MONDAY</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function getSectionOrderForWeekday(weekday = '') {
  const day = weekday.toLowerCase();
  const orders = {
    monday: ['idea_futures', 'weekend_spikes', 'weekly_watchlist', 'clustering', 'trends', 'one_thing_today'],
    tuesday: ['idea_futures', 'clustering', 'problem_heatmap', 'opportunities_in_gaps', 'early_market_signals', 'deal_radar', 'one_thing_today'],
    wednesday: ['idea_futures', 'clustering', 'validation', 'deal_radar', 'wednesday_experiment', 'founder_field_note', 'tomorrows_question', 'one_thing_today'],
    thursday: ['idea_futures', 'why_ideas_fail', 'execution_gaps', 'monthly_progress', 'anti_hype_section', 'category_teardown', 'one_thing_today', 'tomorrows_question'],
    friday: ['idea_futures', 'weekly_top_10_ideas', 'cluster_of_the_week', 'founder_of_the_week', 'deal_radar', 'high_confidence_opportunities', 'weekend_challenge', 'monday_preview'],
    default: ['idea_futures', 'clustering', 'validation', 'deal_radar', 'one_thing_today']
  };
  return orders[day] || orders.default;
}

async function translateBlock(text) {
  if (!text) {
    return '';
  }
  try {
    return await translateToEnglish(text);
  } catch (error) {
    return text;
  }
}

async function fillTemplate(template, insights, targetDate = null) {
  // Use targetDate if provided, otherwise use insights.date, otherwise use today
  const date = targetDate || insights.date || getDateString();
  console.log(`fillTemplate using date: ${date} (targetDate: ${targetDate}, insights.date: ${insights.date})`);
  const formattedDate = formatLongDate(date);
  const edition = config.newsletter.edition || 'Daily Edition';
  const extendedDate = `${formattedDate} | ${edition}`;

  // Get weekday from date
  const dateObj = new Date(date + 'T00:00:00');
  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

  const summaryBlocks = insights.summary_blocks || {};
  const rawData = insights.raw_data || {};
  const internalData = rawData.internal || {};

  const categories = rawData.categories || internalData.categories || [];
  const clusters = internalData.clusters || rawData.clusters || [];
  const validation = internalData.validation || rawData.validation || {};
  const funding = rawData.funding || [];

  // Only build sections that have content (weekday-based generation)
  const ideaSection = summaryBlocks.idea_futures ? buildIdeaFuturesSection(await translateBlock(summaryBlocks.idea_futures), categories) : '';
  
  // Clustering section: Only show on Monday (as "ONE MAJOR CLUSTER"), Tuesday (as "TOP 3 NEW CLUSTERS"), or Wednesday (as "DEEP CLUSTERING REPORT")
  // Monday should show clustering, but NOT as "THE CLUSTERING REPORT"
  let clusteringSection = '';
  if (summaryBlocks.clustering) {
    if (weekday.toLowerCase() === 'monday' || weekday.toLowerCase() === 'tuesday' || weekday.toLowerCase() === 'wednesday') {
      clusteringSection = buildClusteringSection(await translateBlock(summaryBlocks.clustering), clusters, weekday);
    }
  }
  
  const validationSection = summaryBlocks.validation ? buildValidationSection(await translateBlock(summaryBlocks.validation), validation) : '';
  const dealRadarSection = summaryBlocks.deal_radar ? buildDealRadarSection(await translateBlock(summaryBlocks.deal_radar), funding) : '';
  const experimentSection = summaryBlocks.wednesday_experiment ? buildExperimentSection(await translateBlock(summaryBlocks.wednesday_experiment)) : '';
  const founderSection = summaryBlocks.founder_field_note ? buildFounderFieldNoteSection(await translateBlock(summaryBlocks.founder_field_note)) : '';
  const tomorrowSection = summaryBlocks.tomorrows_question ? buildTomorrowQuestionSection(await translateBlock(summaryBlocks.tomorrows_question)) : '';
  const oneThingSection = summaryBlocks.one_thing_today ? buildOneThingSection(await translateBlock(summaryBlocks.one_thing_today)) : '';
  
  // Monday-specific sections
  const weekendSpikesSection = summaryBlocks.weekend_spikes ? buildWeekendSpikesSection(await translateBlock(summaryBlocks.weekend_spikes)) : '';
  const weeklyWatchlistSection = summaryBlocks.weekly_watchlist ? buildWeeklyWatchlistSection(await translateBlock(summaryBlocks.weekly_watchlist)) : '';
  const trendsSection = summaryBlocks.trends ? buildTrendsSection(await translateBlock(summaryBlocks.trends)) : '';
  
  // Tuesday-specific sections
  const problemHeatmapSection = summaryBlocks.problem_heatmap ? buildProblemHeatmapSection(await translateBlock(summaryBlocks.problem_heatmap)) : '';
  const opportunitiesInGapsSection = summaryBlocks.opportunities_in_gaps ? buildOpportunitiesInGapsSection(await translateBlock(summaryBlocks.opportunities_in_gaps)) : '';
  const earlyMarketSignalsSection = summaryBlocks.early_market_signals ? buildEarlyMarketSignalsSection(await translateBlock(summaryBlocks.early_market_signals)) : '';
  
  // Thursday-specific sections
  const whyIdeasFailSection = summaryBlocks.why_ideas_fail ? buildWhyIdeasFailSection(await translateBlock(summaryBlocks.why_ideas_fail)) : '';
  const executionGapsSection = summaryBlocks.execution_gaps ? buildExecutionGapsSection(await translateBlock(summaryBlocks.execution_gaps)) : '';
  const monthlyProgressSection = summaryBlocks.monthly_progress ? buildMonthlyProgressSection(await translateBlock(summaryBlocks.monthly_progress)) : '';
  const antiHypeSection = summaryBlocks.anti_hype_section ? buildAntiHypeSection(await translateBlock(summaryBlocks.anti_hype_section)) : '';
  const categoryTeardownSection = summaryBlocks.category_teardown ? buildCategoryTeardownSection(await translateBlock(summaryBlocks.category_teardown)) : '';
  
  // Friday-specific sections
  const weeklyTop10Section = summaryBlocks.weekly_top_10_ideas ? buildWeeklyTop10Section(await translateBlock(summaryBlocks.weekly_top_10_ideas)) : '';
  const clusterOfWeekSection = summaryBlocks.cluster_of_the_week ? buildClusterOfWeekSection(await translateBlock(summaryBlocks.cluster_of_the_week), clusters) : '';
  const founderOfWeekSection = summaryBlocks.founder_of_the_week ? buildFounderOfWeekSection(await translateBlock(summaryBlocks.founder_of_the_week)) : '';
  const highConfidenceSection = summaryBlocks.high_confidence_opportunities ? buildHighConfidenceSection(await translateBlock(summaryBlocks.high_confidence_opportunities)) : '';
  const weekendChallengeSection = summaryBlocks.weekend_challenge ? buildWeekendChallengeSection(await translateBlock(summaryBlocks.weekend_challenge)) : '';
  const mondayPreviewSection = summaryBlocks.monday_preview ? buildMondayPreviewSection(await translateBlock(summaryBlocks.monday_preview)) : '';

  const sectionsMap = {
    idea_futures: ideaSection,
    weekend_spikes: weekendSpikesSection,
    weekly_watchlist: weeklyWatchlistSection,
    clustering: clusteringSection,
    problem_heatmap: problemHeatmapSection,
    opportunities_in_gaps: opportunitiesInGapsSection,
    early_market_signals: earlyMarketSignalsSection,
    trends: trendsSection,
    validation: validationSection,
    deal_radar: dealRadarSection,
    wednesday_experiment: experimentSection,
    founder_field_note: founderSection,
    tomorrows_question: tomorrowSection,
    why_ideas_fail: whyIdeasFailSection,
    execution_gaps: executionGapsSection,
    monthly_progress: monthlyProgressSection,
    anti_hype_section: antiHypeSection,
    category_teardown: categoryTeardownSection,
    weekly_top_10_ideas: weeklyTop10Section,
    cluster_of_the_week: clusterOfWeekSection,
    founder_of_the_week: founderOfWeekSection,
    high_confidence_opportunities: highConfidenceSection,
    weekend_challenge: weekendChallengeSection,
    monday_preview: mondayPreviewSection,
    one_thing_today: oneThingSection
  };

  const sectionOrder = getSectionOrderForWeekday(weekday);
  let mainSections = sectionOrder
    .map(key => sectionsMap[key])
    .filter(Boolean)
    .join('\n');

  if (!mainSections) {
    mainSections = Object.values(sectionsMap)
      .filter(Boolean)
      .join('\n');
  }

  const closingSection = buildClosingSection(config.newsletter.closingNote);
  const sponsorSection = buildSponsorSection(config.newsletter.sponsor);

  const footerNote = config.newsletter.footerNote || 'Validate your idea in 60 seconds →';

  return template
    .replace(/\{\{newsletter_title\}\}/g, config.newsletter.title)
    .replace(/\{\{extended_date\}\}/g, extendedDate)
    .replace(/\{\{tagline\}\}/g, config.newsletter.tagline || '')
    .replace(/\{\{main_sections\}\}/g, mainSections || '<p>No sections available for today.</p>')
    .replace(/\{\{closing_section\}\}/g, closingSection)
    .replace(/\{\{sponsor_section\}\}/g, sponsorSection)
    .replace(/\{\{footer_note\}\}/g, footerNote);
}

export async function buildNewsletter(date = null) {
  const targetDate = date || getDateString();
  console.log(`Building newsletter for date: ${targetDate} (today: ${new Date().toISOString()})...`);

  try {

    const templatePath = path.join(__dirname, 'template.html');
    const template = await fs.readFile(templatePath, 'utf-8');

    const insights = await loadInsights(targetDate);
    // Ensure we always use the targetDate, not the date from the insights file
    insights.date = targetDate;
    const html = await fillTemplate(template, insights, targetDate);

    const outputDir = path.join(__dirname, '..', config.paths.output);
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${targetDate}.html`);
    await fs.writeFile(outputPath, html);

    console.log(`Newsletter built: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error building newsletter:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node newsletter/builder.js 2025-11-18
  const date = process.argv[2] || null;
  buildNewsletter(date)
    .then(builtPath => {
      console.log(`Newsletter generated at: ${builtPath}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Newsletter build failed:', error);
      process.exit(1);
    });
}
