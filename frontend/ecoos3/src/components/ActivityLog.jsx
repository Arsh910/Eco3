import { useState } from 'react';
import { Icon } from './Icon';

export function ActivityLog({ entries }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="log">
      <button type="button" className="log__toggle" onClick={() => setOpen(!open)}>
        <Icon
          name="chevron"
          size={14}
          className={`log__chevron ${open ? 'log__chevron--open' : ''}`}
        />
        Activity log
        <span className="log__count">{entries.length}</span>
      </button>
      {open && <pre className="log__body">{entries.join('\n') || 'Nothing logged yet.'}</pre>}
    </section>
  );
}
