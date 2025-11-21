import { skyfiClient } from '../integrations/skyfi/client';
import { osmClient } from '../integrations/osm/client';
import logger from '../utils/logger';
import { toGeoJsonPolygon } from '../utils/geojson';
import { ToolCall } from './openai.service';
import { searchSessionService } from './search-session.service';
import { orderHistoryService } from './order-history.service';
import { feasibilityService } from './feasibility.service';
import type { FeasibilityRequest, PricingExplorationRequest } from './feasibility.types';

export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    result: any;
    error?: string;
}

export interface ToolExecutionContext {
    conversationId?: string;
}

/**
 * Tool Executor - Executes tool calls from the LLM
 */
export class ToolExecutor {
    /**
     * Execute a single tool call
     */
    async executeTool(
        toolCall: ToolCall,
        context?: ToolExecutionContext
    ): Promise<ToolExecutionResult> {
        const { id, name, arguments: args } = toolCall;

        logger.info(`Executing tool: ${name}`, { toolCallId: id, arguments: args });

        try {
            let result: any;

            switch (name) {
                case 'search_satellite_imagery':
                    result = await this.searchSatelliteImagery(args, context);
                    break;

                case 'create_satellite_order':
                    result = await this.createSatelliteOrder(args);
                    break;

                case 'request_satellite_tasking':
                    result = await this.requestSatelliteTasking(args);
                    break;

                case 'get_order_status':
                    result = await this.getOrderStatus(args);
                    break;

                case 'list_orders':
                    result = await this.listOrders(args, context);
                    break;

                case 'estimate_price':
                    result = await this.estimatePrice(args);
                    break;

                case 'assess_task_feasibility':
                    result = await this.assessTaskFeasibility(args);
                    break;

                case 'explore_pricing_options':
                    result = await this.explorePricingOptions(args);
                    break;

                case 'get_tasking_status':
                    result = await this.getTaskingStatus(args);
                    break;

                case 'geocode_location':
                    result = await this.geocodeLocation(args);
                    break;

                case 'reverse_geocode_location':
                    result = await this.reverseGeocodeLocation(args);
                    break;

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            logger.info(`Tool execution successful: ${name}`, {
                toolCallId: id,
                resultSize: JSON.stringify(result).length,
            });

            return {
                toolCallId: id,
                toolName: name,
                result,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorName = error instanceof Error ? error.name : 'Unknown';

            logger.error(`Tool execution failed: ${name}`, {
                toolCallId: id,
                error: errorMessage,
                errorName,
                stack: errorStack,
                arguments: args,
            });

            return {
                toolCallId: id,
                toolName: name,
                result: null,
                error: errorMessage,
            };
        }
    }

    /**
     * Execute multiple tool calls in parallel
     */
    async executeTools(
        toolCalls: ToolCall[],
        context?: ToolExecutionContext
    ): Promise<ToolExecutionResult[]> {
        logger.info(`Executing ${toolCalls.length} tool(s)`);

        const results = await Promise.all(
            toolCalls.map((toolCall) => this.executeTool(toolCall, context))
        );

        return results;
    }

    /**
     * Search for satellite imagery in the archive
     */
    private async searchSatelliteImagery(
        args: any,
        context?: ToolExecutionContext
    ): Promise<any> {
        logger.info('searchSatelliteImagery called', { args });
        const conversationId = context?.conversationId ?? 'global';

        try {
            const response = await searchSessionService.runArchiveSearch(
                conversationId,
                args
            );

            logger.info('Archive search session updated', {
                conversationId,
                sessionId: response.sessionId,
                page: response.page.index,
                count: response.page.count,
                hasMore: response.page.hasMore,
            });

            return response;
        } catch (error) {
            logger.error('Iterative archive search failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args,
            });
            throw error;
        }
    }

    /**
     * Create an order for satellite imagery
     */
    private async createSatelliteOrder(args: any): Promise<any> {
        const params: any = {
            imageId: args.imageId,
        };

        if (args.deliveryFormat) {
            params.deliveryFormat = args.deliveryFormat;
        }

        if (args.processingLevel) {
            params.processingLevel = args.processingLevel;
        }

        if (args.webhookUrl) {
            params.webhookUrl = args.webhookUrl;
        }

        const order = await skyfiClient.createOrder(params);

        return {
            success: true,
            orderId: order.id,
            status: order.status,
            price: order.price,
            createdAt: order.createdAt,
            message: `Order created successfully. Order ID: ${order.id}`,
        };
    }

    /**
     * Request satellite tasking (new capture)
     */
    private async requestSatelliteTasking(args: any): Promise<any> {
        const params: any = {};

        if (args.location) {
            params.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                params.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon provided by tool call; skipping parameter');
            }
        }

        if (args.startDate) {
            params.startDate = args.startDate;
        }

        if (args.endDate) {
            params.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            params.resolution = args.resolution;
        }

        if (args.maxCloudCoverage !== undefined) {
            params.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (args.priority) {
            params.priority = args.priority;
        }

        const tasking = await skyfiClient.createTasking(params);

        return {
            success: true,
            taskingId: tasking.id,
            status: tasking.status,
            captureWindow: tasking.captureWindow,
            estimatedCost: tasking.estimatedCost,
            message: `Tasking request created. Task ID: ${tasking.id}`,
        };
    }

    /**
     * Get order status
     */
    private async getOrderStatus(args: any): Promise<any> {
        const order = await skyfiClient.getOrder(args.orderId);

        return {
            success: true,
            orderId: order.id,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            deliveryUrl: order.deliveryUrl,
            price: order.price,
            message: `Order status: ${order.status}`,
        };
    }

    /**
     * List orders with filters
     */
    private async listOrders(
        args: any,
        context?: ToolExecutionContext
    ): Promise<any> {
        const conversationId = context?.conversationId ?? 'global';

        try {
            const response = await orderHistoryService.listOrders(
                conversationId,
                args
            );

            logger.info('Order history session updated', {
                conversationId,
                sessionId: response.sessionId,
                page: response.page.index,
                count: response.page.count,
                hasMore: response.page.hasMore,
            });

            return response;
        } catch (error) {
            logger.error('Order history lookup failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args,
            });
            throw error;
        }
    }

