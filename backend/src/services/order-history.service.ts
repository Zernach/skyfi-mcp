import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { skyfiClient } from '../integrations/skyfi/client';
import { sessionHistoryManager } from './session-history-manager.service';

export interface OrderHistoryResponse {
  success: boolean;
  sessionId: string;
  message: string;
  summary: string;
  filters: Record<string, any>;
  page: {
    index: number;
    offset: number;
    limit: number;
    count: number;
    hasMore: boolean;
    nextOffset?: number;
    previousOffset?: number;
  };
  orders: OrderSummary[];
  history?: OrderHistoryEntry[];
  context: {
    createdAt: string;
    updatedAt: string;
    storedPages: number;
    uniqueOrders: number;
  };
  analytics?: {
    totalOrders: number;
    totalSearches: number;
  };
}

export interface OrderSummary {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  price?: number;
  currency?: string;
  deliveryUrl?: string;
  metadata?: Record<string, any>;
}

export interface OrderHistoryEntry {
  id: string;
  timestamp: number;
  filters: Record<string, any>;
  summary: string;
}

interface OrderSessionPage {
  index: number;
  offset: number;
  limit: number;
  count: number;
  orders: OrderSummary[];
  fetchedAt: number;
}

interface OrderHistorySession {
  sessionId: string;
  conversationId: string;
  filters: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  pages: OrderSessionPage[];
  history: OrderHistoryEntry[];
  lastOffset: number;
  lastLimit: number;
  orderIds: Set<string>;
}

interface ControlArgs {
  sessionId?: string;
  limit?: number;
  offset?: number;
  page?: number;
  action?: string;
  includeHistory?: boolean;
  reset?: boolean;
  refinements?: Record<string, any>;
}

const CONTROL_KEYS = new Set([
  'sessionId',
  'limit',
  'offset',
  'page',
  'action',
  'includeHistory',
  'refinements',
  'refine',
  'reset',
]);

const DEFAULT_LIMIT = 20;

