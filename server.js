// server.js — Sicheres Backend fuer Portfolio (Discord-OAuth-Login entfernt, nur noch statisches Hosting + Live-Presence-Badge)
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const {
  PORT = 3000,
  NODE_ENV = 'production',
  TRUST_PROXY = '1',
} = process.env;

const app = express();
app.set('trust proxy', Number(TRUST_PROXY));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://lanyard.cnrad.dev', 'https://api.lanyard.rest'],
        connectSrc: ["'self'", 'https://api.lanyard.rest', 'wss://api.lanyard.rest'],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  })
);
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server laeuft auf Port ${PORT} (${NODE_ENV})`);
});
