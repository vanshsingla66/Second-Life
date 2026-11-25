"""Check the database connection and (for Postgres) that Row Level Security is on.

    .venv/bin/python -m app.check_db
"""
import sys

from sqlalchemy import text
from sqlalchemy.engine import make_url

from .db import engine, init_db, is_postgres


def main() -> int:
    url = make_url(str(engine.url))
    print(f"Backend: {url.get_backend_name()}  host: {url.host or '(local file)'}  database: {url.database}")
    try:
        with engine.connect() as conn:
            if is_postgres():
                print("Server:", conn.execute(text("select version()")).scalar())
            else:
                print("SQLite version:", conn.execute(text("select sqlite_version()")).scalar())
    except Exception as e:  # show the reason without printing the connection string (it contains the password)
        print(f"FAILED to connect: {type(e).__name__}: {str(e).splitlines()[0]}")
        print("Check DATABASE_URL in backend/.env (password URL-encoded? using the pooler host?).")
        return 1

    init_db()
    print("Tables created or already present.")
    if is_postgres():
        with engine.connect() as conn:
            rows = conn.execute(text(
                "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'public' and c.relkind = 'r' order by 1")).all()
        for name, rls in rows:
            print(f"  {name:14s} row level security: {'ON' if rls else 'OFF  <-- exposed via the Supabase REST API'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
