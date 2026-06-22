import { Router } from 'express';
import { asyncHandler, query, sendOk } from '../db.js';
import { cancelExpiredReservations } from '../reservationCleanup.js';

const router = Router();
const USE_ACTIVE_PACKAGE = 'USE_ACTIVE_PACKAGE';

const normalizeText = (value) => {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
};

async function generateUnusedId(tableName, columnName, prefix) {
  const [row] = await query(`
    SELECT $1 || lpad(n::text, 4, '0') AS id
    FROM generate_series(1, 9999) AS n
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${tableName}
      WHERE ${columnName} = $1 || lpad(n::text, 4, '0')
    )
    ORDER BY random()
    LIMIT 1
  `, [prefix]);

  if (!row?.id) {
    throw new Error(`Da het ma ${prefix}0001-${prefix}9999; can tang do dai cot ma.`);
  }
  return row.id;
}

async function generateUnusedOrderId() {
  return generateUnusedId('orders', 'maorder', 'OR');
}

async function generateUnusedCustomerId() {
  return generateUnusedId('khachhang', 'makh', 'KH');
}

async function resolveOrderPayload(body) {
  const maorder = normalizeText(body.maorder) || await generateUnusedOrderId();
  const requestedCustomerId = normalizeText(body.makh);
  const rawMadv = normalizeText(body.madv);
  const wantsPackageService = rawMadv === USE_ACTIVE_PACKAGE;
  const madv = wantsPackageService ? 'DV01' : rawMadv;
  const maghe = normalizeText(body.maghe);
  const mapr = normalizeText(body.mapr);
  const sdt = normalizeText(body.sdt);
  const usesPrivateRoom = Boolean(mapr);
  const requestedPackageUse = wantsPackageService || body.sudunggoi === true || body.sudunggoi === 'true';
  const sudunggoi = !usesPrivateRoom && requestedPackageUse;
  let hoten = normalizeText(body.hoten);
  let makh = requestedCustomerId;

  if (madv === 'DV03' || madv === 'DV04') {
    throw new Error('DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi.');
  }

  const [existingOrder] = await query('SELECT 1 FROM orders WHERE maorder = $1', [maorder]);
  if (existingOrder) {
    throw new Error(`Ma order ${maorder} da ton tai. Hay de trong ma order de he thong tu sinh.`);
  }

  if (makh) {
    const [customer] = await query('SELECT hoten, sdt FROM khachhang WHERE makh = $1', [makh]);
    if (customer) {
      hoten = hoten || customer.hoten;
      return { maorder, makh, hoten, madv, maghe, mapr, sdt: sdt || customer.sdt || null, sudunggoi };
    }
    if (!hoten) {
      throw new Error('Ma khach hang chua ton tai, can nhap ho ten hoac de trong ma KH de he thong tu sinh.');
    }
    if (sudunggoi) {
      throw new Error('Chi duoc dung goi voi ma khach hang da ton tai va dang co goi hoat dong.');
    }
    return { maorder, makh, hoten, madv, maghe, mapr, sdt, sudunggoi: false };
  }

  if (sudunggoi) {
    throw new Error('Muon dung goi thi phai nhap ma KH da co goi hoat dong.');
  }
  if (!hoten) {
    throw new Error('Can nhap ho ten khi tao khach moi.');
  }
  makh = await generateUnusedCustomerId();
  return { maorder, makh, hoten, madv, maghe, mapr, sdt, sudunggoi: false };
}

router.get('/', asyncHandler(async (req, res) => {
  const status = req.query.status;
  const rows = await query(`
    SELECT o.maorder, o.status, o.giobatdau, o.gioketthuc, o.thoigiantt, o.hinhthuctt, o.sudunggoi,
           o.thoigiandat, o.madv, dv.tendv, o.makh, kh.hoten, kh.sdt, o.maghe, o.mapr, o.manv
    FROM orders o
    JOIN khachhang kh ON kh.makh = o.makh
    JOIN dichvu dv ON dv.madv = o.madv
    WHERE ($1::text IS NULL OR o.status = $1)
    ORDER BY COALESCE(o.giobatdau, o.thoigiandat) DESC NULLS LAST
  `, [status || null]);
  sendOk(res, rows);
}));

