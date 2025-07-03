# backend/Dockerfile
# 第一阶段：安装Calibre
FROM python:3.9-slim AS builder

WORKDIR /tmp

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN wget -nv -O calibre.tar.xz https://download.calibre-ebook.com/linux-amd64/calibre-6.25.0-x86_64.txz \
    && mkdir -p /opt/calibre \
    && tar -xJf calibre.tar.xz -C /opt/calibre --strip-components=1 \
    && rm calibre.tar.xz

# 第二阶段：创建最终镜像
FROM python:3.9-slim

WORKDIR /app

# 复制Calibre二进制文件
COPY --from=builder /opt/calibre /opt/calibre
RUN ln -s /opt/calibre/ebook-convert /usr/bin/ebook-convert

# 安装依赖和应用
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
