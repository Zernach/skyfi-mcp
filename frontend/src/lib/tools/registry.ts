/**
 * Unified Tool Registry for SkyFi Platform
 * 
 * This module provides a centralized registry of all available tools
 * that can be used by both the Voice Assistant and Chat Widget.
 */

import type { IMapCoords, MapMarkerDetails } from '../../components/mbox/MBox';
import { lookupBoundingBoxForPlace } from '../../utils/geocoding';
import {
  OPEN_METEO_ARCHIVE_URL,
  OPEN_METEO_FORECAST_URL,
} from '../../constants/links';

const PROD_BASE_URL = 'https://api.landscapesupply.app';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    required?: string[];
    properties: Record<string, any>;
    additionalProperties?: boolean;
  };
}

export interface ToolExecutionContext {
  onMarkerUpdate?: (update: Partial<MapMarkerDetails>) => void;
  onMapPositionChange?: (coords: IMapCoords | null) => void;
  conversationId?: string | null;
}

export type ToolHandler = (
  args: Record<string, any>,
  context: ToolExecutionContext
) => Promise<any>;

/**
 * Helper function to ensure a value is a valid number
 */
function ensureNumber(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${label} value: ${value}`);
  }
  return numeric;
}

/**
 * All available tool definitions
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'fly_to_place',
    description:
      'FASTEST way to navigate the map to a location. Instantly geocodes place name and flies map there. Use this for all navigation requests.',
    parameters: {
      type: 'object',
      required: ['place'],
      properties: {
        place: {
          type: 'string',
          description:
            'City, region, or country name (e.g., "Tokyo", "California", "Brazil").',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_bounding_box',
    description:
      'Resolves a place name to a geographic bounding box using OpenStreetMap Nominatim. For navigation, use fly_to_place instead.',
    parameters: {
      type: 'object',
      required: ['place'],
      properties: {
        place: {
          type: 'string',
          description:
            'City, region, or country name to geocode (e.g., "Lisbon", "Peru").',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_weather',
    description:
      'Retrieves current temperature and wind speed for the given coordinates. Provide a descriptive label for the location.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        location: {
          type: 'string',
          description: 'Label for the location',
        },
      },
      required: ['lat', 'lng', 'location'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_last_rain',
    description:
      'Returns the number of days since measurable rain occurred at the provided coordinates. Responds with -1 when it has been more than 10 days.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
      },
      required: ['lat', 'lng'],
      additionalProperties: false,
    },
  },
  {
    name: 'skyfi_satellite_assistant',
    description:
      'Access the SkyFi satellite imagery platform. Use this to search for satellite imagery, create orders, request new satellite captures (tasking), check order/tasking status, estimate pricing, and get feasibility assessments. This tool provides comprehensive satellite imagery capabilities including archive search, ordering, and custom satellite tasking.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language query describing what you want to do with satellite imagery (e.g., "search for imagery of Tokyo from last month", "order satellite image ID xyz123", "check status of order abc456", "estimate price for 50km² area")',
        },
        context: {
          type: 'object',
          description:
            'Optional context information like current location, date ranges, or previous conversation context',
          additionalProperties: true,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'map_fly_to',
    description: 'Centers the geospatial map on the provided coordinates.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        location: {
          type: 'string',
          description: 'Optional label for the map marker',
        },
      },
      required: ['lat', 'lng'],
      additionalProperties: false,
    },
  },
];

/**
 * Tool execution handlers
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  async fly_to_place(args, context) {
    const place = typeof args?.place === 'string' ? args.place.trim() : '';
    if (!place) {
      throw new Error('The "place" parameter must be a non-empty string.');
    }

    // Geocode and navigate in one operation
    const result = await lookupBoundingBoxForPlace(place);
    const center = result.center;

    if (center && context.onMapPositionChange && context.onMarkerUpdate) {
      // Immediately update map position
      context.onMapPositionChange({ lat: center.lat, lng: center.lon });
      context.onMarkerUpdate({
        lat: center.lat,
        lng: center.lon,
        location: result.displayName,
      });
    }

    return {
      success: true,
      location: result.displayName,
      latitude: center?.lat ?? null,
      longitude: center?.lon ?? null,
      bounding_box: result.boundingBox,
    };
  },

  async lookup_bounding_box(args, context) {
    const place = typeof args?.place === 'string' ? args.place.trim() : '';
    if (!place) {
      throw new Error('The "place" parameter must be a non-empty string.');
    }
    const result = await lookupBoundingBoxForPlace(place);
    return {
      bounding_box: result.boundingBox,
      display_name: result.displayName,
      center: result.center,
      source: result.source,
    };
  },

  async get_weather(args, context) {
    const latitude = ensureNumber(args?.lat, 'lat');
    const longitude = ensureNumber(args?.lng, 'lng');
    const location = args?.location;
    const label =
      typeof location === 'string' && location.trim().length
        ? location.trim()
        : 'Selected location';

    if (context.onMarkerUpdate && context.onMapPositionChange) {
      context.onMarkerUpdate({
        lat: latitude,
        lng: longitude,
        location: label,
      });
      context.onMapPositionChange({ lat: latitude, lng: longitude });
    }

    const url = `${OPEN_METEO_FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Weather request failed with status ${response.status}.`
      );
    }
    const json = await response.json();

    const temperatureReading =
      typeof json?.current?.temperature_2m === 'number' &&
      typeof json?.current_units?.temperature_2m === 'string'
        ? {
            value: json.current.temperature_2m,
            units: json.current_units.temperature_2m,
          }
        : null;

    const windReading =
      typeof json?.current?.wind_speed_10m === 'number' &&
      typeof json?.current_units?.wind_speed_10m === 'string'
        ? {
            value: json.current.wind_speed_10m,
            units: json.current_units.wind_speed_10m,
          }
        : null;

    if (context.onMarkerUpdate) {
      context.onMarkerUpdate({
        lat: latitude,
        lng: longitude,
        location: label,
        temperature: temperatureReading,
        wind_speed: windReading,
      });
    }

    return {
      latitude,
      longitude,
      location: label,
      temperature: temperatureReading,
      wind_speed: windReading,
    };
  },

  async get_last_rain(args, context) {
    const latitude = ensureNumber(args?.lat, 'lat');
    const longitude = ensureNumber(args?.lng, 'lng');

    if (context.onMapPositionChange) {
      context.onMapPositionChange({ lat: latitude, lng: longitude });
    }

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const url = `${OPEN_METEO_ARCHIVE_URL}?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Rainfall request failed with status ${response.status}.`
      );
    }
    const json = await response.json();

    const precipitation: number[] = Array.isArray(
      json?.daily?.precipitation_sum
    )
      ? json.daily.precipitation_sum.map((value: unknown) => Number(value))
      : [];
    const timestamps: string[] = Array.isArray(json?.daily?.time)
      ? json.daily.time
      : [];

    let daysSinceRain: number | null = null;
    const today = new Date();
    for (let index = precipitation.length - 1; index >= 0; index -= 1) {
      const amount = precipitation[index];
      if (Number.isFinite(amount) && amount > 0) {
        const dateString = timestamps[index];
        if (dateString) {
          const rainDate = new Date(dateString);
          const diffMs = today.getTime() - rainDate.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          daysSinceRain = diffDays > 10 ? -1 : diffDays;
        }
        break;
      }
    }

    if (daysSinceRain === null) {
      daysSinceRain = -1;
    }

    if (context.onMarkerUpdate) {
      context.onMarkerUpdate({
        lat: latitude,
        lng: longitude,
        daysSinceRain,
      });
    }

    return {
      latitude,
      longitude,
      days_since_rain: daysSinceRain,
    };
  },

  async skyfi_satellite_assistant(args, context) {
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) {
      throw new Error('The "query" parameter must be a non-empty string.');
    }

    const contextData = args?.context || {};

    try {
      // Call the SkyFi MCP backend
      const response = await fetch(`${PROD_BASE_URL}/mcp/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'chat',
          params: {
            message: query,
            context: contextData,
            conversationId: context.conversationId,
          },
          id: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `SkyFi MCP request failed with status ${response.status}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'SkyFi MCP error occurred');
      }

      const result = data.result;

      return {
        success: true,
        response: result.response || 'No response received',
        tools_used: result.toolsUsed || [],
        metadata: result.metadata || {},
        conversation_id: result.conversationId,
      };
    } catch (error) {
      console.error('SkyFi MCP tool error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process SkyFi request',
      };
    }
  },

  async map_fly_to(args, context) {
    const latitude = ensureNumber(args?.lat, 'lat');
    const longitude = ensureNumber(args?.lng, 'lng');
    const location: string | undefined =
      typeof args?.location === 'string' ? args.location : undefined;

    if (context.onMapPositionChange && context.onMarkerUpdate) {
      context.onMapPositionChange({ lat: latitude, lng: longitude });
      context.onMarkerUpdate({
        lat: latitude,
        lng: longitude,
        location:
          typeof location === 'string' && location.trim().length
            ? location.trim()
            : undefined,
      });
    }

    return { latitude, longitude, location: location ?? null };
  },
};

/**
 * Execute a tool by name with the given arguments and context
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext = {}
): Promise<any> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return handler(args, context);
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === toolName);
}

/**
 * Get all tool definitions (for passing to LLM)
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

