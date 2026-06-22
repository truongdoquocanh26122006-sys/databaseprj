-- StudySpace consolidated patches after namt_studyspace_latest_20260604.sql
-- Run this once after importing the dump. Safe to rerun where each section is idempotent.
-- Generated from the former small migration files.


-- ============================================================
-- 01. Tu dong huy dat truoc qua han
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_huy_dat_truoc_qua_han()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cancelled integer;
BEGIN
  UPDATE orders
  SET status = 'Da huy'
  WHERE status = 'Dat truoc'
    AND now() > thoigiandat + interval '30 minutes';

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;

ALTER FUNCTION public.fn_huy_dat_truoc_qua_han() OWNER TO postgres;


-- ============================================================
-- 02. Qua rank va lich su qua tang
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lichsu_quatang (
    id BIGSERIAL PRIMARY KEY,
    loai VARCHAR(20) NOT NULL,
    makh VARCHAR(6) NOT NULL REFERENCES public.khachhang(makh) ON DELETE CASCADE,
    rankcu VARCHAR(10),
    rankmoi VARCHAR(10),
    mavp VARCHAR(6) REFERENCES public.vatpham(mavp) ON DELETE SET NULL,
    tenqua TEXT NOT NULL,
    hang INTEGER,
    ghichu TEXT,
    thoigiantang TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT lichsu_quatang_loai_check CHECK (loai IN ('Rank up', 'Vinh danh'))
);

CREATE INDEX IF NOT EXISTS idx_lichsu_quatang_makh
    ON public.lichsu_quatang(makh);

CREATE INDEX IF NOT EXISTS idx_lichsu_quatang_thoigian
    ON public.lichsu_quatang(thoigiantang DESC);

CREATE OR REPLACE FUNCTION public.fn_tang_qua_rankup(
    p_makh character varying,
    p_rankcu character varying,
    p_rankmoi character varying
) RETURNS text
    LANGUAGE plpgsql
AS $$
DECLARE
    v_mavp VARCHAR(6);
    v_tenvp VARCHAR(20);
    v_message TEXT;
BEGIN
    IF p_rankmoi = p_rankcu THEN
        RETURN '';
    END IF;

    SELECT mavp, tenvp INTO v_mavp, v_tenvp
    FROM fn_tim_qua_tang();

    IF v_mavp IS NULL THEN
        v_message := 'Kho da het qua tang';
        INSERT INTO lichsu_quatang(loai, makh, rankcu, rankmoi, tenqua, ghichu)
        VALUES ('Rank up', p_makh, p_rankcu, p_rankmoi, v_message, v_message);
        RETURN v_message;
    END IF;

    UPDATE vatpham
    SET soluong = soluong - 1
    WHERE mavp = v_mavp;

    v_message := 'QUA TANG    : ' || v_tenvp || ' (da tru kho)';

    INSERT INTO lichsu_quatang(loai, makh, rankcu, rankmoi, mavp, tenqua, ghichu)
    VALUES ('Rank up', p_makh, p_rankcu, p_rankmoi, v_mavp, v_tenvp, v_message);

    RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_dat_truoc(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying,
    p_mapr character varying,
    p_sdt character varying,
    p_thoigiandat timestamp without time zone
) RETURNS text
    LANGUAGE plpgsql
AS $$
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    INSERT INTO orders(maorder, makh, madv, maghe, mapr, status, thoigiandat)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dat truoc', p_thoigiandat);

    RETURN 'Dat truoc ' || p_maorder || ' thanh cong luc ' ||
           to_char(p_thoigiandat, 'YYYY-MM-DD HH24:MI') ||
           '. Vui long check-in trong vong 30 phut tu gio hen.';
END;
$$;

COMMIT;


-- ============================================================
-- 03. Chuan hoa thoi han goi DV03
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_phat_thuong_vinh_danh(p_makh character varying, p_hang integer)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_mavp VARCHAR(6);
    v_tenvp VARCHAR(20);
BEGIN
    IF p_hang <= 5 THEN
        RETURN 'Discount 50,000 VND hoa don tiep theo';

    ELSIF p_hang <= 10 THEN
        INSERT INTO goihoatdong(makh, madv, ngaybatdau, ngayketthuc, status)
        SELECT p_makh, 'DV03', CURRENT_DATE, CURRENT_DATE + 1, 'Hoat dong'
        WHERE NOT EXISTS (
            SELECT 1 FROM goihoatdong g
            WHERE g.makh = p_makh
              AND g.status = 'Hoat dong'
        );

        RETURN 'Tang 1 goi 1 ngay (DV03)';

    ELSIF p_hang <= 20 THEN
        SELECT mavp, tenvp INTO v_mavp, v_tenvp FROM fn_tim_qua_tang();

        IF v_mavp IS NOT NULL THEN
            UPDATE vatpham SET soluong = soluong - 1 WHERE mavp = v_mavp;
            RETURN 'Tang 1 ' || v_tenvp;
        ELSE
            RETURN 'Kho da het qua tang';
        END IF;
    END IF;

    RETURN '';
END;
$function$;

UPDATE goihoatdong
SET ngayketthuc = ngaybatdau + 1,
    status = CASE
        WHEN CURRENT_DATE BETWEEN ngaybatdau AND ngaybatdau + 1 THEN 'Hoat dong'
        ELSE 'Khong hoat dong'
    END
WHERE madv = 'DV03'
  AND ngayketthuc = ngaybatdau + 7;

COMMIT;


-- ============================================================
-- 04. Chan tao order bang goi DV03/DV04
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_orders_block_package_service()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_block_package_service ON public.orders;

CREATE TRIGGER trg_orders_block_package_service
BEFORE INSERT OR UPDATE OF madv ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_block_package_service();

