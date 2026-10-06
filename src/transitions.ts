/**
 * Shared-element "morph" between a card's artwork and the detail page artwork.
 *
 * The View Transitions API needs exactly one element named `art` on each side of a
 * navigation. Detail pages always name their artwork `art`; a card only gets the name
 * when it is the one that was clicked (and again when navigating back to it).
 */
let active: { key: string; instance: string } | null = null;

export function claimArt(el: Element | null, key: string, instance: string) {
  active = { key, instance };
  document.querySelectorAll<HTMLElement>('.vt-art').forEach((n) => (n.style.viewTransitionName = ''));
  if (el instanceof HTMLElement) el.style.viewTransitionName = 'art';
}

/** Cards inside "related" rows live on detail pages, which already own the `art` name. */
export const isActiveArt = (key: string, instance: string) =>
  !instance.startsWith('related') && active?.key === key && active.instance === instance;
