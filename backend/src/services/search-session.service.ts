import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { skyfiClient } from '../integrations/skyfi/client';
import { toGeoJsonPolygon } from '../utils/geojson';
import { sessionHistoryManager } from './session-history-manager.service';

export interface SearchCriteria {
  location?: Record<string, any>;
  aoi?: Record<string, any>;
  startDate?: string;
  endDate?: string;
  maxCloudCoverage?: number;
  minResolution?: number;
  satellites?: string[];
  [key: string]: any;
}

export interface SearchSessionResponse {
  success: boolean;
  sessionId: string;
  message: string;
  summary: string;
  criteria: SearchCriteria;
  page: {
    index: number;
    offset: number;
    limit: number;
    count: number;
    total?: number;
    hasMore: boolean;
    nextOffset?: number;
    previousOffset?: number;
  };
  results: any[];
  history?: SearchHistoryEntry[];
  context: {
    createdAt: string;
    updatedAt: string;
    storedPages: number;
    storedResults: number;
  };
  recommendations?: Array<{
    type: string;
    title: string;
    description: string;
    action: any;
    confidence: number;
  }>;
  analytics?: {
    totalSearches: number;
    searchSuccessRate: number;
  };
}

export interface SearchHistoryEntry {
  id: string;
  timestamp: number;
  criteria: SearchCriteria;
  summary: string;
}

interface SearchSessionPage {
  index: number;
  offset: number;
  limit: number;
  count: number;
  total?: number;
  results: any[];
  fetchedAt: number;
}

interface SearchSession {
  sessionId: string;
  conversationId: string;
  criteria: SearchCriteria;
  createdAt: number;
  updatedAt: number;
  pages: SearchSessionPage[];
  history: SearchHistoryEntry[];
  lastOffset: number;
  lastLimit: number;
  total?: number;
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
  'useLastCriteria',
]);

const DEFAULT_LIMIT = 20;

