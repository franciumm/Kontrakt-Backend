# Stage 1: install
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: prune dev + run
FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["node", "index.js"]
