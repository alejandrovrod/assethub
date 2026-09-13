FROM node:22-alpine AS build

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace files
COPY src/frontend/package.json src/frontend/pnpm-workspace.yaml src/frontend/pnpm-lock.yaml ./
# Copy frontend source
COPY src/frontend/ ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build web app
WORKDIR /app/apps/web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

# Production server using Nginx
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Add custom Nginx config for SPA routing (fallback to index.html)
RUN echo "server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
