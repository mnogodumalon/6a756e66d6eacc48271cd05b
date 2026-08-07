import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { MapWidget } from '@/components/widgets/MapWidget';
import type { MapMarker } from '@/components/widgets/MapWidget';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader, RecordField, RecordSection, RecordAttachments,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import {
  IconTruck, IconAlertTriangle, IconPackage, IconUser, IconCheck, IconPlus,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    ctx_none: 'Alle Bestellungen im Zeitplan.',
    ctx_urgent: '{n} Bestellung(en) ohne Fahrer.',
    hero_title: '{n} Bestellung(en) ohne Fahrer — bitte Fahrer zuweisen.',
    hero_action: 'Fahrer zuweisen',
    kpi_active: 'Aktiv',
    kpi_unassigned: 'Ohne Fahrer',
    kpi_today: 'Heute fällig',
    kpi_drivers: 'Fahrer verfügbar',
    aside_urgent: 'Ohne Fahrer & heute fällig',
    aside_drivers: 'Fahrer-Status',
    empty_orders: 'Keine offenen Bestellungen',
    empty_drivers: 'Alle Fahrer im Einsatz',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    status_advance: '✓ Weiter',
    driver_free: '✓ Frei',
    map_tab: 'Lieferkarte',
    board_tab: 'Bestellboard',
    tab_hint_map: 'Zeige Karte',
    tab_hint_board: 'Zeige Board',
    no_location: 'Kein Standort',
    undo_status: 'Status geändert',
    undo_driver: 'Fahrer zugewiesen',
  },
  en: {
    ctx_none: 'All orders on schedule.',
    ctx_urgent: '{n} order(s) without a driver.',
    hero_title: '{n} order(s) without a driver — please assign a driver.',
    hero_action: 'Assign driver',
    kpi_active: 'Active',
    kpi_unassigned: 'No driver',
    kpi_today: 'Due today',
    kpi_drivers: 'Drivers available',
    aside_urgent: 'No driver & due today',
    aside_drivers: 'Driver status',
    empty_orders: 'No open orders',
    empty_drivers: 'All drivers on duty',
    new_order: 'New order',
    new_driver: 'New driver',
    status_advance: '✓ Next',
    driver_free: '✓ Free',
    map_tab: 'Delivery map',
    board_tab: 'Order board',
    tab_hint_map: 'Show map',
    tab_hint_board: 'Show board',
    no_location: 'No location',
    undo_status: 'Status changed',
    undo_driver: 'Driver assigned',
  },
  cs: {
    ctx_none: 'Všechny objednávky v pořádku.',
    ctx_urgent: '{n} objednávka(-ky) bez řidiče.',
    hero_title: '{n} objednávka(-ky) bez řidiče — přiřaďte řidiče.',
    hero_action: 'Přiřadit řidiče',
    kpi_active: 'Aktivní',
    kpi_unassigned: 'Bez řidiče',
    kpi_today: 'Dnes splatné',
    kpi_drivers: 'Řidiči k dispozici',
    aside_urgent: 'Bez řidiče & dnes splatné',
    aside_drivers: 'Stav řidičů',
    empty_orders: 'Žádné otevřené objednávky',
    empty_drivers: 'Všichni řidiči v provozu',
    new_order: 'Nová objednávka',
    new_driver: 'Nový řidič',
    status_advance: '✓ Dále',
    driver_free: '✓ Volný',
    map_tab: 'Mapa doručení',
    board_tab: 'Nástěnka objednávek',
    tab_hint_map: 'Zobrazit mapu',
    tab_hint_board: 'Zobrazit nástěnku',
    no_location: 'Žádná poloha',
    undo_status: 'Stav změněn',
    undo_driver: 'Řidič přiřazen',
  },
});

