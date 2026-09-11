import { useState } from 'react';
import { Icon } from './Icon';

const CODE_LENGTH = 6;

export function ConnectionBar({
  roomCode, signaling, peerCount, createRoom, joinRoom, leaveRoom, persist, onPersist,
}) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const inRoom = Boolean(roomCode);
  const waiting = inRoom && peerCount === 0;

  const create = async () => {
    setError('');
    try {
      await createRoom();
    } catch {
      setError('Could not create a room. Is the signaling server running?');
    }
  };

  const join = (event) => {
    event.preventDefault();
    setError('');
    joinRoom(code);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard is blocked. Copy the code manually.');
    }
  };

  return (
    <section className="connbar">
      <div className="connbar__row">
        <div>
          <span className="label">Your room code</span>
          <div className="connbar__field">
            <div className={`readout connbar__code ${inRoom ? '' : 'connbar__code--empty'}`}>
              {roomCode ?? '—'.repeat(CODE_LENGTH)}
            </div>
            <button
              type="button"
              className="btn btn--icon"
              onClick={copy}
              disabled={!inRoom}
              title="Copy room code"
            >
              <Icon name={copied ? 'check' : 'copy'} />
              <span className="sr-only">Copy room code</span>
            </button>
          </div>
        </div>

        <form onSubmit={join}>
          <span className="label">Join a room</span>
          <div className="connbar__field">
            <input
              className="input input--code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, CODE_LENGTH))}
              placeholder="ENTER CODE"
              disabled={inRoom}
              aria-label="Room code to join"
            />
            <button type="submit" className="btn" disabled={inRoom || code.length !== CODE_LENGTH}>
              Join
            </button>
          </div>
        </form>

        {inRoom ? (
          <button type="button" className="btn" onClick={leaveRoom}>
            Leave
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={create}>
            <Icon name="plus" />
            Create
          </button>
        )}
      </div>

      <div className="connbar__foot">
        <p className="connbar__hint">
          {waiting &&
            (signaling === 'open'
              ? 'Share the code — waiting for peers to join…'
              : 'Connecting to the signaling server…')}
        </p>

        <label
          className="toggle"
          title="Lets interrupted transfers resume later, even after a reload. Progress is only saved when both people have this on."
        >
          <input
            type="checkbox"
            className="toggle__input"
            checked={persist}
            onChange={(event) => onPersist(event.target.checked)}
          />
          <span className="toggle__track" aria-hidden="true" />
          Save progress for resume
        </label>
      </div>
      {error && <p className="connbar__error">{error}</p>}
    </section>
  );
}
