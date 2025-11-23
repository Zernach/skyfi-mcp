import { randomUUID } from 'crypto';

/**
 * Session History Manager
 * Provides cross-session analytics, recommendations, and search patterns
 */

export interface SessionPattern {
  id: string;
  type: 'location' | 'date_range' | 'satellite' | 'cloud_coverage' | 'resolution';
  value: any;
  frequency: number;
  lastUsed: number;
  successRate: number; // 0-1 based on results found
}

export interface SessionAnalytics {
  totalSearches: number;
  totalOrders: number;
  mostSearchedLocations: Array<{ location: string; count: number }>;
  preferredSatellites: Array<{ satellite: string; count: number }>;
  averageCloudCoverage: number;
  averageResolution: number;
  mostActiveTimeRanges: Array<{ range: string; count: number }>;
  searchSuccessRate: number;
}

export interface SessionRecommendation {
  id: string;
  type: 'similar_search' | 'refine_filter' | 'explore_archive' | 'alternative_satellite';
  title: string;
  description: string;
  action: {
    tool: string;
    params: Record<string, any>;
  };
  confidence: number;
  reason: string;
}

interface UserSessionHistory {
  conversationId: string;
  patterns: SessionPattern[];
  analytics: SessionAnalytics;
  lastUpdated: number;
}

export class SessionHistoryManager {
  private userHistories = new Map<string, UserSessionHistory>();
  private readonly MAX_PATTERNS = 50;
  private readonly PATTERN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Track a search session for pattern analysis
   */
  trackSearch(conversationId: string, criteria: Record<string, any>, resultCount: number): void {
    const history = this.getOrCreateHistory(conversationId);
    const success = resultCount > 0;

    // Extract and update patterns
    this.updatePattern(history, 'location', criteria.location, success);
    this.updatePattern(history, 'date_range', { 
      startDate: criteria.startDate, 
      endDate: criteria.endDate 
    }, success);
    this.updatePattern(history, 'cloud_coverage', criteria.maxCloudCoverage, success);
    this.updatePattern(history, 'resolution', criteria.minResolution, success);
    
    if (Array.isArray(criteria.satellites)) {
      criteria.satellites.forEach((sat: string) => {
        this.updatePattern(history, 'satellite', sat, success);
      });
    }

    // Update analytics
    history.analytics.totalSearches++;
    if (success) {
      const currentSuccessCount = Math.floor(
        history.analytics.searchSuccessRate * (history.analytics.totalSearches - 1)
      );
      history.analytics.searchSuccessRate = 
        (currentSuccessCount + 1) / history.analytics.totalSearches;
    } else {
      history.analytics.searchSuccessRate = 
        (history.analytics.searchSuccessRate * (history.analytics.totalSearches - 1)) / 
        history.analytics.totalSearches;
    }

    history.lastUpdated = Date.now();
    this.persistHistory(conversationId, history);
  }

  /**
   * Track an order for analytics
   */
  trackOrder(conversationId: string, _orderData: Record<string, any>): void {
    const history = this.getOrCreateHistory(conversationId);
    history.analytics.totalOrders++;
    history.lastUpdated = Date.now();
    this.persistHistory(conversationId, history);
  }

