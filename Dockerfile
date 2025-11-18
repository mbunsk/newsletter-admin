FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules (optional, for some packages)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=optional

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data/internal data/external data/merged data/insights output logs

# Expose port for admin dashboard
EXPOSE 4000

# Default command - run admin server for web service deployment
# For background worker, override with: CMD ["node", "scheduler/dailyJob.js"]
# For local development, override with: CMD ["tail", "-f", "/dev/null"]
CMD ["npm", "run", "admin"]

