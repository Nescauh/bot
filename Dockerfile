FROM node:20-slim

# Instala Python 3, FFmpeg e certificados SSL no ambiente Debian do Railway
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia arquivos de dependencias do Node.js
COPY package*.json ./

# Instala as dependencias do projeto
RUN npm install

# Copia o codigo do projeto para a imagem
COPY . .

# Comando de inicializacao do bot
CMD ["npm", "start"]