  /**
   * Get intelligent recommendations based on session history
   */
  getRecommendations(
    conversationId: string,
    currentCriteria?: Record<string, any>
  ): SessionRecommendation[] {
    const history = this.userHistories.get(conversationId);
    if (!history || history.patterns.length === 0) {
      return this.getDefaultRecommendations();
    }

    const recommendations: SessionRecommendation[] = [];

    // Recommend based on successful patterns
    const successfulPatterns = history.patterns
      .filter(p => p.successRate > 0.6 && p.frequency >= 2)
      .sort((a, b) => b.frequency - a.frequency);

    // Similar search recommendations
    if (successfulPatterns.length > 0 && !currentCriteria) {
      const topPattern = successfulPatterns[0];
      recommendations.push({
        id: randomUUID(),
        type: 'similar_search',
        title: 'Resume Previous Search',
        description: `You previously had success with ${this.describePattern(topPattern)}`,
        action: {
          tool: 'search_satellite_imagery',
          params: this.patternToParams(topPattern),
        },
        confidence: topPattern.successRate,
        reason: `Used ${topPattern.frequency} times with ${Math.round(topPattern.successRate * 100)}% success rate`,
      });
    }

    // Refinement recommendations based on current criteria
    if (currentCriteria) {
      // Suggest cloud coverage refinement
      if (currentCriteria.maxCloudCoverage === undefined || currentCriteria.maxCloudCoverage > 20) {
        const avgCloudCoverage = history.analytics.averageCloudCoverage;
        if (avgCloudCoverage > 0 && avgCloudCoverage < 30) {
          recommendations.push({
            id: randomUUID(),
            type: 'refine_filter',
            title: 'Reduce Cloud Coverage',
            description: `Try limiting cloud coverage to ${Math.round(avgCloudCoverage)}% based on your preferences`,
            action: {
              tool: 'search_satellite_imagery',
              params: {
                ...currentCriteria,
                maxCloudCoverage: Math.round(avgCloudCoverage),
              },
            },
            confidence: 0.75,
            reason: 'Based on your historical search patterns',
          });
        }
      }

      // Suggest preferred satellites
      if (!currentCriteria.satellites && history.analytics.preferredSatellites.length > 0) {
        const topSatellites = history.analytics.preferredSatellites
          .slice(0, 2)
          .map(s => s.satellite);
        recommendations.push({
          id: randomUUID(),
          type: 'alternative_satellite',
          title: 'Try Your Preferred Satellites',
          description: `Search using ${topSatellites.join(' and ')} which you've used frequently`,
          action: {
            tool: 'search_satellite_imagery',
            params: {
              ...currentCriteria,
              satellites: topSatellites,
            },
          },
          confidence: 0.7,
          reason: `Based on ${history.analytics.preferredSatellites[0].count} previous searches`,
        });
      }

      // Suggest archive exploration if low results
      const recentSearches = history.patterns
        .filter(p => Date.now() - p.lastUsed < 7 * 24 * 60 * 60 * 1000)
        .sort((a, b) => b.lastUsed - a.lastUsed);
      
      if (recentSearches.length > 3 && history.analytics.searchSuccessRate < 0.4) {
        recommendations.push({
          id: randomUUID(),
          type: 'explore_archive',
          title: 'Broaden Your Search',
          description: 'Try relaxing some constraints to find more archive imagery',
          action: {
            tool: 'search_satellite_imagery',
            params: {
              location: currentCriteria.location,
              // Remove restrictive filters
              maxCloudCoverage: 50,
              limit: 20,
            },
          },
          confidence: 0.65,
          reason: 'Recent searches have had limited results',
        });
      }
    }

    // Sort by confidence and return top 5
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Get analytics for a conversation
   */
  getAnalytics(conversationId: string): SessionAnalytics {
    const history = this.userHistories.get(conversationId);
    if (!history) {
      return this.getDefaultAnalytics();
    }
    return { ...history.analytics };
  }

  /**
   * Get recent search patterns
   */
  getRecentPatterns(conversationId: string, limit: number = 10): SessionPattern[] {
    const history = this.userHistories.get(conversationId);
    if (!history) {
      return [];
    }

    return history.patterns
      .filter(p => Date.now() - p.lastUsed < this.PATTERN_EXPIRY_MS)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, limit);
  }

  /**
   * Compare two sessions to find differences and opportunities
   */
  compareSearches(
    _conversationId: string,
    _sessionId1: string,
    _sessionId2: string
  ): {
    differences: Array<{ field: string; session1: any; session2: any }>;
    recommendations: SessionRecommendation[];
  } {
    // This would need integration with search-session.service
    // Placeholder for now
    return {
      differences: [],
      recommendations: [],
    };
  }

