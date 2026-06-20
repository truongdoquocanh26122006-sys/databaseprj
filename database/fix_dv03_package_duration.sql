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
