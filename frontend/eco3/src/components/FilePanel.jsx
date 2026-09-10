import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatBytes, peerLabel } from '../lib/format';
import { hasFSA } from '../lib/capabilities';

function status(transfer, incoming) {
  if (transfer.done) return 'Complete';
  if (!transfer.accepted) {
    if (!incoming) return 'Waiting for peer';
    return hasFSA ? 'Waiting for you' : 'Cannot receive in this browser';
  }
  return incoming ? 'Receiving' : 'Sending';
}

function Transfer({ transfer, onAccept }) {
  const incoming = transfer.direction === 'receiving';
  const progressed = (incoming ? transfer.received : transfer.sent) ?? 0;
  const pct = transfer.total ? Math.round((progressed / transfer.total) * 100) : 0;

  return (
    <article className="transfer">
      <div className="transfer__row">
        <Icon name="file" />
        <div className="transfer__name" title={transfer.name}>
          {transfer.name}
        </div>

        {incoming && !transfer.accepted ? (
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => onAccept(transfer.peerId, transfer.fileId)}
            disabled={!hasFSA}
            title={hasFSA ? undefined : 'Requires a Chromium browser'}
          >
            Accept
          </button>
        ) : (
          <span className="transfer__pct">{transfer.done ? 'Done' : `${pct}%`}</span>
        )}
      </div>

      <p className="transfer__sub">
        {status(transfer, incoming)} · {formatBytes(transfer.size)} ·{' '}
        {incoming ? 'from' : 'to'} {peerLabel(transfer.peerId)}
      </p>

      {transfer.accepted && (
        <div className="track">
          <div
            className={`track__fill ${transfer.done ? 'track__fill--done' : ''}`}
            style={{ width: `${transfer.done ? 100 : pct}%` }}
          />
        </div>
      )}

      {transfer.openUrl && (
        <a
          className="transfer__open"
          href={transfer.openUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="external" size={13} />
          Open
        </a>
      )}
    </article>
  );
}

export function FilePanel({ transfers, onSend, onAccept, targetCount, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const items = Object.entries(transfers);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onSend(file);
  };

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="panel__title">Files</h2>
          {hasFSA ? (
            <p className="panel__meta">
              <Icon name="lock" size={12} />
              Encrypted · sent to {targetCount === 1 ? '1 peer' : `${targetCount} peers`}
            </p>
          ) : (
            <p className="panel__meta panel__meta--warn">
              <Icon name="alert" size={12} />
              Send only — this browser can’t receive files
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <Icon name="upload" />
          Select file
        </button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onSend(file);
            event.target.value = '';
          }}
        />
      </header>

      <div
        className="panel__body"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div
          className={`dropzone ${items.length > 0 ? 'dropzone--filled' : ''} ${
            dragging ? 'dropzone--active' : ''
          }`}
        >
          {items.length === 0 ? (
            <div className="empty">
              <span className="empty__icon">
                <Icon name="upload" size={18} />
              </span>
              <span className="empty__title">No transfers yet</span>
              <span className="empty__hint">
                {hasFSA
                  ? 'Drop a file here or use Select file'
                  : 'Drop a file here to send — incoming files can’t be saved in this browser'}
              </span>
            </div>
          ) : (
            items.map(([key, transfer]) => (
              <Transfer key={key} transfer={transfer} onAccept={onAccept} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
