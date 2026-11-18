import { Link, NavLink, Outlet } from 'react-router-dom';
import { BRAND } from '@/config/brand';
import { cn } from '@/utils/id';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-semibold tracking-tight text-fg', className)}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" className="fill-fg" />
        <rect x="7" y="9" width="18" height="14" rx="2" fill="none" stroke="var(--c-accent)" strokeWidth="2" />
        <path d="M14 13v6l5-3z" fill="var(--c-accent)" />
      </svg>
      <span>{BRAND.name}</span>
    </Link>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-2.5 py-1.5 text-sm transition-colors', isActive ? 'text-fg' : 'text-muted hover:text-fg');

export function SiteLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Main">
            <NavLink to="/tools" className={navClass}>
              Tools
            </NavLink>
            <NavLink to="/compatibility" className={navClass}>
              Compatibility
            </NavLink>
            <NavLink to="/privacy" className={navClass}>
              Privacy
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/tools" className={cn(navClass({ isActive: false }), 'sm:hidden')}>
              Tools
            </NavLink>
            <Link to="/editor" className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg hover:brightness-110">
              Open editor
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted sm:grid-cols-[1fr_auto]">
          <div className="max-w-md space-y-2">
            <Logo />
            <p>{BRAND.tagline}</p>
            <p className="text-xs text-faint">No account, no watermark, no upload. Your files are processed on your device.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2" aria-label="Footer">
            <Link to="/editor" className="hover:text-fg">Editor</Link>
            <Link to="/tools" className="hover:text-fg">All tools</Link>
            <Link to="/compatibility" className="hover:text-fg">Browser support</Link>
            <Link to="/privacy" className="hover:text-fg">Privacy</Link>
            <Link to="/#faq" className="hover:text-fg">FAQ</Link>
            <Link to="/#formats" className="hover:text-fg">Formats</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
