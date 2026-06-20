BEGIN;

-- Remove the accidental test item.
DELETE FROM chitietorder WHERE mavp = 'dddd';
DELETE FROM vatpham WHERE mavp = 'dddd';

-- Keep the smallest code for each product name and map duplicate codes to it.
CREATE TEMP TABLE tmp_vatpham_map ON COMMIT DROP AS
SELECT
    mavp AS old_mavp,
    first_value(mavp) OVER (
        PARTITION BY lower(trim(tenvp))
        ORDER BY mavp
    ) AS canonical_mavp
FROM vatpham;

CREATE TEMP TABLE tmp_vatpham_totals ON COMMIT DROP AS
SELECT m.canonical_mavp, SUM(v.soluong)::integer AS total_soluong
FROM vatpham v
JOIN tmp_vatpham_map m ON m.old_mavp = v.mavp
GROUP BY m.canonical_mavp;

-- Historical completed orders must be remapped without the normal edit guard.
ALTER TABLE chitietorder DISABLE TRIGGER trg_check_chitietorder;

INSERT INTO chitietorder(maorder, mavp, soluong)
SELECT c.maorder, m.canonical_mavp, SUM(c.soluong)::integer
FROM chitietorder c
JOIN tmp_vatpham_map m ON m.old_mavp = c.mavp
WHERE m.old_mavp <> m.canonical_mavp
GROUP BY c.maorder, m.canonical_mavp
ON CONFLICT (maorder, mavp) DO UPDATE
SET soluong = chitietorder.soluong + EXCLUDED.soluong;

DELETE FROM chitietorder c
USING tmp_vatpham_map m
WHERE c.mavp = m.old_mavp
  AND m.old_mavp <> m.canonical_mavp;

ALTER TABLE chitietorder ENABLE TRIGGER trg_check_chitietorder;

DELETE FROM vatpham v
USING tmp_vatpham_map m
WHERE v.mavp = m.old_mavp
  AND m.old_mavp <> m.canonical_mavp;

UPDATE vatpham v
SET soluong = t.total_soluong
FROM tmp_vatpham_totals t
WHERE v.mavp = t.canonical_mavp;

-- Distribute product types evenly across warehouses. With 20 current types,
-- each of the four warehouses receives exactly five fixed product types.
WITH ranked AS (
    SELECT
        mavp,
        row_number() OVER (ORDER BY lower(trim(tenvp)), mavp) AS rn
    FROM vatpham
)
UPDATE vatpham v
SET makho = 'K' || lpad((((r.rn - 1) % 4) + 1)::text, 2, '0')
FROM ranked r
WHERE v.mavp = r.mavp;

-- Keep one low-stock item in each warehouse for warning/integrity tests.
WITH first_item_per_warehouse AS (
    SELECT mavp, makho, row_number() OVER (PARTITION BY makho ORDER BY mavp) AS rn
    FROM vatpham
)
UPDATE vatpham v
SET soluong = CASE v.makho
    WHEN 'K01' THEN 35
    WHEN 'K02' THEN 7
    WHEN 'K03' THEN 0
    WHEN 'K04' THEN 18
    ELSE v.soluong
END
FROM first_item_per_warehouse f
WHERE v.mavp = f.mavp
  AND f.rn = 1;

ALTER TABLE vatpham ALTER COLUMN makho SET NOT NULL;

ALTER TABLE vatpham
ADD CONSTRAINT vatpham_tenvp_key UNIQUE (tenvp);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vatpham_tenvp_normalized
ON vatpham (lower(trim(tenvp)));

