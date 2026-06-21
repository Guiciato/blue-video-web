'use strict';

const elements = {
  tabs: [...document.querySelectorAll('.tab-button')],
  panels: [...document.querySelectorAll('.panel')],
  serverStatus: document.querySelector('#serverStatus'),
  installButton: document.querySelector('#installButton'),
  videoUrl: document.querySelector('#videoUrl'),
  pasteButton: document.querySelector('#pasteButton'),
  clearUrlButton: document.querySelector('#clearUrlButton'),
  playlistCheckbox: document.querySelector('#playlistCheckbox'),
  formatOptions: [...document.querySelectorAll('.format-option')],
  startDownloadButton: document.querySelector('#startDownloadButton'),
  cancelDownloadButton: document.querySelector('#cancelDownloadButton'),
  downloadResultButton: document.querySelector('#downloadResultButton'),
  downloadStatusText: document.querySelector('#downloadStatusText'),
  downloadPercent: document.querySelector('#downloadPercent'),
  downloadProgressBar: document.querySelector('#downloadProgressBar'),
  downloadSpeed: document.querySelector('#downloadSpeed'),
  downloadEta: document.querySelector('#downloadEta'),
  dropZone: document.querySelector('#dropZone'),
  mp4Files: document.querySelector('#mp4Files'),
  chooseFilesButton: document.querySelector('#chooseFilesButton'),
  clearFilesButton: document.querySelector('#clearFilesButton'),
  selectedFilesCount: document.querySelector('#selectedFilesCount'),
  selectedFilesList: document.querySelector('#selectedFilesList'),
  startConvertButton: document.querySelector('#startConvertButton'),
  cancelConvertButton: document.querySelector('#cancelConvertButton'),
  convertResultButton: document.querySelector('#convertResultButton'),
  convertStatusText: document.querySelector('#convertStatusText'),
  convertPercent: document.querySelector('#convertPercent'),
  convertProgressBar: document.querySelector('#convertProgressBar'),
  convertCurrentFile: document.querySelector('#convertCurrentFile'),
  convertCounter: document.querySelector('#convertCounter'),
  activityLog: document.querySelector('#activityLog'),
  clearLogButton: document.querySelector('#clearLogButton')
};

const state = {
  selectedFiles: [],
  jobs: { download: null, convert: null },
  eventSources: { download: null, convert: null },
  seenLogs: { download: new Set(), convert: new Set() },
  installPrompt: null
};

function appendLog(message) {
  const time = new Date().toLocaleTimeString('pt-BR');
  elements.activityLog.textContent += `\n[${time}] ${message}`;
  elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
}

function setProgress(task, percent, message) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const prefix = task === 'download' ? 'download' : 'convert';
  elements[`${prefix}ProgressBar`].style.width = `${value}%`;
  elements[`${prefix}Percent`].textContent = `${Math.round(value)}%`;
  if (message) elements[`${prefix}StatusText`].textContent = message;
}

function setDownloadLink(task, job) {
  const button = task === 'download' ? elements.downloadResultButton : elements.convertResultButton;
  if (job?.status === 'completed' && state.jobs[task]) {
    button.href = `/api/jobs/${encodeURIComponent(job.id)}/download?token=${encodeURIComponent(state.jobs[task].token)}`;
    button.classList.remove('disabled');
    button.setAttribute('aria-disabled', 'false');
  } else {
    button.href = '#';
    button.classList.add('disabled');
    button.setAttribute('aria-disabled', 'true');
  }
}

function setBusy(task, busy) {
  if (task === 'download') {
    elements.startDownloadButton.disabled = busy;
    elements.cancelDownloadButton.disabled = !busy;
    elements.videoUrl.disabled = busy;
    elements.pasteButton.disabled = busy;
    elements.clearUrlButton.disabled = busy;
    elements.playlistCheckbox.disabled = busy;
    document.querySelectorAll('input[name="downloadFormat"]').forEach((input) => { input.disabled = busy; });
  } else {
    elements.startConvertButton.disabled = busy;
    elements.cancelConvertButton.disabled = !busy;
    elements.chooseFilesButton.disabled = busy;
    elements.clearFilesButton.disabled = busy;
    elements.mp4Files.disabled = busy;
  }
}

