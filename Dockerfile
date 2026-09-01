# syntax=docker/dockerfile:1

# ---- 构建阶段：编译前端静态产物 ----
FROM node:24-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 运行阶段：仅包含静态产物与轻量 Node 服务器 ----
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5217
WORKDIR /app
COPY web/server.mjs ./
COPY web/lib/ ./lib/
COPY --from=build /app/dist ./dist
USER node
EXPOSE 5217
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node", "server.mjs"]
