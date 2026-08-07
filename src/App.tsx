import '@/lib/sentry';
import '@/lib/stale-bundle';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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
const LieferungZuweisenPage = lazy(() => import('@/pages/intents/LieferungZuweisenPage'));
const LieferungAbschliessenPage = lazy(() => import('@/pages/intents/LieferungAbschliessenPage'));
// </custom:imports>

// Lazy: public pages live outside <Layout> and only load on /#/public/:slug —
// dashboard users never pay for them, anonymous visitors skip the dashboard.
const PublicPage = lazy(() => import('@/pages/public/PublicPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
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
                <Route path="intents/lieferung-zuweisen" element={<Suspense fallback={null}><LieferungZuweisenPage /></Suspense>} />
                <Route path="intents/lieferung-abschliessen" element={<Suspense fallback={null}><LieferungAbschliessenPage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
