import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';

const router = Router();
const USE_ACTIVE_PACKAGE = 'USE_ACTIVE_PACKAGE';
const normalizeText = (value) => {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
};

async function generateUnusedOrderId() {
  const [row] = await query(`
    SELECT 'OR' || lpad(n::text, 4, '0') AS id
    FROM generate_series(1, 9999) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM orders WHERE maorder = 'OR' || lpad(n::text, 4, '0')
    )
    ORDER BY random()
    LIMIT 1
  `);
  if (!row?.id) {
    throw new Error('Da het ma OR0001-OR9999; can tang do dai cot ma order.');
  }
  return row.id;
}

router.get('/me', asyncHandler(async (req, res) => {
  if (req.user.role !== 'customer' || !req.user.makh) {
    throw new Error('Trang nay chi danh cho tai khoan khach hang.');
  }

  const makh = req.user.makh;
  const [customer, packages, orders, gifts, services, seats, privateRooms, activeOrders, items] = await Promise.all([
    query(`
      SELECT makh, hoten, sdt, diemtichluy, rank,
             fn_tinh_discount(makh)::numeric AS discount,
             fn_kiem_tra_goi(makh) AS co_goi
      FROM khachhang
      WHERE makh = $1
    `, [makh]),
    query(`
      SELECT g.id, g.madv, dv.tendv, g.ngaybatdau, g.ngayketthuc, g.status
      FROM goihoatdong g
      JOIN dichvu dv ON dv.madv = g.madv
      WHERE g.makh = $1
      ORDER BY g.ngaybatdau DESC, g.id DESC
      LIMIT 40
    `, [makh]),
    query(`
      SELECT o.maorder, o.madv, dv.tendv, o.sudunggoi, o.status, o.giobatdau, o.gioketthuc, o.thoigiandat
      FROM orders o
      JOIN dichvu dv ON dv.madv = o.madv
      WHERE o.makh = $1
      ORDER BY COALESCE(o.giobatdau, o.thoigiandat) DESC NULLS LAST
      LIMIT 80
    `, [makh]),
    query(`
      SELECT loai, rankcu, rankmoi, tenqua, hang, thang, nam, ghichu, thoigiantang
      FROM lichsu_quatang
      WHERE makh = $1
      ORDER BY thoigiantang DESC, id DESC
      LIMIT 60
    `, [makh]),
    query(`
      SELECT madv, tendv, giagoi::numeric AS giagoi
      FROM dichvu
      WHERE madv NOT IN ('DV03', 'DV04')
      ORDER BY madv
    `),
    query(`
      SELECT g.maghe, g.mapc
      FROM ghe g
      WHERE NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.maghe = g.maghe
          AND o.status IN ('Dat truoc', 'Dang dung')
      )
      ORDER BY g.maghe
    `),
    query(`
      SELECT mapr, songuoitoida, hesogia
      FROM phongrieng pr
      WHERE pr.status = 'Chua day'
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.mapr = pr.mapr
            AND o.status IN ('Dat truoc', 'Dang dung')
        )
      ORDER BY mapr
    `),
    query(`
      SELECT maorder, status
      FROM orders
      WHERE makh = $1
        AND status = 'Dang dung'
      ORDER BY giobatdau DESC NULLS LAST
      LIMIT 20
    `, [makh]),
    query(`
      SELECT mavp, tenvp, soluong
      FROM vatpham
      WHERE soluong > 0
      ORDER BY tenvp, mavp
      LIMIT 120
    `)
  ]);

  if (!customer[0]) {
    throw new Error('Khong tim thay thong tin khach hang.');
  }
  sendOk(res, { customer: customer[0], packages, orders, gifts, services, seats, privateRooms, activeOrders, items });
}));

