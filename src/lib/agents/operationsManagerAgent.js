/**
 * Operations Manager Agent
 *
 * Performs business-level analysis by consuming outputs from the
 * Live Operations Analyst. Makes severity classifications and
 * generates action plans requiring human approval.
 *
 * Responsibilities:
 *   - Classify inventory severity (HIGH / MEDIUM / LOW)
 *   - Generate action plans for HIGH severity items
 *   - Compute revenue and operational performance metrics
 *   - Review and enrich analyst predictions with business context
 *
 * Severity thresholds (deterministic, not AI-generated):
 *   HIGH:   < 2 hours remaining
 *   MEDIUM: 2–6 hours remaining
 *   LOW:    > 6 hours remaining
 */

import {
  AgentType,
  Severity,
  Decision,
  validateOpsManagerOutput,
} from './agentEventSchemas';

// ─── Severity Classification ────────────────────────────────────────────────

/**
 * Deterministic severity classification based on estimated hours remaining.
 *
 * @param {number} hoursRemaining
 * @returns {'HIGH' | 'MEDIUM' | 'LOW'}
 */
export function classifySeverity(hoursRemaining) {
  if (typeof hoursRemaining !== 'number' || !Number.isFinite(hoursRemaining)) {
    return Severity.LOW;
  }

  if (hoursRemaining < 2) return Severity.HIGH;
  if (hoursRemaining <= 6) return Severity.MEDIUM;
  return Severity.LOW;
}

// ─── Action Plan Generation ─────────────────────────────────────────────────

/**
 * Generate a specific action plan string based on the item context.
 *
 * @param {string} itemName
 * @param {number} currentStock
 * @param {number} hoursRemaining
 * @returns {string}
 */
function generateActionPlanText(itemName, currentStock, hoursRemaining) {
  if (currentStock <= 0) {
    return `Restock ${itemName} immediately — currently out of stock`;
  }
  if (hoursRemaining < 1) {
    return `Emergency restock ${itemName} — less than 1 hour of stock remaining`;
  }
  return `Increase ${itemName} inventory — projected depletion within ${Math.round(hoursRemaining)} hours`;
}

/**
 * Generate an issue description string.
 *
 * @param {string} itemName
 * @param {number} currentStock
 * @param {number} hoursRemaining
 * @returns {string}
 */
function generateIssueText(itemName, currentStock, hoursRemaining) {
  if (currentStock <= 0) {
    return `${itemName} Inventory Depleted`;
  }
  if (hoursRemaining < 1) {
    return `${itemName} Critical Stock — Under 1 Hour`;
  }
  if (hoursRemaining < 2) {
    return `${itemName} Low Stock — Under 2 Hours`;
  }
  if (hoursRemaining <= 6) {
    return `${itemName} Stock Watch — ${Math.round(hoursRemaining)} Hours Remaining`;
  }
  return `${itemName} Stock Normal`;
}

// ─── Revenue & Performance Metrics ──────────────────────────────────────────

/**
 * Compute revenue analysis from analytics data.
 *
 * @param {object} analyticsData - { summary, daily, todayAnalytics, ... }
 * @returns {object}
 */
export function computeRevenueMetrics(analyticsData) {
  const summary = analyticsData?.summary || {};
  const todayAnalytics = analyticsData?.todayAnalytics || {};
  const daily = analyticsData?.daily || {};

  const todayRevenue = Number(todayAnalytics.revenue || 0);
  const todayOrders = Number(todayAnalytics.orders || 0);
  const totalRevenue = Number(summary.totalRevenue || 0);
  const totalOrders = Number(summary.totalOrders || 0);

  // Average daily revenue from historical data
  const dailyEntries = Object.values(daily);
  const avgDailyRevenue = dailyEntries.length > 0
    ? dailyEntries.reduce((sum, d) => sum + Number(d.revenue || 0), 0) / dailyEntries.length
    : 0;

  // Projected daily revenue based on today's current pace
  const now = new Date();
  const hoursElapsedToday = Math.max(1, now.getHours() - 7 + (now.getMinutes() / 60));
  const remainingHours = Math.max(0, 15 - hoursElapsedToday); // Assume ops from 7am to 10pm
  const currentPacePerHour = todayRevenue / hoursElapsedToday;
  const projectedDaily = todayRevenue + (currentPacePerHour * remainingHours);

  return {
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    todayOrders,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageOrderValue: todayOrders > 0
      ? Math.round((todayRevenue / todayOrders) * 100) / 100
      : 0,
    avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
    projectedDailyRevenue: Math.round(projectedDaily * 100) / 100,
    paceVsAverage: avgDailyRevenue > 0
      ? Math.round(((todayRevenue / avgDailyRevenue) * 100) * 10) / 10
      : 0,
  };
}

