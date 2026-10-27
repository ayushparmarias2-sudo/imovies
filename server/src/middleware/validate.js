const ApiError = require('../utils/ApiError');

/** validate({ params, query, body }) with zod schemas; parsed values land in req.valid.* */
module.exports = (schemas) => (req, res, next) => {
  req.valid = {};
  const issues = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (r.success) req.valid[part] = r.data;
    else {
      issues.push(...r.error.issues.map((i) => ({
        field: (part === 'body' ? i.path : [part, ...i.path]).join('.') || part,
        message: i.message,
      })));
    }
  }
  if (issues.length) return next(new ApiError(400, 'Validation failed', issues));
  next();
};
