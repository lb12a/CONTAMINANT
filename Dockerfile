# Contaminant game server + web client in one small image.
#   docker build -t contaminant .
#   docker run -d -p 8787:8787 -v contaminant-data:/data contaminant
# See docs/DEPLOY.md for HTTPS, admin token and updates.

FROM node:24-slim AS build
WORKDIR /src
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# the other workspaces' manifests keep the lockfile valid; their dependencies are not installed
COPY apps/desktop/package.json apps/desktop/
COPY tools/assetgen/package.json tools/assetgen/
COPY tools/qa/package.json tools/qa/
RUN npm ci --workspace=@contaminant/engine --workspace=@contaminant/server --workspace=@contaminant/client --include-workspace-root --no-audit --no-fund
COPY packages packages
RUN npm run build -w @contaminant/client && npm run build -w @contaminant/server

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1
COPY --from=build /src/packages/server/dist/server.mjs ./server.mjs
COPY --from=build /src/packages/client/dist ./client
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=4s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs", "--port", "8787", "--data", "/data/contaminant.sqlite", "--static", "/app/client"]
