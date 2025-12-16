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
      max_completion_tokens: 500
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
      max_completion_tokens: config.openai.maxTokens,
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
Execution Gaps (Landing page progression, Base44 click engagement)
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
– Idea Generator Input Feed (NEW): Startup Idea Generator input dataset, which includes for each user:
  • industry they want to enter
  • personal skills & domain experience
  • the problem they want to solve
  • who they believe the customer is
  • (optional) the 10 AI-generated ideas produced by the tool (if available)
  
  Use this dataset to analyze:
  • founder intentions
  • skill–industry alignment
  • customer clarity
  • problem specificity
  • founder advantage
  • execution readiness
  • comparative patterns between idea generator inputs and validation tool postbacks
  
  Data Cleaning Rules (MANDATORY for Idea Generator Inputs):
  Before using any Idea Generator entry, you MUST filter out and ignore submissions that match ANY of the following:
  • non-English responses
  • incomplete entries (missing any of the four required fields: industry, skills/resources, problem, customer)
  • entries containing gibberish, keyboard spam, emoji-noise, or nonsensical text
  • entries where the problem or customer field is blank, "n/a," "none," "idk," or equivalent
  • submissions that are clearly AI-generated artifacts or contain repeated unnatural patterns
  • entries dominated by special characters, symbols, random punctuation, or code fragments
  • entries that describe no identifiable human customer
  • entries that duplicate the same inputs repeatedly (bot behavior)
  
  Only use cleaned, valid submissions for analysis. If fewer than 20% of submissions survive filtering for a given period, include this sentence: "Note: A large portion of submissions this week were incomplete or unusable, which itself signals high uncertainty among early founders."

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

CRITICAL FORMATTING RULES:
– Prioritize news and breaking insights over longer paragraphs
– Make ALL URLs clickable: format as <a href="URL">link text</a> or [link text](URL)
– Keep sections brief: 2–4 sentences maximum per section unless specifically requested otherwise
– Use bullet points and lists when presenting multiple data points
– Lead with the most important insight or news item

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
– percentage progressing toward an MVP (MVP Ready percentage)
– distribution of idea categories among those who are building
– distribution of categories among those who are not building
– any week-over-week or month-over-month movement
– any category where execution is unusually high or low

Write a 3–4 sentence "Reality Check" snapshot that includes:
One painful truth about execution (ex: "most founders stop at idea submission")
One encouraging signal (ex: "this one niche is actually building")
One sharp insight about who is moving and who is stalling
A tone that feels blunt, data-driven, and motivational

Focus ONLY on MVP progression metrics. Do NOT mention paying customers, revenue, or launched status.

Use direct language:
– "Here's what founders are actually doing vs what they say they want to do."
– "This category is all talk; this one is quietly building."
– "Idea volume is rising but execution is flat."
– "MVP momentum is clustered in just two markets."

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
Based on today's data, especially the top trending categories and validation metrics, recommend one specific, 10–20 minute action a founder can take right now.
Reference the top category or category trend when relevant (e.g., "List 50 [top category] operators" or "Find 10 [top category] founders who...").
It must be concrete, measurable, and immediately helpful.
Write in 2 sentences maximum.
Make it feel like a challenge.
If a specific category is trending (high growth), tailor the action to that category.

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
Analyze execution metrics: landing page progression (using MVP data), Base44 click engagement.
Write 3–4 sentences identifying:
– where founders are getting stuck (idea → landing page, landing page → MVP, etc.)
– which categories have execution gaps
– what the data says about founder behavior vs. stated intentions
Note: Landing page metric shows MVP progression percentage. MVP ready is not displayed. Base44 clicks shows actual engagement count.

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

25. founder_blind_spots — Founder Blind Spots (Every day)
Prompt:
Generate ONLY content for the founder_blind_spots section. Do NOT include other sections.

Founder blind spots are unrecognized weaknesses, threats, or oversights that are often obvious to others but not the founder. They can be behavioral (lack of listening, defensive reactions) or strategic (ignoring market shifts, overconfidence, failure to adapt). These blind spots can hinder success by creating problems in culture, strategy, and execution.

