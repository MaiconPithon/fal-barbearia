ALTER TABLE public.avaliacoes ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- Update RLS: allow super_admin to update (hide) reviews
CREATE POLICY "Super admins can update avaliacoes"
ON public.avaliacoes
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to delete reviews
CREATE POLICY "Super admins can delete avaliacoes"
ON public.avaliacoes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));