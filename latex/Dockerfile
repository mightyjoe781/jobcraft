FROM texlive/texlive:latest

RUN apt-get update && apt-get install -y python3 python3-pip curl && \
    pip3 install --break-system-packages fastapi uvicorn python-multipart && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY main.py .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
