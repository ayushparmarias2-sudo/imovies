const { z } = require('zod');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParam = z.object({ id: objectId });
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(12);
const nonEmpty = (s) => s.refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');
module.exports = { z, objectId, idParam, page, limit, nonEmpty };
