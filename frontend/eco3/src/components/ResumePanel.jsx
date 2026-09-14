import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatBytes, peerLabel } from '../lib/format';
import { countBits } from '../lib/bitmap';

// Receivers know from their own bitmap; senders only from the receiver's last report.
function progressOf(record) {
  const have = record.role === 'receiver'
    ? record.bitmap && countBits(record.bitmap)
    : record.peerHave;
  if (have == null) return null;
  return {
    have,
    pct: Math.round((have / record.totalChunks) * 100),
  };
}

function timeAgo(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const keyOf = (record) => `${record.transferId}:${record.peerId}`;

function resumeLabel(record, match) {
  if (match === undefined) return 'Waiting for peer';
  if (match === false) return "Peer doesn't have this file";
  if (record.needsReselect) return 'Select file to resume';
  if (record.needsPermission) return 'Resume (grant access)';
  return 'Resume';
}

function ResumeItem({ record, match, onResume, onDiscard, busy }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const progress = progressOf(record);
  const blocked = record.unavailable || record.status === 'stale';

  const resume = async (file) => setError(await onResume(record, file));

  return (
    <article className="resume__item">
      <Icon name="file" />

      <div className="resume__body">
        <div className="resume__name" title={record.fileName}>
          {record.fileName}
        </div>

        <p className="resume__meta">
          {record.role === 'receiver' ? 'from' : 'to'}{' '}
          {peerLabel(record.peerId, record.peerAlias)}
          {' · '}{formatBytes(record.fileSize)}
          {progress && ` · ${progress.pct}%`}
          {' · '}{timeAgo(record.lastActiveAt)}
        </p>

        {progress && (
          <div className="track">
            <div
              className="track__fill track__fill--stalled"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        )}

        {record.status === 'stale' && (
          <p className="resume__warn">
            <Icon name="alert" size={12} />
            The file has changed since this transfer started
          </p>
        )}
        {record.unavailable && (
          <p className="resume__warn">
            <Icon name="alert" size={12} />
            File no longer accessible — it may have been moved or deleted
          </p>
        )}
        {error && (
          <p className="resume__warn">
            <Icon name="alert" size={12} />
            {error}
          </p>
        )}
      </div>

      <div className="resume__actions">
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => (record.needsReselect ? inputRef.current?.click() : resume())}
          disabled={match !== true || blocked || busy}
        >
          {resumeLabel(record, match)}
        </button>
        {record.needsReselect && (
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) resume(file);
            }}
          />
        )}
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onDiscard(record)}
          disabled={busy}
        >
          Discard
        </button>
      </div>
    </article>
  );
}

export function ResumePanel({ records, availableMatches, onResume, onDiscard, busyKey }) {
  if (records.length === 0) return null;

  const ready = (r) => availableMatches[keyOf(r)] === true;
  const sorted = [...records].sort((a, b) =>
    (ready(b) - ready(a)) || (b.lastActiveAt - a.lastActiveAt));

  return (
    <section className="resume">
      <header className="resume__head">
        <h2 className="resume__title">Unfinished transfers</h2>
        <p className="resume__hint">
          Connect to the same peer in any room — Resume unlocks once they're here
        </p>
      </header>

      {sorted.map((r) => {
        const key = keyOf(r);
        return (
          <ResumeItem
            key={key}
            record={r}
            match={availableMatches[key]}
            onResume={onResume}
            onDiscard={onDiscard}
            busy={busyKey === key}
          />
        );
      })}
    </section>
  );
}
