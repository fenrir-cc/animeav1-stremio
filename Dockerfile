# Use Node.js official lightweight image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose Stremio addon port
EXPOSE 7000

# Environment variables
ENV PORT=7000
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]
