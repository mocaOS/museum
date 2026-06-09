// Warms the network path to the video embed/media hosts while the visitor is
// still browsing a thumbnail grid, so clicking a poster doesn't pay a cold
// DNS + TLS + TCP handshake before the player can even start loading. React 19
// hoists these <link> tags into <head>. Render once per page that opens
// VideoPlayerModal.
export default function VideoEmbedPreconnect() {
  return (
    <>
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://www.google.com" />
      <link rel="preconnect" href="https://googleads.g.doubleclick.net" />
      <link rel="preconnect" href="https://static.doubleclick.net" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <link rel="preconnect" href="https://player.vimeo.com" />
    </>
  );
}
