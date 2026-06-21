const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');

const config = require('./src/config');
const JobStore = require('./src/job-store');
const JobQueue = require('./src/queue');
const { validatePublicHttpUrl, accessTokenFromRequest, safeFileName } = require('./src/security');
const { processDownload } = require('./src/processors/download');
const { processConversion } = require('./src/processors/convert');

fs.mkdirSync(config.jobsDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();
const store = new JobStore({ jobsDir: config.jobsDir, ttlMs: config.jobTtlMs });
const queue = new JobQueue({ concurrency: config.maxConcurrentJobs, store });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMaxRequests,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

const jobCreationLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.downloadRateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tarefas foram solicitadas. Aguarde alguns minutos e tente novamente.' }
});

function commandVersion(command, args = ['--version']) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 12000);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? output.trim().split(/\r?\n/)[0] : null);
    });
  });
}

function authorizedJob(request, response) {
  const job = store.get(request.params.id);
  if (!job || !store.authorize(job, accessTokenFromRequest(request))) {
    response.status(404).json({ error: 'Tarefa não encontrada.' });
    return null;
  }
  return job;
}

app.get('/api/health', async (_request, response) => {
  const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
    commandVersion(config.ytDlpBin),
    commandVersion(config.ffmpegBin, ['-version']),
    commandVersion(config.ffprobeBin, ['-version'])
  ]);
  const ready = Boolean(ytDlp && ffmpeg && ffprobe);
  response.status(ready ? 200 : 503).json({
    ready,
    tools: {
      ytDlp: ytDlp || null,
      ffmpeg: ffmpeg || null,
      ffprobe: ffprobe || null
    },
    queue: { running: queue.running, pending: queue.pending.length }
  });
});

app.post('/api/jobs/download', jobCreationLimiter, async (request, response, next) => {
  try {
    const url = await validatePublicHttpUrl(request.body?.url);
    const format = request.body?.format === 'mp3' ? 'mp3' : 'mp4';
    const playlist = Boolean(request.body?.playlist);
    const created = store.create('download', { url, format, playlist });
    queue.add(created.id, () => processDownload({ jobId: created.id, store, config }));
    response.status(202).json({ jobId: created.id, token: created.token });
  } catch (error) {
    next(error);
  }
});

function prepareUpload(request, _response, next) {
  request.uploadId = require('node:crypto').randomUUID();
  request.uploadDir = path.join(config.uploadsDir, request.uploadId);
  fs.mkdirSync(request.uploadDir, { recursive: true });
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (request, _file, callback) => callback(null, request.uploadDir),
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.mp4';
      callback(null, `${require('node:crypto').randomUUID()}${extension}`);
    }
  }),
  limits: {
    files: config.maxUploadFiles,
    fileSize: config.maxUploadBytesPerFile
  },
  fileFilter: (_request, file, callback) => {
    const extensionOk = path.extname(file.originalname).toLowerCase() === '.mp4';
    const mimeOk = file.mimetype === 'video/mp4' || file.mimetype === 'application/octet-stream';
    callback(extensionOk && mimeOk ? null : new Error('Envie somente arquivos MP4.'), extensionOk && mimeOk);
  }
});

app.post('/api/jobs/convert', jobCreationLimiter, prepareUpload, upload.array('files', config.maxUploadFiles), (request, response, next) => {
  try {
    if (!request.files?.length) throw new Error('Selecione pelo menos um arquivo MP4.');
    const created = store.create('convert', {
      inputs: request.files.map((file) => ({
        path: file.path,
        originalName: safeFileName(file.originalname, 'video.mp4'),
        size: file.size
      })),
      totalFiles: request.files.length
    });

    const job = store.get(created.id);
    const uploadsTarget = path.join(job.workspace, 'uploads');
    fs.mkdirSync(uploadsTarget, { recursive: true });
    for (const input of job.metadata.inputs) {
      const newPath = path.join(uploadsTarget, path.basename(input.path));
      fs.renameSync(input.path, newPath);
      input.path = newPath;
    }
    fs.rmSync(request.uploadDir, { recursive: true, force: true });

    queue.add(created.id, () => processConversion({ jobId: created.id, store, config }));
    response.status(202).json({ jobId: created.id, token: created.token });
  } catch (error) {
    if (request.uploadDir) fs.rmSync(request.uploadDir, { recursive: true, force: true });
    next(error);
  }
});

app.get('/api/jobs/:id', (request, response) => {
  const job = authorizedJob(request, response);
  if (!job) return;
  response.json(store.publicView(job));
});

app.get('/api/jobs/:id/events', (request, response) => {
  const job = authorizedJob(request, response);
  if (!job) return;

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  const send = (payload) => response.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  send(store.publicView(job));
  const unsubscribe = store.subscribe(job.id, send);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);

  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.delete('/api/jobs/:id', (request, response) => {
  const job = authorizedJob(request, response);
  if (!job) return;
  const canceled = store.requestCancel(job.id);
  response.status(canceled ? 202 : 409).json({ canceled });
});

app.get('/api/jobs/:id/download', (request, response) => {
  const job = authorizedJob(request, response);
  if (!job) return;
  if (job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
    response.status(409).json({ error: 'O arquivo ainda não está disponível.' });
    return;
  }
  response.download(job.outputPath, job.downloadName || path.basename(job.outputPath));
});

app.use(express.static(config.publicDir, {
  extensions: ['html'],
  setHeaders: (response, filePath) => {
    if (filePath.endsWith('sw.js')) response.setHeader('Cache-Control', 'no-cache');
    else if (filePath.includes(`${path.sep}assets${path.sep}`)) response.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

app.use('/api', (_request, response) => response.status(404).json({ error: 'Rota da API não encontrada.' }));
app.get('/*splat', (_request, response) => response.sendFile(path.join(config.publicDir, 'index.html')));

app.use((error, request, response, _next) => {
  if (request.uploadDir) {
    try { fs.rmSync(request.uploadDir, { recursive: true, force: true }); } catch {}
  }
  const isMulter = error instanceof multer.MulterError;
  const status = isMulter || /link|arquivo|MP4|permitido|servidor/i.test(error.message || '') ? 400 : 500;
  console.error(error);
  response.status(status).json({ error: error.message || 'Erro interno do servidor.' });
});

setInterval(() => store.cleanupExpired(), 60_000).unref();

app.listen(config.port, config.host, () => {
  console.log(`Blue Video Web disponível em http://${config.host}:${config.port}`);
});
