# Standalone backend deployment Dockerfile
# For non-Vercel, containerized deployments of the oil-price-tracker backend.
# This image is designed to be invoked repeatedly by an external scheduler (cron,
# systemd timer, Kubernetes CronJob, etc.) that runs the ingest cycle.
#
# Two primary usage patterns:
#   (1) Default: docker run [image] -> runs `npm run ingest` (fetch + store prices)
#   (2) Alert delivery: docker run [image] node --loader tsx scripts/deliver-alerts.ts
#       (override CMD to run the alert-delivery variant for async notification batch jobs)
#
# For continuous deployments, wrap this in an orchestrator that runs the container
# on a schedule (e.g., every 15 minutes) rather than trying to implement a long-lived
# polling process inside the container.

FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json ./

# Install all deps (incl. devDependencies): this image runs TS source directly
# via tsx at runtime, there is no separate compile step stripping to plain JS,
# so tsx/typescript must be present even in the "production" image.
RUN npm ci

# Copy source code, scripts, and migrations
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY tsconfig.json .

# Default command: run the ingest cycle
CMD ["npm", "run", "ingest"]
