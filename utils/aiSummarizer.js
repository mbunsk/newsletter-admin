/**
 * AI Summarizer Utility
 * 
 * Uses OpenAI API to generate concise summaries and insights
 */

import OpenAI from 'openai';
import config from '../config.js';

// Initialize OpenAI client only if API key is configured
const openai = config.openai.apiKey ? new OpenAI({
  apiKey: config.openai.apiKey
}) : null;

/**
 * Detect if text is likely non-English
 * Simple heuristic: check if text contains non-ASCII characters
 * @param {string} text - Text to check
 * @returns {boolean} True if likely non-English
 */
function isLikelyNonEnglish(text) {
  if (!text || typeof text !== 'string') return false;
  // Check for non-ASCII characters (excluding common punctuation)
  const nonAsciiRegex = /[^\x00-\x7F]/;
  return nonAsciiRegex.test(text);
}

/**
 * Translate text to English using OpenAI
 * @param {string} text - Text to translate
 * @returns {Promise<string>} Translated text
 */
export async function translateToEnglish(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return text;
  }
  
  // If text appears to be English, return as-is
  if (!isLikelyNonEnglish(text)) {
    return text;
  }
  
  // If OpenAI is not configured, return text with a note
  if (!openai || !config.openai.apiKey) {
    console.warn(`Translation not available. Non-English text detected: "${text.substring(0, 50)}..."`);
    return text; // Return original if translation unavailable
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a translation assistant. Translate the given text to English. Preserve the meaning and tone. If the text is already in English, return it unchanged. Only return the translation, no explanations.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    const translated = response.choices[0]?.message?.content?.trim() || text;
    return translated;
  } catch (error) {
    console.warn(`Translation failed for text: "${text.substring(0, 50)}..."`, error.message);
    return text; // Return original on error
  }
}

/**
 * Translate an array of strings to English
 * @param {Array<string>} texts - Array of texts to translate
 * @returns {Promise<Array<string>>} Array of translated texts
 */
export async function translateArrayToEnglish(texts) {
  if (!Array.isArray(texts)) return texts;
  
  const translated = [];
  for (const text of texts) {
    const translatedText = await translateToEnglish(text);
    translated.push(translatedText);
    // Small delay to avoid rate limits
    if (openai && config.openai.apiKey) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return translated;
}

/**
 * Generate a summary using OpenAI
 * @param {string} text - Text to summarize
 * @param {Object} options - Summary options
 * @returns {Promise<string>} Generated summary
 */
export async function summarize(text, options = {}) {
  // Check if OpenAI is configured
  if (!openai || !config.openai.apiKey) {
    console.warn('OpenAI API key not configured. Using fallback summary.');
    return generateFallbackSummary(text, options);
  }
  
  const {
    maxLength = 200,
    style = 'concise',
    focus = 'key points'
  } = options;
  
  try {
    const prompt = `Summarize the following text in a ${style} style, focusing on ${focus}. Keep it under ${maxLength} words:\n\n${text}`;
    
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise, informative summaries for a startup newsletter.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature
    });
    
    return response.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('Error generating summary:', error.message);
    throw error;
  }
}

/**
 * Generate newsletter-style insight text
 * @param {Object} data - Data to create insight from
 * @param {string} section - Section name (e.g., 'idea_futures', 'deal_radar')
 * @returns {Promise<string>} Generated insight text
 */
