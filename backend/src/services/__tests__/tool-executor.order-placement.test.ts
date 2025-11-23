import { ToolExecutor } from '../tool-executor';
import { skyfiClient } from '../../integrations/skyfi/client';
import { authValidationService } from '../auth-validation.service';
import { feasibilityService } from '../feasibility.service';
import { SkyFiAuthError, SkyFiValidationError } from '../../integrations/skyfi/errors';

// Mock dependencies
jest.mock('../../integrations/skyfi/client');
jest.mock('../auth-validation.service');
jest.mock('../feasibility.service');
jest.mock('../../utils/logger');

describe('ToolExecutor - Order Placement with Price Confirmation (P0 Feature #5)', () => {
  let toolExecutor: ToolExecutor;

  beforeEach(() => {
    toolExecutor = new ToolExecutor();
    jest.clearAllMocks();
  });

  describe('confirm_order_with_pricing - Two-Step Workflow', () => {
    describe('Archive Orders', () => {
      it('should confirm archive order with full pricing details', async () => {
        // Mock auth validation - user is authenticated with payment method
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock payment validation
        (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
          valid: true,
          confirmationRequired: false,
          withinSpendingLimit: true,
          warnings: [],
          details: 'Order total: USD 250.00',
        });

        // Mock spending limit check
        (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
          withinLimit: true,
          currentSpend: 500,
          limit: 10000,
          remaining: 9500,
        });

        // Mock price estimate
        (skyfiClient.estimatePrice as jest.Mock).mockResolvedValue({
          estimatedPrice: 250.0,
          currency: 'USD',
          breakdown: {
            'Base price': '$200.00',
            'Processing': '$50.00',
          },
        });

        const result = await toolExecutor.executeTool({
          id: 'test-1',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'archive',
            imageId: 'img-12345',
            deliveryFormat: 'GeoTIFF',
            processingLevel: 'orthorectified',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.orderType).toBe('archive');
        expect(result.result.imageId).toBe('img-12345');
        expect(result.result.feasible).toBe(true);
        expect(result.result.readyToOrder).toBe(true);

        // Verify authentication was checked
        expect(result.result.authentication.authenticated).toBe(true);
        expect(result.result.authentication.hasPaymentMethod).toBe(true);
        expect(result.result.authentication.canPlaceOrders).toBe(true);

        // Verify pricing information is present
        expect(result.result.pricing.estimatedPrice).toBe(250.0);
        expect(result.result.pricing.currency).toBe('USD');
        expect(result.result.pricing.breakdown).toBeDefined();

        // Verify payment validation
        expect(result.result.payment.withinSpendingLimit).toBe(true);

        // Verify confirmation message
        expect(result.result.message).toContain('ORDER SUMMARY');
        expect(result.result.message).toContain('img-12345');
        expect(result.result.message).toContain('USD 250.00');
        expect(result.result.message).toContain('Ready to order');
      });

      it('should require authentication before confirming order', async () => {
        // Mock failed authentication
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: false,
          hasPaymentMethod: false,
          canPlaceOrders: false,
          apiKeyValid: false,
          accountStatus: 'unknown',
          warnings: [],
          errors: ['SkyFi API key not configured'],
        });

        const result = await toolExecutor.executeTool({
          id: 'test-2',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'archive',
            imageId: 'img-12345',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(false);
        expect(result.result.error).toBe('Authentication required');
        expect(result.result.errors).toContain('SkyFi API key not configured');
        expect(result.result.message).toContain('SkyFi API key');
      });

      it('should require payment method before confirming order', async () => {
        // Mock authentication success but no payment method
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: false,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: ['No payment method on file'],
          errors: [],
        });

        const result = await toolExecutor.executeTool({
          id: 'test-3',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'archive',
            imageId: 'img-12345',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(false);
        expect(result.result.error).toBe('Payment method required');
        expect(result.result.warnings).toContain('No payment method on file');
        expect(result.result.message).toContain('payment method');
      });

      it('should warn about high-value orders', async () => {
        // Mock auth validation
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock high-value order
        (skyfiClient.estimatePrice as jest.Mock).mockResolvedValue({
          estimatedPrice: 1500.0,
          currency: 'USD',
          breakdown: {
            'Base price': '$1200.00',
            'Processing': '$300.00',
          },
        });

        // Mock payment validation with high-value warning
        (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
          valid: true,
          confirmationRequired: true,
          withinSpendingLimit: true,
          warnings: ['⚠️ High-value order detected: USD 1500.00', 'Please confirm this order before proceeding'],
          details: 'Order total: USD 1500.00',
        });

        (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
          withinLimit: true,
          currentSpend: 500,
          limit: 10000,
          remaining: 8500,
        });

        const result = await toolExecutor.executeTool({
          id: 'test-4',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'archive',
            imageId: 'img-high-value',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.payment.confirmationRequired).toBe(true);
        expect(result.result.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining('High-value order'),
          ])
        );
      });

      it('should warn when order exceeds spending limit', async () => {
        // Mock auth validation
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock price estimate
        (skyfiClient.estimatePrice as jest.Mock).mockResolvedValue({
          estimatedPrice: 6000.0,
          currency: 'USD',
          breakdown: {
            'Base price': '$5000.00',
            'Processing': '$1000.00',
          },
        });

        // Mock payment validation
        (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
          valid: true,
          confirmationRequired: true,
          withinSpendingLimit: false,
          warnings: ['🚨 VERY HIGH-VALUE order detected: USD 6000.00'],
          details: 'Order total: USD 6000.00',
        });

        // Mock spending limit exceeded
        (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
          withinLimit: false,
          currentSpend: 5000,
          limit: 10000,
          remaining: 5000,
        });

        const result = await toolExecutor.executeTool({
          id: 'test-5',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'archive',
            imageId: 'img-expensive',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.payment.withinSpendingLimit).toBe(false);
        expect(result.result.readyToOrder).toBe(false);
        expect(result.result.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining('exceeds monthly spending limit'),
          ])
        );
        expect(result.result.message).toContain('Cannot proceed');
      });
    });

    describe('Tasking Orders', () => {
      it('should confirm tasking order with feasibility and pricing', async () => {
        // Mock auth validation
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock feasibility assessment
        (feasibilityService.evaluateTaskFeasibility as jest.Mock).mockResolvedValue({
          feasible: true,
          confidence: 'high',
          summary: 'Tasking request is highly feasible',
          weather: {
            riskLevel: 'low',
            forecast: 'Clear skies expected',
          },
          coverage: {
            availableScenes: 0,
            archiveCount: 0,
          },
          pricingOptions: [
            {
              satelliteName: 'WorldView-3',
              total: 800.0,
              currency: 'USD',
              estimatedTurnaroundDays: 7,
              breakdown: {
                'Base tasking fee': '$600.00',
                'Processing': '$200.00',
              },
            },
          ],
          risks: [],
          alternatives: [],
          recommendedApproach: 'tasking',
        });

        // Mock payment validation
        (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
          valid: true,
          confirmationRequired: false,
          withinSpendingLimit: true,
          warnings: [],
          details: 'Order total: USD 800.00',
        });

        (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
          withinLimit: true,
          currentSpend: 1000,
          limit: 10000,
          remaining: 9000,
        });

        const result = await toolExecutor.executeTool({
          id: 'test-6',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'tasking',
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            startDate: '2025-12-01',
            endDate: '2025-12-31',
            resolution: 0.5,
            maxCloudCoverage: 20,
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.orderType).toBe('tasking');
        expect(result.result.feasible).toBe(true);
        expect(result.result.confidence).toBe('high');
        expect(result.result.readyToOrder).toBe(true);

        // Verify pricing
        expect(result.result.pricing.estimatedPrice).toBe(800.0);
        expect(result.result.pricing.currency).toBe('USD');
        expect(result.result.pricing.turnaroundDays).toBe(7);

        // Verify message
        expect(result.result.message).toContain('TASKING ORDER SUMMARY');
        expect(result.result.message).toContain('USD 800.00');
        expect(result.result.message).toContain('Ready to order');
      });

      it('should reject tasking order if not feasible', async () => {
        // Mock auth validation
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock unfeasible tasking
        (feasibilityService.evaluateTaskFeasibility as jest.Mock).mockResolvedValue({
          feasible: false,
          confidence: 'low',
          summary: 'Tasking request faces significant challenges',
          weather: {
            riskLevel: 'high',
            forecast: 'Heavy cloud coverage expected',
          },
          coverage: {
            availableScenes: 5,
            archiveCount: 5,
          },
          pricingOptions: [],
          risks: ['High cloud coverage probability', 'Limited satellite availability'],
          alternatives: ['Consider archive imagery', 'Adjust date range'],
          recommendedApproach: 'archive',
        });

        const result = await toolExecutor.executeTool({
          id: 'test-7',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'tasking',
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            startDate: '2025-12-01',
            endDate: '2025-12-31',
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.feasible).toBe(false);
        expect(result.result.confidence).toBe('low');
        expect(result.result.readyToOrder).toBe(false);
        expect(result.result.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining('may face challenges'),
          ])
        );
        expect(result.result.message).toContain('Cannot proceed');
      });

      it('should warn about archive alternative if available', async () => {
        // Mock auth validation
        (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          hasPaymentMethod: true,
          canPlaceOrders: true,
          apiKeyValid: true,
          accountStatus: 'active',
          warnings: [],
          errors: [],
        });

        // Mock feasibility with archive alternative
        (feasibilityService.evaluateTaskFeasibility as jest.Mock).mockResolvedValue({
          feasible: true,
          confidence: 'medium',
          summary: 'Tasking is feasible but archive imagery is available',
          weather: {
            riskLevel: 'medium',
          },
          coverage: {
            availableScenes: 10,
            archiveCount: 10,
          },
          pricingOptions: [
            {
              satelliteName: 'Sentinel-2',
              total: 500.0,
              currency: 'USD',
              estimatedTurnaroundDays: 14,
            },
          ],
          risks: [],
          alternatives: ['Archive imagery available'],
          recommendedApproach: 'archive',
        });

        (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
          valid: true,
          confirmationRequired: false,
          withinSpendingLimit: true,
          warnings: [],
          details: 'Order total: USD 500.00',
        });

        (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
          withinLimit: true,
          currentSpend: 0,
          limit: 10000,
          remaining: 10000,
        });

        const result = await toolExecutor.executeTool({
          id: 'test-8',
          name: 'confirm_order_with_pricing',
          arguments: {
            orderType: 'tasking',
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          },
        }, { conversationId: 'test-conversation' });

        expect(result.result.success).toBe(true);
        expect(result.result.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Archive imagery is available'),
          ])
        );
        expect(result.result.message).toContain('archive images available');
      });
    });
  });

  describe('create_satellite_order - Order Execution', () => {
    it('should create order only after confirmation', async () => {
      // Mock auth validation
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      // Mock successful order creation
      (skyfiClient.createOrder as jest.Mock).mockResolvedValue({
        id: 'order-12345',
        status: 'pending',
        price: 250.0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
      });

      const result = await toolExecutor.executeTool({
        id: 'test-9',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-12345',
          deliveryFormat: 'GeoTIFF',
          processingLevel: 'orthorectified',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(true);
      expect(result.result.orderId).toBe('order-12345');
      expect(result.result.status).toBe('pending');
      expect(result.result.price).toBe(250.0);
      expect(result.result.message).toContain('Order created successfully');
    });

    it('should reject order if not authenticated', async () => {
      // Mock failed authentication
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: false,
        hasPaymentMethod: false,
        canPlaceOrders: false,
        apiKeyValid: false,
        accountStatus: 'unknown',
        warnings: [],
        errors: ['Invalid API key'],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-10',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-12345',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Authentication required');
      expect(result.result.message).toContain('Invalid or missing API key');

      // Verify order was not attempted
      expect(skyfiClient.createOrder).not.toHaveBeenCalled();
    });

    it('should reject order if payment method missing', async () => {
      // Mock authentication without payment
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: false,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'payment_required',
        warnings: ['No payment method on file'],
        errors: [],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-11',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-12345',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Payment method required');
      expect(result.result.message).toContain('Payment method required');

      // Verify order was not attempted
      expect(skyfiClient.createOrder).not.toHaveBeenCalled();
    });

    it('should reject order if user cannot place orders', async () => {
      // Mock account that cannot place orders
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: false,
        apiKeyValid: true,
        accountStatus: 'suspended',
        warnings: [],
        errors: ['Account suspended'],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-12',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-12345',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Cannot place orders');
      expect(result.result.message).toContain('not authorized to place orders');

      // Verify order was not attempted
      expect(skyfiClient.createOrder).not.toHaveBeenCalled();
    });

    it('should handle order creation failure gracefully', async () => {
      // Mock successful auth
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      // Mock order creation failure
      (skyfiClient.createOrder as jest.Mock).mockRejectedValue(
        new SkyFiValidationError('Image not available for purchase')
      );

      const result = await toolExecutor.executeTool({
        id: 'test-13',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'invalid-image',
        },
      }, { conversationId: 'test-conversation' });

      // createSatelliteOrder catches errors internally and returns them in result object
      // However, the ToolExecutor's executeTool will also catch and format the error
      // So we check if there's an error in either location
      if (result.error) {
        expect(result.error).toBeTruthy();
        expect(result.result).toBeNull();
        expect(result.error).toContain('Invalid request parameters');
      } else {
        expect(result.result.success).toBe(false);
        expect(result.result.error).toBeTruthy();
        expect(result.result.message).toContain('Failed to create order');
      }
    });

    it('should require imageId parameter', async () => {
      // Mock successful auth
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-14',
        name: 'create_satellite_order',
        arguments: {
          // Missing imageId
          deliveryFormat: 'GeoTIFF',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Missing imageId');
      expect(result.result.message).toContain('Cannot create order without a valid image ID');

      // Verify order was not attempted
      expect(skyfiClient.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('request_satellite_tasking - Tasking Execution', () => {
    it('should create tasking request after confirmation', async () => {
      // Mock auth validation
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      // Mock feasibility check
      (feasibilityService.evaluateTaskFeasibility as jest.Mock).mockResolvedValue({
        feasible: true,
        confidence: 'high',
        summary: 'Tasking is feasible',
        weather: { riskLevel: 'low' },
        coverage: { availableScenes: 0 },
        pricingOptions: [],
        risks: [],
        alternatives: [],
      });

      // Mock successful tasking creation
      (skyfiClient.createTasking as jest.Mock).mockResolvedValue({
        id: 'tasking-12345',
        status: 'requested',
        captureWindow: {
          start: '2025-12-01T00:00:00Z',
          end: '2025-12-31T23:59:59Z',
        },
        estimatedCost: 800.0,
      });

      const result = await toolExecutor.executeTool({
        id: 'test-15',
        name: 'request_satellite_tasking',
        arguments: {
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          startDate: '2025-12-01',
          endDate: '2025-12-31',
          resolution: 0.5,
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(true);
      expect(result.result.taskingId).toBe('tasking-12345');
      expect(result.result.status).toBe('requested');
      expect(result.result.estimatedCost).toBe(800.0);
    });

    it('should reject tasking if not authenticated', async () => {
      // Mock failed authentication
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: false,
        hasPaymentMethod: false,
        canPlaceOrders: false,
        apiKeyValid: false,
        accountStatus: 'unknown',
        warnings: [],
        errors: ['No API key'],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-16',
        name: 'request_satellite_tasking',
        arguments: {
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Authentication required');
      expect(result.result.feasible).toBe(false);

      // Verify tasking was not attempted
      expect(skyfiClient.createTasking).not.toHaveBeenCalled();
    });

    it('should reject tasking if payment method missing', async () => {
      // Mock auth without payment
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: false,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: ['No payment method'],
        errors: [],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-17',
        name: 'request_satellite_tasking',
        arguments: {
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Payment method required');
      expect(result.result.feasible).toBe(false);

      // Verify tasking was not attempted
      expect(skyfiClient.createTasking).not.toHaveBeenCalled();
    });

    it('should require location or AOI', async () => {
      // Mock auth
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-18',
        name: 'request_satellite_tasking',
        arguments: {
          // Missing location and AOI
          startDate: '2025-12-01',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Missing location');
      expect(result.result.feasible).toBe(false);

      // Verify tasking was not attempted
      expect(skyfiClient.createTasking).not.toHaveBeenCalled();
    });

    it('should reject tasking with past dates', async () => {
      // Mock auth
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      const result = await toolExecutor.executeTool({
        id: 'test-19',
        name: 'request_satellite_tasking',
        arguments: {
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          startDate: '2020-01-01',
        },
      }, { conversationId: 'test-conversation' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Invalid start date');
      expect(result.result.feasible).toBe(false);
      expect(result.result.message).toContain('must be in the future');

      // Verify tasking was not attempted
      expect(skyfiClient.createTasking).not.toHaveBeenCalled();
    });

    it('should handle feasibility check failure gracefully', async () => {
      // Mock auth
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      // Mock feasibility failure
      (feasibilityService.evaluateTaskFeasibility as jest.Mock).mockRejectedValue(
        new Error('Feasibility service unavailable')
      );

      // Mock successful tasking (should still proceed with warning)
      (skyfiClient.createTasking as jest.Mock).mockResolvedValue({
        id: 'tasking-12345',
        status: 'requested',
        captureWindow: {},
        estimatedCost: 500.0,
      });

      const result = await toolExecutor.executeTool({
        id: 'test-20',
        name: 'request_satellite_tasking',
        arguments: {
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          startDate: '2025-12-01',
        },
      }, { conversationId: 'test-conversation' });

      // Should succeed but with caution
      expect(result.result.success).toBe(true);
      expect(result.result.taskingId).toBe('tasking-12345');
    });
  });

  describe('Two-Step Workflow Enforcement', () => {
    it('should enforce confirm -> create workflow', async () => {
      // Step 1: Confirm order
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      (skyfiClient.estimatePrice as jest.Mock).mockResolvedValue({
        estimatedPrice: 250.0,
        currency: 'USD',
        breakdown: {},
      });

      (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
        valid: true,
        confirmationRequired: false,
        withinSpendingLimit: true,
        warnings: [],
        details: 'Order total: USD 250.00',
      });

      (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
        withinLimit: true,
        currentSpend: 0,
        limit: 10000,
        remaining: 10000,
      });

      const confirmResult = await toolExecutor.executeTool({
        id: 'test-21a',
        name: 'confirm_order_with_pricing',
        arguments: {
          orderType: 'archive',
          imageId: 'img-12345',
        },
      }, { conversationId: 'test-conversation' });

      expect(confirmResult.result.success).toBe(true);
      expect(confirmResult.result.readyToOrder).toBe(true);

      // Verify no order was created yet
      expect(skyfiClient.createOrder).not.toHaveBeenCalled();

      // Step 2: Create order after confirmation
      (skyfiClient.createOrder as jest.Mock).mockResolvedValue({
        id: 'order-12345',
        status: 'pending',
        price: 250.0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
      });

      const createResult = await toolExecutor.executeTool({
        id: 'test-21b',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-12345',
        },
      }, { conversationId: 'test-conversation' });

      expect(createResult.result.success).toBe(true);
      expect(createResult.result.orderId).toBe('order-12345');

      // Verify order was created exactly once
      expect(skyfiClient.createOrder).toHaveBeenCalledTimes(1);
    });

    it('should allow direct order creation if user bypasses confirmation (with safety checks)', async () => {
      // User calls create_satellite_order directly without confirm_order_with_pricing
      // Safety checks should still run
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      (skyfiClient.createOrder as jest.Mock).mockResolvedValue({
        id: 'order-direct',
        status: 'pending',
        price: 150.0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
      });

      const result = await toolExecutor.executeTool({
        id: 'test-22',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-direct',
        },
      }, { conversationId: 'test-conversation' });

      // Order should succeed with all safety checks passed
      expect(result.result.success).toBe(true);
      expect(result.result.orderId).toBe('order-direct');

      // Verify auth was validated
      expect(authValidationService.validateUserAuth).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing conversationId gracefully', async () => {
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: ['No user identification provided - using anonymous session'],
        errors: [],
      });

      (skyfiClient.estimatePrice as jest.Mock).mockResolvedValue({
        estimatedPrice: 100.0,
        currency: 'USD',
        breakdown: {},
      });

      (authValidationService.validatePayment as jest.Mock).mockResolvedValue({
        valid: true,
        confirmationRequired: false,
        withinSpendingLimit: true,
        warnings: [],
        details: 'Order total: USD 100.00',
      });

      (authValidationService.checkSpendingLimit as jest.Mock).mockResolvedValue({
        withinLimit: true,
        currentSpend: 0,
        limit: 10000,
        remaining: 10000,
      });

      const result = await toolExecutor.executeTool({
        id: 'test-23',
        name: 'confirm_order_with_pricing',
        arguments: {
          orderType: 'archive',
          imageId: 'img-anon',
        },
      });
      // No context provided

      expect(result.result.success).toBe(true);
      expect(result.result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('anonymous session'),
        ])
      );
    });

    it('should handle API errors with user-friendly messages', async () => {
      (authValidationService.validateUserAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        hasPaymentMethod: true,
        canPlaceOrders: true,
        apiKeyValid: true,
        accountStatus: 'active',
        warnings: [],
        errors: [],
      });

      (skyfiClient.createOrder as jest.Mock).mockRejectedValue(
        new SkyFiAuthError('API key expired')
      );

      const result = await toolExecutor.executeTool({
        id: 'test-24',
        name: 'create_satellite_order',
        arguments: {
          imageId: 'img-expired',
        },
      }, { conversationId: 'test-conversation' });

      // createSatelliteOrder catches errors internally
      // Check if error is in result.error (from executeTool) or result.result.error (from createSatelliteOrder)
      if (result.error) {
        expect(result.error).toBeTruthy();
        expect(result.result).toBeNull();
        expect(result.error).toContain('authentication failed');
      } else {
        expect(result.result.success).toBe(false);
        expect(result.result.error).toBeTruthy();
        // The error message should indicate an authentication or order creation problem
        expect(result.result.message).toBeTruthy();
      }
    });
  });
});
