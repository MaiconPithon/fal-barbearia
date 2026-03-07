CREATE OR REPLACE FUNCTION public.cancel_appointment_by_phone(_appointment_id uuid, _phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_suffix text;
BEGIN
  v_phone_suffix := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 8);

  IF length(v_phone_suffix) < 8 THEN
    RETURN false;
  END IF;

  UPDATE public.appointments
  SET status = 'cancelado',
      updated_at = now()
  WHERE id = _appointment_id
    AND status IN ('pendente', 'confirmado')
    AND right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 8) = v_phone_suffix;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_appointment_by_phone(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_phone(uuid, text) TO anon, authenticated;