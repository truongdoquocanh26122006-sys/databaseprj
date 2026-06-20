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
