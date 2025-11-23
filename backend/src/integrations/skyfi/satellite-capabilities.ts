/**
 * Satellite Capabilities Reference Data
 * Comprehensive information about satellite constellations and their capabilities
 */

export interface SpectralBand {
  name: string;
  wavelength: string; // e.g., "450-520 nm"
  description: string;
}

export interface SatelliteCapability {
  name: string;
  operator: string;
  status: 'active' | 'inactive' | 'decommissioned';
  launchDate: string;
  type: 'optical' | 'sar' | 'multispectral' | 'hyperspectral';
  resolution: {
    panchromatic?: number; // meters
    multispectral?: number; // meters
    sar?: number; // meters
  };
  spectralBands: SpectralBand[];
  swathWidth: number; // km
  revisitTime: number; // days
  orbit: {
    type: string; // e.g., "Sun-synchronous"
    altitude: number; // km
  };
  capabilities: string[];
  pricing: {
    archivePerKm2?: number; // USD
    taskingPerKm2?: number; // USD
    minimumOrder?: number; // USD
  };
  idealFor: string[];
  limitations: string[];
}

/**
 * Comprehensive satellite capabilities database
 */
export const SATELLITE_CAPABILITIES: Record<string, SatelliteCapability> = {
  'WorldView-3': {
    name: 'WorldView-3',
    operator: 'Maxar Technologies',
    status: 'active',
    launchDate: '2014-08-13',
    type: 'multispectral',
    resolution: {
      panchromatic: 0.31,
      multispectral: 1.24,
    },
    spectralBands: [
      { name: 'Panchromatic', wavelength: '450-800 nm', description: 'High resolution grayscale' },
      { name: 'Blue', wavelength: '450-510 nm', description: 'Water penetration, vegetation' },
      { name: 'Green', wavelength: '510-580 nm', description: 'Vegetation peak reflectance' },
      { name: 'Red', wavelength: '630-690 nm', description: 'Vegetation discrimination' },
      { name: 'NIR1', wavelength: '770-895 nm', description: 'Vegetation health, water bodies' },
      { name: 'NIR2', wavelength: '860-1040 nm', description: 'Biomass, crop vigor' },
      { name: 'SWIR1', wavelength: '1195-1225 nm', description: 'Moisture content' },
      { name: 'SWIR2', wavelength: '1550-1590 nm', description: 'Vegetation moisture' },
      { name: 'SWIR3', wavelength: '1640-1680 nm', description: 'Snow/ice discrimination' },
      { name: 'SWIR4', wavelength: '1710-1750 nm', description: 'Vegetation stress' },
      { name: 'SWIR5', wavelength: '2145-2185 nm', description: 'Geology, soils' },
      { name: 'SWIR6', wavelength: '2185-2225 nm', description: 'Mineral mapping' },
      { name: 'SWIR7', wavelength: '2235-2285 nm', description: 'Hydrothermal mapping' },
      { name: 'SWIR8', wavelength: '2295-2365 nm', description: 'Alteration minerals' },
    ],
    swathWidth: 13.1,
    revisitTime: 1,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 617,
    },
    capabilities: [
      'Very high resolution',
      'SWIR imaging',
      'Atmospheric correction',
      'Cloud detection',
      'Change detection',
    ],
    pricing: {
      archivePerKm2: 20,
      taskingPerKm2: 40,
      minimumOrder: 100,
    },
    idealFor: [
      'Urban planning',
      'Infrastructure monitoring',
      'Agriculture',
      'Defense and intelligence',
      'Disaster response',
    ],
    limitations: [
      'Small swath width',
      'Weather dependent (optical)',
      'Premium pricing',
    ],
  },
  'WorldView-2': {
    name: 'WorldView-2',
    operator: 'Maxar Technologies',
    status: 'active',
    launchDate: '2009-10-08',
    type: 'multispectral',
    resolution: {
      panchromatic: 0.46,
      multispectral: 1.84,
    },
    spectralBands: [
      { name: 'Panchromatic', wavelength: '450-800 nm', description: 'High resolution grayscale' },
      { name: 'Coastal Blue', wavelength: '400-450 nm', description: 'Water penetration' },
      { name: 'Blue', wavelength: '450-510 nm', description: 'Water bodies' },
      { name: 'Green', wavelength: '510-580 nm', description: 'Vegetation' },
      { name: 'Yellow', wavelength: '585-625 nm', description: 'Vegetation stress' },
      { name: 'Red', wavelength: '630-690 nm', description: 'Vegetation discrimination' },
      { name: 'Red Edge', wavelength: '705-745 nm', description: 'Vegetation health' },
      { name: 'NIR1', wavelength: '770-895 nm', description: 'Biomass' },
      { name: 'NIR2', wavelength: '860-1040 nm', description: 'Vegetation vigor' },
    ],
    swathWidth: 16.4,
    revisitTime: 1.1,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 770,
    },
    capabilities: [
      'High resolution',
      '8-band multispectral',
      'Stereo imaging',
      'Change detection',
    ],
    pricing: {
      archivePerKm2: 15,
      taskingPerKm2: 30,
      minimumOrder: 100,
    },
    idealFor: [
      'Agriculture',
      'Environmental monitoring',
      'Urban planning',
      'Coastal management',
    ],
    limitations: [
      'Weather dependent',
      'No SWIR bands',
    ],
  },
  'Sentinel-2A': {
    name: 'Sentinel-2A',
    operator: 'European Space Agency',
    status: 'active',
    launchDate: '2015-06-23',
    type: 'multispectral',
    resolution: {
      multispectral: 10,
    },
    spectralBands: [
      { name: 'B1 - Coastal aerosol', wavelength: '433-453 nm', description: 'Aerosol detection' },
      { name: 'B2 - Blue', wavelength: '458-523 nm', description: 'Water bodies' },
      { name: 'B3 - Green', wavelength: '543-578 nm', description: 'Vegetation' },
      { name: 'B4 - Red', wavelength: '650-680 nm', description: 'Vegetation discrimination' },
      { name: 'B5 - Red Edge 1', wavelength: '698-713 nm', description: 'Vegetation classification' },
      { name: 'B6 - Red Edge 2', wavelength: '733-748 nm', description: 'Vegetation health' },
      { name: 'B7 - Red Edge 3', wavelength: '773-793 nm', description: 'Vegetation analysis' },
      { name: 'B8 - NIR', wavelength: '785-900 nm', description: 'Biomass, water bodies' },
      { name: 'B8A - NIR narrow', wavelength: '855-875 nm', description: 'Vegetation monitoring' },
      { name: 'B9 - Water vapour', wavelength: '935-955 nm', description: 'Atmospheric correction' },
      { name: 'B10 - SWIR Cirrus', wavelength: '1360-1390 nm', description: 'Cirrus cloud detection' },
      { name: 'B11 - SWIR 1', wavelength: '1565-1655 nm', description: 'Snow/ice/cloud discrimination' },
      { name: 'B12 - SWIR 2', wavelength: '2100-2280 nm', description: 'Soil/vegetation moisture' },
    ],
    swathWidth: 290,
    revisitTime: 5,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 786,
    },
    capabilities: [
      'Free and open data',
      'Wide swath',
      'Frequent revisit',
      '13 spectral bands',
      'Cloud masking',
    ],
    pricing: {
      archivePerKm2: 0, // Free
      minimumOrder: 0,
    },
    idealFor: [
      'Agriculture',
      'Forestry',
      'Land cover mapping',
      'Environmental monitoring',
      'Change detection',
      'Research',
    ],
    limitations: [
      'Lower resolution than commercial',
      'Weather dependent',
    ],
  },
  'Sentinel-2B': {
    name: 'Sentinel-2B',
    operator: 'European Space Agency',
    status: 'active',
    launchDate: '2017-03-07',
    type: 'multispectral',
    resolution: {
      multispectral: 10,
    },
    spectralBands: [
      { name: 'B1 - Coastal aerosol', wavelength: '433-453 nm', description: 'Aerosol detection' },
      { name: 'B2 - Blue', wavelength: '458-523 nm', description: 'Water bodies' },
      { name: 'B3 - Green', wavelength: '543-578 nm', description: 'Vegetation' },
      { name: 'B4 - Red', wavelength: '650-680 nm', description: 'Vegetation discrimination' },
      { name: 'B5 - Red Edge 1', wavelength: '698-713 nm', description: 'Vegetation classification' },
      { name: 'B6 - Red Edge 2', wavelength: '733-748 nm', description: 'Vegetation health' },
      { name: 'B7 - Red Edge 3', wavelength: '773-793 nm', description: 'Vegetation analysis' },
      { name: 'B8 - NIR', wavelength: '785-900 nm', description: 'Biomass, water bodies' },
      { name: 'B8A - NIR narrow', wavelength: '855-875 nm', description: 'Vegetation monitoring' },
      { name: 'B9 - Water vapour', wavelength: '935-955 nm', description: 'Atmospheric correction' },
      { name: 'B10 - SWIR Cirrus', wavelength: '1360-1390 nm', description: 'Cirrus cloud detection' },
      { name: 'B11 - SWIR 1', wavelength: '1565-1655 nm', description: 'Snow/ice/cloud discrimination' },
      { name: 'B12 - SWIR 2', wavelength: '2100-2280 nm', description: 'Soil/vegetation moisture' },
    ],
    swathWidth: 290,
    revisitTime: 5,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 786,
    },
    capabilities: [
      'Free and open data',
      'Wide swath',
      'Frequent revisit',
      '13 spectral bands',
      'Cloud masking',
    ],
    pricing: {
      archivePerKm2: 0, // Free
      minimumOrder: 0,
    },
    idealFor: [
      'Agriculture',
      'Forestry',
      'Land cover mapping',
      'Environmental monitoring',
      'Change detection',
      'Research',
    ],
    limitations: [
      'Lower resolution than commercial',
      'Weather dependent',
    ],
  },
  'Pléiades Neo 3': {
    name: 'Pléiades Neo 3',
    operator: 'Airbus Defence and Space',
    status: 'active',
    launchDate: '2021-04-28',
    type: 'multispectral',
    resolution: {
      panchromatic: 0.30,
      multispectral: 1.20,
    },
    spectralBands: [
      { name: 'Panchromatic', wavelength: '450-800 nm', description: 'High resolution grayscale' },
      { name: 'Blue', wavelength: '450-520 nm', description: 'Water penetration' },
      { name: 'Green', wavelength: '530-590 nm', description: 'Vegetation peak reflectance' },
      { name: 'Red', wavelength: '625-695 nm', description: 'Vegetation discrimination' },
      { name: 'NIR', wavelength: '760-890 nm', description: 'Vegetation health, water bodies' },
      { name: 'Red Edge', wavelength: '700-750 nm', description: 'Vegetation stress' },
      { name: 'Deep Blue', wavelength: '400-450 nm', description: 'Coastal/water applications' },
    ],
    swathWidth: 14,
    revisitTime: 1,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 620,
    },
    capabilities: [
      'Very high resolution',
      'Daily revisit',
      'Tri-stereo capability',
      'In-flight radiometric calibration',
    ],
    pricing: {
      archivePerKm2: 18,
      taskingPerKm2: 35,
      minimumOrder: 100,
    },
    idealFor: [
      'Urban mapping',
      'Defense',
      'Precision agriculture',
      '3D modeling',
      'Change detection',
    ],
    limitations: [
      'Weather dependent',
      'Premium pricing',
    ],
  },
  'Pléiades Neo 4': {
    name: 'Pléiades Neo 4',
    operator: 'Airbus Defence and Space',
    status: 'active',
    launchDate: '2021-08-16',
    type: 'multispectral',
    resolution: {
      panchromatic: 0.30,
      multispectral: 1.20,
    },
    spectralBands: [
      { name: 'Panchromatic', wavelength: '450-800 nm', description: 'High resolution grayscale' },
      { name: 'Blue', wavelength: '450-520 nm', description: 'Water penetration' },
      { name: 'Green', wavelength: '530-590 nm', description: 'Vegetation peak reflectance' },
      { name: 'Red', wavelength: '625-695 nm', description: 'Vegetation discrimination' },
      { name: 'NIR', wavelength: '760-890 nm', description: 'Vegetation health, water bodies' },
      { name: 'Red Edge', wavelength: '700-750 nm', description: 'Vegetation stress' },
      { name: 'Deep Blue', wavelength: '400-450 nm', description: 'Coastal/water applications' },
    ],
    swathWidth: 14,
    revisitTime: 1,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 620,
    },
    capabilities: [
      'Very high resolution',
      'Daily revisit',
      'Tri-stereo capability',
      'In-flight radiometric calibration',
    ],
    pricing: {
      archivePerKm2: 18,
      taskingPerKm2: 35,
      minimumOrder: 100,
    },
    idealFor: [
      'Urban mapping',
      'Defense',
      'Precision agriculture',
      '3D modeling',
      'Change detection',
    ],
    limitations: [
      'Weather dependent',
      'Premium pricing',
    ],
  },
  'Landsat 8': {
    name: 'Landsat 8',
    operator: 'USGS/NASA',
    status: 'active',
    launchDate: '2013-02-11',
    type: 'multispectral',
    resolution: {
      multispectral: 30,
      panchromatic: 15,
    },
    spectralBands: [
      { name: 'Band 1 - Coastal/Aerosol', wavelength: '433-453 nm', description: 'Coastal and aerosol studies' },
      { name: 'Band 2 - Blue', wavelength: '450-515 nm', description: 'Bathymetric mapping' },
      { name: 'Band 3 - Green', wavelength: '525-600 nm', description: 'Vegetation peak' },
      { name: 'Band 4 - Red', wavelength: '630-680 nm', description: 'Vegetation discrimination' },
      { name: 'Band 5 - NIR', wavelength: '845-885 nm', description: 'Biomass, shorelines' },
      { name: 'Band 6 - SWIR 1', wavelength: '1560-1660 nm', description: 'Cloud penetration' },
      { name: 'Band 7 - SWIR 2', wavelength: '2100-2300 nm', description: 'Geology, soils' },
      { name: 'Band 8 - Panchromatic', wavelength: '500-680 nm', description: 'Image sharpening' },
      { name: 'Band 9 - Cirrus', wavelength: '1360-1390 nm', description: 'Cloud detection' },
      { name: 'Band 10 - TIRS 1', wavelength: '10.6-11.2 µm', description: 'Thermal mapping' },
      { name: 'Band 11 - TIRS 2', wavelength: '11.5-12.5 µm', description: 'Thermal mapping' },
    ],
    swathWidth: 185,
    revisitTime: 16,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 705,
    },
    capabilities: [
      'Free and open data',
      'Long-term archive (since 1972)',
      'Thermal bands',
      'Global coverage',
    ],
    pricing: {
      archivePerKm2: 0, // Free
      minimumOrder: 0,
    },
    idealFor: [
      'Land cover classification',
      'Agriculture',
      'Water resources',
      'Climate studies',
      'Long-term change detection',
    ],
    limitations: [
      'Lower resolution',
      '16-day revisit',
      'Weather dependent',
    ],
  },
  'Landsat 9': {
    name: 'Landsat 9',
    operator: 'USGS/NASA',
    status: 'active',
    launchDate: '2021-09-27',
    type: 'multispectral',
    resolution: {
      multispectral: 30,
      panchromatic: 15,
    },
    spectralBands: [
      { name: 'Band 1 - Coastal/Aerosol', wavelength: '433-453 nm', description: 'Coastal and aerosol studies' },
      { name: 'Band 2 - Blue', wavelength: '450-515 nm', description: 'Bathymetric mapping' },
      { name: 'Band 3 - Green', wavelength: '525-600 nm', description: 'Vegetation peak' },
      { name: 'Band 4 - Red', wavelength: '630-680 nm', description: 'Vegetation discrimination' },
      { name: 'Band 5 - NIR', wavelength: '845-885 nm', description: 'Biomass, shorelines' },
      { name: 'Band 6 - SWIR 1', wavelength: '1560-1660 nm', description: 'Cloud penetration' },
      { name: 'Band 7 - SWIR 2', wavelength: '2100-2300 nm', description: 'Geology, soils' },
      { name: 'Band 8 - Panchromatic', wavelength: '500-680 nm', description: 'Image sharpening' },
      { name: 'Band 9 - Cirrus', wavelength: '1360-1390 nm', description: 'Cloud detection' },
      { name: 'Band 10 - TIRS 1', wavelength: '10.3-11.3 µm', description: 'Thermal mapping' },
      { name: 'Band 11 - TIRS 2', wavelength: '11.5-12.5 µm', description: 'Thermal mapping' },
    ],
    swathWidth: 185,
    revisitTime: 16,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 705,
    },
    capabilities: [
      'Free and open data',
      'Improved radiometric resolution',
      'Thermal bands',
      'Global coverage',
    ],
    pricing: {
      archivePerKm2: 0, // Free
      minimumOrder: 0,
    },
    idealFor: [
      'Land cover classification',
      'Agriculture',
      'Water resources',
      'Climate studies',
      'Long-term change detection',
    ],
    limitations: [
      'Lower resolution',
      '16-day revisit',
      'Weather dependent',
    ],
  },
  'SPOT-6': {
    name: 'SPOT-6',
    operator: 'Airbus Defence and Space',
    status: 'active',
    launchDate: '2012-09-09',
    type: 'multispectral',
    resolution: {
      panchromatic: 1.5,
      multispectral: 6,
    },
    spectralBands: [
      { name: 'Panchromatic', wavelength: '450-745 nm', description: 'High resolution grayscale' },
      { name: 'Blue', wavelength: '450-520 nm', description: 'Water bodies' },
      { name: 'Green', wavelength: '530-590 nm', description: 'Vegetation' },
      { name: 'Red', wavelength: '625-695 nm', description: 'Vegetation discrimination' },
      { name: 'NIR', wavelength: '760-890 nm', description: 'Vegetation health' },
    ],
    swathWidth: 60,
    revisitTime: 3,
    orbit: {
      type: 'Sun-synchronous',
      altitude: 694,
    },
    capabilities: [
      'Wide swath',
      'Fast revisit',
      'Stereo imaging',
      'Large area coverage',
    ],
    pricing: {
      archivePerKm2: 3,
      taskingPerKm2: 8,
      minimumOrder: 50,
    },
    idealFor: [
      'Regional mapping',
      'Agriculture',
      'Forestry',
      'Urban planning',
      'Land cover mapping',
    ],
    limitations: [
      'Medium resolution',
      'Weather dependent',
    ],
  },
};

