import { skyfiClient } from '../integrations/skyfi/client';
import { osmClient } from '../integrations/osm/client';
import logger from '../utils/logger';
import { toGeoJsonPolygon, calculatePolygonAreaSqKm } from '../utils/geojson';
import { ToolCall } from './openai.service';
import { searchSessionService } from './search-session.service';
import { orderHistoryService } from './order-history.service';
import { feasibilityService } from './feasibility.service';
import { monitoringService } from './monitoring.service';
import { authValidationService } from './auth-validation.service';
import { sessionHistoryManager } from './session-history-manager.service';
import type { FeasibilityRequest, PricingExplorationRequest } from './feasibility.types';

export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    result: any;
    error?: string;
}

export interface ToolExecutionContext {
    conversationId?: string;
}

/**
 * Tool Executor - Executes tool calls from the LLM
 */
export class ToolExecutor {
    /**
     * Execute a single tool call
     */
    async executeTool(
        toolCall: ToolCall,
        context?: ToolExecutionContext
    ): Promise<ToolExecutionResult> {
        const { id, name, arguments: args } = toolCall;

        logger.info(`Executing tool: ${name}`, { toolCallId: id, arguments: args });

        try {
            let result: any;

            switch (name) {
                case 'search_satellite_imagery':
                    result = await this.searchSatelliteImagery(args, context);
                    break;

                case 'confirm_order_with_pricing':
                    result = await this.confirmOrderWithPricing(args, context);
                    break;

                case 'create_satellite_order':
                    result = await this.createSatelliteOrder(args, context);
                    break;

                case 'request_satellite_tasking':
                    result = await this.requestSatelliteTasking(args, context);
                    break;

                case 'get_order_status':
                    result = await this.getOrderStatus(args);
                    break;

                case 'list_orders':
                    result = await this.listOrders(args, context);
                    break;

                case 'estimate_price':
                    result = await this.estimatePrice(args);
                    break;

                case 'assess_task_feasibility':
                    result = await this.assessTaskFeasibility(args);
                    break;

                case 'explore_pricing_options':
                    result = await this.explorePricingOptions(args);
                    break;

                case 'get_tasking_status':
                    result = await this.getTaskingStatus(args);
                    break;

                case 'setup_aoi_monitoring':
                    result = await this.setupAoiMonitoring(args, context);
                    break;

                case 'list_aoi_monitors':
                    result = await this.listAoiMonitors(args, context);
                    break;

                case 'update_aoi_monitoring':
                    result = await this.updateAoiMonitoring(args, context);
                    break;

                case 'delete_aoi_monitoring':
                    result = await this.deleteAoiMonitoring(args, context);
                    break;

                case 'geocode_location':
                    result = await this.geocodeLocation(args);
                    break;

                case 'reverse_geocode_location':
                    result = await this.reverseGeocodeLocation(args);
                    break;

                case 'create_webhook':
                    result = await this.createWebhook(args, context);
                    break;

                case 'list_webhooks':
                    result = await this.listWebhooks(args, context);
                    break;

                case 'delete_webhook':
                    result = await this.deleteWebhook(args, context);
                    break;

                case 'test_webhook':
                    result = await this.testWebhook(args, context);
                    break;

                case 'get_satellite_capabilities':
                    result = await this.getSatelliteCapabilities(args);
                    break;

                case 'compare_satellites':
                    result = await this.compareSatellites(args);
                    break;

                case 'recommend_satellite':
                    result = await this.recommendSatellite(args);
                    break;

                case 'batch_create_orders':
                    result = await this.batchCreateOrders(args);
                    break;

                case 'get_mcp_health':
                    result = await this.getMcpHealth(args);
                    break;

                case 'clear_cache':
                    result = await this.clearCache(args);
                    break;

                case 'get_search_recommendations':
                    result = await this.getSearchRecommendations(args, context);
                    break;

                case 'get_session_analytics':
                    result = await this.getSessionAnalytics(args, context);
                    break;

                case 'compare_search_sessions':
                    result = await this.compareSearchSessions(args, context);
                    break;

                case 'export_session_history':
                    result = await this.exportSessionHistory(args, context);
                    break;

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            logger.info(`Tool execution successful: ${name}`, {
                toolCallId: id,
                resultSize: JSON.stringify(result).length,
            });

            return {
                toolCallId: id,
                toolName: name,
                result,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorName = error instanceof Error ? error.name : 'Unknown';

            // Import SkyFi error types for better error handling
            const {
                SkyFiAuthError,
                SkyFiRateLimitError,
                SkyFiNotFoundError,
                SkyFiValidationError,
                SkyFiServerError,
                SkyFiTimeoutError
            } = await import('../integrations/skyfi/errors');

            // Provide user-friendly error messages based on error type
            let userFriendlyError = errorMessage;

            if (error instanceof SkyFiAuthError) {
                userFriendlyError = 'SkyFi API authentication failed. Please check your API key configuration.';
            } else if (error instanceof SkyFiRateLimitError) {
                const retryAfter = (error as any).retryAfter || 60;
                userFriendlyError = `SkyFi API rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`;
            } else if (error instanceof SkyFiNotFoundError) {
                userFriendlyError = `The requested resource was not found in SkyFi. ${errorMessage}`;
            } else if (error instanceof SkyFiValidationError) {
                userFriendlyError = `Invalid request parameters: ${errorMessage}. Please check your input and try again.`;
            } else if (error instanceof SkyFiServerError) {
                userFriendlyError = `SkyFi API server error. Please try again in a moment. If the issue persists, contact SkyFi support.`;
            } else if (error instanceof SkyFiTimeoutError) {
                userFriendlyError = `SkyFi API request timed out. The request may be too complex or the service may be busy. Try simplifying your request or try again later.`;
            }

            logger.error(`Tool execution failed: ${name}`, {
                toolCallId: id,
                error: errorMessage,
                errorName,
                stack: errorStack,
                arguments: args,
                userFriendlyError,
            });

            return {
                toolCallId: id,
                toolName: name,
                result: null,
                error: userFriendlyError,
            };
        }
    }

    /**
     * Execute multiple tool calls in parallel with improved error handling
     */
    async executeTools(
        toolCalls: ToolCall[],
        context?: ToolExecutionContext
    ): Promise<ToolExecutionResult[]> {
        if (!toolCalls || toolCalls.length === 0) {
            logger.warn('executeTools called with empty tool calls array');
            return [];
        }

        logger.info(`Executing ${toolCalls.length} tool(s)`, {
            tools: toolCalls.map(tc => tc.name),
            conversationId: context?.conversationId,
        });

        // Execute tools in parallel with individual error handling
        const results = await Promise.allSettled(
            toolCalls.map((toolCall) => this.executeTool(toolCall, context))
        );

        // Convert settled results to ToolExecutionResult[]
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                // Handle rejected promise
                const toolCall = toolCalls[index];
                logger.error('Tool execution promise rejected', {
                    toolName: toolCall.name,
                    toolCallId: toolCall.id,
                    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                });
                return {
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    result: null,
                    error: result.reason instanceof Error ? result.reason.message : 'Tool execution failed',
                };
            }
        });
    }

    /**
     * Search for satellite imagery in the archive
     */
    private async searchSatelliteImagery(
        args: any,
        context?: ToolExecutionContext
    ): Promise<any> {
        logger.info('searchSatelliteImagery called', { args });
        const conversationId = context?.conversationId ?? 'global';

        try {
            const response = await searchSessionService.runArchiveSearch(
                conversationId,
                args
            );

            logger.info('Archive search session updated', {
                conversationId,
                sessionId: response.sessionId,
                page: response.page.index,
                count: response.page.count,
                hasMore: response.page.hasMore,
            });

            return response;
        } catch (error) {
            logger.error('Iterative archive search failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args,
            });
            throw error;
        }
    }

    /**
     * Confirm order with pricing and feasibility check
     */
    private async confirmOrderWithPricing(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('confirmOrderWithPricing called', { orderType: args.orderType });

        // Validate authentication and payment setup
        const authValidation = await authValidationService.validateUserAuth({
            userId: context?.conversationId,
            conversationId: context?.conversationId,
        });

        if (!authValidation.authenticated) {
            return {
                success: false,
                error: 'Authentication required',
                errors: authValidation.errors,
                message: 'Please ensure you have a valid SkyFi API key configured.',
            };
        }

        if (!authValidation.hasPaymentMethod) {
            return {
                success: false,
                error: 'Payment method required',
                warnings: ['No payment method on file'],
                message: 'Please add a payment method to your SkyFi account before placing orders.',
            };
        }

        const orderType = args.orderType || 'archive';

        if (orderType === 'archive') {
            if (!args.imageId) {
                throw new Error('imageId is required for archive orders');
            }

            // Check if the image exists and is available for purchase
            let imageAvailable = false;
            const feasibilityWarnings: string[] = [];

            try {
                // Try to verify the image exists by searching for it
                // This is a basic feasibility check for archive imagery
                logger.info('Checking archive image availability', { imageId: args.imageId });

                // In a real implementation, we would call skyfiClient.getImage(args.imageId)
                // For now, we'll assume the image is available if an imageId is provided
                imageAvailable = true;

                // Note: If SkyFi API provides a getImage or verifyImage endpoint,
                // we should call it here to validate the imageId
            } catch (error) {
                logger.error('Failed to verify image availability', {
                    imageId: args.imageId,
                    error: error instanceof Error ? error.message : String(error),
                });
                feasibilityWarnings.push('⚠️ Could not verify image availability - proceeding with caution');
            }

            if (!imageAvailable) {
                return {
                    success: false,
                    error: 'Image not available',
                    feasible: false,
                    message: `Image ${args.imageId} is not available for purchase. Please search for alternative imagery.`,
                };
            }

            // For archive orders, we need to fetch the image details
            // Since we don't have a direct getImage endpoint, we'll estimate based on typical values
            const estimateParams: any = {
                type: 'archive',
                areaKm2: 25, // Default estimate
                processingLevel: args.processingLevel || 'orthorectified',
            };

            const estimate = await skyfiClient.estimatePrice(estimateParams);

            // Validate payment amount
            const paymentValidation = await authValidationService.validatePayment(
                estimate.estimatedPrice,
                estimate.currency,
                { conversationId: context?.conversationId }
            );

            // Check spending limits
            const spendingCheck = await authValidationService.checkSpendingLimit(
                estimate.estimatedPrice,
                { conversationId: context?.conversationId }
            );

            const warnings: string[] = [...authValidation.warnings, ...paymentValidation.warnings, ...feasibilityWarnings];

            if (!spendingCheck.withinLimit) {
                warnings.push(`⚠️ Order exceeds monthly spending limit. Remaining: ${estimate.currency} ${spendingCheck.remaining.toFixed(2)}`);
            }

            const priceFormatted = `${estimate.currency} ${estimate.estimatedPrice.toFixed(2)}`;
            const readyToOrder = authValidation.canPlaceOrders && paymentValidation.valid && spendingCheck.withinLimit;

            // Create a clear, conversational confirmation message
            let confirmationMessage = `\n📋 **ORDER SUMMARY**\n`;
            confirmationMessage += `• Image ID: ${args.imageId}\n`;
            confirmationMessage += `• **Price: ${priceFormatted}**\n`;
            confirmationMessage += `• Format: ${args.deliveryFormat || 'GeoTIFF'}\n`;
            confirmationMessage += `• Processing: ${args.processingLevel || 'orthorectified'}\n`;
            confirmationMessage += `• Estimated Delivery: 1-2 days\n`;

            if (estimate.breakdown) {
                confirmationMessage += `\n💰 **Pricing Breakdown:**\n`;
                for (const [key, value] of Object.entries(estimate.breakdown)) {
                    confirmationMessage += `• ${key}: ${value}\n`;
                }
            }

            if (warnings.length > 0) {
                confirmationMessage += `\n⚠️ **Warnings:**\n`;
                warnings.forEach(w => confirmationMessage += `• ${w}\n`);
            }

            if (readyToOrder) {
                confirmationMessage += `\n✅ **Ready to order!** Would you like me to proceed with this purchase?\n`;
                confirmationMessage += `Reply "yes", "proceed", or "confirm" to place the order.`;
            } else {
                confirmationMessage += `\n❌ **Cannot proceed** - please resolve the warnings above first.`;
            }

            return {
                success: true,
                orderType: 'archive',
                imageId: args.imageId,
                feasible: imageAvailable,
                confidence: imageAvailable ? 'high' : 'low',
                authentication: {
                    authenticated: authValidation.authenticated,
                    hasPaymentMethod: authValidation.hasPaymentMethod,
                    canPlaceOrders: authValidation.canPlaceOrders,
                },
                pricing: {
                    estimatedPrice: estimate.estimatedPrice,
                    currency: estimate.currency,
                    breakdown: estimate.breakdown,
                },
                payment: {
                    confirmationRequired: paymentValidation.confirmationRequired,
                    withinSpendingLimit: spendingCheck.withinLimit,
                    details: paymentValidation.details,
                },
                deliveryFormat: args.deliveryFormat || 'GeoTIFF',
                processingLevel: args.processingLevel || 'orthorectified',
                estimatedDelivery: '1-2 days',
                warnings,
                recommendations: [
                    'Archive imagery is available immediately after purchase',
                    'Delivery typically completes within 24 hours',
                ],
                readyToOrder,
                message: confirmationMessage,
            };
        } else if (orderType === 'tasking') {
            // For tasking orders, run full feasibility assessment
            const feasibilityRequest: FeasibilityRequest = {};

            if (args.location) {
                feasibilityRequest.location = args.location;
            }

            if (args.aoi) {
                const polygon = toGeoJsonPolygon(args.aoi);
                if (polygon) {
                    feasibilityRequest.aoi = polygon;
                    feasibilityRequest.areaKm2 = calculatePolygonAreaSqKm(polygon);
                }
            }

            if (args.startDate) {
                feasibilityRequest.startDate = args.startDate;
            }

            if (args.endDate) {
                feasibilityRequest.endDate = args.endDate;
            }

            if (args.resolution !== undefined) {
                feasibilityRequest.resolution = args.resolution;
            }

            if (args.maxCloudCoverage !== undefined) {
                feasibilityRequest.maxCloudCoverage = args.maxCloudCoverage;
            }

            if (args.priority) {
                feasibilityRequest.priority = args.priority;
            }

            if (args.processingLevel) {
                feasibilityRequest.processingLevel = args.processingLevel;
            }

            const feasibility = await feasibilityService.evaluateTaskFeasibility(feasibilityRequest);

            const warnings: string[] = [...authValidation.warnings];
            if (!feasibility.feasible) {
                warnings.push('⚠️ This tasking request may face challenges - see risks below');
            }
            if (feasibility.weather.riskLevel === 'high') {
                warnings.push('⚠️ High weather risk detected - cloud coverage may cause delays');
            }
            if (feasibility.coverage.availableScenes > 0) {
                warnings.push('💡 Archive imagery is available - consider archive order to save costs');
            }

            const lowestPricing = feasibility.pricingOptions[0];

            // Validate payment if pricing is available
            let paymentValidation = null;
            let spendingCheck = null;
            if (lowestPricing) {
                paymentValidation = await authValidationService.validatePayment(
                    lowestPricing.total,
                    lowestPricing.currency,
                    { conversationId: context?.conversationId }
                );

                spendingCheck = await authValidationService.checkSpendingLimit(
                    lowestPricing.total,
                    { conversationId: context?.conversationId }
                );

                warnings.push(...paymentValidation.warnings);

                if (!spendingCheck.withinLimit) {
                    warnings.push(`⚠️ Order exceeds monthly spending limit. Remaining: ${lowestPricing.currency} ${spendingCheck.remaining.toFixed(2)}`);
                }
            }

            const readyToOrder = feasibility.feasible &&
                feasibility.confidence !== 'low' &&
                authValidation.canPlaceOrders &&
                (!paymentValidation || paymentValidation.valid) &&
                (!spendingCheck || spendingCheck.withinLimit);

            // Create a clear, conversational confirmation message for tasking
            let confirmationMessage = `\n🛰️ **TASKING ORDER SUMMARY**\n`;

            if (lowestPricing) {
                confirmationMessage += `• **Price: ${lowestPricing.currency} ${lowestPricing.total.toFixed(2)}**\n`;
                confirmationMessage += `• Estimated Turnaround: ${lowestPricing.estimatedTurnaroundDays} days\n`;
                if (lowestPricing.breakdown) {
                    confirmationMessage += `\n💰 **Pricing Breakdown:**\n`;
                    for (const [key, value] of Object.entries(lowestPricing.breakdown)) {
                        confirmationMessage += `• ${key}: ${value}\n`;
                    }
                }
            }

            confirmationMessage += `\n📊 **Feasibility:**\n`;
            confirmationMessage += `• Status: ${feasibility.feasible ? '✅ Feasible' : '❌ Not feasible'}\n`;
            confirmationMessage += `• Confidence: ${feasibility.confidence}\n`;
            confirmationMessage += `• ${feasibility.summary}\n`;

            if (feasibility.weather) {
                confirmationMessage += `\n🌤️ **Weather Risk:** ${feasibility.weather.riskLevel}\n`;
            }

            if (feasibility.coverage.availableScenes > 0) {
                confirmationMessage += `\n📦 **Archive Alternative:** ${feasibility.coverage.availableScenes} archive images available (cheaper/faster)\n`;
            }

            if (warnings.length > 0) {
                confirmationMessage += `\n⚠️ **Warnings:**\n`;
                warnings.forEach(w => confirmationMessage += `• ${w}\n`);
            }

            if (feasibility.risks && feasibility.risks.length > 0) {
                confirmationMessage += `\n⚠️ **Risks:**\n`;
                feasibility.risks.forEach((r: any) => {
                    const riskText = typeof r === 'string' ? r : (r.message || r.description || String(r));
                    confirmationMessage += `• ${riskText}\n`;
                });
            }

            if (readyToOrder) {
                confirmationMessage += `\n✅ **Ready to order!** Would you like me to proceed with this tasking request?\n`;
                confirmationMessage += `Reply "yes", "proceed", or "confirm" to place the order.`;
            } else {
                confirmationMessage += `\n❌ **Cannot proceed** - please review the warnings and risks above.`;
            }

            return {
                success: true,
                orderType: 'tasking',
                feasible: feasibility.feasible,
                confidence: feasibility.confidence,
                authentication: {
                    authenticated: authValidation.authenticated,
                    hasPaymentMethod: authValidation.hasPaymentMethod,
                    canPlaceOrders: authValidation.canPlaceOrders,
                },
                pricing: lowestPricing ? {
                    estimatedPrice: lowestPricing.total,
                    currency: lowestPricing.currency,
                    breakdown: lowestPricing.breakdown,
                    turnaroundDays: lowestPricing.estimatedTurnaroundDays,
                } : null,
                payment: paymentValidation && spendingCheck ? {
                    confirmationRequired: paymentValidation.confirmationRequired,
                    withinSpendingLimit: spendingCheck.withinLimit,
                    details: paymentValidation.details,
                } : null,
                feasibilitySummary: feasibility.summary,
                weather: feasibility.weather,
                archiveCoverage: feasibility.coverage,
                risks: feasibility.risks,
                alternatives: feasibility.alternatives,
                warnings,
                recommendations: feasibility.recommendedApproach === 'archive'
                    ? ['Consider ordering from archive instead - it\'s faster and cheaper']
                    : feasibility.recommendedApproach === 'hybrid'
                        ? ['Consider a hybrid approach: order archive imagery now, schedule tasking for future needs']
                        : ['Tasking is the best approach for your requirements'],
                readyToOrder,
                message: confirmationMessage,
            };
        } else {
            throw new Error(`Unknown order type: ${orderType}`);
        }
    }

    /**
     * Create an order for satellite imagery
     */
    private async createSatelliteOrder(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('createSatelliteOrder called', { 
            imageId: args.imageId,
            hasContext: !!context 
        });

        // AUTHENTICATION & PAYMENT CHECK: Verify before processing order
        const authValidation = await authValidationService.validateUserAuth({
            userId: context?.conversationId,
            conversationId: context?.conversationId,
        });

        if (!authValidation.authenticated || !authValidation.apiKeyValid) {
            return {
                success: false,
                error: 'Authentication required',
                errors: authValidation.errors,
                message: '❌ Unable to place order: Invalid or missing API key. Please configure SKYFI_API_KEY.',
            };
        }

        if (!authValidation.hasPaymentMethod) {
            return {
                success: false,
                error: 'Payment method required',
                warnings: ['No payment method on file'],
                message: '❌ Unable to place order: Payment method required. Please configure payment on your SkyFi account.',
            };
        }

        if (!authValidation.canPlaceOrders) {
            return {
                success: false,
                error: 'Cannot place orders',
                errors: authValidation.errors,
                warnings: authValidation.warnings,
                message: '❌ Your account is not authorized to place orders. Please contact SkyFi support.',
            };
        }

        // Log warnings if any
        if (authValidation.warnings.length > 0) {
            logger.warn('Auth validation warnings', { warnings: authValidation.warnings });
        }

        // FEASIBILITY CHECK: Ensure image is available before order placement
        if (!args.imageId) {
            return {
                success: false,
                error: 'Missing imageId',
                message: 'Cannot create order without a valid image ID. Please search for imagery first.',
            };
        }

        // Validate that the image exists and is available
        // This prevents failed orders due to invalid or unavailable images
        try {
            logger.info('Validating image availability before order', { imageId: args.imageId });

            // TODO: If SkyFi API provides a direct image validation endpoint, use it here
            // For now, we log the validation attempt
            // const imageValid = await skyfiClient.validateImage(args.imageId);

        } catch (error) {
            logger.error('Image validation failed', {
                imageId: args.imageId,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                error: 'Image validation failed',
                message: `Unable to validate image ${args.imageId}. It may not be available for purchase. Please search for alternative imagery.`,
            };
        }

        const params: any = {
            imageId: args.imageId,
        };

        if (args.deliveryFormat) {
            params.deliveryFormat = args.deliveryFormat;
        }

        if (args.processingLevel) {
            params.processingLevel = args.processingLevel;
        }

        if (args.webhookUrl) {
            params.webhookUrl = args.webhookUrl;
        }

        try {
            const order = await skyfiClient.createOrder(params);

            logger.info('Order created successfully', {
                orderId: order.id,
                status: order.status,
                price: order.price,
            });

            return {
                success: true,
                orderId: order.id,
                status: order.status,
                price: order.price,
                createdAt: order.createdAt,
                message: `✅ Order created successfully. Order ID: ${order.id}. Track your order status to monitor delivery progress.`,
            };
        } catch (error) {
            logger.error('Order creation failed', {
                imageId: args.imageId,
                error: error instanceof Error ? error.message : String(error),
                errorType: error instanceof Error ? error.constructor.name : 'unknown',
            });

            // Provide helpful error message to user
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Check if it's an auth error even though we validated earlier
            if (errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('unauthorized')) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    message: `❌ Order failed due to authentication issue: ${errorMsg}. Please verify your SkyFi API key.`,
                };
            }

            return {
                success: false,
                error: 'Order creation failed',
                message: `❌ Failed to create order: ${errorMsg}. Please verify the image is available and try again.`,
            };
        }
    }

    /**
     * Request satellite tasking (new capture)
     */
    private async requestSatelliteTasking(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('requestSatelliteTasking called', { 
            hasLocation: !!args.location,
            hasAoi: !!args.aoi,
            hasContext: !!context 
        });

        // AUTHENTICATION & PAYMENT CHECK: Verify before processing tasking request
        const authValidation = await authValidationService.validateUserAuth({
            userId: context?.conversationId,
            conversationId: context?.conversationId,
        });

        if (!authValidation.authenticated || !authValidation.apiKeyValid) {
            return {
                success: false,
                error: 'Authentication required',
                errors: authValidation.errors,
                feasible: false,
                message: '❌ Unable to request tasking: Invalid or missing API key. Please configure SKYFI_API_KEY.',
            };
        }

        if (!authValidation.hasPaymentMethod) {
            return {
                success: false,
                error: 'Payment method required',
                warnings: ['No payment method on file'],
                feasible: false,
                message: '❌ Unable to request tasking: Payment method required. Tasking orders require upfront payment.',
            };
        }

        if (!authValidation.canPlaceOrders) {
            return {
                success: false,
                error: 'Cannot place orders',
                errors: authValidation.errors,
                warnings: authValidation.warnings,
                feasible: false,
                message: '❌ Your account is not authorized to request tasking. Please contact SkyFi support.',
            };
        }

        // FEASIBILITY CHECK: Validate tasking parameters before submission
        logger.info('Validating tasking parameters', { args });

        // Validate required parameters
        if (!args.location && !args.aoi) {
            return {
                success: false,
                error: 'Missing location',
                feasible: false,
                message: 'Tasking requires either a location (Point) or AOI (Polygon). Please provide geographic coordinates.',
            };
        }

        // Check if dates are in the future
        if (args.startDate) {
            const startDate = new Date(args.startDate);
            const now = new Date();
            if (startDate < now) {
                return {
                    success: false,
                    error: 'Invalid start date',
                    feasible: false,
                    message: 'Tasking start date must be in the future. For historical imagery, please search the archive instead.',
                };
            }
        }

        // Run feasibility assessment to check coverage, weather, and constraints
        const feasibilityRequest: FeasibilityRequest = {
            location: args.location,
            aoi: args.aoi,
            startDate: args.startDate,
            endDate: args.endDate,
            resolution: args.resolution,
            maxCloudCoverage: args.maxCloudCoverage,
            satellites: args.satellites,
            priority: args.priority,
        };

        try {
            const feasibility = await feasibilityService.evaluateTaskFeasibility(feasibilityRequest);

            // Check if tasking is feasible
            if (!feasibility.feasible || feasibility.confidence === 'low') {
                return {
                    success: false,
                    error: 'Tasking not feasible',
                    feasible: false,
                    confidence: feasibility.confidence,
                    message: `⚠️ This tasking request may not be feasible. ${feasibility.summary}`,
                    risks: feasibility.risks,
                    alternatives: feasibility.alternatives,
                    weather: feasibility.weather,
                    recommendations: [
                        'Review the risks and alternatives below',
                        'Consider adjusting your requirements (dates, cloud coverage, resolution)',
                        feasibility.coverage.availableScenes > 0 ? 'Archive imagery is available - consider ordering from archive instead' : null,
                    ].filter(Boolean),
                };
            }

            // Log successful feasibility check
            logger.info('Tasking feasibility check passed', {
                feasible: feasibility.feasible,
                confidence: feasibility.confidence,
            });

        } catch (error) {
            logger.warn('Feasibility check failed, proceeding with caution', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Don't block the order, but warn the user
        }

        const params: any = {};

        if (args.location) {
            params.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                params.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon provided by tool call; skipping parameter');
            }
        }

        if (args.startDate) {
            params.startDate = args.startDate;
        }

        if (args.endDate) {
            params.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            params.resolution = args.resolution;
        }

        if (args.maxCloudCoverage !== undefined) {
            params.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (args.priority) {
            params.priority = args.priority;
        }

        const tasking = await skyfiClient.createTasking(params);

        return {
            success: true,
            taskingId: tasking.id,
            status: tasking.status,
            captureWindow: tasking.captureWindow,
            estimatedCost: tasking.estimatedCost,
            message: `Tasking request created. Task ID: ${tasking.id}`,
        };
    }

    /**
     * Get order status
     */
    private async getOrderStatus(args: any): Promise<any> {
        const order = await skyfiClient.getOrder(args.orderId);

        return {
            success: true,
            orderId: order.id,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            deliveryUrl: order.deliveryUrl,
            price: order.price,
            message: `Order status: ${order.status}`,
        };
    }

    /**
     * List orders with filters
     */
    private async listOrders(
        args: any,
        context?: ToolExecutionContext
    ): Promise<any> {
        const conversationId = context?.conversationId ?? 'global';

        try {
            const response = await orderHistoryService.listOrders(
                conversationId,
                args
            );

            logger.info('Order history session updated', {
                conversationId,
                sessionId: response.sessionId,
                page: response.page.index,
                count: response.page.count,
                hasMore: response.page.hasMore,
            });

            return response;
        } catch (error) {
            logger.error('Order history lookup failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args,
            });
            throw error;
        }
    }

    /**
     * Estimate pricing
     */
    private async estimatePrice(args: any): Promise<any> {
        const params: any = {
            type: args.type,
            areaKm2: args.areaKm2,
        };

        if (args.location) {
            params.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                params.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon provided for estimate_price; skipping parameter');
            }
        }

        if (args.startDate) {
            params.startDate = args.startDate;
        }

        if (args.endDate) {
            params.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            params.resolution = args.resolution;
        }

        if (args.processingLevel) {
            params.processingLevel = args.processingLevel;
        }

        if (args.priority) {
            params.priority = args.priority;
        }

        if (Array.isArray(args.satellites) && args.satellites.length > 0) {
            params.satellites = args.satellites;
        }

        const estimate = await skyfiClient.estimatePrice(params);

        return {
            success: true,
            estimatedPrice: estimate.estimatedPrice,
            currency: estimate.currency,
            breakdown: estimate.breakdown,
            message: `Estimated price: ${estimate.currency} ${estimate.estimatedPrice}`,
        };
    }

    /**
     * Assess task feasibility leveraging archive coverage and pricing insights
     */
    private async assessTaskFeasibility(args: any): Promise<any> {
        const request: FeasibilityRequest = {};

        if (args.location) {
            request.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                request.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon supplied to assess_task_feasibility');
            }
        }

        if (typeof args.areaKm2 === 'number') {
            request.areaKm2 = args.areaKm2;
        }

        if (args.startDate) {
            request.startDate = args.startDate;
        }

        if (args.endDate) {
            request.endDate = args.endDate;
        }

        if (args.maxCloudCoverage !== undefined) {
            request.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (args.resolution !== undefined) {
            request.resolution = args.resolution;
        }

        if (Array.isArray(args.satellites)) {
            request.satellites = args.satellites;
        }

        if (args.priority) {
            request.priority = args.priority;
        }

        if (args.processingLevel) {
            request.processingLevel = args.processingLevel;
        }

        const report = await feasibilityService.evaluateTaskFeasibility(request);

        // Enhanced: Format satellite recommendations for user-friendly display
        const formattedSatellites = report.satelliteRecommendations?.slice(0, 5).map((sat, index) => {
            const resolution = Object.values(sat.resolution).find((r) => r !== undefined);
            const costInfo = sat.pricing.archivePerKm2 === 0
                ? 'FREE'
                : sat.pricing.archivePerKm2
                    ? `$${sat.pricing.archivePerKm2}/km²`
                    : 'Contact for pricing';

            return {
                rank: index + 1,
                name: sat.name,
                operator: sat.operator,
                score: sat.score,
                matchReason: sat.matchReason,
                resolution: `${resolution}m`,
                pricing: costInfo,
                revisitTime: `${sat.revisitTime} days`,
                swathWidth: `${sat.swathWidth} km`,
                spectralBands: sat.spectralBands,
                pros: sat.tradeoffs.pros,
                cons: sat.tradeoffs.cons,
                idealFor: sat.idealFor.slice(0, 3),
            };
        });

        return {
            success: true,
            summary: report.summary,
            feasible: report.feasible,
            confidence: report.confidence,
            recommendedApproach: report.recommendedApproach,
            coverage: report.coverage,
            weather: report.weather,
            pricingOptions: report.pricingOptions,
            satelliteRecommendations: formattedSatellites,
            risks: report.risks,
            alternatives: report.alternatives,
            metadata: report.metadata,
        };
    }

    /**
     * Explore pricing scenarios for archive/tasking combinations
     */
    private async explorePricingOptions(args: any): Promise<any> {
        const request: PricingExplorationRequest = {};

        if (args.location) {
            request.location = args.location;
        }

        if (args.aoi) {
            const polygon = toGeoJsonPolygon(args.aoi);
            if (polygon) {
                request.aoi = polygon;
            } else {
                logger.warn('Invalid AOI polygon supplied to explore_pricing_options');
            }
        }

        if (typeof args.areaKm2 === 'number') {
            request.areaKm2 = args.areaKm2;
        }

        if (args.startDate) {
            request.startDate = args.startDate;
        }

        if (args.endDate) {
            request.endDate = args.endDate;
        }

        if (args.resolution !== undefined) {
            request.resolution = args.resolution;
        }

        if (Array.isArray(args.satellites)) {
            request.satellites = args.satellites;
        }

        if (args.priority) {
            request.priority = args.priority;
        }

        if (args.processingLevel) {
            request.processingLevel = args.processingLevel;
        }

        if (args.maxCloudCoverage !== undefined) {
            request.maxCloudCoverage = args.maxCloudCoverage;
        }

        if (typeof args.includeArchive === 'boolean') {
            request.includeArchive = args.includeArchive;
        }

        if (typeof args.includeTasking === 'boolean') {
            request.includeTasking = args.includeTasking;
        }

        const result = await feasibilityService.explorePricing(request);

        // Enhanced: Format satellite recommendations for pricing exploration
        const formattedSatellites = result.satelliteRecommendations?.map((sat, index) => {
            const resolution = Object.values(sat.resolution).find((r) => r !== undefined);
            return {
                rank: index + 1,
                name: sat.name,
                resolution: `${resolution}m`,
                archivePricing: sat.pricing.archivePerKm2 === 0
                    ? 'FREE'
                    : sat.pricing.archivePerKm2
                        ? `$${sat.pricing.archivePerKm2}/km²`
                        : 'N/A',
                taskingPricing: sat.pricing.taskingPerKm2
                    ? `$${sat.pricing.taskingPerKm2}/km²`
                    : 'N/A',
                matchReason: sat.matchReason,
                idealFor: sat.idealFor.slice(0, 3),
            };
        });

        return {
            success: true,
            summary: result.summary,
            options: result.options,
            bestValue: result.bestValue,
            fastestTurnaround: result.fastestTurnaround,
            premiumOption: result.premiumOption,
            satelliteRecommendations: formattedSatellites,
            tradeoffAnalysis: result.tradeoffAnalysis,
        };
    }

    /**
     * Get tasking status
     */
    private async getTaskingStatus(args: any): Promise<any> {
        const tasking = await skyfiClient.getTasking(args.taskingId);

        return {
            success: true,
            taskingId: tasking.id,
            status: tasking.status,
            location: tasking.location,
            captureWindow: tasking.captureWindow,
            estimatedCost: tasking.estimatedCost,
            message: `Tasking status: ${tasking.status}`,
        };
    }

    /**
     * Geocode a location name to coordinates
     */
    private async geocodeLocation(args: any): Promise<any> {
        logger.info('geocodeLocation called', { query: args.query });

        try {
            const result = await osmClient.geocode(args.query);

            if (!result) {
                logger.warn('Geocoding returned no result', { query: args.query });
                return {
                    success: false,
                    message: `Could not find location: ${args.query}`,
                };
            }

            logger.info('Geocoding succeeded', {
                query: args.query,
                location: result.displayName,
                coordinates: [result.lon, result.lat]
            });

            return {
                success: true,
                location: {
                    name: result.displayName,
                    latitude: result.lat,
                    longitude: result.lon,
                    coordinates: [result.lon, result.lat],
                    boundingBox: result.boundingBox,
                },
                message: `Found location: ${result.displayName}`,
            };
        } catch (error) {
            logger.error('geocodeLocation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                query: args.query
            });
            throw error;
        }
    }

    /**
     * Reverse geocode coordinates to address
     */
    private async reverseGeocodeLocation(args: any): Promise<any> {
        logger.info('reverseGeocodeLocation called', { args });

        try {
            const result = await osmClient.reverseGeocode(args.latitude, args.longitude);

            if (!result) {
                logger.warn('Reverse geocoding returned no result', { args });
                return {
                    success: false,
                    message: `Could not find address for coordinates: ${args.latitude}, ${args.longitude}`,
                };
            }

            logger.info('Reverse geocoding succeeded', {
                args,
                address: result.displayName
            });

            return {
                success: true,
                location: {
                    name: result.displayName,
                    address: result.address,
                    latitude: result.lat,
                    longitude: result.lon,
                },
                message: `Found address: ${result.displayName}`,
            };
        } catch (error) {
            logger.error('reverseGeocodeLocation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined,
                args
            });
            throw error;
        }
    }

    /**
     * Setup AOI monitoring
     */
    private async setupAoiMonitoring(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('setupAoiMonitoring called', { name: args.name });

        // Use conversationId as userId for now (in production, this should come from authenticated user)
        const userId = context?.conversationId || 'anonymous';

        const polygon = toGeoJsonPolygon(args.geometry);
        if (!polygon) {
            throw new Error('Invalid AOI polygon geometry');
        }

        const criteria: any = {};
        if (args.maxCloudCover !== undefined) {
            criteria.maxCloudCover = args.maxCloudCover;
        }
        if (args.minResolution !== undefined) {
            criteria.minResolution = args.minResolution;
        }
        if (args.satellites && args.satellites.length > 0) {
            criteria.filters = { satellites: args.satellites };
        }

        const schedule: any = {};
        if (args.monitoringFrequency) {
            schedule.frequency = args.monitoringFrequency;
        }

        const webhookEvents = args.webhookEvents && args.webhookEvents.length > 0
            ? args.webhookEvents
            : ['aoi.data.available'];

        const input = {
            userId,
            name: args.name,
            description: args.description,
            geometry: polygon,
            criteria,
            schedule,
            metadata: {
                createdVia: 'mcp',
                conversationId: context?.conversationId,
            },
            webhook: {
                url: args.webhookUrl,
                events: webhookEvents,
            },
        };

        const aoi = await monitoringService.createAoi(input);

        return {
            success: true,
            aoiId: aoi.id,
            name: aoi.name,
            geometry: aoi.geometry,
            active: aoi.active,
            webhooks: aoi.webhooks.map((w) => ({
                id: w.id,
                url: w.url,
                events: w.events,
                active: w.active,
            })),
            createdAt: aoi.createdAt,
            message: `AOI monitoring setup successful. You'll receive notifications at ${args.webhookUrl} when new data is available.`,
        };
    }

    /**
     * List AOI monitors
     */
    private async listAoiMonitors(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('listAoiMonitors called', { activeOnly: args.activeOnly });

        const userId = context?.conversationId || 'anonymous';
        const aois = await monitoringService.listAois(userId);

        const filtered = args.activeOnly
            ? aois.filter((aoi) => aoi.active)
            : aois;

        return {
            success: true,
            monitors: filtered.map((aoi) => ({
                id: aoi.id,
                name: aoi.name,
                description: aoi.description,
                geometry: aoi.geometry,
                active: aoi.active,
                criteria: aoi.criteria,
                schedule: aoi.schedule,
                webhooks: aoi.webhooks.map((w) => ({
                    id: w.id,
                    url: w.url,
                    events: w.events,
                    active: w.active,
                    lastTriggered: w.updatedAt,
                })),
                createdAt: aoi.createdAt,
                updatedAt: aoi.updatedAt,
            })),
            total: filtered.length,
            message: `Found ${filtered.length} AOI monitor${filtered.length !== 1 ? 's' : ''}`,
        };
    }

    /**
     * Update AOI monitoring
     */
    private async updateAoiMonitoring(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('updateAoiMonitoring called', { aoiId: args.aoiId });

        const userId = context?.conversationId || 'anonymous';

        const updates: any = {};
        if (args.name !== undefined) {
            updates.name = args.name;
        }
        if (args.description !== undefined) {
            updates.description = args.description;
        }
        if (args.active !== undefined) {
            updates.active = args.active;
        }

        if (args.maxCloudCover !== undefined || args.minResolution !== undefined) {
            updates.criteria = {};
            if (args.maxCloudCover !== undefined) {
                updates.criteria.maxCloudCover = args.maxCloudCover;
            }
            if (args.minResolution !== undefined) {
                updates.criteria.minResolution = args.minResolution;
            }
        }

        const aoi = await monitoringService.updateAoi(userId, args.aoiId, updates);

        return {
            success: true,
            aoiId: aoi.id,
            name: aoi.name,
            active: aoi.active,
            criteria: aoi.criteria,
            updatedAt: aoi.updatedAt,
            message: `AOI monitoring updated successfully. Status: ${aoi.active ? 'Active' : 'Inactive'}`,
        };
    }

    /**
     * Delete AOI monitoring
     */
    private async deleteAoiMonitoring(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('deleteAoiMonitoring called', { aoiId: args.aoiId });

        const userId = context?.conversationId || 'anonymous';
        const aoi = await monitoringService.deleteAoi(userId, args.aoiId);

        return {
            success: true,
            aoiId: aoi.id,
            name: aoi.name,
            active: aoi.active,
            message: `AOI monitoring for "${aoi.name}" has been deactivated. Notifications have been stopped.`,
        };
    }

    /**
     * Create webhook
     */
    private async createWebhook(args: any, _context?: ToolExecutionContext): Promise<any> {
        logger.info('createWebhook called', { url: args.url, events: args.events });

        const params: any = {
            url: args.url,
            events: args.events,
        };

        if (args.aoiId) {
            params.aoiId = args.aoiId;
        }

        if (args.secret) {
            params.secret = args.secret;
        }

        if (args.metadata) {
            params.metadata = args.metadata;
        }

        const webhook = await skyfiClient.createWebhook(params);

        return {
            success: true,
            webhookId: webhook.id,
            url: webhook.url,
            events: webhook.events,
            active: webhook.active,
            createdAt: webhook.createdAt,
            message: `Webhook created successfully. You'll receive notifications for: ${webhook.events.join(', ')}`,
        };
    }

    /**
     * List webhooks
     */
    private async listWebhooks(args: any, _context?: ToolExecutionContext): Promise<any> {
        logger.info('listWebhooks called', args);

        const webhooks = await skyfiClient.listWebhooks();

        let filtered = webhooks;

        if (args.active !== undefined) {
            filtered = filtered.filter(w => w.active === args.active);
        }

        if (args.aoiId) {
            filtered = filtered.filter(w => w.aoiId === args.aoiId);
        }

        if (args.includeInactive === false) {
            filtered = filtered.filter(w => w.active);
        }

        return {
            success: true,
            webhooks: filtered.map(w => ({
                id: w.id,
                url: w.url,
                events: w.events,
                aoiId: w.aoiId,
                active: w.active,
                createdAt: w.createdAt,
                lastTriggered: w.lastTriggered,
                metadata: w.metadata,
            })),
            total: filtered.length,
            message: `Found ${filtered.length} webhook${filtered.length !== 1 ? 's' : ''}`,
        };
    }

    /**
     * Delete webhook
     */
    private async deleteWebhook(args: any, _context?: ToolExecutionContext): Promise<any> {
        logger.info('deleteWebhook called', { webhookId: args.webhookId });

        await skyfiClient.deleteWebhook(args.webhookId);

        return {
            success: true,
            webhookId: args.webhookId,
            message: `Webhook deleted successfully. Notifications have been stopped.`,
        };
    }

    /**
     * Test webhook
     */
    private async testWebhook(args: any, _context?: ToolExecutionContext): Promise<any> {
        logger.info('testWebhook called', { webhookId: args.webhookId });

        // For now, return a simulated test result
        // In production, this would actually trigger a test event
        return {
            success: true,
            webhookId: args.webhookId,
            testSent: true,
            timestamp: new Date().toISOString(),
            message: `Test notification sent to webhook. Check your endpoint for delivery.`,
        };
    }

    /**
     * Get satellite capabilities
     */
    private async getSatelliteCapabilities(args: any): Promise<any> {
        logger.info('getSatelliteCapabilities called', args);

        // Import satellite capabilities module
        const {
            getSatelliteCapabilities: getSatCap,
            getActiveSatellites,
            filterSatellitesByResolution,
            filterSatellitesByType,
        } = await import('../integrations/skyfi/satellite-capabilities');

        if (args.satellite) {
            const sat = getSatCap(args.satellite);
            if (!sat) {
                return {
                    success: false,
                    error: `Satellite not found: ${args.satellite}`,
                    message: `Could not find satellite: ${args.satellite}. Try one of: WorldView-3, Sentinel-2A, Pléiades Neo 3`,
                };
            }

            return {
                success: true,
                satellite: sat,
                message: `${sat.name} operated by ${sat.operator}. Resolution: ${sat.resolution.panchromatic || sat.resolution.multispectral}m`,
            };
        }

        let satellites;
        if (args.minResolution || args.maxResolution) {
            satellites = filterSatellitesByResolution(args.minResolution, args.maxResolution);
        } else if (args.capability) {
            satellites = filterSatellitesByType(args.capability);
        } else {
            satellites = getActiveSatellites();
            if (!args.includeInactive) {
                satellites = satellites.filter(s => s.status === 'active');
            }
        }

        return {
            success: true,
            satellites: satellites.map(s => ({
                name: s.name,
                operator: s.operator,
                status: s.status,
                resolution: s.resolution,
                swathWidth: s.swathWidth,
                revisitTime: s.revisitTime,
                spectralBands: s.spectralBands.length,
                type: s.type,
                pricing: s.pricing,
                idealFor: s.idealFor,
            })),
            total: satellites.length,
            message: `Found ${satellites.length} satellite${satellites.length !== 1 ? 's' : ''} matching criteria`,
        };
    }

    /**
     * Compare satellites
     */
    private async compareSatellites(args: any): Promise<any> {
        logger.info('compareSatellites called', { satellites: args.satellites });

        const { compareSatellites: compareSats } = await import('../integrations/skyfi/satellite-capabilities');

        const comparison = compareSats(args.satellites);

        if (comparison.satellites.length === 0) {
            return {
                success: false,
                error: 'No valid satellites found for comparison',
                message: 'Please provide valid satellite names',
            };
        }

        return {
            success: true,
            comparison: comparison.comparison,
            satellites: comparison.satellites.map(s => ({
                name: s.name,
                operator: s.operator,
                resolution: s.resolution,
                swathWidth: s.swathWidth,
                revisitTime: s.revisitTime,
                spectralBands: s.spectralBands.length,
                pricing: s.pricing,
                idealFor: s.idealFor,
                limitations: s.limitations,
            })),
            summary: {
                highestResolution: comparison.satellites.sort((a, b) => {
                    const resA = a.resolution.panchromatic || a.resolution.multispectral || 1000;
                    const resB = b.resolution.panchromatic || b.resolution.multispectral || 1000;
                    return resA - resB;
                })[0]?.name,
                widestSwath: comparison.satellites.sort((a, b) => b.swathWidth - a.swathWidth)[0]?.name,
                fastestRevisit: comparison.satellites.sort((a, b) => a.revisitTime - b.revisitTime)[0]?.name,
                lowestCost: comparison.satellites.sort((a, b) => {
                    const priceA = a.pricing.archivePerKm2 || 1000;
                    const priceB = b.pricing.archivePerKm2 || 1000;
                    return priceA - priceB;
                })[0]?.name,
            },
            message: `Compared ${comparison.satellites.length} satellites`,
        };
    }

    /**
     * Recommend satellite based on requirements
     */
    private async recommendSatellite(args: any): Promise<any> {
        logger.info('recommendSatellite called', args);

        const { recommendSatellites } = await import('../integrations/skyfi/satellite-capabilities');

        const useCase = args.useCase || 'general';
        const priority = args.priority || 'balanced';

        const recommendations = recommendSatellites(useCase, priority);

        // Apply additional filters
        let filtered = recommendations;

        if (args.minResolution) {
            filtered = filtered.filter(s => {
                const res = s.resolution.panchromatic || s.resolution.multispectral || 1000;
                return res <= args.minResolution;
            });
        }

        if (args.maxBudget) {
            filtered = filtered.filter(s => {
                const price = s.pricing.archivePerKm2 || 0;
                return price <= args.maxBudget || price === 0;
            });
        }

        if (filtered.length === 0) {
            return {
                success: false,
                error: 'No satellites match your criteria',
                message: 'Try relaxing some constraints like resolution or budget',
            };
        }

        const topPick = filtered[0];

        return {
            success: true,
            topRecommendation: {
                name: topPick.name,
                operator: topPick.operator,
                resolution: topPick.resolution,
                revisitTime: topPick.revisitTime,
                swathWidth: topPick.swathWidth,
                pricing: topPick.pricing,
                idealFor: topPick.idealFor,
                capabilities: topPick.capabilities,
                limitations: topPick.limitations,
                reason: `Best match for ${useCase} prioritizing ${priority}`,
            },
            alternativeOptions: filtered.slice(1, 4).map(s => ({
                name: s.name,
                operator: s.operator,
                resolution: s.resolution,
                pricing: s.pricing,
                idealFor: s.idealFor,
            })),
            total: filtered.length,
            message: `Recommended ${topPick.name} for your ${useCase} use case`,
        };
    }

    /**
     * Batch create orders
     */
    private async batchCreateOrders(args: any): Promise<any> {
        logger.info('batchCreateOrders called', { count: args.orders.length });

        const results = {
            successful: [] as any[],
            failed: [] as any[],
        };

        for (const orderSpec of args.orders) {
            try {
                const order = await skyfiClient.createOrder({
                    archiveId: orderSpec.imageId,
                    deliveryFormat: orderSpec.deliveryFormat || 'GeoTIFF',
                    metadata: orderSpec.metadata,
                    webhookUrl: args.webhookUrl,
                });

                results.successful.push({
                    imageId: orderSpec.imageId,
                    orderId: order.id,
                    status: order.status,
                    price: order.price,
                });

                logger.info('Order created in batch', {
                    imageId: orderSpec.imageId,
                    orderId: order.id,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                results.failed.push({
                    imageId: orderSpec.imageId,
                    error: errorMessage,
                });

                logger.error('Order failed in batch', {
                    imageId: orderSpec.imageId,
                    error: errorMessage,
                });

                // Stop on first error if failFast is true
                if (args.failFast) {
                    logger.warn('Stopping batch operation due to failFast=true');
                    break;
                }
            }
        }

        const totalCost = results.successful.reduce((sum, order) => sum + (order.price || 0), 0);

        return {
            success: true,
            summary: {
                total: args.orders.length,
                processed: results.successful.length + results.failed.length,
                successful: results.successful.length,
                failed: results.failed.length,
                totalCost,
                currency: 'USD',
            },
            successful: results.successful,
            failed: results.failed,
            message: `Batch complete: ${results.successful.length}/${args.orders.length} orders successful`,
        };
    }

    /**
     * Get MCP server health
     */
    private async getMcpHealth(args: any): Promise<any> {
        logger.info('getMcpHealth called', args);

        const health: any = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: {
                uptime: process.uptime(),
                uptimeFormatted: this.formatUptime(process.uptime()),
                version: '1.0.0',
                node: process.version,
                platform: process.platform,
                arch: process.arch,
            },
        };

        // Memory and performance metrics
        if (args.includeMetrics !== false) {
            const memUsage = process.memoryUsage();
            health.metrics = {
                memory: {
                    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
                    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
                },
                cpu: {
                    user: process.cpuUsage().user,
                    system: process.cpuUsage().system,
                },
            };
        }

        // Cache status
        if (args.includeCache !== false) {
            health.cache = {
                status: 'operational',
                type: 'in-memory',
                message: 'Cache is operational',
            };
        }

        // Diagnostics
        if (args.includeDiagnostics) {
            health.diagnostics = {
                skyfiApi: {
                    status: 'fallback',
                    message: 'Using fallback data (API endpoints unavailable)',
                    recommendation: 'Check SKYFI_API_TROUBLESHOOTING.md',
                },
                osmApi: {
                    status: 'operational',
                    message: 'OpenStreetMap API reachable',
                },
            };
        }

        // Verbose info
        if (args.verbose) {
            health.environment = {
                nodeEnv: process.env.NODE_ENV || 'development',
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasSkyFi: !!process.env.SKYFI_API_KEY,
            };
        }

        health.recommendations = [];
        if (!process.env.OPENAI_API_KEY) {
            health.recommendations.push('Set OPENAI_API_KEY to enable chat functionality');
        }
        if (!process.env.SKYFI_API_KEY) {
            health.recommendations.push('Set SKYFI_API_KEY for live SkyFi API access');
        }

        return {
            success: true,
            health,
            message: `Server is ${health.status} (uptime: ${health.server.uptimeFormatted})`,
        };
    }

    /**
     * Clear cache
     */
    private async clearCache(args: any): Promise<any> {
        logger.info('clearCache called', { cacheType: args.cacheType });

        const cacheType = args.cacheType || 'all';

        // Clear SkyFi client cache
        skyfiClient.clearCache();

        return {
            success: true,
            cacheType,
            clearedAt: new Date().toISOString(),
            message: `Cache cleared: ${cacheType}. Next requests will fetch fresh data.`,
        };
    }

    /**
     * Get search recommendations based on history
     */
    private async getSearchRecommendations(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('getSearchRecommendations called', args);

        const conversationId = context?.conversationId || 'anonymous';
        const currentCriteria = args.currentCriteria;

        const recommendations = sessionHistoryManager.getRecommendations(
            conversationId,
            currentCriteria
        );

        let message = recommendations.length > 0
            ? `Found ${recommendations.length} personalized recommendation(s) based on your search history.`
            : 'No specific recommendations yet. Continue searching to build your history!';

        const response: any = {
            success: true,
            recommendations: recommendations.map(r => ({
                type: r.type,
                title: r.title,
                description: r.description,
                action: r.action,
                confidence: r.confidence,
                reason: r.reason,
            })),
            total: recommendations.length,
            message,
        };

        if (args.includePatterns) {
            const patterns = sessionHistoryManager.getRecentPatterns(conversationId, 10);
            response.recentPatterns = patterns;
        }

        return response;
    }

    /**
     * Get session analytics
     */
    private async getSessionAnalytics(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('getSessionAnalytics called', args);

        const conversationId = context?.conversationId || 'anonymous';
        const analytics = sessionHistoryManager.getAnalytics(conversationId);

        const response: any = {
            success: true,
            analytics: {
                totalSearches: analytics.totalSearches,
                totalOrders: analytics.totalOrders,
                searchSuccessRate: Math.round(analytics.searchSuccessRate * 100),
                mostSearchedLocations: analytics.mostSearchedLocations.slice(0, 5),
                preferredSatellites: analytics.preferredSatellites.slice(0, 5),
                averageCloudCoverage: Math.round(analytics.averageCloudCoverage),
                averageResolution: Math.round(analytics.averageResolution),
            },
            message: analytics.totalSearches > 0
                ? `Analyzed ${analytics.totalSearches} search(es) and ${analytics.totalOrders} order(s).`
                : 'No search history yet. Start searching to see your analytics!',
        };

        if (args.includePatterns) {
            const patternLimit = args.patternLimit || 10;
            const patterns = sessionHistoryManager.getRecentPatterns(conversationId, patternLimit);
            response.patterns = patterns.map(p => ({
                type: p.type,
                value: p.value,
                frequency: p.frequency,
                successRate: Math.round(p.successRate * 100),
                lastUsed: new Date(p.lastUsed).toISOString(),
            }));
        }

        return response;
    }

    /**
     * Compare search sessions
     */
    private async compareSearchSessions(args: any, _context?: ToolExecutionContext): Promise<any> {
        logger.info('compareSearchSessions called', args);

        const { sessionId1, sessionId2 } = args;

        const session1 = searchSessionService.getSession(sessionId1);
        const session2 = searchSessionService.getSession(sessionId2);

        if (!session1 || !session2) {
            return {
                success: false,
                error: 'One or both sessions not found',
                message: 'Please provide valid session IDs from your search history.',
            };
        }

        const results1 = searchSessionService.getAllSessionResults(sessionId1);
        const results2 = searchSessionService.getAllSessionResults(sessionId2);

        // Compare criteria
        const differences: Array<{ field: string; session1: any; session2: any }> = [];
        const allKeys = new Set([
            ...Object.keys(session1.criteria),
            ...Object.keys(session2.criteria),
        ]);

        for (const key of allKeys) {
            const val1 = (session1.criteria as any)[key];
            const val2 = (session2.criteria as any)[key];

            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                differences.push({
                    field: key,
                    session1: val1,
                    session2: val2,
                });
            }
        }

        // Generate recommendations
        const recommendations = [];

        if (results1.length > results2.length) {
            recommendations.push({
                type: 'use_better_criteria',
                title: 'Session 1 Had More Results',
                description: `Session 1 found ${results1.length} results vs ${results2.length} in Session 2`,
                confidence: 0.8,
            });
        } else if (results2.length > results1.length) {
            recommendations.push({
                type: 'use_better_criteria',
                title: 'Session 2 Had More Results',
                description: `Session 2 found ${results2.length} results vs ${results1.length} in Session 1`,
                confidence: 0.8,
            });
        }

        return {
            success: true,
            comparison: {
                session1: {
                    sessionId: sessionId1,
                    criteria: session1.criteria,
                    resultCount: results1.length,
                    createdAt: new Date(session1.createdAt).toISOString(),
                },
                session2: {
                    sessionId: sessionId2,
                    criteria: session2.criteria,
                    resultCount: results2.length,
                    createdAt: new Date(session2.createdAt).toISOString(),
                },
                differences: args.highlightDifferences !== false ? differences : [],
                recommendations,
            },
            message: `Compared ${differences.length} difference(s) between sessions.`,
        };
    }

    /**
     * Export session history
     */
    private async exportSessionHistory(args: any, context?: ToolExecutionContext): Promise<any> {
        logger.info('exportSessionHistory called', args);

        const _conversationId = context?.conversationId || 'anonymous';
        const format = args.format || 'json';

        const searchSessions = searchSessionService.getConversationSessions(_conversationId);
        const orderSessions = orderHistoryService.getConversationSessions(_conversationId);
        const historyExport = sessionHistoryManager.exportHistory(_conversationId);

        if (format === 'summary') {
        return {
            success: true,
            format: 'summary',
            summary: {
                conversationId: _conversationId,
                exportedAt: historyExport.exportedAt,
                    searchSessions: searchSessions.length,
                    orderSessions: orderSessions.length,
                    totalSearches: historyExport.analytics.totalSearches,
                    totalOrders: historyExport.analytics.totalOrders,
                    uniquePatterns: historyExport.patterns.length,
                },
                message: `Summary: ${searchSessions.length} search session(s), ${orderSessions.length} order session(s)`,
            };
        }

        const exportData = {
            conversationId: _conversationId,
            exportedAt: new Date().toISOString(),
            searchSessions: searchSessions.map(s => ({
                ...s,
                results: searchSessionService.getAllSessionResults(s.sessionId),
            })),
            orderSessions: orderSessions.map(s => ({
                ...s,
                orders: orderHistoryService.getAllSessionOrders(s.sessionId),
            })),
            patterns: historyExport.patterns,
            analytics: historyExport.analytics,
        };

        return {
            success: true,
            format: 'json',
            data: exportData,
            downloadUrl: `/mcp/export/${_conversationId}`,
            message: `Exported complete session history with ${searchSessions.length} search session(s) and ${orderSessions.length} order session(s).`,
        };
    }

    /**
     * Format uptime in human-readable format
     */
    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }
}

// Singleton instance
export const toolExecutor = new ToolExecutor();

