FROM node:22-alpine AS deps
# Build tools, in case better-sqlite3 has no prebuilt binary for this platform
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine

# tzdata so log timestamps follow TZ
RUN apk add --no-cache tzdata

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/app/data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
