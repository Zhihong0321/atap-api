# Railway-ready API image (Fastify + Prisma)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run api:build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist-api ./dist-api
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000
CMD ["node", "dist-api/server.js"]
