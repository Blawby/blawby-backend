FROM node:25-alpine

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY dist ./dist
COPY --chmod=755 start.sh ./start.sh
RUN mkdir -p logs storage/emails && chown -R node:node logs storage

USER node

EXPOSE 3000

CMD ["./start.sh"]
