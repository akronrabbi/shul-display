-- Named layouts and automatic save history for the shul display.
-- Editors (verified allowlist) can read and write. The public and anonymous
-- roles have no access. The television keeps reading public.boards id 'main'.

CREATE TABLE IF NOT EXISTS public.layouts (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  config jsonb NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS public.board_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  saved_by text
);

CREATE OR REPLACE FUNCTION private.layouts_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'This layout is locked' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := private.editor_email();
  IF TG_OP = 'UPDATE' AND OLD.locked AND COALESCE(NEW.locked, true) THEN
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.config IS DISTINCT FROM OLD.config THEN
      RAISE EXCEPTION 'This layout is locked' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS layouts_guard ON public.layouts;
CREATE TRIGGER layouts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.layouts
  FOR EACH ROW EXECUTE FUNCTION private.layouts_guard();

CREATE OR REPLACE FUNCTION private.history_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.saved_at := now();
  NEW.saved_by := private.editor_email();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.history_prune() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM public.board_history
  WHERE id IN (
    SELECT id FROM public.board_history
    ORDER BY saved_at DESC, id DESC
    OFFSET 30
  );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS history_stamp ON public.board_history;
CREATE TRIGGER history_stamp BEFORE INSERT ON public.board_history
  FOR EACH ROW EXECUTE FUNCTION private.history_stamp();

DROP TRIGGER IF EXISTS history_prune ON public.board_history;
CREATE TRIGGER history_prune AFTER INSERT ON public.board_history
  FOR EACH ROW EXECUTE FUNCTION private.history_prune();

ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.layouts FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON public.board_history FROM PUBLIC, anonymous, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.layouts TO authenticated;
GRANT SELECT, INSERT ON public.board_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.board_history_id_seq TO authenticated;

DROP POLICY IF EXISTS layouts_editor_read ON public.layouts;
CREATE POLICY layouts_editor_read ON public.layouts
  FOR SELECT TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL);

DROP POLICY IF EXISTS layouts_editor_write ON public.layouts;
CREATE POLICY layouts_editor_write ON public.layouts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.editor_email()) IS NOT NULL);

DROP POLICY IF EXISTS layouts_editor_update ON public.layouts;
CREATE POLICY layouts_editor_update ON public.layouts
  FOR UPDATE TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL)
  WITH CHECK ((SELECT private.editor_email()) IS NOT NULL);

DROP POLICY IF EXISTS layouts_editor_delete ON public.layouts;
CREATE POLICY layouts_editor_delete ON public.layouts
  FOR DELETE TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL);

DROP POLICY IF EXISTS history_editor_read ON public.board_history;
CREATE POLICY history_editor_read ON public.board_history
  FOR SELECT TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL);

DROP POLICY IF EXISTS history_editor_insert ON public.board_history;
CREATE POLICY history_editor_insert ON public.board_history
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.editor_email()) IS NOT NULL);
