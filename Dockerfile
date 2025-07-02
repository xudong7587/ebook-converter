# 在原有的基础上增加调试步骤
FROM node:16-slim

WORKDIR /app

# 修改 Dockerfile 中的依赖安装部分
COPY server/package*.json ./
RUN mkdir -p /npm-debug && \
    npm install --production --verbose > /npm-debug/install.log 2>&1 || \
    (echo "npm 安装失败，请查看日志" && \
     cp /npm-debug/install.log /npm-debug/full_install.log && \
     tail -n 100 /npm-debug/install.log > /npm-debug/error_snippet.log && \
     cat /npm-debug/error_snippet.log && \
     exit 1)

# 安装中文字体支持
RUN fc-cache -fv

# 设置npm源和调试选项
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 3 && \
    npm config set fetch-retry-factor 10 && \
    npm config set loglevel verbose

# 复制package.json并调试安装
COPY server/package*.json ./
RUN mkdir -p /npm-debug && \
    npm install --production --verbose > /npm-debug/install.log 2>&1 || \
    (echo "npm安装失败，请查看日志" && \
     cat /npm-debug/install.log && \
     exit 1)

# 后续步骤保持不变...

# 复制后端代码
COPY server/ ./

# 复制前端代码
COPY web/ ./public/

# 暴露端口
EXPOSE 3000

# 设置启动命令
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
