export type CoordinatePair = [number, number];

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
): { type: 'Polygon'; coordinates: CoordinatePair[][] } | undefined => {
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

