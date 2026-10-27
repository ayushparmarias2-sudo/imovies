const config = require('../config/env');

/** Converts "YYYY-MM-DD" (cinema-local day, see TZ_OFFSET_MINUTES) to a UTC [start, end) range. */
function localDayRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - config.tzOffsetMinutes * 60000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
module.exports = { localDayRange };
