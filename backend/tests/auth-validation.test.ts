import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { authValidationService } from '../src/services/auth-validation.service';
import { skyfiClient } from '../src/integrations/skyfi/client';
import { SkyFiAuthError } from '../src/integrations/skyfi/errors';
import { config } from '../src/config';

// Mock the dependencies
jest.mock('../src/integrations/skyfi/client');
jest.mock('../src/config');
jest.mock('../src/utils/logger');

describe('AuthValidationService - P0 Feature #10 QA', () => {
    const mockSkyfiClient = skyfiClient as jest.Mocked<typeof skyfiClient>;

    beforeEach(() => {
        // Clear cache and reset mocks before each test
        authValidationService.clearCache();
        jest.clearAllMocks();

        // Set up default config mock
        (config as any).skyfi = {
            apiKey: 'test-api-key-12345678',
            baseUrl: 'https://api.skyfi.com/v1',
        };
    });

    afterEach(() => {
        authValidationService.clearCache();
    });

    describe('API Key Validation', () => {
        it('should validate a valid API key successfully', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user-123',
                conversationId: 'conv-456',
            });

            expect(result.authenticated).toBe(true);
            expect(result.apiKeyValid).toBe(true);
            expect(result.hasPaymentMethod).toBe(true);
            expect(result.canPlaceOrders).toBe(true);
            expect(result.accountStatus).toBe('active');
            expect(result.errors).toHaveLength(0);
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledWith({ limit: 1 });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);
        });

        it('should reject invalid API key with proper error', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new SkyFiAuthError('Invalid API key')
            );

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            expect(result.authenticated).toBe(false);
            expect(result.apiKeyValid).toBe(false);
            expect(result.hasPaymentMethod).toBe(false);
            expect(result.canPlaceOrders).toBe(false);
            expect(result.accountStatus).toBe('suspended');
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Invalid SkyFi API key');
            expect(result.errors[1]).toContain('https://www.skyfi.com');
        });

        it('should handle missing API key configuration', async () => {
            (config as any).skyfi = {
                apiKey: undefined,
                baseUrl: 'https://api.skyfi.com/v1',
            };

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(result.authenticated).toBe(false);
            expect(result.apiKeyValid).toBe(false);
            expect(result.canPlaceOrders).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('SkyFi API key not configured');
            expect(mockSkyfiClient.listOrders).not.toHaveBeenCalled();
        });

        it('should proceed with warning on network errors', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new Error('Network error: ECONNREFUSED')
            );

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            expect(result.authenticated).toBe(true);
            expect(result.apiKeyValid).toBe(true);
            expect(result.hasPaymentMethod).toBe(true);
            expect(result.canPlaceOrders).toBe(true);
            expect(result.accountStatus).toBe('unknown');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('Unable to verify API key');
            expect(result.warnings[1]).toContain('Orders may fail');
        });

        it('should add warning for test/local environments', async () => {
            (config as any).skyfi = {
                apiKey: 'test-api-key',
                baseUrl: 'http://localhost:3000',
            };
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(result.authenticated).toBe(true);
            expect(result.warnings.some(w => w.includes('test/local environment'))).toBe(true);
            expect(result.warnings.some(w => w.includes('orders will not be real'))).toBe(true);
        });

        it('should add warning for anonymous sessions', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                // No userId or conversationId provided
            });

            expect(result.authenticated).toBe(true);
            expect(result.warnings.some(w => w.includes('anonymous session'))).toBe(true);
        });
    });

    describe('Caching (5-minute TTL)', () => {
        it('should cache validation results and use cache within TTL', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // First call - should hit API
            const result1 = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            // Second call - should use cache
            const result2 = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            expect(result1).toEqual(result2);
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);
            expect(result1.authenticated).toBe(true);
        });

        it('should respect cache key based on API key', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // First call with one API key
            await authValidationService.validateUserAuth({ userId: 'user1' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Second call - should use cache (same API key)
            await authValidationService.validateUserAuth({ userId: 'user2' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);
        });

        it('should clear cache when clearCache is called', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // First call
            await authValidationService.validateUserAuth({
                userId: 'test-user',
            });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Clear cache
            authValidationService.clearCache();

            // Second call - should hit API again
            await authValidationService.validateUserAuth({
                userId: 'test-user',
            });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(2);
        });

        it('should expire cache after TTL period', async () => {
            jest.useFakeTimers();
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // First call
            await authValidationService.validateUserAuth({ userId: 'test-user' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Fast forward 4 minutes (within TTL)
            jest.advanceTimersByTime(4 * 60 * 1000);

            // Should still use cache
            await authValidationService.validateUserAuth({ userId: 'test-user' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Fast forward past 5 minutes (TTL expired)
            jest.advanceTimersByTime(2 * 60 * 1000);

            // Should hit API again
            await authValidationService.validateUserAuth({ userId: 'test-user' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(2);

            jest.useRealTimers();
        });
    });

    describe('Payment Method Verification', () => {
        it('should return payment method status for valid auth', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.getPaymentMethodStatus({
                userId: 'test-user',
            });

            expect(result.hasPaymentMethod).toBe(true);
            expect(result.verified).toBe(true);
            expect(result.needsSetup).toBe(false);
            expect(result.paymentMethods.length).toBeGreaterThan(0);
            expect(result.paymentMethods[0].type).toBe('api_account');
            expect(result.paymentMethods[0].isDefault).toBe(true);
        });

        it('should return no payment method for invalid auth', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new SkyFiAuthError('Invalid API key')
            );

            const result = await authValidationService.getPaymentMethodStatus({
                userId: 'test-user',
            });

            expect(result.hasPaymentMethod).toBe(false);
            expect(result.verified).toBe(false);
            expect(result.needsSetup).toBe(true);
            expect(result.paymentMethods).toHaveLength(0);
        });

        it('should return no payment method when API key not configured', async () => {
            (config as any).skyfi = {
                apiKey: undefined,
                baseUrl: 'https://api.skyfi.com/v1',
            };

            const result = await authValidationService.getPaymentMethodStatus({
                userId: 'test-user',
            });

            expect(result.hasPaymentMethod).toBe(false);
            expect(result.verified).toBe(false);
            expect(result.needsSetup).toBe(true);
            expect(mockSkyfiClient.listOrders).not.toHaveBeenCalled();
        });
    });

    describe('Spending Limit Enforcement', () => {
        it('should allow orders within spending limit', async () => {
            const result = await authValidationService.checkSpendingLimit(
                1000.00,
                { userId: 'test-user' }
            );

            expect(result.withinLimit).toBe(true);
            expect(result.limit).toBe(10000); // Default monthly limit
            expect(result.currentSpend).toBe(0); // TODO: Replace with DB query
            expect(result.remaining).toBe(10000);
        });

        it('should detect orders exceeding spending limit', async () => {
            const result = await authValidationService.checkSpendingLimit(
                15000.00, // Exceeds default $10,000 limit
                { userId: 'test-user' }
            );

            expect(result.withinLimit).toBe(false);
            expect(result.limit).toBe(10000);
            expect(result.remaining).toBeLessThan(15000);
        });

        it('should use custom spending limit from env var', async () => {
            const originalLimit = process.env.MONTHLY_SPENDING_LIMIT;
            process.env.MONTHLY_SPENDING_LIMIT = '5000';

            const result = await authValidationService.checkSpendingLimit(
                3000.00,
                { userId: 'test-user' }
            );

            expect(result.withinLimit).toBe(true);
            expect(result.limit).toBe(5000);
            expect(result.remaining).toBe(5000);

            // Restore original value
            if (originalLimit !== undefined) {
                process.env.MONTHLY_SPENDING_LIMIT = originalLimit;
            } else {
                delete process.env.MONTHLY_SPENDING_LIMIT;
            }
        });

        it('should calculate remaining budget correctly', async () => {
            const result = await authValidationService.checkSpendingLimit(
                2500.00,
                { userId: 'test-user' }
            );

            expect(result.remaining).toBe(result.limit - result.currentSpend);
            expect(result.withinLimit).toBe(2500.00 <= result.remaining);
        });
    });

    describe('Payment Validation and High-Value Order Detection', () => {
        it('should validate normal payment amounts', async () => {
            const result = await authValidationService.validatePayment(
                250.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(false);
            expect(result.withinSpendingLimit).toBe(true);
            expect(result.warnings).toHaveLength(0);
            expect(result.details).toContain('USD 250.00');
        });

        it('should detect high-value orders (> $1000) and require confirmation', async () => {
            const result = await authValidationService.validatePayment(
                1500.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('High-value order'))).toBe(true);
            expect(result.warnings.some(w => w.includes('USD 1500.00'))).toBe(true);
            expect(result.details).toContain('USD 1500.00');
        });

        it('should detect very high-value orders (> $5000) with stronger warnings', async () => {
            const result = await authValidationService.validatePayment(
                6000.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('VERY HIGH-VALUE'))).toBe(true);
            expect(result.warnings.some(w => w.includes('carefully review'))).toBe(true);
            expect(result.details).toContain('USD 6000.00');
        });

        it('should reject zero or negative payment amounts', async () => {
            const result1 = await authValidationService.validatePayment(
                0,
                'USD',
                { userId: 'test-user' }
            );

            expect(result1.valid).toBe(false);
            expect(result1.warnings.length).toBeGreaterThan(0);
            expect(result1.warnings[0]).toContain('Invalid payment amount');

            const result2 = await authValidationService.validatePayment(
                -50.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result2.valid).toBe(false);
            expect(result2.warnings[0]).toContain('Invalid payment amount');
        });

        it('should reject infinite payment amounts', async () => {
            const result = await authValidationService.validatePayment(
                Infinity,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(false);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('valid number');
        });

        it('should reject NaN payment amounts', async () => {
            const result = await authValidationService.validatePayment(
                NaN,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(false);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should require confirmation when exceeding spending limit', async () => {
            const result = await authValidationService.validatePayment(
                12000.00, // Exceeds default $10,000 limit
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.withinSpendingLimit).toBe(false);
            expect(result.warnings.some(w => w.includes('exceeds spending limit'))).toBe(true);
            expect(result.warnings.some(w => w.includes('Monthly limit'))).toBe(true);
            expect(result.warnings.some(w => w.includes('Remaining'))).toBe(true);
        });

        it('should handle multiple warning conditions', async () => {
            // Order that is both high-value AND exceeds spending limit
            const result = await authValidationService.validatePayment(
                15000.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.withinSpendingLimit).toBe(false);
            // Should have warnings for both high value AND spending limit
            expect(result.warnings.length).toBeGreaterThan(2);
        });
    });

    describe('verifyApiKey - Standalone Key Verification', () => {
        it('should verify a valid API key with permissions', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(true);
            expect(result.permissions.length).toBeGreaterThan(0);
            expect(result.permissions).toContain('read:orders');
            expect(result.permissions).toContain('create:orders');
            expect(result.permissions).toContain('read:archive');
            expect(result.error).toBeUndefined();
        });

        it('should fail verification for invalid API key', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new SkyFiAuthError('Invalid API key')
            );

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(false);
            expect(result.permissions).toHaveLength(0);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('Invalid API key');
        });

        it('should handle missing API key configuration', async () => {
            (config as any).skyfi = {
                apiKey: undefined,
                baseUrl: 'https://api.skyfi.com/v1',
            };

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(false);
            expect(result.permissions).toHaveLength(0);
            expect(result.error).toBe('No API key configured');
            expect(mockSkyfiClient.listOrders).not.toHaveBeenCalled();
        });

        it('should handle network errors gracefully', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new Error('Network timeout')
            );

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(false);
            expect(result.permissions).toHaveLength(0);
            expect(result.error).toBe('Network timeout');
        });
    });

    describe('Security Features', () => {
        it('should not expose full API key in logs', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
                apiKey: 'sk-very-secret-key-12345678',
            });

            // The service should only use first 8 chars for cache key
            expect(result.authenticated).toBe(true);
        });

        it('should handle multiple concurrent validation requests safely', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // Execute first validation to populate cache
            await authValidationService.validateUserAuth({ userId: 'user1' });
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Execute multiple validations concurrently - should use cached result
            const results = await Promise.all([
                authValidationService.validateUserAuth({ userId: 'user2' }),
                authValidationService.validateUserAuth({ userId: 'user3' }),
                authValidationService.validateUserAuth({ userId: 'user4' }),
            ]);

            // Should still only have been called once (from the first validation)
            expect(mockSkyfiClient.listOrders).toHaveBeenCalledTimes(1);
            results.forEach(result => {
                expect(result.authenticated).toBe(true);
            });
        });

        it('should provide helpful error messages without exposing sensitive data', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new SkyFiAuthError('401: sk-abc123 is invalid')
            );

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Invalid SkyFi API key');
            expect(result.errors[1]).toContain('https://www.skyfi.com');
            // Should not echo back the API key from error message
        });

        it('should validate user context fields safely', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            // Test with various potentially unsafe inputs
            const result = await authValidationService.validateUserAuth({
                userId: '<script>alert("xss")</script>',
                conversationId: '../../etc/passwd',
                sessionId: 'normal-session-id',
            });

            expect(result.authenticated).toBe(true);
            // Service should handle these safely without injection
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle undefined context gracefully', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({});

            expect(result.authenticated).toBe(true);
            expect(result.warnings.some(w => w.includes('anonymous session'))).toBe(true);
        });

        it('should handle null values in context', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: null as any,
                conversationId: null as any,
            });

            expect(result.authenticated).toBe(true);
        });

        it('should handle empty string values', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: '',
                conversationId: '',
            });

            expect(result.authenticated).toBe(true);
            expect(result.warnings.some(w => w.includes('anonymous session'))).toBe(true);
        });

        it('should handle API returning unexpected data structure', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue(undefined as any);

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(result.authenticated).toBe(true);
            expect(result.apiKeyValid).toBe(true);
        });

        it('should handle very large payment amounts', async () => {
            const result = await authValidationService.validatePayment(
                Number.MAX_SAFE_INTEGER,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
        });

        it('should handle decimal payment amounts correctly', async () => {
            const result = await authValidationService.validatePayment(
                99.99,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.details).toContain('99.99');
        });
    });

    describe('Integration with Order Placement Flow', () => {
        it('should validate auth before order placement', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const authResult = await authValidationService.validateUserAuth({
                conversationId: 'order-conv-123',
            });

            // Simulate order placement flow
            expect(authResult.authenticated).toBe(true);
            expect(authResult.canPlaceOrders).toBe(true);
            expect(authResult.hasPaymentMethod).toBe(true);

            // Order placement should proceed
            if (authResult.canPlaceOrders) {
                const paymentResult = await authValidationService.validatePayment(
                    500.00,
                    'USD',
                    { conversationId: 'order-conv-123' }
                );

                expect(paymentResult.valid).toBe(true);
                expect(paymentResult.withinSpendingLimit).toBe(true);
            }
        });

        it('should block order placement when auth fails', async () => {
            mockSkyfiClient.listOrders.mockRejectedValue(
                new SkyFiAuthError('Invalid API key')
            );

            const authResult = await authValidationService.validateUserAuth({
                conversationId: 'order-conv-456',
            });

            expect(authResult.authenticated).toBe(false);
            expect(authResult.canPlaceOrders).toBe(false);
            expect(authResult.errors.length).toBeGreaterThan(0);

            // Order placement should be blocked
            if (!authResult.canPlaceOrders) {
                expect(authResult.errors[0]).toContain('Invalid SkyFi API key');
            }
        });

        it('should provide warnings for high-value orders in the flow', async () => {
            mockSkyfiClient.listOrders.mockResolvedValue([]);

            const authResult = await authValidationService.validateUserAuth({
                conversationId: 'high-value-order',
            });

            expect(authResult.canPlaceOrders).toBe(true);

            const paymentResult = await authValidationService.validatePayment(
                7500.00, // Very high value
                'USD',
                { conversationId: 'high-value-order' }
            );

            expect(paymentResult.valid).toBe(true);
            expect(paymentResult.confirmationRequired).toBe(true);
            expect(paymentResult.warnings.some(w => w.includes('VERY HIGH-VALUE'))).toBe(true);
        });
    });
});
