import { Icon } from './Icon';
import { describeStatus } from '../lib/status';

function Readout({ label, state }) {
  const { label: text, tone } = describeStatus(state);

  return (
    <div>
      <span className="label">{label}</span>
      <div className="readout">
        <span className={`dot dot--${tone}`} />
        {text}
      </div>
    </div>
  );
}

export function ConnectionBar({ signaling, peer, onConnect }) {
  const busy = peer === 'connecting' || peer === 'connected';

  return (
    <section className="connbar">
      <Readout label="Signaling server" state={signaling} />
      <Readout label="Peer" state={peer} />
      <button
        type="button"
        className="btn btn--primary"
        onClick={onConnect}
        disabled={signaling !== 'open' || busy}
      >
        <Icon name="plug" />
        Connect
      </button>
    </section>
  );
}
