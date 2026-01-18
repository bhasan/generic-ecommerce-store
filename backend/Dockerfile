# 1. Use a small, official Node.js image
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first
# This uses Docker's build cache, speeding up future builds
COPY package*.json ./

# 4. Install all dependencies
RUN npm install

# 5. Copy the backend source code (including Prisma schema)
COPY . .

# 6. Generate the Prisma client from the current schema
RUN npx prisma generate

# 7. Build TypeScript during Docker build (not at runtime)
RUN npm run build

# 9. Expose the port your app will run on
EXPOSE 3000

# 10. Container health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# 10. The command to run your app
# IMPORTANT: See the package.json note below!
CMD [ "npm", "run", "start:prod" ]