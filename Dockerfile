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

# Install yt-dlp. The release asset named plain `yt-dlp` is a Python zipapp, not a
# frozen binary — it runs on the python3 above and imports from its site-packages.
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# curl_cffi gives yt-dlp TLS/JA3 impersonation. It is not bundled in the zipapp, and
# without it the Instagram extractor skips the GraphQL call that returns the media
# and falls back to a logged-out webpage scrape that Instagram walls off — so every
# instagram.com link fails. yt-dlp only accepts 0.10.x–0.15.x; newer is refused at
# import and silently leaves impersonation unavailable, so the upper bound matters.
RUN (pip3 install --no-cache-dir --break-system-packages 'curl_cffi>=0.11,<0.16' \
     || pip3 install --no-cache-dir 'curl_cffi>=0.11,<0.16') \
    && /usr/local/bin/yt-dlp --list-impersonate-targets | grep -q 'curl_cffi$'

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
