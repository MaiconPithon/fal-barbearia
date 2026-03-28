
CREATE TABLE public.schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date date NOT NULL,
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '21:00',
  break_start time,
  break_end time,
  is_blocked boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (override_date)
);

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schedule overrides"
  ON public.schedule_overrides FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage schedule overrides"
  ON public.schedule_overrides FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
