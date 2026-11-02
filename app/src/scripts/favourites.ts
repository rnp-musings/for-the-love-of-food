// Favourites live only in this browser (localStorage). No accounts.
const KEY = 'ftlof:favourites';
export const readFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked */ } };
const paint = (b: HTMLButtonElement, on: boolean) => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '♥' : '♡'; };

export function initFavButtons(onChange?: () => void) {
  const favs = new Set(readFavs());
  document.querySelectorAll<HTMLButtonElement>('button[data-fav]').forEach((btn) => {
    paint(btn, favs.has(btn.dataset.fav!));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.dataset.fav!;
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      write([...favs]);
      document.querySelectorAll<HTMLButtonElement>(`button[data-fav="${id}"]`).forEach((b) => paint(b, favs.has(id)));
      onChange?.();
    });
  });
}
