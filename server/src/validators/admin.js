const { z, objectId, idParam, page } = require('./common');
exports.listBookings = {
  query: z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED']).optional(),
    show: objectId.optional(),
    page, limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};
exports.idParam = { params: idParam };
exports.notificationList = { query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) };
