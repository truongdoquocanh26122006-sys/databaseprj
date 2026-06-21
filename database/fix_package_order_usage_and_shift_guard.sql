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
BEFORE INSERT OR UPDATE OF sudunggoi, makh, gioketthuc, status
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
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM public.fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    IF p_sudunggoi THEN
        v_goi_ket_thuc := public.fn_order_goi_ket_thuc(p_makh);
        IF v_goi_ket_thuc IS NULL THEN
            RAISE EXCEPTION 'Khach hang % khong co goi hoat dong de dung cho order %.', p_makh, p_maorder;
        END IF;
    END IF;

    v_thu_hoi := public.fn_thu_hoi_cho_qua_gio(p_maghe, p_mapr);

    INSERT INTO public.orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, giobatdau, gioketthuc, sudunggoi)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dang dung', NOW(), NOW(), v_goi_ket_thuc, p_sudunggoi);

    PERFORM public.fn_dong_bo_trang_thai_phong();

    RETURN COALESCE(NULLIF(v_thu_hoi, '') || ' ', '') ||
           'Tao order ' || p_maorder || ' thanh cong cho KH ' || p_makh ||
           CASE WHEN p_sudunggoi THEN ' (dung goi den ' || to_char(v_goi_ket_thuc, 'YYYY-MM-DD HH24:MI') || ')' ELSE '' END;
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
BEGIN
    IF p_madv IN ('DV03', 'DV04') THEN
        RAISE EXCEPTION 'DV03/DV04 la goi hoat dong. Hay dang ky hoac gia han trong tab Goi, khong tao trong Orders.';
    END IF;

    PERFORM public.fn_upsert_khachhang(p_makh, p_hoten, p_sdt);

    IF p_sudunggoi THEN
        v_goi_ket_thuc := public.fn_order_goi_ket_thuc(p_makh);
        IF v_goi_ket_thuc IS NULL THEN
            RAISE EXCEPTION 'Khach hang % khong co goi hoat dong de dung cho order %.', p_makh, p_maorder;
        END IF;
    END IF;

    INSERT INTO public.orders(maorder, makh, madv, maghe, mapr, status, thoigiandat, gioketthuc, sudunggoi)
    VALUES (p_maorder, p_makh, p_madv, p_maghe, p_mapr, 'Dat truoc', p_thoigiandat, v_goi_ket_thuc, p_sudunggoi);

    RETURN 'Dat truoc ' || p_maorder || ' thanh cong luc ' ||
           to_char(p_thoigiandat, 'YYYY-MM-DD HH24:MI') ||
           CASE WHEN p_sudunggoi THEN '. Order dung goi den ' || to_char(v_goi_ket_thuc, 'YYYY-MM-DD HH24:MI') ELSE '' END ||
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
    SELECT makh, madv, status, giobatdau, sudunggoi
    INTO v_makh, v_madv, v_status, v_giobatdau, v_sudunggoi
    FROM public.orders WHERE maorder = p_maorder;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % khong ton tai.', p_maorder;
    END IF;
    IF v_status != 'Dang dung' THEN
        RAISE EXCEPTION 'Order khong o trang thai Dang dung (hien tai: %).', v_status;
    END IF;

    SELECT giagoi::numeric INTO v_gia_dv FROM public.dichvu WHERE madv = v_madv;
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
