# IDEA FUTURES INDEX - How It Works

## Overview
The **IDEA FUTURES INDEX** section shows the top 5 categories with the highest week-over-week (WoW) growth, displayed as "24HR MOVERS". This helps identify trending categories based on idea submission patterns.

## Data Source

### Primary Source: `tool_chart.txt`
- **URL**: `https://validatorai.com/postback/tool_chart.txt`
- **Format**: Pipe-separated values: `date|email|name|score|category`
- **Example**: `2025-11-14|user@example.com|My Startup|75|SaaS / HealthTech`

### Secondary Source: `free_tool_log.txt` (Fallback)
- **URL**: `https://validatorai.com/postback/free_tool_log.txt`
- Used when chart data is unavailable

## Data Collection Process

1. **Fetch Chart Data** (`collectors/internal.js`)
   - Downloads `tool_chart.txt` from the postback URL
   - Parses pipe-separated entries
   - Extracts category information (handles multi-category entries like "SaaS / HealthTech")

2. **Date Filtering**
   - **Current Week**: Last 7 days of entries
   - **Previous Week**: 7-14 days ago (for comparison)
   - Uses `getDateDaysAgo()` from `utils/dateUtils.js`

3. **Category Counting**
   - Counts occurrences of each category in current week
   - Counts occurrences of each category in previous week
   - Handles categories with "/" separator (splits and counts each part)

## Calculation Method

### Week-Over-Week Change (Delta)
Located in: `utils/dateUtils.js` → `calculateWoWChange()`

```javascript
function calculateWoWChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 1 : 0; // 100% change if previous was 0
  }
  return (current - previous) / previous;
}
```

**Examples:**
- Previous: 10, Current: 13 → Delta: 0.3 (30% increase)
- Previous: 5, Current: 2 → Delta: -0.6 (-60% decrease)
- Previous: 0, Current: 5 → Delta: 1.0 (100% - new category)

### Filtering & Sorting (in `newsletter/builder.js`)

1. **Filter Out Noise**
   - Removes new categories (delta = 1) with very low counts (< 5 submissions)
   - This prevents showing categories with only 1-2 submissions that happen to be new

2. **Weighted Sorting**
   - Uses a weighted score: `delta * 0.7 + normalized_count * 0.3`
   - Prioritizes high growth (delta) but also considers volume (count)
   - This ensures meaningful trends are shown, not just statistical noise

3. **Top 5 Selection**
   - Takes the top 5 categories after filtering and sorting

## Display Format

### Bar Chart
- **Length**: 13 characters total
- **Filled blocks** (`█`): Represents **market share** (percentage of total ideas)
- **Empty blocks** (`░`): Remaining space
- **Scaling**: Based on `(category_count / total_ideas) * 100`
- **Note**: Bars show market share, not WoW change. This ensures visual representation of actual category size.

### Percentage Label
- Shows **week-over-week (WoW) growth rate** - how much the category grew compared to last week
- **Important**: These percentages are independent growth rates and do NOT add up to 100%
- **New categories** (delta = 1) with count < 10: Shows "NEW" instead of "+100%"
- **Normal categories**: Shows actual WoW percentage (e.g., "+31%", "-19%")
- **Example**: If E-Commerce has +69%, it means E-Commerce submissions grew 69% compared to last week

### Icons
- 🔥 (Fire): Delta >= 25%
- ❄️ (Snowflake): Delta <= -15%
- (No icon): Between -15% and +25%

## Example Calculation

**Scenario:**
- **Current Week**: "SaaS" appears 20 times
- **Previous Week**: "SaaS" appeared 15 times

**Calculation:**
1. Delta = (20 - 15) / 15 = 0.333 (33.3% increase)
2. Delta Percent = 33%
3. Display: `SaaS ████████████░ +33% 🔥`

**New Category Example:**
- **Current Week**: "Pet Tech" appears 8 times
- **Previous Week**: "Pet Tech" appeared 0 times

**Calculation:**
1. Delta = 1.0 (100% - new category)
2. Since count (8) >= 5, it's included
3. Since count (8) < 10, shows "NEW" instead of "+100%"
4. Display: `Pet Tech ████████████░ NEW 🔥`

## Files Involved

1. **`collectors/internal.js`**
   - `getCategoryStatsFromChart()`: Counts categories from chart data
   - `getCategoryStats()`: Fallback using idea data
   - `collectInternalData()`: Main collection function

2. **`utils/dateUtils.js`**
   - `calculateWoWChange()`: Calculates week-over-week percentage change

3. **`newsletter/builder.js`**
   - `buildIdeaFuturesSection()`: Formats and displays the section

4. **`processors/generateInsights.js`**
   - Prepares category data for the newsletter builder

## Data Flow

```
tool_chart.txt
    ↓
collectors/internal.js (fetchChartData)
    ↓
getCategoryStatsFromChart() (count by week)
    ↓
calculateWoWChange() (calculate delta)
    ↓
processors/generateInsights.js (prepare data)
    ↓
newsletter/builder.js (buildIdeaFuturesSection)
    ↓
output/YYYY-MM-DD.html (final newsletter)
```

## Troubleshooting

**Issue: All categories show +100%**
- **Cause**: All top categories are new (didn't exist in previous week)
- **Fix**: Filter out new categories with low counts (< 5) - already implemented

**Issue: Categories don't match expected data**
- **Check**: Verify `data/internal/YYYY-MM-DD.json` has correct category counts
- **Check**: Verify date ranges are correct (current week vs previous week)

**Issue: Percentages seem incorrect**
- **Check**: Verify `calculateWoWChange()` logic
- **Check**: Verify previous week data exists and is being counted correctly

