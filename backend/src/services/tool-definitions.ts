import { ChatCompletionTool } from 'openai/resources/chat';

const createGeoJsonPointParameter = (description: string) => ({
    type: 'object',
    description,
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
});

const createGeoJsonPolygonParameter = (description: string) => ({
    type: 'object',
    description,
    properties: {
        type: {
            type: 'string',
            enum: ['Polygon'],
            description: 'GeoJSON geometry type. Defaults to Polygon.',
        },
        coordinates: {
            type: 'array',
            description:
                'Ordered polygon rings. Provide the outer ring first, then optional interior rings marked as holes.',
            minItems: 1,
            items: {
                type: 'object',
                description:
                    'Polygon ring definition with coordinate pairs and optional role metadata.',
                properties: {
                    role: {
                        type: 'string',
                        enum: ['outer', 'hole'],
                        description:
                            'Classify the ring as the outer boundary or an interior hole.',
                    },
                    points: {
                        type: 'array',
                        description:
                            'Ordered [longitude, latitude] coordinate pairs forming the ring. Provide at least four points; the first and last point should match.',
                        minItems: 4,
                        items: {
                            type: 'array',
                            description: 'Coordinate pair [longitude, latitude]',
                            minItems: 2,
                            maxItems: 2,
                            items: {
                                type: 'number',
                            },
                        },
                    },
                },
                required: ['points'],
                additionalProperties: false,
            },
        },
    },
    required: ['coordinates'],
    additionalProperties: false,
});

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
                'Search for satellite imagery in the SkyFi archive. Supports iterative sessions so you can refine filters or page through prior results by supplying a sessionId. Returns detailed imagery metadata, pagination context, and history when requested.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Existing search session identifier to continue or refine.',
                    },
                    location: {
                        ...createGeoJsonPointParameter(
                            'Geographic location to search (GeoJSON Point)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon (GeoJSON Polygon). Supply one outer ring and optional inner rings (holes).'
                        ),
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
                    satellites: {
                        type: 'array',
                        description: 'Restrict search to specific satellites/sensors',
                        items: {
                            type: 'string',
                        },
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return',
                        default: 10,
                    },
                    offset: {
                        type: 'number',
                        description: 'Offset to apply for pagination (0-based)',
                    },
                    page: {
                        type: 'number',
                        description: 'Page number to request (1-based). Overrides offset if provided.',
                    },
                    action: {
                        type: 'string',
                        enum: ['next', 'previous', 'current', 'first'],
                        description: 'Navigate existing session pages relative to the current position.',
                    },
                    includeHistory: {
                        type: 'boolean',
                        description: 'Include search history summaries in the response.',
                        default: false,
                    },
                    refinements: {
                        type: 'object',
                        description: 'Additional filters to merge into an existing session.',
                        additionalProperties: true,
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
                        ...createGeoJsonPointParameter(
                            'Target location for satellite capture (GeoJSON Point)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon (GeoJSON Polygon). Supply one outer ring and optional inner rings (holes).'
                        ),
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
                'Explore satellite imagery orders with filters and pagination. Supports iterative sessions via sessionId for reviewing previous pages, refining filters, and retrieving download links for completed orders.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Existing order session identifier to continue exploring history.',
                    },
                    status: {
                        type: 'string',
                        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
                        description: 'Filter orders by status',
                    },
                    startDate: {
                        type: 'string',
                        description: 'Filter orders created on or after this ISO 8601 date',
                    },
                    endDate: {
                        type: 'string',
                        description: 'Filter orders created on or before this ISO 8601 date',
                    },
                    satellite: {
                        type: 'string',
                        description: 'Filter by satellite or sensor identifier',
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
                    page: {
                        type: 'number',
                        description: 'Page number to request (1-based). Overrides offset when provided.',
                    },
                    action: {
                        type: 'string',
                        enum: ['next', 'previous', 'current', 'first'],
                        description: 'Navigate existing session pages relative to the current position.',
                    },
                    includeHistory: {
                        type: 'boolean',
                        description: 'Include applied filter history in the response.',
                        default: false,
                    },
                    refinements: {
                        type: 'object',
                        description: 'Additional filters to merge into the active session.',
                        additionalProperties: true,
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
                    location: {
                        ...createGeoJsonPointParameter(
                            'Representative point inside the area of interest (GeoJSON Point)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon to approximate pricing footprint'
                        ),
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
                    startDate: {
                        type: 'string',
                        description: 'Earliest requested acquisition date (ISO 8601)',
                    },
                    endDate: {
                        type: 'string',
                        description: 'Latest requested acquisition date (ISO 8601)',
                    },
                    satellites: {
                        type: 'array',
                        description: 'Preferred satellites or constellations to evaluate',
                        items: {
                            type: 'string',
                        },
                    },
                },
                required: ['type', 'areaKm2'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'assess_task_feasibility',
            description:
                'Evaluate whether an imaging task is feasible given constraints. Returns archive coverage insights, weather risk, pricing options, risks, and alternative strategies to help decide on archive vs. tasking.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        ...createGeoJsonPointParameter(
                            'Representative point inside the area of interest (GeoJSON Point)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon for feasibility assessment'
                        ),
                    },
                    areaKm2: {
                        type: 'number',
                        description:
                            'Approximate area size in square kilometers. Optional if AOI is provided.',
                    },
                    startDate: {
                        type: 'string',
                        description: 'Earliest acceptable capture date (ISO 8601).',
                    },
                    endDate: {
                        type: 'string',
                        description: 'Latest acceptable capture date (ISO 8601).',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Maximum acceptable cloud coverage (0-100).',
                        minimum: 0,
                        maximum: 100,
                    },
                    resolution: {
                        type: 'number',
                        description: 'Desired resolution in meters per pixel.',
                    },
                    satellites: {
                        type: 'array',
                        description: 'Preferred satellites or constellations to consider.',
                        items: {
                            type: 'string',
                        },
                    },
                    priority: {
                        type: 'string',
                        enum: ['standard', 'rush', 'urgent'],
                        description: 'Desired tasking priority for turnaround analysis.',
                    },
                    processingLevel: {
                        type: 'string',
                        enum: ['raw', 'orthorectified', 'pansharpened'],
                        description: 'Required processing level for delivered imagery.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'explore_pricing_options',
            description:
                'Compare archive and tasking pricing scenarios with turnaround estimates. Returns ranked pricing options, best-value pick, fastest turnaround, and premium alternatives for the requested parameters.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        ...createGeoJsonPointParameter(
                            'Representative point inside the area of interest (GeoJSON Point)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon to evaluate pricing footprint'
                        ),
                    },
                    areaKm2: {
                        type: 'number',
                        description:
                            'Approximate area size in square kilometers. Optional if AOI is provided.',
                    },
                    startDate: {
                        type: 'string',
                        description: 'Earliest acquisition date to consider (ISO 8601).',
                    },
                    endDate: {
                        type: 'string',
                        description: 'Latest acquisition date to consider (ISO 8601).',
                    },
                    resolution: {
                        type: 'number',
                        description: 'Desired resolution in meters per pixel.',
                    },
                    satellites: {
                        type: 'array',
                        description: 'Preferred satellites or constellations to evaluate.',
                        items: {
                            type: 'string',
                        },
                    },
                    priority: {
                        type: 'string',
                        enum: ['standard', 'rush', 'urgent'],
                        description: 'Desired tasking priority.',
                    },
                    processingLevel: {
                        type: 'string',
                        enum: ['raw', 'orthorectified', 'pansharpened'],
                        description: 'Processing level for delivered imagery.',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Target cloud coverage threshold (0-100).',
                        minimum: 0,
                        maximum: 100,
                    },
                    includeArchive: {
                        type: 'boolean',
                        description: 'Include archive pricing scenarios in the comparison.',
                        default: true,
                    },
                    includeTasking: {
                        type: 'boolean',
                        description: 'Include tasking pricing scenarios in the comparison.',
                        default: true,
                    },
                },
                required: [],
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
    {
        type: 'function',
        function: {
            name: 'reverse_geocode_location',
            description:
                'Convert geographic coordinates into an address or place name. Use this to find out what is at a specific location.',
            parameters: {
                type: 'object',
                properties: {
                    latitude: {
                        type: 'number',
                        description: 'Latitude of the location',
                    },
                    longitude: {
                        type: 'number',
                        description: 'Longitude of the location',
                    },
                },
                required: ['latitude', 'longitude'],
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
