import logger from '../utils/logger';
import { skyfiClient } from '../integrations/skyfi/client';
import type {
    ArchiveSearchParams,
    ArchiveSearchResponse,
    DateRange,
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
    SatelliteRecommendation,
} from './feasibility.types';
import {
    getActiveSatellites,
} from '../integrations/skyfi/satellite-capabilities';

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

        // Enhanced: Get intelligent satellite recommendations
        const satelliteRecommendations = this.analyzeSatelliteOptions(request, areaKm2);

        // Enhanced: Use recommended satellites in coverage search
        const enhancedRequest = {
            ...request,
            satellites: request.satellites?.length
                ? request.satellites
                : satelliteRecommendations.slice(0, 3).map((s) => s.name),
        };

        const { coverage } = await this.fetchArchiveCoverage(enhancedRequest);
        
        // Enhanced: Build pricing with satellite-specific costs
        const pricingResult = await this.buildEnhancedPricingOptions(
            enhancedRequest,
            areaKm2,
            satelliteRecommendations
        );
        const pricingOptions = pricingResult.pricingOptions;

        const feasible =
            coverage.availableScenes > 0 &&
            (typeof request.maxCloudCoverage !== 'number' ||
                (coverage.bestCloudCover ?? 100) <= request.maxCloudCoverage);

        const weather = deriveWeatherInsight(
            coverage.averageCloudCover,
            request.maxCloudCoverage
        );

        // Enhanced: Include satellite-specific risks
        const risks = this.buildEnhancedRisks(
            coverage,
            request,
            feasible,
            weather,
            satelliteRecommendations,
            areaKm2
        );
        
        // Enhanced: Include satellite-aware alternatives
        const alternatives = this.buildEnhancedAlternatives(
            coverage,
            request,
            satelliteRecommendations
        );

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

        // Enhanced: Include satellite information in summary
        const summary = this.buildEnhancedSummary(
            feasible,
            coverage,
            recommendedApproach,
            pricingOptions,
            satelliteRecommendations
        );

        return {
            feasible,
            confidence,
            recommendedApproach,
            summary,
            coverage,
            weather,
            pricingOptions,
            satelliteRecommendations, // NEW: Include satellite analysis
            risks,
            alternatives,
            metadata: {
                areaKm2: round(areaKm2),
                inputs: {
                    ...request,
                    aoi: request.aoi,
                },
                satelliteAnalysis: {
                    recommended: satelliteRecommendations.slice(0, 3).map((s) => s.name),
                    totalEvaluated: satelliteRecommendations.length,
                },
            },
        };
    }

    async explorePricing(
        rawRequest: PricingExplorationRequest
    ): Promise<PricingExplorationResult> {
        const request = this.normalizeRequest(rawRequest);
        const areaKm2 = this.deriveArea(request);
        
        // Enhanced: Get satellite recommendations for pricing
        const satelliteRecommendations = this.analyzeSatelliteOptions(request, areaKm2);
        
        const pricingResult = await this.buildEnhancedPricingOptions(
            request,
            areaKm2,
            satelliteRecommendations
        );
        const pricingOptions = pricingResult.pricingOptions;

        const bestValue = pricingOptions[0] ?? null;
        const premiumOption = pricingOptions.length > 1 ? pricingOptions[pricingOptions.length - 1] : null;
        const fastestTurnaround =
            pricingOptions.slice().sort((a, b) => {
                const aDays = a.estimatedTurnaroundDays ?? Number.POSITIVE_INFINITY;
                const bDays = b.estimatedTurnaroundDays ?? Number.POSITIVE_INFINITY;
                return aDays - bDays;
            })[0] ?? null;

        // Enhanced: Include satellite-specific summary
        const summaryParts: string[] = [];
        
        // Group by satellite
        const bySatellite = new Map<string, PricingOption[]>();
        pricingOptions.forEach((opt) => {
            const sat = (opt.breakdown as any)?.satellite || 'Unknown';
            if (!bySatellite.has(sat)) {
                bySatellite.set(sat, []);
            }
            bySatellite.get(sat)!.push(opt);
        });

        bySatellite.forEach((opts, satellite) => {
            const archiveOpt = opts.find((o) => o.approach === 'archive');
            const taskingOpt = opts.find((o) => o.approach === 'tasking');
            
            const parts: string[] = [];
            if (archiveOpt) {
                parts.push(`archive: $${archiveOpt.total.toFixed(2)}`);
            }
            if (taskingOpt) {
                parts.push(`tasking: $${taskingOpt.total.toFixed(2)}`);
            }
            
            if (parts.length > 0) {
                summaryParts.push(`${satellite} (${parts.join(', ')})`);
            }
        });

        const summary =
            summaryParts.length > 0
                ? `Pricing comparison across satellites: ${summaryParts.join('; ')}`
                : 'No pricing data available for the provided parameters.';

        // Add satellite recommendations to result
        return {
            options: pricingOptions,
            summary,
            bestValue,
            fastestTurnaround,
            premiumOption,
            satelliteRecommendations: satelliteRecommendations.slice(0, 5), // Top 5
            tradeoffAnalysis: this.buildTradeoffAnalysis(pricingOptions, satelliteRecommendations),
        };
    }

    /**
     * Build comprehensive trade-off analysis
     */
    private buildTradeoffAnalysis(
        pricingOptions: PricingOption[],
        satelliteRecommendations: SatelliteRecommendation[]
    ): {
        costVsQuality: string[];
        costVsSpeed: string[];
        qualityVsSpeed: string[];
        recommendations: string[];
    } {
        const analysis = {
            costVsQuality: [] as string[],
            costVsSpeed: [] as string[],
            qualityVsSpeed: [] as string[],
            recommendations: [] as string[],
        };

        if (pricingOptions.length === 0) {
            return analysis;
        }

        // Cost vs Quality
        const lowestCost = pricingOptions[0];
        const highestCost = pricingOptions[pricingOptions.length - 1];

        if (lowestCost !== highestCost) {
            const costDiff = highestCost.total - lowestCost.total;
            const costDiffPercent = round((costDiff / lowestCost.total) * 100);
            
            const lowestSat = satelliteRecommendations.find(
                (s) => s.name === (lowestCost.breakdown as any)?.satellite
            );
            const highestSat = satelliteRecommendations.find(
                (s) => s.name === (highestCost.breakdown as any)?.satellite
            );

            if (lowestSat && highestSat) {
                const lowestRes = Object.values(lowestSat.resolution).find((r) => r !== undefined) || 100;
                const highestRes = Object.values(highestSat.resolution).find((r) => r !== undefined) || 100;
                
                analysis.costVsQuality.push(
                    `Lowest cost option (${lowestSat.name}, $${lowestCost.total.toFixed(2)}) provides ${lowestRes}m resolution`
                );
                analysis.costVsQuality.push(
                    `Premium option (${highestSat.name}, $${highestCost.total.toFixed(2)}) provides ${highestRes}m resolution - ${costDiffPercent}% more expensive`
                );
                
                if (highestRes < lowestRes) {
                    const qualityImprovement = round(((lowestRes - highestRes) / lowestRes) * 100);
                    analysis.costVsQuality.push(
                        `Premium option offers ${qualityImprovement}% better resolution for ${costDiffPercent}% higher cost`
                    );
                }
            }
        }

        // Cost vs Speed
        const fastestOption = [...pricingOptions].sort(
            (a, b) => (a.estimatedTurnaroundDays || 999) - (b.estimatedTurnaroundDays || 999)
        )[0];

        if (fastestOption && lowestCost !== fastestOption) {
            const speedAdvantage = (lowestCost.estimatedTurnaroundDays || 0) - (fastestOption.estimatedTurnaroundDays || 0);
            const costPenalty = fastestOption.total - lowestCost.total;

            analysis.costVsSpeed.push(
                `Fastest delivery (${fastestOption.approach}, ${fastestOption.estimatedTurnaroundDays} days) costs $${costPenalty.toFixed(2)} more`
            );
            analysis.costVsSpeed.push(
                `Saves ${speedAdvantage} days but increases cost by ${round((costPenalty / lowestCost.total) * 100)}%`
            );
        }

        // Recommendations
        const freeSatellites = satelliteRecommendations.filter((s) => s.pricing.archivePerKm2 === 0);
        if (freeSatellites.length > 0) {
            analysis.recommendations.push(
                `💡 Consider ${freeSatellites[0].name} for zero-cost archive data (${Object.values(freeSatellites[0].resolution)[0]}m resolution)`
            );
        }

        if (lowestCost.approach === 'archive') {
            analysis.recommendations.push(
                '⚡ Archive imagery offers fastest turnaround and lowest cost - recommended unless fresh data is critical'
            );
        }

        const highResSatellites = satelliteRecommendations.filter((s) => {
            const res = Object.values(s.resolution).find((r) => r !== undefined);
            return res && res < 1;
        });

        if (highResSatellites.length > 0) {
            analysis.recommendations.push(
                `🔬 For maximum detail, consider ${highResSatellites[0].name} (${Object.values(highResSatellites[0].resolution)[0]}m resolution) - ideal for infrastructure or precision applications`
            );
        }

        return analysis;
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

    // Removed: buildPricingOptions and estimatePricing - replaced by buildEnhancedPricingOptions

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

    /**
     * Analyze and score satellites based on user requirements
     */
    private analyzeSatelliteOptions(
        request: FeasibilityRequest,
        areaKm2: number
    ): SatelliteRecommendation[] {
        const activeSatellites = getActiveSatellites();
        const scored: SatelliteRecommendation[] = [];

        for (const sat of activeSatellites) {
            let score = 100;
            const matchReasons: string[] = [];
            const pros: string[] = [];
            const cons: string[] = [];
            let constraintsMet = true;

            // Resolution scoring
            const satResolution =
                sat.resolution.panchromatic ||
                sat.resolution.multispectral ||
                sat.resolution.sar ||
                100;

            if (request.resolution) {
                if (satResolution <= request.resolution) {
                    score += 20;
                    matchReasons.push(`Resolution ${satResolution}m meets requirement (≤${request.resolution}m)`);
                    pros.push(`High resolution: ${satResolution}m`);
                } else {
                    score -= 30;
                    cons.push(`Resolution ${satResolution}m exceeds requirement (${request.resolution}m)`);
                    constraintsMet = false;
                }
            } else {
                // Reward better resolution
                score += Math.max(0, 20 - satResolution);
                if (satResolution < 5) {
                    pros.push('Very high resolution');
                } else if (satResolution < 30) {
                    pros.push('Good resolution');
                }
            }

            // Coverage area scoring (swath width vs area)
            if (areaKm2 > 100 && sat.swathWidth < 50) {
                score -= 15;
                cons.push('Narrow swath may require multiple passes for large area');
            } else if (areaKm2 < 50 && sat.swathWidth > 100) {
                pros.push('Wide swath ensures single-pass coverage');
            }

            // Revisit time scoring
            if (sat.revisitTime <= 2) {
                score += 15;
                pros.push(`Daily revisit (${sat.revisitTime} days)`);
                matchReasons.push('Excellent availability due to fast revisit time');
            } else if (sat.revisitTime > 10) {
                score -= 10;
                cons.push(`Slower revisit time (${sat.revisitTime} days)`);
            }

            // Pricing scoring
            const archivePrice = sat.pricing.archivePerKm2 || 0;

            if (archivePrice === 0) {
                score += 30;
                pros.push('Free and open data');
                matchReasons.push('No cost - ideal for budget-conscious projects');
            } else if (archivePrice < 10) {
                score += 10;
                pros.push(`Affordable: $${archivePrice}/km²`);
            } else if (archivePrice > 30) {
                score -= 15;
                cons.push(`Premium pricing: $${archivePrice}/km²`);
            }

            // Spectral capabilities scoring
            const bandCount = sat.spectralBands.length;
            if (bandCount > 10) {
                score += 10;
                pros.push(`Rich spectral data (${bandCount} bands)`);
            } else if (bandCount < 5) {
                cons.push('Limited spectral bands');
            }

            // Weather dependency
            if (sat.type === 'optical' || sat.type === 'multispectral') {
                cons.push('Weather dependent (optical)');
                score -= 5;
            } else if (sat.type === 'sar') {
                score += 10;
                pros.push('All-weather SAR capability');
                matchReasons.push('SAR technology works through clouds');
            }

            // Specific use case matching (if we can infer from request)
            const inferredUseCase = this.inferUseCase(request);
            if (inferredUseCase && sat.idealFor.some((uc) => uc.toLowerCase().includes(inferredUseCase))) {
                score += 20;
                matchReasons.push(`Optimized for ${inferredUseCase}`);
            }

            // Build recommendation
            scored.push({
                name: sat.name,
                operator: sat.operator,
                score,
                matchReason: matchReasons.length > 0 ? matchReasons.join('; ') : 'General purpose satellite',
                resolution: sat.resolution,
                pricing: sat.pricing,
                capabilities: sat.capabilities,
                idealFor: sat.idealFor,
                limitations: sat.limitations,
                revisitTime: sat.revisitTime,
                swathWidth: sat.swathWidth,
                spectralBands: sat.spectralBands.length,
                availability: {
                    hasArchiveData: true, // Would be determined by actual archive check
                    constraintsMet,
                },
                tradeoffs: {
                    pros,
                    cons,
                },
            });
        }

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        return scored;
    }

    /**
     * Infer use case from request parameters
     */
    private inferUseCase(request: FeasibilityRequest): string | null {
        // High resolution + small area = infrastructure/urban
        if (request.resolution && request.resolution < 1 && request.areaKm2 && request.areaKm2 < 10) {
            return 'infrastructure';
        }

        // Medium resolution + large area = agriculture/forestry
        if (request.areaKm2 && request.areaKm2 > 100) {
            return 'agriculture';
        }

        // Low cloud requirement = change detection
        if (request.maxCloudCoverage && request.maxCloudCoverage < 20) {
            return 'change detection';
        }

        return null;
    }

    /**
     * Build enhanced pricing with satellite-specific costs
     */
    private async buildEnhancedPricingOptions(
        request: FeasibilityRequest,
        areaKm2: number,
        satelliteRecommendations: SatelliteRecommendation[]
    ): Promise<{
        pricingOptions: PricingOption[];
        archiveOption: PricingOption | null;
        taskingOption: PricingOption | null;
    }> {
        const options: PricingOption[] = [];

        // Generate pricing for top 3 satellites
        const topSatellites = satelliteRecommendations.slice(0, 3);

        for (const satRec of topSatellites) {
            // Archive pricing
            if (satRec.pricing.archivePerKm2 !== undefined) {
                const archiveCost = areaKm2 * satRec.pricing.archivePerKm2;
                options.push({
                    approach: 'archive',
                    total: round(Math.max(archiveCost, satRec.pricing.minimumOrder || 0), 2),
                    currency: 'USD',
                    breakdown: {
                        base: round(archiveCost, 2),
                        area: areaKm2,
                        resolution: 0,
                        urgency: 0,
                        pricePerKm2: satRec.pricing.archivePerKm2,
                        satellite: satRec.name,
                    } as any,
                    label: 'balanced',
                    estimatedTurnaroundDays: estimatedTurnaroundDays('archive', request.priority),
                    assumptions: [
                        `Satellite: ${satRec.name}`,
                        `Area: ${round(areaKm2)} km²`,
                        `Archive pricing: $${satRec.pricing.archivePerKm2}/km²`,
                        `Resolution: ${Object.values(satRec.resolution).filter((r) => r !== undefined)[0]}m`,
                    ],
                });
            }

            // Tasking pricing
            if (satRec.pricing.taskingPerKm2 !== undefined) {
                const taskingCost = areaKm2 * satRec.pricing.taskingPerKm2;
                const priorityMultiplier =
                    request.priority === 'urgent' ? 1.5 : request.priority === 'rush' ? 1.25 : 1.0;

                options.push({
                    approach: 'tasking',
                    total: round(Math.max(taskingCost * priorityMultiplier, satRec.pricing.minimumOrder || 0), 2),
                    currency: 'USD',
                    breakdown: {
                        base: round(taskingCost, 2),
                        area: areaKm2,
                        resolution: 0,
                        urgency: round(taskingCost * (priorityMultiplier - 1), 2),
                        pricePerKm2: satRec.pricing.taskingPerKm2,
                        satellite: satRec.name,
                    } as any,
                    label: 'balanced',
                    estimatedTurnaroundDays: estimatedTurnaroundDays('tasking', request.priority),
                    assumptions: [
                        `Satellite: ${satRec.name}`,
                        `Area: ${round(areaKm2)} km²`,
                        `Tasking pricing: $${satRec.pricing.taskingPerKm2}/km²`,
                        `Priority: ${request.priority || 'standard'}`,
                        `Resolution: ${Object.values(satRec.resolution).filter((r) => r !== undefined)[0]}m`,
                    ],
                });
            }
        }

        // Sort by total cost
        options.sort((a, b) => a.total - b.total);

        // Label options
        if (options.length > 0) {
            options[0].label = 'lowest';
            if (options.length > 1) {
                options[options.length - 1].label = 'premium';
            }
            for (let i = 1; i < options.length - 1; i++) {
                options[i].label = 'balanced';
            }
        }

        // Calculate savings
        const archiveOptions = options.filter((o) => o.approach === 'archive');
        const taskingOptions = options.filter((o) => o.approach === 'tasking');

        if (archiveOptions.length > 0 && taskingOptions.length > 0) {
            const cheapestArchive = archiveOptions[0].total;
            const cheapestTasking = taskingOptions[0].total;

            archiveOptions.forEach((opt) => {
                opt.savingsVsTasking = round(cheapestTasking - opt.total);
            });

            taskingOptions.forEach((opt) => {
                opt.savingsVsArchive = round(opt.total - cheapestArchive);
            });
        }

        return {
            pricingOptions: options,
            archiveOption: archiveOptions[0] || null,
            taskingOption: taskingOptions[0] || null,
        };
    }

    /**
     * Build enhanced risks with satellite-specific considerations
     */
    private buildEnhancedRisks(
        coverage: CoverageDetails,
        request: FeasibilityRequest,
        feasible: boolean,
        weather: WeatherInsight,
        satelliteRecommendations: SatelliteRecommendation[],
        areaKm2: number
    ): RiskItem[] {
        const risks = this.buildRisks(coverage, request, feasible, weather);

        // Add satellite-specific risks
        const topSatellite = satelliteRecommendations[0];
        if (topSatellite) {
            // Large area + narrow swath risk
            if (areaKm2 > 100 && topSatellite.swathWidth < 50) {
                risks.push({
                    level: 'medium',
                    summary: 'Multi-pass requirement',
                    detail: `Area size (${round(areaKm2)} km²) exceeds satellite swath width (${topSatellite.swathWidth} km). Multiple passes required, increasing acquisition time and potential for inconsistency.`,
                });
            }

            // Resolution limitations
            if (request.resolution && topSatellite.resolution.panchromatic) {
                if (topSatellite.resolution.panchromatic > request.resolution) {
                    risks.push({
                        level: 'high',
                        summary: 'Resolution constraint not met',
                        detail: `Top recommended satellite (${topSatellite.name}) provides ${topSatellite.resolution.panchromatic}m resolution, which exceeds your requirement of ${request.resolution}m. Consider relaxing resolution requirements or selecting premium satellites.`,
                    });
                }
            }

            // Cost warning for small areas
            if (areaKm2 < 5 && topSatellite.pricing.minimumOrder && topSatellite.pricing.minimumOrder > 0) {
                risks.push({
                    level: 'low',
                    summary: 'Minimum order applies',
                    detail: `Small area order (${round(areaKm2)} km²) will be charged at minimum order amount of $${topSatellite.pricing.minimumOrder}.`,
                });
            }
        }

        // No suitable satellites found
        if (satelliteRecommendations.every((s) => !s.availability.constraintsMet)) {
            risks.push({
                level: 'high',
                summary: 'No satellites meet all constraints',
                detail: 'Your requirements exceed the capabilities of available satellites. Consider relaxing constraints on resolution, cloud coverage, or timing.',
            });
        }

        return risks;
    }

    /**
     * Build enhanced alternatives with satellite recommendations
     */
    private buildEnhancedAlternatives(
        coverage: CoverageDetails,
        request: FeasibilityRequest,
        satelliteRecommendations: SatelliteRecommendation[]
    ): AlternativeSuggestion[] {
        const alternatives = this.buildAlternatives(coverage, request);

        // Add satellite-specific alternatives
        const freeSatellites = satelliteRecommendations.filter(
            (s) => s.pricing.archivePerKm2 === 0
        );

        if (freeSatellites.length > 0) {
            alternatives.unshift({
                id: 'free-alternative',
                approach: 'archive',
                summary: `Use free open data from ${freeSatellites[0].name}`,
                rationale: `${freeSatellites[0].name} provides free archive data with ${freeSatellites[0].resolution.multispectral}m resolution. While not premium quality, it can significantly reduce costs for exploratory analysis or large-scale projects.`,
            });
        }

        // Premium vs budget comparison
        if (satelliteRecommendations.length > 1) {
            const premium = satelliteRecommendations[0];
            const budget = satelliteRecommendations[satelliteRecommendations.length - 1];

            if (premium.pricing.archivePerKm2 && budget.pricing.archivePerKm2) {
                const savings = (premium.pricing.archivePerKm2 - budget.pricing.archivePerKm2) * (request.areaKm2 || 25);

                if (savings > 100) {
                    alternatives.push({
                        id: 'budget-alternative',
                        approach: 'archive',
                        summary: `Consider ${budget.name} for cost savings`,
                        rationale: `Switching from ${premium.name} to ${budget.name} could save approximately $${round(savings)}, with a trade-off in resolution (${Object.values(budget.resolution)[0]}m vs ${Object.values(premium.resolution)[0]}m).`,
                    });
                }
            }
        }

        return alternatives;
    }

    /**
     * Build enhanced summary with satellite information
     */
    private buildEnhancedSummary(
        feasible: boolean,
        coverage: CoverageDetails,
        recommendation: Recommendation,
        pricingOptions: PricingOption[],
        satelliteRecommendations: SatelliteRecommendation[]
    ): string {
        const baseSummary = this.buildSummary(feasible, coverage, recommendation, pricingOptions);
        
        if (satelliteRecommendations.length === 0) {
            return baseSummary;
        }

        const topSatellite = satelliteRecommendations[0];
        const satellitePart = `Best match: ${topSatellite.name} (${topSatellite.matchReason.split(';')[0]}).`;

        return `${baseSummary} ${satellitePart}`;
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

