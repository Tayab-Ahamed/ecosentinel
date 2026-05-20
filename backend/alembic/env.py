"""Alembic migration environment (sync driver for upgrade scripts)."""

import os

from alembic import context
from sqlalchemy import create_engine, pool

# Import models only — avoid loading database.py (creates async engine at import).
from models.db import SQLModel  # noqa: F401 — register tables on metadata

config = context.config
target_metadata = SQLModel.metadata


def _database_url() -> str:
    """Read and normalize DATABASE_URL without importing the FastAPI database module."""
    url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./ecosentinel.db")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _sync_database_url() -> str:
    """Convert async SQLAlchemy URLs to sync drivers for Alembic."""
    url = _database_url()
    if url.startswith("sqlite+aiosqlite"):
        return url.replace("sqlite+aiosqlite", "sqlite", 1)
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "+psycopg2", 1)
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=_sync_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(_sync_database_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
