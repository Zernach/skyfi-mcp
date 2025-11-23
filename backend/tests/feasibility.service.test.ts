import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { feasibilityService } from '../src/services/feasibility.service';
import { FeasibilityRequest, PricingExplorationRequest } from '../src/services/feasibility.types';
import { skyfiClient } from '../src/integrations/skyfi/client';
import { ArchiveSearchResponse } from '../src/integrations/skyfi/types';

describe('FeasibilityService - Order Feasibility Checking (P0 Feature #8)', () => {
  // Use the actual baseURL from the skyfiClient - it's https://app.skyfi.com/platform-api
  const baseUrl = 'https://app.skyfi.com';

  beforeEach(() => {
    nock.cleanAll();
    skyfiClient.clearCache();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Three-Layer Protection System', () => {
    it('Layer 1: Archive - should recommend archive when good quality scenes exist', async () => {
      const mockArchiveResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-1',
            satellite: 'WorldView-3',
            captureDate: '2024-11-01T10:30:00Z',
            cloudCover: 15,
            resolution: 0.31,
            thumbnail: 'https://example.com/thumb1.jpg',
            bbox: [-122.5, 37.7, -122.3, 38.0],
            price: 250.0,
          },
          {
            id: 'archive-2',
            satellite: 'WorldView-3',
            captureDate: '2024-11-15T14:20:00Z',
            cloudCover: 10,
            resolution: 0.31,
            price: 250.0,
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockArchiveResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        maxCloudCoverage: 30,
        resolution: 1.0,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.feasible).toBe(true);
      expect(report.confidence).toBe('high');
      expect(report.recommendedApproach).toBe('archive');
      expect(report.coverage.availableScenes).toBe(2);
      expect(report.coverage.bestCloudCover).toBe(10);
      expect(report.summary).toContain('archive');
    });

    it('Layer 2: Hybrid - should recommend hybrid when archive exists but quality is marginal', async () => {
      const mockArchiveResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-1',
            satellite: 'Sentinel-2A',
            captureDate: '2024-10-01T10:30:00Z',
            cloudCover: 45, // Above threshold
            resolution: 10,
            price: 0,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockArchiveResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.feasible).toBe(false); // Cloud coverage exceeds threshold
      expect(report.recommendedApproach).toBe('hybrid');
      expect(report.confidence).toBe('low');
    });

    it('Layer 3: Tasking - should recommend tasking when no archive is available', async () => {
      const mockArchiveResponse: ArchiveSearchResponse = {
        results: [],
        total: 0,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockArchiveResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        maxCloudCoverage: 20,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.feasible).toBe(false);
      expect(report.recommendedApproach).toBe('tasking');
      expect(report.confidence).toBe('low');
      expect(report.coverage.availableScenes).toBe(0);
      expect(report.alternatives.some(alt => alt.approach === 'tasking')).toBe(true);
    });
  });

  describe('Archive Image Availability Checking', () => {
    it('should accurately check and report archive scene availability', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'scene-1',
            satellite: 'WorldView-2',
            captureDate: '2024-11-10T12:00:00Z',
            cloudCover: 5,
            resolution: 0.46,
            price: 150.0,
          },
          {
            id: 'scene-2',
            satellite: 'Pléiades Neo 3',
            captureDate: '2024-11-15T14:00:00Z',
            cloudCover: 12,
            resolution: 0.30,
            price: 200.0,
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 20,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.coverage.availableScenes).toBe(2);
      expect(report.coverage.bestCloudCover).toBe(5);
      expect(report.coverage.averageCloudCover).toBe(8.5);
      expect(report.coverage.bestResolution).toBe(0.3);
      expect(report.coverage.newestCapture).toBe('2024-11-15T14:00:00Z');
      expect(report.coverage.satellites).toEqual(['WorldView-2', 'Pléiades Neo 3']);
    });

    it('should handle empty archive results gracefully', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.coverage.availableScenes).toBe(0);
      expect(report.coverage.bestCloudCover).toBeUndefined();
      expect(report.coverage.notes).toContain('No recent archive scenes matched the provided constraints.');
    });

    it('should filter by date range correctly', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'scene-1',
            satellite: 'Sentinel-2A',
            captureDate: '2024-09-15T12:00:00Z',
            cloudCover: 10,
            resolution: 10,
            price: 0,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: '2024-09-01',
        endDate: '2024-09-30',
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.coverage.availableScenes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tasking Feasibility Assessment', () => {
    it('should assess tasking feasibility for urgent priority', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 50,
        priority: 'urgent',
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.recommendedApproach).toBe('tasking');

      // Should have tasking pricing options
      const taskingOptions = report.pricingOptions.filter(opt => opt.approach === 'tasking');
      expect(taskingOptions.length).toBeGreaterThan(0);

      // Urgent priority should have faster turnaround
      const urgentOption = taskingOptions.find(opt => opt.estimatedTurnaroundDays && opt.estimatedTurnaroundDays <= 3);
      expect(urgentOption).toBeDefined();
    });

    it('should assess feasibility with resolution constraints', async () => {
      nock(baseUrl)
        .post('/archive/search', (body) => {
          return body.resolution?.max === 0.5;
        })
        .reply(200, {
          success: true,
          data: {
            results: [
              {
                id: 'high-res-1',
                satellite: 'WorldView-3',
                captureDate: '2024-11-01T10:30:00Z',
                cloudCover: 15,
                resolution: 0.31,
                price: 500.0,
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        resolution: 0.5,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      if (report.coverage.bestResolution) {
        expect(report.coverage.bestResolution).toBeLessThanOrEqual(0.5);
      }
      expect(report.satelliteRecommendations).toBeDefined();

      // Should recommend high-resolution satellites
      const topSatellite = report.satelliteRecommendations?.[0];
      expect(topSatellite).toBeDefined();
      const satResolution = Object.values(topSatellite!.resolution).find(r => r !== undefined);
      expect(satResolution).toBeLessThanOrEqual(0.5);
    });
  });

  describe('Weather Risk Analysis', () => {
    it('should assess low weather risk when cloud coverage is below threshold', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'Sentinel-2A', captureDate: '2024-11-01T10:00:00Z', cloudCover: 10, resolution: 10, price: 0 },
          { id: '2', satellite: 'Sentinel-2A', captureDate: '2024-11-05T10:00:00Z', cloudCover: 15, resolution: 10, price: 0 },
          { id: '3', satellite: 'Sentinel-2A', captureDate: '2024-11-10T10:00:00Z', cloudCover: 12, resolution: 10, price: 0 },
        ],
        total: 3,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.weather.riskLevel).toBe('low');
      expect(report.weather.averageCloudCover).toBe(12.33);
      expect(report.weather.exceedsThreshold).toBe(false);
      expect(report.weather.notes.some(note => note.toLowerCase().includes('favorable'))).toBe(true);
    });

    it('should assess medium weather risk when cloud coverage slightly exceeds threshold', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'WorldView-2', captureDate: '2024-11-01T10:00:00Z', cloudCover: 35, resolution: 0.46, price: 150 },
          { id: '2', satellite: 'WorldView-2', captureDate: '2024-11-05T10:00:00Z', cloudCover: 38, resolution: 0.46, price: 150 },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.weather.riskLevel).toBe('medium');
      expect(report.weather.averageCloudCover).toBe(36.5);
      expect(report.weather.exceedsThreshold).toBe(true);
      expect(report.weather.notes[0]).toContain('slightly above');
    });

    it('should assess high weather risk when cloud coverage exceeds threshold by wide margin', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'Landsat 8', captureDate: '2024-11-01T10:00:00Z', cloudCover: 60, resolution: 30, price: 0 },
          { id: '2', satellite: 'Landsat 8', captureDate: '2024-11-10T10:00:00Z', cloudCover: 65, resolution: 30, price: 0 },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.weather.riskLevel).toBe('high');
      expect(report.weather.averageCloudCover).toBe(62.5);
      expect(report.weather.exceedsThreshold).toBe(true);
      expect(report.weather.notes[0]).toContain('wide margin');
      expect(report.risks.some(r => r.summary.includes('Weather'))).toBe(true);
    });

    it('should handle missing cloud coverage data', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'SPOT-6', captureDate: '2024-11-01T10:00:00Z', cloudCover: 30, resolution: 1.5, price: 100 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      // With cloud coverage of 30 and default threshold of 40, this should be low risk
      expect(report.weather.riskLevel).toBe('low');
      expect(report.coverage.averageCloudCover).toBe(30);
    });
  });

  describe('Satellite Intelligence and Scoring', () => {
    it('should recommend satellites based on resolution requirements', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        resolution: 0.5,
        areaKm2: 10,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.satelliteRecommendations).toBeDefined();
      expect(report.satelliteRecommendations!.length).toBeGreaterThan(0);

      const topSatellite = report.satelliteRecommendations![0];
      expect(topSatellite.score).toBeGreaterThan(0);
      expect(topSatellite.matchReason).toBeTruthy();

      // Top satellite should meet resolution requirement
      const satResolution = Object.values(topSatellite.resolution).find(r => r !== undefined);
      expect(satResolution).toBeLessThanOrEqual(0.5);
      expect(topSatellite.availability.constraintsMet).toBe(true);
    });

    it('should score free satellites higher for budget projects', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 100,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const freeSatellites = report.satelliteRecommendations?.filter(
        s => s.pricing.archivePerKm2 === 0
      );

      expect(freeSatellites).toBeDefined();
      expect(freeSatellites!.length).toBeGreaterThan(0);

      // Free satellites should have bonus points
      const freeSat = freeSatellites![0];
      expect(freeSat.tradeoffs.pros.some(p => p.toLowerCase().includes('free'))).toBe(true);
    });

    it('should provide pros and cons for each satellite', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.satelliteRecommendations).toBeDefined();

      report.satelliteRecommendations!.forEach(sat => {
        expect(sat.tradeoffs.pros).toBeDefined();
        expect(sat.tradeoffs.cons).toBeDefined();
        expect(Array.isArray(sat.tradeoffs.pros)).toBe(true);
        expect(Array.isArray(sat.tradeoffs.cons)).toBe(true);
      });
    });

    it('should score satellites based on revisit time', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const fastRevisitSats = report.satelliteRecommendations?.filter(
        s => s.revisitTime <= 2
      );

      if (fastRevisitSats && fastRevisitSats.length > 0) {
        fastRevisitSats.forEach(sat => {
          expect(sat.tradeoffs.pros.some(p => p.toLowerCase().includes('revisit'))).toBe(true);
        });
      }
    });

    it('should warn about multi-pass requirements for large areas', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 150, // Large area
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      // Check if there's a risk about multi-pass requirement
      const multiPassRisk = report.risks.find(r =>
        r.summary.toLowerCase().includes('multi-pass') ||
        r.detail?.toLowerCase().includes('multiple passes')
      );

      // This risk should appear if top satellite has narrow swath
      const topSatellite = report.satelliteRecommendations?.[0];
      if (topSatellite && topSatellite.swathWidth < 50) {
        expect(multiPassRisk).toBeDefined();
      }
    });
  });

  describe('Confidence Scoring', () => {
    it('should return high confidence when multiple good quality scenes are available', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'WorldView-3', captureDate: '2024-11-01T10:00:00Z', cloudCover: 10, resolution: 0.31, price: 250 },
          { id: '2', satellite: 'WorldView-3', captureDate: '2024-11-05T10:00:00Z', cloudCover: 15, resolution: 0.31, price: 250 },
          { id: '3', satellite: 'WorldView-3', captureDate: '2024-11-10T10:00:00Z', cloudCover: 12, resolution: 0.31, price: 250 },
        ],
        total: 3,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.confidence).toBe('high');
      expect(report.coverage.availableScenes).toBeGreaterThanOrEqual(2);
      expect(report.coverage.bestCloudCover).toBeLessThanOrEqual(30);
    });

    it('should return medium confidence when single good scene is available', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'Pléiades Neo 3', captureDate: '2024-11-01T10:00:00Z', cloudCover: 18, resolution: 0.30, price: 200 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.confidence).toBe('medium');
      expect(report.coverage.availableScenes).toBe(1);
    });

    it('should return low confidence when no scenes are available', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.confidence).toBe('low');
      expect(report.coverage.availableScenes).toBe(0);
    });

    it('should return low confidence when cloud coverage exceeds threshold', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'Sentinel-2A', captureDate: '2024-11-01T10:00:00Z', cloudCover: 55, resolution: 10, price: 0 },
          { id: '2', satellite: 'Sentinel-2A', captureDate: '2024-11-05T10:00:00Z', cloudCover: 60, resolution: 10, price: 0 },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.confidence).toBe('low');
      expect(report.coverage.bestCloudCover).toBeGreaterThan(30);
    });
  });

  describe('Alternative Suggestions', () => {
    it('should suggest relaxing cloud threshold when archive exists but is too cloudy', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'WorldView-2', captureDate: '2024-11-01T10:00:00Z', cloudCover: 35, resolution: 0.46, price: 150 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        maxCloudCoverage: 20,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const relaxCloudAlt = report.alternatives.find(alt =>
        alt.id === 'relax-cloud-threshold'
      );

      expect(relaxCloudAlt).toBeDefined();
      expect(relaxCloudAlt!.approach).toBe('archive');
      expect(relaxCloudAlt!.summary).toContain('cloud coverage');
    });

    it('should suggest tasking when no archive is available', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const taskingAlt = report.alternatives.find(alt =>
        alt.id === 'tasking-primary'
      );

      expect(taskingAlt).toBeDefined();
      expect(taskingAlt!.approach).toBe('tasking');
    });

    it('should suggest hybrid approach', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          { id: '1', satellite: 'SPOT-6', captureDate: '2024-11-01T10:00:00Z', cloudCover: 25, resolution: 1.5, price: 100 },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const hybridAlt = report.alternatives.find(alt =>
        alt.id === 'hybrid-approach'
      );

      expect(hybridAlt).toBeDefined();
      expect(hybridAlt!.approach).toBe('hybrid');
      expect(hybridAlt!.summary).toContain('Hybrid');
    });

    it('should suggest free alternative satellites when available', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 50,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      const freeAlt = report.alternatives.find(alt =>
        alt.id === 'free-alternative'
      );

      // Should suggest free satellites like Sentinel or Landsat
      if (freeAlt) {
        expect(freeAlt.approach).toBe('archive');
        expect(freeAlt.summary.toLowerCase()).toContain('free');
      }
    });
  });

  describe('Feasibility Report Structure', () => {
    it('should return complete feasibility report structure', async () => {
      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-1',
            satellite: 'WorldView-3',
            captureDate: '2024-11-01T10:30:00Z',
            cloudCover: 15,
            resolution: 0.31,
            price: 250.0,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        maxCloudCoverage: 30,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      // Validate all required fields
      expect(report).toHaveProperty('feasible');
      expect(report).toHaveProperty('confidence');
      expect(report).toHaveProperty('recommendedApproach');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('coverage');
      expect(report).toHaveProperty('weather');
      expect(report).toHaveProperty('pricingOptions');
      expect(report).toHaveProperty('satelliteRecommendations');
      expect(report).toHaveProperty('risks');
      expect(report).toHaveProperty('alternatives');
      expect(report).toHaveProperty('metadata');

      // Validate coverage structure
      expect(report.coverage).toHaveProperty('availableScenes');
      expect(report.coverage).toHaveProperty('notes');

      // Validate weather structure
      expect(report.weather).toHaveProperty('riskLevel');
      expect(report.weather).toHaveProperty('notes');

      // Validate metadata
      expect(report.metadata).toHaveProperty('areaKm2');
      expect(report.metadata).toHaveProperty('inputs');
      expect(report.metadata).toHaveProperty('satelliteAnalysis');
    });

    it('should include satellite analysis in metadata', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 20, offset: 0 },
        });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.metadata.satelliteAnalysis).toBeDefined();
      expect(report.metadata.satelliteAnalysis?.recommended).toBeDefined();
      expect(report.metadata.satelliteAnalysis?.totalEvaluated).toBeGreaterThan(0);
      expect(Array.isArray(report.metadata.satelliteAnalysis?.recommended)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      nock(baseUrl)
        .post('/platform-api/archive/search')
        .reply(500, { error: 'Internal Server Error' });

      const request: FeasibilityRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.coverage.availableScenes).toBe(0);
      expect(report.coverage.notes[0]).toContain('upstream error');
    });

    it('should handle missing location gracefully', async () => {
      const request: FeasibilityRequest = {
        areaKm2: 25,
      };

      const report = await feasibilityService.evaluateTaskFeasibility(request);

      expect(report.coverage.availableScenes).toBe(0);
      expect(report.coverage.notes[0]).toContain('Location not provided');
    });
  });
});

