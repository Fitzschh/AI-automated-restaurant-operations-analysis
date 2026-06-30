const AI_BRIEFING_KEY_PREFIX = 'ai_daily_briefing_';

export const SHIFT_HANDOFF_KEYS = {
  pending: 'ai_daily_briefing_pending',
  token: 'ai_daily_briefing_pending_at',
  status: 'ai_shift_handoff_status',
  statusAt: 'ai_shift_handoff_status_at',
  userUid: 'ai_auth_session_uid',
};

export const SHIFT_HANDOFF_STATUS = {
  pending: 'pending',
  inProgress: 'in_progress',
  completed: 'completed',
  skipped: 'skipped',
  failed: 'failed',
};

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function createSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function removeBriefingCache(store) {
  Object.keys(store)
    .filter((key) => key.startsWith(AI_BRIEFING_KEY_PREFIX))
    .forEach((key) => store.removeItem(key));
}

export function beginShiftHandoffLoginSession(userUid = '') {
  const store = storage();
  if (!store) return null;

  const token = createSessionToken();
  removeBriefingCache(store);
  store.setItem(SHIFT_HANDOFF_KEYS.pending, '1');
  store.setItem(SHIFT_HANDOFF_KEYS.token, token);
  store.setItem(SHIFT_HANDOFF_KEYS.status, SHIFT_HANDOFF_STATUS.pending);
  store.setItem(SHIFT_HANDOFF_KEYS.statusAt, String(Date.now()));

  if (userUid) {
    store.setItem(SHIFT_HANDOFF_KEYS.userUid, userUid);
  }

  return token;
}

export function attachShiftHandoffUser(userUid) {
  const store = storage();
  if (store && userUid) {
    store.setItem(SHIFT_HANDOFF_KEYS.userUid, userUid);
  }
}

export function consumeShiftHandoffLoginTrigger({ skip = false } = {}) {
  const store = storage();
  if (!store) return null;

  const isPending = store.getItem(SHIFT_HANDOFF_KEYS.pending) === '1';
  const currentStatus = store.getItem(SHIFT_HANDOFF_KEYS.status);

  if (!isPending || (currentStatus && currentStatus !== SHIFT_HANDOFF_STATUS.pending)) {
    return null;
  }

  const token = store.getItem(SHIFT_HANDOFF_KEYS.token) || createSessionToken();
  const nextStatus = skip
    ? SHIFT_HANDOFF_STATUS.skipped
    : SHIFT_HANDOFF_STATUS.inProgress;

  store.removeItem(SHIFT_HANDOFF_KEYS.pending);
  store.setItem(SHIFT_HANDOFF_KEYS.token, token);
  store.setItem(SHIFT_HANDOFF_KEYS.status, nextStatus);
  store.setItem(SHIFT_HANDOFF_KEYS.statusAt, String(Date.now()));

  return { token, status: nextStatus };
}

export function completeShiftHandoffLoginTrigger() {
  setShiftHandoffStatus(SHIFT_HANDOFF_STATUS.completed);
}

export function failShiftHandoffLoginTrigger() {
  setShiftHandoffStatus(SHIFT_HANDOFF_STATUS.failed);
}

export function clearShiftHandoffSession() {
  const store = storage();
  if (!store) return;

  Object.values(SHIFT_HANDOFF_KEYS).forEach((key) => store.removeItem(key));
  removeBriefingCache(store);
}

export function getShiftHandoffToken() {
  return storage()?.getItem(SHIFT_HANDOFF_KEYS.token) || '';
}

function setShiftHandoffStatus(status) {
  const store = storage();
  if (!store) return;

  store.removeItem(SHIFT_HANDOFF_KEYS.pending);
  store.setItem(SHIFT_HANDOFF_KEYS.status, status);
  store.setItem(SHIFT_HANDOFF_KEYS.statusAt, String(Date.now()));
}
