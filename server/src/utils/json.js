/** Consistent JSON output: expose `id`, drop `__v`. */
module.exports = (schema, extra) =>
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      if (extra) extra(ret);
      return ret;
    },
  });