router.post('/reserve', asyncHandler(async (req, res) => {
  if (req.user.role !== 'customer' || !req.user.makh) {
    throw new Error('Chi tai khoan khach hang moi duoc tu dat truoc.');
  }

  const makh = req.user.makh;
  const rawMadv = normalizeText(req.body.madv);
  const sudunggoi = rawMadv === USE_ACTIVE_PACKAGE || req.body.sudunggoi === true || req.body.sudunggoi === 'true';
  const madv = rawMadv === USE_ACTIVE_PACKAGE ? 'DV01' : rawMadv;
  const maghe = normalizeText(req.body.maghe);
  const mapr = normalizeText(req.body.mapr);
  const reservedAt = req.body.thoigiandat ? new Date(req.body.thoigiandat) : new Date();
  const now = new Date();
  const maxReservation = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  if (madv === 'DV03' || madv === 'DV04') {
    throw new Error('DV03/DV04 la goi hoat dong. Hay mua trong khu vuc Goi cua toi.');
  }
  if (Number(Boolean(maghe)) + Number(Boolean(mapr)) !== 1) {
    throw new Error('Phai chon dung 1 trong 2: ghe hoac phong rieng.');
  }
  if (Number.isNaN(reservedAt.getTime())) {
    throw new Error('Thoi gian dat truoc khong hop le.');
  }
  if (reservedAt < now) {
    throw new Error('Khong the dat truoc thoi gian trong qua khu.');
  }
  if (reservedAt > maxReservation) {
    throw new Error('Chi duoc dat truoc toi da trong pham vi 2 ngay.');
  }

  const [customer] = await query('SELECT hoten, sdt FROM khachhang WHERE makh = $1', [makh]);
  if (!customer) {
    throw new Error('Khong tim thay thong tin khach hang.');
  }

  const maorder = await generateUnusedOrderId();
  const [row] = await query(`
    SELECT fn_dat_truoc(
      $1::varchar(6),
      $2::varchar(6),
      $3::varchar(20),
      $4::varchar(6),
      $5::varchar(6),
      $6::varchar(6),
      $7::varchar(10),
      $8::timestamp,
      $9::boolean
    ) AS message
  `, [
    maorder, makh, customer.hoten, madv, maghe, mapr, customer.sdt, reservedAt, sudunggoi
  ]);
  sendOk(res, { ...row, maorder, makh, message: `Dat truoc thanh cong. Ma order: ${maorder}` });
}));

router.post('/packages/register', asyncHandler(async (req, res) => {
  const { madv, ngaybatdau } = req.body;
  await query('CALL sp_dangky_goi($1,$2,$3::date)', [req.user.makh, madv, ngaybatdau]);
  const [created] = await query(`
    SELECT id
    FROM goihoatdong
    WHERE makh = $1
      AND madv = $2
      AND ngaybatdau = $3::date
    ORDER BY id DESC
    LIMIT 1
  `, [req.user.makh, madv, ngaybatdau]);
  sendOk(res, {
    id: created?.id || null,
    message: created?.id
      ? `Dang ky goi thanh cong. ID goi: ${created.id}`
      : 'Dang ky goi thanh cong'
  });
}));

router.post('/packages/extend', asyncHandler(async (req, res) => {
  const id = Number(req.body.id);
  const [existing] = await query('SELECT madv FROM goihoatdong WHERE id = $1 AND makh = $2', [id, req.user.makh]);
  if (!existing) {
    throw new Error(`Khong tim thay goi cua ban voi ID: ${req.body.id}`);
  }

  const days = existing.madv === 'DV04' ? 7 : 1;
  await query('CALL sp_giahan_goi($1,$2)', [id, days]);
  sendOk(res, { id, message: `Gia han goi thanh cong (${days} ngay). ID goi: ${id}` });
}));

router.post('/packages/cancel', asyncHandler(async (_req, _res) => {
  throw new Error('Chuc nang huy goi da duoc tat de giu schema va trang thai goi on dinh.');
}));

router.post('/add-item', asyncHandler(async (req, res) => {
  const { maorder, mavp, soluong } = req.body;
  const [order] = await query(`
    SELECT maorder
    FROM orders
    WHERE maorder = $1
      AND makh = $2
      AND status = 'Dang dung'
  `, [maorder, req.user.makh]);
  if (!order) {
    throw new Error('Chi duoc goi mon cho order Dang dung cua chinh ban.');
  }

  const [row] = await query('SELECT fn_them_chitietorder($1,$2,$3) AS message', [
    maorder, mavp, Number(soluong || 1)
  ]);
  sendOk(res, { ...row, maorder });
}));

export default router;
