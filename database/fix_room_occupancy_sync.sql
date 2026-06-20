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
