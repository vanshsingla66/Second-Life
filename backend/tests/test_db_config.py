import pytest

from app.config import normalize_database_url
from app.db import build_engine


@pytest.mark.parametrize("raw,expected", [
    ("postgresql://u:p@host:5432/postgres", "postgresql+psycopg://u:p@host:5432/postgres"),
    ("postgres://u:p@host:6543/postgres", "postgresql+psycopg://u:p@host:6543/postgres"),
    ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("  sqlite:///./green.db ", "sqlite:///./green.db"),
])
def test_normalize_database_url(raw, expected):
    assert normalize_database_url(raw) == expected


def test_postgres_engine_options():
    e = build_engine("postgresql+psycopg://postgres.abc:pw@aws-0-eu.pooler.supabase.com:6543/postgres")
    assert e.dialect.name == "postgresql"
    assert e.pool._pre_ping is True


def test_local_postgres_does_not_force_tls_but_remote_does():
    # build_engine is lazy: nothing connects here
    remote = build_engine("postgresql+psycopg://u:p@db.example.supabase.co:5432/postgres")
    local = build_engine("postgresql+psycopg://u:p@localhost:5432/postgres")
    assert remote.dialect.name == local.dialect.name == "postgresql"


def test_sqlite_engine_unchanged():
    assert build_engine("sqlite://").dialect.name == "sqlite"
