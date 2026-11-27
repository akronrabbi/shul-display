-- How a screen knows whether to look soon, without downloading the layout.
--
-- The Data API can keep a stale schema cache after a new table is created, so
-- the screens read a tiny row in the table they already use: public.boards id
-- 'watch'. Anyone can read it. Only an editor can change it. A trigger keeps
-- board_updated_at equal to the real board, and ignores any other fields.
-- public.board_watch is the same information, kept for a direct SQL check.

CREATE TABLE IF NOT EXISTS public.board_watch (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  editing_at timestamptz,
  refresh_at timestamptz
);

INSERT INTO public.board_watch (id, updated_at)
SELECT id, updated_at FROM public.boards WHERE id = 'main'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.watch_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  board_at timestamptz;
BEGIN
  IF NEW.id IS DISTINCT FROM 'watch' THEN
    RETURN NEW;
  END IF;
  SELECT updated_at INTO board_at FROM public.boards WHERE id = 'main';
  NEW.config := jsonb_build_object(
    'editing_at', COALESCE(NEW.config->>'editing_at', CASE WHEN TG_OP = 'UPDATE' THEN OLD.config->>'editing_at' END),
    'refresh_at', COALESCE(NEW.config->>'refresh_at', CASE WHEN TG_OP = 'UPDATE' THEN OLD.config->>'refresh_at' END),
    'board_updated_at', board_at
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS watch_guard ON public.boards;
CREATE TRIGGER watch_guard
  BEFORE INSERT OR UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION private.watch_guard();

CREATE OR REPLACE FUNCTION private.sync_board_watch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id <> 'main' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.board_watch (id, updated_at)
  VALUES ('main', NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;
  INSERT INTO public.boards (id, config)
  VALUES ('watch', jsonb_build_object('board_updated_at', NEW.updated_at))
  ON CONFLICT (id) DO UPDATE SET config = jsonb_build_object(
    'editing_at', boards.config->>'editing_at',
    'refresh_at', boards.config->>'refresh_at',
    'board_updated_at', NEW.updated_at
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_board_watch ON public.boards;
CREATE TRIGGER sync_board_watch
  AFTER INSERT OR UPDATE ON public.boards
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
