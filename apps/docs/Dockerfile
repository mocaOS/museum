# MOCA API docs (Zudoku) — static build served by nginx.
# Deploy on Coolify; point docs.museumofcryptoart.com at port 80.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY stubs ./stubs
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA-ish fallback: prerendered pages exist as real files; anything else
# falls back to the 404 page Zudoku generates.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  error_page 404 /404.html;\n  location / {\n    try_files $uri $uri/index.html $uri.html =404;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
