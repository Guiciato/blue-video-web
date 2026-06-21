class JobQueue {
  constructor({ concurrency, store }) {
    this.concurrency = concurrency;
    this.store = store;
    this.running = 0;
    this.pending = [];
  }

  add(jobId, task) {
    this.pending.push({ jobId, task });
    this.drain();
  }

  async drain() {
    while (this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      const job = this.store.get(item.jobId);
      if (!job || job.cancelRequested || job.status === 'canceled') continue;

      this.running += 1;
      this.store.update(item.jobId, { status: 'running', message: 'Processamento iniciado.' });

      Promise.resolve()
        .then(() => item.task())
        .catch((error) => {
          const current = this.store.get(item.jobId);
          if (current && current.status !== 'canceled') {
            this.store.log(item.jobId, error?.stack || error?.message || String(error));
            this.store.update(item.jobId, {
              status: 'failed',
              message: error?.message || 'A tarefa falhou.'
            });
          }
        })
        .finally(() => {
          this.running -= 1;
          this.drain();
        });
    }
  }
}

module.exports = JobQueue;
