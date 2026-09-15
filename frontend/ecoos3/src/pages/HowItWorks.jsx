import { Link } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';

// Two paths: setup messages go through the server, file data goes directly between browsers.
function PathsDiagram() {
  return (
    <figure className="figure">
      <svg className="diagram" viewBox="0 0 480 240" role="img" aria-labelledby="paths-title">
        <title id="paths-title">
          Both browsers exchange setup messages through the signaling server, then send file data
          directly to each other.
        </title>
        <rect className="box" x="165" y="10" width="150" height="46" />
        <text className="name" x="240" y="38" textAnchor="middle">Signaling server</text>

        <rect className="box" x="10" y="180" width="150" height="46" />
        <text className="name" x="85" y="208" textAnchor="middle">Your browser</text>

        <rect className="box" x="320" y="180" width="150" height="46" />
        <text className="name" x="395" y="208" textAnchor="middle">Their browser</text>

        <line className="setup" x1="85" y1="180" x2="195" y2="56" />
        <line className="setup" x1="395" y1="180" x2="285" y2="56" />
        <text className="note" x="240" y="110" textAnchor="middle">setup messages only</text>

        <line className="data" x1="160" y1="203" x2="320" y2="203" />
        <text className="note" x="240" y="192" textAnchor="middle">file data, encrypted</text>
      </svg>
      <figcaption>The server helps the browsers find each other. It never carries the file.</figcaption>
    </figure>
  );
}

// The receiver's record of which chunks it has.
function BitmapDiagram() {
  const have = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];

  return (
    <figure className="figure">
      <svg className="diagram" viewBox="0 0 480 110" role="img" aria-labelledby="bitmap-title">
        <title id="bitmap-title">
          A row of sixteen chunks. Most of the first ten have arrived; chunk 4 and chunks 10 to 15 are
          missing and will be requested again.
        </title>
        <text className="note" x="8" y="14">chunk 0</text>
        <text className="note" x="472" y="14" textAnchor="end">chunk 15</text>
        {have.map((bit, i) => (
          <rect key={i} className={bit ? 'have' : 'gap'} x={8 + i * 29} y="22" width="26" height="40" />
        ))}
        <rect className="have" x="8" y="80" width="14" height="14" />
        <text className="note" x="28" y="92">received</text>
        <rect className="gap" x="120" y="80" width="14" height="14" />
        <text className="note" x="140" y="92">missing — requested again on reconnect</text>
      </svg>
      <figcaption>One bit per chunk. Resuming only asks for the empty ones.</figcaption>
    </figure>
  );
}

