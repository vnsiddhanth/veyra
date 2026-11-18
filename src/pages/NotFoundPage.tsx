import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">That page doesn’t exist.</p>
      <Link to="/tools" className="text-sm text-accent hover:underline">
        Browse all tools
      </Link>
    </div>
  );
}
