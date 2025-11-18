import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
// Render provides PORT environment variable, use it or default to 4000
const PORT = process.env.PORT || process.env.ADMIN_PORT || 4000;

// Authentication credentials
const ADMIN_USERNAME = 'nladmin';
const ADMIN_PASSWORD = 'nlpw123';

// Detect if running in Docker container
// If running inside Docker, use direct npm commands
// If running on host, use docker-compose exec
const isDocker = existsSync('/.dockerenv');
const useDockerCompose = !isDocker; // Use docker-compose if NOT in Docker

const pipelineSteps = [
  { 
    id: 'collect:internal', 
    label: 'Collect Internal Data'
  },
  { 
    id: 'collect:external', 
    label: 'Collect External Data'
  },
  { 
    id: 'merge', 
    label: 'Merge Data'
  },
  { 
    id: 'insights', 
    label: 'Generate Insights'
  },
  { 
    id: 'build', 
    label: 'Build Newsletter'
  }
];

const jobState = {
  running: false,
  currentStep: null,
  startedAt: null,
  finishedAt: null,
  error: null,
  logs: [],
  lastRunSummary: null
};

function appendLog(message) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  jobState.logs.push(entry);
  if (jobState.logs.length > 200) {
    jobState.logs.shift();
  }
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    jobState.currentStep = step.label;
    appendLog(`▶ ${step.label}`);

    // If using docker-compose, execute via docker-compose exec
    // Otherwise, run npm directly inside container
    const child = useDockerCompose
      ? spawn('docker-compose', ['exec', '-T', 'app', 'npm', 'run', step.id], {
          cwd: ROOT_DIR,
          shell: false,
          env: process.env
        })
      : spawn('npm', ['run', step.id], {
          cwd: '/app',
          shell: false,
          env: process.env
        });

    child.stdout.on('data', data => appendLog(data.toString().trim()));
    child.stderr.on('data', data => appendLog(data.toString().trim()));

    child.on('close', code => {
      if (code === 0) {
        appendLog(`✔ ${step.label} completed`);
        resolve();
      } else {
        appendLog(`✖ ${step.label} failed with code ${code}`);
        reject(new Error(`${step.label} failed (${code})`));
      }
    });
  });
}

async function runPipeline() {
  jobState.running = true;
  jobState.error = null;
  jobState.startedAt = new Date().toISOString();
  jobState.finishedAt = null;
  jobState.lastRunSummary = null;

  try {
    for (const step of pipelineSteps) {
      await runStep(step);
    }
    jobState.lastRunSummary = {
      finishedAt: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    jobState.error = error.message;
    jobState.lastRunSummary = {
      finishedAt: new Date().toISOString(),
      success: false,
      error: error.message
    };
  } finally {
    jobState.running = false;
    jobState.currentStep = null;
    jobState.finishedAt = new Date().toISOString();
  }
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'newsletter-admin-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// Serve login.html as static file (public access)
// Login page route (public)
app.get('/login', (_req, res) => {
  if (_req.session && _req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true, redirect: '/' });
  }
  
  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, redirect: '/login' });
  });
});

// API routes first (before static files) - protected
// Note: API endpoints return 401 JSON instead of redirect for better API usage
app.get('/api/status', (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  res.json(jobState);
});

app.post('/api/run', (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  if (jobState.running) {
    return res.status(409).json({ message: 'Pipeline already running.' });
  }
  runPipeline();
  res.json({ message: 'Pipeline started.' });
});

app.get('/api/newsletters', async (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  
  try {
    const outputDir = path.join(ROOT_DIR, 'output');
    const files = await fs.readdir(outputDir);
    const htmlFiles = await Promise.all(
      files
        .filter(file => file.endsWith('.html'))
        .map(async file => {
          const stats = await fs.stat(path.join(outputDir, file));
          return {
            file,
            sizeKb: Math.round(stats.size / 1024),
            modified: stats.mtime.toISOString(),
            url: `/output/${file}`
          };
        })
    );
    htmlFiles.sort((a, b) => (a.file > b.file ? -1 : 1));
    res.json(htmlFiles);
  } catch (error) {
    res.status(500).json({ message: 'Unable to read output directory', error: error.message });
  }
});

app.get('/api/steps', (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  res.json(pipelineSteps);
});

// Health check endpoint (public, for Render health checks)
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'newsletter-admin'
  });
});

