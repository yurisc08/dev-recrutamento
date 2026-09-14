# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/dados/uploads && chown -R node:node /app/dados
USER node
EXPOSE 4000
# A carga inicial do esquema é idempotente: roda a cada subida e não duplica nada.
CMD ["sh", "-c", "node dist/db/semear.js && node dist/index.js"]
