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
