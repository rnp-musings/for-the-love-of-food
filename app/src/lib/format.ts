export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const label = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
export const monthList = (ms: number[]) => (ms.length >= 12 ? 'Moves through the year' : ms.map((m) => MONTHS[m - 1]).join(' / '));
export const HEAT = ['No heat', 'Mild', 'Warm', 'Medium', 'Hot', 'Very hot'];
export const CONTINENTS: Record<string, string> = {
  africa: 'Africa', asia: 'Asia', europe: 'Europe', 'north-america': 'North America',
  'south-america': 'South America', oceania: 'Oceania',
};
const UNIT_TEXT: Record<string, string> = { piece: '', 'to-taste': 'to taste' };
export function amountText(amount: string | number | null, unit: string): string {
  if (unit === 'to-taste' || amount === null) return 'to taste';
  const n = Number(amount);
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return `${shown}${unit in UNIT_TEXT ? (UNIT_TEXT[unit] ? ' ' + UNIT_TEXT[unit] : '') : ' ' + unit}`;
}