function stableStringify(obj: Record<string, any>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export class SearchSessionService {
  private sessions = new Map<string, SearchSession>();
  private conversationSessions = new Map<string, Set<string>>();

  /**
   * Get session summary for a conversation (useful for showing search history)
   */
  getConversationSessions(conversationId: string): Array<{
    sessionId: string;
    createdAt: string;
    updatedAt: string;
    summary: string;
    resultCount: number;
    criteria: SearchCriteria;
  }> {
    const sessionIds = this.conversationSessions.get(conversationId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is SearchSession => s !== undefined)
      .map((session) => ({
        sessionId: session.sessionId,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        summary: this.describeCriteria(session.criteria),
        resultCount: session.pages.reduce((sum, page) => sum + page.count, 0),
        criteria: session.criteria,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get detailed session information
   */
  getSession(sessionId: string): SearchSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all results from a session (across all pages)
   */
  getAllSessionResults(sessionId: string): any[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.pages
      .sort((a, b) => a.offset - b.offset)
      .flatMap((page) => page.results);
  }

  async runArchiveSearch(
    conversationId: string,
    args: Record<string, any>
  ): Promise<SearchSessionResponse> {
    const control = this.extractControlArgs(args);
    const baseSession = control.sessionId
      ? this.sessions.get(control.sessionId)
      : undefined;
    const isReset = Boolean(control.reset || !baseSession);

    const directCriteria = this.extractCriteria(args);
    const refinementCriteria = this.extractCriteria(
      control.refinements || args.refine || {}
    );

    if (!baseSession && Object.keys(directCriteria).length === 0) {
      throw new Error(
        'Archive search requires at least one search parameter (e.g., location, AOI, or filters).'
      );
    }

    const session = isReset
      ? this.createSession(conversationId, directCriteria)
      : this.cloneSession(baseSession!);

    let mergedCriteria = session.criteria;
    if (isReset) {
      mergedCriteria = this.mergeCriteria({}, directCriteria);
    } else {
      const hasDirectCriteria = Object.keys(directCriteria).length > 0;
      if (hasDirectCriteria) {
        mergedCriteria = this.mergeCriteria(mergedCriteria, directCriteria);
      }
    }

    if (Object.keys(refinementCriteria).length > 0) {
      mergedCriteria = this.mergeCriteria(mergedCriteria, refinementCriteria);
    }

    if (Object.keys(mergedCriteria).length === 0) {
      throw new Error(
        'Unable to determine archive search criteria. Provide search filters or reset the session.'
      );
    }

    const sanitizedCriteria = this.sanitizeCriteria(mergedCriteria);

    const limit = this.resolveLimit(control.limit, session.lastLimit);
    const offset = this.resolveOffset(control, session, limit, isReset);

    const params: Record<string, any> = {
      ...sanitizedCriteria,
      limit,
      offset,
    };

    logger.info('Running archive search via session manager', {
      conversationId,
      sessionId: session.sessionId,
      limit,
      offset,
      criteriaKeys: Object.keys(sanitizedCriteria),
    });

    const response = await skyfiClient.archiveSearch(params as any);

    const pageIndex = this.calculatePageIndex(response.offset ?? 0, response.limit ?? 10);
    const archiveResults = response.archives || response.results || [];
    const hasMore =
      typeof response.total === 'number'
        ? (response.offset ?? 0) + archiveResults.length < response.total
        : archiveResults.length === (response.limit ?? 10);

    const results = archiveResults?.map((result) => ({
      id: result.archiveId,
      satellite: result.provider || result.constellation,
      captureDate: result.captureTimestamp,
      resolution: result.resolution || result.gsd,
      cloudCover: result.cloudCoveragePercent,
      price: result.priceForOneSquareKm,
      bbox: result.footprint, // WKT polygon
      thumbnail: result.thumbnailUrls ? Object.values(result.thumbnailUrls)[0] : undefined,
    })) ?? [];

    const page: SearchSessionPage = {
      index: pageIndex,
      offset: response.offset ?? 0,
      limit: response.limit ?? 10,
      count: results.length,
      total: response.total ?? archiveResults.length,
      results,
      fetchedAt: Date.now(),
    };

    const criteriaChanged =
      stableStringify(this.normalizeCriteria(session.criteria)) !==
      stableStringify(this.normalizeCriteria(sanitizedCriteria));

    session.criteria = sanitizedCriteria;
    session.lastLimit = response.limit ?? 10;
    session.lastOffset = response.offset ?? 0;
    session.updatedAt = Date.now();
    session.total = response.total ?? archiveResults.length;

    this.storePage(session, page);

    if (criteriaChanged || session.history.length === 0 || isReset) {
      session.history.push({
        id: randomUUID(),
        timestamp: session.updatedAt,
        criteria: sanitizedCriteria,
        summary: this.describeCriteria(sanitizedCriteria),
      });
    }

    this.persistSession(session);

    // Track search for pattern analysis
    sessionHistoryManager.trackSearch(
      conversationId,
      sanitizedCriteria,
      results.length
    );

    const history = control.includeHistory
      ? [...session.history]
      : undefined;

    const summary = this.buildSummary(page, session.total);

    // Get recommendations if no/low results
    let recommendations;
    if (results.length === 0 || (results.length < 5 && !hasMore)) {
      recommendations = sessionHistoryManager.getRecommendations(
        conversationId,
        sanitizedCriteria
      );
    }

    // Get analytics summary
    const analytics = sessionHistoryManager.getAnalytics(conversationId);

    return {
      success: true,
      sessionId: session.sessionId,
      message: `Page ${page.index} with ${page.count} result(s).`,
      summary,
      criteria: session.criteria,
      page: {
        index: page.index,
        offset: page.offset,
        limit: page.limit,
        count: page.count,
        total: page.total,
        hasMore,
        nextOffset: hasMore ? page.offset + page.limit : undefined,
        previousOffset:
          page.offset > 0 ? Math.max(page.offset - page.limit, 0) : undefined,
      },
      results,
      history,
      context: {
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        storedPages: session.pages.length,
        storedResults: session.pages.reduce(
          (acc, curr) => acc + curr.results.length,
          0
        ),
      },
      recommendations: recommendations && recommendations.length > 0 ? recommendations : undefined,
      analytics: analytics.totalSearches > 0 ? {
        totalSearches: analytics.totalSearches,
        searchSuccessRate: analytics.searchSuccessRate,
      } : undefined,
    };
  }

  reset(): void {
    this.sessions.clear();
    this.conversationSessions.clear();
  }

  private createSession(
    conversationId: string,
    criteria: SearchCriteria
  ): SearchSession {
    const sessionId = randomUUID();
    const timestamp = Date.now();
    return {
      sessionId,
      conversationId,
      criteria: this.sanitizeCriteria(criteria),
      createdAt: timestamp,
      updatedAt: timestamp,
      pages: [],
      history: [],
      lastOffset: 0,
      lastLimit: DEFAULT_LIMIT,
    };
  }

  private cloneSession(session: SearchSession): SearchSession {
    return {
      ...session,
      criteria: { ...session.criteria },
      pages: [...session.pages],
      history: [...session.history],
    };
  }

  private persistSession(session: SearchSession): void {
    this.sessions.set(session.sessionId, session);
    if (!this.conversationSessions.has(session.conversationId)) {
      this.conversationSessions.set(session.conversationId, new Set());
    }
    this.conversationSessions.get(session.conversationId)!.add(session.sessionId);
  }

  private storePage(session: SearchSession, page: SearchSessionPage): void {
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

  private extractCriteria(args: Record<string, any>): SearchCriteria {
    const criteria: SearchCriteria = {};
    Object.entries(args).forEach(([key, value]) => {
      if (CONTROL_KEYS.has(key)) {
        return;
      }
      if (value === undefined || value === null) {
        return;
      }
      criteria[key] = value;
    });
    return criteria;
  }

  private mergeCriteria(
    base: SearchCriteria,
    updates: SearchCriteria
  ): SearchCriteria {
    const merged = { ...base };
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        delete merged[key];
        return;
      }
      merged[key] = value;
    });
    return merged;
  }

  private sanitizeCriteria(criteria: SearchCriteria): SearchCriteria {
    const sanitized: SearchCriteria = this.normalizeCriteria(criteria);

    if (sanitized.aoi) {
      const polygon = toGeoJsonPolygon(sanitized.aoi);
      if (polygon) {
        sanitized.aoi = polygon;
      } else {
        logger.warn('Invalid AOI provided for archive search; omitting AOI');
        delete sanitized.aoi;
      }
    }

    return sanitized;
  }

  private normalizeCriteria(criteria: SearchCriteria): SearchCriteria {
    const normalized: SearchCriteria = {};
    Object.entries(criteria).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        const normalizedArray = value
          .map((entry) =>
            typeof entry === 'object' && entry !== null
              ? this.normalizeCriteria(entry as SearchCriteria)
              : entry
          )
          .filter((entry) => entry !== undefined && entry !== null);
        if (normalizedArray.length > 0) {
          normalized[key] = normalizedArray;
        }
        return;
      }
      if (typeof value === 'object') {
        const nested = this.normalizeCriteria(value as SearchCriteria);
        if (Object.keys(nested).length > 0) {
          normalized[key] = nested;
        }
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
    session: SearchSession,
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

  private buildSummary(page: SearchSessionPage, total?: number): string {
    const parts = [`Showing ${page.count} result(s)`];
    if (typeof total === 'number') {
      parts.push(`out of ${total}`);
    }
    parts.push(`(page ${page.index})`);
    return parts.join(' ');
  }

  private describeCriteria(criteria: SearchCriteria): string {
    const parts: string[] = [];
    if (criteria.location) {
      parts.push('Location specified');
    }
    if (criteria.aoi) {
      parts.push('AOI polygon applied');
    }
    if (criteria.startDate || criteria.endDate) {
      parts.push(
        `Date range ${criteria.startDate ?? 'open'} – ${criteria.endDate ?? 'open'}`
      );
    }
    if (typeof criteria.maxCloudCoverage === 'number') {
      parts.push(`Cloud cover ≤ ${criteria.maxCloudCoverage}%`);
    }
    if (typeof criteria.minResolution === 'number') {
      parts.push(`Resolution ≥ ${criteria.minResolution}m`);
    }
    if (Array.isArray(criteria.satellites) && criteria.satellites.length > 0) {
      parts.push(`Satellites: ${criteria.satellites.join(', ')}`);
    }
    const additionalKeys = Object.keys(criteria).filter(
      (key) =>
        ![
          'location',
          'aoi',
          'startDate',
          'endDate',
          'maxCloudCoverage',
          'minResolution',
          'satellites',
        ].includes(key)
    );
    if (additionalKeys.length > 0) {
      parts.push(`Additional filters: ${additionalKeys.join(', ')}`);
    }
    if (parts.length === 0) {
      return 'Initial search';
    }
    return parts.join('; ');
  }
}

export const searchSessionService = new SearchSessionService();

