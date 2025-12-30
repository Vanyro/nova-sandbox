# Development Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with increased timeout
RUN npm ci --prefer-offline --no-audit --maxsockets 1 || npm ci --prefer-offline --no-audit --maxsockets 1

# Copy application code
COPY . .

# Expose port
EXPOSE 4000

# Default command (overridden by docker-compose)
CMD ["npm", "run", "dev"]
