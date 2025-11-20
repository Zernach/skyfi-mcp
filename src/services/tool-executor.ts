import { skyfiClient } from '../integrations/skyfi/client';
import { osmClient } from '../integrations/osm/client';
import logger from '../utils/logger';
import { toGeoJsonPolygon } from '../utils/geojson';
import { ToolCall } from './openai.service';

export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    result: any;
    error?: string;
}

/**
 * Tool Executor - Executes tool calls from the LLM
 */
export class ToolExecutor {
    /**
     * Execute a single tool call
     */
    async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
        const { id, name, arguments: args } = toolCall;

        logger.info(`Executing tool: ${name}`, { toolCallId: id, arguments: args });

        try {
            let result: any;

            switch (name) {
                case 'search_satellite_imagery':
                    result = await this.searchSatelliteImagery(args);
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
                    result = await this.listOrders(args);
                    break;

                case 'estimate_price':
                    result = await this.estimatePrice(args);
                    break;

                case 'get_tasking_status':
                    result = await this.getTaskingStatus(args);
                    break;

                case 'geocode_location':
                    result = await this.geocodeLocation(args);
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
            logger.error(`Tool execution failed: ${name}`, {
                toolCallId: id,
                error: errorMessage,
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
    async executeTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
        logger.info(`Executing ${toolCalls.length} tool(s)`);

        const results = await Promise.all(
            toolCalls.map((toolCall) => this.executeTool(toolCall))
        );

        return results;
    }

    /**
     * Search for satellite imagery in the archive
     */
    private async searchSatelliteImagery(args: any): Promise<any> {
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

        if (args.maxCloudCoverage !== undefined) {
            params.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (args.minResolution !== undefined) {
            params.minResolution = args.minResolution;
        }

        if (args.limit !== undefined) {
            params.limit = args.limit;
        }

        const response = await skyfiClient.archiveSearch(params);

        return {
            success: true,
            count: response.results?.length || 0,
            results: response.results?.map((img) => ({
                id: img.id,
                captureDate: img.captureDate,
                resolution: img.resolution,
                cloudCover: img.cloudCover,
                satellite: img.satellite,
                price: img.price,
                bbox: img.bbox,
            })),
            message: `Found ${response.results?.length || 0} satellite images matching your criteria`,
        };
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
    private async listOrders(args: any): Promise<any> {
        const filters: any = {};

        if (args.status) {
            filters.status = args.status;
        }

        if (args.limit !== undefined) {
            filters.limit = args.limit;
        }

        if (args.offset !== undefined) {
            filters.offset = args.offset;
        }

        const orders = await skyfiClient.listOrders(filters);

        return {
            success: true,
            count: orders.length,
            orders: orders.map((order) => ({
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                price: order.price,
            })),
            message: `Found ${orders.length} order(s)`,
        };
    }

    /**
     * Estimate pricing
     */
    private async estimatePrice(args: any): Promise<any> {
        const params: any = {
            type: args.type,
            areaKm2: args.areaKm2,
        };

        if (args.resolution !== undefined) {
            params.resolution = args.resolution;
        }

        if (args.processingLevel) {
            params.processingLevel = args.processingLevel;
        }

        if (args.priority) {
            params.priority = args.priority;
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
        const result = await osmClient.geocode(args.query);

        if (!result) {
            return {
                success: false,
                message: `Could not find location: ${args.query}`,
            };
        }

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
    }
}

// Singleton instance
export const toolExecutor = new ToolExecutor();

