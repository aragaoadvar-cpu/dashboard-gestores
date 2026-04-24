# Use an official Node.js runtime optimized for production
FROM node:20-alpine

WORKDIR /usr/src/app

# Install dependencies first to leverage Docker cache
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source code
COPY . .

# Build the Next.js application
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "start"]
