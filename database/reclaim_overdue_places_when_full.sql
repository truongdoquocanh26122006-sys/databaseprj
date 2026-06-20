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
