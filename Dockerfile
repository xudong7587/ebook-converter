# 使用包含 libvips 的 Node.js 基础镜像
FROM node:18-bullseye-slim

# 设置环境变量，避免 sharp 安装时重新编译
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产依赖（添加重试逻辑）
RUN npm install --production --no-fund --no-audit --verbose --unsafe-perm \
    || (echo "npm install 失败，重试一次..." && npm install --production --no-fund --no-audit --verbose --unsafe-perm)

# 复制应用代码
COPY . .

# 暴露端口（如果需要）
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]
