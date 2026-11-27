-- Tiny row the screens poll instead of the whole board.
-- Anyone can read it. Only an allowlisted editor can move editing_at or refresh_at.
-- updated_at is copied from public.boards id 'main' by a trigger, so a save still wakes the screens.

CREATE TABLE IF NOT EXISTS public.board_watch (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  editing_at timestamptz,
  refresh_at timestamptz
);

INSERT INTO public.board_watch (id, updated_at)
SELECT id, updated_at FROM public.boards WHERE id = 'main'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.sync_board_watch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id <> 'main' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.board_watch (id, updated_at)
  VALUES ('main', NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_board_watch ON public.boards;
CREATE TRIGGER sync_board_watch
  AFTER INSERT OR UPDATE OF updated_at ON public.boards
  FOR EACH ROW EXECUTE FUNCTION private.sync_board_watch();

ALTER TABLE public.board_watch ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.board_watch FROM PUBLIC, anonymous, authenticated;
GRANT SELECT ON public.board_watch TO anonymous, authenticated;
GRANT UPDATE ON public.board_watch TO authenticated;

DROP POLICY IF EXISTS board_watch_read ON public.board_watch;
CREATE POLICY board_watch_read ON public.board_watch
  FOR SELECT TO anonymous, authenticated
  USING (true);

DROP POLICY IF EXISTS board_watch_editor_update ON public.board_watch;
CREATE POLICY board_watch_editor_update ON public.board_watch
  FOR UPDATE TO authenticated
  USING ((SELECT private.editor_email()) IS NOT NULL)
  WITH CHECK ((SELECT private.editor_email()) IS NOT NULL);
