const ApiError = require('../utils/ApiError');

exports.notFound = (req, res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.path}`));

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let status = 500;
  let message = err.message;
  let errors = err.details;

  if (err instanceof ApiError) status = err.status;
  else if (err.name === 'ValidationError') {
    status = 400; message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') { status = 400; message = `Invalid value for ${err.path}`; }
  else if (err.code === 11000) {
    status = 409; message = `Duplicate value for: ${Object.keys(err.keyPattern || {}).join(', ') || 'unique field'}`;
  } else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Request body too large'; }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err); // never logs bodies/cookies
    message = 'Internal server error';
    errors = undefined;
  }
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
};
