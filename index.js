/*
  ______                 __            ____                      
 / ____/___  ____  _____/ /_____  ____/ / /__  ____  ____  _____
/ /   / __ \/ __ \/ ___/ //_/ _ \/ __  / / _ \/ __ \/ __ \/ ___/
/ /___/ /_/ / / / / /__/ ,< /  __/ /_/ / /  __/ /_/ / /_/ (__  ) 
\____/\____/_/ /_/\___/_/|_|\___/\__,_/_/\___/ .___/ .___/____/  
                                             /_/   /_/           
             Craze Panel v0.3.0 (Oz Edition)
          (c) 2024 Mehetab and contributors credit skyportlabs 
*/

/**
 * @fileoverview Main server file for Craze Panel. Sets up the express application,
 * configures middleware for sessions, body parsing, WebSockets, plugins, and dynamically loads route
 * modules. Initializes logging and server startup.
 */

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const fs = require('node:fs');
const path = require('path');
const chalk = require('chalk');
const expressWs = require('express-ws');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const sqlite = require("better-sqlite3");
const SqliteStore = require("better-sqlite3-session-store")(session);
const crypto = require('crypto');
const config = require('./config.json');
const ascii = fs.readFileSync('./handlers/ascii.txt', 'utf8');
const { db } = require('./handlers/db.js');
const translationMiddleware = require('./handlers/translation');
const analytics = require('./utils/analytics.js');
const { loadPlugins } = require('./plugins/loadPls.js');
const { init } = require('./handlers/init.js');
const log = new (require('cat-loggr'))();

// Load theme and plugins
const theme = require('./storage/theme.json');
let plugins = loadPlugins(path.join(__dirname, './plugins'));
plugins = Object.values(plugins).map(plugin => plugin.config);

// App and WebSocket instance
const app = express();
expressWs(app);

// Session database
const sessionStorage = new sqlite("sessions.db");

// Session config
app.use(
  session({
    store: new SqliteStore({
      client: sessionStorage,
      expired: { clear: true, intervalMs: 9000000 }
    }),
    secret: config.session_secret || "secret",
    resave: true,
    saveUninitialized: true
  })
);

// Middleware setup
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(analytics);
app.use(translationMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Rate limiter for POST requests
const postRateLimiter = rateLimit({
  windowMs: 60 * 100,
  max: 6,
  message: 'Too many requests, please try again later'
});
app.use((req, res, next) => {
  if (req.method === 'POST') {
    postRateLimiter(req, res, next);
  } else {
    next();
  }
});

// Random string generator
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
}

// Replace 'Random' values in an object
function replaceRandomValues(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      replaceRandomValues(obj[key]);
    } else if (obj[key] === 'Random') {
      obj[key] = generateRandomString(16);
    }
  }
}

// Update config.json replacing 'Random'
async function updateConfig() {
  const configPath = './config.json';
  try {
    let configData = fs.readFileSync(configPath, 'utf8');
    let configObj = JSON.parse(configData);
    replaceRandomValues(configObj);
    fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
  } catch (error) {
    log.error('Error updating config:', error);
  }
}
updateConfig();

// Language detection
function getLanguages() {
  return fs.readdirSync(__dirname + '/lang').map(file => file.split('.')[0]);
}

// Language setter route
app.get('/setLanguage', async (req, res) => {
  const lang = req.query.lang;
  if (lang && getLanguages().includes(lang)) {
    res.cookie('lang', lang, { maxAge: 90000000, httpOnly: true, sameSite: 'strict' });
    req.user.lang = lang;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Attach locals and themes to requests
app.use(async (req, res, next) => {
  try {
    const settings = await db.get('settings');
    res.locals.languages = getLanguages();
    res.locals.ogTitle = config.ogTitle;
    res.locals.ogDescription = config.ogDescription;
    res.locals.footer = settings.footer;
    res.locals.theme = theme;
    res.locals.name = settings.name;
    res.locals.logo = settings.logo;
    res.locals.plugins = plugins;
    next();
  } catch (error) {
    log.error('Error fetching settings:', error);
    next(error);
  }
});

// Cache control for production
if (config.mode === 'production') {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '5');
    next();
  });

  app.use('/assets', (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=1');
    next();
  });
}

// View engine and public static assets
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Route loader
const routesDir = path.join(__dirname, 'routes');
function loadRoutes(directory) {
  fs.readdirSync(directory).forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      loadRoutes(fullPath);
    } else if (stat.isFile() && path.extname(file) === '.js') {
      const route = require(fullPath);
      expressWs.applyTo(route);
      app.use("/", route);
    }
  });
}
loadRoutes(routesDir);

// Plugin routes and views
const pluginRoutes = require('./plugins/pluginManager.js');
app.use("/", pluginRoutes);
const pluginDir = path.join(__dirname, 'plugins');
const pluginViewsDir = fs.readdirSync(pluginDir).map(addonName => path.join(pluginDir, addonName, 'views'));
app.set('views', [path.join(__dirname, 'views'), ...pluginViewsDir]);

// Init tasks
init();

// Startup banner and port
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));
app.listen(config.port, () => log.info(`Craze Panel is listening on port ${config.port}`));

// 404 Error page
app.get('*', async function (req, res) {
  res.render('errors/404', {
    req,
    name: await db.get('name') || 'Craze Panel'
  });
});