// Status advancement order
const STATUS_NEXT: Record<string, string | null> = {
  neu: 'in_bearbeitung',
  in_bearbeitung: 'bereit_zur_lieferung',
  bereit_zur_lieferung: 'unterwegs',
  unterwegs: 'geliefert',
  geliefert: null,
  storniert: null,
};

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

  const [primaryView, setPrimaryView] = useState<'board' | 'map'>('board');
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderDefaults, setOrderDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editingOrder, setEditingOrder] = useState<EnrichedBestellverwaltung | undefined>();
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Fahrerverwaltung | undefined>();
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Kundenverwaltung | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const enrichedOrders = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const today = format(clock, 'yyyy-MM-dd');

  const activeOrders = useMemo(
    () => enrichedOrders.filter(o => {
      const k = o.fields.order_status?.key;
      return k !== 'geliefert' && k !== 'storniert';
    }),
    [enrichedOrders],
  );

  const unassignedOrders = useMemo(
    () => activeOrders.filter(o => !extractRecordId(o.fields.fahrer)),
    [activeOrders],
  );

  const todayOrders = useMemo(
    () => activeOrders.filter(o => {
      const dt = o.fields.desired_delivery_time ?? o.fields.order_date;
      return dt ? dt.startsWith(today) : false;
    }),
    [activeOrders, today],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const urgentUnassignedToday = useMemo(
    () => unassignedOrders.filter(o => {
      const dt = o.fields.desired_delivery_time ?? o.fields.order_date;
      return dt ? dt.startsWith(today) : false;
    }),
    [unassignedOrders, today],
  );

  // One shared advance-status helper
  const advanceStatus = useCallback(async (order: EnrichedBestellverwaltung) => {
    const currentKey = order.fields.order_status?.key ?? 'neu';
    const nextKey = STATUS_NEXT[currentKey];
    if (!nextKey) return;
    const nextOpt = LOOKUP_OPTIONS['bestellverwaltung']['order_status'].find(o => o.key === nextKey);
    const prev = bestellverwaltung;
    setBestellverwaltung(bs => bs.map(b =>
      b.record_id === order.record_id
        ? { ...b, fields: { ...b.fields, order_status: { key: nextKey, label: nextOpt?.label ?? nextKey } } }
        : b,
    ));
    undoToast(tt('undo_status'), async () => {
      setBestellverwaltung(prev);
      await LivingAppsService.updateBestellverwaltungEntry(order.record_id, { order_status: currentKey });
    });
    LivingAppsService.updateBestellverwaltungEntry(order.record_id, { order_status: nextKey })
      .catch(() => { setBestellverwaltung(prev); fetchAll(); });
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // Kanban columns
  const kanbanColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'storniert' ? 'destructive' : o.key === 'geliefert' ? 'success' : 'default',
    } as KanbanColumn)),
    [],
  );

  const filteredOrders = useMemo(
    () => statusFilter ? enrichedOrders.filter(o => o.fields.order_status?.key === statusFilter) : enrichedOrders,
    [enrichedOrders, statusFilter],
  );

  const kanbanCards: KanbanCard[] = useMemo(
    () => filteredOrders.map(o => ({
      id: `bestellung:${o.record_id}`,
      column: o.fields.order_status?.key ?? '',
      title: o.kundeName || appLabel('kundenverwaltung'),
      subtitle: [
        o.fields.delivery_city ?? o.fields.delivery_street,
        o.fields.total_amount != null ? formatCurrency(o.fields.total_amount) : null,
        o.fahrerName ? `🚴 ${o.fahrerName}` : null,
      ].filter(Boolean).join(' · '),
      tone: !extractRecordId(o.fields.fahrer) && o.fields.order_status?.key !== 'geliefert' && o.fields.order_status?.key !== 'storniert'
        ? 'warning'
        : 'default',
    } as KanbanCard)),
    [filteredOrders],
  );

  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const id = cardId.split(':')[1];
    const order = enrichedOrders.find(o => o.record_id === id);
    if (!order) return;
    const newOpt = LOOKUP_OPTIONS['bestellverwaltung']['order_status'].find(o => o.key === newColumn);
    const prev = bestellverwaltung;
    setBestellverwaltung(bs => bs.map(b =>
      b.record_id === id
        ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newOpt?.label ?? newColumn } } }
        : b,
    ));
    undoToast(tt('undo_status'), async () => {
      setBestellverwaltung(prev);
      const currentKey = order.fields.order_status?.key ?? 'neu';
      await LivingAppsService.updateBestellverwaltungEntry(id, { order_status: currentKey });
    });
    LivingAppsService.updateBestellverwaltungEntry(id, { order_status: newColumn })
      .catch(() => { setBestellverwaltung(prev); fetchAll(); });
  }, [enrichedOrders, bestellverwaltung, setBestellverwaltung, fetchAll]);

  const handleCardClick = useCallback((card: KanbanCard) => {
    const id = card.id.split(':')[1];
    const order = enrichedOrders.find(o => o.record_id === id);
    if (order) overlay.replace({ type: 'bestellung', record: order });
  }, [enrichedOrders, overlay]);

  const handleAddCard = useCallback((column: string) => {
    setOrderDefaults({ order_status: column });
    setEditingOrder(undefined);
    setOrderDialogOpen(true);
  }, []);

  // Map markers for delivery locations
  const mapMarkers: MapMarker[] = useMemo(
    () => activeOrders.flatMap(o => {
      const geo = o.fields.delivery_location;
      if (!geo) return [];
      const k = o.fields.order_status?.key;
      const marker: MapMarker = {
        id: `bestellung:${o.record_id}`,
        lat: geo.lat,
        long: geo.long,
        title: o.kundeName || appLabel('kundenverwaltung'),
        subtitle: `${o.fields.delivery_street ?? ''} ${o.fields.delivery_house_number ?? ''}`.trim() || geo.info,
        tone: k === 'unterwegs' ? 'primary' : k === 'bereit_zur_lieferung' ? 'warning' : 'default',
        icon: 'truck',
      };
      return [marker];
    }),
    [activeOrders],
  );

  const contextLine = useMemo(() => {
    if (unassignedOrders.length > 0) return tt('ctx_urgent', { n: unassignedOrders.length });
    return tt('ctx_none');
  }, [unassignedOrders.length]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const firstUnassigned = unassignedOrders[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{contextLine}</p>
        </div>
        <button
          onClick={() => { setOrderDefaults(undefined); setEditingOrder(undefined); setOrderDialogOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('new_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          unassignedOrders.length > 0 && firstUnassigned ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  setEditingOrder(firstUnassigned);
                  setOrderDefaults(undefined);
                  setOrderDialogOpen(true);
                },
              }}
            >
              <b>{namen(unassignedOrders.map(o => o.kundeName))}</b>{' '}
              {tt('hero_title', { n: unassignedOrders.length })}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_active')}
              value={activeOrders.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('kpi_unassigned')}
              value={unassignedOrders.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={unassignedOrders.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === '__unassigned' ? null : '__unassigned')}
              active={statusFilter === '__unassigned'}
            />
            <StatStripItem
              title={tt('kpi_today')}
              value={todayOrders.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={todayOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_drivers')}
              value={availableDrivers.length}
              icon={<IconUser size={16} className="shrink-0" />}
              tone={availableDrivers.length === 0 && activeOrders.length > 0 ? 'warning' : 'success'}
            />
          </StatStrip>
        }
        primary={
          <div className="flex flex-col gap-0">
            {/* Tab bar */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPrimaryView('board')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${primaryView === 'board' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                <IconPackage size={14} className="shrink-0" />
                {tt('board_tab')}
              </button>
              <button
                onClick={() => setPrimaryView('map')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${primaryView === 'map' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                <IconTruck size={14} className="shrink-0" />
                {tt('map_tab')}
              </button>
            </div>

            {primaryView === 'board' ? (
              <KanbanWidget
                columns={kanbanColumns}
                cards={kanbanCards}
                defaultCollapsed={['storniert']}
                onCardClick={handleCardClick}
                onCardMove={handleCardMove}
                onAddCard={handleAddCard}
              />
            ) : (
              <MapWidget
                markers={mapMarkers}
                onMarkerClick={m => {
                  const id = m.id.split(':')[1];
                  const order = enrichedOrders.find(o => o.record_id === id);
                  if (order) overlay.replace({ type: 'bestellung', record: order });
                }}
              />
            )}
          </div>
        }
        aside={
          <>
            <WorkList
              title={tt('aside_urgent')}
              items={urgentUnassignedToday.map(o => ({
                id: o.record_id,
                title: o.kundeName || appLabel('kundenverwaltung'),
                secondLine: (
                  <>
                    <span className="font-medium text-warning">{o.fields.order_status?.label ?? '—'}</span>
                    {o.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(o.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: STATUS_NEXT[o.fields.order_status?.key ?? ''] ? {
                  label: tt('status_advance'),
                  onClick: () => advanceStatus(o),
                } : undefined,
              }))}
              onItemClick={id => {
                const order = enrichedOrders.find(o => o.record_id === id);
                if (order) overlay.replace({ type: 'bestellung', record: order });
              }}
              empty={{
                text: (() => {
                  const next = activeOrders.find(o => o.fields.desired_delivery_time);
                  return next
                    ? `${next.kundeName || appLabel('kundenverwaltung')} · ${formatDateTime(next.fields.desired_delivery_time)}`
                    : tt('empty_orders');
                })(),
                action: { label: tt('new_order'), onClick: () => { setOrderDefaults(undefined); setOrderDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tt('aside_drivers')}
              items={fahrerverwaltung.slice(0, 8).map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim(),
                secondLine: (
                  <>
                    <span className={
                      f.fields.driver_status?.key === 'verfuegbar' ? 'font-medium text-success' :
                      f.fields.driver_status?.key === 'im_einsatz' ? 'font-medium text-primary' : /* i18n-exempt */
                      'font-medium text-muted-foreground'
                    }>
                      {f.fields.driver_status?.label ?? '—'}
                    </span>
                    {f.fields.delivery_zone && (
                      <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                    )}
                  </>
                ),
                action: f.fields.driver_status?.key !== 'im_einsatz' /* i18n-exempt */ ? undefined : {
                  label: tt('driver_free'),
                  onClick: () => {
                    const prev = fahrerverwaltung;
                    const verfuegbarOpt = LOOKUP_OPTIONS['fahrerverwaltung']['driver_status'].find(o => o.key === 'verfuegbar');
                    setFahrerverwaltung(fs => fs.map(dr =>
                      dr.record_id === f.record_id
                        ? { ...dr, fields: { ...dr.fields, driver_status: { key: 'verfuegbar', label: verfuegbarOpt?.label ?? 'Verfügbar' } } }
                        : dr,
                    ));
                    undoToast(tt('undo_driver'), async () => {
                      setFahrerverwaltung(prev);
                      await LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: 'im_einsatz' /* i18n-exempt */ });
                    });
                    LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: 'verfuegbar' })
                      .catch(() => { setFahrerverwaltung(prev); fetchAll(); });
                  },
                },
              }))}
              onItemClick={id => {
                const driver = fahrerverwaltung.find(f => f.record_id === id);
                if (driver) overlay.replace({ type: 'fahrer', record: driver });
              }}
              empty={{
                text: tt('empty_drivers'),
                action: { label: tt('new_driver'), onClick: () => { setEditingDriver(undefined); setDriverDialogOpen(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const o = top.record;
            return (
              <>
                <RecordHeader
                  title={o.kundeName || appLabel('kundenverwaltung')}
                  subtitle={o.fields.order_status?.label}
                  badges={
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      !extractRecordId(o.fields.fahrer) && o.fields.order_status?.key !== 'geliefert' && o.fields.order_status?.key !== 'storniert'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {o.fahrerName || '—'}
                    </span>
                  }
                />
                <BestellverwaltungDetails
                  record={o}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', record: f })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', record: k })}
                />
                {o.fields.delivery_location && (
                  <RecordSection>
                    <MapRouteLinks lat={o.fields.delivery_location.lat} long={o.fields.delivery_location.long} />
                  </RecordSection>
                )}
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = top.record;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedOrders.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setOrderDefaults({ fahrer: f.record_id });
                    setEditingOrder(undefined);
                    setOrderDialogOpen(true);
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim()}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedOrders.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setOrderDefaults({ kunde: k.record_id });
                    setEditingOrder(undefined);
                    setOrderDialogOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const o = top.record;
            const nextKey = STATUS_NEXT[o.fields.order_status?.key ?? ''];
            if (!nextKey) return undefined;
            const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']['order_status'].find(opt => opt.key === nextKey)?.label ?? nextKey;
            return { label: `→ ${nextLabel}`, onClick: () => advanceStatus(o) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            setEditingOrder(top.record);
            setOrderDefaults(undefined);
            setOrderDialogOpen(true);
            overlay.close();
          } else if (top.type === 'fahrer') {
            setEditingDriver(top.record);
            setDriverDialogOpen(true);
            overlay.close();
          } else if (top.type === 'kunde') {
            setEditingCustomer(top.record);
            setCustomerDialogOpen(true);
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={orderDialogOpen}
        onClose={() => { setOrderDialogOpen(false); setEditingOrder(undefined); setOrderDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingOrder) {
            await LivingAppsService.updateBestellverwaltungEntry(editingOrder.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingOrder ? editingOrder.fields : orderDefaults}
        recordId={editingOrder?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={driverDialogOpen}
        onClose={() => { setDriverDialogOpen(false); setEditingDriver(undefined); }}
        onSubmit={async fields => {
          if (editingDriver) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingDriver.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingDriver?.fields}
        recordId={editingDriver?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={customerDialogOpen}
        onClose={() => { setCustomerDialogOpen(false); setEditingCustomer(undefined); }}
        onSubmit={async fields => {
          if (editingCustomer) {
            await LivingAppsService.updateKundenverwaltungEntry(editingCustomer.record_id, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingCustomer?.fields}
        recordId={editingCustomer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </div>
  );
}
