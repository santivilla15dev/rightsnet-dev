# RightsNet API / worker image (staging scaffold).
# Build from repo root: docker build -f deploy/Dockerfile -t rightsnet-api .
# Run API:  docker run --env-file … -e PROCESS=api -p 4000:4000 rightsnet-api
# Run worker: docker run --env-file … -e PROCESS=worker rightsnet-api
# docs/STAGING_API_DOCKER_V0_1.md

FROM node:22.20.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PROCESS=api \
    API_PORT=4000

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Include devDeps so `tsx` can run TypeScript (repo uses noEmit).
RUN pnpm install --frozen-lockfile

EXPOSE 4000

CMD ["sh", "-c", "if [ \"$PROCESS\" = \"worker\" ]; then pnpm worker; else pnpm api; fi"]
