// A real click into a page leaves the keyboard with Hatch's own interface after the user has touched that interface
// or another app: the webview holds DOM focus, the page's field shows its caret, and every key lands on Hatch's body.
// Blurring and focusing the webview hands the keyboard to the page and keeps the page's own focused field.
// It runs once, on the first press in a page after the keyboard may have left it, so a press that picks from
// a page's open list (Google's suggestions) never meets a blur. test/e2e/user-typing.spec.ts guards this.

let owner: WebviewElement | null = null;
const release = (): void => {
  owner = null;
};
window.addEventListener('pointerdown', release, true);
window.addEventListener('blur', release);
window.hatch.on('window:blur', release);

/** Called when the user presses the pointer inside a page. */
export function claimKeyboard(page: WebviewElement): void {
  if (owner === page) return;
  owner = page;
  page.blur();
  page.focus();
}