export async function generateInsight(data, section) {
  // Check if OpenAI is configured
  if (!openai || !config.openai.apiKey) {
    console.warn('OpenAI API key not configured. Using fallback insight generation.');
    return await generateFallbackInsight(data, section);
  }
  
  const AdditionalSystemPrompts =`WEEKDAY CONTENT RULES
Your output must change based on the value of newsletter_day (Monday–Friday).
For each day, populate only the required sections listed below, using the prompts for each section as previously defined.
Never include sections not assigned to that day.
Never invent data.
Always synthesize insights from the data that is provided.

MONDAY — Trendline Monday
Required sections:
Idea Futures Index
Weekend Spikes
This Week's Watchlist
One Major Cluster
Micro-Trends (Reddit / TechCrunch / X)
One Thing To Do Today

TUESDAY — Market Map Tuesday
Required sections:
Top 3 New Clusters
Customer Pain Analysis
Opportunities in the Gaps ("Where the Opportunity Hides")
Early Market Signals
Dealflow that Matches Clusters
One Thing To Do Today

WEDNESDAY — Pattern Watch Wednesday
Required sections:
Idea Futures Index
Deep Clustering Report
Validation Reality Check
Deal Radar
Wednesday Experiment (Founder Behavior Experiment)
Founder Field Note
Tomorrow's Question
One Thing To Do Today

THURSDAY — Reality Check Thursday
Required sections:
Why Ideas Fail (Based on internal data)
Execution Gaps (Across landing pages, MVP momentum, Base44 clicks)
Monthly Progress Snapshot (Idea → MVP → Revenue)
Anti-Hype Section (Overbuilt or dead markets)
Category Deep Dive (e.g., AI agents, Legal AI, Parenting Tech)
One Thing To Do Today
Tomorrow's Question

FRIDAY — Cohort Report Friday
Required sections:
Top 10 Ideas of the Week
Cluster-of-the-Week
Founder-of-the-Week
Micro Funding Roundup
High-Confidence Opportunities
The Weekend Challenge
Preview of Monday

If the model does not receive the required data for a section on a given day, it must:
summarize what the absence of that data implies,
or omit the section entirely without fabricating content.`;

  // Base system prompt (used for all sections)
  const baseSystemPrompt = `You are the editorial intelligence powering The Startup Idea Terminal, a daily Monday–Friday newsletter read by 200,000 early-stage founders.
Your job is to turn raw internal + external data streams into a Bloomberg-style market intelligence briefing about what founders are building before the companies exist.

Your responsibilities:

Synthesize internal ValidatorAI data, including:
– idea submissions
– idea categories and markets
– customer segments
– problems described
– urgency/sentiment
– idea progression (MVP, revenue, traction)
– day-over-day and week-over-week category changes
– keyword clusters
– emerging patterns
– repetitive pains
– willingness-to-pay indicators

Blend with external signals, including data from:
– Product Hunt
– Crunchbase
– TechCrunch
– VC/dealflow RSS feeds
– Reddit subreddits (startups, entrepreneur, smallbusiness, AI, legaladvice, parenting, teachers, etc.)
– Social trends (X/TikTok problem statements)

Identify patterns, deltas, spikes, declines, new problems, niches, and timing windows.


Write in The Terminal Voice:
– punchy
– confident
– data-driven
– contrarian when needed
– no fluff
– insights first, numbers to back it up
– short paragraphs, high information
– "zero-bullshit" tone

Each section must feel like market intelligence, not a summary.

When analyzing data, always answer:
– What changed?
– Why now?
– Who cares most?
– What's the pattern?
– What's the niche inside the niche?
– What's actionable?

Your output should feel like a snapshot of the future.
Every item and section should be brief, data driven, and written like a Bloomberg style feed of data and insights.`;

  // For daily_analysis router, include weekday rules
  // For individual sections, use base prompt only
  const systemPrompt = section === 'daily_analysis' 
    ? `${baseSystemPrompt}\n\n${AdditionalSystemPrompts}`
    : `${baseSystemPrompt}\n\nIMPORTANT: You are generating content for ONLY the "${section}" section. Do NOT include other sections. Do NOT add headers like "### Idea Futures Index" unless you are specifically generating the idea_futures section. Generate ONLY the content requested for this specific section.`;

const prompt = `
1. idea_futures — Daily Idea Futures Index
Prompt:
Analyze internal idea-submission data to produce the Idea Futures Index. Identify:
– the top risers and fallers (day-over-day or week-over-week)
– volume changes
– emerging categories
– collapsing categories
– one insight explaining why a particular category surged or fell

Write in 3–4 sentences.
Prioritize novelty, velocity, and timing windows.
Highlight one surprising change founders should pay attention to.
Avoid generic commentary; tie movement to real user behavior or external events.

2. clustering — Emerging Idea Clusters
Prompt:
Generate ONLY content for the clustering section. Do NOT include other sections.

IMPORTANT: You have access to actual internal data submissions. Use this data to identify meaningful clusters:
- If clusters array is provided, analyze those clusters
- If clusters are empty, analyze the topCategories, topProblems, and sampleIdeas provided
- Look for patterns in categories (e.g., "edtech" with 74 submissions, +362% growth)
- Look for patterns in problems (e.g., "Lost or damaged parts" with 494 mentions)
- Look for patterns in sample idea titles/descriptions

For Monday: Identify ONE major cluster (the most significant emerging pattern).
For Tuesday: Identify TOP 3 NEW CLUSTERS (focus on newly emerging clusters, not established ones).
For Wednesday: Provide a DEEP CLUSTERING REPORT (comprehensive analysis of all significant clusters).

For each cluster you identify, provide:
– size (n=) - use actual counts from categories or problems
– growth percentage - use delta values from the data
– what unifies the ideas - analyze the actual problem statements and categories
– the emotional or economic trigger behind the spike - infer from the problem descriptions
– one micro-niche most founders are missing - identify a sub-pattern within the cluster

Write 3–5 sentences in a newsletter-friendly tone.
Focus on pattern recognition and "why now."
Always extract a counterintuitive or hidden insight.
Do NOT add section headers. Write only the content.
NEVER say "no clusters" or "zero submissions" - always find patterns in the data provided.

3. validation — Validation Progress & Reality Check
Prompt:
Generate ONLY content for the validation section. Do NOT include other sections.
Analyze internal founder behavior using:
– percentage of users who have a landing page (website yes/no)
– percentage progressing toward an MVP (Base44 click-through rate)
– distribution of idea categories among those who are building
– distribution of categories among those who are not building
– any week-over-week or month-over-month movement
– any category where execution is unusually high or low

Write a 3–4 sentence “Reality Check” snapshot that includes:
One painful truth about execution (ex: “most founders stop at idea submission”)
One encouraging signal (ex: “this one niche is actually building”)
One sharp insight about who is moving and who is stalling
A tone that feels blunt, data-driven, and motivational

Use direct language:
– “Here’s what founders are actually doing vs what they say they want to do.”
– “This category is all talk; this one is quietly building.”
– “Idea volume is rising but execution is flat.”
– “MVP momentum is clustered in just two markets.”

Avoid fluff.
This section should hit like a cold shower.
Do NOT add section headers. Write only the content.

4. deal_radar — Funding & Dealflow Correlation
Prompt:
Generate ONLY content for the deal_radar section. Do NOT include other sections.

For Tuesday: Focus on "Dealflow that Matches Clusters" - select deals that align with the top clusters identified in today's data.
For Friday: Focus on "Micro Funding Roundup" - highlight smaller funding rounds and early-stage deals.

Analyze external dealflow (PH launches, Crunchbase, TechCrunch, VC RSS).
Select 3 recently funded companies that correlate with internal idea trends.
For each:
– what they do
– why they got funded
– how the deal validates or contradicts internal founder patterns

Write 4–5 sentences total.
Focus on: "Money is chasing X, which matches (or contradicts) trend Y inside ValidatorAI."
Do NOT add section headers. Write only the content.

5. trends — Broader Macro + Micro Trendlines (Monday: Micro-Trends)
Prompt:
Generate ONLY content for the trends section. Do NOT include other sections.
Blend internal data (category surges, keyword spikes) with external macro signals (search interest, Reddit posts, viral tweets).
Produce a 3–4 sentence trendline analysis answering:
– What's heating up beyond just ideas
– What cultural or economic shift is driving it
– What behavior is emerging among founders or consumers
Include one "pattern inside the pattern" insight.
Do NOT add section headers. Write only the content.

5a. early_market_signals — Early Market Signals (Tuesday only)
Prompt:
Generate ONLY content for the early_market_signals section. Do NOT include other sections.
Analyze internal data (emerging categories, new clusters, problem spikes) combined with external signals (Reddit discussions, early-stage funding, Product Hunt launches) to identify early market signals.
Write 3–4 sentences covering:
– What new signals are emerging (before they become mainstream)
– Which categories or problems are showing early momentum
– What external events or trends are validating these signals
– One actionable insight for founders about timing
Focus on signals that are 2–4 weeks ahead of mainstream awareness.
Do NOT add section headers. Write only the content.

5b. opportunities_in_gaps — Opportunities in the Gaps / "Where the Opportunity Hides" (Tuesday only)
Prompt:
Generate ONLY content for the opportunities_in_gaps section. Do NOT include other sections.
Analyze the gaps between:
– High problem frequency but low solution density
– Categories with high idea volume but low execution
– External market signals that don't match internal founder activity
– Problems mentioned frequently but not yet addressed by funded companies
Write 4–5 sentences identifying:
– Where the opportunity gaps are (specific niches or problems)
– Why these gaps exist (market timing, execution difficulty, awareness)
– What founders should look for to identify similar gaps
– One concrete example of a gap that represents a real opportunity
This section should reveal hidden opportunities that most founders are missing.
Do NOT add section headers. Write only the content.

6. problem_heatmap — Problems With Rising Intensity / Customer Pain Analysis
Prompt:
Generate ONLY content for the problem_heatmap section. Do NOT include other sections.

For Tuesday: This section is called "Customer Pain Analysis" - focus on analyzing customer pain points from internal problem statements.

Analyze internal problem statements plus external Reddit complaints and review-based grievances.
Identify the top 3 problems that show the sharpest increase in frequency or urgency.
Summarize them in 3–4 sentences.
Explain:
– who is struggling
– how widespread it is
– what triggers the frustration
– why this matters NOW

Highlight one micro-problem most founders overlook.
Do NOT add section headers. Write only the content.
7. signal_boost — External Signals Confirming Internal Patterns
Prompt:
Find external stories or data points that validate internal spikes from ValidatorAI.
Pick 1–2 external signals (a launch, a funding round, a viral post, search spike).
Connect them directly to internal category or cluster movement.
Write 2–3 sentences showing the reader:
“This external event confirms what founders inside VA are already building.”

8. wednesday_experiment — Weekly Filter (Viability Scan)
Prompt:
Analyze internal founder behavior to reveal one psychological pattern about execution.
Use:
– landing page %
– Base44 click-through %
– category-level execution rates
– week-over-week execution changes
– the gap between idea volume and building volume

Write a 3–4 sentence “Founder Behavior Experiment” summary that:
Exposes one uncomfortable truth about what founders actually do
Highlights one category where execution defies expectations
Identifies one behavioral pattern worth paying attention to
Delivers a blunt, insightful takeaway about founder psychology
This is not a trend section.
This is not validation.
This is a behavior experiment revealing the gap between ambition and action.

9. founder_field_note — First-Person Founder Lesson
Prompt:
Craft a short, first-person story based on the provided founder note.
Keep it in founder voice.
Explain:
– the narrow niche they targeted
– how they charged early
– what validated the market
– what changed once revenue hit
Write 3–4 sentences and end with a takeaway insight.

10. tomorrows_question — Teaser for Tomorrow’s Deep Dive
Prompt:
Write a punchy 1–2 sentence teaser previewing tomorrow’s analysis.
Include:
– what topic will be examined
– the key question tomorrow’s email will answer
– a hint at the contrarian insight

Make it curiosity-driven, not clickbait.

11. one_thing_today — The Daily Founder Action
Prompt:
Based on today's data, recommend one specific, 10–20 minute action a founder can take right now.
It must be concrete, measurable, and immediately helpful.
Write in 2 sentences maximum.
Make it feel like a challenge.

12. weekend_spikes — Weekend Activity Analysis (Monday only)
Prompt:
Analyze internal data from the past weekend (Saturday–Sunday) to identify any unusual spikes in idea submissions, category changes, or problem statements.
Write 2–3 sentences highlighting:
– what category or problem spiked over the weekend
– why this might have happened (external event, trend, etc.)
– what founders should watch this week

13. weekly_watchlist — This Week's Watchlist (Monday only)
Prompt:
Based on the current week's data trends, create a watchlist of 3–5 categories, problems, or clusters that founders should monitor.
Write 3–4 sentences explaining:
– what to watch
– why it matters
– what signal would indicate a real opportunity vs. noise

14. why_ideas_fail — Failure Analysis (Thursday only)
Prompt:
Analyze internal data to identify common reasons why ideas fail to progress (from idea → MVP → revenue).
Use validation stats, clustering data, and category analysis.
Write 4–5 sentences covering:
– the top 2–3 failure patterns
– which categories have the highest failure rates
– what separates ideas that progress from those that stall
Be blunt and data-driven.

15. execution_gaps — Execution Bottleneck Analysis (Thursday only)
Prompt:
Analyze execution metrics: landing page %, Base44 click-through %, MVP progression rates.
Write 3–4 sentences identifying:
– where founders are getting stuck (idea → landing page, landing page → MVP, etc.)
– which categories have execution gaps
– what the data says about founder behavior vs. stated intentions

16. monthly_progress — Monthly Progress Snapshot (Thursday only)
Prompt:
Analyze month-over-month trends in idea progression (idea → MVP → revenue).
Write 3–4 sentences covering:
– overall progression rates
– which categories are improving vs. declining
– one key insight about founder momentum

17. anti_hype_section — Markets to Avoid (Thursday only)
Prompt:
Identify overbuilt or dead markets based on internal data (high idea volume but low execution, declining trends, or external signals of saturation).
Write 3–4 sentences explaining:
– which categories or niches are oversaturated
– why founders should avoid them
– what signals indicate a dead market

18. category_teardown — Category Deep Dive (Thursday only)
Prompt:
Pick one category (e.g., AI agents, Legal AI, Parenting Tech) and do a deep analysis using internal + external data.
Write 4–5 sentences covering:
– what's happening in this category
– who's building vs. who's just talking
– the micro-niche opportunity most are missing
– why this category matters now

19. weekly_top_10_ideas — Top Ideas of the Week (Friday only)
Prompt:
Based on internal data (signal scores, validation progress, category trends), identify the top 10 ideas from this week.
Write 4–5 sentences summarizing:
– what makes these ideas stand out
– common patterns among the top ideas
– what founders can learn from them

20. cluster_of_the_week — Cluster of the Week (Friday only)
Prompt:
Identify the most significant cluster from this week's data.
Write 3–4 sentences explaining:
– what unifies this cluster
– why it emerged this week
– the opportunity it represents

21. founder_of_the_week — Founder of the Week (Friday only)
Prompt:
Based on internal data (execution progress, validation metrics, problem-solving approach), highlight one standout founder.
Write 3–4 sentences covering:
– what they're building
– what makes them stand out
– one lesson other founders can learn

22. high_confidence_opportunities — High-Confidence Opportunities (Friday only)
Prompt:
Based on internal + external data correlations, identify 2–3 high-confidence opportunities (strong internal signals + external validation).
Write 4–5 sentences explaining:
– what the opportunity is
– why confidence is high (data points)
– what founders should do about it

23. weekend_challenge — The Weekend Challenge (Friday only)
Prompt:
Create a specific, actionable challenge for founders to complete over the weekend.
Write 2–3 sentences that:
– give a concrete task (research, validation, outreach, etc.)
– explain why it matters
– make it feel achievable but meaningful

24. monday_preview — Preview of Monday (Friday only)
Prompt:
Write a 2–3 sentence teaser for what Monday's newsletter will cover.
Make it curiosity-driven and hint at the key insights coming next week.

25. daily_analysis — Day-of-Week Section Router
Prompt:
Based on the value of newsletter_day, select the required sections for that day’s edition of The Startup Idea Terminal.
Only include the sections assigned to that day.
Pull insights using the specific prompts defined for each section (idea_futures, clustering, validation, deal_radar, etc).
Do not generate sections not assigned to that day.
Do not fabricate missing data.
If a required data source is missing, produce a short note explaining what the absence implies.

Follow these rules:
If newsletter_day = Monday

Generate:
idea_futures
weekend_spikes
weekly_watchlist
clustering (1 major cluster)
trends (micro-trends from external sources)

one_thing_today
If newsletter_day = Tuesday

Generate:
clustering (top 3 new clusters)
problem_heatmap (customer pain analysis)
trends (“where the opportunity hides”)
deal_radar (matching this week’s clusters)

one_thing_today
If newsletter_day = Wednesday

Generate:
idea_futures
clustering (deep analysis)
validation
deal_radar
wednesday_experiment
founder_field_note
tomorrows_question
one_thing_today
If newsletter_day = Thursday

Generate:
why_ideas_fail (use validation + clustering inputs)
execution_gaps (MVP, landing pages, Base44 metrics)
monthly_progress (idea → MVP → revenue trends)
anti_hype_section (markets to avoid)
category_teardown
one_thing_today
tomorrows_question

If newsletter_day = Friday

Generate:
weekly_top_10_ideas
cluster_of_the_week
founder_of_the_week
deal_radar (micro funding roundup)
high_confidence_opportunities
weekend_challenge
monday_preview
The output must be cohesive, high-signal, written in Terminal voice, and follow the narrative order for that day.`;

  // Check if this is the daily_analysis router section
  if (section === 'daily_analysis') {
    // For daily_analysis, we need to pass all data blocks and let the AI router decide
    // The newsletter_day should be in the data object
    const newsletter_day = data.newsletter_day || data._metadata?.newsletter_day || null;
    
    if (!newsletter_day) {
      console.warn('newsletter_day not found in data. Using fallback.');
      return await generateFallbackInsight(data, section);
    }
    
    // Create a comprehensive data object with all sections for the router
    const routerData = {
      newsletter_day: newsletter_day,
      ...data
    };
    
    // Use the daily_analysis prompt which includes routing logic
    const routerPrompt = prompt; // The full prompt includes daily_analysis instructions
    
    try {
      const response = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `${routerPrompt}\n\nData: ${JSON.stringify(routerData, null, 2)}`
          }
        ],
        max_tokens: config.openai.maxTokens || 4000,
        temperature: config.openai.temperature || 0.7
      });
      
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error(`Error generating daily_analysis insight:`, error.message);
      return await generateFallbackInsight(data, section);
    }
  }

  // For regular sections, extract only the relevant section prompt
  // Find the section-specific prompt from the full prompt list
  const sectionPromptMatch = prompt.match(new RegExp(`\\d+\\.\\s+${section}[^\\d]+?Prompt:([\\s\\S]+?)(?=\\n\\d+\\.|$)`, 'i'));
  const sectionSpecificPrompt = sectionPromptMatch 
    ? sectionPromptMatch[1].trim()
    : `Generate content for the ${section} section based on the provided data. Write in Terminal voice: punchy, data-driven, and insightful.`;
  
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Section: ${section}\n\n${sectionSpecificPrompt}\n\nData: ${JSON.stringify(data, null, 2)}`
        }
      ],
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature
    });
    
    return response.choices[0].message.content.trim();
    
  } catch (error) {
    console.error(`Error generating insight for ${section}:`, error.message);
    // Fallback to simple text if AI fails
    return await generateFallbackInsight(data, section);
  }
}

/**
 * Generate fallback summary without AI
 * @param {string} text - Text to summarize
 * @param {Object} options - Summary options
 * @returns {string} Simple fallback summary
 */
function generateFallbackSummary(text, options = {}) {
  const { maxLength = 200 } = options;
  const words = text.split(/\s+/);
  if (words.length <= maxLength) {
    return text;
  }
  return words.slice(0, maxLength).join(' ') + '...';
}

/**
 * Generate fallback insight without AI (simple text generation)
 * @param {Object} data - Data to summarize
 * @param {string} section - Section name
 * @returns {Promise<string>} Simple fallback text
 */
async function generateFallbackInsight(data, section) {
  // Generate simple text summaries based on data
  try {
    if (section === 'idea_futures' && data.categories) {
      const topCategory = data.categories[0];
      if (topCategory) {
        return `The ${topCategory.name} category leads with ${topCategory.count} ideas, showing a ${(topCategory.delta * 100).toFixed(1)}% change.`;
      }
    }
    if (section === 'clustering' && data.clusters) {
      const topCluster = data.clusters[0];
      if (topCluster) {
        return `Emerging cluster: "${topCluster.name}" with ${topCluster.count} related ideas, growing ${topCluster.wow.toFixed(1)}% week-over-week.`;
      }
    }
    if (section === 'validation' && data.stats) {
      return `Validation metrics: ${((data.stats.mvp || 0) * 100).toFixed(1)}% at MVP stage, ${((data.stats.paying || 0) * 100).toFixed(1)}% with paying customers.`;
    }
    if (section === 'deal_radar' && data.funding) {
      const topDeal = data.funding[0];
      if (topDeal) {
        return `Notable funding: ${topDeal.company} raised $${topDeal.amount} in the ${topDeal.category || 'general'} category.`;
      }
    }
    if (section === 'trends' && data.trends) {
      const topTrend = data.trends[0];
      if (topTrend) {
        return `Trending: "${topTrend.keyword}" showing ${(topTrend.interest_change * 100).toFixed(1)}% interest change.`;
      }
    }
    if (section === 'problem_heatmap' && data.problems) {
      const topProblem = data.problems[0];
      if (topProblem) {
        // Try to translate the problem text if it's non-English
        let problemText = topProblem.problem;
        if (isLikelyNonEnglish(problemText)) {
          // If translation is available, use it; otherwise use a generic message
          if (openai && config.openai.apiKey) {
            try {
              problemText = await translateToEnglish(problemText);
            } catch (e) {
              // If translation fails, use generic text
              problemText = `[Problem #1]`;
            }
          } else {
            // No translation available - use generic identifier
            problemText = `[Top Problem]`;
          }
        }
        return `Top problem: "${problemText}" mentioned ${topProblem.count} times.`;
      }
    }
    if (section === 'signal_boost' && data.articles) {
      const topArticle = data.articles[0];
      if (topArticle) {
        return `${topArticle.source}: "${topArticle.title}" - validates recent trend.`;
      }
    }
    if (section === 'signal_score' && data.score) {
      const score = data.score;
      return `${score.average || 0} (top decile ${score.topDecile || 0}+). Rules passed: clear problem (${score.rules?.clearProblem || 0}%), named competitor (${score.rules?.namedCompetitor || 0}%), <50 words (${score.rules?.conciseDescription || 0}%).`;
    }
    if (section === 'wednesday_experiment') {
      const totalIdeas = data.totalIdeas || 0;
      const validation = data.validation || {};
      const mvpPct = ((validation.mvp || 0) * 100).toFixed(1);
      const payingPct = ((validation.paying || 0) * 100).toFixed(1);
      return totalIdeas
        ? `${totalIdeas.toLocaleString()} ideas reviewed; only ${mvpPct}% have an MVP and ${payingPct}% see revenue. Most teams still struggle to prove demand with real customers.`
        : `Most submissions still lack proof. Only ${mvpPct}% have an MVP and ${payingPct}% see revenue — validation remains the bottleneck.`;
    }
    if (section === 'founder_field_note' && data.problems) {
      const topProblem = data.problems[0];
      if (topProblem) {
        return `“We stopped building generic tools and chased the #1 problem: ${topProblem.problem}. Charging early showed who needed us most.”`;
      }
    }
    if (section === 'tomorrows_question') {
      const trend = data.trends && data.trends[0];
      if (trend) {
        const change = ((trend.interest_change || 0) * 100).toFixed(1);
        return `Tomorrow we dissect "${trend.keyword}" (${change}% interest swing). We’ll separate the 9% of AI agent ideas that work from the 91% that stall.`;
      }
      return `Tomorrow we’ll break down the AI agent submissions that actually convert and the signals investors are watching.`;
    }
    if (section === 'one_thing_today') {
      const topCategory = data.categories && data.categories[0];
      const categoryName = topCategory ? topCategory.name : 'your niche';
      return `Open a sheet and list 50 ${categoryName} operators who feel the pain you’re solving. No paid ads — just people you can DM today.`;
    }
  } catch (error) {
    console.warn(`Error generating fallback insight for ${section}:`, error.message);
  }
  return `Data available for ${section}. AI summarization not configured.`;
}

