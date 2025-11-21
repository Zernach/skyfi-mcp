# OpenStreetMap (OSM) Integration

This integration connects the SkyFi MCP backend to OpenStreetMap services (specifically Nominatim) for geocoding and reverse geocoding capabilities.

## Overview

The OSM integration provides a way to convert addresses to coordinates (geocoding) and coordinates to addresses (reverse geocoding). This is essential for processing user queries that involve place names (e.g., "Show me images of Paris") or for providing context to coordinate-based queries.

## Components

### Client (`src/integrations/osm/client.ts`)

The `OSMClient` class is a singleton wrapper around the Nominatim API. It handles:
- HTTP requests to the configured Nominatim instance.
- Caching of results to respect usage policies and improve performance.
- Type-safe responses.

### Types (`src/integrations/osm/types.ts`)

Defines TypeScript interfaces for:
- `GeocodeResult`: Structured data for a location including coordinates and bounding box.
- `ReverseGeocodeResult`: detailed address information for a coordinate pair.
- API parameter interfaces.

## Configuration

The integration is configured via environment variables mapped in `src/config/index.ts`.

| Variable | Default | Description |
|----------|---------|-------------|
| `OSM_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | The base URL for the Nominatim API service. |

## Usage

### Import

```typescript
import { osmClient } from '../integrations/osm';
```

### Geocoding (Address to Coordinates)

```typescript
const result = await osmClient.geocode('Eiffel Tower, Paris');

if (result) {
  console.log(`Latitude: ${result.lat}`);
  console.log(`Longitude: ${result.lon}`);
  console.log(`Bounding Box: ${result.boundingBox}`);
}
```

### Reverse Geocoding (Coordinates to Address)

```typescript
const result = await osmClient.reverseGeocode(48.8584, 2.2945);

if (result) {
  console.log(`Address: ${result.displayName}`);
  console.log(`City: ${result.address.city}`);
}
```

## Caching

The client implements an in-memory LRU-style cache (using a `Map`) with a default TTL of 1 hour. This reduces load on the OSM servers and speeds up repeated queries for the same locations.

## Usage Policy

When using the public OpenStreetMap Nominatim instance, you must respect their [Usage Policy](https://operations.osmfoundation.org/policies/nominatim/):
- Maximum of 1 request per second.
- Provide a valid User-Agent (handled by the client).
- Do not scrape data.

If higher volume is required, consider hosting a local Nominatim instance or using a paid provider, and update the `OSM_NOMINATIM_URL` accordingly.

