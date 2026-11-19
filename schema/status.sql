-- "Last seen" for each television. Run this once in the Neon SQL editor.
-- A television (anonymous role) can only call tv_ping, which records its own
-- id and a few harmless details. Only signed-in editors can read the table.

CREATE TABLE IF NOT EXISTS public.tv_status (
  tv_id text PRIMARY KEY CHECK (char_length(tv_id) BETWEEN 1 AND 40),
  last_seen timestamptz NOT NULL DEFAULT now(),
  info jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION public.tv_ping(p_tv text, p_info jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean jsonb;
BEGIN
  IF p_tv IS NULL OR char_length(p_tv) NOT BETWEEN 1 AND 40 OR p_tv !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Bad television id' USING ERRCODE = '22023';
  END IF;
  -- Keep only small, known fields, so the table cannot be used to store anything else.
  clean := jsonb_build_object(
    'screen', left(COALESCE(p_info->>'screen', ''), 60),
    'width', left(COALESCE(p_info->>'width', ''), 8),
    'height', left(COALESCE(p_info->>'height', ''), 8),
    'source', left(COALESCE(p_info->>'source', ''), 20),
    'started', left(COALESCE(p_info->>'started', ''), 40)
  );
  INSERT INTO public.tv_status (tv_id, last_seen, info)
  VALUES (p_tv, now(), clean)
  ON CONFLICT (tv_id) DO UPDATE SET last_seen = now(), info = EXCLUDED.info;
  -- Never keep more than 50 televisions.
  DELETE FROM public.tv_status WHERE tv_id IN (
    SELECT tv_id FROM public.tv_status ORDER BY last_seen DESC OFFSET 50
  );
END $$;

ALTER TABLE public.tv_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_status FROM PUBLIC, anonymous, authenticated;
GRANT SELECT ON public.tv_status TO authenticated;

DROP POLICY IF EXISTS tv_status_editor_read ON public.tv_status;
CREATE POLICY tv_status_editor_read ON public.tv_status
  FOR SELECT TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL);

REVOKE ALL ON FUNCTION public.tv_ping(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_ping(text, jsonb) TO anonymous, authenticated;
