# ===== Stage 1: Build =====
# Full Node image for installing dependencies
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# ===== Stage 2: Runtime =====
# Distroless: no shell, no package manager, minimal attack surface
FROM gcr.io/distroless/nodejs22-debian13

WORKDIR /app

# Copy only what's needed from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

# /data is mounted as a volume at runtime
VOLUME ["/data"]

EXPOSE 3000

# Distroless has no shell - CMD must always be in vector form
CMD ["src/server.js"]
