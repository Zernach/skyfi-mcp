import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { authValidationService } from '../src/services/auth-validation.service';
import { skyfiClient } from '../src/integrations/skyfi/client';
import { SkyFiAuthError } from '../src/integrations/skyfi/errors';

// Mock the SkyFi client
jest.mock('../src/integrations/skyfi/client');

describe('AuthValidationService', () => {
    beforeEach(() => {
        // Clear cache before each test
        authValidationService.clearCache();
        jest.clearAllMocks();
    });

    afterEach(() => {
        authValidationService.clearCache();
    });

    describe('validateUserAuth', () => {
        it('should validate a valid API key successfully', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            expect(result.authenticated).toBe(true);
            expect(result.apiKeyValid).toBe(true);
            expect(result.hasPaymentMethod).toBe(true);
            expect(result.canPlaceOrders).toBe(true);
            expect(result.accountStatus).toBe('active');
            expect(result.errors).toHaveLength(0);
            expect(skyfiClient.listOrders).toHaveBeenCalledWith({ limit: 1 });
        });

        it('should fail validation for invalid API key', async () => {
            // Mock auth error
            (skyfiClient.listOrders as jest.Mock).mockRejectedValue(
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
        });

        it('should use cached results within TTL', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            // First call
            const result1 = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            // Second call (should use cache)
            const result2 = await authValidationService.validateUserAuth({
                userId: 'test-user',
                conversationId: 'test-conversation',
            });

            expect(result1).toEqual(result2);
            expect(skyfiClient.listOrders).toHaveBeenCalledTimes(1); // Only called once
        });

        it('should proceed with warning on network errors', async () => {
            // Mock network error
            (skyfiClient.listOrders as jest.Mock).mockRejectedValue(
                new Error('Network error')
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
        });

        it('should add warning for anonymous sessions', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.validateUserAuth({
                // No userId or conversationId
            });

            expect(result.authenticated).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('anonymous session'))).toBe(true);
        });
    });

    describe('validatePayment', () => {
        it('should validate a normal payment amount', async () => {
            // Mock successful auth validation
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.validatePayment(
                250.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(false);
            expect(result.withinSpendingLimit).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('should require confirmation for high-value orders', async () => {
            // Mock successful auth validation
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.validatePayment(
                1500.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('High-value'))).toBe(true);
        });

        it('should require confirmation for very high-value orders', async () => {
            // Mock successful auth validation
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.validatePayment(
                6000.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('VERY HIGH-VALUE'))).toBe(true);
        });

        it('should reject invalid payment amounts', async () => {
            const result = await authValidationService.validatePayment(
                -50.00,
                'USD',
                { userId: 'test-user' }
            );

            expect(result.valid).toBe(false);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('Invalid payment amount');
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
    });

    describe('checkSpendingLimit', () => {
        it('should allow orders within spending limit', async () => {
            const result = await authValidationService.checkSpendingLimit(
                1000.00,
                { userId: 'test-user' }
            );

            expect(result.withinLimit).toBe(true);
            expect(result.limit).toBeGreaterThan(0);
            expect(result.remaining).toBeGreaterThan(0);
        });

        it('should detect orders exceeding spending limit', async () => {
            const result = await authValidationService.checkSpendingLimit(
                50000.00, // Much higher than default $10,000 limit
                { userId: 'test-user' }
            );

            expect(result.withinLimit).toBe(false);
            expect(result.limit).toBeGreaterThan(0);
            expect(result.remaining).toBeLessThan(50000.00);
        });
    });

    describe('getPaymentMethodStatus', () => {
        it('should return payment method status for valid auth', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.getPaymentMethodStatus({
                userId: 'test-user',
            });

            expect(result.hasPaymentMethod).toBe(true);
            expect(result.verified).toBe(true);
            expect(result.needsSetup).toBe(false);
            expect(result.paymentMethods.length).toBeGreaterThan(0);
        });

        it('should return no payment method for invalid auth', async () => {
            // Mock auth error
            (skyfiClient.listOrders as jest.Mock).mockRejectedValue(
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
    });

    describe('verifyApiKey', () => {
        it('should verify a valid API key', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(true);
            expect(result.permissions.length).toBeGreaterThan(0);
            expect(result.error).toBeUndefined();
        });

        it('should fail verification for invalid API key', async () => {
            // Mock auth error
            (skyfiClient.listOrders as jest.Mock).mockRejectedValue(
                new SkyFiAuthError('Invalid API key')
            );

            const result = await authValidationService.verifyApiKey();

            expect(result.valid).toBe(false);
            expect(result.permissions).toHaveLength(0);
            expect(result.error).toBeDefined();
        });
    });

    describe('clearCache', () => {
        it('should clear validation cache', async () => {
            // Mock successful API call
            (skyfiClient.listOrders as jest.Mock).mockResolvedValue([]);

            // First call
            await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(skyfiClient.listOrders).toHaveBeenCalledTimes(1);

            // Clear cache
            authValidationService.clearCache();

            // Second call (should not use cache)
            await authValidationService.validateUserAuth({
                userId: 'test-user',
            });

            expect(skyfiClient.listOrders).toHaveBeenCalledTimes(2);
        });
    });
});

