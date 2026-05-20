"""Database configuration — SQLite for local dev, PostgreSQL for production."""

import logging
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)

# Use SQLite for local dev (zero config), PostgreSQL for Railway prod
_raw_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./ecosentinel.db")

# Railway / Heroku often give postgres:// — normalise to postgresql+asyncpg://
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgresql://") and "+asyncpg" not in _raw_url:
    _raw_url = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

DATABASE_URL: str = _raw_url

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    """Create all tables on first run."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Database initialised (%s)", "SQLite" if _is_sqlite else "PostgreSQL")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Database initialisation skipped: %s", exc)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
