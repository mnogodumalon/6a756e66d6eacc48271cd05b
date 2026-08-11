import '@/lib/sentry';
import '@/lib/stale-bundle';
import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { locale, onLocaleChange, syncProfileLocale } from '@/i18n';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import PublicPagesAdmin from '@/pages/PublicPagesAdmin';
import KundenverwaltungPage from '@/pages/KundenverwaltungPage';
import KundenverwaltungDetailPage from '@/pages/KundenverwaltungDetailPage';
import FahrerverwaltungPage from '@/pages/FahrerverwaltungPage';
import FahrerverwaltungDetailPage from '@/pages/FahrerverwaltungDetailPage';
import BestellverwaltungPage from '@/pages/BestellverwaltungPage';
import BestellverwaltungDetailPage from '@/pages/BestellverwaltungDetailPage';
// <custom:imports>
const BestellungAufgebenPage = lazy(() => import('@/pages/intents/BestellungAufgebenPage'));
const BestellungDispatchenPage = lazy(() => import('@/pages/intents/BestellungDispatchenPage'));
// </custom:imports>

// Lazy: public pages live outside <Layout> and only load on /#/public/:slug —
// dashboard users never pay for them, anonymous visitors skip the dashboard.
const PublicPage = lazy(() => import('@/pages/public/PublicPage'));

// Language switch = full remount below the router: every t()/label lookup
// re-evaluates, the la-* widgets re-read <html lang>. Sits INSIDE
// ActionsProvider so chat/drawer state survives a switch, and inside
// HashRouter so the current route survives (it re-reads the URL hash).
function LocaleGate({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState(locale);
  useEffect(() => onLocaleChange(() => setCurrent(locale)), []);
  // Adopt the LA profile language (SSOT) — but never on public routes,
  // where the visitor's browser language governs (initPublicLocale).
  useEffect(() => {
    if (!window.location.hash.startsWith('#/public')) void syncProfileLocale();
  }, []);
  return <Fragment key={current}>{children}</Fragment>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <LocaleGate>
            <Routes>
              <Route path="public/:slug" element={<Suspense fallback={null}><PublicPage /></Suspense>} />
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="kundenverwaltung" element={<KundenverwaltungPage />} />
                <Route path="kundenverwaltung/:id" element={<KundenverwaltungDetailPage />} />
                <Route path="fahrerverwaltung" element={<FahrerverwaltungPage />} />
                <Route path="fahrerverwaltung/:id" element={<FahrerverwaltungDetailPage />} />
                <Route path="bestellverwaltung" element={<BestellverwaltungPage />} />
                <Route path="bestellverwaltung/:id" element={<BestellverwaltungDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="verwaltung/oeffentliche-seiten" element={<PublicPagesAdmin />} />
                {/* <custom:routes> */}
                <Route path="intents/bestellung-aufgeben" element={<Suspense fallback={null}><BestellungAufgebenPage /></Suspense>} />
                <Route path="intents/bestellung-dispatchen" element={<Suspense fallback={null}><BestellungDispatchenPage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
            </LocaleGate>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