/**
 * Compute operational performance metrics.
 *
 * @param {object} analyticsData
 * @param {Array} assessments
 * @returns {object}
 */
export function computeOperationalPerformance(analyticsData, assessments) {
  const highCount = assessments.filter((a) => a.severity === Severity.HIGH).length;
  const mediumCount = assessments.filter((a) => a.severity === Severity.MEDIUM).length;
  const lowCount = assessments.filter((a) => a.severity === Severity.LOW).length;
  const totalItems = assessments.length;

  return {
    totalInventoryItems: totalItems,
    highSeverityCount: highCount,
    mediumSeverityCount: mediumCount,
    lowSeverityCount: lowCount,
    inventoryHealthScore: totalItems > 0
      ? Math.round(((lowCount / totalItems) * 100) * 10) / 10
      : 100,
    actionPlansGenerated: highCount,
  };
}

// ─── Main Processing Pipeline ───────────────────────────────────────────────

/**
 * Process Live Operations Analyst output into Operations Manager output.
 *
 * This is the main entry point for the Operations Manager agent.
 *
 * @param {object} analystOutput  - Output from computeDepletionPredictions()
 * @param {object} analyticsData  - Full analytics data (summary, daily, etc.)
 * @returns {object} Validated Operations Manager output
 */
export function processAnalystOutput(analystOutput, analyticsData) {
  const predictions = analystOutput?.predictions || [];
  const branchId = analystOutput?.branchId || analyticsData?.branchId || '';

  const assessments = predictions.map((pred) => {
    const severity = classifySeverity(pred.estimatedHoursRemaining);
    const isHigh = severity === Severity.HIGH;

    return {
      itemKey: pred.itemKey,
      itemName: pred.itemName,
      issue: generateIssueText(pred.itemName, pred.currentStock, pred.estimatedHoursRemaining),
      severity,
      hoursRemaining: pred.estimatedHoursRemaining,
      currentStock: pred.currentStock,
      salesVelocityPerHour: pred.salesVelocityPerHour,
      actionPlan: isHigh
        ? generateActionPlanText(pred.itemName, pred.currentStock, pred.estimatedHoursRemaining)
        : null,
      approvalRequired: isHigh,
      decision: isHigh ? Decision.PENDING : null,
    };
  });

  // Sort: HIGH first, then MEDIUM, then LOW
  const severityOrder = { [Severity.HIGH]: 0, [Severity.MEDIUM]: 1, [Severity.LOW]: 2 };
  assessments.sort((a, b) =>
    (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3) ||
    a.hoursRemaining - b.hoursRemaining
  );

  const revenueAnalysis = computeRevenueMetrics(analyticsData);
  const operationalPerformance = computeOperationalPerformance(analyticsData, assessments);

  const output = {
    agentType: AgentType.OPERATIONS_MANAGER,
    timestamp: new Date().toISOString(),
    branchId,
    assessments,
    revenueAnalysis,
    operationalPerformance,
  };

  // Validate before returning
  const validation = validateOpsManagerOutput(output);
  if (!validation.valid) {
    console.error('[Operations Manager] Output validation failed:', validation.errors);
  }

  return output;
}

/**
 * Get only the HIGH severity assessments that require action plans.
 *
 * @param {object} managerOutput - Output from processAnalystOutput()
 * @returns {Array}
 */
export function getActionableAssessments(managerOutput) {
  return (managerOutput?.assessments || []).filter(
    (a) => a.severity === Severity.HIGH && a.approvalRequired
  );
}

/**
 * Get notification-only assessments (MEDIUM and LOW severity).
 *
 * @param {object} managerOutput
 * @returns {Array}
 */
export function getNotificationAssessments(managerOutput) {
  return (managerOutput?.assessments || []).filter(
    (a) => a.severity !== Severity.HIGH
  );
}

/**
 * Apply a human decision to an assessment.
 *
 * @param {object} assessment
 * @param {'APPROVED' | 'REJECTED'} decision
 * @param {string} decidedBy
 * @returns {object} Updated assessment
 */
export function applyDecision(assessment, decision, decidedBy) {
  return {
    ...assessment,
    decision,
    decidedBy,
    decidedAt: new Date().toISOString(),
  };
}
