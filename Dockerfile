# Production image for the database-backed app (app/). The static GitHub Pages site is built separately.
#   docker build --build-arg ALLOWED_HOST=food.example.com -t ftlof .
#   docker run -p 8080:8080 -e DATABASE_URL=... -e ADMIN_TOKEN=... ftlof
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG ALLOWED_HOST=""
ENV ALLOWED_HOST=$ALLOWED_HOST
RUN npm run app:build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/app/dist ./app/dist
# db/ and content/ are needed for release commands (migrate, import) and the no-DATABASE_URL demo mode
COPY db ./db
COPY content ./content
RUN mkdir -p /app/.pgdata && chown -R node:node /app/.pgdata
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app/dist/server/entry.mjs"]