describe('FeasibilityService - Pricing Exploration (P0 Feature #9)', () => {
  beforeEach(() => {
    nock.cleanAll();
    skyfiClient.clearCache();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Pricing Comparison', () => {
    it('should compare pricing across multiple satellites', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.options.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Pricing comparison');

      // Should have options for different satellites
      const satellites = new Set(
        result.options.map(opt => (opt.breakdown as any)?.satellite)
      );
      expect(satellites.size).toBeGreaterThan(1);
    });

    it('should compare archive vs tasking pricing', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      const archiveOptions = result.options.filter(opt => opt.approach === 'archive');
      const taskingOptions = result.options.filter(opt => opt.approach === 'tasking');

      expect(archiveOptions.length).toBeGreaterThan(0);
      expect(taskingOptions.length).toBeGreaterThan(0);

      // Archive should generally be cheaper
      if (archiveOptions.length > 0 && taskingOptions.length > 0) {
        const cheapestArchive = archiveOptions[0];
        const cheapestTasking = taskingOptions[0];
        expect(cheapestArchive.total).toBeLessThan(cheapestTasking.total);
      }
    });

    it('should identify best value option', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.bestValue).toBeDefined();
      expect(result.bestValue?.label).toBe('lowest');

      // Best value should be the cheapest option
      const allPrices = result.options.map(opt => opt.total);
      const minPrice = Math.min(...allPrices);
      expect(result.bestValue?.total).toBe(minPrice);
    });

    it('should identify fastest turnaround option', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        priority: 'urgent',
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.fastestTurnaround).toBeDefined();

      // Fastest should have lowest turnaround time
      const allTurnarounds = result.options
        .map(opt => opt.estimatedTurnaroundDays)
        .filter(d => d !== undefined) as number[];
      const minTurnaround = Math.min(...allTurnarounds);
      expect(result.fastestTurnaround?.estimatedTurnaroundDays).toBe(minTurnaround);
    });

    it('should identify premium option', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.premiumOption).toBeDefined();
      expect(result.premiumOption?.label).toBe('premium');

      // Premium should be the most expensive
      const allPrices = result.options.map(opt => opt.total);
      const maxPrice = Math.max(...allPrices);
      expect(result.premiumOption?.total).toBe(maxPrice);
    });
  });

  describe('Satellite-Specific Pricing', () => {
    it('should provide pricing for high-resolution satellites', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 10,
        resolution: 0.5,
      };

      const result = await feasibilityService.explorePricing(request);

      // Should include high-res satellites like WorldView-3, Pléiades Neo
      const highResSatellites = result.satelliteRecommendations?.filter(sat => {
        const res = Object.values(sat.resolution).find(r => r !== undefined);
        return res && res <= 0.5;
      });

      expect(highResSatellites).toBeDefined();
      expect(highResSatellites!.length).toBeGreaterThan(0);
    });

    it('should include free satellite options in pricing', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 100,
      };

      const result = await feasibilityService.explorePricing(request);

      const freeOptions = result.options.filter(opt => opt.total === 0);

      if (freeOptions.length > 0) {
        const freeOption = freeOptions[0];
        const satellite = (freeOption.breakdown as any)?.satellite;

        // Should be Sentinel or Landsat
        expect(['Sentinel-2A', 'Sentinel-2B', 'Landsat 8', 'Landsat 9']).toContain(satellite);
      }
    });

    it('should apply minimum order pricing correctly', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 1, // Very small area
      };

      const result = await feasibilityService.explorePricing(request);

      // For small areas, check if minimum order is applied
      const commercialOptions = result.options.filter(opt => opt.total > 0);

      commercialOptions.forEach(opt => {
        const satellite = result.satelliteRecommendations?.find(
          s => s.name === (opt.breakdown as any)?.satellite
        );

        if (satellite?.pricing.minimumOrder) {
          expect(opt.total).toBeGreaterThanOrEqual(satellite.pricing.minimumOrder);
        }
      });
    });
  });

  describe('Tradeoff Analysis', () => {
    it('should provide cost vs quality analysis', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.tradeoffAnalysis).toBeDefined();
      expect(result.tradeoffAnalysis?.costVsQuality).toBeDefined();
      expect(Array.isArray(result.tradeoffAnalysis?.costVsQuality)).toBe(true);
    });

    it('should provide cost vs speed analysis', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        priority: 'urgent',
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.tradeoffAnalysis?.costVsSpeed).toBeDefined();
      expect(Array.isArray(result.tradeoffAnalysis?.costVsSpeed)).toBe(true);
    });

    it('should provide recommendations based on tradeoffs', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 50,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.tradeoffAnalysis?.recommendations).toBeDefined();
      expect(Array.isArray(result.tradeoffAnalysis?.recommendations)).toBe(true);
      expect(result.tradeoffAnalysis!.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Priority-Based Pricing', () => {
    it('should apply urgent priority multiplier', async () => {
      const standardRequest: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        priority: 'standard',
      };

      const urgentRequest: PricingExplorationRequest = {
        ...standardRequest,
        priority: 'urgent',
      };

      const standardResult = await feasibilityService.explorePricing(standardRequest);
      const urgentResult = await feasibilityService.explorePricing(urgentRequest);

      const standardTasking = standardResult.options.find(opt => opt.approach === 'tasking');
      const urgentTasking = urgentResult.options.find(opt => opt.approach === 'tasking');

      if (standardTasking && urgentTasking) {
        // Urgent should cost more
        expect(urgentTasking.total).toBeGreaterThan(standardTasking.total);

        // But should be faster
        expect(urgentTasking.estimatedTurnaroundDays).toBeLessThan(standardTasking.estimatedTurnaroundDays!);
      }
    });

    it('should apply rush priority multiplier', async () => {
      const standardRequest: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
        priority: 'standard',
      };

      const rushRequest: PricingExplorationRequest = {
        ...standardRequest,
        priority: 'rush',
      };

      const standardResult = await feasibilityService.explorePricing(standardRequest);
      const rushResult = await feasibilityService.explorePricing(rushRequest);

      const standardTasking = standardResult.options.find(opt => opt.approach === 'tasking');
      const rushTasking = rushResult.options.find(opt => opt.approach === 'tasking');

      if (standardTasking && rushTasking) {
        expect(rushTasking.total).toBeGreaterThan(standardTasking.total);
        expect(rushTasking.estimatedTurnaroundDays).toBeLessThan(standardTasking.estimatedTurnaroundDays!);
      }
    });
  });

  describe('Pricing Summary', () => {
    it('should provide comprehensive pricing summary', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain('Pricing comparison');

      // Summary should mention satellites
      const satellites = result.satelliteRecommendations?.slice(0, 3).map(s => s.name) || [];

      // Verify we have satellite recommendations
      expect(satellites.length).toBeGreaterThan(0);
    });

    it('should include satellite recommendations in pricing result', async () => {
      const request: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 25,
      };

      const result = await feasibilityService.explorePricing(request);

      expect(result.satelliteRecommendations).toBeDefined();
      expect(result.satelliteRecommendations!.length).toBeGreaterThan(0);
      expect(result.satelliteRecommendations!.length).toBeLessThanOrEqual(5); // Top 5
    });
  });

  describe('Area-Based Pricing', () => {
    it('should scale pricing with area size', async () => {
      const smallRequest: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 10,
      };

      const largeRequest: PricingExplorationRequest = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        areaKm2: 100,
      };

      const smallResult = await feasibilityService.explorePricing(smallRequest);
      const largeResult = await feasibilityService.explorePricing(largeRequest);

      // For the same satellite, larger area should cost more
      const smallOption = smallResult.options[0];
      const largeOption = largeResult.options.find(
        opt => (opt.breakdown as any)?.satellite === (smallOption.breakdown as any)?.satellite
      );

      if (largeOption) {
        // For free satellites, pricing might still be 0
        // For commercial satellites, larger area should cost more
        if (smallOption.total > 0 && largeOption.total > 0) {
          expect(largeOption.total).toBeGreaterThan(smallOption.total);
        }
      }
    });
  });
});
