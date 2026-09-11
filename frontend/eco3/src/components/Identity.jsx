import { peerLabel } from '../lib/format';

const MAX_ALIAS = 12;

// The alias is sent on the websocket handshake, so it can only be chosen before joining. Once joined, this shows the name peers see.
export function Identity({ alias, onAlias, selfId }) {
  return (
    <div className="identity">
      <span className="label">You</span>

      {selfId ? (
        <div className="readout identity__id" title={selfId}>
          {peerLabel(selfId, alias)}
        </div>
      ) : (
        <input
          className="input"
          value={alias}
          onChange={(event) => onAlias(event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, MAX_ALIAS))}
          placeholder="Your name (optional)"
          aria-label="Your name"
        />
      )}
    </div>
  );
}
