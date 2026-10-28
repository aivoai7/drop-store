# Self-hosted storefront image.
#
# Build from the repo root:  docker build -t drop-web .
# Runtime data (uploaded product images) lives in a volume mounted at
# /app/public/uploads — rebuilding or upgrading the container keeps images.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only; real values come from env at runtime.
# Skip type checks that need a live DB.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/public/uploads && chown -R app:app /app/public/uploads
VOLUME ["/app/public/uploads"]

USER app
EXPOSE 3002
CMD npx prisma db push --skip-generate && next start -p 3002
