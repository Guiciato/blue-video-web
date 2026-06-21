const { EventEmitter } = require('node:events');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class JobStore {
  constructor({ jobsDir, ttlMs }) {
    this.jobsDir = jobsDir;
    this.ttlMs = ttlMs;
    this.jobs = new Map();
    fs.mkdirSync(jobsDir, { recursive: true });
  }

  create(type, metadata = {}) {
    const id = randomUUID();
    const token = randomBytes(24).toString('hex');
    const workspace = path.join(this.jobsDir, id);
    fs.mkdirSync(workspace, { recursive: true });

    const job = {
      id,
      token,
      type,
      status: 'queued',
      progress: 0,
      message: 'Tarefa adicionada à fila.',
      logs: [],
      files: [],
      outputPath: null,
      downloadName: null,
      workspace,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      process: null,
      cancelRequested: false,
      metadata,
      emitter: new EventEmitter()
    };

    job.emitter.setMaxListeners(50);
    this.jobs.set(id, job);
    return this.publicView(job, true);
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  publicView(job, includeToken = false) {
    const result = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      logs: job.logs.slice(-100),
      files: job.files,
      downloadName: job.downloadName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      metadata: job.metadata
    };
    if (includeToken) result.token = job.token;
    return result;
  }

  authorize(job, suppliedToken) {
    if (!job || !suppliedToken) return false;
    const expected = Buffer.from(job.token);
    const supplied = Buffer.from(String(suppliedToken));
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  update(id, patch) {
    const job = this.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    const view = this.publicView(job);
    job.emitter.emit('update', view);
    return view;
  }

  log(id, message) {
    const job = this.get(id);
    if (!job) return;
    const text = String(message || '').trim();
    if (!text) return;
    job.logs.push({ at: Date.now(), message: text.slice(0, 2000) });
    if (job.logs.length > 250) job.logs.splice(0, job.logs.length - 250);
    this.update(id, {});
  }

  setProcess(id, child) {
    const job = this.get(id);
    if (job) job.process = child;
  }

  requestCancel(id) {
    const job = this.get(id);
    if (!job || ['completed', 'failed', 'canceled'].includes(job.status)) return false;
    job.cancelRequested = true;
    if (job.process && !job.process.killed) {
      if (process.platform === 'win32' && job.process.pid) {
        const { spawn } = require('node:child_process');
        spawn('taskkill', ['/PID', String(job.process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        job.process.kill('SIGTERM');
      }
    }
    this.update(id, { status: 'canceled', message: 'Cancelamento solicitado.' });
    return true;
  }

  subscribe(id, listener) {
    const job = this.get(id);
    if (!job) return () => {};
    job.emitter.on('update', listener);
    return () => job.emitter.off('update', listener);
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      const terminal = ['completed', 'failed', 'canceled'].includes(job.status);
      if (terminal && now - job.updatedAt > this.ttlMs) {
        try {
          fs.rmSync(job.workspace, { recursive: true, force: true });
        } catch {}
        job.emitter.removeAllListeners();
        this.jobs.delete(id);
      }
    }
  }
}

module.exports = JobStore;
