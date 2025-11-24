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

function hideEmails(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email hidden]');
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0%';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatChangePercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0%';
  }
  const percent = Math.round(value * 100);
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent}%`;
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
  const hasClusters = Array.isArray(clusters) && clusters.length > 0;
  
  // Generate data-driven fallback when clusters exist but no AI text
  let fallbackText = '';
  if (!summary && hasClusters) {
    const topCluster = clusters[0];
    const wowPercent = Math.round((topCluster.wow || 0) * 100);
    const wowLabel = `${wowPercent >= 0 ? '+' : ''}${wowPercent}%`;
    fallbackText = `<p><strong>${topCluster.name}</strong> leads with ${topCluster.count} submissions (${wowLabel} WoW). ${clusters.length > 1 ? `Followed by ${clusters.slice(1, 3).map(c => c.name).join(' and ')}.` : ''}</p>`;
  } else if (!summary && !hasClusters) {
    fallbackText = '<p>No cluster insights available today.</p>';
  }

  return `
    <section class="section">
      <h2><span>${icon}</span> ${title}</h2>
      ${summary || fallbackText}
      ${cards}
    </section>
  `;
}

function buildTrendsSection(text, trends = [], reddit = []) {
  const summary = text ? formatParagraphs(text) : '';

  const trendItems = Array.isArray(trends)
    ? trends.slice(0, 4).map(trend => {
        const keyword = trend.keyword || 'Unknown trend';
        const change = formatChangePercent(trend.interest_change || 0);
        return `<li><strong>${keyword}</strong> · ${change} search interest</li>`;
      })
    : [];

  const redditItems = Array.isArray(reddit)
    ? reddit.slice(0, 3).map(post => {
        const title = post.title || post.url || 'Reddit discussion';
        const subreddit = post.subreddit ? `r/${post.subreddit}` : 'Reddit';
        return `<li>${subreddit}: ${title}</li>`;
      })
    : [];

  const fallback = summary || trendItems.length || redditItems.length
    ? ''
    : '<p>No micro-trends detected. Need Google Trends or Reddit signals.</p>';

  const listHtml = trendItems.length || redditItems.length
    ? `<ul class="signal-list">${[...trendItems, ...redditItems].join('')}</ul>`
    : '';

  return `
    <section class="section">
      <h2><span>📊</span> MICRO-TRENDS</h2>
      <div class="note-card">
        ${summary || ''}
        ${listHtml}
        ${fallback}
      </div>
    </section>
  `;
}

function buildValidationSection(text, validation = {}, totalIdeas = 0, lookbackDays = 365, base44 = {}, last7DaysIdeaCount = null) {
  // Use last 7 days period for all metrics
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const monthsAgo = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const periodLabel = `the last 7 days`;

  // Calculate ideas from last 7 days
  // Formula: ideas in last 7 days = totalIdeas * 7 / lookbackDays
  const last7DaysIdeas = typeof last7DaysIdeaCount === 'number'
    ? last7DaysIdeaCount
    : (lookbackDays >= 7 && totalIdeas > 0
      ? Math.round(totalIdeas * 7 / lookbackDays)
      : totalIdeas);

  // Calculate percentages
  const mvpPct = (validation.mvp || 0) * 100;
  const payingPct = (validation.paying || 0) * 100;
  const launchedPct = (validation.launched || 0) * 100;
  const mrrPct = (validation.mrr || 0) * 100;
  const landingPct = (validation.landing || 0) * 100;

  // Calculate Base44 click rate (percentage of ideas that got Base44 clicks)
  // Note: Base44 clicks are only available for last 3 days, but we calculate rate against 7-day period
  const base44Clicks = base44.totalClicks || 0;
  const base44ClickRateForPeriod = last7DaysIdeas > 0
    ? (base44Clicks / last7DaysIdeas) * 100
    : 0;

  // Calculate breakdown
  const mvpReadyPct = base44ClickRateForPeriod;
  const mvpReadyCount = last7DaysIdeas > 0 ? Math.round((mvpReadyPct / 100) * last7DaysIdeas) : 0;
  const noMvpPct = Math.max(0, 100 - mvpReadyPct);
  const landingNeedCount = last7DaysIdeas > 0 ? Math.round((landingPct / 100) * last7DaysIdeas) : 0;
  const landingButNoFunctionalityPct = Math.max(0, launchedPct - mvpPct);
  const workingProductPct = mvpPct;
  const payingCustomersPct = payingPct;
  
  // Calculate $1K+ MRR (assuming it's roughly 7% of paying customers)
  // This is an estimate - adjust based on actual data if available
  const highMrrPct = payingCustomersPct > 0 ? Math.max(0, (payingCustomersPct * 0.07)) : 0;
  const highMrrCount = last7DaysIdeas > 0 ? Math.round((last7DaysIdeas * highMrrPct) / 100) : 0;
  const highMrrPctFormatted = highMrrPct > 0 ? highMrrPct.toFixed(1).replace(/\.0$/, '') : '0';

  // Format numbers
  const formatPct = (val) => val.toFixed(1).replace(/\.0$/, '');
  const formatCount = (val) => val.toLocaleString();

  const summary = text ? formatParagraphs(text) : '';

  const realityCheck = last7DaysIdeas > 0 ? `
    <div class="note-card">
      <p><strong>This week's hard truth:</strong></p>
      <p>Of the ${formatCount(last7DaysIdeas)} ideas submitted in ${periodLabel}:</p>
      <ul class="validation-list" style="margin: 16px 0; padding-left: 24px; list-style: none;">
        <li style="margin: 8px 0;">${formatPct(noMvpPct)}% still have no MVP</li>
        <li style="margin: 8px 0;">${formatPct(mvpReadyPct)}% have progressed to MVP stage (Base44 clicks: ${formatCount(mvpReadyCount)} engaged)</li>
        <li style="margin: 8px 0;">${formatPct(landingPct)}% still need a landing page (${formatCount(landingNeedCount)} founders flagged website_need)</li>
      </ul>
    </div>
  ` : '<p>No validation metrics available.</p>';

  return `
    <section class="section">
      <h2><span>🔬</span> VALIDATION REALITY CHECK</h2>
      ${realityCheck}
      ${summary}
    </section>
  `;
}

function buildDealRadarSection(text, funding = []) {
  const deals = Array.isArray(funding) ? funding.slice(0, 3) : [];

  const cards = deals.map(deal => {
    const amount = formatAmount(deal.amount);
    const category = deal.category ? deal.category : 'General';
    const source = deal.source ? deal.source : '';
    const title = deal.title ? deal.title : '';
    return `
      <div class="deal-card">
        <h3>🔹 ${deal.company} <span>${amount}</span></h3>
        <p>${title}<br>${category}${source ? ` · Source: ${source}` : ''}</p>
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

function buildExperimentSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const totalIdeas = data.totalIdeas || 0;
  const mvpPct = formatPercent(data.validation?.mvp || 0);
  const fallback = `<p>${totalIdeas.toLocaleString()} ideas logged in the last cycle; only ${mvpPct} progressed to MVP. Execution still lags idea volume.</p>`;
  const content = summary || fallback;
  return `
    <section class="section">
      <h2><span>🧪</span> THE WEDNESDAY EXPERIMENT</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildFounderFieldNoteSection(text, problems = []) {
  let content = '';
  if (text) {
    content = `<blockquote>${formatParagraphs(text)}</blockquote>`;
  } else if (Array.isArray(problems) && problems.length > 0) {
    const topProblem = problems[0];
    content = `<blockquote><p><strong>What founders are actually saying:</strong> ${topProblem.problem || 'Top recurring problem'} (${topProblem.count || 0} mentions). Ship something that solves this in the next 72 hours.</p></blockquote>`;
  } else {
    content = '<p>No founder note available. Need problem_heatmap data.</p>';
  }
  return `
    <section class="section">
      <h2><span>🎓</span> FOUNDER FIELD NOTE</h2>
      ${content}
    </section>
  `;
}

function buildTomorrowQuestionSection(text, trends = []) {
  let content = '';
  if (text) {
    content = formatParagraphs(text);
  } else if (Array.isArray(trends) && trends.length > 0) {
    const trend = trends[0];
    content = `<p>Tomorrow we dig into: <strong>${trend.keyword || 'next emerging signal'}</strong> (${formatChangePercent(trend.interest_change || 0)} search interest). Are founders missing this shift?</p>`;
  } else {
    content = '<p>Tomorrow’s investigative thread queued once we receive fresh trend data.</p>';
  }
  return `
    <section class="section">
      <h2><span>🔮</span> TOMORROW'S QUESTION</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
}