-- DV03/DV04 are membership packages, not seat/room usage services.
-- Old demo/test data may contain active package-service orders; cancel them so
-- buying a package never reserves a seat or private room by itself.
UPDATE public.orders
SET status = 'Da huy',
    gioketthuc = COALESCE(gioketthuc, NOW())
WHERE madv IN ('DV03', 'DV04')
  AND status IN ('Dat truoc', 'Dang dung');

CREATE OR REPLACE FUNCTION public.fn_tao_order(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying DEFAULT NULL::character varying,
    p_mapr character varying DEFAULT NULL::character varying,
    p_sdt character varying DEFAULT NULL::character varying
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    INSERT INTO orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, giobatdau)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dang dung', NOW(), NOW());

    PERFORM fn_dat_cho(p_maghe, p_mapr);

    RETURN 'Tao order ' || p_maorder || ' thanh cong cho KH ' || p_makh;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_dat_truoc(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying DEFAULT NULL::character varying,
    p_mapr character varying DEFAULT NULL::character varying,
    p_sdt character varying DEFAULT NULL::character varying
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    INSERT INTO orders(maorder, makh, madv, maghe, mapr, status, thoigiandat)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dat truoc', NOW());

    RETURN 'Dat truoc ' || p_maorder || ' thanh cong. Qua 30 phut khong den se bi huy.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_dat_truoc(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying,
    p_mapr character varying,
    p_sdt character varying,
    p_thoigiandat timestamp without time zone
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    INSERT INTO orders(maorder, makh, madv, maghe, mapr, status, thoigiandat)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dat truoc', p_thoigiandat);

    RETURN 'Dat truoc ' || p_maorder || ' thanh cong luc ' ||
           to_char(p_thoigiandat, 'YYYY-MM-DD HH24:MI') ||
           '. Vui long check-in trong vong 30 phut tu gio hen.';
END;
$function$;


-- ============================================================
-- 05. Vinh danh thang khong thuong trung
-- ============================================================

BEGIN;

ALTER TABLE public.lichsu_quatang
    ADD COLUMN IF NOT EXISTS thang integer,
    ADD COLUMN IF NOT EXISTS nam integer;

ALTER TABLE public.lichsu_quatang
    DROP CONSTRAINT IF EXISTS lichsu_quatang_thang_check,
    DROP CONSTRAINT IF EXISTS lichsu_quatang_nam_check;

ALTER TABLE public.lichsu_quatang
    ADD CONSTRAINT lichsu_quatang_thang_check CHECK (thang IS NULL OR thang BETWEEN 1 AND 12),
    ADD CONSTRAINT lichsu_quatang_nam_check CHECK (nam IS NULL OR nam BETWEEN 2000 AND 2100);

DELETE FROM public.lichsu_quatang keep
USING public.lichsu_quatang dup
WHERE keep.id > dup.id
  AND keep.loai = 'Vinh danh'
  AND dup.loai = 'Vinh danh'
  AND keep.makh = dup.makh
  AND COALESCE(keep.hang, -1) = COALESCE(dup.hang, -1)
  AND COALESCE(keep.tenqua, '') = COALESCE(dup.tenqua, '')
  AND COALESCE(keep.ghichu, '') = COALESCE(dup.ghichu, '');

CREATE UNIQUE INDEX IF NOT EXISTS uidx_lichsu_quatang_vinh_danh_ky_hang
    ON public.lichsu_quatang(thang, nam, hang)
    WHERE loai = 'Vinh danh'
      AND thang IS NOT NULL
      AND nam IS NOT NULL
      AND hang IS NOT NULL;

COMMIT;


-- ============================================================
-- 06. Tao vat pham bat buoc chon kho
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_vatpham_kho_co_dinh ON public.vatpham;
DROP TRIGGER IF EXISTS trg_chan_doi_kho_vatpham ON public.vatpham;
DROP FUNCTION IF EXISTS public.fn_vatpham_kho_co_dinh();
DROP FUNCTION IF EXISTS public.fn_chan_doi_kho_vatpham();
DROP FUNCTION IF EXISTS public.fn_tao_vatpham(character varying, character varying, numeric, integer);

CREATE OR REPLACE FUNCTION public.fn_chan_doi_kho_vatpham()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.makho IS NULL OR trim(NEW.makho) = '' THEN
        RAISE EXCEPTION 'Phai chon kho cho vat pham %.', NEW.mavp;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM kho WHERE makho = NEW.makho) THEN
        RAISE EXCEPTION 'Kho % khong ton tai.', NEW.makho;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.makho IS DISTINCT FROM OLD.makho THEN
        RAISE EXCEPTION 'Vat pham % da thuoc kho % va khong duoc chuyen sang kho %.', OLD.mavp, OLD.makho, NEW.makho;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_chan_doi_kho_vatpham
BEFORE INSERT OR UPDATE OF makho ON public.vatpham
FOR EACH ROW
EXECUTE FUNCTION public.fn_chan_doi_kho_vatpham();