  /**
   * Export session history for analysis
   */
  exportHistory(conversationId: string): {
    patterns: SessionPattern[];
    analytics: SessionAnalytics;
    exportedAt: string;
  } {
    const history = this.userHistories.get(conversationId);
    if (!history) {
      return {
        patterns: [],
        analytics: this.getDefaultAnalytics(),
        exportedAt: new Date().toISOString(),
      };
    }

    return {
      patterns: history.patterns,
      analytics: history.analytics,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear old patterns and cleanup
   */
  cleanup(): void {
    const now = Date.now();
    for (const [conversationId, history] of this.userHistories.entries()) {
      // Remove expired patterns
      history.patterns = history.patterns.filter(
        p => now - p.lastUsed < this.PATTERN_EXPIRY_MS
      );

      // Remove empty histories
      if (history.patterns.length === 0 && 
          now - history.lastUpdated > this.PATTERN_EXPIRY_MS) {
        this.userHistories.delete(conversationId);
      }
    }
  }

  // Private helper methods

  private getOrCreateHistory(conversationId: string): UserSessionHistory {
    let history = this.userHistories.get(conversationId);
    if (!history) {
      history = {
        conversationId,
        patterns: [],
        analytics: this.getDefaultAnalytics(),
        lastUpdated: Date.now(),
      };
      this.userHistories.set(conversationId, history);
    }
    return history;
  }

  private updatePattern(
    history: UserSessionHistory,
    type: SessionPattern['type'],
    value: any,
    success: boolean
  ): void {
    if (value === undefined || value === null) {
      return;
    }

    const valueKey = JSON.stringify(value);
    const existingPattern = history.patterns.find(
      p => p.type === type && JSON.stringify(p.value) === valueKey
    );

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.lastUsed = Date.now();
      
      // Update success rate (exponential moving average)
      const alpha = 0.3;
      existingPattern.successRate = 
        alpha * (success ? 1 : 0) + (1 - alpha) * existingPattern.successRate;
    } else {
      const newPattern: SessionPattern = {
        id: randomUUID(),
        type,
        value,
        frequency: 1,
        lastUsed: Date.now(),
        successRate: success ? 1 : 0,
      };
      history.patterns.push(newPattern);

      // Trim to max patterns
      if (history.patterns.length > this.MAX_PATTERNS) {
        history.patterns.sort((a, b) => b.frequency - a.frequency);
        history.patterns = history.patterns.slice(0, this.MAX_PATTERNS);
      }
    }

    // Update analytics based on type
    this.updateAnalytics(history, type, value);
  }

  private updateAnalytics(
    history: UserSessionHistory,
    type: SessionPattern['type'],
    value: any
  ): void {
    const analytics = history.analytics;

    switch (type) {
      case 'satellite':
        const satIndex = analytics.preferredSatellites.findIndex(
          s => s.satellite === value
        );
        if (satIndex >= 0) {
          analytics.preferredSatellites[satIndex].count++;
        } else {
          analytics.preferredSatellites.push({ satellite: value, count: 1 });
        }
        analytics.preferredSatellites.sort((a, b) => b.count - a.count);
        analytics.preferredSatellites = analytics.preferredSatellites.slice(0, 10);
        break;

      case 'cloud_coverage':
        if (typeof value === 'number') {
          const totalSearches = analytics.totalSearches || 1;
          analytics.averageCloudCoverage = 
            ((analytics.averageCloudCoverage * (totalSearches - 1)) + value) / totalSearches;
        }
        break;

      case 'resolution':
        if (typeof value === 'number') {
          const totalSearches = analytics.totalSearches || 1;
          analytics.averageResolution = 
            ((analytics.averageResolution * (totalSearches - 1)) + value) / totalSearches;
        }
        break;
    }
  }

  private describePattern(pattern: SessionPattern): string {
    switch (pattern.type) {
      case 'location':
        return 'this location';
      case 'date_range':
        return `dates ${pattern.value.startDate || 'any'} to ${pattern.value.endDate || 'any'}`;
      case 'satellite':
        return `satellite ${pattern.value}`;
      case 'cloud_coverage':
        return `${pattern.value}% max cloud coverage`;
      case 'resolution':
        return `${pattern.value}m resolution`;
      default:
        return 'these filters';
    }
  }

  private patternToParams(pattern: SessionPattern): Record<string, any> {
    const params: Record<string, any> = {};
    
    switch (pattern.type) {
      case 'location':
        params.location = pattern.value;
        break;
      case 'date_range':
        if (pattern.value.startDate) params.startDate = pattern.value.startDate;
        if (pattern.value.endDate) params.endDate = pattern.value.endDate;
        break;
      case 'satellite':
        params.satellites = [pattern.value];
        break;
      case 'cloud_coverage':
        params.maxCloudCoverage = pattern.value;
        break;
      case 'resolution':
        params.minResolution = pattern.value;
        break;
    }

    return params;
  }

  private getDefaultAnalytics(): SessionAnalytics {
    return {
      totalSearches: 0,
      totalOrders: 0,
      mostSearchedLocations: [],
      preferredSatellites: [],
      averageCloudCoverage: 0,
      averageResolution: 0,
      mostActiveTimeRanges: [],
      searchSuccessRate: 0,
    };
  }

  private getDefaultRecommendations(): SessionRecommendation[] {
    return [
      {
        id: randomUUID(),
        type: 'explore_archive',
        title: 'Explore Popular Locations',
        description: 'Start by searching major cities or areas of interest',
        action: {
          tool: 'geocode_location',
          params: { query: 'San Francisco' },
        },
        confidence: 0.5,
        reason: 'First-time user recommendation',
      },
    ];
  }

  private persistHistory(conversationId: string, history: UserSessionHistory): void {
    this.userHistories.set(conversationId, history);
  }
}

// Singleton instance
export const sessionHistoryManager = new SessionHistoryManager();

