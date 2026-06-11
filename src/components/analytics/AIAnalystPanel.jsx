/**
 * AI Analyst Panel Component
 * 
 * Displays AI-generated business insights from pre-calculated analytics data.
 * Renders all 11 analysis sections with color-coded styling.
 * Uses custom SVG icons instead of emojis.
 */

import { useState, useCallback } from 'react';
import { generateAIAnalysis, clearAnalysisCache } from '../../lib/aiAnalystService';
import {
  BrainIcon,
  SummaryIcon,
  StrengthIcon,
  OpportunityIcon,
  AlertIcon,
  ChartIcon,
  RevenueIcon,
  CustomersIcon,
  InventoryIcon,
  StaffIcon,
  PriorityIcon,
  ConclusionIcon,
  RefreshIcon,
  EmptyChartIcon,
} from './AnalyticsIcons';
import styles from './AIAnalystPanel.module.css';

/**
 * Skeleton loading component
 */
function LoadingSkeleton() {
  const cards = Array.from({ length: 4 });
  return (
    <div className={styles.skeletonContainer}>
      {cards.map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonHeader}>
            <div className={styles.skeletonCircle} />
            <div className={styles.skeletonTitle} />
          </div>
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      ))}
    </div>
  );
}

/**
 * Section card wrapper
 */
