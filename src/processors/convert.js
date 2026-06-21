const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createZip } = require('../archive');
const { safeFileName } = require('../security');

function probeDuration(ffprobeBin, inputPath) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', () => resolve(0));
    child.on('close', (code) => {
      const duration = Number.parseFloat(output.trim());
      resolve(code === 0 && Number.isFinite(duration) ? duration : 0);
    });
  });
}

function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let index = 1;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function convertOne({ inputPath, displayName, outputPath, duration, jobId, store, config, index, total }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-map', '0:a:0',
      '-vn',
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      '-progress', 'pipe:1',
      '-nostats',
      outputPath
    ];

    const child = spawn(config.ffmpegBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    store.setProcess(jobId, child);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';

      for (const line of lines) {
        const separator = line.indexOf('=');
        if (separator === -1) continue;
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if ((key === 'out_time_ms' || key === 'out_time_us') && duration > 0) {
          const microseconds = Number.parseInt(value, 10);
          const filePercent = Math.max(0, Math.min(100, (microseconds / 1_000_000 / duration) * 100));
          const overall = ((index + filePercent / 100) / total) * 100;
          store.update(jobId, {
            progress: Math.max(1, Math.min(99, overall)),
            message: `Convertendo ${displayName} (${index + 1}/${total})...`,
            metadata: {
              ...store.get(jobId).metadata,
              currentFile: displayName,
              currentIndex: index + 1,
              totalFiles: total
            }
          });
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const lines = stderr.split(/\r?\n/);
      stderr = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) store.log(jobId, line.trim());
      }
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      store.setProcess(jobId, null);
      if (code === 0) resolve(outputPath);
      else if (store.get(jobId)?.cancelRequested || signal) reject(new Error('Conversão cancelada.'));
      else reject(new Error(`O ffmpeg terminou com o código ${code}.`));
    });
  });
}

async function processConversion({ jobId, store, config }) {
  const job = store.get(jobId);
  if (!job) throw new Error('Tarefa não encontrada.');

  const inputs = job.metadata.inputs || [];
  if (!inputs.length) throw new Error('Nenhum vídeo foi enviado.');

  const outputDir = path.join(job.workspace, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputs = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (store.get(jobId)?.cancelRequested) throw new Error('Conversão cancelada.');

    const baseName = safeFileName(path.parse(input.originalName).name, `audio-${index + 1}`);
    const outputPath = uniquePath(path.join(outputDir, `${baseName}.mp3`));
    const duration = await probeDuration(config.ffprobeBin, input.path);
    store.log(jobId, `Iniciando: ${input.originalName}`);
    await convertOne({ inputPath: input.path, displayName: input.originalName, outputPath, duration, jobId, store, config, index, total: inputs.length });
    outputs.push(outputPath);
    store.log(jobId, `Concluído: ${path.basename(outputPath)}`);
  }

  let outputPath;
  let downloadName;
  if (outputs.length === 1) {
    outputPath = outputs[0];
    downloadName = path.basename(outputs[0]);
  } else {
    downloadName = `blue-video-${outputs.length}-audios.zip`;
    outputPath = path.join(job.workspace, downloadName);
    store.update(jobId, { progress: 99, message: 'Criando arquivo ZIP...' });
    await createZip(outputs, outputPath);
  }

  store.update(jobId, {
    status: 'completed',
    progress: 100,
    message: outputs.length === 1 ? 'MP3 pronto para baixar.' : `${outputs.length} MP3 prontos em um ZIP.`,
    files: outputs.map((filePath) => ({ name: path.basename(filePath), size: fs.statSync(filePath).size })),
    outputPath,
    downloadName
  });
}

module.exports = { processConversion };
