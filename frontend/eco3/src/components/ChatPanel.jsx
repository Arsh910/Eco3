import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatTime } from '../lib/format';

export function ChatPanel({ messages, onSend, disabled }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="panel__title">Messages</h2>
          <p className="panel__meta">Sent over the control channel</p>
        </div>
      </header>

      <div className="panel__body">
        {messages.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">
              <Icon name="message" size={18} />
            </span>
            <span className="empty__title">No messages yet</span>
            <span className="empty__hint">Connect to a peer to start the conversation</span>
          </div>
        ) : (
          <div className="chat">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`bubble ${message.from === 'me' ? 'bubble--me' : ''}`}
              >
                {message.text}
                <span className="bubble__time">{formatTime(message.at)}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form className="panel__foot composer" onSubmit={submit}>
        <input
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? 'Waiting for a peer…' : 'Type a message'}
          disabled={disabled}
          aria-label="Message"
        />
        <button
          type="submit"
          className="btn btn--primary btn--icon"
          disabled={disabled || !text.trim()}
        >
          <Icon name="send" />
          <span className="sr-only">Send</span>
        </button>
      </form>
    </section>
  );
}
