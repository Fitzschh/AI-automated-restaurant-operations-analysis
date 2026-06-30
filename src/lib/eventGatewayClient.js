/**
 * Event Gateway Client
 *
 * HTTP client for the FastAPI event gateway. Handles communication
 * between the React frontend agents and the Python backend.
 *
 * Endpoints:
 *   POST /event     — Send agent outputs
 *   GET  /events    — Retrieve latest processed states
 *   POST /decision  — Send human approval/rejection
 */

import { validateEventPayload, validateDecisionPayload } from './agents/agentEventSchemas';

const DEFAULT_GATEWAY_URL = 'http://localhost:8080';

function getBaseUrl() {
  // Vite environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EVENT_GATEWAY_URL) {
    return import.meta.env.VITE_EVENT_GATEWAY_URL;
  }
  return DEFAULT_GATEWAY_URL;
}

/**
 * Make an HTTP request with retry logic.
 *
 * @param {string} url
 * @param {object} options - fetch options
 * @param {number} maxRetries
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxRetries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.ok || response.status === 422) {
        // Return both success and validation errors (422)
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      // Don't retry on client errors (4xx) except 429
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw lastError;
      }
    } catch (err) {
      lastError = err;

      // Network errors — retry after backoff
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 500)
        );
      }
    }
  }

  throw lastError;
}

/**
 * Convert a camelCase agent output into the snake_case shape required by
 * the FastAPI gateway's Pydantic schemas (backend/schemas.py).
 *
 * The frontend agents (liveOperationsAnalyst, operationsManagerAgent) emit
 * camelCase keys; the backend validates snake_case. Without this transform
 * every POST /event returns HTTP 422 and no workflow is ever created,
 * breaking the entire approval chain.
 */

/**
 * Recursive camelCase → snake_case for an object. Converts all keys
 * (including nested) so nested Pydantic models validate correctly.
 */
function snakeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeKeys);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    out[snake] = snakeKeys(obj[key]);
  }
  return out;
}

function toSnakeCaseEvent(agentOutput) {
  const mapPrediction = (p) => ({
    item_key: p.itemKey,
    item_name: p.itemName,
    current_stock: p.currentStock,
    sales_velocity_per_hour: p.salesVelocityPerHour,
    estimated_hours_remaining: p.estimatedHoursRemaining,
    prediction: p.prediction,
  });

  const mapAssessment = (a) => ({
    item_key: a.itemKey,
    item_name: a.itemName || '',
    issue: a.issue,
    severity: a.severity,
    hours_remaining: a.hoursRemaining,
    current_stock: a.currentStock || 0,
    sales_velocity_per_hour: a.salesVelocityPerHour || 0,
    action_plan: a.actionPlan || null,
    approval_required: a.approvalRequired,
    decision: (a.decision && a.decision !== 'PENDING') ? a.decision : null,
    decided_by: a.decidedBy || null,
  });

  const out = {
    agent_type: agentOutput.agentType,
    timestamp: agentOutput.timestamp,
    branch_id: agentOutput.branchId,
  };

  if (agentOutput.agentType === 'LIVE_OPERATIONS_ANALYST') {
    out.predictions = (agentOutput.predictions || []).map(mapPrediction);
    if (agentOutput.operationalNote !== undefined) {
      out.operational_note = agentOutput.operationalNote;
    }
  } else if (agentOutput.agentType === 'OPERATIONS_MANAGER') {
    out.assessments = (agentOutput.assessments || []).map(mapAssessment);
    if (agentOutput.revenueAnalysis) out.revenue_analysis = snakeKeys(agentOutput.revenueAnalysis);
    if (agentOutput.operationalPerformance) {
      out.operational_performance = snakeKeys(agentOutput.operationalPerformance);
    }
  }

  return out;
}

/**
 * Send an agent output event to the FastAPI gateway.
 *
 * @param {object} agentOutput - Output from either agent
 * @returns {Promise<object>}
 */
