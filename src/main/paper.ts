// Grab for Paper: the clipboard payload Paper reads as editable layers.
// Paper's Snapshot extension (v0.3.12) writes one clipboard type, text/html, holding <x-paper-html>…</x-paper-html>.
import { clipboard, ClipboardItem } from 'electron';

export async function copyForPaper(html: string): Promise<number> {
  const payload = `<x-paper-html>${html}</x-paper-html>`;
  // Electron 44 has the ClipboardItem API only.
  await clipboard.write([new ClipboardItem({ 'text/html': payload })]);
  return payload.length;
}