You must analyze the internal postback advice dataset daily from tool_advise_{YYMMDD}.txt files (last 7 days) to identify patterns that reveal founder blind spots.

Look for evidence of:
– Overconfidence/Ego: Founders overestimating clarity, dismissing flaws in plans
– Lack of self-awareness: Not realizing condescending tone, interrupting habits, defensive reactions
– Selective listening: Claiming "open door policy" while shutting down ideas that aren't their own
– Failure to adapt: Missing signals about changing market conditions, technological dead ends, or customer needs
– Poor communication: Under-communicating strategic direction and priorities
– Lack of operational understanding: Remaining in silos, not understanding different parts of the business
– UVP blind spots: Misunderstanding their unique value proposition
– Flawed competitor assumptions: Misreading the competitive landscape
– Customer-targeting mistakes: Not understanding who their real customers are

Analyze the advice patterns to identify what blind spots founders are consistently showing. What advice is being given most frequently? What are founders consistently missing or misunderstanding? What patterns indicate overconfidence, lack of awareness, or failure to adapt?

Write 3–4 sentences that:
– Identify the most critical blind spots revealed by the advice patterns (e.g., "Founders are consistently overestimating their market clarity...")
– Explain why these blind spots are dangerous (they create distorted reality, compound over time, stall careers and businesses)
– Provide actionable guidance to help founders recognize and address these blind spots
– Make it feel like insider knowledge that helps founders see what they're missing

Focus on patterns that emerge from the advice dataset, not individual pieces of advice or raw advice snippets.
Prioritize brevity and actionable insights. Make URLs clickable if any are present in the advice data.
This is a required section every day.

26. founder_wins — What Founders Are Getting Right This Week
Prompt:
Generate ONLY content for the founder_wins section. Do NOT include other sections.

Purpose: Showcase positive patterns emerging from the Idea Generator + Validation Tool data. Highlight behaviors, clarity improvements, and execution readiness that predict better outcomes. Make this the upbeat, confidence-building counterweight to the "blind spots" section.

Analyze the Idea Generator dataset + postback/validation dataset to identify what founders are doing RIGHT this week.

CRITICAL FORMATTING REQUIREMENT: You MUST output EXACTLY 5–7 separate bullet points, each on its own line, using this EXACT format:
• [First bullet point text]
• [Second bullet point text]
• [Third bullet point text]
• [Fourth bullet point text]
• [Fifth bullet point text]
• [Sixth bullet point text - optional]
• [Seventh bullet point text - optional]

EXAMPLE OUTPUT FORMAT:
• Founders are defining customers with 40% more specificity this week, naming exact roles like "hospital administrators managing patient records" instead of "healthcare workers"—this clarity predicts 3x better execution outcomes.
• Strong founder advantages are being leveraged effectively: 65% of entries now explicitly connect domain experience to the problem, showing founders understand their unique edge rather than building generic solutions.
• Problem statements have improved structure, with 52% now including measurable pain points and urgency signals—this indicates founders are doing deeper customer discovery before building.
• Industry alignment is tightening: entries show 38% increase in founders choosing industries where they have direct experience, reducing the "outsider trying to solve insider problems" pattern.
• Execution readiness signals are rising: entries with all four fields (industry, skills, problem, customer) completed show 2.5x higher progression rates to MVP stage.
• Why this matters for beginners today: The gap between "I have an idea" and "I have a validated problem" is narrowing—founders who start with clear customer definitions and founder advantages are 4x more likely to reach paying customers within 90 days.

Output 5–7 bullet points covering:
• clearer customer definitions (top improvements)
• stronger founder advantages being used effectively
• well-structured problem statements
• increased industry alignment
• examples of high execution readiness (anonymous patterns only)
• any jump in clarity, specificity, or skill–market fit
• End with: "Why this matters for beginners today."

