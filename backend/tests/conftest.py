"""Pytest configuration: fast startup, isolated SQLite database."""

import os

os.environ["ECOSENTINEL_SKIP_WHISPER_INIT"] = "1"
os.environ["GEMINI_API_KEY"] = ""
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_ecosentinel.db"
