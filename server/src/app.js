const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const config = require('./config/env');
const routes = require('./routes');
const { originCheck } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)), credentials: true }));
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev')); // logs method/url/status only
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(originCheck);

app.get('/api/health', (req, res) =>
  res.json({ success: true, data: { status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' } }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
