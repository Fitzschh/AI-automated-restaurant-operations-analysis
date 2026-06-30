/**
 * Agent Context — Shared State for Agent Coordination
 *
 * React context that coordinates outputs between the Live Operations Analyst
 * and Operations Manager agents. Enforces single-source-of-truth per item
 * by keying all state by itemKey (Map-based, not array-based).
 *
 * State model:
 *   analystPredictions:  Map<itemKey, prediction>     — Latest from Live Analyst
 *   managerAssessments:  Map<itemKey, assessment>     — Latest from Ops Manager
 *   actionPlans:         Map<itemKey, actionPlan>     — Pending HIGH-severity plans
 *   notifications:       Map<itemKey, notification>   — Active notifications (latest only)
 *   lastAnalystOutput:   object | null                — Full latest analyst output
 *   lastManagerOutput:   object | null                — Full latest manager output
 */

import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { Severity, Decision } from '../lib/agents/agentEventSchemas';
import { computeDepletionPredictions } from '../lib/agents/liveOperationsAnalyst';
import { processAnalystOutput, applyDecision } from '../lib/agents/operationsManagerAgent';

// ─── Context ────────────────────────────────────────────────────────────────

const AgentContext = createContext(null);

// ─── Action Types ───────────────────────────────────────────────────────────

const ActionTypes = {
  SET_ANALYST_OUTPUT: 'SET_ANALYST_OUTPUT',
  SET_MANAGER_OUTPUT: 'SET_MANAGER_OUTPUT',
  APPLY_DECISION: 'APPLY_DECISION',
  CLEAR_ALL: 'CLEAR_ALL',
};

// ─── Reducer ────────────────────────────────────────────────────────────────

function buildMapFromPredictions(predictions) {
  const map = new Map();
  (predictions || []).forEach((pred) => {
    if (pred.itemKey) map.set(pred.itemKey, pred);
  });
  return map;
}

function buildMapFromAssessments(assessments) {
  const map = new Map();
  (assessments || []).forEach((asmt) => {
    if (asmt.itemKey) map.set(asmt.itemKey, asmt);
  });
  return map;
}

function buildActionPlans(assessments) {
  const map = new Map();
  (assessments || [])
    .filter((a) => a.severity === Severity.HIGH && a.approvalRequired)
    .forEach((a) => {
      map.set(a.itemKey, a);
    });
  return map;
}

function buildNotifications(assessments, analystPredictions) {
  const map = new Map();

  // Add all assessments as notifications (manager takes priority)
  (assessments || []).forEach((asmt) => {
    map.set(asmt.itemKey, {
      itemKey: asmt.itemKey,
      itemName: asmt.itemName,
      source: 'OPERATIONS_MANAGER',
      severity: asmt.severity,
      message: asmt.issue,
      actionRequired: asmt.approvalRequired,
      timestamp: new Date().toISOString(),
    });
  });

  // For items only in analyst predictions (no manager assessment yet), add analyst notifications
  analystPredictions.forEach((pred, key) => {
    if (!map.has(key)) {
      map.set(key, {
        itemKey: pred.itemKey,
        itemName: pred.itemName,
        source: 'LIVE_OPERATIONS_ANALYST',
        severity: null,
        message: pred.prediction,
        actionRequired: false,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return map;
}

function agentReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_ANALYST_OUTPUT: {
      const output = action.payload;
      const predictions = buildMapFromPredictions(output?.predictions);

      return {
        ...state,
        analystPredictions: predictions,
        lastAnalystOutput: output,
      };
    }

    case ActionTypes.SET_MANAGER_OUTPUT: {
      const output = action.payload;
      const assessments = buildMapFromAssessments(output?.assessments);
      const actionPlans = buildActionPlans(output?.assessments);
      const notifications = buildNotifications(output?.assessments, state.analystPredictions);

      return {
        ...state,
        managerAssessments: assessments,
        actionPlans,
        notifications,
        lastManagerOutput: output,
      };
    }

    case ActionTypes.APPLY_DECISION: {
      const { itemKey, decision, decidedBy } = action.payload;
      const existingPlan = state.actionPlans.get(itemKey);
      if (!existingPlan) return state;

      const updatedPlan = applyDecision(existingPlan, decision, decidedBy);

      const newPlans = new Map(state.actionPlans);
      newPlans.set(itemKey, updatedPlan);

      const newAssessments = new Map(state.managerAssessments);
      if (newAssessments.has(itemKey)) {
        newAssessments.set(itemKey, { ...newAssessments.get(itemKey), decision, decidedBy });
      }

      // Update notification to reflect decision
      const newNotifications = new Map(state.notifications);
      if (newNotifications.has(itemKey)) {
        const existing = newNotifications.get(itemKey);
        newNotifications.set(itemKey, {
          ...existing,
          message: `${existing.message} — ${decision}`,
          actionRequired: false,
        });
      }

      return {
        ...state,
        actionPlans: newPlans,
        managerAssessments: newAssessments,
        notifications: newNotifications,
      };
    }

    case ActionTypes.CLEAR_ALL:
      return createInitialState();

    default:
      return state;
  }
}

function createInitialState() {
  return {
    analystPredictions: new Map(),
    managerAssessments: new Map(),
    actionPlans: new Map(),
    notifications: new Map(),
    lastAnalystOutput: null,
    lastManagerOutput: null,
  };
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function AgentProvider({ children }) {
  const [state, dispatch] = useReducer(agentReducer, null, createInitialState);

  /**
   * Run the full analysis pipeline:
   * 1. Live Operations Analyst computes depletion predictions
   * 2. Operations Manager classifies severity and generates plans
   */
  const runAnalysisPipeline = useCallback((inventoryData, products, hourlyData, dailyData, analyticsData, branchId) => {
    // Step 1: Live Operations Analyst
    const analystOutput = computeDepletionPredictions(
      inventoryData, products, hourlyData, dailyData, branchId
    );
    dispatch({ type: ActionTypes.SET_ANALYST_OUTPUT, payload: analystOutput });

    // Step 2: Operations Manager
    const managerOutput = processAnalystOutput(analystOutput, analyticsData);
    dispatch({ type: ActionTypes.SET_MANAGER_OUTPUT, payload: managerOutput });

    return { analystOutput, managerOutput };
  }, []);

  /**
   * Submit a human decision (Accept/Reject) for an action plan.
   */
  const submitDecision = useCallback((itemKey, decision, decidedBy) => {
    dispatch({
      type: ActionTypes.APPLY_DECISION,
      payload: { itemKey, decision, decidedBy },
    });
  }, []);

  /**
   * Clear all agent state (e.g., on branch change).
   */
  const clearAgentState = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ALL });
  }, []);

  const value = useMemo(() => ({
    ...state,
    runAnalysisPipeline,
    submitDecision,
    clearAgentState,
  }), [state, runAnalysisPipeline, submitDecision, clearAgentState]);

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access agent state and actions.
 *
 * @returns {{
 *   analystPredictions: Map<string, object>,
 *   managerAssessments: Map<string, object>,
 *   actionPlans: Map<string, object>,
 *   notifications: Map<string, object>,
 *   lastAnalystOutput: object|null,
 *   lastManagerOutput: object|null,
 *   runAnalysisPipeline: Function,
 *   submitDecision: Function,
 *   clearAgentState: Function,
 * }}
 */
export function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within an AgentProvider.');
  }
  return context;
}

export default AgentContext;
