/**
 * Date utility functions for calculating week-over-week changes,
 * date formatting, and time-based calculations
 */

/**
 * Get date string in YYYY-MM-DD format
 * @param {Date} date - Date object (defaults to today)
 * @returns {string} Formatted date string
 */
export function getDateString(date = new Date()) {
  // Use UTC to ensure consistent date calculation regardless of server timezone
  // This ensures the date matches the actual calendar date
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get date for N days ago
 * @param {number} days - Number of days ago
 * @returns {Date} Date object
 */
export function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Get date string for N days ago
 * @param {number} days - Number of days ago
 * @returns {string} Formatted date string
 */
export function getDateStringDaysAgo(days) {
  return getDateString(getDateDaysAgo(days));
}

/**
 * Get start of week (Monday)
 * @param {Date} date - Date object (defaults to today)
 * @returns {Date} Start of week
 */
export function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get date for one week ago
 * @param {Date} date - Date object (defaults to today)
 * @returns {Date} Date object for one week ago
 */
export function getWeekAgo(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 7);
  return d;
}

/**
 * Calculate week-over-week percentage change
 * @param {number} current - Current week value
 * @param {number} previous - Previous week value
 * @returns {number} Percentage change (e.g., 0.27 for 27% increase)
 */
export function calculateWoWChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 1 : 0; // 100% change if previous was 0
  }
  return (current - previous) / previous;
}

/**
 * Format percentage change for display
 * @param {number} change - Percentage change (e.g., 0.27)
 * @returns {string} Formatted string (e.g., "+27%" or "-19%")
 */
export function formatPercentageChange(change) {
  const sign = change >= 0 ? '+' : '';
  const percent = (change * 100).toFixed(1);
  return `${sign}${percent}%`;
}

/**
 * Get date range for lookback period
 * @param {number} days - Number of days to look back
 * @returns {Object} { startDate, endDate, startDateString, endDateString }
 */
export function getLookbackRange(days) {
  const endDate = new Date();
  const startDate = getDateDaysAgo(days);
  
  return {
    startDate,
    endDate,
    startDateString: getDateString(startDate),
    endDateString: getDateString(endDate)
  };
}

/**
 * Check if date is within range
 * @param {Date} date - Date to check
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {boolean} True if date is within range
 */
export function isDateInRange(date, startDate, endDate) {
  return date >= startDate && date <= endDate;
}


