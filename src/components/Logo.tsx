/** Small "The Daily Grid" wordmark, shown on every page except the archive
 *  (which already has the full-size one) — always links back home. */
export function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="title-link logo-link"
      onClick={onClick}
      aria-label="The Daily Grid — home"
      title="The Daily Grid"
    >
      <span className="brand logo-wordmark">The Daily Grid</span>
    </button>
  );
}
