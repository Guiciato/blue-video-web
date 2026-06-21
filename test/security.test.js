const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateAddress, safeFileName, validatePublicHttpUrl } = require('../src/security');

test('bloqueia IPv4 privados e locais', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('10.1.2.3'), true);
  assert.equal(isPrivateAddress('192.168.1.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

test('bloqueia IPv6 local', () => {
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('fd00::1'), true);
});

test('limpa nomes de arquivo perigosos', () => {
  assert.equal(safeFileName('meu:vídeo?.mp4'), 'meu vídeo .mp4');
});

test('rejeita protocolos e hosts locais', async () => {
  await assert.rejects(() => validatePublicHttpUrl('file:///etc/passwd'));
  await assert.rejects(() => validatePublicHttpUrl('http://127.0.0.1/video'));
  await assert.rejects(() => validatePublicHttpUrl('http://localhost/video'));
});
