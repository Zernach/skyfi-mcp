import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * SkyFi API Tool Definitions for OpenAI Function Calling
 * These tools allow the LLM to interact with the SkyFi API
 */

export const skyfiTools: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'search_satellite_imagery',
            description:
                'Search for satellite imagery in the SkyFi archive. Use this to find existing satellite images of a location, time period, or area of interest. Returns available imagery with metadata like resolution, cloud coverage, and pricing.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'object',
                        description: 'Geographic location to search (GeoJSON Point)',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['Point'],
                            },
                            coordinates: {
                                type: 'array',
                                description: 'Longitude and latitude [lon, lat]',
                                items: {
                                    type: 'number',
                                },
                                minItems: 2,
                                maxItems: 2,
                            },
                        },
                        required: ['type', 'coordinates'],
                        additionalProperties: false,
                    },
                    aoi: {
                        type: 'object',
                        description:
                            'Area of interest polygon (GeoJSON Polygon). Provide coordinates as an array of linear rings (arrays of [lon, lat] pairs). The first ring is the outer boundary; subsequent rings carve interior holes.',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['Polygon'],
                            },
                            coordinates: {
                                type: 'array',
                                description:
                                    'Polygon coordinates defined as an array of rings. Supply the outer boundary first, followed by any interior holes.',
                                minItems: 1,
                                items: {
                                    type: 'array',
                                    description:
                                        'Linear ring represented as an ordered array of coordinate pairs. Provide at least four coordinate pairs and ensure the first and last pairs match.',
                                    minItems: 4,
                                    items: {
                                        type: 'array',
                                        description: 'Coordinate pair [longitude, latitude]',
                                        items: {
                                            type: 'number',
                                        },
                                        minItems: 2,
                                        maxItems: 2,
                                    },
                                },
                            },
                        },
                        required: ['type', 'coordinates'],
                        additionalProperties: false,
                    },
                    startDate: {
                        type: 'string',
                        description: 'Start date for search (ISO 8601 format: YYYY-MM-DD)',
                    },
                    endDate: {
                        type: 'string',
                        description: 'End date for search (ISO 8601 format: YYYY-MM-DD)',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Maximum cloud coverage percentage (0-100)',
                        minimum: 0,
                        maximum: 100,
                    },
                    minResolution: {
                        type: 'number',
                        description: 'Minimum resolution in meters per pixel',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return',
                        default: 10,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_satellite_order',
            description:
                'Create an order to purchase satellite imagery from the SkyFi archive. Use this after searching for imagery to actually acquire the data. Requires image ID and delivery preferences.',
            parameters: {
                type: 'object',
                properties: {
                    imageId: {
                        type: 'string',
                        description: 'ID of the satellite image to order',
                    },
                    deliveryFormat: {
                        type: 'string',
                        enum: ['GeoTIFF', 'PNG', 'JPEG', 'COG'],
                        description: 'Desired format for image delivery',
                        default: 'GeoTIFF',
                    },
                    processingLevel: {
                        type: 'string',
                        enum: ['raw', 'orthorectified', 'pansharpened'],
                        description: 'Level of image processing',
                        default: 'orthorectified',
                    },
                    webhookUrl: {
                        type: 'string',
                        description: 'URL to receive order status updates',
                    },
                },
                required: ['imageId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'request_satellite_tasking',
            description:
                'Request a new satellite capture (tasking) for a specific location and time. Use this when no suitable archive imagery exists and you need fresh satellite data. More expensive than archive imagery but provides custom captures.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'object',
                        description: 'Target location for satellite capture (GeoJSON Point)',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['Point'],
                            },
                            coordinates: {
                                type: 'array',
                                description: 'Longitude and latitude [lon, lat]',
                                items: {
                                    type: 'number',
                                },
                                minItems: 2,
                                maxItems: 2,
                            },
                        },
                        required: ['type', 'coordinates'],
                        additionalProperties: false,
                    },
                    aoi: {
                        type: 'object',
                        description:
                            'Area of interest for capture (GeoJSON Polygon). Provide coordinates as an array of linear rings (arrays of [lon, lat] pairs). The first ring is the outer boundary; subsequent rings carve interior holes.',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['Polygon'],
                            },
                            coordinates: {
                                type: 'array',
                                description:
                                    'Polygon coordinates defined as an array of rings. Supply the outer boundary first, followed by any interior holes.',
                                minItems: 1,
                                items: {
                                    type: 'array',
                                    description:
                                        'Linear ring represented as an ordered array of coordinate pairs. Provide at least four coordinate pairs and ensure the first and last pairs match.',
                                    minItems: 4,
                                    items: {
                                        type: 'array',
                                        description: 'Coordinate pair [longitude, latitude]',
                                        items: {
                                            type: 'number',
                                        },
                                        minItems: 2,
                                        maxItems: 2,
                                    },
                                },
                            },
                        },
                        required: ['type', 'coordinates'],
                        additionalProperties: false,
                    },
                    startDate: {
                        type: 'string',
                        description: 'Earliest acceptable capture date (ISO 8601)',
                    },
                    endDate: {
                        type: 'string',
                        description: 'Latest acceptable capture date (ISO 8601)',
                    },
                    resolution: {
                        type: 'number',
                        description: 'Desired resolution in meters per pixel',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Maximum acceptable cloud coverage (0-100)',
                        maximum: 100,
                    },
                    priority: {
                        type: 'string',
                        enum: ['standard', 'rush', 'urgent'],
                        description: 'Priority level for tasking request',
                        default: 'standard',
                    },
                },
                required: ['location'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_order_status',
            description:
                'Check the status of an existing satellite imagery order. Use this to track order progress, delivery status, and download links.',
            parameters: {
                type: 'object',
                properties: {
                    orderId: {
                        type: 'string',
                        description: 'The order ID to check status for',
                    },
                },
                required: ['orderId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_orders',
            description:
                'List all satellite imagery orders with optional filters. Use this to view order history, find orders by status, or see all pending orders.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
                        description: 'Filter orders by status',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of orders to return',
                        default: 20,
                    },
                    offset: {
                        type: 'number',
                        description: 'Number of orders to skip (for pagination)',
                        default: 0,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'estimate_price',
            description:
                'Estimate the price for satellite imagery order or tasking request. Use this before creating orders to inform users of costs. Considers area size, resolution, processing level, and urgency.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['archive', 'tasking'],
                        description: 'Type of request to estimate',
                    },
                    areaKm2: {
                        type: 'number',
                        description: 'Area size in square kilometers',
                    },
                    resolution: {
                        type: 'number',
                        description: 'Resolution in meters per pixel',
                    },
                    processingLevel: {
                        type: 'string',
                        enum: ['raw', 'orthorectified', 'pansharpened'],
                        description: 'Processing level',
                    },
                    priority: {
                        type: 'string',
                        enum: ['standard', 'rush', 'urgent'],
                        description: 'Priority/urgency level',
                    },
                },
                required: ['type', 'areaKm2'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_tasking_status',
            description:
                'Check the status of a satellite tasking request. Use this to track when the satellite will capture imagery, weather conditions, and capture success.',
            parameters: {
                type: 'object',
                properties: {
                    taskingId: {
                        type: 'string',
                        description: 'The tasking request ID to check',
                    },
                },
                required: ['taskingId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'geocode_location',
            description:
                'Convert a place name or address into geographic coordinates. Use this when users provide location names instead of coordinates. Returns latitude, longitude, and bounding box.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Place name, address, or location description to geocode',
                    },
                    country: {
                        type: 'string',
                        description: 'Optional country code to limit search (e.g., "US", "UK")',
                    },
                },
                required: ['query'],
            },
        },
    },
];

/**
 * Get all available tool names
 */
export function getToolNames(): string[] {
    return skyfiTools.map((tool) => {
        if ('function' in tool) {
            return tool.function.name;
        }
        throw new Error('Unsupported tool type');
    });
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ChatCompletionTool | undefined {
    return skyfiTools.find((tool) => {
        if ('function' in tool) {
            return tool.function.name === name;
        }
        return false;
    });
}
