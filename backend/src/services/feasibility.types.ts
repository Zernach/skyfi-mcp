import type { GeoJSON, PriceEstimate, PriceEstimateType, PriorityLevel, ProcessingLevel } from '../integrations/skyfi/types';
import type { GeoJsonPolygon } from '../utils/geojson';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type Recommendation =
    | 'archive'
    | 'tasking'
    | 'hybrid'
    | 'insufficient_data';

export interface FeasibilityRequest {
    location?: GeoJSON;
    aoi?: GeoJsonPolygon;
    areaKm2?: number;
    startDate?: string;
    endDate?: string;
    maxCloudCoverage?: number;
    resolution?: number;
    satellites?: string[];
    priority?: PriorityLevel;
    processingLevel?: ProcessingLevel;
}

export interface CoverageDetails {
    availableScenes: number;
    bestCloudCover?: number;
    averageCloudCover?: number;
    bestResolution?: number;
    newestCapture?: string;
    satellites?: string[];
    notes: string[];
}

export interface WeatherInsight {
    riskLevel: 'low' | 'medium' | 'high';
    averageCloudCover?: number;
    exceedsThreshold?: boolean;
    notes: string[];
}

export interface RiskItem {
    level: 'low' | 'medium' | 'high';
    summary: string;
    detail?: string;
}

export interface AlternativeSuggestion {
    id: string;
    approach: Recommendation;
    summary: string;
    rationale: string;
}

export interface PricingOption {
    approach: PriceEstimateType | 'hybrid';
    total: number;
    currency: string;
    breakdown: PriceEstimate['breakdown'];
    label: 'lowest' | 'balanced' | 'premium';
    estimatedTurnaroundDays?: number;
    savingsVsArchive?: number;
    savingsVsTasking?: number;
    assumptions: string[];
}

export interface FeasibilityReport {
    feasible: boolean;
    confidence: ConfidenceLevel;
    recommendedApproach: Recommendation;
    summary: string;
    coverage: CoverageDetails;
    weather: WeatherInsight;
    pricingOptions: PricingOption[];
    satelliteRecommendations?: SatelliteRecommendation[];
    risks: RiskItem[];
    alternatives: AlternativeSuggestion[];
    metadata: {
        areaKm2?: number;
        inputs: Record<string, unknown>;
        satelliteAnalysis?: {
            recommended: string[];
            totalEvaluated: number;
        };
    };
}

export interface PricingExplorationRequest extends FeasibilityRequest {
    includeTasking?: boolean;
    includeArchive?: boolean;
}

export interface PricingExplorationResult {
    options: PricingOption[];
    summary: string;
    bestValue: PricingOption | null;
    fastestTurnaround: PricingOption | null;
    premiumOption: PricingOption | null;
    satelliteRecommendations?: SatelliteRecommendation[];
    tradeoffAnalysis?: {
        costVsQuality: string[];
        costVsSpeed: string[];
        qualityVsSpeed: string[];
        recommendations: string[];
    };
}

export interface SatelliteRecommendation {
    name: string;
    operator: string;
    score: number;
    matchReason: string;
    resolution: {
        panchromatic?: number;
        multispectral?: number;
        sar?: number;
    };
    pricing: {
        archivePerKm2?: number;
        taskingPerKm2?: number;
        minimumOrder?: number;
    };
    capabilities: string[];
    idealFor: string[];
    limitations: string[];
    revisitTime: number;
    swathWidth: number;
    spectralBands: number;
    availability: {
        hasArchiveData: boolean;
        nextPassEstimate?: string;
        constraintsMet: boolean;
    };
    tradeoffs: {
        pros: string[];
        cons: string[];
    };
}

