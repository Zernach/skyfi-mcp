import { feasibilityService } from '../../src/services/feasibility.service';
import type { ArchiveSearchResponse, PriceEstimate } from '../../src/integrations/skyfi/types';

jest.mock('../../src/integrations/skyfi/client', () => {
    const originalModule = jest.requireActual('../../src/integrations/skyfi/client');
    return {
        ...originalModule,
        skyfiClient: {
            archiveSearch: jest.fn(),
            estimatePrice: jest.fn(),
        },
    };
});

const { skyfiClient } = jest.requireMock('../../src/integrations/skyfi/client') as {
    skyfiClient: {
        archiveSearch: jest.Mock;
        estimatePrice: jest.Mock;
    };
};

const buildArchiveResponse = (overrides?: Partial<ArchiveSearchResponse>): ArchiveSearchResponse => ({
    results: [
        {
            id: 'scene-1',
            satellite: 'WorldView-3',
            captureDate: '2025-01-10T00:00:00Z',
            cloudCover: 12,
            resolution: 0.31,
            thumbnail: 'https://example.test/thumb.jpg',
            bbox: [-74.1, 40.7, -73.9, 40.8],
            price: 900,
        },
        {
            id: 'scene-2',
            satellite: 'Sentinel-2',
            captureDate: '2024-12-02T00:00:00Z',
            cloudCover: 25,
            resolution: 10,
            thumbnail: 'https://example.test/thumb2.jpg',
            bbox: [-74.2, 40.6, -73.8, 40.9],
            price: 0,
        },
    ],
    total: 2,
    limit: 20,
    offset: 0,
    ...overrides,
});

const buildPriceEstimate = (price: number): PriceEstimate => ({
    estimatedPrice: price,
    currency: 'USD',
    breakdown: {
        base: price * 0.4,
        area: price * 0.3,
        resolution: price * 0.2,
        urgency: price * 0.1,
    },
});

describe('FeasibilityService', () => {
    beforeEach(() => {
        skyfiClient.archiveSearch.mockReset();
        skyfiClient.estimatePrice.mockReset();
    });

    it('should report high-confidence feasibility when archive coverage is strong', async () => {
        skyfiClient.archiveSearch.mockResolvedValue(buildArchiveResponse());
        skyfiClient.estimatePrice.mockImplementation(async ({ type }: { type: 'archive' | 'tasking' }) =>
            buildPriceEstimate(type === 'archive' ? 800 : 1800)
        );

        const report = await feasibilityService.evaluateTaskFeasibility({
            location: { type: 'Point', coordinates: [-74, 40.7] },
            areaKm2: 20,
            maxCloudCoverage: 30,
            resolution: 0.5,
            priority: 'standard',
        });

        expect(report.feasible).toBe(true);
        expect(report.confidence).toBe('high');
        expect(report.recommendedApproach).toBe('archive');
        expect(report.coverage.availableScenes).toBe(2);
        expect(report.pricingOptions).toHaveLength(2);
        expect(report.pricingOptions[0].approach).toBe('archive');
    });

    it('should recommend tasking when archive coverage is unavailable', async () => {
        skyfiClient.archiveSearch.mockResolvedValue(buildArchiveResponse({ results: [], total: 0 }));
        skyfiClient.estimatePrice.mockImplementation(async ({ type }: { type: 'archive' | 'tasking' }) => {
            if (type === 'archive') {
                throw new Error('No archive pricing');
            }
            return buildPriceEstimate(2100);
        });

        const report = await feasibilityService.evaluateTaskFeasibility({
            location: { type: 'Point', coordinates: [-122.4, 37.8] },
            maxCloudCoverage: 20,
            areaKm2: 15,
        });

        expect(report.feasible).toBe(false);
        expect(report.recommendedApproach).toBe('tasking');
        expect(report.coverage.availableScenes).toBe(0);
        expect(report.pricingOptions).toHaveLength(1);
        expect(report.pricingOptions[0].approach).toBe('tasking');
    });

    it('should compare pricing options when exploring scenarios', async () => {
        skyfiClient.archiveSearch.mockResolvedValue(buildArchiveResponse());
        skyfiClient.estimatePrice.mockImplementation(async ({ type }: { type: 'archive' | 'tasking' }) =>
            buildPriceEstimate(type === 'archive' ? 950 : 1750)
        );

        const result = await feasibilityService.explorePricing({
            location: { type: 'Point', coordinates: [2.35, 48.86] },
            areaKm2: 30,
            priority: 'rush',
        });

        expect(result.options).toHaveLength(2);
        expect(result.options[0].total).toBeLessThan(result.options[1].total);
        expect(result.bestValue?.approach).toBe('archive');
        expect(result.fastestTurnaround?.approach).toBe('archive');
        expect(result.premiumOption?.approach).toBe('tasking');
    });
});

