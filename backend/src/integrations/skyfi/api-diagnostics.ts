import axios from 'axios';
import logger from '../../utils/logger';
import { config } from '../../config';

/**
 * Diagnostic tool to test SkyFi API connectivity and discover available endpoints
 */
export class SkyFiAPIDiagnostics {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.skyfi.apiKey;
    this.baseUrl = config.skyfi.baseUrl;
  }

  /**
   * Test various endpoints to find working ones
   */
  async testEndpoints(): Promise<void> {
    logger.info('🔍 Starting SkyFi API diagnostics...');
    logger.info(`Base URL: ${this.baseUrl}`);
    logger.info(`API Key: ${this.apiKey.substring(0, 8)}...`);

    const testEndpoints = [
      { method: 'GET', path: '/', description: 'API root' },
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'GET', path: '/status', description: 'Status endpoint' },
      { method: 'GET', path: '/v1', description: 'API v1 root' },
      { method: 'GET', path: '/archive', description: 'Archive root' },
      { method: 'GET', path: '/search', description: 'Search root' },
      { method: 'POST', path: '/archive/search', description: 'Archive search (POST)' },
      { method: 'POST', path: '/search', description: 'Search (POST)' },
      { method: 'GET', path: '/archive/search', description: 'Archive search (GET)' },
      { method: 'POST', path: '/v1/archive/search', description: 'V1 Archive search (POST)' },
      { method: 'POST', path: '/v1/search', description: 'V1 Search (POST)' },
      { method: 'POST', path: '/open-data/search', description: 'Open data search (POST)' },
    ];

    const results: Array<{ endpoint: string; status: string; details: any }> = [];

    for (const test of testEndpoints) {
      try {
        const url = `${this.baseUrl}${test.path}`;
        logger.info(`Testing: ${test.method} ${test.path}`, { description: test.description });

        const config: any = {
          method: test.method,
          url,
          headers: {
            'X-Skyfi-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
          validateStatus: () => true, // Don't throw on any status
        };

        if (test.method === 'POST') {
          config.data = {
            location: {
              type: 'Point',
              coordinates: [2.3522, 48.8566], // Paris
            },
            limit: 1,
          };
        }

        const response = await axios(config);

        const result = {
          endpoint: `${test.method} ${test.path}`,
          status: `${response.status} ${response.statusText}`,
          details: {
            description: test.description,
            headers: response.headers,
            dataPreview: JSON.stringify(response.data).substring(0, 200),
          },
        };

        results.push(result);

        if (response.status === 200 || response.status === 201) {
          logger.info(`✅ SUCCESS: ${test.method} ${test.path}`, {
            status: response.status,
            data: response.data,
          });
        } else if (response.status === 404) {
          logger.warn(`❌ NOT FOUND: ${test.method} ${test.path}`, {
            status: response.status,
            data: response.data,
          });
        } else if (response.status === 401 || response.status === 403) {
          logger.error(`🔒 AUTH ERROR: ${test.method} ${test.path}`, {
            status: response.status,
            data: response.data,
          });
        } else {
          logger.warn(`⚠️  ${response.status}: ${test.method} ${test.path}`, {
            status: response.status,
            data: response.data,
          });
        }
      } catch (error) {
        const result = {
          endpoint: `${test.method} ${test.path}`,
          status: 'ERROR',
          details: {
            description: test.description,
            error: error instanceof Error ? error.message : String(error),
          },
        };

        results.push(result);

        logger.error(`💥 ERROR: ${test.method} ${test.path}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('🏁 Diagnostics complete', { results });
    this.printSummary(results);
  }

  private printSummary(results: Array<{ endpoint: string; status: string; details: any }>): void {
    logger.info('\n' + '='.repeat(80));
    logger.info('📊 SKYFI API DIAGNOSTICS SUMMARY');
    logger.info('='.repeat(80));
    
    const successfulEndpoints = results.filter((r) => r.status.startsWith('2'));
    const notFoundEndpoints = results.filter((r) => r.status.startsWith('404'));
    const authErrors = results.filter((r) => r.status.startsWith('401') || r.status.startsWith('403'));
    const otherErrors = results.filter(
      (r) => !r.status.startsWith('2') && !r.status.startsWith('404') && !r.status.startsWith('401') && !r.status.startsWith('403')
    );

    if (successfulEndpoints.length > 0) {
      logger.info(`\n✅ Successful Endpoints (${successfulEndpoints.length}):`);
      successfulEndpoints.forEach((r) => {
        logger.info(`  - ${r.endpoint}: ${r.status}`);
      });
    }

    if (authErrors.length > 0) {
      logger.error(`\n🔒 Authentication Errors (${authErrors.length}):`);
      authErrors.forEach((r) => {
        logger.error(`  - ${r.endpoint}: ${r.status}`);
      });
      logger.error('\n⚠️  ACTION REQUIRED: Check your SKYFI_API_KEY configuration!');
    }

    if (notFoundEndpoints.length > 0) {
      logger.warn(`\n❌ Not Found (${notFoundEndpoints.length}):`);
      notFoundEndpoints.forEach((r) => {
        logger.warn(`  - ${r.endpoint}: ${r.status}`);
      });
    }

    if (otherErrors.length > 0) {
      logger.warn(`\n⚠️  Other Issues (${otherErrors.length}):`);
      otherErrors.forEach((r) => {
        logger.warn(`  - ${r.endpoint}: ${r.status}`);
      });
    }

    logger.info('\n' + '='.repeat(80));
    
    if (successfulEndpoints.length === 0) {
      logger.error('\n🚨 NO WORKING ENDPOINTS FOUND!');
      logger.error('Possible issues:');
      logger.error('  1. API key is invalid or expired');
      logger.error('  2. Base URL is incorrect');
      logger.error('  3. SkyFi API structure has changed');
      logger.error('  4. Network connectivity issues');
      logger.error('\nFalling back to mock data for all requests.');
    }
  }

  /**
   * Run a quick connectivity test
   */
  async quickTest(): Promise<boolean> {
    try {
      const response = await axios.get(this.baseUrl, {
        headers: {
          'X-Skyfi-Api-Key': this.apiKey,
        },
        timeout: 5000,
        validateStatus: () => true,
      });

      if (response.status === 401 || response.status === 403) {
        logger.error('❌ SkyFi API authentication failed - check your API key!');
        return false;
      }

      if (response.status === 404) {
        logger.warn('⚠️  SkyFi API base URL returned 404 - API may have changed');
        return false;
      }

      if (response.status >= 200 && response.status < 300) {
        logger.info('✅ SkyFi API is reachable');
        return true;
      }

      logger.warn(`⚠️  SkyFi API returned unexpected status: ${response.status}`);
      return false;
    } catch (error) {
      logger.error('💥 Failed to connect to SkyFi API', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
export const skyfiDiagnostics = new SkyFiAPIDiagnostics();


