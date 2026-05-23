FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY auth.js database.js server.js ./
COPY public ./public

RUN mkdir -p public/uploads/maps public/uploads/tokens public/uploads/characters public/uploads/music \
  && addgroup -S dedeki && adduser -S dedeki -G dedeki \
  && chown -R dedeki:dedeki /app

USER dedeki

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
