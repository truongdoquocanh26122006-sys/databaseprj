import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/revenue', asyncHandler(async (req, res) => {
  const { ngay, thang, nam, tungay, denngay } = req.query;
  const rows = await query('SELECT * FROM fn_doanh_thu($1::date,$2::int,$3::int,$4::date,$5::date)', [
    ngay || null,
    thang ? Number(thang) : null,
    nam ? Number(nam) : null,
    tungay || null,
    denngay || null
  ]);
  sendOk(res, rows[0]);
}));

router.get('/top-items', asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT hang, mavp, tenvp, tong_soluong, tong_doanhthu::numeric AS tong_doanhthu
    FROM top_vatpham_thang($1,$2,$3)
  `, [
    Number(req.query.thang), Number(req.query.nam), Number(req.query.top || 10)
  ]);
  sendOk(res, rows);
}));

router.get('/time-slots', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM fn_thongke_khunggio($1::date,$2::date)', [
    req.query.tungay, req.query.denngay
  ]);
  sendOk(res, rows);
}));

router.get('/employee-performance', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM fn_hieusuat_nhanvien($1::date,$2::date)', [
    req.query.tungay, req.query.denngay
  ]);
  sendOk(res, rows);
}));

export default router;
