import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [items, lowStock, warehouses] = await Promise.all([
    query(`
      SELECT v.mavp, v.tenvp, v.giatien::numeric AS giatien,
             v.makho, k.tenkho, v.soluong
      FROM vatpham v
      JOIN kho k ON k.makho = v.makho
      ORDER BY v.soluong, v.mavp
    `),
    query('SELECT * FROM check_vp()'),
    query('SELECT makho, tenkho, diachi FROM kho ORDER BY makho')
  ]);
  sendOk(res, { items, lowStock, warehouses });
}));

router.post('/import', asyncHandler(async (req, res) => {
  const { mavp, soluong } = req.body;
  const [row] = await query('SELECT fn_nhap_hang($1,$2) AS message', [
    mavp, Number(soluong)
  ]);
  sendOk(res, row);
}));

router.post('/create', asyncHandler(async (req, res) => {
  const { mavp, tenvp, giatien, soluong, makho } = req.body;
  const [row] = await query('SELECT fn_tao_vatpham($1,$2,$3,$4,$5) AS message', [
    mavp, tenvp, Number(giatien), Number(soluong || 0), makho
  ]);
  sendOk(res, row);
}));

export default router;
