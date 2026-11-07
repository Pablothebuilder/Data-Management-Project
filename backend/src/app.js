// Builds the Express application (kept separate from server.js so tests can
// create an app without opening a port).
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config/env');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');
const { errorHandler, notFoundApi } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Basic security headers (no external CDNs are used, so 'self' is enough).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https://images.openfoodfacts.org; style-src 'self' 'unsafe-inline'; script-src 'self'");
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    name: 'nutricart.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // idle timeout: each request extends the session
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 2 * 60 * 60 * 1000 },
  }));

  // Static assets: CSS/JS/images, XML schema, and Chart.js from node_modules.
  app.use(express.static(path.join(config.FRONTEND_DIR, 'public'), { index: false }));
  app.use('/vendor', express.static(path.join(path.dirname(require.resolve('chart.js')), '..', 'dist'), { index: false }));

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', apiRoutes);
  app.use('/api', notFoundApi);
  app.use(pageRoutes);
  app.use((req, res) => res.status(404).sendFile(path.join(config.FRONTEND_DIR, 'views', '404.html')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
