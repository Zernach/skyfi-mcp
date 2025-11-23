#!/usr/bin/env ts-node

/**
 * SkyFi API Diagnostic Script
 * 
 * This script tests the SkyFi API connectivity and helps diagnose connection issues.
 * 
 * Usage:
 *   ts-node backend/test_skyfi_api.ts
 *   npm run test:skyfi-api
 */

import { skyfiDiagnostics } from './src/integrations/skyfi/api-diagnostics';
import logger from './src/utils/logger';

async function main() {
  console.log('\n🔍 SkyFi API Diagnostic Tool\n');
  console.log('This will test various SkyFi API endpoints to determine connectivity.\n');

  try {
    // Run full diagnostics
    await skyfiDiagnostics.testEndpoints();

    console.log('\n✅ Diagnostics complete. Check the logs above for details.\n');
  } catch (error) {
    logger.error('Diagnostic script failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('\n❌ Diagnostic script failed:', error);
    process.exit(1);
  }
}

main();


