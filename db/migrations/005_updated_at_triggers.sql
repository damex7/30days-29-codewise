-- 005: keep updated_at honest.
-- A trigger sets it on every UPDATE, so no query can forget to, and the
-- value always comes from the database clock rather than an app server's.

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER runs_set_updated_at     BEFORE UPDATE ON runs     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER snippets_set_updated_at BEFORE UPDATE ON snippets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER feedback_set_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();
