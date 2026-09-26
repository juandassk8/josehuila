FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
# Use the supported Google Chrome channel for the collector. Retain Chromium
# for compatibility comparisons and the app's existing browser checks.
RUN npx playwright install --with-deps chrome
ENV PLAYWRIGHT_CHANNEL=chrome
COPY api/_lib ./api/_lib
COPY shared ./shared
COPY services/ad-library ./services/ad-library
USER node
CMD ["node", "services/ad-library/worker.mjs"]
