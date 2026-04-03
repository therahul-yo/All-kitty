# Use Node.js 20 LTS
FROM node:20-slim

# Install system dependencies (including build-essential for native modules like better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy everything else
COPY . .

# Build TypeScript
RUN npx tsc --skipLibCheck

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

# Start directly with node to avoid npm overhead and potential signal issues
CMD ["node", "dist/server.js"]
