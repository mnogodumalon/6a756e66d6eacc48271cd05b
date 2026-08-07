import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { MapWidget } from '@/components/widgets/MapWidget';
import type { MapMarker } from '@/components/widgets/MapWidget';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordKeyFacts,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { IconTruckDelivery, IconAlertTriangle, IconPackage, IconUsers, IconBike, IconCircleCheck } from '@tabler/icons-react';

// ─── i18n ────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    context_orders: 'Bestellungen verwalten',
    hero_label: 'Bestellung bestätigen',
    hero_neue: '{n} neue Bestellung — sofort bearbeiten.',
    hero_neue_pl: '{n} neue Bestellungen — sofort bearbeiten.',
    kpi_gesamt: 'Gesamt heute',
    kpi_unterwegs: 'Unterwegs',
    kpi_fahrer: 'Fahrer aktiv',
    kpi_umsatz: 'Umsatz heute',
    aside_pending: 'Neu & In Bearbeitung',
    aside_driver: 'Fahrer-Übersicht',
    btn_create: 'Neue Bestellung',
    empty_pending: 'Keine offenen Bestellungen — alles im Zeitplan.',
    empty_map: 'Keine Lieferorte gesetzt.',
    driver_available: 'Verfügbar',
    driver_busy: 'Im Einsatz',
    driver_off: 'Nicht verfügbar',
    driver_inactive: 'Inaktiv',
    advance_bereit: 'Bereit zur Lieferung',
    advance_unterwegs: 'Unterwegs',
    advance_geliefert: 'Geliefert',
    map_title: 'Lieferkarte',
    map_empty: 'Keine Lieferorte vorhanden.',
    status_in_bearbeitung: 'In Bearbeitung',
    status_storniert: 'Storniert',
    add_driver: 'Fahrer anlegen',
    legend_new: 'Neu / In Bearbeitung',
    legend_on_way: 'Unterwegs',
    legend_delivered: 'Geliefert',
    legend_cancelled: 'Storniert',
    kf_amount: 'Betrag',
    kf_ordered: 'Bestellt',
    kf_vehicle: 'Fahrzeug',
    kf_zone: 'Liefergebiet',
    kf_city: 'Stadt',
    kf_phone: 'Telefon',
    to_einsatz: '→ Im Einsatz',
    to_verfuegbar: '→ Verfügbar',
  },
  en: {
    context_orders: 'Manage orders',
    hero_label: 'Confirm order',
    hero_neue: '{n} new order — process immediately.',
    hero_neue_pl: '{n} new orders — process immediately.',
    kpi_gesamt: 'Today total',
    kpi_unterwegs: 'On the way',
    kpi_fahrer: 'Drivers active',
    kpi_umsatz: 'Revenue today',
    aside_pending: 'New & In Progress',
    aside_driver: 'Driver Overview',
    btn_create: 'New Order',
    empty_pending: 'No open orders — everything on track.',
    empty_map: 'No delivery locations set.',
    driver_available: 'Available',
    driver_busy: 'On duty',
    driver_off: 'Unavailable',
    driver_inactive: 'Inactive',
    advance_bereit: 'Ready for delivery',
    advance_unterwegs: 'On the way',
    advance_geliefert: 'Delivered',
    map_title: 'Delivery Map',
    map_empty: 'No delivery locations available.',
    status_in_bearbeitung: 'In Progress',
    status_storniert: 'Cancelled',
    add_driver: 'Add driver',
    legend_new: 'New / In Progress',
    legend_on_way: 'On the way',
    legend_delivered: 'Delivered',
    legend_cancelled: 'Cancelled',
    kf_amount: 'Amount',
    kf_ordered: 'Ordered',
    kf_vehicle: 'Vehicle',
    kf_zone: 'Delivery zone',
    kf_city: 'City',
    kf_phone: 'Phone',
    to_einsatz: '→ On duty',
    to_verfuegbar: '→ Available',
  },
  cs: {
    context_orders: 'Spravovat objednávky',
    hero_label: 'Potvrdit objednávku',
    hero_neue: '{n} nová objednávka — zpracovat ihned.',
    hero_neue_pl: '{n} nové objednávky — zpracovat ihned.',
    kpi_gesamt: 'Celkem dnes',
    kpi_unterwegs: 'Na cestě',
    kpi_fahrer: 'Aktivní řidiči',
    kpi_umsatz: 'Obrat dnes',
    aside_pending: 'Nové & Zpracovávané',
    aside_driver: 'Přehled řidičů',
    btn_create: 'Nová objednávka',
    empty_pending: 'Žádné otevřené objednávky — vše v pořádku.',
    empty_map: 'Žádná místa doručení.',
    driver_available: 'Dostupný',
    driver_busy: 'Ve službě',
    driver_off: 'Nedostupný',
    driver_inactive: 'Neaktivní',
    advance_bereit: 'Připraveno k doručení',
    advance_unterwegs: 'Na cestě',
    advance_geliefert: 'Doručeno',
    map_title: 'Mapa doručení',
    map_empty: 'Žádná místa doručení.',
    status_in_bearbeitung: 'Ve zpracování',
    status_storniert: 'Stornováno',
    add_driver: 'Přidat řidiče',
    legend_new: 'Nové / Ve zpracování',
    legend_on_way: 'Na cestě',
    legend_delivered: 'Doručeno',
    legend_cancelled: 'Stornováno',
    kf_amount: 'Částka',
    kf_ordered: 'Objednáno',
    kf_vehicle: 'Vozidlo',
    kf_zone: 'Oblast doručení',
    kf_city: 'Město',
    kf_phone: 'Telefon',
    to_einsatz: '→ Ve službě',
    to_verfuegbar: '→ Dostupný',
  },
});

