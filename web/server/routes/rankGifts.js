import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [logs, customers, suggestedGift] = await Promise.all([
    query(`
      SELECT l.id, l.loai, l.makh, kh.hoten, l.rankcu, l.rankmoi,
             l.mavp, l.tenqua, l.hang, l.thang, l.nam, l.ghichu, l.thoigiantang
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

router.get('/leaderboard', asyncHandler(async (req, res) => {
  const thang = Number(req.query.thang);
  const nam = Number(req.query.nam);
  const rows = await query('SELECT * FROM fn_vinh_danh_thang($1,$2)', [thang, nam]);
  sendOk(res, rows);
}));

router.post('/award-monthly', asyncHandler(async (req, res) => {
  const thang = Number(req.body.thang);
  const nam = Number(req.body.nam);
  const hang = Number(req.body.hang);

  if (!Number.isInteger(thang) || thang < 1 || thang > 12) {
    throw new Error('Thang vinh danh phai nam trong khoang 1-12.');
  }
  if (!Number.isInteger(nam) || nam < 2000 || nam > 2100) {
    throw new Error('Nam vinh danh khong hop le.');
  }
  if (!Number.isInteger(hang) || hang < 1) {
    throw new Error('Hang thuong phai la so nguyen duong.');
  }

  const [winner] = await query(
    'SELECT * FROM fn_vinh_danh_thang($1,$2) WHERE hang = $3',
    [thang, nam, hang]
  );
  if (!winner) {
    throw new Error(`Khong co khach hang hang ${hang} trong thang ${thang}/${nam}.`);
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
    throw new Error(`Hang ${hang} thang ${thang}/${nam} da duoc phat thuong.`);
  }

  const [row] = await query('SELECT fn_phat_thuong_vinh_danh($1,$2) AS message', [winner.makh, hang]);
  const message = row?.message || winner.uu_dai || 'Da phat thuong vinh danh';

  await query(`
    INSERT INTO lichsu_quatang(loai, makh, tenqua, hang, thang, nam, ghichu)
    VALUES ('Vinh danh', $1, $2, $3, $4, $5, $6)
  `, [winner.makh, message, hang, thang, nam, `Vinh danh ${thang}/${nam}`]);

  sendOk(res, { ...winner, message, thang, nam });
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
