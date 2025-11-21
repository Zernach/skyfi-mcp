import logger from '../utils/logger';
import { skyfiClient } from '../integrations/skyfi/client';
import type {
    ArchiveSearchParams,
    ArchiveSearchResponse,
    DateRange,
    PriceEstimateParams,
    PriceEstimateType,
} from '../integrations/skyfi/types';
import {
    calculatePolygonAreaSqKm,
    calculatePolygonCentroid,
    GeoJsonPolygon,
    toGeoJsonPolygon,
} from '../utils/geojson';
import type {
    FeasibilityRequest,
    FeasibilityReport,
    PricingOption,
    PricingExplorationRequest,
    PricingExplorationResult,
    Recommendation,
    CoverageDetails,
    WeatherInsight,
    RiskItem,
    AlternativeSuggestion,
} from './feasibility.types';

interface ArchiveStats {
    response: ArchiveSearchResponse | null;
    coverage: CoverageDetails;
}

const DEFAULT_MAX_CLOUD = 40;
const DEFAULT_AREA_KM2 = 25;

const round = (value: number, precision = 2): number =>
    Math.round(value * 10 ** precision) / 10 ** precision;

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

const determineConfidence = (
    availableScenes: number,
    bestCloud?: number,
    maxCloud?: number
): FeasibilityReport['confidence'] => {
    if (!availableScenes) {
        return 'low';
    }

    const threshold = typeof maxCloud === 'number' ? maxCloud : DEFAULT_MAX_CLOUD;

    if (typeof bestCloud === 'number' && bestCloud <= threshold) {
        return availableScenes >= 2 ? 'high' : 'medium';
    }

    if (typeof bestCloud === 'number' && bestCloud <= threshold + 15) {
        return availableScenes >= 2 ? 'medium' : 'low';
    }

    return 'low';
};

const determineRecommendation = (
    availableScenes: number,
    bestCloud?: number,
    maxCloud?: number
): Recommendation => {
    if (!availableScenes) {
        return 'tasking';
    }

    const threshold = typeof maxCloud === 'number' ? maxCloud : DEFAULT_MAX_CLOUD;
    if (typeof bestCloud === 'number' && bestCloud <= threshold) {
        return 'archive';
    }

    return 'hybrid';
};

const deriveWeatherInsight = (
    averageCloud: number | undefined,
    maxCloud: number | undefined
): WeatherInsight => {
    if (averageCloud === undefined) {
        return {
            riskLevel: 'medium',
            notes: ['No historical cloud coverage data available; assume moderate risk.'],
        };
    }

    const threshold = typeof maxCloud === 'number' ? maxCloud : DEFAULT_MAX_CLOUD;
    const exceeds = averageCloud > threshold;
    const delta = averageCloud - threshold;

    if (!exceeds) {
        return {
            riskLevel: 'low',
            averageCloudCover: round(averageCloud),
            exceedsThreshold: false,
            notes: [
                `Historical average cloud cover is ${round(averageCloud)}%, below the target threshold of ${threshold}%.`,
                'Weather conditions appear favorable based on recent captures.',
            ],
        };
    }

    if (delta <= 10) {
        return {
            riskLevel: 'medium',
            averageCloudCover: round(averageCloud),
            exceedsThreshold: true,
            notes: [
                `Average cloud cover (${round(averageCloud)}%) is slightly above the desired threshold (${threshold}%).`,
                'Consider allowing a higher cloud coverage or scheduling multiple capture attempts.',
            ],
        };
    }

    return {
        riskLevel: 'high',
        averageCloudCover: round(averageCloud),
        exceedsThreshold: true,
        notes: [
            `Cloud cover trends (${round(averageCloud)}%) exceed the threshold (${threshold}%) by a wide margin.`,
            'Expect weather-related delays; tasking flexibility or extended timelines are recommended.',
        ],
    };
};

