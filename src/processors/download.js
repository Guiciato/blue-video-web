const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { createZip } = require('../archive');
const { safeFileName } = require('../security');

function listFilesRecursive(root) {
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...listFilesRecursive(fullPath));
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

function runProcess(command, args, { jobId, store }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    store.setProcess(jobId, child);

    const onLine = (line, source) => {
      const clean = String(line || '').trim();
      if (!clean) return;

      const progress = clean.match(/^BVD_PROGRESS\|\s*([\d.,]+)%\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/);
      if (progress) {
        const filePercent = Number.parseFloat(progress[1].replace(',', '.')) || 0;
        const playlistIndex = Number.parseInt(progress[4], 10);
        const playlistTotal = Number.parseInt(progress[5], 10);
        const overallPercent = Number.isInteger(playlistIndex) && Number.isInteger(playlistTotal) && playlistTotal > 0
          ? ((playlistIndex - 1 + filePercent / 100) / playlistTotal) * 100
          : filePercent;

        store.update(jobId, {
          progress: Math.max(0, Math.min(99, overallPercent)),
          message: `Baixando ${progress[6] || 'arquivo'}...`,
          metadata: {
            ...store.get(jobId).metadata,
            speed: progress[2] || '—',
            eta: progress[3] || '—',
            item: Number.isInteger(playlistIndex) ? playlistIndex : null,
            totalItems: Number.isInteger(playlistTotal) ? playlistTotal : null,
            currentTitle: progress[6] || ''
          }
        });
        return;
      }

      if (/^BVD_FILE\|/.test(clean)) {
        store.log(jobId, `Arquivo finalizado: ${clean.slice('BVD_FILE|'.length)}`);
        return;
      }

      if (source === 'stderr' && /error/i.test(clean)) store.log(jobId, `ERRO: ${clean}`);
      else store.log(jobId, clean);
    };

    const stdout = readline.createInterface({ input: child.stdout });
    const stderr = readline.createInterface({ input: child.stderr });
    stdout.on('line', (line) => onLine(line, 'stdout'));
    stderr.on('line', (line) => onLine(line, 'stderr'));

    child.on('error', reject);
    child.on('close', (code, signal) => {
      stdout.close();
      stderr.close();
      store.setProcess(jobId, null);
      if (code === 0) resolve();
      else if (store.get(jobId)?.cancelRequested || signal) reject(new Error('Download cancelado.'));
      else reject(new Error(`O yt-dlp terminou com o código ${code}.`));
    });
  });
}

function buildArgs({ url, playlist, format, outputDir, config }) {
  const args = [
    '--no-config',
    '--newline',
    '--no-color',
    '--windows-filenames',
    '--trim-filenames',
    '160',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--max-filesize',
    '1G',
    playlist ? '--yes-playlist' : '--no-playlist',
    '--playlist-end',
    String(config.maxPlaylistItems),
    '--progress-template',
    'download:BVD_PROGRESS|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.playlist_index)s|%(info.n_entries)s|%(info.title)s',
    '--print',
    'after_move:BVD_FILE|%(filepath)s',
    '--output',
    path.join(outputDir, '%(playlist_index&{} - |)s%(title).150B [%(id)s].%(ext)s')
  ];

  if (config.ytDlpJsRuntimes) {
    args.push('--js-runtimes', config.ytDlpJsRuntimes);
  }

  if (format === 'mp3') {
    args.push(
      '--format',
      'ba/b',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '2',
      '--embed-metadata'
    );
  } else {
    args.push(
      '--format',
      'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]',
      '--merge-output-format',
      'mp4',
      '--remux-video',
      'mp4'
    );
  }

  args.push(url);
  return args;
}

async function processDownload({ jobId, store, config }) {
  const job = store.get(jobId);
  if (!job) throw new Error('Tarefa não encontrada.');

  const outputDir = path.join(job.workspace, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  store.update(jobId, { progress: 1, message: 'Preparando o download...' });

  const args = buildArgs({
    url: job.metadata.url,
    playlist: job.metadata.playlist,
    format: job.metadata.format,
    outputDir,
    config
  });

  await runProcess(config.ytDlpBin, args, { jobId, store });
  if (store.get(jobId)?.cancelRequested) throw new Error('Download cancelado.');

  const extension = job.metadata.format === 'mp3' ? '.mp3' : '.mp4';
  const files = listFilesRecursive(outputDir).filter((filePath) => path.extname(filePath).toLowerCase() === extension);
  if (!files.length) throw new Error('Nenhum arquivo final foi encontrado. Consulte o histórico da tarefa.');

  let outputPath;
  let downloadName;
  if (files.length === 1) {
    outputPath = files[0];
    downloadName = path.basename(files[0]);
  } else {
    downloadName = safeFileName(`blue-video-${job.metadata.format}-${files.length}-arquivos.zip`);
    outputPath = path.join(job.workspace, downloadName);
    store.update(jobId, { progress: 99, message: 'Criando arquivo ZIP...' });
    await createZip(files, outputPath);
  }

  store.update(jobId, {
    status: 'completed',
    progress: 100,
    message: files.length === 1 ? 'Arquivo pronto para baixar.' : `${files.length} arquivos prontos em um ZIP.`,
    files: files.map((filePath) => ({ name: path.basename(filePath), size: fs.statSync(filePath).size })),
    outputPath,
    downloadName
  });
}

module.exports = { processDownload };
