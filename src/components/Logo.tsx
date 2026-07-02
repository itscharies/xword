const BASE = import.meta.env.BASE_URL;

/** Small brand mark, shown on every page except the archive (which already
 *  has the full "The Daily Grid" wordmark) — always links back home. */
export function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn icon-btn cog-btn logo-btn"
      onClick={onClick}
      aria-label="The Daily Grid — home"
      title="The Daily Grid"
    >
      <img className="logo-icon" src={`${BASE}favicon.svg`} alt="" />
    </button>
  );
}
