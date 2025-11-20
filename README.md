# SkyFi MCP - Model Context Protocol Server

AI-driven geospatial data platform enabling autonomous agents to interact with SkyFi's satellite imagery and data services.

## 🎉 Epic 1 Complete!

✅ **Foundation & Core Infrastructure** (34/34 points)
- MCP Protocol (JSON-RPC 2.0) with HTTP + SSE support
- SkyFi API Client with retry, rate limiting, and caching
- PostgreSQL database with connection pooling
- OpenStreetMap geocoding integration
- Docker containerization with Docker Compose
- Comprehensive testing suite
- CI/CD pipeline with GitHub Actions

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set SKYFI_API_KEY, POSTGRES_PASSWORD, JWT_SECRET

# Start with Docker
npm run docker:up

# Verify
curl http://localhost:3000/health
```

## AWS Deployment

Complete Terraform infrastructure for production deployment:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit with your SkyFi API key and settings
./deploy.sh all
```

See [terraform/README.md](terraform/README.md) for detailed AWS deployment guide.

## Documentation

- [AWS Deployment (Terraform)](terraform/README.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product Requirements](docs/PRD.md)

## License

MIT