export async function postEvent(agentOutput) {
  // Client-side validation (operates on the camelCase source shape)
  const validation = validateEventPayload({ event: agentOutput });
  if (!validation.valid) {
    console.warn('[Event Gateway] Skipping invalid event:', validation.errors);
    return { success: false, errors: validation.errors };
  }

  try {
    // Transform to snake_case to match the backend Pydantic contract.
    const snakePayload = toSnakeCaseEvent(agentOutput);
    const response = await fetchWithRetry(`${getBaseUrl()}/event`, {
      method: 'POST',
      body: JSON.stringify({ event: snakePayload }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Event Gateway] POST /event failed:', data);
      return { success: false, errors: data.detail || [data.error || 'Unknown error'] };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Event Gateway] POST /event network error:', err.message);
    return { success: false, errors: [err.message] };
  }
}

/**
 * Retrieve latest processed states from the gateway.
 *
 * @param {object} filters
 * @param {string} [filters.agentType] - Filter by agent type
 * @param {string} [filters.severity]  - Filter by severity level
 * @param {string} [filters.branchId]  - Filter by branch ID
 * @returns {Promise<object>}
 */
export async function getEvents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.agentType) params.set('agent_type', filters.agentType);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.branchId) params.set('branch_id', filters.branchId);

  const queryString = params.toString();
  const url = `${getBaseUrl()}/events${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetchWithRetry(url, { method: 'GET' });
    const data = await response.json();

    if (!response.ok) {
      console.error('[Event Gateway] GET /events failed:', data);
      return { success: false, events: [], errors: data.detail || [] };
    }

    return { success: true, events: data.events || data || [] };
  } catch (err) {
    console.error('[Event Gateway] GET /events network error:', err.message);
    return { success: false, events: [], errors: [err.message] };
  }
}

/**
 * Send a human decision (approval/rejection) to the gateway.
 *
 * @param {object} decision
 * @param {string} decision.branchId
 * @param {string} decision.itemKey
 * @param {'APPROVED'|'REJECTED'} decision.decision
 * @param {string} decision.decidedBy
 * @param {string} [decision.notes]
 * @returns {Promise<object>}
 */
export async function postDecision(decision) {
  const payload = {
    ...decision,
    decidedAt: decision.decidedAt || new Date().toISOString(),
  };

  // Client-side validation
  const validation = validateDecisionPayload(payload);
  if (!validation.valid) {
    console.warn('[Event Gateway] Skipping invalid decision:', validation.errors);
    return { success: false, errors: validation.errors };
  }

  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Event Gateway] POST /decision failed:', data);
      return { success: false, errors: data.detail || [data.error || 'Unknown error'] };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Event Gateway] POST /decision network error:', err.message);
    return { success: false, errors: [err.message] };
  }
}

/**
 * Check if the event gateway is reachable.
 *
 * @returns {Promise<boolean>}
 */
export async function isGatewayHealthy() {
  try {
    const response = await fetch(`${getBaseUrl()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Two-Tier Decision API ──────────────────────────────────────────────────

/**
 * Submit a manager-level decision (first tier).
 *
 * @param {{ branchId: string, itemKey: string, decision: string, decidedBy: string, notes?: string }} decision
 * @returns {Promise<object>}
 */
export async function postManagerDecision(decision) {
  const payload = {
    branch_id: decision.branchId,
    item_key: decision.itemKey,
    decision: decision.decision,
    decided_by: decision.decidedBy,
    notes: decision.notes || null,
  };

  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/decision/manager`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, errors: data.detail || [data.error || 'Manager decision failed'] };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Submit an admin-level decision (second tier, may trigger UiPath).
 *
 * @param {{ workflowId: string, decision: string, decidedBy: string, notes?: string }} decision
 * @returns {Promise<object>}
 */
export async function postAdminDecision(decision) {
  const payload = {
    workflow_id: decision.workflowId,
    decision: decision.decision,
    decided_by: decision.decidedBy,
    notes: decision.notes || null,
  };

  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/decision/admin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, errors: data.detail || [data.error || 'Admin decision failed'] };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

// ─── Workflow API ───────────────────────────────────────────────────────────

/**
 * Retrieve workflows with optional filters.
 *
 * @param {{ branchId?: string, status?: string }} filters
 * @returns {Promise<object>}
 */
export async function getWorkflows(filters = {}) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branch_id', filters.branchId);
  if (filters.status) params.set('status', filters.status);

  const queryString = params.toString();
  const url = `${getBaseUrl()}/workflows${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetchWithRetry(url, { method: 'GET' });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, workflows: [], errors: data.detail || [] };
    }
    return { success: true, workflows: data.workflows || [] };
  } catch (err) {
    return { success: false, workflows: [], errors: [err.message] };
  }
}

/**
 * Get a single workflow by ID.
 *
 * @param {string} workflowId
 * @returns {Promise<object>}
 */
