import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const rows = await query(`
    SELECT g.id, g.makh, kh.hoten, g.madv, dv.tendv, g.ngaybatdau, g.ngayketthuc, g.status
    FROM goihoatdong g
    JOIN khachhang kh ON kh.makh = g.makh
    JOIN dichvu dv ON dv.madv = g.madv
    ORDER BY g.ngaybatdau DESC, g.id DESC
    LIMIT 160
  `);
  sendOk(res, rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`ID goi khong hop le: ${req.params.id}`);
  }

  const [row] = await query(`
    SELECT g.id, g.makh, kh.hoten, g.madv, dv.tendv, g.ngaybatdau, g.ngayketthuc, g.status
    FROM goihoatdong g
    JOIN khachhang kh ON kh.makh = g.makh
    JOIN dichvu dv ON dv.madv = g.madv
    WHERE g.id = $1
  `, [id]);

  if (!row) {
    throw new Error(`Khong tim thay goi voi ID: ${req.params.id}`);
  }
  sendOk(res, row);
}));

router.post('/register', asyncHandler(async (req, res) => {
  const { makh, madv, ngaybatdau } = req.body;
  if (!makh || !String(makh).trim()) {
    throw new Error('Can nhap ma KH de dang ky goi.');
  }
  await query('CALL sp_dangky_goi($1,$2,$3::date)', [makh, madv, ngaybatdau]);
  const [created] = await query(`
    SELECT id
    FROM goihoatdong
    WHERE makh = $1
      AND madv = $2
      AND ngaybatdau = $3::date
    ORDER BY id DESC
    LIMIT 1
  `, [makh, madv, ngaybatdau]);
  sendOk(res, {
    id: created?.id || null,
    message: created?.id
      ? `Dang ky goi thanh cong. ID goi: ${created.id}`
      : 'Dang ky goi thanh cong'
  });
}));

router.post('/extend', asyncHandler(async (req, res) => {
  const id = Number(req.body.id);
  const [existing] = await query('SELECT madv FROM goihoatdong WHERE id = $1', [id]);
  if (!existing) {
    throw new Error(`Khong tim thay goi voi ID: ${req.body.id}`);
  }

  const days = existing.madv === 'DV04' ? 7 : 1;
  await query('CALL sp_giahan_goi($1,$2)', [id, days]);
  sendOk(res, { message: `Gia han goi thanh cong (${days} ngay)` });
}));

router.post('/cancel', asyncHandler(async (_req, _res) => {
  throw new Error('Chuc nang huy goi da duoc tat de giu schema va trang thai goi on dinh.');
}));

router.post('/refresh-status', asyncHandler(async (_req, res) => {
  await query('CALL sp_capnhat_trangthai_goi()');
  sendOk(res, { message: 'Da cap nhat trang thai goi' });
}));

export default router;
