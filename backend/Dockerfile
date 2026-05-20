FROM python:3.11-slim

WORKDIR /app

# Install system deps for Prophet / numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper base model so first request is instant
RUN python -c "import whisper; whisper.load_model('base')" || true

COPY . .

# Set production env so errors don't leak stack traces
ENV ECOSENTINEL_ENV=production

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
