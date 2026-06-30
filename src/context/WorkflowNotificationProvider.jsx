/**
 * Workflow Notification Provider — App-Root Action Plan Popups
 *
 * Mirrors the LiveAnalystProvider pattern: mounted ONCE at the app root
 * (above the router) so it survives all navigation. This is the real-time
 * delivery mechanism for the two-tier approval chain — it does NOT create a
 * new system, it reuses the existing gateway + toast pattern.
 *
 * Responsibilities:
 *   - Poll the FastAPI gateway for workflows needing the current user's action.
 *       Manager → PENDING_MANAGER for their branch
 *       Admin   → PENDING_ADMIN across all branches
 *   - Raise an actionable toast (ActionPlanToast) for each new workflow.
 *   - Expose accept()/reject() that drive the state transitions
 *       PENDING_MANAGER → PENDING_ADMIN (manager accept)
 *       PENDING_ADMIN   → PENDING_UIPATH (admin accept, triggers UiPath)
 *   - Track dismissed/shown IDs in localStorage so a popup doesn't re-fire
 *     every poll cycle (and survives refresh until the workflow advances).
 *
 * State transitions it surfaces:
 *   Issue 1 — manager action plan popup (PENDING_MANAGER)
 *   Issue 2 — admin approval request popup (PENDING_ADMIN)
 *   Issue 6 — real-time delivery via the same app-root provider pattern
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { isUserAdmin, getUserBranch } from '../config/authConfig';
import {
  getWorkflows,
  postManagerDecision,
  postAdminDecision,
} from '../lib/eventGatewayClient';

const POLL_INTERVAL_MS = 8000;

// ─── Context ────────────────────────────────────────────────────────────────

const WorkflowNotificationContext = createContext(null);

// ─── Reducer ────────────────────────────────────────────────────────────────

const ActionTypes = {
  PUSH_TOAST: 'PUSH_TOAST',
  SHIFT_TOAST: 'SHIFT_TOAST',
  SET_SUBMITTING: 'SET_SUBMITTING',
  SET_ERROR: 'SET_ERROR',
  RESET: 'RESET',
};

function createInitialState() {
  return {
    // Toasts currently queued for display (FIFO). Each is a workflow object.
    queue: [],
    submitting: false,
    error: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case ActionTypes.PUSH_TOAST: {
      // Avoid duplicates of the same workflow_id already in the queue.
      if (state.queue.some((w) => w.workflow_id === action.payload.workflow_id)) {
        return state;
      }
      return { ...state, queue: [...state.queue, action.payload] };
    }
    case ActionTypes.SHIFT_TOAST:
      return { ...state, queue: state.queue.slice(1) };
    case ActionTypes.SET_SUBMITTING:
      return { ...state, submitting: action.payload };
    case ActionTypes.SET_ERROR:
      return { ...state, error: action.payload };
    case ActionTypes.RESET:
      return createInitialState();
    default:
      return state;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DISMISSED_PREFIX = 'wf_toast_shown_';

function markShown(workflowId) {
  try {
    localStorage.setItem(`${DISMISSED_PREFIX}${workflowId}`, '1');
  } catch {
    /* storage may be unavailable; non-fatal */
  }
}

function isShown(workflowId) {
  try {
    return localStorage.getItem(`${DISMISSED_PREFIX}${workflowId}`) === '1';
  } catch {
    return false;
  }
}

function clearShown(workflowId) {
  try {
    localStorage.removeItem(`${DISMISSED_PREFIX}${workflowId}`);
  } catch {
    /* non-fatal */
  }
}

/**
 * The workflow status the current role must act on.
 *   manager → PENDING_MANAGER
 *   admin   → PENDING_ADMIN
 */