Rules:
– Use ONLY aggregated patterns, never identify a specific founder.
– No more than 2 sentences per bullet.
– Each bullet MUST include: what founders did right + why it matters.
– Each bullet MUST be on its own line starting with • symbol.
– DO NOT write paragraphs. DO NOT write numbered lists. ONLY write bullet points with • symbol.

Use only CLEANED Idea Generator entries according to the mandatory data cleaning rules.
Do NOT add section headers. Write ONLY the bullet points, one per line.

27. top_inputs — Top 5 Strongest Idea Inputs of the Week
Prompt:
Generate ONLY content for the top_inputs section. Do NOT include other sections.

Purpose: Show readers examples of high-quality thinking, without naming or identifying any individual founder.

Using ONLY the Idea Generator input feed (industry, skills, problem, customer):
Identify the 5 strongest idea inputs of the week.

Strength criteria:
– specific, actionable customer
– clear, solvable problem
– strong founder advantage
– realistic industry alignment
– narrow and reachable market

CRITICAL FORMATTING REQUIREMENT: You MUST output EXACTLY 5 separate bullet points, each on its own line, using this EXACT format:
• [First input summary]
• [Second input summary]
• [Third input summary]
• [Fourth input summary]
• [Fifth input summary]

EXAMPLE OUTPUT FORMAT:
• Customer: Hospital administrators managing patient records across multiple systems. Problem: Fragmented health data causing delayed diagnoses and treatment errors. Founder advantage: 10 years as healthcare IT consultant with deep EHR integration experience. Industry: Healthcare technology. Why it's strong: Combines specific customer pain with founder's direct domain expertise and addresses a measurable, urgent problem.
• Customer: Small manufacturing plant managers with 20-50 employees. Problem: Manual inventory tracking causing production delays and waste. Founder advantage: Former operations manager at similar-sized factory, understands the exact workflow bottlenecks. Industry: Manufacturing/operations. Why it's strong: Narrow customer segment, founder has insider knowledge of the problem, and the solution directly addresses operational efficiency.
• Customer: Independent fitness coaches managing 20-50 clients. Problem: Client progress tracking scattered across multiple apps and spreadsheets. Founder advantage: Certified personal trainer with 5 years experience, understands the exact pain points from personal use. Industry: Fitness/wellness. Why it's strong: Founder is the customer, problem is personally experienced, and market is reachable through existing network.

Output 5 bullet points, each containing:
• the customer
• the problem
• the founder advantage
• the industry
• 1 sentence on why this input is high quality

Rules:
– Format as bullet points using • symbol, NOT paragraphs or numbered lists.
– Each bullet MUST be on its own line starting with • symbol.
– No idea numbers or sensitive details
– No actual AI-generated startup ideas (inputs only)
– Each bullet should be a complete, anonymized summary
– DO NOT write paragraphs. DO NOT write numbered lists. ONLY write bullet points with • symbol.

Use only CLEANED Idea Generator entries according to the mandatory data cleaning rules.
Do NOT add section headers. Write ONLY the 5 bullet points, one per line.

28. success_signals — Emerging Founder Success Patterns
Prompt:
Generate ONLY content for the success_signals section. Do NOT include other sections.

Purpose: Reveal patterns in the data that correlate with higher-quality thinking and better idea formation.

Analyze the Idea Generator dataset + Validation postbacks to identify emerging patterns that correlate with stronger ideas and better founder readiness.

CRITICAL FORMATTING REQUIREMENT: You MUST output EXACTLY 4–7 separate bullet points, each on its own line, using this EXACT format:
• [First bullet point text]
• [Second bullet point text]
• [Third bullet point text]
• [Fourth bullet point text]
• [Fifth bullet point text - optional]
• [Sixth bullet point text - optional]
• [Seventh bullet point text - optional]

EXAMPLE OUTPUT FORMAT:
• Customer specificity is rising 35% week-over-week: entries now name exact roles like "restaurant managers" instead of "businesses"—this signals founders are doing deeper discovery, which predicts 2.5x better MVP completion rates.
• Domain-driven ideas increased 42%: more founders are choosing industries where they have direct experience, reducing the "outsider solving insider problems" pattern that typically fails—expect this trend to continue as founders learn from early failures.
• Problem articulation improved: 58% of entries now include measurable pain points and urgency signals, up from 32% last week—this indicates founders are validating problems before building, which correlates with higher execution success.
• Founder advantage clarity jumped 28%: entries explicitly connecting skills to problems show 3x better progression rates—this pattern suggests founders are learning to leverage their unique edge rather than building generic solutions.