function switchTab(tabId) {
  elements.tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === tabId));
  elements.panels.forEach((panel) => {
    const active = panel.id === tabId;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function fileSize(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function updateSelectedFiles() {
  const count = state.selectedFiles.length;
  elements.selectedFilesCount.textContent = `${count} arquivo${count === 1 ? '' : 's'} selecionado${count === 1 ? '' : 's'}`;
  elements.selectedFilesList.replaceChildren();

  if (!count) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum arquivo selecionado.';
    elements.selectedFilesList.append(empty);
    return;
  }

  state.selectedFiles.forEach((file) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const size = document.createElement('span');
    name.textContent = file.name;
    size.textContent = fileSize(file.size);
    size.className = 'file-size';
    item.append(name, size);
    elements.selectedFilesList.append(item);
  });
}

function acceptFiles(files) {
  const mp4Files = [...files].filter((file) => file.name.toLowerCase().endsWith('.mp4'));
  const rejected = files.length - mp4Files.length;
  state.selectedFiles = mp4Files;
  updateSelectedFiles();
  setProgress('convert', 0, mp4Files.length ? 'Arquivos prontos para envio.' : 'Aguardando arquivos');
  if (rejected) appendLog(`${rejected} arquivo(s) ignorado(s) porque não eram MP4.`);
  if (mp4Files.length) appendLog(`${mp4Files.length} arquivo(s) MP4 selecionado(s).`);
}

function consumeLogs(task, job) {
  for (const log of job.logs || []) {
    const key = `${log.at}:${log.message}`;
    if (!state.seenLogs[task].has(key)) {
      state.seenLogs[task].add(key);
      appendLog(log.message);
    }
  }
}

function closeEventSource(task) {
  state.eventSources[task]?.close();
  state.eventSources[task] = null;
}

function handleJobUpdate(task, job) {
  consumeLogs(task, job);
  setProgress(task, job.progress, job.message);

  if (task === 'download') {
    elements.downloadSpeed.textContent = `Velocidade: ${job.metadata?.speed || '—'}`;
    elements.downloadEta.textContent = `Tempo restante: ${job.metadata?.eta || '—'}`;
  } else {
    elements.convertCurrentFile.textContent = `Arquivo atual: ${job.metadata?.currentFile || '—'}`;
    const current = job.metadata?.currentIndex;
    const total = job.metadata?.totalFiles;
    elements.convertCounter.textContent = current && total ? `Lote: ${current}/${total}` : 'Lote: —';
  }

  if (job.status === 'completed') {
    setBusy(task, false);
    setDownloadLink(task, job);
    appendLog(task === 'download' ? 'Download pronto.' : 'Conversão pronta.');
    closeEventSource(task);
  } else if (job.status === 'failed' || job.status === 'canceled') {
    setBusy(task, false);
    setDownloadLink(task, null);
    closeEventSource(task);
  }
}

function watchJob(task, jobId, token) {
  closeEventSource(task);
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`);
  state.eventSources[task] = source;

  source.addEventListener('update', (event) => {
    try {
      handleJobUpdate(task, JSON.parse(event.data));
    } catch (error) {
      appendLog(`Falha ao interpretar atualização: ${error.message}`);
    }
  });

  source.onerror = () => {
    if (state.eventSources[task]) appendLog('A conexão de progresso foi interrompida; tentando reconectar.');
  };
}

async function createDownloadJob() {
  const url = elements.videoUrl.value.trim();
  if (!url) {
    elements.downloadStatusText.textContent = 'Cole um link antes de iniciar.';
    elements.videoUrl.focus();
    return;
  }

  const format = document.querySelector('input[name="downloadFormat"]:checked')?.value || 'mp4';
  setBusy('download', true);
  setProgress('download', 0, 'Enviando tarefa ao servidor...');
  setDownloadLink('download', null);
  state.seenLogs.download.clear();

  try {
    const response = await fetch('/api/jobs/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format, playlist: elements.playlistCheckbox.checked })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Não foi possível iniciar a tarefa.');

    state.jobs.download = body;
    appendLog(`Tarefa de download criada (${format.toUpperCase()}).`);
    watchJob('download', body.jobId, body.token);
  } catch (error) {
    setBusy('download', false);
    setProgress('download', 0, error.message);
    appendLog(error.message);
  }
}

function createConvertJob() {
  if (!state.selectedFiles.length) {
    elements.convertStatusText.textContent = 'Selecione um ou mais arquivos MP4.';
    return;
  }

  setBusy('convert', true);
  setProgress('convert', 0, 'Enviando arquivos...');
  setDownloadLink('convert', null);
  state.seenLogs.convert.clear();

  const form = new FormData();
  state.selectedFiles.forEach((file) => form.append('files', file, file.name));
  const request = new XMLHttpRequest();
  request.open('POST', '/api/jobs/convert');
  request.responseType = 'json';

  request.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = (event.loaded / event.total) * 100;
    setProgress('convert', Math.min(15, percent * 0.15), `Enviando arquivos: ${Math.round(percent)}%`);
  };

  request.onload = () => {
    const body = request.response || {};
    if (request.status < 200 || request.status >= 300) {
      setBusy('convert', false);
      setProgress('convert', 0, body.error || 'Falha ao enviar os arquivos.');
      appendLog(body.error || 'Falha ao enviar os arquivos.');
      return;
    }

    state.jobs.convert = body;
    appendLog('Arquivos enviados. Conversão adicionada à fila.');
    watchJob('convert', body.jobId, body.token);
  };

  request.onerror = () => {
    setBusy('convert', false);
    setProgress('convert', 0, 'Falha de rede durante o envio.');
    appendLog('Falha de rede durante o envio dos arquivos.');
  };

  request.send(form);
}

async function cancelJob(task) {
  const job = state.jobs[task];
  if (!job) return;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(job.jobId)}?token=${encodeURIComponent(job.token)}`, { method: 'DELETE' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Não foi possível cancelar.');
    appendLog('Cancelamento solicitado.');
  } catch (error) {
    appendLog(error.message);
  }
}

async function checkHealth() {
  elements.serverStatus.classList.remove('available', 'missing');
  elements.serverStatus.classList.add('checking');
  elements.serverStatus.textContent = 'Servidor: verificando';

  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const health = await response.json();
    elements.serverStatus.classList.remove('checking');
    if (response.ok && health.ready) {
      elements.serverStatus.classList.add('available');
      elements.serverStatus.textContent = 'Servidor: pronto';
      appendLog('Servidor, yt-dlp e FFmpeg estão prontos.');
    } else {
      elements.serverStatus.classList.add('missing');
      elements.serverStatus.textContent = 'Servidor: ferramentas ausentes';
      appendLog('O backend está online, mas yt-dlp/FFmpeg não foram encontrados.');
    }
  } catch {
    elements.serverStatus.classList.remove('checking');
    elements.serverStatus.classList.add('missing');
    elements.serverStatus.textContent = 'Servidor: indisponível';
    appendLog('Não foi possível acessar o backend.');
  }
}

