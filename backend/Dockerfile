# backend/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# 安装依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# 从GitHub下载Calibre
RUN wget -nv -O calibre.tar.xz https://github.com/kovidgoyal/calibre/releases/download/v7.0.0/calibre-7.0.0-x86_64.txz \
    && mkdir -p /opt/calibre \
    && tar -xJf calibre.tar.xz -C /opt/calibre --strip-components=1 \
    && rm calibre.tar.xz \
    && ln -s /opt/calibre/ebook-convert /usr/bin/ebook-convert
