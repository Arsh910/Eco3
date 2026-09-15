import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SiteLayout } from './SiteLayout';
import filesShot from '../assets/site/app-files.webp';
import chatShot from '../assets/site/app-chat.webp';
import resumeShot from '../assets/site/app-resume.webp';
import roomShot from '../assets/site/app-room.webp';

const ADVANTAGES = [
  {
    icon: 'send',
    title: 'No upload',
    text: 'Nothing is copied to a server first. The file goes straight to the other browser.',
    link: { to: '/how-it-works#no-server', label: 'How it works' },
  },
  {
    icon: 'lock',
    title: 'Encrypted',
    text: 'Every connection is encrypted by the browser, and the server never sees your files.',
    link: { to: '/how-it-works#signaling', label: 'What the server sees' },
  },
  {
    icon: 'check',
    title: 'You choose where it’s saved',
    text: 'Nothing lands on the receiver’s disk until they press Accept.',
    link: { to: '/app', label: 'Try it' },
  },
  {
    icon: 'plus',
    title: 'Up to four people',
    text: 'Share one room code, then send to everyone or just the people you pick.',
    link: { to: '/app', label: 'Start a room' },
  },
];

const EXAMPLES = [
  { name: 'video-archive.zip', size: '80 GB', status: '62%' },
  { name: 'project-renders.mov', size: '12.4 GB', status: 'Done' },
  { name: 'design-assets.zip', size: '21 GB', status: '58%' },
];

const REQUIREMENTS = [
  {
    title: 'A Chromium browser to receive',
    text: 'Chrome, Edge, Brave or Arc. Sending works in any modern browser, including Firefox and Safari.',
  },
  {
    title: 'Both people online together',
    text: 'ecoos3 isn’t somewhere to leave a file for someone to collect later.',
  },
  {
    title: 'A network that allows direct connections',
    text: 'Strict corporate firewalls and some mobile networks block them. ecoos3 warns you, and relay support is planned.',
  },
  {
    title: 'Speed set by the slower connection',
    text: 'Usually the sender’s upload. Two computers on the same Wi-Fi are much faster.',
  },
];

// A loose, hand-drawn line. Decorative only.
function Scribble({ className, d }) {
  return (
    <svg className={`scribble ${className}`} viewBox="0 0 200 200" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Landing() {
  return (
    <SiteLayout
      path="/"
      title="Send large files directly between computers | ecoos3"
      description="Send files of any size straight from one browser to another. No upload, no account — and interrupted transfers pick up where they stopped, even days later."
    >
      <section className="hero">
        <div className="hero__text">
          <h1 className="hero__title">
            Send huge files<span className="hero__star" aria-hidden="true">✦</span>
            <br />
            without the upload
          </h1>
          <p className="hero__lead">
            ecoos3 connects two browsers directly, so your file goes from your disk to theirs — no size
            limit, no account, nothing stored in between.
          </p>
          <Link to="/app" className="btn btn--dark btn--lg">Start a transfer</Link>
          <a href="#more" className="hero__more">Find out more ↓</a>
          <Scribble
            className="hero__scribble"
            d="M30 40 C 120 20, 190 90, 120 150 C 80 185, 40 150, 70 120 C 95 95, 150 130, 175 185"
          />
        </div>

        <div className="hero__shots">
          <img className="shot shot--back" src={chatShot} alt="ecoos3 chat between two people during a transfer" width="420" height="484" />
          <img className="shot shot--front" src={filesShot} alt="ecoos3 receiving an 80 GB file, 62% complete" width="460" height="334" />
        </div>
      </section>

      <section id="more" className="section">
        <h2 className="section__title">Get more out of<br />every transfer</h2>
        <div className="cards">
          <article className="card">
            <h3 className="card__title">No size limit</h3>
            <p>Each piece goes straight to disk as it arrives, so 500 GB works the same as 5 GB.</p>
            <Link to="/large-file-transfer" className="card__link">Compare the options →</Link>
            <span className="card__shape card__shape--coral" aria-hidden="true" />
            <span className="card__shape card__shape--light" aria-hidden="true" />
          </article>
          <article className="card">
            <h3 className="card__title">Faster on the same network</h3>
            <p>Two computers on the same Wi-Fi connect locally and skip the internet entirely.</p>
            <Link to="/how-it-works#nat" className="card__link">How it connects →</Link>
            <svg className="card__ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="card__ring-coral" cx="60" cy="60" r="48" />
              <circle className="card__ring-light" cx="60" cy="60" r="48" />
            </svg>
          </article>
        </div>
      </section>

      <section className="section split">
        <div>
          <h2 className="section__title">Why people use ecoos3</h2>
          <p className="section__lead">It does one job: gets a big file from one computer to another, directly.</p>
        </div>
        <div className="advantages">
          {ADVANTAGES.map((item) => (
            <article key={item.title} className="advantage">
              <span className="advantage__icon"><Icon name={item.icon} size={16} /></span>
              <div>
                <h3 className="advantage__title">{item.title}</h3>
                <p>{item.text}</p>
                <Link to={item.link.to} className="pill">{item.link.label}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="banner-section">
        <div className="promo">
          <Scribble className="promo__scribble" d="M-10 150 C 30 150, 40 60, 80 60 C 120 60, 110 140, 150 130 C 175 124, 180 105, 210 100" />
          <div className="promo__text">
            <h2 className="promo__title">Big transfers don’t have to happen in one sitting</h2>
            <p>Run an 80 GB transfer for an hour a day. It picks up where it stopped, and only the missing part is sent.</p>
            <Link to="/app" className="btn btn--light btn--lg">Start a transfer</Link>
          </div>
          <img className="shot promo__shot" src={resumeShot} alt="ecoos3 unfinished transfers list with a Resume button" width="620" height="289" loading="lazy" />
        </div>
      </section>

      <section className="section row">
        <div className="row__media">
          <img className="shot" src={roomShot} alt="ecoos3 room code K7M2QX with two connected peers" width="720" height="301" loading="lazy" />
        </div>
        <div>
          <h2 className="section__title">Start in seconds</h2>
          <p className="section__lead">
            Create a room and read out the six-character code. Letters that look alike, like O and 0,
            are left out, so it’s easy to share over a call.
          </p>
        </div>
      </section>

      <section className="section row row--stat">
        <div>
          <h2 className="stat">0 bytes<span>of your files on our servers</span></h2>
          <p className="section__lead">
            Your files move directly between browsers. There’s no copy sitting on someone else’s disk,
            and no upload to wait for before the download can start.
          </p>
        </div>
        <div className="stack" aria-hidden="true">
          <span className="stack__circle" />
          {EXAMPLES.map((item) => (
            <div key={item.name} className="stack__item">
              <span className="stack__icon"><Icon name="file" size={16} /></span>
              <span className="stack__name">{item.name}<small>{item.size}</small></span>
              <span className="stack__status">{item.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__center">
          <h2 className="section__title">Before you start</h2>
          <p className="section__lead">A few honest limits, so there are no surprises.</p>
        </div>
        <div className="requirements">
          {REQUIREMENTS.map((item) => (
            <div key={item.title} className="requirement">
              <h3 className="requirement__title">{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section closing">
        <h2 className="closing__title">Send your first file<br />for free</h2>
        <Link to="/app" className="btn btn--primary btn--lg">Start a transfer</Link>
      </section>
    </SiteLayout>
  );
}
