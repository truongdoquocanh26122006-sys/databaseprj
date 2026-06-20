BEGIN;

-- thoigiannghisom stores a duration, not a clock time.
-- Some old demo rows used 21:xx for Ca Toi, which made reports count
-- 21+ hours of early leave. Convert those rows back to 1:xx durations.
UPDATE public.calam
SET thoigiannghisom = (thoigiannghisom - INTERVAL '20 hours')::time
WHERE nghisom = true
  AND thoigiannghisom >= TIME '20:00:00';

ALTER TABLE public.calam
  DROP CONSTRAINT IF EXISTS calam_nghisom_duration_reasonable;

ALTER TABLE public.calam
  ADD CONSTRAINT calam_nghisom_duration_reasonable
  CHECK (
    nghisom = false
    OR (
      thoigiannghisom IS NOT NULL
      AND thoigiannghisom > TIME '00:00:00'
      AND thoigiannghisom <= TIME '03:00:00'
    )
  );

COMMIT;
