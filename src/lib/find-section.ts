/**
 * Bring a block the command palette found into view and mark it for a moment.
 *
 * Settings rows, panels and section labels carry their label in `data-search`.
 * The page may still be loading when this runs, so it looks again for a few
 * seconds before giving up. A section label marks its whole card.
 */
export function findSection(label: string): () => void {
  let tries = 0;
  let timer: number | undefined;
  const look = () => {
    const hit = [...document.querySelectorAll<HTMLElement>("[data-search]")].find(
      (el) => el.dataset.search === label,
    );
    if (!hit) {
      if (++tries < 40) timer = window.setTimeout(look, 100);
      return;
    }
    const target =
      hit.dataset.searchScope === "card"
        ? (hit.closest<HTMLElement>(".control-surface") ?? hit)
        : hit;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("search-flash");
    // Restart the animation even when the same block is found twice.
    void target.offsetWidth;
    target.classList.add("search-flash");
    timer = window.setTimeout(() => target.classList.remove("search-flash"), 1800);
  };
  look();
  return () => window.clearTimeout(timer);
}
