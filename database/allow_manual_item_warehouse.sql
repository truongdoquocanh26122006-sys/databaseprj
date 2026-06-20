BEGIN;

DROP TRIGGER IF EXISTS trg_vatpham_kho_co_dinh ON public.vatpham;
DROP TRIGGER IF EXISTS trg_chan_doi_kho_vatpham ON public.vatpham;
DROP FUNCTION IF EXISTS public.fn_vatpham_kho_co_dinh();
DROP FUNCTION IF EXISTS public.fn_chan_doi_kho_vatpham();
DROP FUNCTION IF EXISTS public.fn_tao_vatpham(character varying, character varying, numeric, integer);

CREATE OR REPLACE FUNCTION public.fn_chan_doi_kho_vatpham()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.makho IS NULL OR trim(NEW.makho) = '' THEN
        RAISE EXCEPTION 'Phai chon kho cho vat pham %.', NEW.mavp;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM kho WHERE makho = NEW.makho) THEN
        RAISE EXCEPTION 'Kho % khong ton tai.', NEW.makho;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.makho IS DISTINCT FROM OLD.makho THEN
        RAISE EXCEPTION 'Vat pham % da thuoc kho % va khong duoc chuyen sang kho %.', OLD.mavp, OLD.makho, NEW.makho;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_chan_doi_kho_vatpham
BEFORE INSERT OR UPDATE OF makho ON public.vatpham
FOR EACH ROW
EXECUTE FUNCTION public.fn_chan_doi_kho_vatpham();

CREATE OR REPLACE FUNCTION public.fn_tao_vatpham(
    p_mavp character varying,
    p_tenvp character varying,
    p_giatien numeric,
    p_soluong integer DEFAULT 0,
    p_makho character varying DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_mavp IS NULL OR trim(p_mavp) = '' THEN
        RAISE EXCEPTION 'Ma vat pham khong duoc de trong.';
    END IF;
    IF p_tenvp IS NULL OR trim(p_tenvp) = '' THEN
        RAISE EXCEPTION 'Ten vat pham khong duoc de trong.';
    END IF;
    IF p_giatien IS NULL OR p_giatien <= 0 THEN
        RAISE EXCEPTION 'Gia tien phai lon hon 0.';
    END IF;
    IF p_soluong IS NULL OR p_soluong < 0 THEN
        RAISE EXCEPTION 'So luong ban dau khong duoc am.';
    END IF;
    IF p_makho IS NULL OR trim(p_makho) = '' THEN
        RAISE EXCEPTION 'Phai chon kho cho vat pham moi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM kho WHERE makho = trim(p_makho)) THEN
        RAISE EXCEPTION 'Kho % khong ton tai.', trim(p_makho);
    END IF;

    INSERT INTO vatpham(mavp, tenvp, giatien, makho, soluong)
    VALUES (trim(p_mavp), trim(p_tenvp), p_giatien::money, trim(p_makho), p_soluong);

    RETURN 'Tao vat pham ' || trim(p_mavp) || ' tai kho ' || trim(p_makho);
END;
$function$;

COMMIT;