elements.tabs.forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
elements.formatOptions.forEach((option) => option.addEventListener('click', () => {
  elements.formatOptions.forEach((item) => item.classList.remove('active'));
  option.classList.add('active');
  option.querySelector('input').checked = true;
}));

elements.pasteButton.addEventListener('click', async () => {
  try {
    elements.videoUrl.value = await navigator.clipboard.readText();
    appendLog('Link colado da área de transferência.');
  } catch {
    elements.videoUrl.focus();
    appendLog('O navegador não permitiu ler a área de transferência. Cole o link manualmente.');
  }
});
elements.clearUrlButton.addEventListener('click', () => {
  elements.videoUrl.value = '';
  elements.playlistCheckbox.checked = false;
  setProgress('download', 0, 'Aguardando um link');
  setDownloadLink('download', null);
});
elements.startDownloadButton.addEventListener('click', createDownloadJob);
elements.cancelDownloadButton.addEventListener('click', () => cancelJob('download'));

elements.chooseFilesButton.addEventListener('click', (event) => {
  event.stopPropagation();
  elements.mp4Files.click();
});
elements.dropZone.addEventListener('click', () => elements.mp4Files.click());
elements.dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') elements.mp4Files.click();
});
elements.mp4Files.addEventListener('change', () => acceptFiles(elements.mp4Files.files));
['dragenter', 'dragover'].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  elements.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove('dragging');
}));
elements.dropZone.addEventListener('drop', (event) => acceptFiles(event.dataTransfer.files));
elements.clearFilesButton.addEventListener('click', () => {
  state.selectedFiles = [];
  elements.mp4Files.value = '';
  updateSelectedFiles();
  setProgress('convert', 0, 'Aguardando arquivos');
  setDownloadLink('convert', null);
});
elements.startConvertButton.addEventListener('click', createConvertJob);
elements.cancelConvertButton.addEventListener('click', () => cancelJob('convert'));
elements.clearLogButton.addEventListener('click', () => { elements.activityLog.textContent = 'Histórico limpo.'; });

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  elements.installButton.classList.remove('hidden');
});
elements.installButton.addEventListener('click', async () => {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  elements.installButton.classList.add('hidden');
});
window.addEventListener('appinstalled', () => appendLog('Aplicativo instalado no dispositivo.'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

updateSelectedFiles();
checkHealth();