router.get('/:maorder/bill', asyncHandler(async (req, res) => {
  const [summary] = await query(`
    SELECT o.maorder, o.status, o.makh, kh.hoten, kh.rank, o.giobatdau, o.gioketthuc, o.sudunggoi,
           o.madv, dv.tendv, dv.giagoi::numeric * COALESCE(pr.hesogia, 1) AS gia_dv,
           fn_tinh_discount(o.makh)::numeric AS discount,
           fn_kiem_tra_goi(o.makh) AS co_goi,
           COALESCE((
             SELECT l.giatri_giam::numeric
             FROM lichsu_quatang l
             WHERE l.loai = 'Vinh danh'
               AND l.makh = o.makh
               AND l.hang BETWEEN 1 AND 5
               AND l.giatri_giam > 0
               AND l.dadung = false
             ORDER BY l.thoigiantang, l.id
             LIMIT 1
           ), 0) AS fixed_discount,
           CASE
             WHEN o.sudunggoi THEN 0
             ELSE fn_tinh_phat_qua_gio(o.madv, o.giobatdau, NOW()::timestamp)::numeric
           END AS phat_qua_gio
    FROM orders o
    JOIN khachhang kh ON kh.makh = o.makh
    JOIN dichvu dv ON dv.madv = o.madv
    LEFT JOIN phongrieng pr ON pr.mapr = o.mapr
    WHERE o.maorder = $1
  `, [req.params.maorder]);

  if (!summary) {
    throw new Error(`Order ${req.params.maorder} khong ton tai.`);
  }
  if (summary.madv === 'DV03' || summary.madv === 'DV04') {
    throw new Error(`Order ${req.params.maorder} dung ${summary.madv} la du lieu cu sai nghiep vu; goi hoat dong khong duoc thanh toan nhu order.`);
  }

  const items = await query(`
    SELECT ct.mavp, vp.tenvp, ct.soluong,
           vp.giatien::numeric AS dongia,
           (ct.soluong * vp.giatien::numeric) AS thanhtien
    FROM chitietorder ct
    JOIN vatpham vp ON vp.mavp = ct.mavp
    WHERE ct.maorder = $1
    ORDER BY ct.mavp
  `, [req.params.maorder]);

  const tienDv = summary.sudunggoi ? 0 : Number(summary.gia_dv || 0);
  const tienVp = items.reduce((sum, item) => sum + Number(item.thanhtien || 0), 0);
  const phatQuaGio = Number(summary.phat_qua_gio || 0);
  const discount = Number(summary.discount || 0);
  const fixedDiscountAvailable = Number(summary.fixed_discount || 0);
  const tongTruocGiam = tienDv + tienVp + phatQuaGio;
  const tongSauRankGiam = Math.round(tongTruocGiam * (1 - discount));
  const fixedDiscount = Math.min(fixedDiscountAvailable, tongSauRankGiam);
  const tongHd = Math.max(0, tongSauRankGiam - fixedDiscount);

  sendOk(res, {
    summary,
    items,
    totals: {
      tien_dv: tienDv,
      tien_vp: tienVp,
      phat_qua_gio: phatQuaGio,
      tong_truoc_giam: tongTruocGiam,
      discount,
      discount_percent: Math.round(discount * 100),
      fixed_discount: fixedDiscount,
      tong_sau_rank_giam: tongSauRankGiam,
      tong_hd: tongHd
    }
  });
}));

router.get('/next-id', asyncHandler(async (_req, res) => {
  sendOk(res, {
    maorder: await generateUnusedOrderId(),
    makh: await generateUnusedCustomerId()
  });
}));

router.post('/create', asyncHandler(async (req, res) => {
  const { maorder, makh, hoten, madv, maghe, mapr, sdt, sudunggoi } = await resolveOrderPayload(req.body);
  const [row] = await query('SELECT fn_tao_order($1,$2,$3,$4,$5,$6,$7,$8) AS message', [
    maorder, makh, hoten, madv, maghe, mapr, sdt, sudunggoi
  ]);
  sendOk(res, { ...row, maorder, makh });
}));

router.post('/reserve', asyncHandler(async (req, res) => {
  const { thoigiandat } = req.body;
  const { maorder, makh, hoten, madv, maghe, mapr, sdt, sudunggoi } = await resolveOrderPayload(req.body);
  const reservedAt = thoigiandat ? new Date(thoigiandat) : new Date();
  const now = new Date();
  const maxReservation = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(reservedAt.getTime())) {
    throw new Error('Thoi gian dat truoc khong hop le.');
  }
  if (reservedAt < now) {
    throw new Error('Khong the dat truoc thoi gian trong qua khu.');
  }
  if (reservedAt > maxReservation) {
    throw new Error('Chi duoc dat truoc toi da trong pham vi 2 ngay.');
  }
  if (Number(Boolean(maghe)) + Number(Boolean(mapr)) !== 1) {
    throw new Error('Phai chon dung 1 trong 2: ghe hoac phong rieng.');
  }

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
    maorder, makh, hoten, madv, maghe, mapr, sdt, reservedAt, sudunggoi
  ]);
  sendOk(res, { ...row, maorder, makh });
}));

router.post('/checkin', asyncHandler(async (req, res) => {
  const [row] = await query('SELECT fn_checkin($1) AS message', [req.body.maorder]);
  sendOk(res, row);
}));

router.post('/cancel-expired', asyncHandler(async (_req, res) => {
  const cancelled_count = await cancelExpiredReservations();
  sendOk(res, {
    cancelled_count,
    message: `Da huy ${cancelled_count} order dat truoc qua han.`
  });
}));

router.post('/add-item', asyncHandler(async (req, res) => {
  const { maorder, mavp, soluong } = req.body;
  const [order] = await query('SELECT madv FROM orders WHERE maorder = $1', [maorder]);
  if (!order) {
    throw new Error(`Order ${maorder} khong ton tai.`);
  }
  if (order.madv === 'DV03' || order.madv === 'DV04') {
    throw new Error('DV03/DV04 la goi hoat dong, khong phai order su dung cho de them vat pham.');
  }
  const [row] = await query('SELECT fn_them_chitietorder($1,$2,$3) AS message', [
    maorder, mavp, Number(soluong || 1)
  ]);
  sendOk(res, row);
}));

router.post('/pay', asyncHandler(async (req, res) => {
  const { maorder, manv, hinhthuctt } = req.body;
  const [order] = await query('SELECT madv FROM orders WHERE maorder = $1', [maorder]);
  if (!order) {
    throw new Error(`Order ${maorder} khong ton tai.`);
  }
  if (order.madv === 'DV03' || order.madv === 'DV04') {
    throw new Error('DV03/DV04 la goi hoat dong, khong phai order su dung cho de thanh toan.');
  }
  const [row] = await query('SELECT fn_thanh_toan($1,$2,$3) AS receipt', [
    maorder, manv, hinhthuctt
  ]);
  sendOk(res, row);
}));

export default router;