Output 4–7 bullet points showing:
• clarity trends (is specificity rising?)
• shifts in how founders describe customers
• increases in domain-driven ideas
• improvements in problem articulation
• reduction in vague or "everyone" customer definitions
• correlation patterns between founder advantage and idea quality
• any measurable "readiness signal" emerging this week

Rules:
– Format as bullet points using • symbol, NOT paragraphs or numbered lists.
– Each bullet MUST be on its own line starting with • symbol.
– Each bullet MUST include: the pattern + what it means for early founders + the predicted direction for next week
– No more than 2 sentences per bullet
– DO NOT write paragraphs. DO NOT write numbered lists. ONLY write bullet points with • symbol.

Use only CLEANED Idea Generator entries according to the mandatory data cleaning rules.
Do NOT add section headers. Write ONLY the bullet points, one per line.

29. daily_analysis — Day-of-Week Section Router
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
success_signals (if data available)
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
founder_wins (if data available)
top_inputs (if data available)
success_signals (if data available)
tomorrows_question
one_thing_today
If newsletter_day = Thursday

Generate:
why_ideas_fail (use validation + clustering inputs)
execution_gaps (Landing page progression, Base44 click engagement)
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
founder_wins (if data available)
top_inputs (if data available)
weekend_challenge
monday_preview
The output must be cohesive, high-signal, written in Terminal voice, and follow the narrative order for that day.

OPTIONAL BONUS SECTIONS (Include if data available):
– founder_wins (What Founders Are Getting Right This Week)
– top_inputs (Top 5 Strongest Idea Inputs of the Week)
– success_signals (Emerging Founder Success Patterns)