const buildCoverageNotes = (
    availableScenes: number,
    bestCloud?: number,
    maxCloud?: number,
    newestCapture?: string
): string[] => {
    const notes: string[] = [];
    if (!availableScenes) {
        notes.push('No recent archive scenes matched the provided constraints.');
        return notes;
    }

    notes.push(`Found ${availableScenes} matching archive scene${availableScenes > 1 ? 's' : ''}.`);

    if (typeof bestCloud === 'number') {
        notes.push(`Best available cloud coverage is ${round(bestCloud)}%.`);
    }

    if (newestCapture) {
        notes.push(`Most recent capture date: ${newestCapture}.`);
    }

    if (typeof maxCloud === 'number' && typeof bestCloud === 'number' && bestCloud > maxCloud) {
        notes.push(
            `All archive scenes exceed the desired cloud coverage threshold of ${maxCloud}%.`
        );
    }

    return notes;
};

const estimatedTurnaroundDays = (
    approach: PricingOption['approach'],
    priority?: FeasibilityRequest['priority']
): number => {
    if (approach === 'archive') {
        return priority === 'urgent' ? 0.5 : priority === 'rush' ? 0.75 : 1;
    }

    if (approach === 'tasking') {
        switch (priority) {
            case 'urgent':
                return 2;
            case 'rush':
                return 5;
            default:
                return 7;
        }
    }

    return 4;
};

const sanitizeDate = (date?: string): string | undefined => {
    if (!date) return undefined;
    const timestamp = Date.parse(date);
    if (Number.isNaN(timestamp)) {
        return undefined;
    }
    return new Date(timestamp).toISOString();
};

class FeasibilityService {
    async evaluateTaskFeasibility(rawRequest: FeasibilityRequest): Promise<FeasibilityReport> {
        const request = this.normalizeRequest(rawRequest);
        const areaKm2 = this.deriveArea(request);

        const { coverage } = await this.fetchArchiveCoverage(request);
        const { pricingOptions } = await this.buildPricingOptions(request, areaKm2);

        const feasible =
            coverage.availableScenes > 0 &&
            (typeof request.maxCloudCoverage !== 'number' ||
                (coverage.bestCloudCover ?? 100) <= request.maxCloudCoverage);

        const weather = deriveWeatherInsight(
            coverage.averageCloudCover,
            request.maxCloudCoverage
        );

        const risks = this.buildRisks(coverage, request, feasible, weather);
        const alternatives = this.buildAlternatives(coverage, request);

        const confidence = determineConfidence(
            coverage.availableScenes,
            coverage.bestCloudCover,
            request.maxCloudCoverage
        );

        const recommendedApproach = determineRecommendation(
            coverage.availableScenes,
            coverage.bestCloudCover,
            request.maxCloudCoverage
        );

        const summary = this.buildSummary(
            feasible,
            coverage,
            recommendedApproach,
            pricingOptions
        );

        return {
            feasible,
            confidence,
            recommendedApproach,
            summary,
            coverage,
            weather,
            pricingOptions,
            risks,
            alternatives,
            metadata: {
                areaKm2: round(areaKm2),
                inputs: {
                    ...request,
                    aoi: request.aoi,
                },
            },
        };
    }

    async explorePricing(
        rawRequest: PricingExplorationRequest
    ): Promise<PricingExplorationResult> {
        const request = this.normalizeRequest(rawRequest);
        const areaKm2 = this.deriveArea(request);
        const { pricingOptions, archiveOption, taskingOption } = await this.buildPricingOptions(
            request,
            areaKm2,
            rawRequest.includeArchive,
            rawRequest.includeTasking
        );

        const bestValue = pricingOptions[0] ?? null;
        const premiumOption = pricingOptions.length > 1 ? pricingOptions[pricingOptions.length - 1] : null;
        const fastestTurnaround =
            pricingOptions.slice().sort((a, b) => {
                const aDays = a.estimatedTurnaroundDays ?? Number.POSITIVE_INFINITY;
                const bDays = b.estimatedTurnaroundDays ?? Number.POSITIVE_INFINITY;
                return aDays - bDays;
            })[0] ?? null;

        const summaryParts: string[] = [];
        if (archiveOption) {
            summaryParts.push(
                `Archive: ${archiveOption.currency} ${archiveOption.total.toFixed(2)} (turnaround ~${archiveOption.estimatedTurnaroundDays ?? '?'} days)`
            );
        }
        if (taskingOption) {
            summaryParts.push(
                `Tasking: ${taskingOption.currency} ${taskingOption.total.toFixed(2)} (turnaround ~${taskingOption.estimatedTurnaroundDays ?? '?'} days)`
            );
        }

        const summary =
            summaryParts.length > 0
                ? `Pricing comparison - ${summaryParts.join('; ')}`
                : 'No pricing data available for the provided parameters.';

        return {
            options: pricingOptions,
            summary,
            bestValue,
            fastestTurnaround,
            premiumOption,
        };
    }

