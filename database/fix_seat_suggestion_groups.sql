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
