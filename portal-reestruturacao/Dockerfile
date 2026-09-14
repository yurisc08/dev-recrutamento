# Imagem única: a API serve a própria interface.
# É o formato que os provedores de nuvem esperam (um serviço web + um banco).

# ---- interface ----
FROM node:22-alpine AS front
WORKDIR /front
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
RUN npm run build

# ---- api ----
FROM node:22-alpine AS api
WORKDIR /api
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
ENV FRONTEND_DIR=/app/public
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api /api/dist ./dist
COPY --from=front /front/dist ./public
RUN mkdir -p /app/dados/uploads && chown -R node:node /app/dados
USER node
EXPOSE 4000
# A carga do esquema é idempotente: roda a cada implantação sem duplicar nada.
CMD ["sh", "-c", "node dist/db/semear.js && node dist/index.js"]
