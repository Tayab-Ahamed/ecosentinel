"""Database configuration with SQLModel and async PostgreSQL support."""

import os
from typing import Generator

from sqlmodel import SQLModel, create_engine, SessionMaker
from sqlmodel.ext.asyncio.session import AsyncSession

import asyncio

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://postgres:password@localhost/ecosentinel"
)

engine = create_engine(DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"), echo=True)

SessionLocal = SessionMaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> Generator[AsyncSession, None, None]:
    async with SessionLocal() as session:
        yield session