// Helper function to create directory listing HTML
function createDirectoryListing(title, dirPath, baseUrl, files) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f5f5f5; max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 10px; }
        .nav { margin-bottom: 20px; padding: 10px; background: white; border-radius: 8px; }
        .nav a { color: #2563eb; text-decoration: none; margin-right: 15px; }
        .nav a:hover { text-decoration: underline; }
        table { background: white; border-collapse: collapse; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #2563eb; color: white; font-weight: 600; }
        tr:hover { background: #f9fafb; }
        a { color: #2563eb; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .type { color: #6b7280; font-size: 0.9em; text-transform: uppercase; }
        .size { text-align: right; font-family: monospace; }
        .json-badge { background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; }
        .html-badge { background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; }
      </style>
    </head>
    <body>
      <h1>📁 ${title}</h1>
      <div class="nav">
        <a href="/">← Admin Dashboard</a>
        <a href="/history">Newsletter History</a>
        <a href="/data">Data Directories</a>
      </div>
      <table>
        <thead>
          <tr>
            <th>File Name</th>
            <th class="size">Size</th>
            <th>Modified</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${files.length > 0 ? files.map(file => `
            <tr>
              <td><a href="${file.url}">${file.name}</a></td>
              <td class="size">${file.sizeKb} KB</td>
              <td>${new Date(file.modified).toLocaleString()}</td>
              <td class="type">
                ${file.type === '.json' ? '<span class="json-badge">JSON</span>' : ''}
                ${file.type === '.html' ? '<span class="html-badge">HTML</span>' : ''}
                ${file.type || 'file'}
              </td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align: center; color: #6b7280;">No files found</td></tr>'}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// Helper function to list directory files
async function listDirectory(dirPath, baseUrl) {
  try {
    const files = await fs.readdir(dirPath);
    const fileList = await Promise.all(
      files.map(async file => {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          sizeKb: Math.round(stats.size / 1024),
          modified: stats.mtime.toISOString(),
          url: `${baseUrl}/${file}`,
          type: path.extname(file).toLowerCase()
        };
      })
    );
    fileList.sort((a, b) => (a.name > b.name ? -1 : 1));
    return fileList;
  } catch (error) {
    return [];
  }
}

// Helper function to create data directories page
function createDataDirectoriesPage() {
  const dataDirs = [
    { name: 'Internal Data', path: 'data/internal', url: '/data/internal' },
    { name: 'External Data', path: 'data/external', url: '/data/external' },
    { name: 'Merged Data', path: 'data/merged', url: '/data/merged' },
    { name: 'Insights', path: 'data/insights', url: '/data/insights' }
  ];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Data Directories</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f5f5f5; max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; }
        .nav { margin-bottom: 20px; padding: 10px; background: white; border-radius: 8px; }
        .nav a { color: #2563eb; text-decoration: none; margin-right: 15px; }
        .dir-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
        .dir-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .dir-card h2 { margin: 0 0 10px; color: #2563eb; }
        .dir-card a { color: #2563eb; text-decoration: none; font-weight: 600; }
        .dir-card a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>📊 Data Directories</h1>
      <div class="nav">
        <a href="/">← Admin Dashboard</a>
        <a href="/history">Newsletter History</a>
      </div>
      <div class="dir-grid">
        ${dataDirs.map(dir => `
          <div class="dir-card">
            <h2>${dir.name}</h2>
            <p><a href="${dir.url}">Browse ${dir.name} →</a></p>
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
}

// Output directory - show data directories (same as /data) - protected
app.get('/output', requireAuth, (_req, res) => {
  res.send(createDataDirectoriesPage());
});

// Data directories listing - protected
app.get('/data', requireAuth, (_req, res) => {
  res.send(createDataDirectoriesPage());
});

// Data subdirectories - protected
app.get('/data/:subdir', requireAuth, async (_req, res) => {
  const subdir = _req.params.subdir;
  const allowedDirs = ['internal', 'external', 'merged', 'insights'];
  
  if (!allowedDirs.includes(subdir)) {
    return res.status(404).send('Directory not found');
  }
  
  try {
    const dataDir = path.join(ROOT_DIR, 'data', subdir);
    const fileList = await listDirectory(dataDir, `/data/${subdir}`);
    res.send(createDirectoryListing(`${subdir.charAt(0).toUpperCase() + subdir.slice(1)} Data`, dataDir, `/data/${subdir}`, fileList));
  } catch (error) {
    res.status(500).send(`Error reading ${subdir} directory: ${error.message}`);
  }
});

// Static file serving for data directories
app.use('/data', express.static(path.join(ROOT_DIR, 'data'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// Static file serving for output directory files (must be before catch-all)
app.use('/output', express.static(path.join(ROOT_DIR, 'output'), {
  setHeaders: (res, filePath) => {
    // Set proper content type for JSON files
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// History page route - protected
app.get('/history', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

// Static files for admin dashboard (CSS, JS, etc. - public)
// This serves static assets like styles.css without authentication
app.use(express.static(path.join(__dirname, 'public')));

// Root route - protected (redirects to login if not authenticated)
app.get('/', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route for SPA (must be last) - protected
// This will catch any other routes not explicitly defined
app.get('*', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Listen on all interfaces (0.0.0.0) for Render deployment
// Render requires binding to 0.0.0.0, not localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Admin dashboard available on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