function targetStatus(isAdmin) {
  return isAdmin ? 'PENDING_ADMIN' : 'PENDING_MANAGER';
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function WorkflowNotificationProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [state, dispatch] = useReducer(reducer, null, createInitialState);

  const queueRef = useRef([]);
  queueRef.current = state.queue;

  // Role + branch resolution (mirrors LiveAnalystProvider's approach).
  const role = useMemo(() => {
    if (!user?.email) return null;
    const admin = isUserAdmin(user.email);
    const branch = admin ? 'branch2' : (getUserBranch(user.email) || null);
    return { isAdmin: admin, branch, email: user.email };
  }, [user?.email]);

  // ── Poll for workflows needing action ─────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !role) return undefined;

    let cancelled = false;

    async function checkOnce() {
      if (cancelled) return;
      const status = targetStatus(role.isAdmin);
      // Manager only sees their branch; admin sees all branches.
      const filters = role.isAdmin ? { status } : { status, branchId: role.branch };
      const result = await getWorkflows(filters);
      if (cancelled || !result.success) return;

      for (const wf of result.workflows || []) {
        if (wf.status !== status) continue;
        if (role && !role.isAdmin && role.branch && wf.branch_id !== role.branch) continue;
        if (isShown(wf.workflow_id)) continue;
        markShown(wf.workflow_id);
        dispatch({ type: ActionTypes.PUSH_TOAST, payload: wf });
      }
    }

    checkOnce();
    const timer = setInterval(checkOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAuthenticated, role]);

  // ── Reset on logout ───────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: ActionTypes.RESET });
    }
  }, [isAuthenticated]);

  // ── Toast dismissal ───────────────────────────────────────────────
  const dismissToast = useCallback(() => {
    const wf = queueRef.current[0];
    if (wf) markShown(wf.workflow_id); // already shown, but be safe
    dispatch({ type: ActionTypes.SHIFT_TOAST });
  }, []);

  // ── Decision submission ───────────────────────────────────────────
  const submitDecision = useCallback(
    async (workflow, decision) => {
      if (!role || state.submitting) return { success: false };
      dispatch({ type: ActionTypes.SET_SUBMITTING, payload: true });
      dispatch({ type: ActionTypes.SET_ERROR, payload: null });

      try {
        let result;
        if (role.isAdmin && workflow.status === 'PENDING_ADMIN') {
          result = await postAdminDecision({
            workflowId: workflow.workflow_id,
            decision,
            decidedBy: role.email,
          });
        } else if (!role.isAdmin && workflow.status === 'PENDING_MANAGER') {
          result = await postManagerDecision({
            branchId: workflow.branch_id,
            itemKey: workflow.item_key,
            decision,
            decidedBy: role.email,
          });
        } else {
          // Status not actionable for this role.
          dispatch({ type: ActionTypes.SET_SUBMITTING, payload: false });
          return { success: false, errors: ['Workflow not actionable for this role'] };
        }

        if (!result.success) {
          dispatch({ type: ActionTypes.SET_ERROR, payload: (result.errors || [])[0] });
          return { success: false, errors: result.errors };
        }

        // On a successful accept, clear the dismissed flag so the *next*
        // tier (PENDING_ADMIN) can pop again for the admin. On reject the
        // workflow is terminal — keep it dismissed.
        if (decision === 'APPROVED') clearShown(workflow.workflow_id);
        dispatch({ type: ActionTypes.SHIFT_TOAST });
        return { success: true };
      } catch (err) {
        dispatch({ type: ActionTypes.SET_ERROR, payload: err.message });
        return { success: false, errors: [err.message] };
      } finally {
        dispatch({ type: ActionTypes.SET_SUBMITTING, payload: false });
      }
    },
    [role, state.submitting]
  );

  const value = useMemo(
    () => ({
      activeToast: state.queue[0] || null,
      toastCount: state.queue.length,
      submitting: state.submitting,
      error: state.error,
      role: role ? (role.isAdmin ? 'admin' : 'manager') : null,
      dismissToast,
      submitDecision,
    }),
    [state, role, dismissToast, submitDecision]
  );

  return (
    <WorkflowNotificationContext.Provider value={value}>
      {children}
    </WorkflowNotificationContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useWorkflowNotifications() {
  const ctx = useContext(WorkflowNotificationContext);
  if (!ctx) {
    throw new Error('useWorkflowNotifications must be used within a WorkflowNotificationProvider.');
  }
  return ctx;
}

export default WorkflowNotificationContext;
