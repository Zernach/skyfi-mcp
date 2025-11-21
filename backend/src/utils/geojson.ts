export type CoordinatePair = [number, number];

export interface GeoJsonPolygon {
    type: 'Polygon';
    coordinates: CoordinatePair[][];
}

export interface ToolPolygonRingInput {
    role?: 'outer' | 'hole';
    points?: unknown[];
}

export interface ToolPolygonInput {
    type?: string;
    coordinates?: ToolPolygonRingInput[];
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const coerceNumber = (value: unknown): number | null => {
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const coerced = Number(value);
        return Number.isFinite(coerced) ? coerced : null;
    }
    return null;
};

const normalizeCoordinatePair = (value: unknown): CoordinatePair | null => {
    if (Array.isArray(value) && value.length >= 2) {
        const lon = coerceNumber(value[0]);
        const lat = coerceNumber(value[1]);
        if (lon !== null && lat !== null) {
            return [lon, lat];
        }
    }

    if (value && typeof value === 'object') {
        const maybeLon = coerceNumber((value as Record<string, unknown>).longitude);
        const maybeLat = coerceNumber((value as Record<string, unknown>).latitude);
        if (maybeLon !== null && maybeLat !== null) {
            return [maybeLon, maybeLat];
        }
    }

    return null;
};

const closeRingIfNeeded = (points: CoordinatePair[]): CoordinatePair[] => {
    if (points.length === 0) {
        return points;
    }

    const [firstLon, firstLat] = points[0];
    const [lastLon, lastLat] = points[points.length - 1];

    if (firstLon === lastLon && firstLat === lastLat) {
        return points;
    }

    return [...points, [firstLon, firstLat]];
};

const normalizeRing = (ring?: ToolPolygonRingInput): CoordinatePair[] | null => {
    if (!ring || !Array.isArray(ring.points)) {
        return null;
    }

    const normalizedPoints = ring.points
        .map(normalizeCoordinatePair)
        .filter((pair): pair is CoordinatePair => Boolean(pair));

    if (normalizedPoints.length < 4) {
        return null;
    }

    return closeRingIfNeeded(normalizedPoints);
};

const classifyRole = (role?: string): 'outer' | 'hole' | undefined => {
    if (!role) {
        return undefined;
    }

    const lower = role.trim().toLowerCase();
    if (lower === 'outer') {
        return 'outer';
    }
    if (lower === 'hole' || lower === 'inner') {
        return 'hole';
    }

    return undefined;
};

/**
 * Convert tool-provided polygon input into GeoJSON-compliant polygon coordinates.
 * Returns undefined when no valid rings are supplied.
 */
export const toGeoJsonPolygon = (
    polygon?: ToolPolygonInput | null
): GeoJsonPolygon | undefined => {
    if (!polygon || !Array.isArray(polygon.coordinates)) {
        return undefined;
    }

    const outerRings: CoordinatePair[][] = [];
    const holeRings: CoordinatePair[][] = [];

    for (const ringInput of polygon.coordinates) {
        const normalized = normalizeRing(ringInput);
        if (!normalized) {
            continue;
        }

        const role = classifyRole(ringInput?.role);

        if (role === 'hole') {
            holeRings.push(normalized);
            continue;
        }

        if (role === 'outer' || outerRings.length === 0) {
            outerRings.push(normalized);
        } else {
            holeRings.push(normalized);
        }
    }

    const coordinates = [...outerRings, ...holeRings];
    if (coordinates.length === 0) {
        return undefined;
    }

    return {
        type: 'Polygon',
        coordinates,
    };
};

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const ringAreaSqMeters = (ring: CoordinatePair[]): number => {
    if (ring.length < 3) {
        return 0;
    }

    let area = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];

        const lon1Rad = lon1 * DEG_TO_RAD;
        const lon2Rad = lon2 * DEG_TO_RAD;
        const lat1Rad = lat1 * DEG_TO_RAD;
        const lat2Rad = lat2 * DEG_TO_RAD;

        area += (lon2Rad - lon1Rad) * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad));
    }

    return (area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2;
};

/**
 * Calculate polygon area in square kilometers using spherical excess.
 */
export const calculatePolygonAreaSqKm = (polygon: GeoJsonPolygon): number => {
    if (!polygon.coordinates.length) {
        return 0;
    }

    const [outer, ...holes] = polygon.coordinates;

    const outerArea = Math.abs(ringAreaSqMeters(outer));
    const holesArea = holes.reduce((total, ring) => total + Math.abs(ringAreaSqMeters(ring)), 0);

    return (outerArea - holesArea) / 1_000_000;
};

const averageLatitudeRad = (ring: CoordinatePair[]): number => {
    if (!ring.length) {
        return 0;
    }

    const sum = ring.reduce((acc, [, lat]) => acc + lat, 0);
    return (sum / ring.length) * DEG_TO_RAD;
};

/**
 * Approximate polygon centroid (lon, lat) using planar projection.
 */
export const calculatePolygonCentroid = (polygon: GeoJsonPolygon): CoordinatePair | null => {
    if (!polygon.coordinates.length) {
        return null;
    }

    const outer = polygon.coordinates[0];
    if (outer.length < 3) {
        return null;
    }

    const referenceLatRad = averageLatitudeRad(outer);

    const project = (lon: number, lat: number): CoordinatePair => {
        const lonRad = lon * DEG_TO_RAD;
        const latRad = lat * DEG_TO_RAD;
        const x = lonRad * Math.cos(referenceLatRad);
        const y = latRad;
        return [x, y];
    };

    let area2 = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < outer.length - 1; i += 1) {
        const [lon1, lat1] = outer[i];
        const [lon2, lat2] = outer[i + 1];
        const [x1, y1] = project(lon1, lat1);
        const [x2, y2] = project(lon2, lat2);

        const cross = x1 * y2 - x2 * y1;
        area2 += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }

    if (area2 === 0) {
        const fallback = outer[0];
        return [fallback[0], fallback[1]];
    }

    const centroidX = cx / (3 * area2);
    const centroidY = cy / (3 * area2);

    const lonRad = centroidX / Math.cos(referenceLatRad);
    const latRad = centroidY;

    return [lonRad * RAD_TO_DEG, latRad * RAD_TO_DEG];
};

