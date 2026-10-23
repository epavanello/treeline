/**
 * README screenshots: `?scene=<name>` puts the preview in a state worth showing (a dropdown open,
 * a hover card, a context menu) without anyone clicking, so a headless browser can capture it.
 * Preview only: never part of the extension.
 */
const scene = new URLSearchParams(location.search).get('scene');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const find = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find((el) =>
    el.textContent?.includes(text)
  )!;
/** What a mouse arriving and resting on an element does, for tooltips and menus. */
function hover(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const at = { pointerType: 'mouse', clientX: r.left + 12, clientY: r.top + r.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerenter', at));
  for (let i = 0; i < 4; i++)
    el.dispatchEvent(
      new PointerEvent('pointermove', { ...at, bubbles: true, clientX: at.clientX + i })
    );
}
function rightClick(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: r.left + 10,
      clientY: r.top + 8
    })
  );
}

const scenes: Record<string, () => Promise<void>> = {
  /** The branch filter: local and remote branches, a hover card on one of them. */
  async branches() {
    find('button', 'Show All').click();
    await wait(400);
    hover(find('[data-slot=popover-content] [role=option]', 'origin/fix/coupon-expiry'));
  },
  /** Everything changed vs the base, as a tree, next to a worktree's hover card. */
  async review() {
    find('[data-testid=compare-bar] button', 'Diff').click();
    await wait(400);
    const tree = [...document.querySelectorAll<HTMLElement>('[data-testid=details] button')].find(
      (b) => b.querySelector('svg.lucide-list-tree')
    );
    tree?.click();
    await wait(200);
    hover(find('button', 'shop-feat-search-filters'));
  },
  /** A branch's context menu, with the hint of the item under the mouse. */
  async menu() {
    rightClick(find('[role=row] span.cursor-context-menu', 'main'));
    await wait(400);
    hover(find('[data-slot=context-menu-content] [role=menuitem]', 'Rebase'));
  }
};

if (scene && scenes[scene]) {
  // Let the graph load first
  const ready = setInterval(() => {
    if (!document.querySelector('[role=row]')) return;
    clearInterval(ready);
    void wait(500).then(scenes[scene]);
  }, 100);
}
