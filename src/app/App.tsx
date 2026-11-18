import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider, useRouteError, Link } from 'react-router-dom';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { HomePage } from '@/pages/HomePage';
import { ToolsPage } from '@/pages/ToolsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Heavy routes are split so the homepage never downloads editor or media code.
const ToolPage = lazy(() => import('@/pages/ToolPage'));
const EditorPage = lazy(() => import('@/pages/EditorPage'));
const CompatibilityPage = lazy(() => import('@/pages/CompatibilityPage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const BenchmarkPage = lazy(() => import('@/pages/BenchmarkPage'));
const GuidePage = lazy(() => import('@/pages/GuidePage'));
const DevFixturesPage = lazy(() => import('@/pages/DevFixturesPage'));

function Loading() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted">Loading…</div>;
}

const withSuspense = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;

function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">{message}</p>
      <p className="text-sm text-muted">Your projects are stored locally and were not affected.</p>
      <Link to="/" className="text-sm text-accent underline">
        Back to home
      </Link>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/tools', element: <ToolsPage /> },
      { path: '/tools/:slug', element: withSuspense(<ToolPage />) },
      { path: '/compatibility', element: withSuspense(<CompatibilityPage />) },
      { path: '/privacy', element: withSuspense(<PrivacyPage />) },
      { path: '/benchmark', element: withSuspense(<BenchmarkPage />) },
      { path: '/guide', element: withSuspense(<GuidePage />) },
      ...(import.meta.env.DEV ? [{ path: '/dev/fixtures', element: withSuspense(<DevFixturesPage />) }] : []),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/editor', element: withSuspense(<EditorPage />), errorElement: <RouteError /> },
  { path: '/editor/:projectId', element: withSuspense(<EditorPage />), errorElement: <RouteError /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