    private normalizeRequest(request: FeasibilityRequest): FeasibilityRequest {
        const normalized: FeasibilityRequest = { ...request };

        if (request.aoi && (request.aoi as GeoJsonPolygon).type !== 'Polygon') {
            const polygon = toGeoJsonPolygon(request.aoi as any);
            if (polygon) {
                normalized.aoi = polygon;
            }
        }

        if (!request.location && normalized.aoi) {
            const centroid = calculatePolygonCentroid(normalized.aoi);
            if (centroid) {
                normalized.location = {
                    type: 'Point',
                    coordinates: centroid,
                };
            }
        }

        if (!normalized.maxCloudCoverage) {
            normalized.maxCloudCoverage = DEFAULT_MAX_CLOUD;
        } else {
            normalized.maxCloudCoverage = clamp(normalized.maxCloudCoverage, 0, 100);
        }

        normalized.startDate = sanitizeDate(request.startDate);
        normalized.endDate = sanitizeDate(request.endDate);

        return normalized;
    }

    private deriveArea(request: FeasibilityRequest): number {
        if (typeof request.areaKm2 === 'number' && Number.isFinite(request.areaKm2)) {
            return Math.max(request.areaKm2, 0.1);
        }

        if (request.aoi) {
            const area = calculatePolygonAreaSqKm(request.aoi);
            if (Number.isFinite(area) && area > 0) {
                return area;
            }
        }

        return DEFAULT_AREA_KM2;
    }

    private async fetchArchiveCoverage(
        request: FeasibilityRequest
    ): Promise<ArchiveStats> {
        if (!request.location) {
            logger.warn('FeasibilityService: Missing location; archive coverage unavailable.');
            return {
                response: null,
                coverage: {
                    availableScenes: 0,
                    notes: ['Location not provided; unable to evaluate archive coverage.'],
                },
            };
        }

        const params: ArchiveSearchParams = {
            location: request.location,
            limit: 20,
        };

        if (request.maxCloudCoverage !== undefined) {
            params.maxCloudCover = request.maxCloudCoverage;
        }

        if (request.resolution !== undefined) {
            params.resolution = { max: request.resolution };
        }

        if (request.startDate || request.endDate) {
            const start = sanitizeDate(request.startDate ?? request.endDate);
            const end = sanitizeDate(request.endDate ?? request.startDate);
            const dateRange: Partial<DateRange> = {};
            if (start) {
                dateRange.start = start;
            }
            if (end) {
                dateRange.end = end;
            }
            if (Object.keys(dateRange).length > 0) {
                params.dateRange = dateRange as DateRange;
            }
        }

        if (request.satellites?.length) {
            params.satellites = request.satellites;
        }

        try {
            const response = await skyfiClient.archiveSearch(params);
            const coverage = this.buildCoverageDetails(response, request);
            return { response, coverage };
        } catch (error) {
            logger.error('FeasibilityService: archiveSearch failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                response: null,
                coverage: {
                    availableScenes: 0,
                    notes: [
                        'Unable to query archive availability due to an upstream error. Consider retrying.',
                    ],
                },
            };
        }
    }

