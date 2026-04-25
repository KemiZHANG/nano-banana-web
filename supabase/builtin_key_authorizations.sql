-- Built-in Gemini API authorization list.
-- Run this once in Supabase SQL Editor before using /admin/authorized-emails.

CREATE TABLE IF NOT EXISTS public.builtin_key_authorizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  active      BOOLEAN NOT NULL DEFAULT true,
  note        TEXT,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT builtin_key_authorizations_email_lower
    CHECK (email = lower(trim(email)))
);

ALTER TABLE public.builtin_key_authorizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_set_updated_at_builtin_key_authorizations
ON public.builtin_key_authorizations;
CREATE TRIGGER trg_set_updated_at_builtin_key_authorizations
  BEFORE UPDATE ON public.builtin_key_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_builtin_key_authorizations_email
ON public.builtin_key_authorizations(email);

CREATE INDEX IF NOT EXISTS idx_builtin_key_authorizations_active
ON public.builtin_key_authorizations(active);

INSERT INTO public.builtin_key_authorizations (email, active, note)
VALUES
  ('links358p@gmail.com', true, 'Initial admin'),
  ('irenephang220@gmail.com', true, 'Boss')
ON CONFLICT (email) DO UPDATE
SET active = true,
    revoked_at = NULL,
    note = EXCLUDED.note;
