"""Pytest configuration: fast startup for CI (no Whisper / PyTorch load)."""

import os

os.environ.setdefault("ECOSENTINEL_SKIP_WHISPER_INIT", "1")
