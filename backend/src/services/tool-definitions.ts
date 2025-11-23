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
                'Array of linear rings. First ring is outer boundary, subsequent rings are holes. Each ring is an array of [longitude, latitude] coordinate pairs. The first and last coordinates must be identical to close the ring.',
            minItems: 1,
            items: {
                type: 'array',
                description: 'Linear ring as array of [lon, lat] coordinate pairs',
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
                '⚠️ IMPORTANT: ONLY call this tool AFTER calling confirm_order_with_pricing AND receiving explicit user confirmation (e.g., "yes", "proceed", "confirm", "order it"). This creates a real order that will charge the user. Use confirm_order_with_pricing first to show pricing, then wait for user approval before calling this.',
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
                '⚠️ IMPORTANT: ONLY call this tool AFTER calling confirm_order_with_pricing with orderType="tasking" AND receiving explicit user confirmation. This creates a real tasking request that will charge the user. Request a new satellite capture (tasking) for a specific location and time. Use this when no suitable archive imagery exists and you need fresh satellite data. More expensive than archive imagery but provides custom captures.',
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
    {
        type: 'function',
        function: {
            name: 'confirm_order_with_pricing',
            description:
                'Pre-order confirmation that validates feasibility, provides detailed pricing breakdown, and checks for potential issues before actual order placement. Always use this before creating an order to inform users of costs and feasibility.',
            parameters: {
                type: 'object',
                properties: {
                    imageId: {
                        type: 'string',
                        description: 'ID of the satellite image to order (for archive orders)',
                    },
                    location: {
                        ...createGeoJsonPointParameter(
                            'Target location (for tasking orders)'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon (for tasking orders)'
                        ),
                    },
                    orderType: {
                        type: 'string',
                        enum: ['archive', 'tasking'],
                        description: 'Type of order to confirm',
                    },
                    deliveryFormat: {
                        type: 'string',
                        enum: ['GeoTIFF', 'PNG', 'JPEG', 'COG'],
                        description: 'Desired format for image delivery',
                    },
                    processingLevel: {
                        type: 'string',
                        enum: ['raw', 'orthorectified', 'pansharpened'],
                        description: 'Level of image processing',
                    },
                    priority: {
                        type: 'string',
                        enum: ['standard', 'rush', 'urgent'],
                        description: 'Priority level for tasking orders',
                    },
                    startDate: {
                        type: 'string',
                        description: 'Start date for tasking window (ISO 8601)',
                    },
                    endDate: {
                        type: 'string',
                        description: 'End date for tasking window (ISO 8601)',
                    },
                    resolution: {
                        type: 'number',
                        description: 'Desired resolution in meters per pixel',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Maximum acceptable cloud coverage (0-100)',
                    },
                },
                required: ['orderType'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'setup_aoi_monitoring',
            description:
                'Set up monitoring for an Area of Interest (AOI). Get notified via webhook when new satellite data becomes available for your specified location and criteria. Useful for continuous monitoring of locations.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Descriptive name for this monitoring area',
                    },
                    geometry: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest polygon to monitor'
                        ),
                    },
                    description: {
                        type: 'string',
                        description: 'Optional description of monitoring purpose',
                    },
                    webhookUrl: {
                        type: 'string',
                        description: 'URL to receive notifications when new data is available',
                    },
                    webhookEvents: {
                        type: 'array',
                        description: 'Events to trigger webhook notifications',
                        items: {
                            type: 'string',
                            enum: ['aoi.data.available', 'aoi.capture.scheduled', 'aoi.capture.completed'],
                        },
                        default: ['aoi.data.available'],
                    },
                    maxCloudCover: {
                        type: 'number',
                        description: 'Maximum acceptable cloud coverage for notifications (0-100)',
                        minimum: 0,
                        maximum: 100,
                    },
                    minResolution: {
                        type: 'number',
                        description: 'Minimum resolution in meters per pixel for notifications',
                    },
                    monitoringFrequency: {
                        type: 'string',
                        enum: ['daily', 'weekly', 'monthly', 'continuous'],
                        description: 'How often to check for new data',
                        default: 'daily',
                    },
                    satellites: {
                        type: 'array',
                        description: 'Specific satellites to monitor',
                        items: {
                            type: 'string',
                        },
                    },
                },
                required: ['name', 'geometry', 'webhookUrl'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_aoi_monitors',
            description:
                'List all active Area of Interest (AOI) monitoring setups. Shows monitoring configurations, webhook status, and recent activity.',
            parameters: {
                type: 'object',
                properties: {
                    activeOnly: {
                        type: 'boolean',
                        description: 'Only return active monitoring setups',
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
            name: 'update_aoi_monitoring',
            description:
                'Update an existing AOI monitoring setup. Modify criteria, webhooks, or pause/resume monitoring.',
            parameters: {
                type: 'object',
                properties: {
                    aoiId: {
                        type: 'string',
                        description: 'ID of the AOI monitoring setup to update',
                    },
                    name: {
                        type: 'string',
                        description: 'New name for the monitoring area',
                    },
                    description: {
                        type: 'string',
                        description: 'New description',
                    },
                    active: {
                        type: 'boolean',
                        description: 'Activate or deactivate the monitoring',
                    },
                    maxCloudCover: {
                        type: 'number',
                        description: 'Updated maximum cloud coverage threshold',
                        minimum: 0,
                        maximum: 100,
                    },
                    minResolution: {
                        type: 'number',
                        description: 'Updated minimum resolution requirement',
                    },
                },
                required: ['aoiId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_aoi_monitoring',
            description:
                'Delete an AOI monitoring setup and stop all notifications. This action deactivates the monitoring but preserves historical data.',
            parameters: {
                type: 'object',
                properties: {
                    aoiId: {
                        type: 'string',
                        description: 'ID of the AOI monitoring setup to delete',
                    },
                },
                required: ['aoiId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_webhook',
            description:
                'Create a webhook to receive real-time notifications for SkyFi events. Supports order completion, new imagery availability, tasking updates, and AOI triggers. Essential for automation and integration with external systems.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'HTTPS URL where webhook notifications will be sent (must be publicly accessible)',
                    },
                    events: {
                        type: 'array',
                        description: 'Event types to subscribe to',
                        items: {
                            type: 'string',
                            enum: [
                                'order.created',
                                'order.processing',
                                'order.completed',
                                'order.failed',
                                'tasking.scheduled',
                                'tasking.captured',
                                'tasking.failed',
                                'imagery.available',
                                'aoi.data.available',
                                'aoi.capture.scheduled',
                                'aoi.capture.completed'
                            ],
                        },
                        minItems: 1,
                    },
                    aoiId: {
                        type: 'string',
                        description: 'Optional: Limit webhook to specific AOI monitoring setup',
                    },
                    secret: {
                        type: 'string',
                        description: 'Optional: Secret key for webhook signature verification (HMAC-SHA256)',
                    },
                    description: {
                        type: 'string',
                        description: 'Optional: Description of webhook purpose',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Optional: Custom metadata to include with each notification',
                        additionalProperties: true,
                    },
                },
                required: ['url', 'events'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_webhooks',
            description:
                'List all registered webhooks and their configurations. Shows event subscriptions, delivery status, recent activity, and any delivery failures.',
            parameters: {
                type: 'object',
                properties: {
                    active: {
                        type: 'boolean',
                        description: 'Filter by active/inactive status',
                    },
                    aoiId: {
                        type: 'string',
                        description: 'Filter webhooks associated with specific AOI',
                    },
                    includeInactive: {
                        type: 'boolean',
                        description: 'Include inactive webhooks in results',
                        default: false,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_webhook',
            description:
                'Delete a webhook registration and stop all future notifications to the specified endpoint. This action cannot be undone.',
            parameters: {
                type: 'object',
                properties: {
                    webhookId: {
                        type: 'string',
                        description: 'ID of the webhook to delete',
                    },
                },
                required: ['webhookId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'test_webhook',
            description:
                'Send a test notification to a webhook endpoint to verify it is properly configured and can receive events.',
            parameters: {
                type: 'object',
                properties: {
                    webhookId: {
                        type: 'string',
                        description: 'ID of the webhook to test',
                    },
                },
                required: ['webhookId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_satellite_capabilities',
            description:
                'Get detailed information about available satellites and their capabilities. Returns resolution, spectral bands, revisit frequency, swath width, and operational status. Useful for selecting the best satellite for your needs.',
            parameters: {
                type: 'object',
                properties: {
                    satellite: {
                        type: 'string',
                        description: 'Optional: Get details for a specific satellite (e.g., "WorldView-3", "Sentinel-2")',
                    },
                    minResolution: {
                        type: 'number',
                        description: 'Optional: Filter satellites with resolution better than this value (meters)',
                    },
                    maxResolution: {
                        type: 'number',
                        description: 'Optional: Filter satellites with resolution up to this value (meters)',
                    },
                    includeInactive: {
                        type: 'boolean',
                        description: 'Include inactive or decommissioned satellites',
                        default: false,
                    },
                    capability: {
                        type: 'string',
                        enum: ['optical', 'sar', 'multispectral', 'hyperspectral', 'thermal'],
                        description: 'Filter by specific imaging capability',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'compare_satellites',
            description:
                'Compare specifications and capabilities of multiple satellites side-by-side. Helps choose the best satellite for specific use cases like agriculture, disaster response, or infrastructure monitoring.',
            parameters: {
                type: 'object',
                properties: {
                    satellites: {
                        type: 'array',
                        description: 'Array of satellite names to compare',
                        items: {
                            type: 'string',
                        },
                        minItems: 2,
                        maxItems: 5,
                    },
                    compareBy: {
                        type: 'array',
                        description: 'Specific attributes to compare',
                        items: {
                            type: 'string',
                            enum: ['resolution', 'spectral_bands', 'revisit_time', 'swath_width', 'pricing', 'availability'],
                        },
                    },
                },
                required: ['satellites'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'recommend_satellite',
            description:
                'Get satellite recommendations based on your specific requirements. The system will analyze your needs and suggest the best satellites, considering trade-offs between resolution, cost, coverage, and availability.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        ...createGeoJsonPointParameter(
                            'Target location for satellite recommendations'
                        ),
                    },
                    aoi: {
                        ...createGeoJsonPolygonParameter(
                            'Area of interest for coverage requirements'
                        ),
                    },
                    useCase: {
                        type: 'string',
                        enum: [
                            'agriculture',
                            'disaster_response',
                            'infrastructure',
                            'environmental',
                            'defense',
                            'urban_planning',
                            'change_detection',
                            'general'
                        ],
                        description: 'Primary use case for satellite imagery',
                    },
                    priority: {
                        type: 'string',
                        enum: ['resolution', 'cost', 'coverage', 'availability', 'balanced'],
                        description: 'What matters most in satellite selection',
                        default: 'balanced',
                    },
                    maxBudget: {
                        type: 'number',
                        description: 'Maximum budget in USD',
                    },
                    minResolution: {
                        type: 'number',
                        description: 'Minimum acceptable resolution in meters',
                    },
                    maxCloudCoverage: {
                        type: 'number',
                        description: 'Maximum acceptable cloud coverage percentage',
                        minimum: 0,
                        maximum: 100,
                    },
                    urgency: {
                        type: 'string',
                        enum: ['standard', 'urgent', 'critical'],
                        description: 'How quickly imagery is needed',
                        default: 'standard',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'batch_create_orders',
            description:
                'Create multiple satellite imagery orders in a single batch operation. More efficient than creating orders individually. Returns summary of successful/failed orders with detailed status for each. Maximum 50 orders per batch.',
            parameters: {
                type: 'object',
                properties: {
                    orders: {
                        type: 'array',
                        description: 'Array of order specifications',
                        items: {
                            type: 'object',
                            properties: {
                                imageId: {
                                    type: 'string',
                                    description: 'ID of satellite image to order',
                                },
                                deliveryFormat: {
                                    type: 'string',
                                    enum: ['GeoTIFF', 'PNG', 'JPEG', 'COG'],
                                    description: 'Desired delivery format',
                                    default: 'GeoTIFF',
                                },
                                processingLevel: {
                                    type: 'string',
                                    enum: ['raw', 'orthorectified', 'pansharpened'],
                                    description: 'Level of image processing',
                                    default: 'orthorectified',
                                },
                                metadata: {
                                    type: 'object',
                                    description: 'Optional metadata for this specific order',
                                    additionalProperties: true,
                                },
                            },
                            required: ['imageId'],
                        },
                        minItems: 1,
                        maxItems: 50,
                    },
                    webhookUrl: {
                        type: 'string',
                        description: 'Optional: Webhook URL for batch completion notification',
                    },
                    failFast: {
                        type: 'boolean',
                        description: 'Stop processing on first error (default: false - continue processing all)',
                        default: false,
                    },
                },
                required: ['orders'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_search_recommendations',
            description:
                'Get intelligent search recommendations based on your session history and patterns. Returns personalized suggestions for refinements, similar searches, alternative satellites, or broader explorations. Helps users discover better search strategies when they have limited results or want to explore new options.',
            parameters: {
                type: 'object',
                properties: {
                    currentCriteria: {
                        type: 'object',
                        description: 'Optional: Current search criteria to get refinement recommendations',
                        additionalProperties: true,
                    },
                    includePatterns: {
                        type: 'boolean',
                        description: 'Include recent search patterns in the response',
                        default: false,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_session_analytics',
            description:
                'Get comprehensive analytics about your search and order history. Shows total searches/orders, success rates, preferred satellites, average cloud coverage/resolution, most searched locations, and activity patterns. Useful for understanding your usage and optimizing future searches.',
            parameters: {
                type: 'object',
                properties: {
                    includePatterns: {
                        type: 'boolean',
                        description: 'Include detailed search patterns breakdown',
                        default: true,
                    },
                    patternLimit: {
                        type: 'number',
                        description: 'Maximum number of patterns to return',
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
            name: 'compare_search_sessions',
            description:
                'Compare two search sessions to identify differences in criteria and results. Helps understand why one search performed better than another and provides recommendations for optimal search parameters. Useful for iterative refinement and learning from past searches.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId1: {
                        type: 'string',
                        description: 'First session ID to compare',
                    },
                    sessionId2: {
                        type: 'string',
                        description: 'Second session ID to compare',
                    },
                    highlightDifferences: {
                        type: 'boolean',
                        description: 'Show detailed breakdown of criteria differences',
                        default: true,
                    },
                },
                required: ['sessionId1', 'sessionId2'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'export_session_history',
            description:
                'Export your complete session history including all search sessions, order history, patterns, and analytics as a downloadable JSON file. Useful for record-keeping, analysis, or sharing search configurations with team members.',
            parameters: {
                type: 'object',
                properties: {
                    format: {
                        type: 'string',
                        enum: ['json', 'summary'],
                        description: 'Export format: full JSON or summary',
                        default: 'json',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_mcp_health',
            description:
                'Get comprehensive health status of the SkyFi MCP server including API connectivity, cache status, service availability, active connections, performance metrics, conversation count, and recent errors. Essential for diagnostics, monitoring, and troubleshooting. Returns actionable recommendations if issues detected.',
            parameters: {
                type: 'object',
                properties: {
                    includeMetrics: {
                        type: 'boolean',
                        description: 'Include detailed performance metrics (latency, throughput, cache hit rate)',
                        default: true,
                    },
                    includeDiagnostics: {
                        type: 'boolean',
                        description: 'Run diagnostic tests on external services (SkyFi API, OSM API connectivity)',
                        default: false,
                    },
                    includeCache: {
                        type: 'boolean',
                        description: 'Include cache statistics, size, and item counts',
                        default: true,
                    },
                    verbose: {
                        type: 'boolean',
                        description: 'Include verbose details like recent errors, slow requests, etc.',
                        default: false,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'clear_cache',
            description:
                'Clear the MCP server cache to force fresh data from SkyFi API. Use when troubleshooting stale data issues or after configuration changes. Can clear all cache or specific types. Returns count of cleared items.',
            parameters: {
                type: 'object',
                properties: {
                    cacheType: {
                        type: 'string',
                        enum: ['all', 'archive', 'orders', 'pricing', 'geocoding', 'aoi'],
                        description: 'Type of cache to clear',
                        default: 'all',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'map_fly_to',
            description:
                'Navigate the map to a specific latitude and longitude. This tool centers the geospatial map on the provided coordinates and optionally adds a marker with a label. Use this when users want to view a specific location on the map or when you need to show them where something is located.',
            parameters: {
                type: 'object',
                properties: {
                    lat: {
                        type: 'number',
                        description: 'Latitude of the location to navigate to (-90 to 90)',
                    },
                    lng: {
                        type: 'number',
                        description: 'Longitude of the location to navigate to (-180 to 180)',
                    },
                    location: {
                        type: 'string',
                        description: 'Optional label or name for the map marker (e.g., "Tokyo", "Search Result #1")',
                    },
                },
                required: ['lat', 'lng'],
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
