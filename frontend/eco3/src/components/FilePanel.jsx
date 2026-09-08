import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatBytes } from '../lib/format';

function Transfer({ transfer }) {
  const progressed = (transfer.direction === 'sending' ? transfer.sent : transfer.received) ?? 0;
  const pct = transfer.total ? Math.round((progressed / transfer.total) * 100) : 0;
  const verb = transfer.direction === 'sending' ? 'Sent' : 'Received';

  return (
    <article className="transfer">
      <div className="transfer__row">
        <Icon name="file" />
        <div className="transfer__name" title={transfer.name}>
          {transfer.name}
        </div>
        <span className="transfer__pct">{transfer.done ? 'Done' : `${pct}%`}</span>
      </div>

      <p className="transfer__sub">
        {verb} · {formatBytes(transfer.size)}
      </p>

      <div className="track">
        <div
          className={`track__fill ${transfer.done ? 'track__fill--done' : ''}`}
          style={{ width: `${transfer.done ? 100 : pct}%` }}
        />
      </div>

      {transfer.url && (
        <a className="dl" href={transfer.url} download={transfer.name}>
          <Icon name="download" size={13} />
          Download
        </a>
      )}
    </article>
  );
}

export function FilePanel({ transfers, onSend, disabled }) {
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
          <p className="panel__meta">
            <Icon name="lock" size={12} />
            Encrypted peer-to-peer (DTLS)
          </p>
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
              <span className="empty__hint">Drop a file here or use Select file</span>
            </div>
          ) : (
            items.map(([id, transfer]) => <Transfer key={id} transfer={transfer} />)
          )}
        </div>
      </div>
    </section>
  );
}
