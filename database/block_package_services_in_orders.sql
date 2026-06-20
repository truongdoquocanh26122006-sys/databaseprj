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
