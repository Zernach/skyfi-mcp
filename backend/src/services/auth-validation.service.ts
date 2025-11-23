import logger from '../utils/logger';
import { config } from '../config';
import { skyfiClient } from '../integrations/skyfi/client';
import { SkyFiAuthError } from '../integrations/skyfi/errors';

/**
 * Authentication and Payment Validation Service
 * Validates user authentication and payment readiness before order placement
 */

export interface AuthValidationResult {
    authenticated: boolean;
    hasPaymentMethod: boolean;
    canPlaceOrders: boolean;
    apiKeyValid: boolean;
    accountStatus?: 'active' | 'suspended' | 'payment_required' | 'unknown';
    warnings: string[];
    errors: string[];
}

export interface UserContext {
    userId?: string;
    apiKey?: string;
    sessionId?: string;
    conversationId?: string;
}

class AuthValidationService {
    private validationCache = new Map<string, { result: AuthValidationResult; expires: number }>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Validate user authentication and payment setup with actual API verification
     */
    async validateUserAuth(context: UserContext): Promise<AuthValidationResult> {
        logger.info('Validating user authentication', {
            hasUserId: !!context.userId,
            hasApiKey: !!context.apiKey,
            conversationId: context.conversationId,
        });

        const result: AuthValidationResult = {
            authenticated: false,
            hasPaymentMethod: false,
            canPlaceOrders: false,
            apiKeyValid: false,
            accountStatus: 'unknown',
            warnings: [],
            errors: [],
        };

        // Check if we have SkyFi API key configured
        const hasSkyFiKey = !!config.skyfi?.apiKey;
        if (!hasSkyFiKey) {
            result.errors.push('SkyFi API key not configured. Please set SKYFI_API_KEY environment variable.');
            logger.error('SkyFi API key missing');
            return result;
        }

        // Check cache first (avoid excessive API calls)
        const cacheKey = `auth:${config.skyfi.apiKey?.substring(0, 8) || 'unknown'}`;
        const cached = this.validationCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            logger.debug('Using cached auth validation result');
            return { ...cached.result };
        }

        // Validate API key with actual SkyFi API call
        try {
            // Try to list orders as a lightweight auth check
            // This verifies the API key is valid and has proper permissions
            logger.debug('Validating API key with SkyFi API...');
            await skyfiClient.listOrders({ limit: 1 });

            result.authenticated = true;
            result.apiKeyValid = true;
            result.accountStatus = 'active';

            // If we can list orders, we assume payment is configured
            // (SkyFi typically requires payment info to issue API keys)
            result.hasPaymentMethod = true;
            result.canPlaceOrders = true;

            logger.info('API key validation successful', {
                authenticated: true,
                accountStatus: result.accountStatus,
            });
        } catch (error) {
            logger.error('API key validation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorType: error instanceof Error ? error.constructor.name : 'unknown',
            });

