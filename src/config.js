const path = require('node:path');

require('dotenv').config({ quiet: true });

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');

module.exports = Object.freeze({
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  dataDir,
  jobsDir: path.join(dataDir, 'jobs'),
  uploadsDir: path.join(dataDir, 'uploads'),
  port: positiveInteger(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  maxConcurrentJobs: positiveInteger(process.env.MAX_CONCURRENT_JOBS, 1),
  maxPlaylistItems: positiveInteger(process.env.MAX_PLAYLIST_ITEMS, 30),
  maxUploadFiles: positiveInteger(process.env.MAX_UPLOAD_FILES, 10),
  maxUploadBytesPerFile: positiveInteger(process.env.MAX_UPLOAD_MB_PER_FILE, 500) * 1024 * 1024,
  jobTtlMs: positiveInteger(process.env.JOB_TTL_MINUTES, 60) * 60 * 1000,
  rateLimitWindowMs: positiveInteger(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
  rateLimitMaxRequests: positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  downloadRateLimitMax: positiveInteger(process.env.DOWNLOAD_RATE_LIMIT_MAX, 10),
  ytDlpBin: process.env.YT_DLP_BIN || 'yt-dlp',
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe'
});