    private buildCoverageDetails(
        response: ArchiveSearchResponse,
        request: FeasibilityRequest
    ): CoverageDetails {
        const results = response.results ?? [];
        const availableScenes = results.length;
        const bestCloud = results.reduce<number | undefined>((best, scene) => {
            if (typeof scene.cloudCover !== 'number') {
                return best;
            }
            if (best === undefined || scene.cloudCover < best) {
                return scene.cloudCover;
            }
            return best;
        }, undefined);

        const averageCloud =
            results.length > 0
                ? results.reduce((sum, scene) => sum + (scene.cloudCover ?? DEFAULT_MAX_CLOUD), 0) /
                  results.length
                : undefined;

        const bestResolution = results.reduce<number | undefined>((best, scene) => {
            if (typeof scene.resolution !== 'number') {
                return best;
            }
            if (best === undefined || scene.resolution < best) {
                return scene.resolution;
            }
            return best;
        }, undefined);

        const newestCapture = results
            .map((scene) => scene.captureDate)
            .filter(Boolean)
            .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

        const satellites = Array.from(
            new Set(results.map((scene) => scene.satellite).filter(Boolean))
        );

        const notes = buildCoverageNotes(
            availableScenes,
            bestCloud,
            request.maxCloudCoverage,
            newestCapture
        );

        return {
            availableScenes,
            bestCloudCover: bestCloud !== undefined ? round(bestCloud) : undefined,
            averageCloudCover: averageCloud !== undefined ? round(averageCloud) : undefined,
            bestResolution: bestResolution !== undefined ? round(bestResolution, 3) : undefined,
            newestCapture,
            satellites,
            notes,
        };
    }

    private async buildPricingOptions(
        request: FeasibilityRequest,
        areaKm2: number,
        includeArchive = true,
        includeTasking = true
    ): Promise<{
        pricingOptions: PricingOption[];
        archiveOption: PricingOption | null;
        taskingOption: PricingOption | null;
    }> {
        const options: PricingOption[] = [];
        let archiveOption: PricingOption | null = null;
        let taskingOption: PricingOption | null = null;

        if (includeArchive) {
            const option = await this.estimatePricing('archive', request, areaKm2);
            if (option) {
                options.push(option);
                archiveOption = option;
            }
        }

        if (includeTasking) {
            const option = await this.estimatePricing('tasking', request, areaKm2);
            if (option) {
                options.push(option);
                taskingOption = option;
            }
        }

        options.sort((a, b) => a.total - b.total);

        if (options.length) {
            options[0].label = 'lowest';
            if (options.length > 1) {
                options[options.length - 1].label = 'premium';
            }

            for (let i = 1; i < options.length - 1; i += 1) {
                options[i].label = 'balanced';
            }

            const archive = options.find((opt) => opt.approach === 'archive');
            const tasking = options.find((opt) => opt.approach === 'tasking');

            if (archive && tasking) {
                const delta = tasking.total - archive.total;
                archive.savingsVsTasking = round(delta);
                tasking.savingsVsArchive = round(-delta);
            }
        }

        return {
            pricingOptions: options,
            archiveOption,
            taskingOption,
        };
    }