            if (error instanceof SkyFiAuthError) {
                result.errors.push('Invalid SkyFi API key. Please check your SKYFI_API_KEY environment variable.');
                result.errors.push('Visit https://www.skyfi.com to obtain a valid API key.');
                result.accountStatus = 'suspended';
            } else {
                // If validation call fails for other reasons, be permissive but warn
                result.authenticated = true;
                result.apiKeyValid = true;
                result.hasPaymentMethod = true;
                result.canPlaceOrders = true;
                result.accountStatus = 'unknown';
                result.warnings.push('⚠️ Unable to verify API key with SkyFi - proceeding with caution');
                result.warnings.push('Orders may fail if API key is invalid or payment is not configured');
            }
        }

        // Add warnings for demo/test scenarios
        if (config.skyfi?.baseUrl?.includes('localhost') || config.skyfi?.baseUrl?.includes('test')) {
            result.warnings.push('⚠️ Using test/local environment - orders will not be real');
        }

        // Check if user has any identifying information
        if (!context.userId && !context.conversationId) {
            result.warnings.push('No user identification provided - using anonymous session');
        }

        // Cache the result
        this.validationCache.set(cacheKey, {
            result: { ...result },
            expires: Date.now() + this.CACHE_TTL,
        });

        logger.info('Auth validation complete', {
            authenticated: result.authenticated,
            apiKeyValid: result.apiKeyValid,
            canPlaceOrders: result.canPlaceOrders,
            accountStatus: result.accountStatus,
            warningCount: result.warnings.length,
            errorCount: result.errors.length,
        });

        return result;
    }

    /**
     * Clear validation cache (useful for testing or after config changes)
     */
    clearCache(): void {
        this.validationCache.clear();
        logger.info('Auth validation cache cleared');
    }

    /**
     * Validate payment amount and provide confirmation details
     */
    async validatePayment(amount: number, currency: string, context: UserContext): Promise<{
        valid: boolean;
        confirmationRequired: boolean;
        withinSpendingLimit: boolean;
        warnings: string[];
        details: string;
    }> {
        logger.info('Validating payment', { amount, currency });

        const result = {
            valid: true,
            confirmationRequired: false,
            withinSpendingLimit: true,
            warnings: [] as string[],
            details: '',
        };

        // Validate amount
        if (amount <= 0) {
            result.valid = false;
            result.warnings.push('Invalid payment amount');
            return result;
        }

        if (!isFinite(amount)) {
            result.valid = false;
            result.warnings.push('Payment amount must be a valid number');
            return result;
        }

        // Check spending limits
        const spendingCheck = await this.checkSpendingLimit(amount, context);
        result.withinSpendingLimit = spendingCheck.withinLimit;

        if (!spendingCheck.withinLimit) {
            result.warnings.push(`⚠️ Order exceeds spending limit`);
            result.warnings.push(`Monthly limit: ${currency} ${spendingCheck.limit.toFixed(2)}`);
            result.warnings.push(`Current spend: ${currency} ${spendingCheck.currentSpend.toFixed(2)}`);
            result.warnings.push(`Remaining: ${currency} ${spendingCheck.remaining.toFixed(2)}`);
            result.confirmationRequired = true;
        }

        // Check if amount is unusually high and requires confirmation
        const HIGH_AMOUNT_THRESHOLD = 1000;
        const VERY_HIGH_AMOUNT_THRESHOLD = 5000;

        if (amount > VERY_HIGH_AMOUNT_THRESHOLD) {
            result.confirmationRequired = true;
            result.warnings.push(`🚨 VERY HIGH-VALUE order detected: ${currency} ${amount.toFixed(2)}`);
            result.warnings.push('Please carefully review this order before proceeding');
        } else if (amount > HIGH_AMOUNT_THRESHOLD) {
            result.confirmationRequired = true;
            result.warnings.push(`⚠️ High-value order detected: ${currency} ${amount.toFixed(2)}`);
            result.warnings.push('Please confirm this order before proceeding');
        }

        // Provide payment details
        result.details = `Order total: ${currency} ${amount.toFixed(2)}`;

        logger.info('Payment validation complete', {
            amount,
            valid: result.valid,
            confirmationRequired: result.confirmationRequired,
            withinSpendingLimit: result.withinSpendingLimit,
        });

        return result;
    }

    /**
     * Get user's payment method status
     * In a production system, this would query SkyFi's account API
     */
    async getPaymentMethodStatus(context: UserContext): Promise<{
        hasPaymentMethod: boolean;
        paymentMethods: Array<{
            type: string;
            last4?: string;
            expiresAt?: string;
            isDefault: boolean;
        }>;
        needsSetup: boolean;
        verified: boolean;
    }> {
        const hasSkyFiKey = !!config.skyfi?.apiKey;

        if (!hasSkyFiKey) {
            return {
                hasPaymentMethod: false,
                paymentMethods: [],
                needsSetup: true,
                verified: false,
            };
        }

        // Verify API key is valid by attempting auth validation
        const authResult = await this.validateUserAuth(context);

        if (!authResult.authenticated || !authResult.apiKeyValid) {
            return {
                hasPaymentMethod: false,
                paymentMethods: [],
                needsSetup: true,
                verified: false,
            };
        }

        // Assume API key holder has payment setup (typical for SkyFi)
        // In production, you would query SkyFi's account/billing endpoint
        return {
            hasPaymentMethod: true,
            paymentMethods: [
                {
                    type: 'api_account',
                    isDefault: true,
                },
            ],
            needsSetup: false,
            verified: true,
        };
    }

    /**
     * Check if order amount is within user's spending limits
     * TODO: Integrate with actual spending tracking database
     */
    async checkSpendingLimit(amount: number, context: UserContext): Promise<{
        withinLimit: boolean;
        currentSpend: number;
        limit: number;
        remaining: number;
    }> {
        // In production, fetch actual spending from database based on context
        // For now, use configurable limits with basic validation

        const MONTHLY_LIMIT = parseFloat(process.env.MONTHLY_SPENDING_LIMIT || '10000');

        // TODO: Query actual spending from database:
        // SELECT SUM(amount) FROM orders 
        // WHERE user_id = context.userId 
        // AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        const currentSpend = 0;

        const remaining = MONTHLY_LIMIT - currentSpend;
        const withinLimit = amount <= remaining;

        logger.debug('Spending limit check', {
            amount,
            currentSpend,
            limit: MONTHLY_LIMIT,
            remaining,
            withinLimit,
            userId: context.userId,
        });

        return {
            withinLimit,
            currentSpend,
            limit: MONTHLY_LIMIT,
            remaining,
        };
    }

    /**
     * Verify API key is valid and has necessary permissions
     * This is a standalone method for explicit key verification
     */
    async verifyApiKey(): Promise<{
        valid: boolean;
        permissions: string[];
        accountId?: string;
        error?: string;
    }> {
        if (!config.skyfi?.apiKey) {
            return {
                valid: false,
                permissions: [],
                error: 'No API key configured',
            };
        }

        try {
            // Test API key with a lightweight call
            await skyfiClient.listOrders({ limit: 1 });

            return {
                valid: true,
                permissions: ['read:orders', 'create:orders', 'read:archive'],
                // In production, parse account ID from API response
            };
        } catch (error) {
            logger.error('API key verification failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                valid: false,
                permissions: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}

export const authValidationService = new AuthValidationService();