/**
 * Generate multiple insights in parallel
 * @param {Object} dataBlocks - Object with section names as keys and data as values
 * @returns {Promise<Object>} Object with generated insights
 */
export async function generateMultipleInsights(dataBlocks) {
  // Check if daily_analysis router block exists
  if (dataBlocks.daily_analysis && dataBlocks.daily_analysis.newsletter_day) {
    console.log(`Using weekday router for: ${dataBlocks.daily_analysis.newsletter_day}`);
    
    // Use the router to generate only the sections for this weekday
    const routerInsight = await generateInsight(dataBlocks.daily_analysis, 'daily_analysis');
    
    // Parse the router output to extract individual sections
    // The router should return a JSON object with section names as keys
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(routerInsight);
      return parsed;
    } catch {
      // If not JSON, try to extract sections from markdown format
      // The router should output sections in a structured format
      // For now, we'll need to parse it or have the AI return JSON
      console.warn('Router output is not JSON. Attempting to parse structured text...');
      
      // Fallback: generate individual sections based on weekday requirements
      return await generateWeekdaySections(dataBlocks);
    }
  }
  
  // Fallback: generate all sections individually (old behavior)
  console.log('No daily_analysis router found. Generating all sections individually.');
  const insights = {};
  const promises = [];
  
  for (const [section, data] of Object.entries(dataBlocks)) {
    // Skip metadata and daily_analysis itself
    if (section === '_metadata' || section === 'daily_analysis') continue;
    
    promises.push(
      generateInsight(data, section)
        .then(insight => ({ section, insight }))
        .catch(async error => {
          console.error(`Failed to generate insight for ${section}:`, error.message);
          const fallback = await generateFallbackInsight(data, section);
          return { section, insight: fallback };
        })
    );
  }
  
  const results = await Promise.all(promises);
  results.forEach(({ section, insight }) => {
    insights[section] = insight;
  });
  
  return insights;
}

