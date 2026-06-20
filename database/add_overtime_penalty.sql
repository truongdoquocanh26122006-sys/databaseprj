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
