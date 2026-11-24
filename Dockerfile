# LANChat as an always-on server (optional). The desktop app does not need this.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
ENV PORT=3000 DATA_DIR=/data TRUST_PROXY=1 NODE_ENV=production
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/config || exit 1
CMD ["node", "server.js"]
