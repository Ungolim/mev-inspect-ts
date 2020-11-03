FROM node:12.19.0-alpine3.12

WORKDIR /app
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm install
COPY . /app

ENTRYPOINT npm run start
