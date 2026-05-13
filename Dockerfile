FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/package*.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["npm", "start"]