/**
 * Get satellite capabilities by name
 */
export function getSatelliteCapabilities(satelliteName: string): SatelliteCapability | undefined {
  return SATELLITE_CAPABILITIES[satelliteName];
}

/**
 * Get all active satellites
 */
export function getActiveSatellites(): SatelliteCapability[] {
  return Object.values(SATELLITE_CAPABILITIES).filter(sat => sat.status === 'active');
}

/**
 * Filter satellites by resolution
 */
export function filterSatellitesByResolution(
  minResolution?: number,
  maxResolution?: number
): SatelliteCapability[] {
  return getActiveSatellites().filter(sat => {
    const resolution = sat.resolution.panchromatic || sat.resolution.multispectral || sat.resolution.sar;
    if (!resolution) return false;
    if (minResolution && resolution < minResolution) return false;
    if (maxResolution && resolution > maxResolution) return false;
    return true;
  });
}

/**
 * Filter satellites by type
 */
export function filterSatellitesByType(type: string): SatelliteCapability[] {
  return getActiveSatellites().filter(sat => sat.type === type);
}

/**
 * Get satellite recommendations based on use case
 */
export function recommendSatellites(useCase: string, priority: string = 'balanced'): SatelliteCapability[] {
  const satellites = getActiveSatellites();
  
  // Filter by use case
  let filtered = satellites.filter(sat => 
    sat.idealFor.some(ideal => ideal.toLowerCase().includes(useCase.toLowerCase()))
  );
  
  // If no specific matches, return all
  if (filtered.length === 0) {
    filtered = satellites;
  }
  
  // Sort by priority
  switch (priority) {
    case 'resolution':
      filtered.sort((a, b) => {
        const resA = a.resolution.panchromatic || a.resolution.multispectral || 1000;
        const resB = b.resolution.panchromatic || b.resolution.multispectral || 1000;
        return resA - resB;
      });
      break;
    case 'cost':
      filtered.sort((a, b) => {
        const priceA = a.pricing.archivePerKm2 || 0;
        const priceB = b.pricing.archivePerKm2 || 0;
        return priceA - priceB;
      });
      break;
    case 'coverage':
      filtered.sort((a, b) => b.swathWidth - a.swathWidth);
      break;
    case 'availability':
      filtered.sort((a, b) => a.revisitTime - b.revisitTime);
      break;
  }
  
  return filtered;
}

/**
 * Compare multiple satellites
 */
export function compareSatellites(satelliteNames: string[]): {
  satellites: SatelliteCapability[];
  comparison: Record<string, any>;
} {
  const satellites = satelliteNames
    .map(name => SATELLITE_CAPABILITIES[name])
    .filter(Boolean);
    
  const comparison: Record<string, any> = {
    resolution: {},
    swathWidth: {},
    revisitTime: {},
    pricing: {},
    spectralBands: {},
  };
  
  satellites.forEach(sat => {
    comparison.resolution[sat.name] = sat.resolution;
    comparison.swathWidth[sat.name] = sat.swathWidth;
    comparison.revisitTime[sat.name] = sat.revisitTime;
    comparison.pricing[sat.name] = sat.pricing;
    comparison.spectralBands[sat.name] = sat.spectralBands.length;
  });
  
  return { satellites, comparison };
}