export async function getWorkflow(workflowId) {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/workflows/${workflowId}`, { method: 'GET' });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, workflow: null };
    }
    return { success: true, workflow: data.workflow };
  } catch (err) {
    return { success: false, workflow: null, errors: [err.message] };
  }
}

// ─── Notification API ───────────────────────────────────────────────────────

/**
 * Retrieve notifications with optional filters.
 *
 * @param {{ branchId?: string, severity?: string, archived?: boolean, approvalStatus?: string }} filters
 * @returns {Promise<object>}
 */
export async function getNotifications(filters = {}) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branch_id', filters.branchId);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.archived !== undefined) params.set('archived', String(filters.archived));
  if (filters.approvalStatus) params.set('approval_status', filters.approvalStatus);

  const queryString = params.toString();
  const url = `${getBaseUrl()}/notifications${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetchWithRetry(url, { method: 'GET' });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, notifications: [] };
    }
    return { success: true, notifications: data.notifications || [] };
  } catch (err) {
    return { success: false, notifications: [], errors: [err.message] };
  }
}

/**
 * Archive a notification (soft delete).
 *
 * @param {string} notificationId
 * @returns {Promise<object>}
 */
export async function archiveNotification(notificationId) {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/notifications/${notificationId}/archive`, {
      method: 'POST',
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Delete a notification permanently.
 *
 * @param {string} notificationId
 * @returns {Promise<object>}
 */
export async function deleteNotification(notificationId) {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/notifications/${notificationId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

// ─── Inbox API ──────────────────────────────────────────────────────────────

/**
 * Retrieve inbox activity feed.
 *
 * @param {{ branchId?: string, role?: 'manager' | 'admin' }} filters
 * @returns {Promise<object>}
 */
export async function getInbox(filters = {}) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branch_id', filters.branchId);
  if (filters.role) params.set('role', filters.role);

  const queryString = params.toString();
  const url = `${getBaseUrl()}/inbox${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetchWithRetry(url, { method: 'GET' });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, items: [] };
    }
    return { success: true, items: data.items || [] };
  } catch (err) {
    return { success: false, items: [], errors: [err.message] };
  }
}

// ─── Supplier API ───────────────────────────────────────────────────────────

/**
 * List all suppliers.
 *
 * @param {{ category?: string }} filters
 * @returns {Promise<object>}
 */
export async function getSuppliers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);

  const queryString = params.toString();
  const url = `${getBaseUrl()}/suppliers${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetchWithRetry(url, { method: 'GET' });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, suppliers: [] };
    }
    return { success: true, suppliers: data.suppliers || [] };
  } catch (err) {
    return { success: false, suppliers: [], errors: [err.message] };
  }
}

/**
 * Create a new supplier.
 *
 * @param {{ name: string, email: string, productCategory: string, notes?: string }} supplier
 * @returns {Promise<object>}
 */
export async function createSupplier(supplier) {
  const payload = {
    name: supplier.name,
    email: supplier.email,
    product_category: supplier.productCategory,
    notes: supplier.notes || '',
  };

  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/suppliers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, errors: data.detail || ['Failed to create supplier'] };
    }
    return { success: true, supplier: data.supplier };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Update an existing supplier.
 *
 * @param {string} supplierId
 * @param {{ name: string, email: string, productCategory: string, notes?: string }} supplier
 * @returns {Promise<object>}
 */
export async function updateSupplier(supplierId, supplier) {
  const payload = {
    name: supplier.name,
    email: supplier.email,
    product_category: supplier.productCategory,
    notes: supplier.notes || '',
  };

  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, errors: data.detail || ['Failed to update supplier'] };
    }
    return { success: true, supplier: data.supplier };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Delete a supplier.
 *
 * @param {string} supplierId
 * @returns {Promise<object>}
 */
export async function deleteSupplier(supplierId) {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/suppliers/${supplierId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

// ─── Restock Config API ─────────────────────────────────────────────────────

/**
 * Get the current configurable restock amount.
 *
 * @returns {Promise<object>}
 */
export async function getRestockConfig() {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/config/restock-amount`, { method: 'GET' });
    const data = await response.json();
    return { success: response.ok, amount: data.amount || 10 };
  } catch (err) {
    return { success: false, amount: 10 };
  }
}

/**
 * Set the configurable restock amount.
 *
 * @param {number} amount
 * @returns {Promise<object>}
 */
export async function setRestockConfig(amount) {
  try {
    const response = await fetchWithRetry(`${getBaseUrl()}/config/restock-amount`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    });
    const data = await response.json();
    return { success: response.ok, amount: data.amount };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

