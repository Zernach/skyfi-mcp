import {
  SATELLITE_CAPABILITIES,
  getSatelliteCapabilities,
  getActiveSatellites,
  filterSatellitesByResolution,
  filterSatellitesByType,
  recommendSatellites,
  compareSatellites,
} from '../src/integrations/skyfi/satellite-capabilities';

describe('Satellite Capabilities', () => {
  describe('SATELLITE_CAPABILITIES Database', () => {
    it('should have comprehensive satellite data', () => {
      expect(Object.keys(SATELLITE_CAPABILITIES).length).toBeGreaterThan(0);
    });

    it('should have WorldView-3 data', () => {
      const wv3 = SATELLITE_CAPABILITIES['WorldView-3'];
      
      expect(wv3).toBeDefined();
      expect(wv3.name).toBe('WorldView-3');
      expect(wv3.operator).toBe('Maxar Technologies');
      expect(wv3.status).toBe('active');
      expect(wv3.type).toBe('multispectral');
      expect(wv3.resolution.panchromatic).toBe(0.31);
      expect(wv3.resolution.multispectral).toBe(1.24);
      expect(wv3.spectralBands.length).toBeGreaterThan(0);
      expect(wv3.swathWidth).toBe(13.1);
      expect(wv3.revisitTime).toBe(1);
    });

    it('should have Sentinel-2A data', () => {
      const sentinel = SATELLITE_CAPABILITIES['Sentinel-2A'];
      
      expect(sentinel).toBeDefined();
      expect(sentinel.name).toBe('Sentinel-2A');
      expect(sentinel.operator).toBe('European Space Agency');
      expect(sentinel.status).toBe('active');
      expect(sentinel.type).toBe('multispectral');
      expect(sentinel.resolution.multispectral).toBe(10);
      expect(sentinel.spectralBands.length).toBe(13);
      expect(sentinel.pricing.archivePerKm2).toBe(0); // Free
      expect(sentinel.swathWidth).toBe(290);
      expect(sentinel.revisitTime).toBe(5);
    });

    it('should have Landsat 8 data', () => {
      const landsat = SATELLITE_CAPABILITIES['Landsat 8'];
      
      expect(landsat).toBeDefined();
      expect(landsat.name).toBe('Landsat 8');
      expect(landsat.operator).toBe('USGS/NASA');
      expect(landsat.status).toBe('active');
      expect(landsat.type).toBe('multispectral');
      expect(landsat.resolution.multispectral).toBe(30);
      expect(landsat.pricing.archivePerKm2).toBe(0); // Free
      expect(landsat.spectralBands.length).toBe(11);
    });

    it('should have Pléiades Neo satellites', () => {
      const neo3 = SATELLITE_CAPABILITIES['Pléiades Neo 3'];
      const neo4 = SATELLITE_CAPABILITIES['Pléiades Neo 4'];
      
      expect(neo3).toBeDefined();
      expect(neo4).toBeDefined();
      expect(neo3.resolution.panchromatic).toBe(0.30);
      expect(neo4.resolution.panchromatic).toBe(0.30);
      expect(neo3.revisitTime).toBe(1);
      expect(neo4.revisitTime).toBe(1);
    });
  });

  describe('getSatelliteCapabilities', () => {
    it('should return satellite by name', () => {
      const satellite = getSatelliteCapabilities('WorldView-3');
      
      expect(satellite).toBeDefined();
      expect(satellite?.name).toBe('WorldView-3');
      expect(satellite?.operator).toBe('Maxar Technologies');
    });

    it('should return undefined for non-existent satellite', () => {
      const satellite = getSatelliteCapabilities('NonExistent-Satellite');
      
      expect(satellite).toBeUndefined();
    });

    it('should return Sentinel-2B data', () => {
      const satellite = getSatelliteCapabilities('Sentinel-2B');
      
      expect(satellite).toBeDefined();
      expect(satellite?.name).toBe('Sentinel-2B');
      expect(satellite?.launchDate).toBe('2017-03-07');
    });
  });

  describe('getActiveSatellites', () => {
    it('should return only active satellites', () => {
      const active = getActiveSatellites();
      
      expect(active.length).toBeGreaterThan(0);
      active.forEach(sat => {
        expect(sat.status).toBe('active');
      });
    });

    it('should include major commercial satellites', () => {
      const active = getActiveSatellites();
      const names = active.map(sat => sat.name);
      
      expect(names).toContain('WorldView-3');
      expect(names).toContain('Sentinel-2A');
      expect(names).toContain('Landsat 8');
    });

    it('should return satellites with all required fields', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.name).toBeDefined();
        expect(sat.operator).toBeDefined();
        expect(sat.type).toBeDefined();
        expect(sat.resolution).toBeDefined();
        expect(sat.spectralBands).toBeDefined();
        expect(sat.swathWidth).toBeDefined();
        expect(sat.revisitTime).toBeDefined();
        expect(sat.orbit).toBeDefined();
        expect(sat.capabilities).toBeDefined();
        expect(sat.pricing).toBeDefined();
        expect(sat.idealFor).toBeDefined();
        expect(sat.limitations).toBeDefined();
      });
    });
  });

  describe('filterSatellitesByResolution', () => {
    it('should filter satellites by minimum resolution', () => {
      const filtered = filterSatellitesByResolution(1);
      
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(sat => {
        const res = sat.resolution.panchromatic || sat.resolution.multispectral || sat.resolution.sar;
        expect(res).toBeGreaterThanOrEqual(1);
      });
    });

    it('should filter satellites by maximum resolution', () => {
      const filtered = filterSatellitesByResolution(undefined, 10);
      
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(sat => {
        const res = sat.resolution.panchromatic || sat.resolution.multispectral || sat.resolution.sar;
        expect(res).toBeLessThanOrEqual(10);
      });
    });

    it('should filter satellites within resolution range', () => {
      const filtered = filterSatellitesByResolution(1, 15);
      
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(sat => {
        const res = sat.resolution.panchromatic || sat.resolution.multispectral || sat.resolution.sar;
        expect(res).toBeGreaterThanOrEqual(1);
        expect(res).toBeLessThanOrEqual(15);
      });
    });

    it('should return high-resolution satellites', () => {
      const filtered = filterSatellitesByResolution(undefined, 1);
      
      expect(filtered.length).toBeGreaterThan(0);
      const names = filtered.map(sat => sat.name);
      expect(names).toContain('WorldView-3'); // 0.31m panchromatic
    });

    it('should return medium-resolution satellites', () => {
      const filtered = filterSatellitesByResolution(5, 20);
      
      expect(filtered.length).toBeGreaterThan(0);
      const names = filtered.map(sat => sat.name);
      expect(names).toContain('Sentinel-2A'); // 10m multispectral
    });
  });

  describe('filterSatellitesByType', () => {
    it('should filter multispectral satellites', () => {
      const filtered = filterSatellitesByType('multispectral');
      
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(sat => {
        expect(sat.type).toBe('multispectral');
      });
    });

    it('should include major multispectral satellites', () => {
      const filtered = filterSatellitesByType('multispectral');
      const names = filtered.map(sat => sat.name);
      
      expect(names).toContain('WorldView-3');
      expect(names).toContain('Sentinel-2A');
      expect(names).toContain('Landsat 8');
    });

    it('should return empty array for non-existent type', () => {
      const filtered = filterSatellitesByType('non-existent-type');
      
      expect(filtered).toEqual([]);
    });
  });

  describe('recommendSatellites', () => {
    it('should recommend satellites for agriculture', () => {
      const recommendations = recommendSatellites('agriculture');
      
      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(sat => {
        expect(sat.idealFor.some(use => 
          use.toLowerCase().includes('agriculture')
        )).toBe(true);
      });
    });

    it('should recommend satellites for urban planning', () => {
      const recommendations = recommendSatellites('urban planning');
      
      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(sat => {
        expect(sat.idealFor.some(use => 
          use.toLowerCase().includes('urban')
        )).toBe(true);
      });
    });

    it('should recommend satellites for environmental monitoring', () => {
      const recommendations = recommendSatellites('environmental monitoring');
      
      expect(recommendations.length).toBeGreaterThan(0);
      const names = recommendations.map(sat => sat.name);
      expect(names).toContain('Sentinel-2A'); // Ideal for environmental monitoring
    });

    it('should sort by resolution priority', () => {
      const recommendations = recommendSatellites('urban', 'resolution');
      
      expect(recommendations.length).toBeGreaterThan(0);
      // Should be sorted by resolution (lower is better)
      for (let i = 0; i < recommendations.length - 1; i++) {
        const resA = recommendations[i].resolution.panchromatic || 
                     recommendations[i].resolution.multispectral || 1000;
        const resB = recommendations[i + 1].resolution.panchromatic || 
                     recommendations[i + 1].resolution.multispectral || 1000;
        expect(resA).toBeLessThanOrEqual(resB);
      }
    });

    it('should sort by cost priority', () => {
      const recommendations = recommendSatellites('agriculture', 'cost');
      
      expect(recommendations.length).toBeGreaterThan(0);
      // Should be sorted by cost (lower is better)
      for (let i = 0; i < recommendations.length - 1; i++) {
        const priceA = recommendations[i].pricing.archivePerKm2 || 0;
        const priceB = recommendations[i + 1].pricing.archivePerKm2 || 0;
        expect(priceA).toBeLessThanOrEqual(priceB);
      }
      
      // Free satellites should be first
      expect(recommendations[0].pricing.archivePerKm2).toBe(0);
    });

    it('should sort by coverage priority', () => {
      const recommendations = recommendSatellites('monitoring', 'coverage');
      
      expect(recommendations.length).toBeGreaterThan(0);
      // Should be sorted by swath width (larger is better)
      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].swathWidth).toBeGreaterThanOrEqual(
          recommendations[i + 1].swathWidth
        );
      }
    });

    it('should sort by availability priority', () => {
      const recommendations = recommendSatellites('monitoring', 'availability');
      
      expect(recommendations.length).toBeGreaterThan(0);
      // Should be sorted by revisit time (lower is better)
      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].revisitTime).toBeLessThanOrEqual(
          recommendations[i + 1].revisitTime
        );
      }
    });

    it('should return all satellites for non-matching use case', () => {
      const recommendations = recommendSatellites('non-existent-use-case');
      
      const allActive = getActiveSatellites();
      expect(recommendations.length).toBe(allActive.length);
    });
  });

  describe('compareSatellites', () => {
    it('should compare two satellites', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      expect(result.satellites).toHaveLength(2);
      expect(result.satellites[0].name).toBe('WorldView-3');
      expect(result.satellites[1].name).toBe('Sentinel-2A');
      
      expect(result.comparison.resolution).toBeDefined();
      expect(result.comparison.swathWidth).toBeDefined();
      expect(result.comparison.revisitTime).toBeDefined();
      expect(result.comparison.pricing).toBeDefined();
      expect(result.comparison.spectralBands).toBeDefined();
    });

    it('should compare multiple satellites', () => {
      const result = compareSatellites([
        'WorldView-3',
        'Sentinel-2A',
        'Landsat 8',
        'Pléiades Neo 3',
      ]);
      
      expect(result.satellites).toHaveLength(4);
      expect(result.comparison.resolution).toHaveProperty('WorldView-3');
      expect(result.comparison.resolution).toHaveProperty('Sentinel-2A');
      expect(result.comparison.resolution).toHaveProperty('Landsat 8');
      expect(result.comparison.resolution).toHaveProperty('Pléiades Neo 3');
    });

    it('should show resolution differences', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      expect(result.comparison.resolution['WorldView-3']).toEqual({
        panchromatic: 0.31,
        multispectral: 1.24,
      });
      expect(result.comparison.resolution['Sentinel-2A']).toEqual({
        multispectral: 10,
      });
    });

    it('should show pricing differences', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      const wv3Pricing = result.comparison.pricing['WorldView-3'];
      const s2aPricing = result.comparison.pricing['Sentinel-2A'];
      
      expect(wv3Pricing.archivePerKm2).toBeGreaterThan(0);
      expect(s2aPricing.archivePerKm2).toBe(0); // Free
    });

    it('should show swath width differences', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      expect(result.comparison.swathWidth['WorldView-3']).toBe(13.1);
      expect(result.comparison.swathWidth['Sentinel-2A']).toBe(290);
    });

    it('should show revisit time differences', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      expect(result.comparison.revisitTime['WorldView-3']).toBe(1);
      expect(result.comparison.revisitTime['Sentinel-2A']).toBe(5);
    });

    it('should show spectral band count differences', () => {
      const result = compareSatellites(['WorldView-3', 'Sentinel-2A']);
      
      expect(result.comparison.spectralBands['WorldView-3']).toBe(14);
      expect(result.comparison.spectralBands['Sentinel-2A']).toBe(13);
    });

    it('should filter out non-existent satellites', () => {
      const result = compareSatellites([
        'WorldView-3',
        'NonExistent-Satellite',
        'Sentinel-2A',
      ]);
      
      expect(result.satellites).toHaveLength(2);
      expect(result.satellites[0].name).toBe('WorldView-3');
      expect(result.satellites[1].name).toBe('Sentinel-2A');
    });

    it('should handle comparison with single satellite', () => {
      const result = compareSatellites(['WorldView-3']);
      
      expect(result.satellites).toHaveLength(1);
      expect(result.comparison.resolution).toHaveProperty('WorldView-3');
    });

    it('should handle empty satellite list', () => {
      const result = compareSatellites([]);
      
      expect(result.satellites).toHaveLength(0);
      expect(Object.keys(result.comparison.resolution)).toHaveLength(0);
    });
  });

  describe('Satellite Data Completeness', () => {
    it('should have complete spectral band information', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.spectralBands.length).toBeGreaterThan(0);
        sat.spectralBands.forEach(band => {
          expect(band.name).toBeDefined();
          expect(band.wavelength).toBeDefined();
          expect(band.description).toBeDefined();
        });
      });
    });

    it('should have complete orbit information', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.orbit.type).toBeDefined();
        expect(sat.orbit.altitude).toBeDefined();
        expect(typeof sat.orbit.altitude).toBe('number');
      });
    });

    it('should have complete capabilities list', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.capabilities.length).toBeGreaterThan(0);
        expect(Array.isArray(sat.capabilities)).toBe(true);
      });
    });

    it('should have complete ideal use cases', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.idealFor.length).toBeGreaterThan(0);
        expect(Array.isArray(sat.idealFor)).toBe(true);
      });
    });

    it('should have complete limitations list', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.limitations.length).toBeGreaterThan(0);
        expect(Array.isArray(sat.limitations)).toBe(true);
      });
    });

    it('should have valid launch dates', () => {
      const active = getActiveSatellites();
      
      active.forEach(sat => {
        expect(sat.launchDate).toBeDefined();
        const date = new Date(sat.launchDate);
        expect(date.getTime()).not.toBeNaN();
        expect(date.getFullYear()).toBeGreaterThan(2000);
        expect(date.getFullYear()).toBeLessThan(2030);
      });
    });
  });
});