/**
 * Generate sections based on weekday requirements
 * @param {Object} dataBlocks - All data blocks
 * @returns {Promise<Object>} Insights object with only weekday-required sections
 */
async function generateWeekdaySections(dataBlocks) {
  const newsletter_day = dataBlocks.daily_analysis?.newsletter_day || 
                         dataBlocks._metadata?.newsletter_day || 
                         new Date().toLocaleDateString('en-US', { weekday: 'long' });
  
  const insights = {};
  const requiredSections = getRequiredSectionsForWeekday(newsletter_day);
  
  console.log(`Generating ${requiredSections.length} sections for ${newsletter_day}:`, requiredSections);
  
  const promises = requiredSections.map(section => {
    const data = dataBlocks[section] || dataBlocks.daily_analysis;
    return generateInsight(data, section)
      .then(insight => ({ section, insight }))
      .catch(async error => {
        console.error(`Failed to generate insight for ${section}:`, error.message);
        const fallback = await generateFallbackInsight(data, section);
        return { section, insight: fallback };
      });
  });
  
  const results = await Promise.all(promises);
  results.forEach(({ section, insight }) => {
    insights[section] = insight;
  });
  
  return insights;
}

/**
 * Get required sections for a specific weekday
 * @param {string} weekday - Weekday name (Monday, Tuesday, etc.)
 * @returns {Array<string>} Array of required section names
 */
