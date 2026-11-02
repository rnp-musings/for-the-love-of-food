const base = import.meta.env.BASE_URL.replace(/\/$/, '');
/** Prefix a site path with the configured base, e.g. url('/dishes/') */
export const url = (p: string) => base + p;