    /**
     * Estimate pricing
     */
    private async estimatePrice(args: any): Promise<any> {
        const params: any = {
            type: args.type,
            areaKm2: args.areaKm2,
        };

        if (args.location) {
            params.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                params.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon provided for estimate_price; skipping parameter');
            }
        }

        if (args.startDate) {
            params.startDate = args.startDate;
        }

        if (args.endDate) {
            params.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            params.resolution = args.resolution;
        }

        if (args.processingLevel) {
            params.processingLevel = args.processingLevel;
        }

        if (args.priority) {
            params.priority = args.priority;
        }

        if (Array.isArray(args.satellites) && args.satellites.length > 0) {
            params.satellites = args.satellites;
        }

        const estimate = await skyfiClient.estimatePrice(params);

        return {
            success: true,
            estimatedPrice: estimate.estimatedPrice,
            currency: estimate.currency,
            breakdown: estimate.breakdown,
            message: `Estimated price: ${estimate.currency} ${estimate.estimatedPrice}`,
        };
    }

    /**
     * Assess task feasibility leveraging archive coverage and pricing insights
     */
    private async assessTaskFeasibility(args: any): Promise<any> {
        const request: FeasibilityRequest = {};

        if (args.location) {
            request.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                request.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon supplied to assess_task_feasibility');
            }
        }

        if (typeof args.areaKm2 === 'number') {
            request.areaKm2 = args.areaKm2;
        }

        if (args.startDate) {
            request.startDate = args.startDate;
        }

        if (args.endDate) {
            request.endDate = args.endDate;
        }

        if (args.maxCloudCoverage !== undefined) {
            request.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (args.resolution !== undefined) {
            request.resolution = args.resolution;
        }

        if (Array.isArray(args.satellites)) {
            request.satellites = args.satellites;
        }

        if (args.priority) {
            request.priority = args.priority;
        }

        if (args.processingLevel) {
            request.processingLevel = args.processingLevel;
        }

        const report = await feasibilityService.evaluateTaskFeasibility(request);

        return {
            success: true,
            summary: report.summary,
            feasible: report.feasible,
            confidence: report.confidence,
            recommendedApproach: report.recommendedApproach,
            coverage: report.coverage,
            weather: report.weather,
            pricingOptions: report.pricingOptions,
            risks: report.risks,
            alternatives: report.alternatives,
            metadata: report.metadata,
        };
    }

    /**
     * Explore pricing scenarios for archive/tasking combinations
     */
    private async explorePricingOptions(args: any): Promise<any> {
        const request: PricingExplorationRequest = {};

        if (args.location) {
            request.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                request.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon supplied to explore_pricing_options');
            }
        }

        if (typeof args.areaKm2 === 'number') {
            request.areaKm2 = args.areaKm2;
        }

        if (args.startDate) {
            request.startDate = args.startDate;
        }

        if (args.endDate) {
            request.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            request.resolution = args.resolution;
        }

        if (Array.isArray(args.satellites)) {
            request.satellites = args.satellites;
        }

        if (args.priority) {
            request.priority = args.priority;
        }

        if (args.processingLevel) {
            request.processingLevel = args.processingLevel;
        }

        if (args.maxCloudCoverage !== undefined) {
            request.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (typeof args.includeArchive === 'boolean') {
            request.includeArchive = args.includeArchive;
        }

        if (typeof args.includeTasking === 'boolean') {
            request.includeTasking = args.includeTasking;
        }

        const result = await feasibilityService.explorePricing(request);

        return {
            success: true,
            summary: result.summary,
            options: result.options,
            bestValue: result.bestValue,
            fastestTurnaround: result.fastestTurnaround,
            premiumOption: result.premiumOption,
        };
    }

    /**
     * Get tasking status
     */
    private async getTaskingStatus(args: any): Promise<any> {
        const tasking = await skyfiClient.getTasking(args.taskingId);

        return {
            success: true,
            taskingId: tasking.id,
            status: tasking.status,
            location: tasking.location,
            captureWindow: tasking.captureWindow,
            estimatedCost: tasking.estimatedCost,
            message: `Tasking status: ${tasking.status}`,
        };
    }

    /**
     * Geocode a location name to coordinates
     */
    private async geocodeLocation(args: any): Promise<any> {
        logger.info('geocodeLocation called', { query: args.query });

        try {
            const result = await osmClient.geocode(args.query);

            if (!result) {
                logger.warn('Geocoding returned no result', { query: args.query });
                return {
                    success: false,
                    message: `Could not find location: ${args.query}`,
                };
            }

            logger.info('Geocoding succeeded', {
                query: args.query,
                location: result.displayName,
                coordinates: [result.lon, result.lat]
            });

            return {
                success: true,
                location: {
                    name: result.displayName,
                    latitude: result.lat,
                    longitude: result.lon,
                    coordinates: [result.lon, result.lat],
                    boundingBox: result.boundingBox,
                },
                message: `Found location: ${result.displayName}`,
            };
        } catch (error) {
            logger.error('geocodeLocation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                query: args.query
            });
            throw error;
        }
    }

    /**
     * Reverse geocode coordinates to address
     */
    private async reverseGeocodeLocation(args: any): Promise<any> {
        logger.info('reverseGeocodeLocation called', { args });

        try {
            const result = await osmClient.reverseGeocode(args.latitude, args.longitude);

            if (!result) {
                logger.warn('Reverse geocoding returned no result', { args });
                return {
                    success: false,
                    message: `Could not find address for coordinates: ${args.latitude}, ${args.longitude}`,
                };
            }

            logger.info('Reverse geocoding succeeded', {
                args,
                address: result.displayName
            });

            return {
                success: true,
                location: {
                    name: result.displayName,
                    address: result.address,
                    latitude: result.lat,
                    longitude: result.lon,
                },
                message: `Found address: ${result.displayName}`,
            };
        } catch (error) {
            logger.error('reverseGeocodeLocation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args
            });
            throw error;
        }
    }
}

// Singleton instance
export const toolExecutor = new ToolExecutor();

