// server.js — Sicheres Backend fuer Portfolio + Discord OAuth2 (Authorization Code + PKCE)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');

const {
  PORT = 3000,
  NODE_ENV = 'production',
  SESSION_SECRET,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_SCOPES = 'identify guilds',
  REDIS_URL,
  TRUST_PROXY = '1',
} = process.env;

if (!SESSION_SECRET || !DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error('[FATAL] Fehlende Pflicht-Umgebungsvariablen. Siehe .env.example');
  process.exit(1);
}

const app = express();
app.set('trust proxy', Number(TRUST_PROXY));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://lanyard.cnrad.dev', 'https://api.lanyard.rest'],
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

let sessionStore;
if (REDIS_URL) {
  const { createClient } = require('redis');
  const RedisStore = require('connect-redis').default;
  const redisClient = createClient({ url: REDIS_URL });
  redisClient.connect().catch((e) => console.error('[Redis] Verbindung fehlgeschlagen:', e.message));
  sessionStore = new RedisStore({ client: redisClient, prefix: 'sess:' });
} else {
  console.warn('[WARN] Kein REDIS_URL gesetzt — MemoryStore wird verwendet (nicht fuer Produktion geeignet).');
}

app.use(
  session({
    store: sessionStore,
    name: 'pf.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' },
});

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}
function generateCodeChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

app.get('/auth/discord/login', authLimiter, (req, res) => {
  const state = base64url(crypto.randomBytes(24));
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: DISCORD_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', authLimiter, async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.redirect('/?auth=denied');
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Ungueltiger State-Parameter. Login abgebrochen (moegliche CSRF-Erkennung).');
  }

  const codeVerifier = req.session.codeVerifier;
  delete req.session.oauthState;
  delete req.session.codeVerifier;

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, token_type } = tokenRes.data;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `${token_type} ${access_token}` },
    });

    const { id, username, discriminator, avatar, global_name } = userRes.data;

    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Session-Fehler');
      req.session.user = {
        id,
        username: global_name || username,
        discriminator,
        avatarUrl: avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/0.png`,
      };
      req.session.save(() => res.redirect('/'));
    });
  } catch (e) {
    console.error('[OAuth Error]', e.response?.data || e.message);
    res.status(502).send('Discord-Login fehlgeschlagen.');
  }
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/auth/logout', authLimiter, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('pf.sid');
    res.json({ ok: true });
  });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server laeuft auf Port ${PORT} (${NODE_ENV})`);
});
