# 使用官方Node.js 16 slim镜像
FROM node:16-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（添加国内源加速）
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        calibre \
        wkhtmltopdf \
        fontconfig \
        fonts-wqy-microhei \
        tini \
        python3 \
        build-essential && \
    rm -rf /var/lib/apt/lists/*

# 安装中文字体支持
RUN fc-cache -fv

# 设置npm淘宝镜像源并增加重试机制
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-factor 2 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000

# 复制并安装依赖（单独分离以利用缓存）
COPY server/package*.json ./
RUN mkdir -p /npm-debug && \
    npm install --production --verbose > /npm-debug/install.log 2>&1 || \
    (echo "npm安装失败，请查看日志" && \
     cat /npm-debug/install.log && \
     exit 1)

# 复制应用代码
COPY server/ ./
COPY web/ ./public/

# 暴露端口
EXPOSE 3000

# 设置启动命令
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]