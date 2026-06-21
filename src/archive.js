const fs = require('node:fs');
const path = require('node:path');
const { ZipArchive } = require('archiver');

function createZip(filePaths, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });

    output.on('close', () => resolve(outputPath));
    output.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code !== 'ENOENT') reject(error);
    });
    archive.on('error', reject);

    archive.pipe(output);
    for (const filePath of filePaths) {
      archive.file(filePath, { name: path.basename(filePath) });
    }
    archive.finalize();
  });
}

module.exports = { createZip };