function stableStringify(obj: Record<string, any>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export class OrderHistoryService {
  private sessions = new Map<string, OrderHistorySession>();
  private conversationSessions = new Map<string, Set<string>>();

  /**
   * Get session summary for a conversation (useful for showing order history)
   */
  getConversationSessions(conversationId: string): Array<{
    sessionId: string;
    createdAt: string;
    updatedAt: string;
    summary: string;
    orderCount: number;
    filters: Record<string, any>;
  }> {
    const sessionIds = this.conversationSessions.get(conversationId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is OrderHistorySession => s !== undefined)
      .map((session) => ({
        sessionId: session.sessionId,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        summary: this.describeFilters(session.filters),
        orderCount: session.orderIds.size,
        filters: session.filters,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get detailed session information
   */
  getSession(sessionId: string): OrderHistorySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all orders from a session (across all pages)
   */
  getAllSessionOrders(sessionId: string): OrderSummary[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.pages
      .sort((a, b) => a.offset - b.offset)
      .flatMap((page) => page.orders);
  }

  async listOrders(
    conversationId: string,
    args: Record<string, any>
  ): Promise<OrderHistoryResponse> {
    const control = this.extractControlArgs(args);
    const baseSession = control.sessionId
      ? this.sessions.get(control.sessionId)
      : undefined;
    const isReset = Boolean(control.reset || !baseSession);

    const directFilters = this.extractFilters(args);
    const refinementFilters = this.extractFilters(
      control.refinements || args.refine || {}
    );

    if (!baseSession && Object.keys(directFilters).length === 0) {
      throw new Error(
        'Order history requests require at least one filter or an existing session.'
      );
    }

    const session = isReset
      ? this.createSession(conversationId, directFilters)
      : this.cloneSession(baseSession!);

    let mergedFilters = session.filters;
    if (isReset) {
      mergedFilters = this.mergeFilters({}, directFilters);
    } else if (Object.keys(directFilters).length > 0) {
      mergedFilters = this.mergeFilters(mergedFilters, directFilters);
    }

    if (Object.keys(refinementFilters).length > 0) {
      mergedFilters = this.mergeFilters(mergedFilters, refinementFilters);
    }

    if (Object.keys(mergedFilters).length === 0) {
      throw new Error(
        'Unable to determine order filters. Provide filters or reset the session.'
      );
    }

    const limit = this.resolveLimit(control.limit, session.lastLimit);
    const offset = this.resolveOffset(control, session, limit, isReset);

    const requestFilters = {
      ...mergedFilters,
      limit,
      offset,
    };

    logger.info('Fetching order history page', {
      conversationId,
      sessionId: session.sessionId,
      limit,
      offset,
      filterKeys: Object.keys(mergedFilters),
    });

    const response = await skyfiClient.listOrders(requestFilters);
    const orders = response.orders;

    const pageIndex = this.calculatePageIndex(offset, limit);
    const hasMore = orders.length === limit;

    const summarized = orders.map<OrderSummary>((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      price: undefined, // Price not included in Order response
      currency: undefined,
      deliveryUrl: undefined, // Use getOrderDeliverable API for download links
      metadata: order.metadata,
    }));

    const page: OrderSessionPage = {
      index: pageIndex,
      offset,
      limit,
      count: summarized.length,
      orders: summarized,
      fetchedAt: Date.now(),
    };

    const filtersChanged =
      stableStringify(this.normalizeFilters(session.filters)) !==
      stableStringify(this.normalizeFilters(mergedFilters));

    session.filters = this.normalizeFilters(mergedFilters);
    session.lastLimit = limit;
    session.lastOffset = offset;
    session.updatedAt = Date.now();

    this.storePage(session, page);
    this.trackOrderIds(session, summarized);

    if (filtersChanged || session.history.length === 0 || isReset) {
      session.history.push({
        id: randomUUID(),
        timestamp: session.updatedAt,
        filters: session.filters,
        summary: this.describeFilters(session.filters),
      });
    }

    this.persistSession(session);

    // Track order lookup for analytics
    if (summarized.length > 0) {
      summarized.forEach(order => {
        sessionHistoryManager.trackOrder(conversationId, order);
      });
    }

    const history = control.includeHistory ? [...session.history] : undefined;

    const summary = this.buildSummary(page, session.orderIds.size);

    // Get analytics summary
    const analytics = sessionHistoryManager.getAnalytics(conversationId);

    return {
      success: true,
      sessionId: session.sessionId,
      message: `Page ${page.index} with ${page.count} order(s).`,
      summary,
      filters: session.filters,
      page: {
        index: page.index,
        offset: page.offset,
        limit: page.limit,
        count: page.count,
        hasMore,
        nextOffset: hasMore ? page.offset + page.limit : undefined,
        previousOffset:
          page.offset > 0 ? Math.max(page.offset - page.limit, 0) : undefined,
      },
      orders: summarized,
      history,
      context: {
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        storedPages: session.pages.length,
        uniqueOrders: session.orderIds.size,
      },
      analytics: analytics.totalOrders > 0 ? {
        totalOrders: analytics.totalOrders,
        totalSearches: analytics.totalSearches,
      } : undefined,
    };
  }

  reset(): void {
    this.sessions.clear();
    this.conversationSessions.clear();
  }

  private createSession(
    conversationId: string,
    filters: Record<string, any>
  ): OrderHistorySession {
    const sessionId = randomUUID();
    const timestamp = Date.now();
    return {
      sessionId,
      conversationId,
      filters: this.normalizeFilters(filters),
      createdAt: timestamp,
      updatedAt: timestamp,
      pages: [],
      history: [],
      orderIds: new Set(),
      lastOffset: 0,
      lastLimit: DEFAULT_LIMIT,
    };
  }

  private cloneSession(session: OrderHistorySession): OrderHistorySession {
    return {
      ...session,
      filters: { ...session.filters },
      pages: [...session.pages],
      history: [...session.history],
      orderIds: new Set(session.orderIds),
    };
  }

  private persistSession(session: OrderHistorySession): void {
    this.sessions.set(session.sessionId, session);
    if (!this.conversationSessions.has(session.conversationId)) {
      this.conversationSessions.set(session.conversationId, new Set());
    }
    this.conversationSessions
      .get(session.conversationId)!
      .add(session.sessionId);
  }

  private storePage(session: OrderHistorySession, page: OrderSessionPage): void {
    const existingIndex = session.pages.findIndex(
      (stored) => stored.offset === page.offset
    );
    if (existingIndex >= 0) {
      session.pages[existingIndex] = page;
    } else {
      session.pages.push(page);
      session.pages.sort((a, b) => a.offset - b.offset);
    }
  }

  private trackOrderIds(
    session: OrderHistorySession,
    orders: OrderSummary[]
  ): void {
    orders.forEach((order) => {
      session.orderIds.add(order.id);
    });
  }

  private extractControlArgs(args: Record<string, any>): ControlArgs {
    const control: ControlArgs = {};
    if (typeof args.sessionId === 'string') {
      control.sessionId = args.sessionId;
    }
    if (typeof args.limit === 'number' && args.limit > 0) {
      control.limit = args.limit;
    }
    if (typeof args.offset === 'number' && args.offset >= 0) {
      control.offset = args.offset;
    }
    if (typeof args.page === 'number' && args.page >= 1) {
      control.page = args.page;
    }
    if (typeof args.action === 'string') {
      control.action = args.action.toLowerCase();
    }
    if (args.includeHistory === true) {
      control.includeHistory = true;
    }
    if (args.reset === true) {
      control.reset = true;
    }
    if (args.refinements && typeof args.refinements === 'object') {
      control.refinements = args.refinements;
    }
    return control;
  }

  private extractFilters(args: Record<string, any>): Record<string, any> {
    const filters: Record<string, any> = {};
    Object.entries(args).forEach(([key, value]) => {
      if (CONTROL_KEYS.has(key)) {
        return;
      }
      if (value === undefined || value === null || value === '') {
        return;
      }
      filters[key] = value;
    });
    return filters;
  }

  private mergeFilters(
    base: Record<string, any>,
    updates: Record<string, any>
  ): Record<string, any> {
    const merged = { ...base };
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        delete merged[key];
        return;
      }
      merged[key] = value;
    });
    return merged;
  }

  private normalizeFilters(filters: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      if (Array.isArray(value)) {
        const normalizedArray = value.filter(
          (entry) => entry !== undefined && entry !== null && entry !== ''
        );
        if (normalizedArray.length > 0) {
          normalized[key] = normalizedArray;
        }
        return;
      }
      if (typeof value === 'object') {
        normalized[key] = this.normalizeFilters(value as Record<string, any>);
        return;
      }
      normalized[key] = value;
    });
    return normalized;
  }

  private resolveLimit(
    requestedLimit: number | undefined,
    previousLimit: number
  ): number {
    if (requestedLimit && requestedLimit > 0) {
      return requestedLimit;
    }
    return previousLimit || DEFAULT_LIMIT;
  }

  private resolveOffset(
    control: ControlArgs,
    session: OrderHistorySession,
    limit: number,
    isReset: boolean
  ): number {
    if (isReset) {
      return control.offset ?? this.pageToOffset(control.page, limit) ?? 0;
    }

    if (typeof control.offset === 'number') {
      return control.offset;
    }
    if (typeof control.page === 'number') {
      const computed = this.pageToOffset(control.page, limit);
      if (computed !== undefined) {
        return computed;
      }
    }

    switch (control.action) {
      case 'previous':
        return Math.max(session.lastOffset - session.lastLimit, 0);
      case 'current':
        return session.lastOffset;
      case 'first':
        return 0;
      default:
        return session.lastOffset + session.lastLimit;
    }
  }

  private pageToOffset(page: number | undefined, limit: number): number | undefined {
    if (!page || page < 1) {
      return undefined;
    }
    return (page - 1) * limit;
  }

  private calculatePageIndex(offset: number, limit: number): number {
    if (!limit) {
      return 1;
    }
    return Math.floor(offset / limit) + 1;
  }

  private describeFilters(filters: Record<string, any>): string {
    const parts: string[] = [];
    if (filters.status) {
      parts.push(`Status: ${filters.status}`);
    }
    if (filters.startDate || filters.endDate) {
      parts.push(
        `Date range ${filters.startDate ?? 'open'} – ${filters.endDate ?? 'open'}`
      );
    }
    if (filters.satellite) {
      parts.push(`Satellite: ${filters.satellite}`);
    }
    const additionalKeys = Object.keys(filters).filter(
      (key) => !['status', 'startDate', 'endDate', 'satellite'].includes(key)
    );
    if (additionalKeys.length > 0) {
      parts.push(`Additional filters: ${additionalKeys.join(', ')}`);
    }
    if (parts.length === 0) {
      return 'Initial order query';
    }
    return parts.join('; ');
  }

  private buildSummary(page: OrderSessionPage, uniqueCount: number): string {
    const base = `Showing ${page.count} order(s) on page ${page.index}`;
    if (uniqueCount > 0) {
      return `${base}; ${uniqueCount} unique order(s) captured in session.`;
    }
    return base;
  }
}

export const orderHistoryService = new OrderHistoryService();



