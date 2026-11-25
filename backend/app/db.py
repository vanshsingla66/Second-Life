from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine, make_url
from sqlmodel import Session, SQLModel, create_engine

from .config import DATABASE_URL

LOCAL_HOSTS = {None, "", "localhost", "127.0.0.1", "::1"}


def build_engine(url: str) -> Engine:
    """SQLite for local dev/tests, Postgres (Supabase) when DATABASE_URL points at it."""
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite":
        return create_engine(url, connect_args={"check_same_thread": False})

    connect_args: dict = {
        # Supabase's transaction pooler (port 6543, pgbouncer) doesn't support server-side prepared statements.
        "prepare_threshold": None,
    }
    if "sslmode" not in parsed.query and parsed.host not in LOCAL_HOSTS:
        connect_args["sslmode"] = "require"  # Supabase requires TLS
    return create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,   # drop connections the pooler closed while idle
        pool_size=5,
        max_overflow=5,
        pool_recycle=300,
    )


engine = build_engine(DATABASE_URL)


def is_postgres(eng: Engine = engine) -> bool:
    return eng.dialect.name == "postgresql"


def init_db(eng: Engine = engine) -> None:
    from . import models  # noqa: F401  (registers the tables on SQLModel.metadata)

    SQLModel.metadata.create_all(eng)
    _add_missing_columns(eng)
    if is_postgres(eng):
        # Supabase exposes every table in the public schema through its REST API. Turn Row Level Security on with
        # no policies so that API (anon/authenticated keys) can't read e.g. password hashes. This backend connects as
        # the database owner, which bypasses RLS, so it keeps working. Idempotent.
        with eng.begin() as conn:
            for table in SQLModel.metadata.sorted_tables:
                conn.execute(text(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY'))


# create_all never alters existing tables, so columns added after the first deploy are added here (idempotent).
NEW_COLUMNS = {"listing": {"images": "TEXT NOT NULL DEFAULT '[]'"}}


def _add_missing_columns(eng: Engine) -> None:
    insp = inspect(eng)
    with eng.begin() as conn:
        for table, cols in NEW_COLUMNS.items():
            have = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols.items():
                if name not in have:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {name} {ddl}'))


def get_session():
    with Session(engine) as session:
        yield session
