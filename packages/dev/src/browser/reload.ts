/**
 * The live-reload client, served at `/dev/reload.js`. A plain page opts in with
 * `<script type="module" src="/dev/reload.js"></script>` and reloads whenever the dev server
 * reports a rebuild on `/events`. It reconnects after a second when the server goes away, and
 * marks `<html data-dev-reload="connected">` while connected.
 */
const connect = (): void => {
  const events = new EventSource('/events');
  events.onopen = () => {
    document.documentElement.dataset.devReload = 'connected';
  };
  // The server sends an event only after a rebuild, so every event means "reload".
  events.onmessage = () => location.reload();
  events.onerror = () => {
    delete document.documentElement.dataset.devReload;
    events.close();
    setTimeout(connect, 1000);
  };
};

connect();