    private async estimatePricing(
        approach: PriceEstimateType,
        request: FeasibilityRequest,
        areaKm2: number
    ): Promise<PricingOption | null> {
        const params: PriceEstimateParams = {
            type: approach,
            areaKm2,
        };

        if (request.location) {
            params.location = request.location;
        }

        if (request.aoi) {
            params.aoi = request.aoi;
        }

        if (request.startDate) {
            params.startDate = request.startDate;
        }

        if (request.endDate) {
            params.endDate = request.endDate;
        }

        if (request.resolution !== undefined) {
            params.resolution = request.resolution;
        }

        if (request.priority) {
            params.priority = request.priority;
        }

        if (request.processingLevel) {
            params.processingLevel = request.processingLevel;
        }

        if (request.satellites?.length) {
            params.satellites = request.satellites;
        }

        try {
            const estimate = await skyfiClient.estimatePrice(params);
            return {
                approach,
                total: round(estimate.estimatedPrice, 2),
                currency: estimate.currency,
                breakdown: estimate.breakdown,
                label: 'balanced',
                estimatedTurnaroundDays: estimatedTurnaroundDays(approach, request.priority),
                assumptions: [
                    `Area evaluated: ${round(areaKm2)} km².`,
                    `Priority: ${request.priority ?? 'standard'}.`,
                    `Processing level: ${request.processingLevel ?? 'orthorectified'}.`,
                ],
            };
        } catch (error) {
            logger.warn('FeasibilityService: estimatePrice failed', {
                approach,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    private buildRisks(
        coverage: CoverageDetails,
        request: FeasibilityRequest,
        feasible: boolean,
        weather: WeatherInsight
    ): RiskItem[] {
        const risks: RiskItem[] = [];

        if (!coverage.availableScenes) {
            risks.push({
                level: 'high',
                summary: 'No archive availability',
                detail:
                    'Recent archive imagery is unavailable for the requested constraints. Tasking may be required.',
            });
        }

        if (coverage.availableScenes && request.maxCloudCoverage !== undefined) {
            const bestCloud = coverage.bestCloudCover ?? 100;
            if (bestCloud > request.maxCloudCoverage) {
                risks.push({
                    level: 'medium',
                    summary: 'Cloud coverage risk',
                    detail:
                        'Existing archive scenes exceed the desired cloud coverage threshold. Consider relaxing the threshold or using new tasking.',
                });
            }
        }

        if (!feasible) {
            risks.push({
                level: 'high',
                summary: 'Feasibility in question',
                detail:
                    'Current parameters are unlikely to succeed without adjustments. Review alternatives or consider a phased approach.',
            });
        }

        if (weather.riskLevel === 'high') {
            risks.push({
                level: 'high',
                summary: 'Weather volatility',
                detail: weather.notes[0],
            });
        } else if (weather.riskLevel === 'medium') {
            risks.push({
                level: 'medium',
                summary: 'Weather constraints',
                detail: weather.notes[0],
            });
        }

        return risks;
    }

    private buildAlternatives(
        coverage: CoverageDetails,
        request: FeasibilityRequest
    ): AlternativeSuggestion[] {
        const alternatives: AlternativeSuggestion[] = [];

        if (!coverage.availableScenes) {
            alternatives.push({
                id: 'tasking-primary',
                approach: 'tasking',
                summary: 'Request new capture tasking',
                rationale:
                    'Since archive coverage is limited, initiating a tasking request can guarantee fresh imagery within the desired window.',
            });
        }

        if (
            coverage.availableScenes &&
            request.maxCloudCoverage !== undefined &&
            (coverage.bestCloudCover ?? 100) > request.maxCloudCoverage
        ) {
            alternatives.push({
                id: 'relax-cloud-threshold',
                approach: 'archive',
                summary: 'Relax cloud coverage threshold',
                rationale:
                    'Allowing slightly higher cloud cover could unlock more archive scenes and reduce cost.',
            });
        }

        alternatives.push({
            id: 'hybrid-approach',
            approach: 'hybrid',
            summary: 'Hybrid archive + tasking plan',
            rationale:
                'Use available archive imagery for immediate needs while scheduling tasking for guaranteed future coverage.',
        });

        return alternatives;
    }

    private buildSummary(
        feasible: boolean,
        coverage: CoverageDetails,
        recommendation: Recommendation,
        pricingOptions: PricingOption[]
    ): string {
        const coveragePart = coverage.availableScenes
            ? `${coverage.availableScenes} archive scene${coverage.availableScenes > 1 ? 's' : ''} matched your constraints`
            : 'No archive scenes matched your constraints';

        const recommendationPart =
            recommendation === 'archive'
                ? 'Archive imagery is recommended.'
                : recommendation === 'tasking'
                ? 'New tasking is recommended to achieve your goals.'
                : recommendation === 'hybrid'
                ? 'Combine archive imagery with targeted tasking for best results.'
                : 'Insufficient data to determine a clear recommendation.';

        const pricingPart =
            pricingOptions.length > 0
                ? `Estimated costs range from ${pricingOptions[0].currency} ${pricingOptions[0].total.toFixed(
                      2
                  )} ${pricingOptions.length > 1 ? `to ${pricingOptions[pricingOptions.length - 1].currency} ${pricingOptions[pricingOptions.length - 1].total.toFixed(2)}` : ''
                  }.`
                : 'Pricing data is unavailable.';

        const feasibilityPart = feasible
            ? 'Parameters look feasible with current constraints.'
            : 'Current constraints may be too strict; consider adjustments.';

        return `${feasibilityPart} ${coveragePart}. ${recommendationPart} ${pricingPart}`.trim();
    }
}

export const feasibilityService = new FeasibilityService();

