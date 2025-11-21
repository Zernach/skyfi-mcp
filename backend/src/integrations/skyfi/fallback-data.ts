import { ArchiveSearchParams, ArchiveSearchResponse, ArchiveSearchResult } from './types';

export type ArchiveSearchFallbackParams = ArchiveSearchParams & {
  maxCloudCoverage?: number;
  minResolution?: number;
  startDate?: string;
  endDate?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
};

interface FallbackScene {
  id: string;
  label: string;
  centroid: {
    lat: number;
    lon: number;
  };
  radiusKm: number;
  results: ArchiveSearchResult[];
}

const FALLBACK_SCENES: FallbackScene[] = [
  {
    id: 'paris-core',
    label: 'Paris, France',
    centroid: { lat: 48.8566, lon: 2.3522 },
    radiusKm: 75,
    results: [
      {
        id: 'PARIS-PLN-20240118',
        satellite: 'Pléiades Neo 4',
        captureDate: '2024-01-18T10:12:40Z',
        cloudCover: 8,
        resolution: 0.3,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-PLN-20240118.jpg',
        bbox: [2.1861, 48.8122, 2.4934, 48.9103],
        price: 1125.5,
      },
      {
        id: 'PARIS-S2A-20231002',
        satellite: 'Sentinel-2A',
        captureDate: '2023-10-02T11:03:05Z',
        cloudCover: 21,
        resolution: 1,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-S2A-20231002.jpg',
        bbox: [2.0795, 48.7448, 2.6403, 48.9757],
        price: 0,
      },
      {
        id: 'PARIS-WV03-20230714',
        satellite: 'WorldView-3',
        captureDate: '2023-07-14T09:47:18Z',
        cloudCover: 2,
        resolution: 0.31,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-WV03-20230714.jpg',
        bbox: [2.2551, 48.8324, 2.4098, 48.9052],
        price: 875,
      },
      {
        id: 'PARIS-SPOT6-20221204',
        satellite: 'SPOT-6',
        captureDate: '2022-12-04T11:21:12Z',
        cloudCover: 4,
        resolution: 1.5,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-SPOT6-20221204.jpg',
        bbox: [2.2112, 48.7926, 2.4723, 48.9268],
        price: 460.25,
      },
    ],
  },
  {
    id: 'new-york-core',
    label: 'New York City, USA',
    centroid: { lat: 40.7128, lon: -74.006 },
    radiusKm: 90,
    results: [
      {
        id: 'NYC-WV02-20230921',
        satellite: 'WorldView-2',
        captureDate: '2023-09-21T15:26:18Z',
        cloudCover: 5,
        resolution: 0.46,
        thumbnail: 'https://example.skyfi.test/thumbnails/NYC-WV02-20230921.jpg',
        bbox: [-74.0753, 40.665, -73.9107, 40.768],
        price: 910.4,
      },
      {
        id: 'NYC-LANDSAT8-20230415',
        satellite: 'Landsat 8',
        captureDate: '2023-04-15T16:02:36Z',
        cloudCover: 12,
        resolution: 15,
        thumbnail: 'https://example.skyfi.test/thumbnails/NYC-LANDSAT8-20230415.jpg',
        bbox: [-74.2558, 40.4957, -73.6995, 40.9176],
        price: 0,
      },
    ],
  },
];

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

const haversineDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

const withinRange = (value: number, min?: number, max?: number) => {
  if (typeof min === 'number' && value < min) return false;
  if (typeof max === 'number' && value > max) return false;
  return true;
};

const parseDateOrNull = (value?: string) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const matchesFilters = (
  result: ArchiveSearchResult,
  params: ArchiveSearchFallbackParams
) => {
  const cloudLimit = params.maxCloudCoverage ?? params.maxCloudCover;
  if (typeof cloudLimit === 'number' && result.cloudCover > cloudLimit) {
    return false;
  }

  const minResolution = params.minResolution ?? params.resolution?.min;
  if (typeof minResolution === 'number' && result.resolution < minResolution) {
    return false;
  }

  if (
    !withinRange(result.resolution, params.resolution?.min, params.resolution?.max)
  ) {
    return false;
  }

  const dateLower = parseDateOrNull(params.startDate ?? params.dateRange?.start);
  const dateUpper = parseDateOrNull(params.endDate ?? params.dateRange?.end);
  const capture = parseDateOrNull(result.captureDate);

  if (capture !== null) {
    if (dateLower !== null && capture < dateLower) {
      return false;
    }
    if (dateUpper !== null && capture > dateUpper) {
      return false;
    }
  }

  return true;
};

export const getFallbackArchiveSearch = (
  params: ArchiveSearchFallbackParams
): ArchiveSearchResponse | null => {
  if (!params.location || params.location.type !== 'Point') {
    return null;
  }

  const coordinates = params.location.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [lon, lat] = coordinates;
  if (typeof lon !== 'number' || typeof lat !== 'number') {
    return null;
  }

  const match = FALLBACK_SCENES.find((scene) => {
    const distance = haversineDistanceKm(lat, lon, scene.centroid.lat, scene.centroid.lon);
    return distance <= scene.radiusKm;
  });

  if (!match) {
    return null;
  }

  const filtered = match.results.filter((result) => matchesFilters(result, params));
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 10;
  const paged = filtered.slice(offset, offset + limit);

  return {
    results: paged,
    total: filtered.length,
    limit,
    offset,
  };
};
