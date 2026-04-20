"""Alembic env script for SQLModel."""

from logging.config import fileConfig
from pathlib import Path
from typing import Optional

from alembic import context
from sqlmodel import create_engine

from backend.database import DATABASE_URL
from backend.models.db import SQLModel

# Alembic Config object
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: str = DATABASE_URL) -> None:
    from alembic.command import upgrade  # noqa

    if context.is_offline_mode():
        run_migrations_offline()
    else:
        cfg = config.get_section(config.config_ini_section)
        cfg["sqlalchemy.url"] = DATABASE_URL

        connectable = create_engine(DATABASE_URL)

        with connectable.connect() as connection:
            context.configure(
                connection=connection, target_metadata=target_metadata
            )

            with context.begin_transaction():
                context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    do_run_migrations()

