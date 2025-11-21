
/**
 * Convert GeoJSON Geometry to WKT (Well-Known Text) format
 */
export function geoJSONToWKT(geometry: any): string {
  if (!geometry || !geometry.type) {
    throw new Error('Invalid GeoJSON geometry');
  }

  switch (geometry.type) {
    case 'Point':
      return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
    
    case 'Polygon':
      return `POLYGON(${geometry.coordinates
        .map((ring: number[][]) => 
          `(${ring.map((coord) => `${coord[0]} ${coord[1]}`).join(',')})`
        )
        .join(',')})`;
      
    case 'MultiPolygon':
      return `MULTIPOLYGON(${geometry.coordinates
        .map((polygon: number[][][]) => 
          `(${polygon.map((ring) => 
            `(${ring.map((coord) => `${coord[0]} ${coord[1]}`).join(',')})`
          ).join(',')})`
        )
        .join(',')})`;

    default:
      throw new Error(`Unsupported geometry type for WKT conversion: ${geometry.type}`);
  }
}

