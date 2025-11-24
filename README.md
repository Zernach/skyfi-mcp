# SkyFi MCP



https://github.com/user-attachments/assets/c24679fa-025a-4c81-a93c-6f03435d6a07



AI-driven geospatial data platform enabling autonomous agents to interact with SkyFi's satellite imagery and data services through the Model Context Protocol (MCP).

## Overview

This repository contains:
- **Backend**: MCP server with SkyFi API integration, authentication, order management, and monitoring
- **Frontend**: Earth Intelligence Platform with voice co-pilot and satellite detection visualization
- **Infrastructure**: Terraform configurations for AWS deployment

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env  # Configure SKYFI_API_KEY, OPENAI_API_KEY, etc.
npm run docker:up
```

### Frontend
```bash
cd frontend
yarn install
yarn start  # Runs on http://localhost:3000
```

## Documentation

- [Backend README](backend/README.md) - MCP server details and API documentation
- [Frontend README](frontend/README.md) - Earth Intelligence Platform guide
- [Architecture](backend/docs/ARCHITECTURE.md) - System architecture
- [AWS Deployment](backend/terraform/README.md) - Production deployment guide

## License

MIT

