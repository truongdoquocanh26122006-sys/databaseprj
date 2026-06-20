BEGIN;

CREATE TABLE IF NOT EXISTS public.lichsu_quatang (
    id BIGSERIAL PRIMARY KEY,
    loai VARCHAR(20) NOT NULL,
    makh VARCHAR(6) NOT NULL REFERENCES public.khachhang(makh) ON DELETE CASCADE,
    rankcu VARCHAR(10),
    rankmoi VARCHAR(10),
    mavp VARCHAR(6) REFERENCES public.vatpham(mavp) ON DELETE SET NULL,
    tenqua TEXT NOT NULL,
    hang INTEGER,
    ghichu TEXT,
    thoigiantang TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT lichsu_quatang_loai_check CHECK (loai IN ('Rank up', 'Vinh danh'))
);

CREATE INDEX IF NOT EXISTS idx_lichsu_quatang_makh
    ON public.lichsu_quatang(makh);

CREATE INDEX IF NOT EXISTS idx_lichsu_quatang_thoigian
    ON public.lichsu_quatang(thoigiantang DESC);

CREATE OR REPLACE FUNCTION public.fn_tang_qua_rankup(
    p_makh character varying,
    p_rankcu character varying,
    p_rankmoi character varying
) RETURNS text
    LANGUAGE plpgsql
AS $$
DECLARE
    v_mavp VARCHAR(6);
    v_tenvp VARCHAR(20);
    v_message TEXT;
BEGIN
    IF p_rankmoi = p_rankcu THEN
        RETURN '';
    END IF;

    SELECT mavp, tenvp INTO v_mavp, v_tenvp
    FROM fn_tim_qua_tang();

    IF v_mavp IS NULL THEN
        v_message := 'Kho da het qua tang';
        INSERT INTO lichsu_quatang(loai, makh, rankcu, rankmoi, tenqua, ghichu)
        VALUES ('Rank up', p_makh, p_rankcu, p_rankmoi, v_message, v_message);
        RETURN v_message;
    END IF;

    UPDATE vatpham
    SET soluong = soluong - 1
    WHERE mavp = v_mavp;

    v_message := 'QUA TANG    : ' || v_tenvp || ' (da tru kho)';

    INSERT INTO lichsu_quatang(loai, makh, rankcu, rankmoi, mavp, tenqua, ghichu)
    VALUES ('Rank up', p_makh, p_rankcu, p_rankmoi, v_mavp, v_tenvp, v_message);

    RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_dat_truoc(
    p_maorder character varying,
    p_makh character varying,
    p_hoten character varying,
    p_madv character varying,
    p_maghe character varying,
    p_mapr character varying,
    p_sdt character varying,
    p_thoigiandat timestamp without time zone
) RETURNS text
    LANGUAGE plpgsql
AS $$
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
$$;

COMMIT;
