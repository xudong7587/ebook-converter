# 修改Dockerfile
FROM node:16-slim

WORKDIR /app

# 安装必要的系统依赖和编译工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        calibre \
        wkhtmltopdf \
        fontconfig \
        fonts-wqy-microhei \
        tini \
        build-essential \
        curl \
        python3 \
        libglib2.0-dev \
        libexpat1-dev \
        libjpeg-dev \
        libpng-dev \
        libwebp-dev \
        libtiff-dev \
        libgif-dev && \
    rm -rf /var/lib/apt/lists/*

# 从源码安装libvips（v8.14.3是兼容Node.js 16的稳定版本）
RUN curl -L https://github.com/libvips/libvips/releases/download/v8.14.3/vips-8.14.3.tar.gz -o vips.tar.gz && \
    tar xzf vips.tar.gz && \
    cd vips-8.14.3 && \
    ./configure --disable-debug --disable-dependency-tracking --enable-silent-rules && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    cd .. && \
    rm -rf vips*

# 安装中文字体支持
RUN fc-cache -fv

# 设置npm源
RUN npm config set registry https://registry.npmmirror.com

# 复制并安装后端依赖
COPY server/package*.json ./
RUN npm install --production