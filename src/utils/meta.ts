/** Per-page document metadata for a client-rendered app: title, description and optional JSON-LD. */
export function setPageMeta(title: string, description: string, jsonLd?: object): () => void {
  document.title = title;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
  }
  const previous = meta.content;
  meta.content = description;
  for (const prop of ['og:title', 'og:description'] as const) {
    const el = document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
    if (el) el.content = prop === 'og:title' ? title : description;
  }
  // The build writes per-page structured data and a canonical link for crawlers; once the app runs
  // it owns them, so in-app navigation never leaves the first page's data behind.
  document.querySelectorAll('script[type="application/ld+json"][data-static]').forEach((s) => s.remove());
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = `${location.origin}${location.pathname}`;
  let script: HTMLScriptElement | null = null;
  if (jsonLd) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }
  return () => {
    meta!.content = previous;
    script?.remove();
  };
}
