import { ArchiveSearchParams, ArchiveSearchResponse, ArchiveResponse } from './types';

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

// Legacy archive format used in fallback data
interface LegacyArchiveResponse {
  id: string;
  satellite: string;
  captureDate: string;
  cloudCover: number;
  gsd?: number;
  thumbnail: string;
  bbox: number[];
  price: number;
}

interface FallbackScene {
  id: string;
  label: string;
  centroid: {
    lat: number;
    lon: number;
  };
  radiusKm: number;
  archives: LegacyArchiveResponse[];
}

const FALLBACK_SCENES: FallbackScene[] = [
  {
    id: 'paris-core',
    label: 'Paris, France',
    centroid: { lat: 48.8566, lon: 2.3522 },
    radiusKm: 75,
    archives: [
      {
        id: 'PARIS-PLN-20240118',
        satellite: 'Pléiades Neo 4',
        captureDate: '2024-01-18T10:12:40Z',
        cloudCover: 8,
        gsd: 0.3,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-PLN-20240118.jpg',
        bbox: [2.1861, 48.8122, 2.4934, 48.9103],
        price: 1125.5,
      },
      {
        id: 'PARIS-S2A-20231002',
        satellite: 'Sentinel-2A',
        captureDate: '2023-10-02T11:03:05Z',
        cloudCover: 21,
        gsd: 1,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-S2A-20231002.jpg',
        bbox: [2.0795, 48.7448, 2.6403, 48.9757],
        price: 0,
      },
      {
        id: 'PARIS-WV03-20230714',
        satellite: 'WorldView-3',
        captureDate: '2023-07-14T09:47:18Z',
        cloudCover: 2,
        gsd: 0.31,
        thumbnail: 'https://example.skyfi.test/thumbnails/PARIS-WV03-20230714.jpg',
        bbox: [2.2551, 48.8324, 2.4098, 48.9052],
        price: 875,
      },
      {
        id: 'PARIS-SPOT6-20221204',
        satellite: 'SPOT-6',
        captureDate: '2022-12-04T11:21:12Z',
        cloudCover: 4,
        gsd: 1.5,
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
    archives: [
      {
        id: 'NYC-WV02-20230921',
        satellite: 'WorldView-2',
        captureDate: '2023-09-21T15:26:18Z',
        cloudCover: 5,
        gsd: 0.46,
        thumbnail: 'https://example.skyfi.test/thumbnails/NYC-WV02-20230921.jpg',
        bbox: [-74.0753, 40.665, -73.9107, 40.768],
        price: 910.4,
      },
      {
        id: 'NYC-LANDSAT8-20230415',
        satellite: 'Landsat 8',
        captureDate: '2023-04-15T16:02:36Z',
        cloudCover: 12,
        gsd: 15,
        thumbnail: 'https://example.skyfi.test/thumbnails/NYC-LANDSAT8-20230415.jpg',
        bbox: [-74.2558, 40.4957, -73.6995, 40.9176],
        price: 0,
      },
    ],
  },
  {
    id: 'london-core',
    label: 'London, UK',
    centroid: { lat: 51.5074, lon: -0.1278 },
    radiusKm: 80,
    archives: [
      {
        id: 'LON-PLN-20240201',
        satellite: 'Pléiades Neo 3',
        captureDate: '2024-02-01T11:30:22Z',
        cloudCover: 15,
        gsd: 0.3,
        thumbnail: 'https://example.skyfi.test/thumbnails/LON-PLN-20240201.jpg',
        bbox: [-0.2416, 51.4382, 0.0077, 51.5723],
        price: 1050.0,
      },
      {
        id: 'LON-S2B-20231115',
        satellite: 'Sentinel-2B',
        captureDate: '2023-11-15T11:15:33Z',
        cloudCover: 28,
        gsd: 10,
        thumbnail: 'https://example.skyfi.test/thumbnails/LON-S2B-20231115.jpg',
        bbox: [-0.3897, 51.3621, 0.1545, 51.6464],
        price: 0,
      },
    ],
  },
  {
    id: 'tokyo-core',
    label: 'Tokyo, Japan',
    centroid: { lat: 35.6762, lon: 139.6503 },
    radiusKm: 85,
    archives: [
      {
        id: 'TYO-WV03-20240105',
        satellite: 'WorldView-3',
        captureDate: '2024-01-05T02:15:45Z',
        cloudCover: 6,
        gsd: 0.31,
        thumbnail: 'https://example.skyfi.test/thumbnails/TYO-WV03-20240105.jpg',
        bbox: [139.5503, 35.5762, 139.7503, 35.7762],
        price: 925.0,
      },
      {
        id: 'TYO-S2A-20231201',
        satellite: 'Sentinel-2A',
        captureDate: '2023-12-01T02:45:12Z',
        cloudCover: 18,
        gsd: 10,
        thumbnail: 'https://example.skyfi.test/thumbnails/TYO-S2A-20231201.jpg',
        bbox: [139.4503, 35.4762, 139.8503, 35.8762],
        price: 0,
      },
    ],
  },
  {
    id: 'san-francisco-core',
    label: 'San Francisco, USA',
    centroid: { lat: 37.7749, lon: -122.4194 },
    radiusKm: 70,
    archives: [
      {
        id: 'SF-WV02-20240110',
        satellite: 'WorldView-2',
        captureDate: '2024-01-10T18:30:15Z',
        cloudCover: 3,
        gsd: 0.46,
        thumbnail: 'https://example.skyfi.test/thumbnails/SF-WV02-20240110.jpg',
        bbox: [-122.5194, 37.6749, -122.3194, 37.8749],
        price: 880.0,
      },
      {
        id: 'SF-LANDSAT9-20231120',
        satellite: 'Landsat 9',
        captureDate: '2023-11-20T18:15:45Z',
        cloudCover: 8,
        gsd: 15,
        thumbnail: 'https://example.skyfi.test/thumbnails/SF-LANDSAT9-20231120.jpg',
        bbox: [-122.6194, 37.5749, -122.2194, 37.9749],
        price: 0,
      },
    ],
  },
  {
    id: 'sydney-core',
    label: 'Sydney, Australia',
    centroid: { lat: -33.8688, lon: 151.2093 },
    radiusKm: 75,
    archives: [
      {
        id: 'SYD-PLN-20240115',
        satellite: 'Pléiades Neo 4',
        captureDate: '2024-01-15T22:45:30Z',
        cloudCover: 5,
        gsd: 0.3,
        thumbnail: 'https://example.skyfi.test/thumbnails/SYD-PLN-20240115.jpg',
        bbox: [151.1093, -33.9688, 151.3093, -33.7688],
        price: 1075.0,
      },
      {
        id: 'SYD-S2B-20231210',
        satellite: 'Sentinel-2B',
        captureDate: '2023-12-10T22:30:12Z',
        cloudCover: 12,
        gsd: 10,
        thumbnail: 'https://example.skyfi.test/thumbnails/SYD-S2B-20231210.jpg',
        bbox: [151.0093, -34.0688, 151.4093, -33.6688],
        price: 0,
      },
    ],
  },
  {
    id: 'dubai-core',
    label: 'Dubai, UAE',
    centroid: { lat: 25.2048, lon: 55.2708 },
    radiusKm: 65,
    archives: [
      {
        id: 'DXB-WV03-20240120',
        satellite: 'WorldView-3',
        captureDate: '2024-01-20T07:15:40Z',
        cloudCover: 2,
        gsd: 0.31,
        thumbnail: 'https://example.skyfi.test/thumbnails/DXB-WV03-20240120.jpg',
        bbox: [55.1708, 25.1048, 55.3708, 25.3048],
        price: 950.0,
      },
      {
        id: 'DXB-S2A-20231205',
        satellite: 'Sentinel-2A',
        captureDate: '2023-12-05T07:00:20Z',
        cloudCover: 4,
        gsd: 10,
        thumbnail: 'https://example.skyfi.test/thumbnails/DXB-S2A-20231205.jpg',
        bbox: [55.0708, 25.0048, 55.4708, 25.4048],
        price: 0,
      },
    ],
  },
  {
    id: 'singapore-core',
    label: 'Singapore',
    centroid: { lat: 1.3521, lon: 103.8198 },
    radiusKm: 55,
    archives: [
      {
        id: 'SIN-PLN-20240108',
        satellite: 'Pléiades Neo 3',
        captureDate: '2024-01-08T03:20:15Z',
        cloudCover: 8,
        gsd: 0.3,
        thumbnail: 'https://example.skyfi.test/thumbnails/SIN-PLN-20240108.jpg',
        bbox: [103.7198, 1.2521, 103.9198, 1.4521],
        price: 1100.0,
      },
      {
        id: 'SIN-S2B-20231125',
        satellite: 'Sentinel-2B',
        captureDate: '2023-11-25T03:10:45Z',
        cloudCover: 22,
        gsd: 10,
        thumbnail: 'https://example.skyfi.test/thumbnails/SIN-S2B-20231125.jpg',
        bbox: [103.6198, 1.1521, 104.0198, 1.5521],
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
  result: LegacyArchiveResponse,
  params: ArchiveSearchFallbackParams
) => {
  const cloudLimit = params.maxCloudCoverage ?? params.maxCloudCover;
  const cloudCover = result.cloudCover ?? 0;
  if (typeof cloudLimit === 'number' && cloudCover > cloudLimit) {
    return false;
  }

  const minResolution = params.minResolution ?? params.resolution?.min;
  const resolution = result.gsd ?? 0;
  if (typeof minResolution === 'number' && resolution < minResolution) {
    return false;
  }

  if (
    !withinRange(resolution, params.resolution?.min, params.resolution?.max)
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

  const filtered = match.archives.filter((result) => matchesFilters(result, params));
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 10;
  const paged = filtered.slice(offset, offset + limit);

  // Convert legacy format to ArchiveResponse format
  const convertedArchives: ArchiveResponse[] = paged.map((legacy) => ({
    archiveId: legacy.id,
    provider: 'PLANET' as any, // Default provider for fallback data
    productType: 'DAY' as any,
    captureTimestamp: legacy.captureDate,
    cloudCoveragePercent: legacy.cloudCover,
    gsd: legacy.gsd,
    footprint: `POLYGON ((${legacy.bbox[0]} ${legacy.bbox[1]}, ${legacy.bbox[2]} ${legacy.bbox[1]}, ${legacy.bbox[2]} ${legacy.bbox[3]}, ${legacy.bbox[0]} ${legacy.bbox[3]}, ${legacy.bbox[0]} ${legacy.bbox[1]}))`,
    priceForOneSquareKm: legacy.price,
    thumbnailUrls: legacy.thumbnail ? { default: legacy.thumbnail } : undefined,
    metadata: {
      satellite: legacy.satellite,
      bbox: legacy.bbox,
    },
  }));

  return {
    request: params,
    archives: convertedArchives,
    results: convertedArchives, // For legacy compatibility
    total: filtered.length,
    limit,
    offset,
  };
};