CREATE OR REPLACE FUNCTION public.fn_tao_vatpham(
    p_mavp character varying,
    p_tenvp character varying,
    p_giatien numeric,
    p_soluong integer DEFAULT 0,
    p_makho character varying DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_mavp IS NULL OR trim(p_mavp) = '' THEN
        RAISE EXCEPTION 'Ma vat pham khong duoc de trong.';
    END IF;
    IF p_tenvp IS NULL OR trim(p_tenvp) = '' THEN
        RAISE EXCEPTION 'Ten vat pham khong duoc de trong.';
    END IF;
    IF p_giatien IS NULL OR p_giatien <= 0 THEN
        RAISE EXCEPTION 'Gia tien phai lon hon 0.';
    END IF;
    IF p_soluong IS NULL OR p_soluong < 0 THEN
        RAISE EXCEPTION 'So luong ban dau khong duoc am.';
    END IF;
    IF p_makho IS NULL OR trim(p_makho) = '' THEN
        RAISE EXCEPTION 'Phai chon kho cho vat pham moi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM kho WHERE makho = trim(p_makho)) THEN
        RAISE EXCEPTION 'Kho % khong ton tai.', trim(p_makho);
    END IF;

    INSERT INTO vatpham(mavp, tenvp, giatien, makho, soluong)
    VALUES (trim(p_mavp), trim(p_tenvp), p_giatien::money, trim(p_makho), p_soluong);

    RETURN 'Tao vat pham ' || trim(p_mavp) || ' tai kho ' || trim(p_makho);
END;
$function$;

COMMIT;


-- ============================================================
-- 07. Tai khoan dang nhap
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.taikhoan (
    id bigserial PRIMARY KEY,
    username varchar(40) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(12) NOT NULL CHECK (role IN ('staff', 'customer')),
    makh varchar(6) REFERENCES public.khachhang(makh) ON DELETE CASCADE,
    manv varchar(6) REFERENCES public.nhanvien(manv) ON DELETE SET NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT taikhoan_role_ref_check CHECK (
        (role = 'customer' AND makh IS NOT NULL)
        OR (role = 'staff')
    )
);

CREATE INDEX IF NOT EXISTS idx_taikhoan_makh ON public.taikhoan(makh);
CREATE INDEX IF NOT EXISTS idx_taikhoan_manv ON public.taikhoan(manv);

INSERT INTO public.taikhoan(username, password_hash, role, manv)
SELECT 'admin', 'md5:' || md5('admin123'), 'staff', nv.manv
FROM public.nhanvien nv
ORDER BY nv.manv
LIMIT 1
ON CONFLICT (username) DO NOTHING;

COMMIT;


-- ============================================================
-- 08. Goi y xep ghe nhieu nguoi
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_xep_cho_chung(p_so_nguoi integer)
RETURNS TABLE(loai_cho text, ma character varying, thong_tin text)
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_so_nguoi IS NULL OR p_so_nguoi <= 0 THEN
        RAISE EXCEPTION 'So nguoi phai lon hon 0.';
    END IF;

    RETURN QUERY
    WITH ghe_trong AS (
        SELECT
            g.mapc,
            g.maghe,
            COUNT(*) OVER (PARTITION BY g.mapc) AS so_ghe_trong,
            ROW_NUMBER() OVER (PARTITION BY g.mapc ORDER BY g.maghe) AS rn
        FROM ghe g
        JOIN phongchung pc ON pc.mapc = g.mapc
        WHERE pc.status = 'Chua day'
          AND NOT EXISTS (
              SELECT 1
              FROM orders o
              WHERE o.maghe = g.maghe
                AND o.status IN ('Dat truoc', 'Dang dung')
          )
    ),
    ung_vien AS (
        SELECT *
        FROM ghe_trong
        WHERE so_ghe_trong >= p_so_nguoi
          AND rn <= p_so_nguoi
    )
    SELECT
        'Phong chung'::text AS loai_cho,
        string_agg(u.maghe, ', ' ORDER BY u.maghe)::varchar AS ma,
        ('Phong ' || u.mapc || ' - goi y ' || p_so_nguoi ||
         ' ghe: ' || string_agg(u.maghe, ', ' ORDER BY u.maghe) ||
         ' | con ' || MAX(u.so_ghe_trong) || ' ghe trong')::text AS thong_tin
    FROM ung_vien u
    GROUP BY u.mapc
    ORDER BY MAX(u.so_ghe_trong), u.mapc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_xep_cho(p_so_nguoi integer, p_loai character varying)
RETURNS TABLE(loai_cho text, ma character varying, thong_tin text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_loai text := lower(trim(coalesce(p_loai, 'chung')));
BEGIN
    IF p_so_nguoi IS NULL OR p_so_nguoi <= 0 THEN
        RAISE EXCEPTION 'So nguoi phai lon hon 0.';
    END IF;

    IF v_loai IN ('chung', 'phong chung') THEN
        RETURN QUERY SELECT * FROM fn_xep_cho_chung(p_so_nguoi);
    ELSIF v_loai IN ('rieng', 'phong rieng') THEN
        RETURN QUERY SELECT * FROM fn_xep_cho_rieng(p_so_nguoi);
    ELSIF v_loai IN ('bat ky', 'bat_ky', 'any') THEN
        RETURN QUERY SELECT * FROM fn_xep_cho_chung(p_so_nguoi);
        RETURN QUERY SELECT * FROM fn_xep_cho_rieng(p_so_nguoi);
    ELSE
        RAISE EXCEPTION 'Loai cho % khong hop le. Dung chung, rieng hoac bat ky.', p_loai;
    END IF;
END;
$function$;

COMMIT;


-- ============================================================
-- 09. Tinh thoi gian nghi som
-- ============================================================

BEGIN;

-- thoigiannghisom stores a duration, not a clock time.
-- Some old demo rows used 21:xx for Ca Toi, which made reports count
-- 21+ hours of early leave. Convert those rows back to 1:xx durations.
UPDATE public.calam
SET thoigiannghisom = (thoigiannghisom - INTERVAL '20 hours')::time
WHERE nghisom = true
  AND thoigiannghisom >= TIME '20:00:00';

ALTER TABLE public.calam
  DROP CONSTRAINT IF EXISTS calam_nghisom_duration_reasonable;

ALTER TABLE public.calam
  ADD CONSTRAINT calam_nghisom_duration_reasonable
  CHECK (
    nghisom = false
    OR (
      thoigiannghisom IS NOT NULL
      AND thoigiannghisom > TIME '00:00:00'
      AND thoigiannghisom <= TIME '03:00:00'
    )
  );

COMMIT;


-- ============================================================
-- 10. Ca thieu nguoi trong 1 thang toi
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.v_ca_thieu_nhan_vien;

CREATE VIEW public.v_ca_thieu_nhan_vien AS
WITH lich_thang_toi AS (
  SELECT
    gs.ngay::date AS ngay,
    ca.cathu,
    ca.shift_order
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
SELECT
  l.ngay,
  l.cathu,
  CASE
    WHEN COUNT(d.manv) >= 3 THEN 'Du nguoi'
    WHEN COUNT(d.manv) > 0 THEN 'Thieu nguoi'
    ELSE 'Chua co nguoi'
  END::varchar(20) AS status,
  COUNT(d.manv)::bigint AS so_nv,
  GREATEST(3 - COUNT(d.manv), 0)::bigint AS thieu_nv,
  STRING_AGG(d.manv, ', ' ORDER BY d.manv) AS nhanvien
FROM lich_thang_toi l
LEFT JOIN public.dilam d ON d.ngay = l.ngay AND d.cathu = l.cathu
GROUP BY l.ngay, l.cathu, l.shift_order
HAVING COUNT(d.manv) < 3
ORDER BY l.ngay, l.shift_order;

COMMIT;


-- ============================================================
-- 11. Dong bo trang thai phong ghe
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dong_bo_trang_thai_phong()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.phongchung pc
  SET
    soghetrong = GREATEST(seat_count.total_ghe - seat_count.ghe_ban, 0),
    status = CASE
      WHEN GREATEST(seat_count.total_ghe - seat_count.ghe_ban, 0) = 0 THEN 'Day'
      ELSE 'Chua day'
    END
  FROM (
    SELECT
      g.mapc,
      COUNT(DISTINCT g.maghe)::int AS total_ghe,
      COUNT(DISTINCT o.maorder) FILTER (
        WHERE o.status IN ('Dat truoc', 'Dang dung')
      )::int AS ghe_ban
    FROM public.ghe g
    LEFT JOIN public.orders o ON o.maghe = g.maghe
    GROUP BY g.mapc
  ) AS seat_count
  WHERE pc.mapc = seat_count.mapc;

  UPDATE public.phongrieng pr
  SET status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.mapr = pr.mapr
        AND o.status IN ('Dat truoc', 'Dang dung')
    ) THEN 'Day'
    ELSE 'Chua day'
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cap_nhat_trang_thai_phong()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.fn_dong_bo_trang_thai_phong();
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_cap_nhat_phong ON public.orders;
CREATE TRIGGER trg_cap_nhat_phong
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_cap_nhat_trang_thai_phong();

SELECT public.fn_dong_bo_trang_thai_phong();

COMMIT;


-- ============================================================
-- 12. Bao cao doanh thu theo khoang ngay
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_doanh_thu(date, integer, integer);
DROP FUNCTION IF EXISTS public.fn_doanh_thu(date, integer, integer, date, date);

CREATE OR REPLACE FUNCTION public.fn_doanh_thu(
    p_ngay    date DEFAULT NULL,
    p_thang   integer DEFAULT NULL,
    p_nam     integer DEFAULT NULL,
    p_tungay  date DEFAULT NULL,
    p_denngay date DEFAULT NULL
)
RETURNS TABLE(
    so_order bigint,
    tong_doanh_thu numeric,
    trung_binh_hd numeric,
    tong_tu_dv numeric,
    tong_tu_vp numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_thang IS NOT NULL AND (p_thang < 1 OR p_thang > 12) THEN
        RAISE EXCEPTION 'p_thang (%) phai nam trong khoang 1..12.', p_thang;
    END IF;

    IF p_ngay IS NOT NULL AND (p_tungay IS NOT NULL OR p_denngay IS NOT NULL) THEN
        RAISE EXCEPTION 'Chi chon ngay cu the hoac khoang ngay, khong chon dong thoi.';
    END IF;

    IF p_denngay IS NOT NULL AND p_tungay IS NULL THEN
        RAISE EXCEPTION 'Da nhap p_denngay thi phai nhap p_tungay.';
    END IF;

    IF p_tungay IS NOT NULL THEN
        p_denngay := COALESCE(p_denngay, CURRENT_DATE);

        IF p_tungay > p_denngay THEN
            RAISE EXCEPTION 'p_tungay (%) khong duoc lon hon p_denngay (%).', p_tungay, p_denngay;
        END IF;
    ELSIF p_ngay IS NULL AND p_thang IS NULL AND p_nam IS NULL THEN
        RAISE EXCEPTION 'Phai truyen ngay, thang/nam, nam, hoac khoang ngay.';
    END IF;

    RETURN QUERY
    WITH order_totals AS (
        SELECT
            o.maorder,
            dv.giagoi::numeric AS tien_dv,
            COALESCE(vp_sub.tong_vp, 0)::numeric AS tien_vp
        FROM orders o
        JOIN dichvu dv ON o.madv = dv.madv
        LEFT JOIN (
            SELECT ct.maorder, SUM(vp.giatien::numeric * ct.soluong) AS tong_vp
            FROM chitietorder ct
            JOIN vatpham vp ON ct.mavp = vp.mavp
            GROUP BY ct.maorder
        ) vp_sub ON o.maorder = vp_sub.maorder
        WHERE o.status = 'Hoan thanh'
          AND (
              (
                  p_tungay IS NOT NULL
                  AND DATE(o.thoigiantt) BETWEEN p_tungay AND p_denngay
              )
              OR (
                  p_tungay IS NULL
                  AND (p_ngay  IS NULL OR DATE(o.thoigiantt) = p_ngay)
                  AND (p_thang IS NULL OR EXTRACT(MONTH FROM o.thoigiantt) = p_thang)
                  AND (p_nam   IS NULL OR EXTRACT(YEAR  FROM o.thoigiantt) = p_nam)
              )
          )
    )
    SELECT
        COUNT(*)::bigint,
        COALESCE(SUM(tien_dv + tien_vp), 0),
        COALESCE(AVG(tien_dv + tien_vp), 0),
        COALESCE(SUM(tien_dv), 0),
        COALESCE(SUM(tien_vp), 0)
    FROM order_totals;
END;
$function$;


-- ============================================================
-- 13. Phat qua gio khi thanh toan
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_tinh_phat_qua_gio(
    p_madv varchar,
    p_giobatdau timestamp,
    p_gioketthuc timestamp DEFAULT LOCALTIMESTAMP
)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
    v_gio_goi numeric;
    v_so_gio numeric;
BEGIN
    v_gio_goi := CASE p_madv
        WHEN 'DV01' THEN 3
        WHEN 'DV02' THEN 5
        ELSE NULL
    END;

    IF v_gio_goi IS NULL OR p_giobatdau IS NULL OR p_gioketthuc IS NULL THEN
        RETURN 0;
    END IF;

    v_so_gio := EXTRACT(EPOCH FROM (p_gioketthuc - p_giobatdau)) / 3600.0;

    IF v_so_gio > v_gio_goi + 1 THEN
        RETURN 10000;
    END IF;

    RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_thanh_toan(
    p_maorder varchar,
    p_manv varchar,
    p_hinhthuctt varchar
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_makh varchar(6); v_madv varchar(6); v_status varchar(20);
    v_mapr varchar(6); v_hesogia numeric := 1;
    v_gia_dv numeric; v_tong_vp numeric; v_tong_hd numeric;
    v_discount numeric; v_rank varchar(10);
    v_co_goi boolean; v_thongbao text;
    v_giobatdau timestamp; v_phat_qua_gio numeric;
BEGIN
    SELECT makh, madv, status, giobatdau
    INTO v_makh, v_madv, v_status, v_giobatdau
    FROM orders WHERE maorder = p_maorder;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % khong ton tai.', p_maorder;
    END IF;
    IF v_status != 'Dang dung' THEN
        RAISE EXCEPTION 'Order khong o trang thai Dang dung (hien tai: %).', v_status;
    END IF;

    SELECT giagoi::numeric INTO v_gia_dv FROM dichvu WHERE madv = v_madv;
    SELECT COALESCE(SUM(vp.giatien::numeric * ct.soluong), 0) INTO v_tong_vp
    FROM chitietorder ct JOIN vatpham vp ON ct.mavp = vp.mavp
    WHERE ct.maorder = p_maorder;

    SELECT rank INTO v_rank FROM khachhang WHERE makh = v_makh;
    v_discount := fn_tinh_discount(v_makh);
    v_co_goi   := fn_kiem_tra_goi(v_makh);
    v_phat_qua_gio := fn_tinh_phat_qua_gio(v_madv, v_giobatdau, NOW()::timestamp);

    v_tong_hd := CASE WHEN v_co_goi THEN v_tong_vp ELSE v_gia_dv + v_tong_vp END;
    v_tong_hd := ROUND((v_tong_hd + v_phat_qua_gio) * (1 - v_discount));

    UPDATE orders SET
        status     = 'Hoan thanh',
        gioketthuc = NOW() + INTERVAL '1 second',
        thoigiantt = NOW(),
        hinhthuctt = p_hinhthuctt,
        manv       = p_manv
    WHERE maorder = p_maorder;

    v_thongbao := fn_tichdiem_capnhat_rank(v_makh, v_tong_hd);

    RETURN '===== THANH TOAN =====' || chr(10) ||
        'Order    : ' || p_maorder || chr(10) ||
        'Gia DV   : ' || v_gia_dv ||
            CASE WHEN v_co_goi THEN ' (mien phi)' ELSE '' END || chr(10) ||
        'Tong VP  : ' || v_tong_vp || chr(10) ||
        'Phat gio : ' || v_phat_qua_gio || chr(10) ||
        'Discount : ' || (v_discount*100)::int || '% (rank ' || v_rank || ')' || chr(10) ||
        'Tong HD  : ' || v_tong_hd || chr(10) ||
        v_thongbao;
END;
$function$;


-- ============================================================
-- 14. Thu hoi cho qua gio khi het cho
-- ============================================================

BEGIN;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_phong_xor_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_phong_xor_check
  CHECK (
    num_nonnulls(maghe, mapr) <= 1
    AND (
      status <> 'Dat truoc'
      OR num_nonnulls(maghe, mapr) = 1
    )
  );

CREATE OR REPLACE FUNCTION public.fn_thu_hoi_cho_qua_gio(
    p_maghe varchar,
    p_mapr varchar
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_order record;
    v_message text := '';
BEGIN
    IF p_maghe IS NOT NULL THEN
        SELECT o.maorder, o.madv, o.status, o.giobatdau
        INTO v_order
        FROM public.orders o
        WHERE o.maghe = p_maghe
          AND o.status IN ('Dat truoc', 'Dang dung')
        ORDER BY o.giobatdau NULLS LAST, o.thoigiandat NULLS LAST
        LIMIT 1;

        IF FOUND THEN
            IF EXISTS (
                SELECT 1
                FROM public.ghe g
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.orders o
                    WHERE o.maghe = g.maghe
                      AND o.status IN ('Dat truoc', 'Dang dung')
                )
            ) THEN
                RAISE EXCEPTION 'Van con ghe trong, khong thu hoi ghe % tu order %.', p_maghe, v_order.maorder;
            END IF;

            IF v_order.status <> 'Dang dung'
               OR fn_tinh_phat_qua_gio(v_order.madv, v_order.giobatdau, NOW()::timestamp) <= 0 THEN
                RAISE EXCEPTION 'Ghe % dang bi giu boi order % nhung chua du dieu kien thu hoi.', p_maghe, v_order.maorder;
            END IF;

            UPDATE public.orders
            SET maghe = NULL
            WHERE maorder = v_order.maorder;

            v_message := v_message || 'Thu hoi ghe ' || p_maghe || ' tu order ' || v_order.maorder || '. ';
        END IF;
    END IF;

    IF p_mapr IS NOT NULL THEN
        SELECT o.maorder, o.madv, o.status, o.giobatdau
        INTO v_order
        FROM public.orders o
        WHERE o.mapr = p_mapr
          AND o.status IN ('Dat truoc', 'Dang dung')
        ORDER BY o.giobatdau NULLS LAST, o.thoigiandat NULLS LAST
        LIMIT 1;

        IF FOUND THEN
            IF EXISTS (
                SELECT 1
                FROM public.phongrieng pr
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.orders o
                    WHERE o.mapr = pr.mapr
                      AND o.status IN ('Dat truoc', 'Dang dung')
                )
            ) THEN
                RAISE EXCEPTION 'Van con phong rieng trong, khong thu hoi phong % tu order %.', p_mapr, v_order.maorder;
            END IF;

            IF v_order.status <> 'Dang dung'
               OR fn_tinh_phat_qua_gio(v_order.madv, v_order.giobatdau, NOW()::timestamp) <= 0 THEN
                RAISE EXCEPTION 'Phong % dang bi giu boi order % nhung chua du dieu kien thu hoi.', p_mapr, v_order.maorder;
            END IF;

            UPDATE public.orders
            SET mapr = NULL
            WHERE maorder = v_order.maorder;

            v_message := v_message || 'Thu hoi phong ' || p_mapr || ' tu order ' || v_order.maorder || '. ';
        END IF;
    END IF;

    PERFORM public.fn_dong_bo_trang_thai_phong();
    RETURN trim(v_message);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tao_order(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying DEFAULT NULL::character varying,
    p_mapr character varying DEFAULT NULL::character varying,
    p_sdt character varying DEFAULT NULL::character varying
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_thu_hoi text;
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM fn_upsert_khachhang(p_makh, p_hoten, p_sdt);
    v_thu_hoi := fn_thu_hoi_cho_qua_gio(p_maghe, p_mapr);

    INSERT INTO orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, giobatdau)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dang dung', NOW(), NOW());

    PERFORM public.fn_dong_bo_trang_thai_phong();

    RETURN COALESCE(NULLIF(v_thu_hoi, '') || ' ', '') ||
           'Tao order ' || p_maorder || ' thanh cong cho KH ' || p_makh;
END;
$function$;

COMMIT;


-- ============================================================
-- 15. Order dung goi va chan nhan ca qua khu
-- ============================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sudunggoi boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_order_goi_ket_thuc(p_makh varchar)
RETURNS timestamp
LANGUAGE plpgsql
AS $function$
DECLARE
    v_ketthuc timestamp;
BEGIN
    SELECT (g.ngayketthuc::timestamp + INTERVAL '1 day' - INTERVAL '1 second')
    INTO v_ketthuc
    FROM public.goihoatdong g
    WHERE g.makh = p_makh
      AND g.status = 'Hoat dong'
      AND g.ngayketthuc >= CURRENT_DATE
    ORDER BY g.ngayketthuc DESC, g.id DESC
    LIMIT 1;

    RETURN v_ketthuc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_orders_validate_sudunggoi()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_goi_ket_thuc timestamp;
BEGIN
    IF NEW.mapr IS NOT NULL AND NEW.sudunggoi THEN
        NEW.sudunggoi := false;
        NEW.gioketthuc := NULL;
        RETURN NEW;
    END IF;

    IF NEW.sudunggoi THEN
        v_goi_ket_thuc := public.fn_order_goi_ket_thuc(NEW.makh);
        IF v_goi_ket_thuc IS NULL THEN
            RAISE EXCEPTION 'Khach hang % khong co goi hoat dong de dung cho order %.', NEW.makh, NEW.maorder;
        END IF;

        IF NEW.gioketthuc IS NULL OR NEW.gioketthuc < v_goi_ket_thuc THEN
            NEW.gioketthuc := v_goi_ket_thuc;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_validate_sudunggoi ON public.orders;
CREATE TRIGGER trg_orders_validate_sudunggoi
BEFORE INSERT OR UPDATE OF sudunggoi, makh, gioketthuc, status, mapr
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_validate_sudunggoi();

CREATE OR REPLACE FUNCTION public.fn_order_co_the_thu_hoi(p_maorder varchar)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_order record;
BEGIN
    SELECT maorder, status, madv, giobatdau, gioketthuc, sudunggoi
    INTO v_order
    FROM public.orders
    WHERE maorder = p_maorder;

    IF NOT FOUND OR v_order.status <> 'Dang dung' THEN
        RETURN false;
    END IF;

    IF v_order.sudunggoi THEN
        RETURN v_order.gioketthuc IS NOT NULL
           AND NOW()::timestamp > v_order.gioketthuc;
    END IF;

    RETURN public.fn_tinh_phat_qua_gio(v_order.madv, v_order.giobatdau, NOW()::timestamp) > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_thu_hoi_cho_qua_gio(
    p_maghe varchar,
    p_mapr varchar
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_order record;
    v_message text := '';
BEGIN
    IF p_maghe IS NOT NULL THEN
        SELECT o.maorder, o.status
        INTO v_order
        FROM public.orders o
        WHERE o.maghe = p_maghe
          AND o.status IN ('Dat truoc', 'Dang dung')
        ORDER BY o.giobatdau NULLS LAST, o.thoigiandat NULLS LAST
        LIMIT 1;

        IF FOUND THEN
            IF EXISTS (
                SELECT 1
                FROM public.ghe g
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.orders o
                    WHERE o.maghe = g.maghe
                      AND o.status IN ('Dat truoc', 'Dang dung')
                )
            ) THEN
                RAISE EXCEPTION 'Van con ghe trong, khong thu hoi ghe % tu order %.', p_maghe, v_order.maorder;
            END IF;

            IF NOT public.fn_order_co_the_thu_hoi(v_order.maorder) THEN
                RAISE EXCEPTION 'Ghe % dang bi giu boi order % nhung chua du dieu kien thu hoi.', p_maghe, v_order.maorder;
            END IF;

            UPDATE public.orders
            SET maghe = NULL
            WHERE maorder = v_order.maorder;

            v_message := v_message || 'Thu hoi ghe ' || p_maghe || ' tu order ' || v_order.maorder || '. ';
        END IF;
    END IF;

    IF p_mapr IS NOT NULL THEN
        SELECT o.maorder, o.status
        INTO v_order
        FROM public.orders o
        WHERE o.mapr = p_mapr
          AND o.status IN ('Dat truoc', 'Dang dung')
        ORDER BY o.giobatdau NULLS LAST, o.thoigiandat NULLS LAST
        LIMIT 1;

        IF FOUND THEN
            IF EXISTS (
                SELECT 1
                FROM public.phongrieng pr
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.orders o
                    WHERE o.mapr = pr.mapr
                      AND o.status IN ('Dat truoc', 'Dang dung')
                )
            ) THEN
                RAISE EXCEPTION 'Van con phong rieng trong, khong thu hoi phong % tu order %.', p_mapr, v_order.maorder;
            END IF;

            IF NOT public.fn_order_co_the_thu_hoi(v_order.maorder) THEN
                RAISE EXCEPTION 'Phong % dang bi giu boi order % nhung chua du dieu kien thu hoi.', p_mapr, v_order.maorder;
            END IF;

            UPDATE public.orders
            SET mapr = NULL
            WHERE maorder = v_order.maorder;

            v_message := v_message || 'Thu hoi phong ' || p_mapr || ' tu order ' || v_order.maorder || '. ';
        END IF;
    END IF;

    PERFORM public.fn_dong_bo_trang_thai_phong();
    RETURN trim(v_message);
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_tao_order(varchar, varchar, varchar, varchar, varchar, varchar, varchar);

CREATE OR REPLACE FUNCTION public.fn_tao_order(
    p_maorder varchar,
    p_makh varchar,
    p_hoten varchar,
    p_madv varchar,
    p_maghe varchar DEFAULT NULL,
    p_mapr varchar DEFAULT NULL,
    p_sdt varchar DEFAULT NULL,
    p_sudunggoi boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_thu_hoi text;
    v_goi_ket_thuc timestamp;
    v_sudunggoi boolean;
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM public.fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    v_sudunggoi := COALESCE(p_sudunggoi, false) AND p_mapr IS NULL;

    IF v_sudunggoi THEN
        v_goi_ket_thuc := public.fn_order_goi_ket_thuc(p_makh);
        IF v_goi_ket_thuc IS NULL THEN
            RAISE EXCEPTION 'Khach hang % khong co goi hoat dong de dung cho order %.', p_makh, p_maorder;
        END IF;
    END IF;

    v_thu_hoi := public.fn_thu_hoi_cho_qua_gio(p_maghe, p_mapr);

    INSERT INTO public.orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, giobatdau, gioketthuc, sudunggoi)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dang dung', NOW(), NOW(), v_goi_ket_thuc, v_sudunggoi);

    PERFORM public.fn_dong_bo_trang_thai_phong();

    RETURN COALESCE(NULLIF(v_thu_hoi, '') || ' ', '') ||
           'Tao order ' || p_maorder || ' thanh cong cho KH ' || p_makh ||
           CASE WHEN v_sudunggoi THEN ' (dung goi den ' || to_char(v_goi_ket_thuc, 'YYYY-MM-DD HH24:MI') || ')' ELSE '' END;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_dat_truoc(varchar, varchar, varchar, varchar, varchar, varchar, varchar, timestamp);

CREATE OR REPLACE FUNCTION public.fn_dat_truoc(
    p_maorder varchar,
    p_makh varchar,
    p_hoten varchar,
    p_madv varchar,
    p_maghe varchar,
    p_mapr varchar,
    p_sdt varchar,
    p_thoigiandat timestamp,
    p_sudunggoi boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_goi_ket_thuc timestamp;
    v_sudunggoi boolean;
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM public.fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    v_sudunggoi := COALESCE(p_sudunggoi, false) AND p_mapr IS NULL;

    IF v_sudunggoi THEN
        v_goi_ket_thuc := public.fn_order_goi_ket_thuc(p_makh);
        IF v_goi_ket_thuc IS NULL THEN
            RAISE EXCEPTION 'Khach hang % khong co goi hoat dong de dung cho order %.', p_makh, p_maorder;
        END IF;
    END IF;

    INSERT INTO public.orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, gioketthuc, sudunggoi)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dat truoc', p_thoigiandat, v_goi_ket_thuc, v_sudunggoi);

    RETURN 'Dat truoc ' || p_maorder || ' thanh cong luc ' ||
           to_char(p_thoigiandat, 'YYYY-MM-DD HH24:MI') ||
           CASE WHEN v_sudunggoi THEN '. Order dung goi den ' || to_char(v_goi_ket_thuc, 'YYYY-MM-DD HH24:MI') ELSE '' END ||
           '. Vui long check-in trong vong 30 phut tu gio hen.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_checkin(p_maorder varchar)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status varchar(20);
  v_thoigiandat timestamp;
  v_sudunggoi boolean;
  v_makh varchar(6);
  v_goi_ket_thuc timestamp;
BEGIN
  SELECT status, thoigiandat, sudunggoi, makh
  INTO v_status, v_thoigiandat, v_sudunggoi, v_makh
  FROM public.orders
  WHERE maorder = p_maorder;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % khong ton tai.', p_maorder;
  END IF;

  IF v_status != 'Dat truoc' THEN
    RAISE EXCEPTION 'Order khong phai Dat truoc (hien tai: %).', v_status;
  END IF;

  IF NOW() > v_thoigiandat + INTERVAL '30 minutes' THEN
    UPDATE public.orders SET status = 'Da huy' WHERE maorder = p_maorder;
    RETURN 'Order ' || p_maorder || ' bi huy tu dong (qua 30 phut).';
  END IF;

  IF v_sudunggoi THEN
    v_goi_ket_thuc := public.fn_order_goi_ket_thuc(v_makh);
    IF v_goi_ket_thuc IS NULL THEN
      RAISE EXCEPTION 'Khach hang % khong con goi hoat dong de check-in order %.', v_makh, p_maorder;
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'Dang dung',
      giobatdau = NOW(),
      gioketthuc = CASE WHEN v_sudunggoi THEN v_goi_ket_thuc ELSE gioketthuc END
  WHERE maorder = p_maorder;

  RETURN 'Check-in thanh cong. Bat dau su dung.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_thanh_toan(
    p_maorder varchar,
    p_manv varchar,
    p_hinhthuctt varchar
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_makh varchar(6); v_madv varchar(6); v_status varchar(20);
    v_gia_dv numeric; v_tong_vp numeric; v_tong_hd numeric;
    v_discount numeric; v_rank varchar(10);
    v_sudunggoi boolean; v_thongbao text;
    v_giobatdau timestamp; v_phat_qua_gio numeric;
BEGIN
    SELECT makh, madv, status, giobatdau, sudunggoi, mapr
    INTO v_makh, v_madv, v_status, v_giobatdau, v_sudunggoi, v_mapr
    FROM public.orders WHERE maorder = p_maorder;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % khong ton tai.', p_maorder;
    END IF;
    IF v_status != 'Dang dung' THEN
        RAISE EXCEPTION 'Order khong o trang thai Dang dung (hien tai: %).', v_status;
    END IF;

    SELECT giagoi::numeric INTO v_gia_dv FROM public.dichvu WHERE madv = v_madv;
    SELECT COALESCE(pr.hesogia, 1) INTO v_hesogia
    FROM public.phongrieng pr
    WHERE pr.mapr = v_mapr;
    v_gia_dv := v_gia_dv * COALESCE(v_hesogia, 1);

    SELECT COALESCE(SUM(vp.giatien::numeric * ct.soluong), 0) INTO v_tong_vp
    FROM public.chitietorder ct JOIN public.vatpham vp ON ct.mavp = vp.mavp
    WHERE ct.maorder = p_maorder;

    SELECT rank INTO v_rank FROM public.khachhang WHERE makh = v_makh;
    v_discount := public.fn_tinh_discount(v_makh);
    v_phat_qua_gio := CASE
        WHEN v_sudunggoi THEN 0
        ELSE public.fn_tinh_phat_qua_gio(v_madv, v_giobatdau, NOW()::timestamp)
    END;

    v_tong_hd := CASE WHEN v_sudunggoi THEN v_tong_vp ELSE v_gia_dv + v_tong_vp END;
    v_tong_hd := ROUND((v_tong_hd + v_phat_qua_gio) * (1 - v_discount));

    UPDATE public.orders SET
        status     = 'Hoan thanh',
        gioketthuc = NOW() + INTERVAL '1 second',
        thoigiantt = NOW(),
        hinhthuctt = p_hinhthuctt,
        manv       = p_manv
    WHERE maorder = p_maorder;

    IF v_tong_hd > 0 THEN
        v_thongbao := public.fn_tichdiem_capnhat_rank(v_makh, v_tong_hd);
    ELSE
        v_thongbao := '=============================' || chr(10) ||
            'Khach hang  : ' || v_makh || chr(10) ||
            'Hoa don     : 0 dong' || chr(10) ||
            'Diem cong   : 0 diem' || chr(10) ||
            'Rank        : ' || v_rank || ' (giu nguyen)' || chr(10) ||
            '=====';
    END IF;

    RETURN '===== THANH TOAN =====' || chr(10) ||
        'Order    : ' || p_maorder || chr(10) ||
        'Dung goi : ' || CASE WHEN v_sudunggoi THEN 'Co' ELSE 'Khong' END || chr(10) ||
        'Gia DV   : ' || v_gia_dv ||
            CASE WHEN v_sudunggoi THEN ' (mien phi theo goi)' ELSE '' END || chr(10) ||
        'Tong VP  : ' || v_tong_vp || chr(10) ||
        'Phat gio : ' || v_phat_qua_gio || chr(10) ||
        'Discount : ' || (v_discount*100)::int || '% (rank ' || v_rank || ')' || chr(10) ||
        'Tong HD  : ' || v_tong_hd || chr(10) ||
        v_thongbao;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_check_ca_day()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_so_nv integer;
BEGIN
  IF NEW.ngay < CURRENT_DATE THEN
    RAISE EXCEPTION 'Khong duoc nhan ca trong qua khu: % %.', NEW.cathu, NEW.ngay;
  END IF;

  SELECT COUNT(*) INTO v_so_nv
  FROM public.dilam
  WHERE ngay = NEW.ngay AND cathu = NEW.cathu;

  IF v_so_nv >= 3 THEN
    RAISE EXCEPTION 'Ca % ngay % da du 3 nhan vien.', NEW.cathu, NEW.ngay;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
