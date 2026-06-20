import crypto from 'crypto';

const TOKEN_SECRET = process.env.AUTH_SECRET || 'studyspace-local-demo-secret';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('md5:')) {
    return `md5:${crypto.createHash('md5').update(String(password)).digest('hex')}` === storedHash;
  }
  if (storedHash.startsWith('scrypt:')) {
    const [, salt, expected] = storedHash.split(':');
    const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }
  return false;
}

export function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    makh: user.makh || null,
    manv: user.manv || null,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const body = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}`;
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function parseToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!user.exp || user.exp < Date.now()) return null;
  return user;
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = parseToken(token);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Can dang nhap de su dung chuc nang nay.' });
    return;
  }
  req.user = user;
  next();
}

export function requireStaff(req, res, next) {
  if (req.user?.role !== 'staff') {
    res.status(403).json({ ok: false, error: 'Chi nhan vien moi duoc truy cap/chinh sua muc nay.' });
    return;
  }
  next();
}