function buildOneThingSection(text, categories = []) {
  let content = '';
  if (text) {
    content = formatParagraphs(text);
  } else if (Array.isArray(categories) && categories.length > 0) {
    // Use top category for fallback
    const topCategory = categories[0];
    const categoryName = topCategory.name || 'your niche';
    // Clean up category name (remove parenthetical descriptions)
    const cleanCategoryName = categoryName.split('(')[0].trim();
    content = `<p>Open a sheet and list 50 ${cleanCategoryName} operators who feel the pain you're solving. No paid ads — just people you can DM today.</p>`;
  } else {
    content = '<p>Take 30 minutes to list 50 prospects who feel the pain you\'re solving. Need help? Reply and we\'ll nudge you.</p>';
  }
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
function buildWeekendSpikesSection(text, categories = []) {
  const summary = text ? formatParagraphs(text) : '';
  const spikes = Array.isArray(categories)
    ? categories
        .filter(cat => (cat.delta || 0) > 0.5)
        .slice(0, 4)
        .map(cat => `<li>${cat.name || 'Category'} · ${formatChangePercent(cat.delta || 0)} WoW · ${cat.count || 0} submissions</li>`)
    : [];

  const fallback = summary || spikes.length
    ? ''
    : '<p>No weekend activity spikes detected. Need categories with positive week-over-week delta.</p>';

  return `
    <section class="section">
      <h2><span>📈</span> WEEKEND SPIKES</h2>
      <div class="note-card">
        ${summary || ''}
        ${spikes.length ? `<ul class="signal-list">${spikes.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildWeeklyWatchlistSection(text, categories = [], clusters = []) {
  const summary = text ? formatParagraphs(text) : '';

  const watchlistItems = [];
  if (Array.isArray(categories)) {
    watchlistItems.push(
      ...categories
        .filter(cat => (cat.count || 0) >= 10 && Math.abs(cat.delta || 0) < 0.2)
        .slice(0, 3)
        .map(cat => `<li>${cat.name || 'Category'} · ${cat.count || 0} ideas · steady (${formatChangePercent(cat.delta || 0)})</li>`)
    );
  }
  if (!watchlistItems.length && Array.isArray(clusters)) {
    watchlistItems.push(
      ...clusters.slice(0, 3).map(cluster => `<li>${cluster.name || 'Cluster'} · ${cluster.count || 0} submissions · ${formatChangePercent(cluster.wow || 0)} WoW</li>`)
    );
  }

  const fallback = summary || watchlistItems.length
    ? ''
    : '<p>No watchlist items this week. Need steady-growth categories or clusters.</p>';

  return `
    <section class="section">
      <h2><span>👀</span> THIS WEEK'S WATCHLIST</h2>
      <div class="note-card">
        ${summary || ''}
        ${watchlistItems.length ? `<ul class="signal-list">${watchlistItems.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

// Tuesday-specific sections
function buildProblemHeatmapSection(text, problems = []) {
  const summary = text ? formatParagraphs(text) : '';
  const topProblems = Array.isArray(problems) ? problems.slice(0, 5) : [];

  const cards = topProblems.length
    ? `
      <div class="problem-grid">
        ${topProblems
          .map(problem => {
            const examples = problem.examples && problem.examples.length
              ? `<div class="problem-example">"${problem.examples[0]}"</div>`
              : '';
            const categoryLabel = problem.category ? `<span class="chip">${problem.category}</span>` : '';
            return `
              <div class="problem-card">
                <div class="problem-header">
                  <strong>${problem.problem || 'Unnamed problem'}</strong>
                  ${categoryLabel}
                </div>
                <div class="problem-meta">
                  <span>${problem.count || 0} mentions</span>
                  ${problem.delta !== undefined ? `<span>${(problem.delta * 100).toFixed(0)}% WoW</span>` : ''}
                </div>
                ${examples}
              </div>
            `;
          })
          .join('')}
      </div>
    `
    : '';

  const fallback = summary || cards
    ? ''
    : '<p>No customer pain analysis available. Need recent problem_heatmap data from internal collector.</p>';

  return `
    <section class="section">
      <h2><span>🔥</span> CUSTOMER PAIN ANALYSIS</h2>
      <div class="note-card">
        ${summary || ''}
        ${cards || ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildOpportunitiesInGapsSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const underserved = categories
    .filter(cat => (cat.count || 0) < 10 && (cat.delta || 0) > 0.1)
    .slice(0, 4);

  const cards = underserved.length
    ? `
      <div class="problem-grid">
        ${underserved
          .map(cat => `
            <div class="problem-card">
              <div class="problem-header">
                <strong>${(cat.name || 'Unlabeled category').toUpperCase()}</strong>
              </div>
              <div class="problem-meta">
                <span>${cat.count || 0} ideas</span>
                <span>${formatChangePercent(cat.delta || 0)} WoW</span>
              </div>
              <div class="problem-example">
                Demand is outpacing execution here—high interest but very few builds. Perfect for founders who can ship fast.
              </div>
            </div>
          `)
          .join('')}
      </div>
    `
    : '';

  const fallback = summary || cards
    ? ''
    : '<p>No opportunity gaps identified. Need categories with week-over-week deltas from internal collector.</p>';

  return `
    <section class="section">
      <h2><span>🔍</span> OPPORTUNITIES IN THE GAPS</h2>
      <div class="note-card">
        ${summary || ''}
        ${cards || ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildEarlyMarketSignalsSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const launches = Array.isArray(data.launches) ? data.launches : [];
  const funding = Array.isArray(data.funding) ? data.funding : [];
  const trends = Array.isArray(data.trends) ? data.trends : [];
  const reddit = Array.isArray(data.reddit) ? data.reddit : [];

  const signals = [];

  const movers = categories
    .filter(cat => (cat.delta || 0) > 0.15)
    .slice(0, 3)
    .map(cat => `${cat.name || 'Unknown'} (${formatChangePercent(cat.delta || 0)})`);
  if (movers.length) {
    signals.push(`<li><strong>Category momentum:</strong> ${movers.join(', ')}</li>`);
  }

  const topLaunches = launches.slice(0, 3).map(launch => launch.name || launch.tagline || 'Untitled');
  if (topLaunches.length) {
    signals.push(`<li><strong>Product Hunt launches:</strong> ${topLaunches.join(' • ')}</li>`);
  }

  const topFunding = funding.slice(0, 3).map(deal => `${deal.company || 'Unknown'} (${deal.amount || 'N/A'})`);
  if (topFunding.length) {
    signals.push(`<li><strong>Funding pulse:</strong> ${topFunding.join(' • ')}</li>`);
  }

  const trendHighlights = trends.slice(0, 3).map(trend => `${trend.keyword || 'keyword'} (${formatChangePercent(trend.interest_change || 0)})`);
  if (trendHighlights.length) {
    signals.push(`<li><strong>Google Trends:</strong> ${trendHighlights.join(', ')}</li>`);
  }

  const redditHighlights = reddit.slice(0, 2).map(post => post.title || post.url || 'Reddit thread');
  if (redditHighlights.length) {
    signals.push(`<li><strong>Reddit discussions:</strong> ${redditHighlights.join(' • ')}</li>`);
  }

  const signalsList = signals.length ? `<ul class="signal-list">${signals.join('')}</ul>` : '';

  const fallback = summary || signalsList
    ? ''
    : '<p>No early market signals detected. Need categories, launches, funding, trends, or Reddit data.</p>';

  return `
    <section class="section">
      <h2><span>📡</span> EARLY MARKET SIGNALS</h2>
      <div class="note-card">
        ${summary || ''}
        ${signalsList || ''}
        ${fallback}
      </div>
    </section>
  `;
}

// Thursday-specific sections
function buildWhyIdeasFailSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const validation = data.validation || {};
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const struggling = categories
    .filter(cat => (cat.delta || 0) < -0.25)
    .slice(0, 3)
    .map(cat => `<li>${cat.name || 'Unnamed category'} · ${formatChangePercent(cat.delta || 0)} submissions WoW</li>`);

  const stats = validation.mvp !== undefined
    ? `<div class="metric-note">Execution funnel: ${formatPercent(validation.landing || 0)} have a landing page · ${formatPercent(validation.mvp || 0)} at MVP </div>`
    : '';

  const fallback = summary || struggling.length || stats
    ? ''
    : '<p>No failure analysis available. Need validation stats and category deltas.</p>';

  return `
    <section class="section">
      <h2><span>❌</span> WHY IDEAS FAIL</h2>
      <div class="note-card">
        ${summary || ''}
        ${stats}
        ${struggling.length ? `<ul class="signal-list">${struggling.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildExecutionGapsSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const validation = data.validation || {};
  const base44 = data.base44 || {};
  const signalScore = data.signalScore || {};

  const metrics = `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-icon">🌐</div>
        <div class="metric-content">
          <div class="metric-label">Landing page</div>
          <div class="metric-value">${formatPercent(validation.mvp || 0)}</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">🚀</div>
        <div class="metric-content">
          <div class="metric-label">MVP ready</div>
          <div class="metric-value">-</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">👆</div>
        <div class="metric-content">
          <div class="metric-label">Base44 clicks</div>
          <div class="metric-value">${base44.totalClicks || 0}</div>
        </div>
      </div>
    </div>
  `;

  const keywordList = Array.isArray(base44.topKeywords)
    ? base44.topKeywords.slice(0, 3).map(item => `<li><span class="keyword-icon">🔍</span> ${item.keyword || 'Unknown'} <span class="click-count">· ${item.count || 0} clicks</span></li>`)
    : [];

  const ruleSummary = signalScore.rules
    ? `<div class="signal-rules-box">
        <div class="signal-rules-header">📊 Signal rules passed</div>
        <div class="signal-rules-grid">
          <div class="signal-rule-item">
            <span class="rule-icon">✅</span>
            <span class="rule-label">Clear problem</span>
            <span class="rule-value">${formatPercent(signalScore.rules.clearProblem || 0)}</span>
          </div>
          <div class="signal-rule-item">
            <span class="rule-icon">🏢</span>
            <span class="rule-label">Competitor named</span>
            <span class="rule-value">${formatPercent(signalScore.rules.namedCompetitor || 0)}</span>
          </div>
          <div class="signal-rule-item">
            <span class="rule-icon">✍️</span>
            <span class="rule-label">&lt;50 words</span>
            <span class="rule-value">${formatPercent(signalScore.rules.conciseDescription || 0)}</span>
          </div>
        </div>
      </div>`
    : '';

  const fallback = summary || keywordList.length || ruleSummary.trim()
    ? ''
    : '<p>No execution gap analysis available. Need validation metrics and Base44 clicks.</p>';

  return `
    <section class="section">
      <h2><span>⚡</span> EXECUTION GAPS</h2>
      <div class="note-card">
        ${summary || ''}
        ${metrics}
        ${ruleSummary}
        ${keywordList.length ? `<ul class="signal-list">${keywordList.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildMonthlyProgressSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const totalIdeas = data.totalIdeas || 0;
  const lookbackDays = data.lookbackDays || 365;
  const validation = data.validation || {};

  // Calculate ideas from last 30 days
  // Formula: last 30 days = totalIdeas * 30 / lookbackDays
  const last30DaysIdeas = lookbackDays >= 30 && totalIdeas > 0
    ? Math.round(totalIdeas * 30 / lookbackDays)
    : totalIdeas;

  const tiles = `
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-label">Ideas logged (30d)</div><div class="metric-value">${last30DaysIdeas.toLocaleString()}</div></div>
      <div class="metric-card"><div class="metric-label">Landing page</div><div class="metric-value">${formatPercent(validation.landing || 0)}</div></div>
      <div class="metric-card"><div class="metric-label">MVP ready</div><div class="metric-value">${formatPercent(validation.mvp || 0)}</div></div>
      <div class="metric-card"><div class="metric-label">Revenue reported</div><div class="metric-value">${formatPercent(validation.paying || 0)}</div></div>
    </div>
  `;

  const fallback = summary || totalIdeas > 0
    ? ''
    : '<p>No monthly progress data available. Need total idea count and validation metrics.</p>';

  return `
    <section class="section">
      <h2><span>📊</span> MONTHLY PROGRESS SNAPSHOT</h2>
      <div class="note-card">
        ${summary || ''}
        ${totalIdeas ? tiles : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildAntiHypeSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const overbuilt = categories
    .filter(cat => (cat.count || 0) > 20 && (cat.delta || 0) < -0.2)
    .slice(0, 4)
    .map(cat => `<li>${cat.name || 'Unnamed category'} · ${cat.count} submissions · ${formatChangePercent(cat.delta || 0)} WoW</li>`);

  const fallback = summary || overbuilt.length
    ? ''
    : '<p>No anti-hype analysis available. Need category deltas and counts.</p>';

  return `
    <section class="section">
      <h2><span>🚫</span> MARKETS TO AVOID</h2>
      <div class="note-card">
        ${summary || ''}
        ${overbuilt.length ? `<ul class="signal-list">${overbuilt.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildCategoryTeardownSection(text, categories = []) {
  const summary = text ? formatParagraphs(text) : '';
  const topCategories = Array.isArray(categories)
    ? [...categories].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5)
    : [];

  const list = topCategories.length
    ? `<ul class="signal-list">${topCategories
        .map(cat => `<li>${cat.name || 'Unnamed category'} · ${cat.count || 0} ideas · ${formatChangePercent(cat.delta || 0)} WoW</li>`)
        .join('')}</ul>`
    : '';

  const fallback = summary || list
    ? ''
    : '<p>No category deep dive available. Need category counts from internal collector.</p>';

  return `
    <section class="section">
      <h2><span>🔍</span> CATEGORY DEEP DIVE</h2>
      <div class="note-card">
        ${summary || ''}
        ${list}
        ${fallback}
      </div>
    </section>
  `;
}

// Friday-specific sections
/**
 * Extract the best 3-4 words that describe an idea from a longer description
 * @param {string} description - Full idea description
 * @returns {string} Short 3-4 word summary
 */
function extractIdeaSummary(description) {
  if (!description || typeof description !== 'string') {
    return 'Untitled Idea';
  }
  
  const text = description.trim();
  
  // Remove common action verb prefixes
  let cleaned = text
    .replace(/^(I propose|I want to|We are|We're|Building|Create|Develop|Launch|Start|Design|An?)\s+/i, '')
    .replace(/^[A-Z][a-z]+\s+(is|are|will|would|can|could|delivers|helps|offers)\s+/i, '') // Remove "X is/are/delivers..."
    .trim();
  
  // Split into sentences and take the first meaningful sentence
  const sentences = cleaned.split(/[.!?]\s+/);
  let firstSentence = sentences[0] || cleaned;
  
  // Look for proper nouns/brand names first (capitalized words at start) - these are usually the best identifiers
  const properNounMatch = firstSentence.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
  if (properNounMatch) {
    const properNouns = properNounMatch[1].split(/\s+/).filter(w => w.length >= 2);
    if (properNouns.length >= 2 && properNouns.length <= 4) {
      return properNouns.join(' ');
    }
    // If we have a proper noun, use it plus 1-2 more words
    if (properNouns.length === 1) {
      const restOfSentence = firstSentence.substring(properNounMatch[0].length).trim();
      const nextWords = restOfSentence.split(/\s+/).slice(0, 3).filter(w => w.length >= 3);
      if (nextWords.length >= 1) {
        return (properNouns[0] + ' ' + nextWords.slice(0, 3).join(' ')).trim();
      }
    }
  }
  
  // Remove action verbs and common prefixes more aggressively
  firstSentence = firstSentence
    .replace(/^(building|creating|developing|launching|starting|designing|making|offering|providing)\s+/i, '')
    .replace(/^(an?|the)\s+/i, '')
    .trim();
  
  // Extract key words - prioritize nouns and important terms
  // Remove common stop words and generic tech words
  const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'that', 'this', 'these', 'those',
    'and', 'or', 'but', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'why',
    'we', 'our', 'us', 'you', 'your', 'they', 'their', 'them', 'it', 'its',
    'platform', 'system', 'service', 'app', 'tool', 'solution', 'helps', 'delivers', 'offers']);
  
  // Extract meaningful words (3+ characters, alphanumeric, not stop words)
  const words = firstSentence
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopWords.has(word));
  
  // If we have enough words, take the first 3-4 meaningful ones
  if (words.length >= 3) {
    // Capitalize first letter of each word
    return words.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  
  // Fallback: take first 3-4 words from the cleaned sentence
  const fallbackWords = firstSentence
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4);
  
  if (fallbackWords.length >= 2) {
    return fallbackWords.map(w => {
      // Preserve capitalization if it's a proper noun, otherwise capitalize first letter
      if (/^[A-Z]/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }
  
  return 'Untitled Idea';
}

function buildWeeklyTop10Section(text, ideas = []) {
  const summary = text ? formatParagraphs(text) : '';
  
  // Filter and clean ideas from tool_chart.txt (already sorted by score)
  // Display: Idea (3-4 words), Category, and Score per row
  const ideaList = Array.isArray(ideas)
    ? ideas
        .filter(idea => {
          if (!idea || !idea.title) return false;
          const title = idea.title.trim();
          // Exclude titles that are too short, just dashes, or mostly special characters
          if (title.length < 3) return false;
          if (/^[-_=]+$/.test(title)) return false; // Just dashes/underscores/equals
          if (/^[^a-zA-Z0-9\s]+$/.test(title)) return false; // Only special characters
          return true;
        })
        .slice(0, 10)
        .map((idea) => {
          const fullTitle = idea.title.trim();
          const shortTitle = extractIdeaSummary(fullTitle); // Extract 3-4 word summary
          const category = idea.category || 'General';
          const score = idea.score || 0;
          // Format: Idea (short), Category, Score
          return `<li>${shortTitle} · ${category} · Score: ${score}</li>`;
        })
    : [];

  const fallback = summary || ideaList.length
    ? ''
    : '<p>No top ideas available. Need chart data from tool_chart.txt.</p>';

  return `
    <section class="section">
      <h2><span>🏆</span> TOP 10 IDEAS OF THE WEEK</h2>
      <div class="note-card">
        ${summary || ''}
        ${ideaList.length ? `<ol class="signal-list">${ideaList.join('')}</ol>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildClusterOfWeekSection(text, clusters = []) {
  const summary = text ? formatParagraphs(text) : '';
  const topCluster = Array.isArray(clusters) && clusters.length ? clusters[0] : null;
  const clusterInfo = topCluster
    ? `<div class="cluster-card"><h3>${topCluster.name}</h3><div class="cluster-details">n=${topCluster.count || 0} submissions · ${formatChangePercent(topCluster.wow || 0)} WoW</div></div>`
    : '';
  const fallback = summary || clusterInfo
    ? ''
    : '<p>No cluster of the week selected. Need clustering data.</p>';
  return `
    <section class="section">
      <h2><span>⭐</span> CLUSTER OF THE WEEK</h2>
      ${clusterInfo}
      <div class="note-card">
        ${summary || ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildFounderOfWeekSection(text, problems = []) {
  const sanitizedText = text ? hideEmails(text) : '';
  const summary = sanitizedText ? formatParagraphs(sanitizedText) : '';
  const spotlight = Array.isArray(problems) && problems.length
    ? `<div class="note-card"><p><strong>Problem focus:</strong> ${problems[0].problem || 'Top founder insight'} (${problems[0].count || 0} mentions)</p></div>`
    : '';
  const fallback = summary || spotlight
    ? ''
    : '<p>No founder of the week selected. Need problem_heatmap data.</p>';
  return `
    <section class="section">
      <h2><span>👤</span> FOUNDER OF THE WEEK</h2>
      <div class="note-card">
        ${summary || ''}
        ${spotlight || ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildHighConfidenceSection(text, data = {}) {
  const summary = text ? formatParagraphs(text) : '';
  const funding = Array.isArray(data.funding) ? data.funding : [];
  const topCategoryByScore = data.topCategoryByScore || null;

  // Use top category from tool_chart.txt (by total score)
  const topCategoryInfo = topCategoryByScore
    ? `<div class="note-card" style="margin-top: 16px; background: #f8f9fa; padding: 16px; border-radius: 8px;">
        <strong>Top Category by Score:</strong> ${topCategoryByScore.name || 'Category'} 
        <span style="color: #666; font-size: 0.9em;">(Total Score: ${topCategoryByScore.totalScore || 0}, Count: ${topCategoryByScore.count || 0})</span>
      </div>`
    : '';

  const dealHighlights = funding.slice(0, 3).map(deal => `<li>${deal.company || 'Startup'} · ${deal.amount || 'Undisclosed'} · ${deal.category || 'category'}</li>`);

  const fallback = summary || topCategoryInfo || dealHighlights.length
    ? ''
    : '<p>No high-confidence opportunities identified. Need chart data from tool_chart.txt or funding events.</p>';

  return `
    <section class="section">
      <h2><span>🎯</span> HIGH-CONFIDENCE OPPORTUNITIES</h2>
      <div class="note-card">
        ${summary || ''}
        ${topCategoryInfo || ''}
        ${dealHighlights.length ? `<ul class="signal-list" style="margin-top: 16px;">${dealHighlights.join('')}</ul>` : ''}
        ${fallback}
      </div>
    </section>
  `;
}

function buildWeekendChallengeSection(text, categories = []) {
  const summary = text ? formatParagraphs(text) : '';
  const targetCategory = Array.isArray(categories)
    ? categories.find(cat => (cat.delta || 0) > 0.5) || categories[0]
    : null;
  const challenge = targetCategory
    ? `<p>Ship a landing page in the next 48 hours for <strong>${targetCategory.name}</strong>. There are ${targetCategory.count || 0} fresh submissions this week and momentum is ${formatChangePercent(targetCategory.delta || 0)} WoW—reach out to 5 people in this niche before Monday.</p>`
    : '';
  const fallback = summary || challenge
    ? ''
    : '<p>No weekend challenge this week. Need categories with recent growth.</p>';
  return `
    <section class="section">
      <h2><span>🏁</span> THE WEEKEND CHALLENGE</h2>
      <div class="cta-card">
        ${summary || ''}
        ${challenge}
        ${fallback}
      </div>
    </section>
  `;
}

function buildMondayPreviewSection(text, trends = []) {
  const summary = text ? formatParagraphs(text) : '';
  const nextTrend = Array.isArray(trends) && trends.length ? trends[0] : null;
  const preview = nextTrend
    ? `<p>Watch <strong>${nextTrend.keyword}</strong> (${formatChangePercent(nextTrend.interest_change || 0)})—it’s the fastest-moving search signal heading into Monday.</p>`
    : '';
  const fallback = summary || preview
    ? ''
    : '<p>Preview coming soon. Need at least one Google Trends signal.</p>';
  return `
    <section class="section">
      <h2><span>🔮</span> PREVIEW OF MONDAY</h2>
      <div class="note-card">
        ${summary || ''}
        ${preview}
        ${fallback}
      </div>
    </section>
  `;
}

function getSectionOrderForWeekday(weekday = '') {
  const day = weekday.toLowerCase();
  const orders = {
    monday: ['idea_futures', 'validation', 'weekend_spikes', 'weekly_watchlist', 'clustering', 'trends', 'one_thing_today'],
    tuesday: ['idea_futures', 'validation', 'clustering', 'problem_heatmap', 'opportunities_in_gaps', 'early_market_signals', 'deal_radar', 'one_thing_today'],
    wednesday: ['idea_futures', 'clustering', 'validation', 'deal_radar', 'wednesday_experiment', 'founder_field_note', 'tomorrows_question', 'one_thing_today'],
    thursday: ['idea_futures', 'validation', 'why_ideas_fail', 'execution_gaps', 'monthly_progress', 'anti_hype_section', 'category_teardown', 'one_thing_today', 'tomorrows_question'],
    friday: ['idea_futures', 'validation', 'weekly_top_10_ideas', 'cluster_of_the_week', 'founder_of_the_week', 'deal_radar', 'high_confidence_opportunities', 'weekend_challenge', 'monday_preview'],
    default: ['idea_futures', 'clustering', 'validation', 'deal_radar', 'one_thing_today']
  };
  return orders[day] || orders.default;
}

/**
 * Get master order for all sections (used for -b.html output)
 * @returns {Array<string>} Array of all section IDs in predefined order
 */
function getAllSectionsMasterOrder() {
  return [
    'idea_futures',
    'clustering',
    'problem_heatmap',
    'opportunities_in_gaps',
    'early_market_signals',
    'trends',
    'validation',
    'deal_radar',
    'wednesday_experiment',
    'founder_field_note',
    'tomorrows_question',
    'why_ideas_fail',
    'execution_gaps',
    'monthly_progress',
    'anti_hype_section',
    'category_teardown',
    'weekend_spikes',
    'weekly_watchlist',
    'weekly_top_10_ideas',
    'cluster_of_the_week',
    'founder_of_the_week',
    'high_confidence_opportunities',
    'weekend_challenge',
    'monday_preview',
    'one_thing_today'
  ];
}

/**
 * Section metadata: icons, titles, and data requirements
 */
const sectionMetadata = {
  idea_futures: {
    icon: '📊',
    title: 'IDEA FUTURES INDEX',
    requiredData: 'categories data with counts and week-over-week deltas from internal collector'
  },
  clustering: {
    icon: '🔍',
    title: 'THE CLUSTERING REPORT',
    requiredData: 'clusters data from internal collector (categories, problems, or sample ideas)'
  },
  problem_heatmap: {
    icon: '🔥',
    title: 'CUSTOMER PAIN ANALYSIS',
    requiredData: 'problem heatmap data from internal collector (extracted from idea submissions)'
  },
  opportunities_in_gaps: {
    icon: '🔍',
    title: 'OPPORTUNITIES IN THE GAPS',
    requiredData: 'categories, problems, validation stats, and clusters from internal data'
  },
  early_market_signals: {
    icon: '📡',
    title: 'EARLY MARKET SIGNALS',
    requiredData: 'categories, clusters, problems, launches, funding, trends, and Reddit data'
  },
  trends: {
    icon: '📊',
    title: 'MICRO-TRENDS',
    requiredData: 'trends data from Google Trends API and Reddit posts'
  },
  validation: {
    icon: '🔬',
    title: 'VALIDATION REALITY CHECK',
    requiredData: 'validation stats (MVP percentage) from internal collector'
  },
  deal_radar: {
    icon: '💰',
    title: 'DEAL RADAR: WHAT MONEY IS CHASING',
    requiredData: 'funding data from Crunchbase API, TechCrunch RSS, or Product Hunt'
  },
  wednesday_experiment: {
    icon: '🧪',
    title: 'THE WEDNESDAY EXPERIMENT',
    requiredData: 'validation stats and total ideas count from internal collector'
  },
  founder_field_note: {
    icon: '📝',
    title: 'FOUNDER FIELD NOTE',
    requiredData: 'problems and categories data from internal collector'
  },
  tomorrows_question: {
    icon: '🔮',
    title: "TOMORROW'S QUESTION",
    requiredData: 'trends data, correlations, and categories from merged data'
  },
  why_ideas_fail: {
    icon: '❌',
    title: 'WHY IDEAS FAIL',
    requiredData: 'validation stats, clustering data, and category analysis from internal collector'
  },
  execution_gaps: {
    icon: '⚡',
    title: 'EXECUTION GAPS',
    requiredData: 'execution metrics: landing page %, Base44 click-through %, MVP progression rates'
  },
  monthly_progress: {
    icon: '📊',
    title: 'MONTHLY PROGRESS SNAPSHOT',
    requiredData: 'validation stats, category trends, and idea progression data from internal collector'
  },
  anti_hype_section: {
    icon: '🚫',
    title: 'MARKETS TO AVOID',
    requiredData: 'category trends, validation stats, and Reddit discussions from merged data'
  },
  category_teardown: {
    icon: '🔍',
    title: 'CATEGORY DEEP DIVE',
    requiredData: 'category data with trends, validation stats, and external signals'
  },
  weekend_spikes: {
    icon: '📈',
    title: 'WEEKEND SPIKES',
    requiredData: 'internal data from past weekend (Saturday-Sunday) with category changes or problem spikes'
  },
  weekly_watchlist: {
    icon: '👀',
    title: "THIS WEEK'S WATCHLIST",
    requiredData: 'current week data trends from internal collector'
  },
  weekly_top_10_ideas: {
    icon: '🏆',
    title: 'TOP 10 IDEAS OF THE WEEK',
    requiredData: 'signal scores, validation progress, and category trends from internal collector'
  },
  cluster_of_the_week: {
    icon: '⭐',
    title: 'CLUSTER OF THE WEEK',
    requiredData: 'clusters data from internal collector with significant patterns'
  },
  founder_of_the_week: {
    icon: '👤',
    title: 'FOUNDER OF THE WEEK',
    requiredData: 'execution progress, validation metrics, and problem-solving approach from internal data'
  },
  high_confidence_opportunities: {
    icon: '🎯',
    title: 'HIGH-CONFIDENCE OPPORTUNITIES',
    requiredData: 'internal + external data correlations (categories, funding, launches, trends)'
  },
  weekend_challenge: {
    icon: '🏁',
    title: 'THE WEEKEND CHALLENGE',
    requiredData: 'categories and validation data from internal collector'
  },
  monday_preview: {
    icon: '🔮',
    title: 'PREVIEW OF MONDAY',
    requiredData: 'trends and category data to preview next week insights'
  },
  one_thing_today: {
    icon: '🎯',
    title: 'ONE THING TO DO TODAY',
    requiredData: 'categories and validation data from internal collector'
  }
};

/**
 * Check if section has underlying data structure (even if AI didn't generate content)
 * @param {string} sectionId - Section ID
 * @param {Object} summaryBlocks - Summary blocks from insights
 * @param {Object} rawData - Raw data from insights
 * @param {Object} internalData - Internal data
 * @returns {boolean} True if data structure exists
 */
function checkSectionHasDataStructure(sectionId, summaryBlocks, rawData, internalData) {
  // Check if we have the required data for each section type
  switch (sectionId) {
    case 'idea_futures':
      return !!(rawData.categories && rawData.categories.length > 0) || 
             !!(internalData.categories && internalData.categories.length > 0);
    case 'clustering':
      return !!(internalData.clusters && internalData.clusters.length > 0) ||
             !!(internalData.categories && internalData.categories.length > 0) ||
             !!(internalData.problemHeatmap && internalData.problemHeatmap.length > 0);
    case 'problem_heatmap':
      return !!(internalData.problemHeatmap && internalData.problemHeatmap.length > 0);
    case 'opportunities_in_gaps':
      return !!(internalData.categories && internalData.categories.length > 0) ||
             !!(internalData.problemHeatmap && internalData.problemHeatmap.length > 0);
    case 'early_market_signals':
      return !!(internalData.categories && internalData.categories.length > 0) ||
             !!(rawData.launches && rawData.launches.length > 0) ||
             !!(rawData.funding && rawData.funding.length > 0);
    case 'trends':
      return !!(rawData.trends && rawData.trends.length > 0);
    case 'validation':
      return !!(internalData.validation && typeof internalData.validation.mvp === 'number');
    case 'deal_radar':
      return !!(rawData.funding && rawData.funding.length > 0) ||
             !!(rawData.launches && rawData.launches.length > 0);
    case 'wednesday_experiment':
      return !!(internalData.validation && typeof internalData.validation.mvp === 'number');
    case 'founder_field_note':
      return !!(internalData.problemHeatmap && internalData.problemHeatmap.length > 0) ||
             !!(internalData.categories && internalData.categories.length > 0);
    case 'tomorrows_question':
      return !!(rawData.trends && rawData.trends.length > 0) ||
             !!(internalData.categories && internalData.categories.length > 0);
    case 'why_ideas_fail':
      return !!(internalData.validation) || !!(internalData.clusters && internalData.clusters.length > 0);
    case 'execution_gaps':
      return !!(internalData.validation);
    case 'monthly_progress':
      return !!(internalData.validation) || !!(internalData.categories && internalData.categories.length > 0);
    case 'anti_hype_section':
      return !!(internalData.categories && internalData.categories.length > 0);
    case 'category_teardown':
      return !!(internalData.categories && internalData.categories.length > 0);
    case 'weekend_spikes':
      return !!(internalData.categories && internalData.categories.length > 0);
    case 'weekly_watchlist':
      return !!(internalData.categories && internalData.categories.length > 0);
    case 'weekly_top_10_ideas':
      return !!(internalData.signalScore) || !!(internalData.categories && internalData.categories.length > 0);
    case 'cluster_of_the_week':
      return !!(internalData.clusters && internalData.clusters.length > 0);
    case 'founder_of_the_week':
      return !!(internalData.validation) || !!(internalData.problemHeatmap && internalData.problemHeatmap.length > 0);
    case 'high_confidence_opportunities':
      return !!(internalData.categories && internalData.categories.length > 0) ||
             !!(rawData.funding && rawData.funding.length > 0) ||
             !!(rawData.launches && rawData.launches.length > 0);
    case 'weekend_challenge':
      return !!(internalData.categories && internalData.categories.length > 0);
    case 'monday_preview':
      return !!(rawData.trends && rawData.trends.length > 0) ||
             !!(internalData.categories && internalData.categories.length > 0);
    case 'one_thing_today':
      return !!(internalData.categories && internalData.categories.length > 0);
    default:
      return false;
  }
}

/**
 * Build "not enough data" section placeholder
 * @param {string} sectionId - Section ID (e.g., 'idea_futures')
 * @returns {string} HTML for the section with "not enough data" message
 */
function buildNotEnoughDataSection(sectionId) {
  const metadata = sectionMetadata[sectionId];
  if (!metadata) {
    return '';
  }
  
  const content = `<p><strong>Not enough data available for this section.</strong></p><p>Required: ${metadata.requiredData}</p>`;
  
  return `
    <section class="section">
      <h2><span>${metadata.icon}</span> ${metadata.title}</h2>
      <div class="note-card">
        ${content}
      </div>
    </section>
  `;
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

async function fillTemplate(template, insights, targetDate = null, includeAllSections = false) {
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
  const weekendCategories = internalData.weekendCategories || rawData.weekendCategories || [];
  const clusters = internalData.clusters || rawData.clusters || [];
  const validation = internalData.validation || rawData.validation || {};
  const signalScore = internalData.signalScore || rawData.signalScore || {};
  const funding = rawData.funding || [];
  const launches = rawData.launches || [];
  const trendsData = rawData.trends || [];
  const redditData = rawData.reddit || [];
  const base44 = internalData.base44 || { totalClicks: 0, topKeywords: [], entries: [] };
  const ideasSample = internalData.ideas || [];
  const weeklyTopIdeas = internalData.weeklyTopIdeas || []; // Latest 10 unique entries from tool_chart.txt (by email, newest first)
  const topCategoryByScore = internalData.topCategoryByScore || null; // Top category by total score for HIGH-CONFIDENCE OPPORTUNITIES
  const rawProblemHeatmap = internalData.problemHeatmap || [];
  // Use metadata.totalIdeas if available (all-time count), otherwise calculate from categories
  const totalIdeaCount = internalData.metadata?.totalIdeas || 
    (Array.isArray(categories)
      ? categories.reduce((sum, cat) => sum + (cat.count || 0), 0)
      : 0);
  const last7DaysIdeaCount = internalData.metadata?.currentWeekCount ?? null;

  // Only build sections that have content (weekday-based generation)
  const ideaSection = summaryBlocks.idea_futures ? buildIdeaFuturesSection(await translateBlock(summaryBlocks.idea_futures), categories) : '';
  
  // Clustering section: Only show on Monday (as "ONE MAJOR CLUSTER"), Tuesday (as "TOP 3 NEW CLUSTERS"), or Wednesday (as "DEEP CLUSTERING REPORT")
  // Monday should show clustering, but NOT as "THE CLUSTERING REPORT"
  // For "all sections" mode, always build if we have content or clusters data
  const clusteringSummary = summaryBlocks.clustering ? await translateBlock(summaryBlocks.clustering) : '';
  const shouldShowClustering = includeAllSections || 
    weekday.toLowerCase() === 'monday' || 
    weekday.toLowerCase() === 'tuesday' || 
    weekday.toLowerCase() === 'wednesday';
  
  const clusteringSection = (summaryBlocks.clustering || (includeAllSections && clusters.length > 0))
    ? buildClusteringSection(clusteringSummary, clusters, includeAllSections ? null : weekday)
    : '';
  
  const validationSummary = summaryBlocks.validation ? await translateBlock(summaryBlocks.validation) : '';
  const lookbackDays = internalData.metadata?.lookbackDays || 365;
  const validationSection = (summaryBlocks.validation || includeAllSections)
    ? buildValidationSection(validationSummary, validation, totalIdeaCount, lookbackDays, base44, last7DaysIdeaCount)
    : '';
  const dealRadarSummary = summaryBlocks.deal_radar ? await translateBlock(summaryBlocks.deal_radar) : '';
  const dealRadarSection = (summaryBlocks.deal_radar || (includeAllSections && funding.length > 0))
    ? buildDealRadarSection(dealRadarSummary, funding)
    : '';
  const experimentSummary = summaryBlocks.wednesday_experiment ? await translateBlock(summaryBlocks.wednesday_experiment) : '';
  const wednesdayData = { totalIdeas: totalIdeaCount, validation };
  const experimentSection = (summaryBlocks.wednesday_experiment || (includeAllSections && (totalIdeaCount || validation.mvp !== undefined)))
    ? buildExperimentSection(experimentSummary, wednesdayData)
    : '';
  const founderSummary = summaryBlocks.founder_field_note ? await translateBlock(summaryBlocks.founder_field_note) : '';
  const founderSection = (summaryBlocks.founder_field_note || (includeAllSections && rawProblemHeatmap.length))
    ? buildFounderFieldNoteSection(founderSummary, rawProblemHeatmap)
    : '';
  const tomorrowSummary = summaryBlocks.tomorrows_question ? await translateBlock(summaryBlocks.tomorrows_question) : '';
  const tomorrowSection = (summaryBlocks.tomorrows_question || (includeAllSections && trendsData.length))
    ? buildTomorrowQuestionSection(tomorrowSummary, trendsData)
    : '';
  const oneThingSummary = summaryBlocks.one_thing_today ? await translateBlock(summaryBlocks.one_thing_today) : '';
  const oneThingSection = (summaryBlocks.one_thing_today || (includeAllSections && categories.length > 0))
    ? buildOneThingSection(oneThingSummary, categories)
    : '';
  
  // Monday-specific sections
  const weekendSpikesSummary = summaryBlocks.weekend_spikes ? await translateBlock(summaryBlocks.weekend_spikes) : '';
  const weekendCategorySource = weekendCategories.length ? weekendCategories : categories;
  const weekendSpikesSection = (summaryBlocks.weekend_spikes || (includeAllSections && weekendCategorySource.length > 0))
    ? buildWeekendSpikesSection(weekendSpikesSummary, weekendCategorySource)
    : '';

  const weeklyWatchlistSummary = summaryBlocks.weekly_watchlist ? await translateBlock(summaryBlocks.weekly_watchlist) : '';
  const weeklyWatchlistSection = (summaryBlocks.weekly_watchlist || (includeAllSections && (categories.length || clusters.length)))
    ? buildWeeklyWatchlistSection(weeklyWatchlistSummary, categories, clusters)
    : '';

  const trendsSummary = summaryBlocks.trends ? await translateBlock(summaryBlocks.trends) : '';
  const trendsSection = (summaryBlocks.trends || (includeAllSections && (trendsData.length || redditData.length)))
    ? buildTrendsSection(trendsSummary, trendsData, redditData)
    : '';
  
  // Tuesday-specific sections
  let problemHeatmapSection = '';
  if (summaryBlocks.problem_heatmap || rawProblemHeatmap.length > 0) {
    const translatedSummary = summaryBlocks.problem_heatmap ? await translateBlock(summaryBlocks.problem_heatmap) : '';
    problemHeatmapSection = buildProblemHeatmapSection(translatedSummary, rawProblemHeatmap);
  }

  const opportunityData = {
    categories,
    problemHeatmap: rawProblemHeatmap,
    validation
  };
  let opportunitiesInGapsSection = '';
  if (summaryBlocks.opportunities_in_gaps || opportunityData.categories.length > 0) {
    const translatedSummary = summaryBlocks.opportunities_in_gaps ? await translateBlock(summaryBlocks.opportunities_in_gaps) : '';
    opportunitiesInGapsSection = buildOpportunitiesInGapsSection(translatedSummary, opportunityData);
  }

  const earlySignalsData = {
    categories,
    clusters,
    problems: rawProblemHeatmap,
    launches,
    funding,
    trends: trendsData,
    reddit: redditData
  };
  let earlyMarketSignalsSection = '';
  if (
    summaryBlocks.early_market_signals ||
    launches.length ||
    funding.length ||
    trendsData.length ||
    redditData.length
  ) {
    const translatedSummary = summaryBlocks.early_market_signals ? await translateBlock(summaryBlocks.early_market_signals) : '';
    earlyMarketSignalsSection = buildEarlyMarketSignalsSection(translatedSummary, earlySignalsData);
  }
  
  // Thursday-specific sections
  const whyIdeasFailSummary = summaryBlocks.why_ideas_fail ? await translateBlock(summaryBlocks.why_ideas_fail) : '';
  const whyIdeasFailSection = (summaryBlocks.why_ideas_fail || (includeAllSections && categories.length))
    ? buildWhyIdeasFailSection(whyIdeasFailSummary, { categories, validation })
    : '';

  const executionGapsSummary = summaryBlocks.execution_gaps ? await translateBlock(summaryBlocks.execution_gaps) : '';
  const executionGapsSection = (summaryBlocks.execution_gaps || (includeAllSections && (validation.mvp !== undefined || base44.totalClicks)))
    ? buildExecutionGapsSection(executionGapsSummary, { validation, base44, signalScore })
    : '';

  const monthlyProgressSummary = summaryBlocks.monthly_progress ? await translateBlock(summaryBlocks.monthly_progress) : '';
  const monthlyProgressSection = (summaryBlocks.monthly_progress || (includeAllSections && totalIdeaCount))
    ? buildMonthlyProgressSection(monthlyProgressSummary, { totalIdeas: totalIdeaCount, lookbackDays, validation })
    : '';

  const antiHypeSummary = summaryBlocks.anti_hype_section ? await translateBlock(summaryBlocks.anti_hype_section) : '';
  const antiHypeSection = (summaryBlocks.anti_hype_section || (includeAllSections && categories.length))
    ? buildAntiHypeSection(antiHypeSummary, { categories })
    : '';

  const categoryTeardownSummary = summaryBlocks.category_teardown ? await translateBlock(summaryBlocks.category_teardown) : '';
  const categoryTeardownSection = (summaryBlocks.category_teardown || (includeAllSections && categories.length))
    ? buildCategoryTeardownSection(categoryTeardownSummary, categories)
    : '';
  
  // Friday-specific sections
  const weeklyTop10Summary = summaryBlocks.weekly_top_10_ideas ? await translateBlock(summaryBlocks.weekly_top_10_ideas) : '';
  // Use weeklyTopIdeas if available (properly ranked), otherwise fallback to ideasSample
  const top10IdeasToUse = weeklyTopIdeas.length > 0 ? weeklyTopIdeas : ideasSample.slice(0, 10);
  // Build section if: AI summary exists, OR (it's Friday and we have data), OR (includeAllSections and we have data)
  const isFriday = weekday.toLowerCase() === 'friday';
  const weeklyTop10Section = (summaryBlocks.weekly_top_10_ideas || (isFriday && top10IdeasToUse.length) || (includeAllSections && top10IdeasToUse.length))
    ? buildWeeklyTop10Section(weeklyTop10Summary, top10IdeasToUse)
    : '';

  const clusterWeekSummary = summaryBlocks.cluster_of_the_week ? await translateBlock(summaryBlocks.cluster_of_the_week) : '';
  const clusterOfWeekSection = (summaryBlocks.cluster_of_the_week || (includeAllSections && clusters.length))
    ? buildClusterOfWeekSection(clusterWeekSummary, clusters)
    : '';

  const founderWeekSummary = summaryBlocks.founder_of_the_week ? await translateBlock(summaryBlocks.founder_of_the_week) : '';
  const founderOfWeekSection = (summaryBlocks.founder_of_the_week || (includeAllSections && rawProblemHeatmap.length))
    ? buildFounderOfWeekSection(founderWeekSummary, rawProblemHeatmap)
    : '';

  const highConfidenceSummary = summaryBlocks.high_confidence_opportunities ? await translateBlock(summaryBlocks.high_confidence_opportunities) : '';
  const highConfidenceSection = (summaryBlocks.high_confidence_opportunities || (includeAllSections && (funding.length || topCategoryByScore)))
    ? buildHighConfidenceSection(highConfidenceSummary, { funding, topCategoryByScore })
    : '';

  const weekendChallengeSummary = summaryBlocks.weekend_challenge ? await translateBlock(summaryBlocks.weekend_challenge) : '';
  const weekendChallengeSection = (summaryBlocks.weekend_challenge || (includeAllSections && categories.length))
    ? buildWeekendChallengeSection(weekendChallengeSummary, categories)
    : '';

  const mondayPreviewSummary = summaryBlocks.monday_preview ? await translateBlock(summaryBlocks.monday_preview) : '';
  const mondayPreviewSection = (summaryBlocks.monday_preview || (includeAllSections && trendsData.length))
    ? buildMondayPreviewSection(mondayPreviewSummary, trendsData)
    : '';

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

  // Determine section order based on mode
  let sectionOrder;
  if (includeAllSections) {
    // Use master order for -b.html (all sections)
    sectionOrder = getAllSectionsMasterOrder();
  } else {
    // Use weekday-specific order for -a.html (day-specific sections)
    sectionOrder = getSectionOrderForWeekday(weekday);
  }
  
  let mainSections = sectionOrder
    .map(key => {
      const sectionHtml = sectionsMap[key];
      if (includeAllSections) {
        // For -b.html: show section if it has content, otherwise show "not enough data"
        if (sectionHtml && sectionHtml.trim().length > 0) {
          return sectionHtml;
        } else {
          // Check if we have the underlying data structure for this section
          const hasDataStructure = checkSectionHasDataStructure(key, summaryBlocks, rawData, internalData);
          if (hasDataStructure) {
            // Data exists but AI didn't generate content - show empty section with note
            return buildNotEnoughDataSection(key);
          } else {
            // No data structure at all - show "not enough data"
            return buildNotEnoughDataSection(key);
          }
        }
      } else {
        // For -a.html: only show sections with content (existing behavior)
        return sectionHtml;
      }
    })
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

    const outputDir = path.join(__dirname, '..', config.paths.output);
    await fs.mkdir(outputDir, { recursive: true });

    // Generate -a.html (day-specific sections)
    console.log('Generating day-specific newsletter (-a.html)...');
    const htmlA = await fillTemplate(template, insights, targetDate, false);
    const outputPathA = path.join(outputDir, `${targetDate}-a.html`);
    await fs.writeFile(outputPathA, htmlA);
    console.log(`Newsletter built: ${outputPathA}`);

    // Generate -b.html (all sections)
    console.log('Generating full newsletter with all sections (-b.html)...');
    const htmlB = await fillTemplate(template, insights, targetDate, true);
    const outputPathB = path.join(outputDir, `${targetDate}-b.html`);
    await fs.writeFile(outputPathB, htmlB);
    console.log(`Newsletter built: ${outputPathB}`);

    return { daySpecific: outputPathA, allSections: outputPathB };
  } catch (error) {
    console.error('Error building newsletter:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Accept date from command line: node newsletter/builder.js 2025-11-18
  const date = process.argv[2] || null;
  buildNewsletter(date)
    .then(result => {
      if (typeof result === 'object' && result.daySpecific && result.allSections) {
        console.log(`Newsletter generated:`);
        console.log(`  Day-specific: ${result.daySpecific}`);
        console.log(`  All sections: ${result.allSections}`);
      } else {
        console.log(`Newsletter generated at: ${result}`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Newsletter build failed:', error);
      process.exit(1);
    });
}
