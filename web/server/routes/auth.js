import { Router } from 'express';
import { asyncHandler, pool, query, sendOk } from '../db.js';
import { hashPassword, requireAuth, signToken, verifyPassword } from '../auth.js';

const router = Router();

const normalize = (value) => typeof value === 'string' ? value.trim() : '';

async function generateUnusedCustomerId(client) {
  const result = await client.query(`
    SELECT 'KH' || lpad(n::text, 4, '0') AS id
    FROM generate_series(1, 9999) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM khachhang WHERE makh = 'KH' || lpad(n::text, 4, '0')
    )
    ORDER BY random()
    LIMIT 1
  `);
  if (!result.rows[0]?.id) {
    throw new Error('Da het ma KH0001-KH9999; can tang do dai cot ma.');
  }
  return result.rows[0].id;
}

async function loadPublicUser(account) {
  if (account.role === 'customer') {
    const [customer] = await query('SELECT hoten, sdt, diemtichluy, rank FROM khachhang WHERE makh = $1', [account.makh]);
    return { ...account, ...customer };
  }
  const [staff] = account.manv
    ? await query('SELECT tennv FROM nhanvien WHERE manv = $1', [account.manv])
    : [];
  return { ...account, ...staff };
}

router.post('/login', asyncHandler(async (req, res) => {
  const username = normalize(req.body.username).toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) {
    throw new Error('Can nhap username va mat khau.');
  }

  const [account] = await query(`
    SELECT id, username, password_hash, role, makh, manv
    FROM taikhoan
    WHERE lower(username) = $1
  `, [username]);
  if (!account || !verifyPassword(password, account.password_hash)) {
    throw new Error('Sai username hoac mat khau.');
  }

  delete account.password_hash;
  const user = await loadPublicUser(account);
  sendOk(res, { token: signToken(user), user });
}));

router.post('/register', asyncHandler(async (req, res) => {
  const username = normalize(req.body.username).toLowerCase();
  const password = String(req.body.password || '');
  const hoten = normalize(req.body.hoten);
  const sdt = normalize(req.body.sdt) || null;

  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) {
    throw new Error('Username chi gom chu thuong, so, dau ., _, - va dai 3-40 ky tu.');
  }
  if (password.length < 6) {
    throw new Error('Mat khau can toi thieu 6 ky tu.');
  }
  if (!hoten || hoten.length > 20) {
    throw new Error('Ho ten bat buoc va toi da 20 ky tu theo schema khachhang.');
  }
  if (sdt && !/^0[0-9]{9}$/.test(sdt)) {
    throw new Error('SDT phai co 10 chu so va bat dau bang 0.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const makh = await generateUnusedCustomerId(client);
    await client.query(
      'INSERT INTO khachhang(makh, hoten, sdt, diemtichluy, rank) VALUES ($1,$2,$3,0,$4)',
      [makh, hoten, sdt, 'Dong']
    );
    const inserted = await client.query(`
      INSERT INTO taikhoan(username, password_hash, role, makh)
      VALUES ($1,$2,'customer',$3)
      RETURNING id, username, role, makh, manv
    `, [username, hashPassword(password), makh]);
    await client.query('COMMIT');

    const user = await loadPublicUser(inserted.rows[0]);
    sendOk(res, { token: signToken(user), user });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw new Error('Username da ton tai.');
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [account] = await query(`
    SELECT id, username, role, makh, manv
    FROM taikhoan
    WHERE id = $1
  `, [req.user.id]);
  if (!account) {
    throw new Error('Tai khoan khong con ton tai.');
  }
  sendOk(res, await loadPublicUser(account));
}));

export default router;
