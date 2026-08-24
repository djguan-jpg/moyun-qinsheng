FROM python:3.12-slim

WORKDIR /app
COPY moyun_backend ./moyun_backend
RUN pip install --no-cache-dir \
    "fastapi>=0.115,<1" \
    "httpx>=0.27,<1" \
    "itsdangerous>=2.2,<3" \
    "python-dotenv>=1.0,<2" \
    "python-multipart>=0.0.12,<1" \
    "uvicorn>=0.30,<1"

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8010
EXPOSE 8010
CMD ["uvicorn", "moyun_backend.main:app", "--host", "0.0.0.0", "--port", "8010"]