function SectionCard({ type, icon, title, children }) {
  const sectionClass = styles[`section${type.charAt(0).toUpperCase() + type.slice(1)}`] || '';
  const iconClass = styles[`sectionIcon${type.charAt(0).toUpperCase() + type.slice(1)}`] || '';

  return (
    <div className={`${styles.sectionCard} ${sectionClass}`}>
      <div className={styles.sectionHeader}>
        <div className={`${styles.sectionIconWrap} ${iconClass}`}>
          {icon}
        </div>
        <h3 className={styles.sectionTitle}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

/**
 * Bullet list for array-based sections
 */
function BulletList({ items, bulletType }) {
  if (!items || items.length === 0) {
    return <p className={styles.sectionText}>No data available for this section.</p>;
  }
  const bulletClass = styles[`bullet${bulletType.charAt(0).toUpperCase() + bulletType.slice(1)}`] || '';
  return (
    <ul className={styles.sectionList}>
      {items.map((item, i) => (
        <li key={i} className={styles.sectionListItem}>
          <span className={`${styles.listBullet} ${bulletClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Priority actions section with HIGH / MEDIUM / LOW grouping
 */
function PriorityActions({ actions }) {
  if (!actions) return null;
  const { high = [], medium = [], low = [] } = actions;

  if (high.length === 0 && medium.length === 0 && low.length === 0) {
    return <p className={styles.sectionText}>No priority actions generated.</p>;
  }

  return (
    <div className={styles.prioritySection}>
      {high.length > 0 && (
        <div className={styles.priorityGroup}>
          <span className={`${styles.priorityLabel} ${styles.priorityHigh}`}>
            High Priority
          </span>
          {high.map((item, i) => (
            <div key={i} className={`${styles.priorityItem} ${styles.priorityItemHigh}`}>
              <span className={`${styles.priorityDot} ${styles.dotHigh}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {medium.length > 0 && (
        <div className={styles.priorityGroup}>
          <span className={`${styles.priorityLabel} ${styles.priorityMedium}`}>
            Medium Priority
          </span>
          {medium.map((item, i) => (
            <div key={i} className={`${styles.priorityItem} ${styles.priorityItemMedium}`}>
              <span className={`${styles.priorityDot} ${styles.dotMedium}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {low.length > 0 && (
        <div className={styles.priorityGroup}>
          <span className={`${styles.priorityLabel} ${styles.priorityLow}`}>
            Low Priority
          </span>
          {low.map((item, i) => (
            <div key={i} className={`${styles.priorityItem} ${styles.priorityItemLow}`}>
              <span className={`${styles.priorityDot} ${styles.dotLow}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Main AI Analyst Panel
 */
export default function AIAnalystPanel({ analyticsData, branchId }) {
  const [analysis, setAnalysis] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = useCallback(async (forceRefresh = false) => {
    if (generating) return;
    setGenerating(true);
    setError(null);

    try {
      if (forceRefresh) {
        clearAnalysisCache(branchId);
      }
      const result = await generateAIAnalysis(analyticsData, branchId, forceRefresh);
      setAnalysis(result);
    } catch (err) {
      console.error('[AI Analyst] Generation failed:', err);
      setError(err.message || 'Failed to generate analysis');
    } finally {
      setGenerating(false);
    }
  }, [analyticsData, branchId, generating]);

  return (
    <div className={styles.aiPanel}>
      {/* Header */}
      <div className={styles.aiPanelHeader}>
        <div className={styles.aiPanelTitleGroup}>
          <div className={styles.aiPanelIcon}>
            <BrainIcon size={22} />
          </div>
          <div>
            <h2 className={styles.aiPanelTitle}>AI Operations Analyst</h2>
            <p className={styles.aiPanelSubtitle}>AI-powered business insights and recommendations</p>
          </div>
          {analysis?.fromCache && (
            <span className={styles.cacheBadge}>Cached</span>
          )}
        </div>

        <button
          className={`${styles.generateBtn} ${generating ? styles.generating : ''}`}
          onClick={() => handleGenerate(analysis !== null)}
          disabled={generating}
        >
          <span className={styles.btnIcon}>
            <RefreshIcon size={16} />
          </span>
          {generating ? 'Analyzing...' : analysis ? 'Regenerate Analysis' : 'Generate Analysis'}
        </button>
      </div>

      {/* Generating state */}
      {generating && <LoadingSkeleton />}

      {/* Error state */}
      {error && !generating && (
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>
            <AlertIcon size={20} color="#e74c3c" />
          </div>
          <div className={styles.errorContent}>
            <p className={styles.errorTitle}>Analysis generation failed</p>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryBtn} onClick={() => handleGenerate(true)}>
              <RefreshIcon size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analysis && !generating && !error && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <EmptyChartIcon size={56} color="rgba(255,255,255,0.15)" />
          </div>
          <h3 className={styles.emptyTitle}>No Analysis Generated Yet</h3>
          <p className={styles.emptyText}>
            Click "Generate Analysis" to let the AI analyze your restaurant's
            analytics data and provide actionable business insights.
          </p>
          <button
            className={styles.generateBtn}
            onClick={() => handleGenerate(false)}
            disabled={generating}
          >
            <span className={styles.btnIcon}>
              <BrainIcon size={16} />
            </span>
            Generate Analysis
          </button>
        </div>
      )}

      {/* Analysis results */}
      {analysis && !generating && (
        <div className={styles.analysisGrid}>
          {/* Executive Summary */}
          <SectionCard type="summary" icon={<SummaryIcon size={18} />} title="Executive Summary">
            <p className={styles.sectionText}>{analysis.executiveSummary}</p>
          </SectionCard>

          {/* Two-column: Strengths + Opportunities */}
          <div className={styles.twoColGrid}>
            <SectionCard type="strength" icon={<StrengthIcon size={18} />} title="Key Strengths">
              <BulletList items={analysis.keyStrengths} bulletType="strength" />
            </SectionCard>

            <SectionCard type="opportunity" icon={<OpportunityIcon size={18} />} title="Opportunities">
              <BulletList items={analysis.opportunities} bulletType="opportunity" />
            </SectionCard>
          </div>

          {/* Risks & Concerns */}
          <SectionCard type="risk" icon={<AlertIcon size={18} />} title="Risks and Concerns">
            <BulletList items={analysis.risksAndConcerns} bulletType="risk" />
          </SectionCard>

          {/* Product Analysis */}
          <SectionCard type="product" icon={<ChartIcon size={18} />} title="Product Analysis">
            <p className={styles.sectionText}>{analysis.productAnalysis}</p>
          </SectionCard>

          {/* Two-column: Revenue + Customer Behavior */}
          <div className={styles.twoColGrid}>
            <SectionCard type="revenue" icon={<RevenueIcon size={18} />} title="Revenue Analysis">
              <p className={styles.sectionText}>{analysis.revenueAnalysis}</p>
            </SectionCard>

            <SectionCard type="customer" icon={<CustomersIcon size={18} />} title="Customer Behavior Analysis">
              <p className={styles.sectionText}>{analysis.customerBehaviorAnalysis}</p>
            </SectionCard>
          </div>

          {/* Two-column: Inventory + Staffing */}
          <div className={styles.twoColGrid}>
            <SectionCard type="inventory" icon={<InventoryIcon size={18} />} title="Inventory Recommendations">
              <BulletList items={analysis.inventoryRecommendations} bulletType="inventory" />
            </SectionCard>

            <SectionCard type="staffing" icon={<StaffIcon size={18} />} title="Staffing Recommendations">
              <BulletList items={analysis.staffingRecommendations} bulletType="staffing" />
            </SectionCard>
          </div>

          {/* Priority Actions */}
          <SectionCard type="priority" icon={<PriorityIcon size={18} />} title="Priority Actions">
            <PriorityActions actions={analysis.priorityActions} />
          </SectionCard>

          {/* Final Conclusion */}
          <SectionCard type="conclusion" icon={<ConclusionIcon size={18} />} title="Final Business Conclusion">
            <p className={styles.sectionText}>{analysis.finalConclusion}</p>
          </SectionCard>

          {/* Timestamp */}
          {analysis.generatedAt && (
            <div className={styles.timestamp}>
              Analysis generated: {new Date(analysis.generatedAt).toLocaleString()}
              {analysis.fromCache ? ' (from cache)' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
