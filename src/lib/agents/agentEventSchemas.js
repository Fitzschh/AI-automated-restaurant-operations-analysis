/**
 * Agent Event Schemas & Validators
 *
 * Shared schema definitions and runtime validators for the two-agent
 * architecture: Live Operations Analyst and Operations Manager.
 *
 * All agent outputs and event payloads are validated through these
 * schemas before being stored in state or dispatched to the
 * FastAPI event gateway.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

export const AgentType = Object.freeze({
  LIVE_OPERATIONS_ANALYST: 'LIVE_OPERATIONS_ANALYST',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
});

export const Severity = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

export const Decision = Object.freeze({
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PENDING: 'PENDING',
});

// ─── Validation Helpers ─────────────────────────────────────────────────────

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

function isISO8601(value) {
  if (!isNonEmptyString(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isOneOf(value, allowed) {
  return allowed.includes(value);
}

// ─── Inventory Prediction Schema ────────────────────────────────────────────

/**
 * Validates a single inventory prediction from the Live Operations Analyst.
 *
 * @param {object} prediction
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInventoryPrediction(prediction) {
  const errors = [];

  if (!prediction || typeof prediction !== 'object') {
    return { valid: false, errors: ['Prediction must be a non-null object.'] };
  }

  if (!isNonEmptyString(prediction.itemKey)) {
    errors.push('itemKey must be a non-empty string.');
  }
  if (!isNonEmptyString(prediction.itemName)) {
    errors.push('itemName must be a non-empty string.');
  }
  if (!isNonNegativeNumber(prediction.currentStock)) {
    errors.push('currentStock must be a non-negative number.');
  }
  if (!isNonNegativeNumber(prediction.salesVelocityPerHour)) {
    errors.push('salesVelocityPerHour must be a non-negative number.');
  }
  if (!isNonNegativeNumber(prediction.estimatedHoursRemaining)) {
    errors.push('estimatedHoursRemaining must be a non-negative number.');
  }
  if (!isNonEmptyString(prediction.prediction)) {
    errors.push('prediction must be a non-empty string.');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Live Analyst Output Schema ─────────────────────────────────────────────

/**
 * Validates the full output from the Live Operations Analyst.
 *
 * @param {object} output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLiveAnalystOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be a non-null object.'] };
  }

  if (output.agentType !== AgentType.LIVE_OPERATIONS_ANALYST) {
    errors.push(`agentType must be "${AgentType.LIVE_OPERATIONS_ANALYST}".`);
  }
  if (!isISO8601(output.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 string.');
  }
  if (!isNonEmptyString(output.branchId)) {
    errors.push('branchId must be a non-empty string.');
  }

  if (!Array.isArray(output.predictions)) {
    errors.push('predictions must be an array.');
  } else {
    output.predictions.forEach((pred, i) => {
      const result = validateInventoryPrediction(pred);
      if (!result.valid) {
        result.errors.forEach((err) => errors.push(`predictions[${i}]: ${err}`));
      }
    });
  }

  if (output.operationalNote !== undefined && typeof output.operationalNote !== 'string') {
    errors.push('operationalNote must be a string if provided.');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Assessment Schema ──────────────────────────────────────────────────────

/**
 * Validates a single assessment from the Operations Manager.
 *
 * @param {object} assessment
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssessment(assessment) {
  const errors = [];

  if (!assessment || typeof assessment !== 'object') {
    return { valid: false, errors: ['Assessment must be a non-null object.'] };
  }

  if (!isNonEmptyString(assessment.itemKey)) {
    errors.push('itemKey must be a non-empty string.');
  }
  if (!isNonEmptyString(assessment.issue)) {
    errors.push('issue must be a non-empty string.');
  }
  if (!isOneOf(assessment.severity, Object.values(Severity))) {
    errors.push(`severity must be one of: ${Object.values(Severity).join(', ')}.`);
  }
  if (!isNonNegativeNumber(assessment.hoursRemaining)) {
    errors.push('hoursRemaining must be a non-negative number.');
  }
  if (assessment.actionPlan !== undefined && assessment.actionPlan !== null && typeof assessment.actionPlan !== 'string') {
    errors.push('actionPlan must be a string or null.');
  }
  if (typeof assessment.approvalRequired !== 'boolean') {
    errors.push('approvalRequired must be a boolean.');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Operations Manager Output Schema ───────────────────────────────────────

/**
 * Validates the full output from the Operations Manager.
 *
 * @param {object} output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOpsManagerOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be a non-null object.'] };
  }

  if (output.agentType !== AgentType.OPERATIONS_MANAGER) {
    errors.push(`agentType must be "${AgentType.OPERATIONS_MANAGER}".`);
  }
  if (!isISO8601(output.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 string.');
  }
  if (!isNonEmptyString(output.branchId)) {
    errors.push('branchId must be a non-empty string.');
  }

  if (!Array.isArray(output.assessments)) {
    errors.push('assessments must be an array.');
  } else {
    output.assessments.forEach((asmt, i) => {
      const result = validateAssessment(asmt);
      if (!result.valid) {
        result.errors.forEach((err) => errors.push(`assessments[${i}]: ${err}`));
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Action Plan Schema ─────────────────────────────────────────────────────

/**
 * Validates an action plan generated for HIGH severity items.
 *
 * @param {object} plan
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateActionPlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['Action plan must be a non-null object.'] };
  }

  if (!isNonEmptyString(plan.itemKey)) {
    errors.push('itemKey must be a non-empty string.');
  }
  if (!isNonEmptyString(plan.issue)) {
    errors.push('issue must be a non-empty string.');
  }
  if (plan.severity !== Severity.HIGH) {
    errors.push('Action plans are only generated for HIGH severity.');
  }
  if (!isNonEmptyString(plan.actionPlan)) {
    errors.push('actionPlan must be a non-empty string.');
  }
  if (plan.approvalRequired !== true) {
    errors.push('approvalRequired must be true for action plans.');
  }
  if (plan.decision !== undefined && !isOneOf(plan.decision, [...Object.values(Decision), null])) {
    errors.push(`decision must be one of: ${Object.values(Decision).join(', ')} or null.`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Decision Payload Schema ────────────────────────────────────────────────

/**
 * Validates a human decision (approval/rejection) for an action plan.
 *
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDecisionPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object.'] };
  }

  if (!isNonEmptyString(payload.branchId)) {
    errors.push('branchId must be a non-empty string.');
  }
  if (!isNonEmptyString(payload.itemKey)) {
    errors.push('itemKey must be a non-empty string.');
  }
  if (!isOneOf(payload.decision, [Decision.APPROVED, Decision.REJECTED])) {
    errors.push(`decision must be "${Decision.APPROVED}" or "${Decision.REJECTED}".`);
  }
  if (!isNonEmptyString(payload.decidedBy)) {
    errors.push('decidedBy must be a non-empty string.');
  }
  if (!isISO8601(payload.decidedAt)) {
    errors.push('decidedAt must be a valid ISO-8601 string.');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Event Payload Schema (for FastAPI gateway) ─────────────────────────────

/**
 * Validates the event payload sent to the FastAPI event gateway.
 *
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEventPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object.'] };
  }

  const event = payload.event || payload;

  if (event.agentType === AgentType.LIVE_OPERATIONS_ANALYST) {
    return validateLiveAnalystOutput(event);
  }

  if (event.agentType === AgentType.OPERATIONS_MANAGER) {
    return validateOpsManagerOutput(event);
  }

  return { valid: false, errors: [`Unknown agentType: "${event.agentType}".`] };
}
