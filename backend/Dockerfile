FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libwebp7 zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Runtime-writable dirs — actual persistence comes from the volumes mounted
# here in docker-compose.yml, not from anything baked into the image.
RUN mkdir -p /app/data /app/static/uploads

EXPOSE 8000

# Single worker: slowapi's rate limiter keeps its counters in this process's
# memory, so multiple workers would each track limits independently and
# silently multiply the effective rate limit (see README's Rate limiting
# section). Point Limiter at Redis before ever adding --workers here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
