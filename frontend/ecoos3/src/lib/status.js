const STATES = {
  idle: { label: 'Idle', tone: 'idle' },
  new: { label: 'Connecting', tone: 'pending' },
  connecting: { label: 'Connecting', tone: 'pending' },
  connected: { label: 'Connected', tone: 'ok' },
  disconnected: { label: 'Disconnected', tone: 'pending' },
  failed: { label: 'Failed', tone: 'err' },
  closed: { label: 'Closed', tone: 'idle' },
  open: { label: 'Connected', tone: 'ok' },
  error: { label: 'Error', tone: 'err' },
};

export function describeStatus(state) {
  return STATES[state] ?? { label: state, tone: 'idle' };
}
