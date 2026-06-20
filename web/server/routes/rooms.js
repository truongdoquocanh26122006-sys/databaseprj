import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [shared, fullShared, privateRooms, seats] = await Promise.all([
    query('SELECT * FROM v_phong_ghe_trong ORDER BY mapc'),
    query('SELECT * FROM v_lap_day_phong_chung ORDER BY mapc'),
    query('SELECT mapr, songuoitoida, hesogia, status FROM phongrieng ORDER BY mapr'),
    query(`
      SELECT g.maghe, g.mapc,
             CASE WHEN o.maorder IS NULL THEN 'Trong' ELSE o.status END AS status,
             o.maorder
      FROM ghe g
      LEFT JOIN orders o ON o.maghe = g.maghe AND o.status IN ('Dat truoc', 'Dang dung')
      ORDER BY g.mapc, g.maghe
    `)
  ]);
  sendOk(res, { shared, fullShared, privateRooms, seats });
}));

router.get('/suggest', asyncHandler(async (req, res) => {
  const soNguoi = Number(req.query.soNguoi || 1);
  const loai = req.query.loai || 'chung';
  const rows = await query('SELECT * FROM fn_xep_cho($1,$2)', [soNguoi, loai]);
  sendOk(res, rows);
}));

export default router;
