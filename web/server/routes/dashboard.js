import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [metrics] = await query(`
    WITH completed AS (
      SELECT o.maorder, o.giobatdau, o.thoigiantt, dv.giagoi::numeric AS tien_dv
      FROM orders o
      JOIN dichvu dv ON dv.madv = o.madv
      WHERE o.status = 'Hoan thanh'
    ),
    vp AS (
      SELECT ct.maorder, SUM(ct.soluong * v.giatien::numeric) AS tien_vp
      FROM chitietorder ct
      JOIN vatpham v ON v.mavp = ct.mavp
      GROUP BY ct.maorder
    )
    SELECT
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Dang dung') AS active_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Dat truoc') AS reserved_orders,
      (SELECT COUNT(*) FROM khachhang) AS customers,
      (SELECT COUNT(*) FROM vatpham WHERE soluong < 50) AS low_stock_items,
      (SELECT COUNT(*) FROM phongrieng WHERE status = 'Chua day') AS private_rooms_available,
      (SELECT COALESCE(SUM(soghetrong), 0) FROM phongchung) AS shared_seats_available,
      (SELECT COUNT(*) FROM v_ca_thieu_nhan_vien) AS understaffed_shifts,
      (SELECT COALESCE(SUM(c.tien_dv + COALESCE(vp.tien_vp, 0)), 0) FROM completed c LEFT JOIN vp ON vp.maorder = c.maorder) AS total_revenue
  `);

  const recentOrders = await query(`
    SELECT o.maorder, o.status, o.giobatdau, o.gioketthuc, o.hinhthuctt,
           kh.hoten, kh.sdt, dv.tendv, o.maghe, o.mapr
    FROM orders o
    JOIN khachhang kh ON kh.makh = o.makh
    JOIN dichvu dv ON dv.madv = o.madv
    ORDER BY COALESCE(o.giobatdau, o.thoigiandat) DESC NULLS LAST
    LIMIT 8
  `);

  const lowStock = await query('SELECT * FROM check_vp() LIMIT 8');
  const shifts = await query('SELECT * FROM v_ca_thieu_nhan_vien LIMIT 8');

  sendOk(res, { metrics, recentOrders, lowStock, shifts });
}));

router.get('/lookups', asyncHandler(async (_req, res) => {
  const [services, customers, items, employees, seats, privateRooms, activeOrders] = await Promise.all([
    query(`
      SELECT madv, tendv, giagoi::numeric AS giagoi
      FROM dichvu
      WHERE madv NOT IN ('DV03', 'DV04')
      ORDER BY madv
    `),
    query('SELECT makh, hoten, sdt, rank, diemtichluy FROM khachhang ORDER BY makh DESC LIMIT 100'),
    query('SELECT mavp, tenvp, giatien::numeric AS giatien, soluong, makho FROM vatpham ORDER BY mavp'),
    query('SELECT manv, tennv, hesoluong FROM nhanvien ORDER BY manv'),
    query(`
      WITH free_seats AS (
        SELECT g.maghe, g.mapc, false AS co_the_thu_hoi, NULL::varchar AS order_cu
        FROM ghe g
        WHERE NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.maghe = g.maghe AND o.status IN ('Dat truoc', 'Dang dung')
        )
      ),
      reclaimable_seats AS (
        SELECT g.maghe, g.mapc, true AS co_the_thu_hoi, o.maorder AS order_cu
        FROM ghe g
        JOIN orders o ON o.maghe = g.maghe
        WHERE o.status = 'Dang dung'
          AND fn_tinh_phat_qua_gio(o.madv, o.giobatdau, NOW()::timestamp) > 0
      )
      SELECT * FROM free_seats
      UNION ALL
      SELECT * FROM reclaimable_seats
      WHERE NOT EXISTS (SELECT 1 FROM free_seats)
      ORDER BY maghe
      LIMIT 100
    `),
    query(`
      WITH free_rooms AS (
        SELECT pr.mapr, pr.songuoitoida, pr.hesogia, pr.status,
               false AS co_the_thu_hoi, NULL::varchar AS order_cu
        FROM phongrieng pr
        WHERE NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.mapr = pr.mapr AND o.status IN ('Dat truoc', 'Dang dung')
        )
      ),
      reclaimable_rooms AS (
        SELECT pr.mapr, pr.songuoitoida, pr.hesogia, pr.status,
               true AS co_the_thu_hoi, o.maorder AS order_cu
        FROM phongrieng pr
        JOIN orders o ON o.mapr = pr.mapr
        WHERE o.status = 'Dang dung'
          AND fn_tinh_phat_qua_gio(o.madv, o.giobatdau, NOW()::timestamp) > 0
      )
      SELECT * FROM free_rooms
      UNION ALL
      SELECT * FROM reclaimable_rooms
      WHERE NOT EXISTS (SELECT 1 FROM free_rooms)
      ORDER BY mapr
    `),
    query(`
      SELECT maorder, makh, status
      FROM orders
      WHERE status IN ('Dang dung', 'Dat truoc')
        AND madv NOT IN ('DV03', 'DV04')
      ORDER BY COALESCE(giobatdau, thoigiandat) DESC
      LIMIT 100
    `)
  ]);

  sendOk(res, { services, customers, items, employees, seats, privateRooms, activeOrders });
}));

export default router;
