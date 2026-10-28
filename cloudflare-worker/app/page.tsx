/** Keep the site's navigation inside the current domain's root page. */
export default function Home() {
  return (
    <iframe
      id="prism-content"
      src="/prism/index.html"
      title="PRISM"
      allow="fullscreen; autoplay; clipboard-write"
      allowFullScreen
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
        display: "block",
        background: "#0a0805",
      }}
    />
  );
}
