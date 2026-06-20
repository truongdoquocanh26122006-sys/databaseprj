BEGIN;

CREATE TABLE IF NOT EXISTS public.taikhoan (
    id bigserial PRIMARY KEY,
    username varchar(40) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(12) NOT NULL CHECK (role IN ('staff', 'customer')),
    makh varchar(6) REFERENCES public.khachhang(makh) ON DELETE CASCADE,
    manv varchar(6) REFERENCES public.nhanvien(manv) ON DELETE SET NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT taikhoan_role_ref_check CHECK (
        (role = 'customer' AND makh IS NOT NULL)
        OR (role = 'staff')
    )
);

CREATE INDEX IF NOT EXISTS idx_taikhoan_makh ON public.taikhoan(makh);
CREATE INDEX IF NOT EXISTS idx_taikhoan_manv ON public.taikhoan(manv);

INSERT INTO public.taikhoan(username, password_hash, role, manv)
SELECT 'admin', 'md5:' || md5('admin123'), 'staff', nv.manv
FROM public.nhanvien nv
ORDER BY nv.manv
LIMIT 1
ON CONFLICT (username) DO NOTHING;

COMMIT;