export function HowItWorks() {
  return (
    <SiteLayout
      path="/how-it-works"
      title="How ecoos3 works: direct browser-to-browser file transfer"
      description="What the signaling server sees, how two browsers connect through NAT, why some networks fail, and how chunked transfers resume after an interruption."
    >
      <article className="prose">
        <h1>How ecoos3 works</h1>
        <p className="section__lead">
          ecoos3 sends files directly between two browsers using WebRTC, the same technology browsers
          use for video calls. This page explains what happens along the way, including the parts
          that don’t always work.
        </p>

        <PathsDiagram />

        <h2 id="no-server">Why your files don’t touch a server</h2>
        <p>
          Once two browsers are connected, ecoos3 opens WebRTC <em>data channels</em> between them. These
          are direct connections: packets go from one computer to the other over the internet, or over
          your local network if you’re both on it. File contents, file names and chat messages all
          travel this way. There’s no server in the data path to store or read them.
        </p>
        <p>
          Data channels are always encrypted with DTLS, which browsers require for WebRTC. The keys are
          checked using fingerprints exchanged during setup, which passes through the signaling server,
          so as with most WebRTC apps you’re trusting that server not to tamper with setup messages.
        </p>

        <h2 id="signaling">What the signaling server actually does</h2>
        <p>
          Two browsers can’t connect until each knows how to reach the other, and they have no way to
          talk before that. The signaling server solves this. When you create or join a room, your
          browser opens a WebSocket to it, and the server forwards a few kinds of message between
          people in the same room:
        </p>
        <ul>
          <li>
            <strong>An offer and an answer</strong> (SDP) — each side describing the connection it
            wants to set up.
          </li>
          <li>
            <strong>ICE candidates</strong> — network addresses where each browser might be reachable.
          </li>
          <li>
            <strong>Room updates</strong> — who joined and who left.
          </li>
        </ul>
        <p>
          The server passes these along and doesn’t store them. It can see the room code, a random ID
          for each browser, the name you typed, and the network addresses inside the ICE candidates. It
          never sees file contents, file names or messages, because those only exist on the direct
          connection.
        </p>

        <h2 id="nat">How two browsers find each other</h2>
        <p>
          Most computers sit behind a router that shares one public IP address between every device on
          the network — this is NAT, network address translation. Your computer’s own address, like
          192.168.1.20, means nothing to someone outside your network.
        </p>
        <p>
          So each browser asks a public STUN server a simple question: “what address do you see me
          coming from?” The answer is the public address and port your router assigned. Each browser
          sends its list of possible addresses to the other through the signaling server, and both
          start sending test packets to each other’s addresses at the same time. Each router sees
          outgoing traffic to the other side and lets the replies back in. This is often called hole
          punching, and the first pair of addresses that works becomes the connection.
        </p>
        <p>
          If you’re both on the same network, your local addresses work directly, which is usually much
          faster than going out to the internet and back.
        </p>

        <h2 id="failures">Why some networks fail</h2>
        <p>
          Hole punching relies on the router keeping the same public port for a connection, whoever
          you’re talking to. Some routers don’t: a <em>symmetric NAT</em> picks a new public port for
          every destination. The port the STUN server saw is then not the port the other browser
          needs, so the test packets never line up. If only one side is behind a symmetric NAT, the
          connection often still works; if both are, or if a firewall blocks the UDP traffic WebRTC
          uses, it doesn’t.
        </p>
        <p>
          The standard fix is a TURN relay: a server that forwards the encrypted traffic between the two
          browsers. It still can’t read the data, but every byte passes through it, which makes it
          expensive to run for large files. ecoos3 doesn’t have a relay yet; relay support is planned.
        </p>
        <p>
          When you open the app, ecoos3 runs a quick check on your network and shows a warning if it looks
          restrictive. It’s an estimate rather than a guarantee: whether a connection works also depends
          on the other person’s network.
        </p>

        <h2 id="chunks">How a file is sent</h2>
        <p>
          Nothing arrives until the receiver presses <em>Accept</em> and picks where to save the file.
          The sender then reads the file in 64 KB chunks and puts a small index number in front of each
          one. Because every chunk says where it belongs, the channel doesn’t need to deliver them in
          order, and the receiver writes each chunk straight to its position in the file on disk using
          the browser’s File System Access API. The file is never held in memory as a whole, which is
          why size isn’t limited by RAM.
        </p>
        <p>
          The sender also watches how much data is waiting in the connection’s buffer and pauses when
          it fills up, so a fast disk doesn’t pile data on top of a slower network.
        </p>

        <h2 id="resume">How resume works</h2>
        <BitmapDiagram />
        <p>
          The receiver keeps a <em>bitmap</em>: one bit per chunk, switched on when that chunk is
          written. Every few seconds the bitmap is saved in the browser’s IndexedDB storage, along with
          the file’s name, size and where it’s being saved.
        </p>
        <p>
          Two identifiers let a transfer be recognised later. Each browser has a random ID that stays the
          same between visits, and each file gets a fingerprint: a SHA-256 hash of its size together
          with its first and last megabyte. When the same two browsers connect again — in any room —
          each tells the other which unfinished transfers it has, and matching fingerprints line up.
        </p>
        <p>
          When you click <em>Resume</em>, the receiver reopens its partial file (the browser asks for
          permission), reads the bitmap, and asks the sender for exactly the missing chunk numbers. The
          sender reads just those parts of the file and sends them. Before it does, it checks the file
          still has the same fingerprint, so an edited or replaced file isn’t mixed in. The fingerprint
          samples the file rather than hashing all of it, so it catches a replaced file or one whose
          size changed, but not an edit that only touches the middle.
        </p>
        <p>
          Progress is only saved when both people have <em>Save progress for resume</em> switched on,
          and unfinished transfers are cleared after 30 days.
        </p>

        <h2 id="limits">Limits worth knowing</h2>
        <ul>
          <li>Receiving needs the File System Access API, which today means a Chromium browser.</li>
          <li>Both people must be online at the same time.</li>
          <li>
            A room holds up to four people. Every pair has its own direct connection, so sending to
            three people splits your upload between them.
          </li>
          <li>Each sender sends one file at a time.</li>
          <li>Speed is limited by the slower of the two connections.</li>
          <li>Resuming needs the same two browsers; clearing site data starts over.</li>
        </ul>

        <p className="cta">
          <Link to="/app" className="btn btn--primary">Try ecoos3</Link>
        </p>
      </article>
    </SiteLayout>
  );
}
