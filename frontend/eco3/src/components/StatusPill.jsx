import { describeStatus } from '../lib/status';

export function StatusPill({ state }) {
  const { label, tone } = describeStatus(state);

  return (
    <span className="status-pill">
      <span className={`dot dot--${tone}`} />
      {label}
    </span>
  );
}
