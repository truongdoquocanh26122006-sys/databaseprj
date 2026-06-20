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
