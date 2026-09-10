import { describeStatus } from '../lib/status';
import { peerLabel } from '../lib/format';

export function PeerList({ peers, selected, onToggle }) {
  if (peers.length === 0) return null;

  const hint = selected.length === 0
    ? 'Sending to everyone'
    : `Sending to ${selected.length} of ${peers.length}`;

  return (
    <section className="peers">
      <div className="peers__head">
        <span className="label">Peers</span>
        <span className="peers__hint">{hint}</span>
      </div>

      <div className="peers__list">
        {peers.map((peer) => {
          const { label, tone } = describeStatus(peer.state);
          const connected = peer.state === 'connected';

          return (
            <button
              key={peer.id}
              type="button"
              className={`peer ${selected.includes(peer.id) ? 'peer--on' : ''}`}
              onClick={() => onToggle(peer.id)}
              disabled={!connected}
              title={connected ? 'Click to select' : label}
            >
              <span className={`dot dot--${tone}`} />
              <span className="peer__id">{peerLabel(peer.id)}</span>
              {!connected && <span className="peer__state">{label}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
