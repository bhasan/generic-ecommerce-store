# 1. Use a lightweight Nginx image
FROM nginx:1.25-alpine

# 2. Copy your custom Nginx configuration
# This will replace the default Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 3. Copy your React app's PRODUCTION BUILD
# IMPORTANT: You must run 'npm run build' in your 'frontend'
# directory *before* building this image.
COPY ../frontend/dist /usr/share/nginx/html

# 4. Expose port 80
EXPOSE 80

# 5. The default command to start Nginx
CMD ["nginx", "-g", "daemon off;"]