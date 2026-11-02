// Favourites are stored only in this browser (localStorage). No accounts, no server.
const KEY = 'ftlof:favourites';

export function readFavs(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function writeFavs(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage may be blocked */ }
}

function paint(btn: HTMLButtonElement, on: boolean) {
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? '♥' : '♡';
}

export function initFavButtons(onChange?: () => void) {
  const favs = new Set(readFavs());
  document.querySelectorAll<HTMLButtonElement>('button[data-fav]').forEach((btn) => {
    paint(btn, favs.has(btn.dataset.fav!));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.dataset.fav!;
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      writeFavs([...favs]);
      document.querySelectorAll<HTMLButtonElement>(`button[data-fav="${id}"]`).forEach((b) => paint(b, favs.has(id)));
      onChange?.();
    });
  });
}
