FROM node:25-alpine

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY dist ./dist
COPY start.sh ./start.sh
RUN chmod +x start.sh && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["./start.sh"]
