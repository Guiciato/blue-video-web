const dns = require('node:dns').promises;
const net = require('node:net');

function ipv4ToNumber(address) {
  return address.split('.').reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}

function ipv4InCidr(address, base, prefix) {
  const addressNumber = ipv4ToNumber(address);
  const baseNumber = ipv4ToNumber(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressNumber & mask) === (baseNumber & mask);
}

function isPrivateIpv4(address) {
  const ranges = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
  ];
  return ranges.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('2001:db8:')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function validatePublicHttpUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value.length > 2048) {
    throw new Error('O link está vazio ou é grande demais.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Cole um link HTTP ou HTTPS válido.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Somente links HTTP ou HTTPS são permitidos.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Links com usuário ou senha embutidos não são permitidos.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Endereços locais ou internos não são permitidos.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Endereços privados ou internos não são permitidos.');
    return parsed.toString();
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Não foi possível localizar o servidor desse link.');
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('O link aponta para uma rede privada ou não permitida.');
  }

  return parsed.toString();
}

function safeFileName(value, fallback = 'arquivo') {
  const cleaned = String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

function accessTokenFromRequest(request) {
  return String(request.query.token || request.get('x-job-token') || '').trim();
}

module.exports = {
  validatePublicHttpUrl,
  isPrivateAddress,
  safeFileName,
  accessTokenFromRequest
};
