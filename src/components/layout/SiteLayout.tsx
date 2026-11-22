import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BRAND } from '@/config/brand';
import { TOOLS } from '@/tools/registry';
import { cn } from '@/utils/id';

/** Hexagon ring (six sides) on a 100-unit grid, pointy top. */
const HEX = '50,7.5 86.81,28.75 86.81,71.25 50,92.5 13.19,71.25 13.19,28.75';

export function Logo({ className }: { className?: string }) {
  // Unique per instance (header and footer both render the logo); url(#…) needs a plain id.
  const gid = `logo-g-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Link to="/" className={cn('flex items-center gap-2 text-fg', className)} aria-label={`${BRAND.name} home`}>
      {/* A hexagon holding a forward-pointing V (play and fast-forward). Brand assets live in brand/. */}
      <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--c-logo-1)' }} />
            <stop offset="1" style={{ stopColor: 'var(--c-logo-2)' }} />
          </linearGradient>
        </defs>
        <polygon points={HEX} fill="none" stroke={`url(#${gid})`} strokeWidth="9" strokeLinejoin="round" />
        <path d="M39 30 L63 50 L39 70" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M27 40 L39 50 L27 60" fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">{BRAND.name}</span>
    </Link>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-2.5 py-1.5 text-sm transition-colors', isActive ? 'text-fg' : 'text-muted hover:text-fg');

const NAV: [string, string][] = [
  ['/tools', 'Tools'],
  ['/filmmakers', 'For Filmmakers'],
  ['/guide', 'Guide'],
  ['/privacy', 'Privacy'],
  ['/compatibility', 'Browser support'],
  ['/feedback', 'Report a problem'],
];

/** Phone navigation: a menu button that opens every top-level page. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('#mobile-nav, [aria-controls="mobile-nav"]')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-fg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-xl">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn('block rounded-md px-3 py-2.5 text-sm', isActive ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export function SiteLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            <NavLink to="/tools" className={navClass}>
              Tools
            </NavLink>
            <NavLink to="/filmmakers" className={navClass}>
              For Filmmakers
            </NavLink>
            <NavLink to="/guide" className={navClass}>
              Guide
            </NavLink>
            <NavLink to="/privacy" className={navClass}>
              Privacy
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer" className="hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:text-fg md:inline-flex">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
              Source
            </a>
            <MobileMenu />
            <Link to="/editor" className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg hover:brightness-110">
              Open editor
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="grain border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-12">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="space-y-3">
              <Logo />
              <p className="max-w-xs text-sm text-muted">A video editor and {TOOLS.length} video tools that run in your browser. Your files never leave your computer.</p>
            </div>
            <FooterCol
              title="Make"
              links={[
                ['/editor', 'Editor'],
                ['/tools', 'All tools'],
                ['/filmmakers', 'For Filmmakers'],
                ['/guide', 'Guide'],
              ]}
            />
            <FooterCol
              title="Trust"
              links={[
                ['/privacy', 'Privacy'],
                ['/compatibility', 'Browser support'],
                ['/benchmark', 'Benchmark your device'],
                [BRAND.repoUrl, 'Source code (MIT)'],
              ]}
            />
            <FooterCol
              title="Help"
              links={[
                ['/feedback', 'Report a problem'],
                [`mailto:${BRAND.supportEmail}`, 'Contact'],
                ['/#faq', 'Questions'],
              ]}
            />
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-xs text-faint">
            <span>© {new Date().getFullYear()} Veyra</span>
            <span>MIT licence</span>
            <span>No cookies · no accounts · no uploads</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title} className="text-sm">
      <h2 className="slate mb-3">{title}</h2>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            {to.startsWith('/') && !to.includes('#') ? (
              <Link to={to} className="text-muted hover:text-fg">
                {label}
              </Link>
            ) : (
              <a href={to} className="text-muted hover:text-fg" {...(to.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
