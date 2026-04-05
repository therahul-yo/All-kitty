# Use Node.js 20 LTS
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (required by yt-dlp to solve JS challenges)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy everything else
COPY . .

# Build Backend TypeScript
RUN npx tsc --skipLibCheck

# Build Frontend TypeScript (explicitly)
RUN npx tsc public/script.ts --lib dom,esnext --target es2022 --outFile public/script.js --ignoreConfig --ignoreDeprecations 6.0

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

# Start directly with node
CMD ["node", "dist/server.js"]