CREATE OR REPLACE FUNCTION fn_vatpham_kho_co_dinh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_makho varchar(6);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.makho IS NOT NULL THEN
            RAISE EXCEPTION
                'Khong duoc tu chon kho cho vat pham moi %. Hay de database tu phan bo.',
                NEW.mavp;
        END IF;

        SELECT k.makho
        INTO v_makho
        FROM kho k
        LEFT JOIN vatpham v ON v.makho = k.makho
        GROUP BY k.makho
        ORDER BY COUNT(v.mavp), k.makho
        LIMIT 1;

        IF v_makho IS NULL THEN
            RAISE EXCEPTION 'Khong co kho de gan cho vat pham moi.';
        END IF;

        NEW.makho := v_makho;
    ELSIF NEW.makho IS DISTINCT FROM OLD.makho THEN
        RAISE EXCEPTION
            'Vat pham % da thuoc kho % va khong duoc chuyen sang kho %.',
            OLD.mavp, OLD.makho, NEW.makho;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vatpham_kho_co_dinh ON vatpham;
CREATE TRIGGER trg_vatpham_kho_co_dinh
BEFORE INSERT OR UPDATE OF makho ON vatpham
FOR EACH ROW
EXECUTE FUNCTION fn_vatpham_kho_co_dinh();

CREATE OR REPLACE FUNCTION fn_nhap_hang(
    p_makho varchar,
    p_mavp varchar,
    p_tenvp varchar,
    p_giatien numeric,
    p_soluong integer
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_makho varchar(6);
    v_tenvp varchar(20);
BEGIN
    IF p_soluong IS NULL OR p_soluong <= 0 THEN
        RAISE EXCEPTION 'So luong nhap phai lon hon 0.';
    END IF;

    SELECT makho, tenvp
    INTO v_makho, v_tenvp
    FROM vatpham
    WHERE mavp = p_mavp
    FOR UPDATE;

    IF FOUND THEN
        IF p_makho IS NOT NULL AND p_makho <> v_makho THEN
            RAISE EXCEPTION
                'Vat pham % thuoc kho %, khong the nhap vao kho %.',
                p_mavp, v_makho, p_makho;
        END IF;

        UPDATE vatpham
        SET soluong = soluong + p_soluong
        WHERE mavp = p_mavp;

        RETURN 'Nhap ' || p_soluong || ' x ' || v_tenvp || ' vao kho ' || v_makho;
    END IF;

    IF p_tenvp IS NULL OR trim(p_tenvp) = '' OR p_giatien IS NULL THEN
        RAISE EXCEPTION 'Vat pham moi can co ten va gia tien.';
    END IF;

    INSERT INTO vatpham(mavp, tenvp, giatien, makho, soluong)
    VALUES (p_mavp, trim(p_tenvp), p_giatien::money, NULL, p_soluong)
    RETURNING makho INTO v_makho;

    RETURN 'Tao ' || trim(p_tenvp) || ' va nhap ' || p_soluong || ' vao kho ' || v_makho;
END;
$$;

CREATE OR REPLACE FUNCTION fn_nhap_hang(
    p_mavp varchar,
    p_soluong integer
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_makho varchar(6);
    v_tenvp varchar(20);
BEGIN
    IF p_soluong IS NULL OR p_soluong <= 0 THEN
        RAISE EXCEPTION 'So luong nhap phai lon hon 0.';
    END IF;

    UPDATE vatpham
    SET soluong = soluong + p_soluong
    WHERE mavp = p_mavp
    RETURNING makho, tenvp INTO v_makho, v_tenvp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vat pham % khong ton tai. Hay tao vat pham truoc.', p_mavp;
    END IF;

    RETURN 'Nhap ' || p_soluong || ' x ' || v_tenvp || ' vao kho ' || v_makho;
END;
$$;

CREATE OR REPLACE FUNCTION fn_tao_vatpham(
    p_mavp varchar,
    p_tenvp varchar,
    p_giatien numeric,
    p_soluong integer DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_makho varchar(6);
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

    INSERT INTO vatpham(mavp, tenvp, giatien, makho, soluong)
    VALUES (trim(p_mavp), trim(p_tenvp), p_giatien::money, NULL, p_soluong)
    RETURNING makho INTO v_makho;

    RETURN 'Tao vat pham ' || trim(p_mavp) || ' tai kho ' || v_makho;
END;
$$;

COMMIT;
