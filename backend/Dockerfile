# 1. Use a small, official Node.js image
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first
# This uses Docker's build cache, speeding up future builds
COPY package*.json ./

# 4. Install all dependencies
RUN npm install

# 5. Copy the Prisma schema
COPY prisma ./prisma/

# 6. Generate the Prisma client
RUN npx prisma generate

# 7. Copy the rest of your backend source code
COPY . .

# 8. Expose the port your app will run on
EXPOSE 3000

# 9. The command to run your app
# IMPORTANT: See the package.json note below!
CMD [ "npm", "run", "start:prod" ]