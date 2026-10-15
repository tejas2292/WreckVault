FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Source is baked into the image; production gets PORT and DATABASE_URL from the
# environment (compose env_file), never from a copied .env (.dockerignore excludes it).
COPY . .

USER node
EXPOSE 5000

CMD ["node", "index.js"]