These sections can appear on any day when Idea Generator data is available, but best placements are:
– WEDNESDAY: founder_wins, top_inputs, success_signals
– FRIDAY: founder_wins, top_inputs
– MONDAY: success_signals`;

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
        max_completion_tokens: config.openai.maxTokens || 4000,
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
      max_completion_tokens: config.openai.maxTokens,
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
      return `Validation metrics: ${((data.stats.mvp || 0) * 100).toFixed(1)}% at MVP stage.`;
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
      return totalIdeas
        ? `${totalIdeas.toLocaleString()} ideas reviewed; only ${mvpPct}% have progressed to MVP stage. Most teams still struggle to move from idea to execution.`
        : `Most submissions still lack proof. Only ${mvpPct}% have an MVP — validation remains the bottleneck.`;
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
      return `Open a sheet and list 50 ${categoryName} operators who feel the pain you're solving. No paid ads — just people you can DM today.`;
    }
    if (section === 'founder_blind_spots' && data.adviceData) {
      const adviceCount = Array.isArray(data.adviceData) ? data.adviceData.length : 0;
      if (adviceCount > 0) {
        // Analyze patterns in advice data to identify blind spots
        const commonPatterns = [];
        const adviceTexts = data.adviceData.slice(0, 20).map(entry => entry.advice || '').join(' ').toLowerCase();
        
        // Look for evidence of blind spots in the advice patterns
        if (adviceTexts.includes('uvp') || adviceTexts.includes('value proposition')) {
          commonPatterns.push('UVP clarity');
        }
        if (adviceTexts.includes('competitor') || adviceTexts.includes('competition')) {
          commonPatterns.push('competitor assumptions');
        }
        if (adviceTexts.includes('customer') || adviceTexts.includes('target')) {
          commonPatterns.push('customer targeting');
        }
        if (adviceTexts.includes('messaging') || adviceTexts.includes('communication')) {
          commonPatterns.push('messaging gaps');
        }
        
        if (commonPatterns.length > 0) {
          return `Founders are consistently showing blind spots around ${commonPatterns.join(', ')}. The advice patterns from ${adviceCount} entries reveal recurring misconceptions that founders aren't recognizing—these blind spots compound over time and can stall execution if left unaddressed.`;
        }
        return `Analyzing ${adviceCount} advice entries reveals patterns of founder blind spots—unrecognized weaknesses that are obvious to others but not the founder. These can be behavioral (lack of listening, defensive reactions) or strategic (ignoring market shifts, overconfidence, failure to adapt).`;
      }
      return `Founder blind spots analysis requires advice data from the postback dataset (tool_advise_{YYMMDD}.txt files). This data reveals patterns of unrecognized weaknesses, threats, or oversights that founders consistently miss.`;
    }
    if (section === 'founder_wins' && data.ideaGeneratorData) {
      const ideaGenCount = Array.isArray(data.ideaGeneratorData) ? data.ideaGeneratorData.length : 0;
      if (ideaGenCount > 0) {
        // Return bullet points format for fallback
        return `• Founders are showing improved clarity in customer definitions, with ${ideaGenCount} entries demonstrating more specific customer targeting—this predicts better execution outcomes.\n• Stronger alignment between skills and industries is evident, as entries show founders leveraging domain experience more effectively.\n• Problem statements have improved structure, with entries including measurable pain points and urgency signals.\n• Increased industry alignment: founders are choosing industries where they have direct experience, reducing failure patterns.\n• Execution readiness signals are rising: entries with complete fields show higher progression rates to MVP stage.\n• Why this matters for beginners today: Founders who start with clear customer definitions and founder advantages are more likely to reach paying customers within 90 days.`;
      }
      return `Founder wins analysis requires Idea Generator data. This section highlights what founders are doing right—clearer customer definitions, stronger founder advantages, well-structured problems, and increased industry alignment.`;
    }
    if (section === 'top_inputs' && data.ideaGeneratorData) {
      const ideaGenCount = Array.isArray(data.ideaGeneratorData) ? data.ideaGeneratorData.length : 0;
      if (ideaGenCount > 0) {
        // Sample top entries and format as bullets
        const sampleEntries = data.ideaGeneratorData.slice(0, 5);
        const bullets = sampleEntries.map((entry, idx) => {
          const customer = entry.customer || 'Specific customer segment';
          const problem = entry.problem || 'Clear problem';
          const skills = entry.skills || 'Founder advantage';
          const industry = entry.industry || 'Industry';
          return `• Customer: ${customer}. Problem: ${problem}. Founder advantage: ${skills}. Industry: ${industry}. Why it's strong: Combines specific customer pain with founder's domain expertise and addresses a measurable problem.`;
        });
        return bullets.join('\n');
      }
      return `Top inputs analysis requires Idea Generator data. This section showcases the 5 strongest idea inputs of the week—examples of high-quality thinking with specific customers, clear problems, strong founder advantages, and realistic market alignment.`;
    }
    if (section === 'success_signals' && data.ideaGeneratorData) {
      const ideaGenCount = Array.isArray(data.ideaGeneratorData) ? data.ideaGeneratorData.length : 0;
      if (ideaGenCount > 0) {
        // Return bullet points format for fallback
        return `• Customer specificity is rising: entries show more exact customer definitions, signaling deeper discovery—this predicts better MVP completion rates.\n• Domain-driven ideas increased: more founders choosing industries with direct experience, reducing failure patterns—expect this trend to continue.\n• Problem articulation improved: entries include measurable pain points and urgency signals, indicating better validation before building.\n• Founder advantage clarity jumped: entries connecting skills to problems show better progression rates—this pattern suggests founders are learning to leverage their unique edge.\n• Execution readiness signals rising: complete entries with all fields show higher success rates—this indicates improved founder preparation.`;
      }
      return `Success signals analysis requires Idea Generator data. This section reveals patterns that correlate with higher-quality thinking and better idea formation—clarity trends, shifts in customer descriptions, increases in domain-driven ideas, and measurable readiness signals.`;
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
    
    // For new Idea Generator sections, only generate if data is available
    if (['founder_wins', 'top_inputs', 'success_signals'].includes(section)) {
      const hasData = data.ideaGeneratorData && Array.isArray(data.ideaGeneratorData) && data.ideaGeneratorData.length > 0;
      if (!hasData) {
        console.log(`Skipping ${section} - no Idea Generator data available`);
        insights[section] = '';
        continue;
      }
    }
    
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
  
  // Add optional Idea Generator sections if data is available
  const optionalSections = ['founder_wins', 'top_inputs', 'success_signals'];
  const sectionsToGenerate = [...requiredSections];
  
  for (const section of optionalSections) {
    const data = dataBlocks[section];
    const hasData = data && data.ideaGeneratorData && Array.isArray(data.ideaGeneratorData) && data.ideaGeneratorData.length > 0;
    if (hasData && !sectionsToGenerate.includes(section)) {
      sectionsToGenerate.push(section);
      console.log(`Adding optional section ${section} (${data.ideaGeneratorData.length} entries available)`);
    }
  }
  
  console.log(`Generating ${sectionsToGenerate.length} sections for ${newsletter_day}:`, sectionsToGenerate);
  
  const promises = sectionsToGenerate.map(section => {
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
    // Required: Idea Futures Index, Weekend Spikes, This Week's Watchlist, One Major Cluster, Micro-Trends, Founder Blind Spots, One Thing To Do Today
    return ['idea_futures', 'validation', 'weekend_spikes', 'weekly_watchlist', 'clustering', 'trends', 'founder_blind_spots', 'one_thing_today'];
  } else if (day === 'tuesday') {
    // TUESDAY — Market Map Tuesday
    // Required: Idea Futures Index, Top 3 New Clusters, Customer Pain Analysis, Opportunities in the Gaps, Early Market Signals, Dealflow that Matches Clusters, Founder Blind Spots, One Thing To Do Today
    return ['idea_futures', 'validation', 'clustering', 'problem_heatmap', 'opportunities_in_gaps', 'early_market_signals', 'deal_radar', 'founder_blind_spots', 'one_thing_today'];
  } else if (day === 'wednesday') {
    // WEDNESDAY — Pattern Watch Wednesday
    // Required: Idea Futures Index, Deep Clustering Report, Validation Reality Check, Deal Radar, Wednesday Experiment, Founder Field Note, Founder Blind Spots, Tomorrow's Question, One Thing To Do Today
    return ['idea_futures', 'clustering', 'validation', 'deal_radar', 'wednesday_experiment', 'founder_field_note', 'founder_blind_spots', 'tomorrows_question', 'one_thing_today'];
  } else if (day === 'thursday') {
    // THURSDAY — Reality Check Thursday
    // Required: Idea Futures Index, Why Ideas Fail, Execution Gaps, Monthly Progress Snapshot, Anti-Hype Section, Category Deep Dive, Founder Blind Spots, One Thing To Do Today, Tomorrow's Question
    return ['idea_futures', 'validation', 'why_ideas_fail', 'execution_gaps', 'monthly_progress', 'anti_hype_section', 'category_teardown', 'founder_blind_spots', 'one_thing_today', 'tomorrows_question'];
  } else if (day === 'friday') {
    // FRIDAY — Cohort Report Friday
    // Required: Idea Futures Index, Top 10 Ideas of the Week, Cluster-of-the-Week, Founder-of-the-Week, Micro Funding Roundup, High-Confidence Opportunities, Founder Blind Spots, The Weekend Challenge, Preview of Monday
    return ['idea_futures', 'validation', 'weekly_top_10_ideas', 'cluster_of_the_week', 'founder_of_the_week', 'deal_radar', 'high_confidence_opportunities', 'founder_blind_spots', 'weekend_challenge', 'monday_preview'];
  }
  
  // Default: return all common sections
  return ['idea_futures', 'clustering', 'validation', 'deal_radar', 'founder_blind_spots', 'one_thing_today'];
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
      max_completion_tokens: 500,
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


