/**
 * Shared API configuration
 * Centralized base URLs for all API endpoints
 */

// Main API base URLs
export const PROD_BASE_URL = 'https://api.skyfi.archlife.org';
export const DEV_BASE_URL = 'http://localhost:3000';
export const BASE_URL = process.env.NODE_ENV === 'production' ? PROD_BASE_URL : DEV_BASE_URL;

// Voice/Relay API base URLs (currently only production)
export const PROD_VOICE_BASE_URL = 'https://api.archlife.org';
export const VOICE_BASE_URL = PROD_VOICE_BASE_URL; // Voice endpoints currently only use production


