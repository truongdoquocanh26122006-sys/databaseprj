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