// ─── Overlay stack union ──────────────────────────────────────────────────────
type OverlayItem =
  | { type: 'bestellung'; record: EnrichedBestellverwaltung }
  | { type: 'fahrer'; record: Fahrerverwaltung }
  | { type: 'kunde'; record: Kundenverwaltung };

export default function DashboardOverview() {
  const {
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [editBestellung, setEditBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);

  // ─── Derived data (after hooks) ───────────────────────────────────────────
  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  // ─── Advance helper (shared between hero, worklist, overlay footer) ───────
  const advanceStatus = useCallback(async (record: Bestellverwaltung, nextStatus: string, nextLabel: string) => {
    const prev = record.fields.order_status;
    setBestellverwaltung(bs => bs.map(b =>
      b.record_id === record.record_id
        ? { ...b, fields: { ...b.fields, order_status: { key: nextStatus, label: nextLabel } } }
        : b,
    ));
    try {
      await LivingAppsService.updateBestellverwaltungEntry(record.record_id, { order_status: nextStatus });
      undoToast(`Status → ${nextLabel}`, async () => {
        setBestellverwaltung(bs => bs.map(b =>
          b.record_id === record.record_id
            ? { ...b, fields: { ...b.fields, order_status: prev } }
            : b,
        ));
        await LivingAppsService.updateBestellverwaltungEntry(record.record_id, { order_status: prev?.key ?? undefined });
      });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  const advanceFahrerStatus = useCallback(async (record: Fahrerverwaltung, nextStatus: string, nextLabel: string) => {
    const prev = record.fields.driver_status;
    setFahrerverwaltung(fs => fs.map(f =>
      f.record_id === record.record_id
        ? { ...f, fields: { ...f.fields, driver_status: { key: nextStatus, label: nextLabel } } }
        : f,
    ));
    try {
      await LivingAppsService.updateFahrerverwaltungEntry(record.record_id, { driver_status: nextStatus });
      undoToast(`Status → ${nextLabel}`, async () => {
        setFahrerverwaltung(fs => fs.map(f =>
          f.record_id === record.record_id
            ? { ...f, fields: { ...f.fields, driver_status: prev } }
            : f,
        ));
        await LivingAppsService.updateFahrerverwaltungEntry(record.record_id, { driver_status: prev?.key ?? undefined });
      });
    } catch {
      await fetchAll();
    }
  }, [setFahrerverwaltung, fetchAll]);

  // ─── GUARD: hooks ABOVE this line ─────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Plain derivations ────────────────────────────────────────────────────
  const today = clock.toLocaleDateString('en-CA'); // yyyy-MM-dd
  const neueBestellungen = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu');
  const unterwegsBestellungen = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs');
  const todayBestellungen = enrichedBestellverwaltung.filter(b => b.fields.order_date?.slice(0, 10) === today);
  const aktiveFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz');
  const umsatzHeute = todayBestellungen.reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0);

  const pendingBestellungen = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    return s === 'neu' || s === 'in_bearbeitung'; /* i18n-exempt */
  }).sort((a, b) => (a.fields.order_date ?? '') < (b.fields.order_date ?? '') ? -1 : 1); /* i18n-exempt */

  // ─── Next status helper ────────────────────────────────────────────────────
  function nextStatus(b: Bestellverwaltung): { key: string; label: string } | null {
    const s = lookupKey(b.fields.order_status);
    if (s === 'neu') return { key: 'in_bearbeitung', label: tt('status_in_bearbeitung') };
    if (s === 'in_bearbeitung') return { key: 'bereit_zur_lieferung', label: tt('advance_bereit') };
    if (s === 'bereit_zur_lieferung') return { key: 'unterwegs', label: tt('advance_unterwegs') };
    if (s === 'unterwegs') return { key: 'geliefert', label: tt('advance_geliefert') };
    return null;
  }

  // ─── Kanban data ────────────────────────────────────────────────────────────
  const kanbanColumns: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [])
    .filter(o => o.key !== 'storniert')
    .map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'geliefert' ? 'success' : o.key === 'storniert' ? 'destructive' : 'default',
    }));

  const storniertColumn: KanbanColumn = { key: 'storniert', label: tt('status_storniert'), tone: 'destructive' };
  const allColumns = [...kanbanColumns, storniertColumn];

  const kanbanCards: KanbanCard[] = enrichedBestellverwaltung.map(b => ({
    id: `bestellung:${b.record_id}`,
    column: lookupKey(b.fields.order_status) ?? '',
    title: b.kundeName || b.fields.delivery_city || '—',
    subtitle: `${b.fields.delivery_street ?? ''} ${b.fields.delivery_house_number ?? ''}`.trim() || formatDateTime(b.fields.order_date),
    tone: lookupKey(b.fields.order_status) === 'geliefert' ? 'success'
      : lookupKey(b.fields.order_status) === 'storniert' ? 'destructive'
      : lookupKey(b.fields.order_status) === 'unterwegs' ? 'primary'
      : 'default',
  }));

  const handleCardMove = async (cardId: string, newColumn: string): Promise<void | string> => {
    const id = cardId.split(':')[1];
    const record = bestellverwaltung.find(b => b.record_id === id);
    if (!record) return;
    const col = allColumns.find(c => c.key === newColumn);
    const prev = record.fields.order_status;
    setBestellverwaltung(bs => bs.map(b =>
      b.record_id === id
        ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: col?.label ?? newColumn } } }
        : b,
    ));
    try {
      await LivingAppsService.updateBestellverwaltungEntry(id, { order_status: newColumn });
      undoToast(`Status → ${col?.label ?? newColumn}`, async () => {
        setBestellverwaltung(bs => bs.map(b =>
          b.record_id === id
            ? { ...b, fields: { ...b.fields, order_status: prev } }
            : b,
        ));
        await LivingAppsService.updateBestellverwaltungEntry(id, { order_status: prev?.key ?? undefined });
        await fetchAll();
      });
    } catch {
      await fetchAll();
    }
  };

  const handleCardClick = (card: KanbanCard) => {
    const id = card.id.split(':')[1];
    const record = enrichedBestellverwaltung.find(b => b.record_id === id);
    if (record) overlay.replace({ type: 'bestellung', record });
  };

  // ─── Map markers ──────────────────────────────────────────────────────────
  const mapMarkers: MapMarker[] = enrichedBestellverwaltung.flatMap(b => {
    const geo = b.fields.delivery_location;
    if (!geo) return [];
    const s = lookupKey(b.fields.order_status);
    return [{
      id: `bestellung:${b.record_id}`,
      lat: geo.lat,
      long: geo.long,
      title: b.kundeName || '—',
      subtitle: geo.info ?? `${b.fields.delivery_street ?? ''} ${b.fields.delivery_house_number ?? ''}`.trim(),
      tone: s === 'geliefert' ? 'success' : s === 'unterwegs' ? 'primary' : s === 'storniert' ? 'destructive' : 'default',
      icon: 'truck' as const,
    }];
  });

  // ─── Context line ──────────────────────────────────────────────────────────
  const contextLine = neueBestellungen.length > 0
    ? `${neueBestellungen.length} neue Bestellung${neueBestellungen.length > 1 ? 'en' : ''} von ${namen(neueBestellungen.map(b => b.kundeName))}.`
    : unterwegsBestellungen.length > 0
    ? `${unterwegsBestellungen.length} Bestellung${unterwegsBestellungen.length > 1 ? 'en' : ''} unterwegs — ${namen(unterwegsBestellungen.map(b => b.kundeName))}.`
    : tt('context_orders');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextLine}</p>
        </div>
        <button
          onClick={() => { setEditBestellung(null); setBestellungDefaults(undefined); setBestellungDialogOpen(true); }}
          className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPackage size={16} className="shrink-0" />
          {tt('btn_create')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={neueBestellungen.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{ label: tt('hero_label'), onClick: () => advanceStatus(neueBestellungen[0], 'in_bearbeitung', tt('status_in_bearbeitung')) }}
          >
            <b>{namen(neueBestellungen.map(b => b.kundeName))}</b>{' '}
            {neueBestellungen.length === 1 ? tt('hero_neue', { n: neueBestellungen.length }) : tt('hero_neue_pl', { n: neueBestellungen.length })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_gesamt')}
              value={todayBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('kpi_unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconTruckDelivery size={16} className="shrink-0" />}
              tone={unterwegsBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_fahrer')}
              value={aktiveFahrer.length}
              icon={<IconBike size={16} className="shrink-0" />}
              tone={aktiveFahrer.length === 0 && fahrerverwaltung.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_umsatz')}
              value={formatCurrency(umsatzHeute)}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
              tone="success"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={allColumns}
            cards={kanbanCards}
            defaultCollapsed={['storniert', 'geliefert']}
            onCardClick={handleCardClick}
            onCardMove={handleCardMove}
            onAddCard={(column) => {
              setEditBestellung(null);
              setBestellungDefaults({ order_status: column });
              setBestellungDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_pending')}
              items={pendingBestellungen.slice(0, 8).map(b => {
                const ns = nextStatus(b);
                return {
                  id: b.record_id,
                  title: b.kundeName || '—',
                  secondLine: (
                    <>
                      <span className={`font-medium ${lookupKey(b.fields.order_status) === 'neu' ? 'text-warning' : 'text-primary'}`}>
                        {b.fields.order_status?.label ?? '—'}
                      </span>
                      {b.fields.order_date && (
                        <span className="text-muted-foreground"> · {formatDateTime(b.fields.order_date)}</span>
                      )}
                    </>
                  ),
                  action: ns ? { label: ns.label, onClick: () => advanceStatus(b, ns.key, ns.label) } : undefined,
                };
              })}
              onItemClick={(id) => {
                const record = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (record) overlay.replace({ type: 'bestellung', record });
              }}
              empty={{ text: tt('empty_pending'), action: { label: tt('btn_create'), onClick: () => { setEditBestellung(null); setBestellungDefaults(undefined); setBestellungDialogOpen(true); } } }}
            />

            <WorkList
              title={tt('aside_driver')}
              items={fahrerverwaltung.map(f => {
                const s = lookupKey(f.fields.driver_status);
                const statusLabel = f.fields.driver_status?.label ?? '—';
                const statusColor = s === 'verfuegbar' ? 'text-success' : s === 'im_einsatz' ? 'text-primary' : 'text-muted-foreground';
                const canToggle = s === 'verfuegbar' || s === 'im_einsatz';
                return {
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—',
                  secondLine: (
                    <>
                      <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                      {f.fields.delivery_zone && (
                        <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                      )}
                    </>
                  ),
                  action: canToggle ? {
                    label: s === 'verfuegbar' ? tt('to_einsatz') : tt('to_verfuegbar'),
                    onClick: () => {
                      if (s === 'verfuegbar') void advanceFahrerStatus(f, 'im_einsatz', tt('driver_busy'));
                      else void advanceFahrerStatus(f, 'verfuegbar', tt('driver_available'));
                    },
                  } : undefined,
                };
              })}
              onItemClick={(id) => {
                const record = fahrerverwaltung.find(f => f.record_id === id);
                if (record) overlay.replace({ type: 'fahrer', record });
              }}
              empty={{ text: tt('driver_inactive'), action: { label: tt('add_driver'), onClick: () => setFahrerDialogOpen(true) } }}
            />
          </>
        }
      />

      {/* Delivery map section */}
      {mapMarkers.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="font-semibold text-sm">{tt('map_title')}</h2>
          </div>
          <div style={{ height: 380 }}>
            <MapWidget
              markers={mapMarkers}
              onMarkerClick={(m) => {
                const id = m.id.split(':')[1];
                const record = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (record) overlay.replace({ type: 'bestellung', record });
              }}
              legend={[
                { label: tt('legend_new'), tone: 'default' },
                { label: tt('legend_on_way'), tone: 'primary' },
                { label: tt('legend_delivered'), tone: 'success' },
                { label: tt('legend_cancelled'), tone: 'destructive' },
              ]}
            />
          </div>
        </div>
      )}

      {/* ─── Overlay stack ─────────────────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={(top) => {
          if (top.type === 'bestellung') {
            const b = top.record;
            const ns = nextStatus(b);
            return (
              <>
                <RecordHeader
                  title={b.kundeName || '—'}
                  subtitle={b.fields.order_status?.label}
                  badges={b.fields.delivery_city ? <span className="text-xs text-muted-foreground">{b.fields.delivery_city}</span> : undefined}
                  meta={
                    <RecordKeyFacts items={[
                      { label: tt('kf_amount'), value: formatCurrency(b.fields.total_amount) },
                      { label: tt('kf_ordered'), value: formatDateTime(b.fields.order_date), icon: IconPackage },
                    ]} />
                  }
                />
                {b.fields.delivery_location && (
                  <div className="px-4 pb-2">
                    <MapRouteLinks lat={b.fields.delivery_location.lat} long={b.fields.delivery_location.long} />
                  </div>
                )}
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={(r) => overlay.push({ type: 'fahrer', record: r })}
                  onOpenKundenverwaltung={(r) => overlay.push({ type: 'kunde', record: r })}
                />
                {ns && <div className="px-4 pb-4" />}
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = top.record;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—'}
                  subtitle={f.fields.driver_status?.label}
                  meta={
                    <RecordKeyFacts items={[
                      { label: tt('kf_vehicle'), value: f.fields.vehicle_type?.label ?? '—', icon: IconBike },
                      { label: tt('kf_zone'), value: f.fields.delivery_zone ?? '—' },
                    ]} />
                  }
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={(r) => {
                    const enriched = enrichedBestellverwaltung.find(eb => eb.record_id === r.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setEditBestellung(null);
                    setBestellungDefaults({ fahrer: f.record_id });
                    setBestellungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || '—'}
                  subtitle={k.fields.customer_status?.label}
                  meta={
                    <RecordKeyFacts items={[
                      { label: tt('kf_city'), value: k.fields.city ?? '—', icon: IconUsers },
                      { label: tt('kf_phone'), value: k.fields.phone ?? '—' },
                    ]} />
                  }
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={(r) => {
                    const enriched = enrichedBestellverwaltung.find(eb => eb.record_id === r.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setEditBestellung(null);
                    setBestellungDefaults({ kunde: k.record_id });
                    setBestellungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={(top) => {
          if (top.type === 'bestellung') {
            const b = top.record;
            const ns = nextStatus(b);
            if (!ns) return undefined;
            return { label: `→ ${ns.label}`, onClick: () => advanceStatus(b, ns.key, ns.label) };
          }
          if (top.type === 'fahrer') {
            const f = top.record;
            const s = lookupKey(f.fields.driver_status);
            if (s === 'verfuegbar') return { label: tt('to_einsatz'), onClick: () => advanceFahrerStatus(f, 'im_einsatz', tt('driver_busy')) };
            if (s === 'im_einsatz') return { label: tt('to_verfuegbar'), onClick: () => advanceFahrerStatus(f, 'verfuegbar', tt('driver_available')) };
          }
          return undefined;
        }}
        onEdit={(top) => {
          if (top.type === 'bestellung') {
            setEditBestellung(top.record);
            setBestellungDialogOpen(true);
          }
        }}
      />

      {/* ─── Dialogs ─────────────────────────────────────────────────────── */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => { setBestellungDialogOpen(false); setEditBestellung(null); setBestellungDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editBestellung?.fields ?? bestellungDefaults}
        recordId={editBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => setFahrerDialogOpen(false)}
        onSubmit={async (fields) => {
          await LivingAppsService.createFahrerverwaltungEntry(fields);
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => setKundeDialogOpen(false)}
        onSubmit={async (fields) => {
          await LivingAppsService.createKundenverwaltungEntry(fields);
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </div>
  );
}
