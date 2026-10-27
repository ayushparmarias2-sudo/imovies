const { z, objectId, idParam } = require('./common');

exports.reserve = {
  body: z.object({
    showId: objectId,
    seats: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]\d{1,2}$/, 'Invalid seat label')).min(1, 'Select at least one seat').max(26),
    // any client-supplied price/amount fields are ignored (stripped) - totals are computed on the server
  }),
};
exports.pay = { params: idParam, body: z.object({ outcome: z.enum(['SUCCESS', 'FAILURE']) }) };
exports.idParam = { params: idParam };
