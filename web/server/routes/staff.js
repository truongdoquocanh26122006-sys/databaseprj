import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

function normalizeText(value) {
  if (typeof value !== 'string') return value ?? '';
  return value.trim();
}

function normalizeDateInput(value, label) {
  const text = normalizeText(value);
  if (!text) {
    throw new Error(`${label} khong duoc de trong.`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error(`${label} khong hop le. Hay chon ngay bang o lich.`);
}

async function requireShift(manv, ngay, cathu, label) {
  const employeeId = normalizeText(manv);
  const shiftName = normalizeText(cathu);
  if (!employeeId) {
    throw new Error(`${label} chua chon nhan vien.`);
  }

  const [exists] = await query(`
    SELECT 1
    FROM dilam
    WHERE manv = $1 AND ngay = $2::date AND cathu = $3
  `, [employeeId, ngay, shiftName]);

  if (exists) return;

  const [current] = await query(`
    SELECT STRING_AGG(manv, ', ' ORDER BY manv) AS nhanvien
    FROM dilam
    WHERE ngay = $1::date AND cathu = $2
  `, [ngay, shiftName]);

  throw new Error(
    `${employeeId} khong co ca ${shiftName} ngay ${ngay}. ` +
    `Ca nay hien co: ${current?.nhanvien || 'khong co nhan vien nao'}. Hay bam Tai lai va chon lai lich.`
  );
}

router.get('/', asyncHandler(async (_req, res) => {
  const [employees, upcomingShifts, shortage] = await Promise.all([
    query('SELECT manv, tennv, hesoluong FROM nhanvien ORDER BY manv'),
    query(`
      WITH lich_thang_toi AS (
        SELECT gs.ngay::date AS ngay, ca.cathu, ca.shift_order
        FROM generate_series(
          CURRENT_DATE,
          (CURRENT_DATE + INTERVAL '1 month')::date,
          INTERVAL '1 day'
        ) AS gs(ngay)
        CROSS JOIN (
          VALUES
            ('Ca Sang'::varchar(10), 1),
            ('Ca Chieu'::varchar(10), 2),
            ('Ca Toi'::varchar(10), 3)
        ) AS ca(cathu, shift_order)
      )
      SELECT l.ngay, l.cathu,
             CASE
               WHEN COUNT(d.manv) >= 3 THEN 'Du nguoi'
               WHEN COUNT(d.manv) > 0 THEN 'Thieu nguoi'
               ELSE 'Chua co nguoi'
             END AS status,
             COALESCE(c.nghisom, false) AS nghisom,
             c.thoigiannghisom,
             COUNT(d.manv) AS so_nv,
             STRING_AGG(d.manv, ', ' ORDER BY d.manv) AS nhanvien
      FROM lich_thang_toi l
      LEFT JOIN calam c ON c.ngay = l.ngay AND c.cathu = l.cathu
      LEFT JOIN dilam d ON d.ngay = l.ngay AND d.cathu = l.cathu
      GROUP BY l.ngay, l.cathu, l.shift_order, c.nghisom, c.thoigiannghisom
      ORDER BY l.ngay, l.shift_order
      LIMIT 120
    `),
    query('SELECT * FROM v_ca_thieu_nhan_vien')
  ]);
  sendOk(res, { employees, upcomingShifts, shortage });
}));

router.post('/assign', asyncHandler(async (req, res) => {
  const { manv, ngay, cathu } = req.body;
  const day = normalizeDateInput(ngay, 'Ngay nhan ca');
  const employeeId = normalizeText(manv);
  const shiftName = normalizeText(cathu);

  if (!employeeId) {
    throw new Error('Chua chon nhan vien nhan ca.');
  }
  if (day < new Date().toLocaleDateString('en-CA')) {
    throw new Error(`Khong duoc nhan ca trong qua khu: ${shiftName} ngay ${day}.`);
  }

  await query(`
    INSERT INTO calam(ngay, cathu, status)
    VALUES ($1::date, $2, 'Chua co nguoi')
    ON CONFLICT (ngay, cathu) DO NOTHING
  `, [day, shiftName]);

  await query('INSERT INTO dilam(ngay, cathu, manv) VALUES ($1::date,$2,$3)', [
    day, shiftName, employeeId
  ]);

  sendOk(res, { message: 'Nhan ca thanh cong' });
}));

router.post('/swap', asyncHandler(async (req, res) => {
  const { manv1, ngay1, cathu1, manv2, ngay2, cathu2 } = req.body;
  const day1 = normalizeDateInput(ngay1, 'Ngay 1');
  const day2 = normalizeDateInput(ngay2, 'Ngay 2');
  await requireShift(manv1, day1, cathu1, 'NV 1');
  await requireShift(manv2, day2, cathu2, 'NV 2');
  await query('CALL sp_doi_cheo_ca($1,$2::date,$3,$4,$5::date,$6)', [
    normalizeText(manv1), day1, normalizeText(cathu1), normalizeText(manv2), day2, normalizeText(cathu2)
  ]);
  sendOk(res, { message: 'Doi ca thanh cong' });
}));

router.post('/substitute', asyncHandler(async (req, res) => {
  const { manvThay, manvNghi, ngay, cathu } = req.body;
  const day = normalizeDateInput(ngay, 'Ngay thay');
  if (!normalizeText(manvThay)) {
    throw new Error('NV thay chua chon nhan vien.');
  }
  await requireShift(manvNghi, day, cathu, 'NV nghi');
  await query('CALL sp_lam_thay_ca($1,$2,$3::date,$4)', [
    normalizeText(manvThay), normalizeText(manvNghi), day, normalizeText(cathu)
  ]);
  sendOk(res, { message: 'Lam thay ca thanh cong' });
}));

router.get('/salary', asyncHandler(async (req, res) => {
  const thang = Number(req.query.thang);
  const nam = Number(req.query.nam);
  const rows = await query('SELECT * FROM ds_luong_theo_thang($1,$2)', [thang, nam]);
  sendOk(res, rows);
}));

router.get('/early-leave', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM fn_thongke_nghi_som($1,$2)', [
    Number(req.query.thang), Number(req.query.nam)
  ]);
  sendOk(res, rows);
}));

export default router;
