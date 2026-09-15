import { Link } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';

const COMPARISON = [
  { label: 'Size limit', cloud: 'Set by your plan', drive: 'Drive capacity', ftp: 'Your server’s storage', p2p: 'Receiver’s free disk space' },
  { label: 'Recipient online at the same time', cloud: 'No', drive: 'Hand-over or shipping', ftp: 'No', p2p: 'Yes' },
  { label: 'Setup', cloud: 'None', drive: 'Buy a drive', ftp: 'Server and network setup', p2p: 'None' },
  { label: 'Someone else holds a copy', cloud: 'Yes', drive: 'No', ftp: 'Only your server', p2p: 'No' },
  { label: 'Speed depends on', cloud: 'Your upload, then their download', drive: 'Local copying', ftp: 'The server’s connection', p2p: 'The slower connection' },
  { label: 'Many recipients', cloud: 'Easy — share a link', drive: 'One drive each', ftp: 'Easy', p2p: 'Up to 4, sent separately' },
];

// hours ≈ GB × 8000 ÷ Mbps ÷ 3600 (decimal gigabytes, no protocol overhead)
const DURATIONS = [
  { size: '10 GB', times: ['~1 h 7 min', '~13 min', '~3 min'] },
  { size: '100 GB', times: ['~11 h', '~2 h 13 min', '~27 min'] },
  { size: '1 TB', times: ['~4.6 days', '~22 h', '~4.4 h'] },
];

export function LargeFileTransfer() {
  return (
    <SiteLayout
      path="/large-file-transfer"
      title="How to transfer large files: the options compared"
      description="Cloud storage, physical drives, FTP and direct peer-to-peer transfer compared honestly — including when a direct transfer tool like ecoos3 is the wrong choice."
    >
      <article className="prose">
        <h1>How to transfer large files</h1>
        <p className="section__lead">
          Past a few gigabytes, email attachments stop working and every other option trades something
          away: time, money, convenience or setup. Here’s how the realistic choices compare, and how to
          pick one.
        </p>

        <h2 id="cloud">Cloud storage and upload links</h2>
        <p>
          Services like Google Drive, Dropbox, OneDrive or a file-sending link site: you upload the file,
          and the recipient downloads it whenever they like.
        </p>
        <ul>
          <li><strong>Good for:</strong> sending to someone who isn’t online right now, or to many people with one link.</li>
          <li><strong>The catch:</strong> the file crosses the internet twice — your upload, then their download. Free plans cap file size or total storage, share links on sending services often expire, and the provider keeps a copy.</li>
        </ul>

        <h2 id="drive">A physical drive</h2>
        <p>Copy the files to an external drive or SSD and hand it over or ship it.</p>
        <ul>
          <li><strong>Good for:</strong> hundreds of gigabytes or more, especially over slow internet. Copying locally is fast and needs no connection at all.</li>
          <li><strong>The catch:</strong> you need to meet in person or post it, you pay for the drive, and it can be lost in transit — encrypt it.</li>
        </ul>

        <h2 id="ftp">FTP, SFTP or a self-hosted server</h2>
        <p>Run a server — a classic FTP or SFTP server, or a self-hosted storage app — and share access to it.</p>
        <ul>
          <li><strong>Good for:</strong> teams that transfer large files regularly and want full control, with no third-party limits.</li>
          <li><strong>The catch:</strong> someone has to set it up and keep it secure and updated, it needs a machine that stays online, and reaching it from outside usually means router and firewall configuration.</li>
        </ul>

        <h2 id="p2p">Direct peer-to-peer transfer</h2>
        <p>
          Tools like <Link to="/">ecoos3</Link> connect the two computers directly, so the file goes from
          one disk to the other without being stored anywhere in between.
        </p>
        <ul>
          <li><strong>Good for:</strong> very large files between two people who can be online together. There’s no upload step and no size cap, and on the same network it’s as fast as the network.</li>
          <li><strong>The catch:</strong> both people must be online at the same time, speed is limited by the sender’s upload, and some strict networks block direct connections.</li>
        </ul>

        <h2 id="compare">Side by side</h2>
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Cloud upload</th>
                <th scope="col">Physical drive</th>
                <th scope="col">FTP / self-hosted</th>
                <th scope="col">Direct (ecoos3)</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.cloud}</td>
                  <td>{row.drive}</td>
                  <td>{row.ftp}</td>
                  <td>{row.p2p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="time">How long will it take?</h2>
        <p>
          Over the internet, the limit is almost always the sender’s upload speed, which is often much
          lower than the download speed your provider advertises. Rough transfer times:
        </p>
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">File size</th>
                <th scope="col">20 Mbps upload</th>
                <th scope="col">100 Mbps upload</th>
                <th scope="col">500 Mbps upload</th>
              </tr>
            </thead>
            <tbody>
              {DURATIONS.map((row) => (
                <tr key={row.size}>
                  <th scope="row">{row.size}</th>
                  {row.times.map((time) => <td key={time}>{time}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Calculated as gigabytes × 8,000 ÷ Mbps. Real transfers run a little slower because of
          protocol overhead and other traffic on the connection.
        </p>

        <h2 id="right">When ecoos3 is a good choice</h2>
        <ul>
          <li>The file is bigger than your cloud plan allows, and you don’t want to pay for more storage just to send it once.</li>
          <li>You and the recipient can be online together — even in short sessions, because transfers resume where they stopped.</li>
          <li>You’d rather no third party keeps a copy.</li>
          <li>You’re on the same network, where a direct transfer runs at full local speed.</li>
        </ul>

        <h2 id="wrong">When ecoos3 is the wrong choice</h2>
        <ul>
          <li><strong>The recipient can’t be online when you are.</strong> ecoos3 has nowhere to leave a file. Use cloud storage or a sending link.</li>
          <li><strong>You’re sending one file to many people.</strong> A room holds four people, and each recipient gets their own stream from your upload. A shared link scales much better.</li>
          <li><strong>The recipient uses Firefox or Safari.</strong> Receiving needs a Chromium browser, so they’d need Chrome, Edge, Brave or Arc.</li>
          <li><strong>Either of you is on a network that blocks direct connections</strong>, such as a strict corporate firewall. Until relay support arrives, use cloud storage or a drive.</li>
          <li><strong>Terabytes over a slow connection.</strong> 1 TB over a 50 Mbps upload is about 44 hours of transfer time. Resume lets you spread that over several days, but posting a drive may still be quicker.</li>
        </ul>

        <p className="cta">
          <Link to="/app" className="btn btn--primary">Start a transfer</Link>
          <Link to="/how-it-works" className="btn">How ecoos3 works</Link>
        </p>
      </article>
    </SiteLayout>
  );
}
