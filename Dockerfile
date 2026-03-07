# ===== Stage 1: Build =====
# Vollständiges Node-Image zum Installieren der Abhängigkeiten
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# ===== Stage 2: Runtime =====
# Distroless: kein Shell, kein Paketmanager, minimale Angriffsfläche
FROM gcr.io/distroless/nodejs22-debian13

WORKDIR /app

# Nur das Nötigste aus dem Builder übernehmen
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY public/ ./public/

# /data wird zur Laufzeit als Volume eingehängt
VOLUME ["/data"]

EXPOSE 3000

# Distroless hat keinen Shell → CMD muss immer Vektor-Form sein
CMD ["src/server.js"]
