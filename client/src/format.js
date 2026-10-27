export const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const duration = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
export const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDateTime = (d) => `${fmtDay(d)}, ${fmtTime(d)}`;
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
/** Turns an ApiError into a readable string including field-level validation messages. */
export const errorText = (e) =>
  Array.isArray(e?.details) && e.details.length ? e.details.map((d) => d.message).join(' • ') : e?.message || 'Something went wrong';
