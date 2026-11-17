# Recoup web app. Works on IBM Cloud Code Engine, Render, Fly.io or any container host.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY recoup recoup
COPY web web
COPY samples samples
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn recoup.api:app --host 0.0.0.0 --port $PORT"]