function getRequiredSectionsForWeekday(weekday) {
  const day = weekday.toLowerCase();
  
  if (day === 'monday') {
    // MONDAY — Trendline Monday
    // Required: Idea Futures Index, Weekend Spikes, This Week's Watchlist, One Major Cluster, Micro-Trends, One Thing To Do Today
    return ['idea_futures', 'weekend_spikes', 'weekly_watchlist', 'clustering', 'trends', 'one_thing_today'];
  } else if (day === 'tuesday') {
    // TUESDAY — Market Map Tuesday
    // Required: Idea Futures Index, Top 3 New Clusters, Customer Pain Analysis, Opportunities in the Gaps, Early Market Signals, Dealflow that Matches Clusters, One Thing To Do Today
    return ['idea_futures', 'clustering', 'problem_heatmap', 'opportunities_in_gaps', 'early_market_signals', 'deal_radar', 'one_thing_today'];
  } else if (day === 'wednesday') {
    // WEDNESDAY — Pattern Watch Wednesday
    // Required: Idea Futures Index, Deep Clustering Report, Validation Reality Check, Deal Radar, Wednesday Experiment, Founder Field Note, Tomorrow's Question, One Thing To Do Today
    return ['idea_futures', 'clustering', 'validation', 'deal_radar', 'wednesday_experiment', 'founder_field_note', 'tomorrows_question', 'one_thing_today'];
  } else if (day === 'thursday') {
    // THURSDAY — Reality Check Thursday
    // Required: Idea Futures Index, Why Ideas Fail, Execution Gaps, Monthly Progress Snapshot, Anti-Hype Section, Category Deep Dive, One Thing To Do Today, Tomorrow's Question
    return ['idea_futures', 'why_ideas_fail', 'execution_gaps', 'monthly_progress', 'anti_hype_section', 'category_teardown', 'one_thing_today', 'tomorrows_question'];
  } else if (day === 'friday') {
    // FRIDAY — Cohort Report Friday
    // Required: Idea Futures Index, Top 10 Ideas of the Week, Cluster-of-the-Week, Founder-of-the-Week, Micro Funding Roundup, High-Confidence Opportunities, The Weekend Challenge, Preview of Monday
    return ['idea_futures', 'weekly_top_10_ideas', 'cluster_of_the_week', 'founder_of_the_week', 'deal_radar', 'high_confidence_opportunities', 'weekend_challenge', 'monday_preview'];
  }
  
  // Default: return all common sections
  return ['idea_futures', 'clustering', 'validation', 'deal_radar', 'one_thing_today'];
}

/**
 * Extract key points from text
 * @param {string} text - Text to extract key points from
 * @param {number} maxPoints - Maximum number of key points
 * @returns {Promise<Array>} Array of key points
 */
export async function extractKeyPoints(text, maxPoints = 5) {
  // Check if OpenAI is configured
  if (!openai || !config.openai.apiKey) {
    console.warn('OpenAI API key not configured. Using fallback key point extraction.');
    // Simple fallback: return first few sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.slice(0, maxPoints).map(s => s.trim());
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts key points from text. Return only a bulleted list of key points.'
        },
        {
          role: 'user',
          content: `Extract the top ${maxPoints} key points from this text:\n\n${text}`
        }
      ],
      max_tokens: 500,
      temperature: 0.5
    });
    
    const content = response.choices[0].message.content.trim();
    // Parse bullet points
    return content.split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^[-•\d.\s]+/, '').trim())
      .slice(0, maxPoints);
    
  } catch (error) {
    console.error('Error extracting key points:', error.message);
    return [];
  }
}


