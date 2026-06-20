CREATE OR REPLACE FUNCTION public.fn_huy_dat_truoc_qua_han()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cancelled integer;
BEGIN
  UPDATE orders
  SET status = 'Da huy'
  WHERE status = 'Dat truoc'
    AND now() > thoigiandat + interval '30 minutes';

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;

ALTER FUNCTION public.fn_huy_dat_truoc_qua_han() OWNER TO postgres;
