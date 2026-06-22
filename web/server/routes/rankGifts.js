import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [logs, customers, suggestedGift] = await Promise.all([
    query(`
      SELECT l.id, l.loai, l.makh, kh.hoten, l.rankcu, l.rankmoi,
             l.mavp, l.tenqua, l.hang, l.thang, l.nam, l.giatri_giam,
             l.dadung, l.maorder_sudung, l.thoigian_sudung,
             l.ghichu, l.thoigiantang
      FROM lichsu_quatang l
      JOIN khachhang kh ON kh.makh = l.makh
      ORDER BY l.thoigiantang DESC, l.id DESC
      LIMIT 120
    `),
    query(`
      SELECT makh, hoten, sdt, diemtichluy, rank,
             fn_tinh_discount(makh)::numeric AS discount,
             fn_kiem_tra_goi(makh) AS co_goi
      FROM khachhang
      ORDER BY diemtichluy DESC, makh
      LIMIT 120
    `),
    query('SELECT * FROM fn_tim_qua_tang() LIMIT 1')
  ]);

  sendOk(res, {
    logs,
    customers,
    suggestedGift: suggestedGift[0] || null
  });
}));

router.get('/leaderboard', asyncHandler(async (_req, res) => {
  const rows = await query(`
    WITH ky AS (
      SELECT EXTRACT(MONTH FROM now())::int AS thang,
             EXTRACT(YEAR FROM now())::int AS nam
    ),
    lb AS (
      SELECT * FROM fn_vinh_danh_thang()
    )
    SELECT lb.*, ky.thang, ky.nam,
           l.id AS lichsu_id,
           l.tenqua AS thuong_da_phat,
           COALESCE(l.dadung, false) AS thuong_da_dung,
           (l.id IS NOT NULL) AS da_nhan_thuong,
           (l.id IS NULL) AS chua_nhan_thuong
    FROM lb
    CROSS JOIN ky
    LEFT JOIN lichsu_quatang l
      ON l.loai = 'Vinh danh'
     AND l.hang = lb.hang
     AND l.thang = ky.thang
     AND l.nam = ky.nam
    ORDER BY lb.hang
  `);
  sendOk(res, rows);
}));

router.post('/award-monthly', asyncHandler(async (req, res) => {
  const hang = Number(req.body.hang);

  if (!Number.isInteger(hang) || hang < 1) {
    throw new Error('Hang thuong phai la so nguyen duong.');
  }

  const [period] = await query(`
    SELECT EXTRACT(MONTH FROM now())::int AS thang,
           EXTRACT(YEAR FROM now())::int AS nam
  `);
  const thang = Number(period.thang);
  const nam = Number(period.nam);

  const [winner] = await query(
    'SELECT * FROM fn_vinh_danh_thang() WHERE hang = $1',
    [hang]
  );
  if (!winner) {
    throw new Error(`Khong co khach hang hang ${hang} trong bang vinh danh hien tai.`);
  }

  const [existing] = await query(`
    SELECT id
    FROM lichsu_quatang
    WHERE loai = 'Vinh danh'
      AND thang = $1
      AND nam = $2
      AND hang = $3
    LIMIT 1
  `, [thang, nam, hang]);
  if (existing) {
    throw new Error(`Hang ${hang} ky ${thang}/${nam} da duoc phat thuong.`);
  }

  const [row] = await query('SELECT fn_phat_thuong_vinh_danh($1,$2) AS message', [winner.makh, hang]);
  const message = row?.message || winner.uu_dai || 'Da phat thuong vinh danh';
  const giatriGiam = hang <= 5 ? 50000 : 0;

  await query(`
    INSERT INTO lichsu_quatang(loai, makh, tenqua, hang, thang, nam, giatri_giam, dadung, ghichu)
    VALUES ('Vinh danh', $1, $2, $3, $4, $5, $6, false, $7)
  `, [winner.makh, message, hang, thang, nam, giatriGiam, `Vinh danh ${thang}/${nam}`]);

  sendOk(res, { ...winner, message, thang, nam, giatri_giam: giatriGiam });
}));

router.get('/customer/:makh', asyncHandler(async (req, res) => {
  const [row] = await query(`
    SELECT makh, hoten, sdt, diemtichluy, rank,
           fn_tinh_discount(makh)::numeric AS discount,
           fn_kiem_tra_goi(makh) AS co_goi
    FROM khachhang
    WHERE makh = $1
  `, [req.params.makh]);

  if (!row) {
    throw new Error(`Khong tim thay khach hang ${req.params.makh}.`);
  }

  sendOk(res, row);
}));

export default router;
