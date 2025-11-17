## Setup instructions

Node v24.11.1
Docker v28.5.2

Below script will:
- Build web app so `dist` directory is generated.
- Docker spins containers and handles resource startup.

Deploy script:
```
cd web  
npm run build  
cd ..  
docker-compose up --build  
```

Open on `http://localhost:80`