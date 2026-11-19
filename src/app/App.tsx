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
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage'));
const DevFixturesPage = lazy(() => import('@/pages/DevFixturesPage'));

/** Shown only if loading takes longer than 250 ms, so fast loads never flash a spinner. */
function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-[40vh] items-center justify-center opacity-0 [animation:veyra-fade-in_.2s_ease-out_.25s_forwards]">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
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
      <div className="flex justify-center gap-4 text-sm">
        <Link to="/" className="text-accent underline">
          Back to home
        </Link>
        <a href={`/feedback?type=bug&error=${encodeURIComponent(message)}`} className="text-accent underline">
          Report this problem
        </a>
      </div>
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
      { path: '/feedback', element: withSuspense(<FeedbackPage />) },
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
