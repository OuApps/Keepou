# Keepou web — build the Vite SPA, then serve it with nginx.
# nginx also proxies /api to the API container, so the app is single-origin
# (no CORS, no VITE_API_URL to configure).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
