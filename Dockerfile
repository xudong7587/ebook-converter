# 使用Node.js基础镜像
FROM node:16-slim

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        calibre \
        wkhtmltopdf \
        fontconfig \
        fonts-wqy-microhei \
        tini && \
    rm -rf /var/lib/apt/lists/*

# 安装中文字体支持
RUN fc-cache -fv

# 复制并安装后端依赖
COPY server/package*.json ./
RUN npm install --production

# 复制后端代码
COPY server/ ./

# 复制前端代码
COPY web/ ./public/

# 暴露端口
EXPOSE 3000

# 设置启动命令
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
