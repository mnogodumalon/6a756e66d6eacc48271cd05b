import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
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
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconPackage,
  IconTruckDelivery,
  IconUsers,
  IconAlertTriangle,
  IconPlus,
  IconCheck,
  IconBike,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_prefix: 'Heute',
    context_orders: 'Bestellungen aktiv',
    context_none: 'Kein Auftrag unterwegs — alles ruhig.',
    hero_title: 'Bestellung überfällig',
    hero_btn: 'Als unterwegs markieren',
    kpi_active: 'Aktiv',
    kpi_drivers: 'Fahrer verfügbar',
    kpi_today: 'Heute bestellt',
    kpi_revenue: 'Umsatz heute',
    orders_board: 'Bestellungen',
    aside_drivers: 'Fahrer & Verfügbarkeit',
    aside_customers: 'Neue Kunden',
    create_order: 'Neue Bestellung',
    create_driver: 'Neuer Fahrer',
    chart_title: 'Bestellungen nach Status',
    chart_label: 'Bestellungen',
    driver_available: 'Verfügbar',
    driver_busy: 'Im Einsatz',
    empty_drivers: 'Alle Fahrer im Einsatz',
    empty_customers: 'Noch keine Kunden',
    confirm_delivery: 'Als geliefert bestätigen',
    mark_transit: 'Unterwegs',
    no_orders: 'Noch keine Bestellungen — erste Bestellung aufnehmen',
    bestellung: 'Bestellung',
    geliefert: 'Geliefert',
    bestellungen_betroffen: '{p0} Bestellungen betroffen.',
    lieferzeit_ueberschritten: 'Lieferzeit überschritten.',
  },
  en: {
    context_prefix: 'Today',
    context_orders: 'active orders',
    context_none: 'No orders in transit — all quiet.',
    hero_title: 'Order overdue',
    hero_btn: 'Mark as in transit',
    kpi_active: 'Active',
    kpi_drivers: 'Drivers available',
    kpi_today: 'Ordered today',
    kpi_revenue: 'Revenue today',
    orders_board: 'Orders',
    aside_drivers: 'Drivers & Availability',
    aside_customers: 'New Customers',
    create_order: 'New Order',
    create_driver: 'New Driver',
    chart_title: 'Orders by Status',
    chart_label: 'Orders',
    driver_available: 'Available',
    driver_busy: 'On duty',
    empty_drivers: 'All drivers on duty',
    empty_customers: 'No customers yet',
    confirm_delivery: 'Confirm delivered',
    mark_transit: 'In transit',
    no_orders: 'No orders yet — add the first order',
    bestellung: 'Order',
    geliefert: 'Delivered',
    bestellungen_betroffen: '{p0} orders affected.',
    lieferzeit_ueberschritten: 'Delivery time exceeded.',
  },
});

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'storniert') return 'default';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'in_bearbeitung') return 'warning';
  return 'warning';
}

export default function DashboardOverview() {
  const clock = useClock();
  const {
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  const [createBestellOpen, setCreateBestellOpen] = useState(false);
  const [createBestellDefaults, setCreateBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editBestellRecord, setEditBestellRecord] = useState<EnrichedBestellverwaltung | undefined>(undefined);
  const [createFahrerOpen, setCreateFahrerOpen] = useState(false);
  const [editFahrerRecord, setEditFahrerRecord] = useState<Fahrerverwaltung | undefined>(undefined);
  const [createKundeOpen, setCreateKundeOpen] = useState(false);

  const today = format(clock, 'yyyy-MM-dd');

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () => enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? 'neu';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || b.fields.delivery_street || tt('orders_board'),
        subtitle: b.fields.desired_delivery_time
          ? format(new Date(b.fields.desired_delivery_time), 'dd.MM HH:mm')
          : b.fields.order_date
            ? format(new Date(b.fields.order_date), 'dd.MM HH:mm')
            : undefined,
        tone: toneForStatus(status),
        meta: b.fahrerName || undefined,
      };
    }),
    [enrichedBestellverwaltung],
  );

  const activeStatuses = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs'];
  const activeOrders = useMemo(
    () => bestellverwaltung.filter(b => activeStatuses.includes(lookupKey(b.fields.order_status) ?? '')),
    [bestellverwaltung],
  );

  const todayOrders = useMemo(
    () => bestellverwaltung.filter(b => b.fields.order_date?.startsWith(today)),
    [bestellverwaltung, today],
  );

  const todayRevenue = useMemo(
    () => todayOrders.reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [todayOrders],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const busyDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // overdue = unterwegs but desired_delivery_time in the past
  const overdueOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      if (lookupKey(b.fields.order_status) !== 'unterwegs') return false;
      if (!b.fields.desired_delivery_time) return false;
      return new Date(b.fields.desired_delivery_time) < clock;
    }),
    [enrichedBestellverwaltung, clock],
  );

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const prev = bestellverwaltung.find(b => b.record_id === rid);
    const prevStatus = lookupKey(prev?.fields.order_status) ?? 'neu';
    const prevLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === prevStatus)?.label ?? prevStatus;
    setBestellverwaltung(list =>
      list.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newLabel } } }
          : b
      )
    );
    undoToast(`${prev?.fields.delivery_street ?? tt('bestellung')} → ${newLabel}`, async () => {
      setBestellverwaltung(list =>
        list.map(b =>
          b.record_id === rid
            ? { ...b, fields: { ...b.fields, order_status: { key: prevStatus, label: prevLabel } } }
            : b
        )
      );
      try { await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevStatus }); }
      catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  const advanceToTransit = useCallback(async (b: EnrichedBestellverwaltung) => {
    const prevStatus = lookupKey(b.fields.order_status) ?? 'neu';
    const prevLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === prevStatus)?.label ?? prevStatus;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === 'unterwegs')?.label ?? tt('mark_transit');
    setBestellverwaltung(list =>
      list.map(r =>
        r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: { key: 'unterwegs', label: newLabel } } }
          : r
      )
    );
    undoToast(`${b.kundeName || tt('bestellung')} — ${tt('mark_transit')}`, async () => {
      setBestellverwaltung(list =>
        list.map(r =>
          r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: { key: prevStatus, label: prevLabel } } }
            : r
        )
      );
      try { await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: prevStatus }); }
      catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'unterwegs' });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  const confirmDelivered = useCallback(async (b: EnrichedBestellverwaltung) => {
    const prevStatus = lookupKey(b.fields.order_status) ?? 'neu';
    const prevLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === prevStatus)?.label ?? prevStatus;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === 'geliefert')?.label ?? tt('geliefert');
    setBestellverwaltung(list =>
      list.map(r =>
        r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: { key: 'geliefert', label: newLabel } } }
          : r
      )
    );
    undoToast(`${b.kundeName || tt('bestellung')} — ${tc('abgeschlossen')}`, async () => {
      setBestellverwaltung(list =>
        list.map(r =>
          r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: { key: prevStatus, label: prevLabel } } }
            : r
        )
      );
      try { await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: prevStatus }); }
      catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'geliefert' });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // ─── All hooks above this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const contextLine = activeOrders.length > 0
    ? `${tt('context_prefix')}: ${activeOrders.length} ${tt('context_orders')}${busyDrivers.length > 0 ? ` — ${namen(busyDrivers.map(f => f.fields.driver_first_name ?? ''))} ${tt('driver_busy').toLowerCase()}` : ''}.`
    : tt('context_none');

  const transitOrders = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs');
  const heroOrder = overdueOrders[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{contextLine}</p>
        </div>
        <button
          onClick={() => { setCreateBestellDefaults(undefined); setEditBestellRecord(undefined); setCreateBestellOpen(true); }}
          className="mt-3 sm:mt-0 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('create_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroOrder && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{ label: tt('hero_btn'), onClick: () => advanceToTransit(heroOrder) }}
          >
            <b>{namen(overdueOrders.map(o => o.kundeName || o.fields.delivery_street || ''))}</b>
            {' '}{tt('hero_title').toLowerCase()} —{' '}
            {(overdueOrders.length > 1 ? tt('bestellungen_betroffen', { p0: overdueOrders.length }) : tt('lieferzeit_ueberschritten'))}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_active')}
              value={activeOrders.length}
              icon={<IconPackage size={16} />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_drivers')}
              value={availableDrivers.length}
              icon={<IconBike size={16} />}
              tone={availableDrivers.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tt('kpi_today')}
              value={todayOrders.length}
              icon={<IconTruckDelivery size={16} />}
            />
            <StatStripItem
              title={tt('kpi_revenue')}
              value={formatCurrency(todayRevenue)}
              icon={<IconCheck size={16} />}
              tone={todayRevenue > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => {
              setCreateBestellDefaults({ order_status: column });
              setEditBestellRecord(undefined);
              setCreateBestellOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_drivers')}
              items={fahrerverwaltung.map(f => {
                const statusKey = lookupKey(f.fields.driver_status) ?? '';
                const isAvailable = statusKey === 'verfuegbar';
                const isBusy = statusKey === 'im_einsatz';
                return {
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—',
                  secondLine: (
                    <>
                      <span className={
                        isAvailable ? 'font-medium text-success' :
                        isBusy ? 'font-medium text-primary' :
                        'text-muted-foreground'
                      }>
                        {f.fields.driver_status?.label ?? '—'}
                      </span>
                      {f.fields.vehicle_type && (
                        <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                      )}
                      {f.fields.delivery_zone && (
                        <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                      )}
                    </>
                  ),
                  action: isAvailable ? {
                    label: tt('create_order'),
                    onClick: () => {
                      setCreateBestellDefaults({ fahrer: f.record_id });
                      setEditBestellRecord(undefined);
                      setCreateBestellOpen(true);
                    },
                  } : undefined,
                };
              })}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('empty_drivers'),
                action: { label: tt('create_driver'), onClick: () => { setEditFahrerRecord(undefined); setCreateFahrerOpen(true); } },
              }}
            />

            <ChartWidget
              title={tt('chart_title')}
              rows={bestellverwaltung.map(b => ({
                id: `bestellung:${b.record_id}`,
                data: b,
              }))}
              dimension={{
                kind: 'category',
                accessor: r => r.data.fields.order_status,
              }}
              measure={{
                aggregate: 'sum',
                label: tt('kpi_revenue'),
                value: r => r.data.fields.total_amount ?? null,
                format: 'currency',
              }}
            />
          </>
        }
      />

      {/* Order overlay */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            const statusKey = lookupKey(b.fields.order_status) ?? '';
            const nextAction = statusKey === 'unterwegs'
              ? { label: tt('confirm_delivery'), onClick: () => confirmDelivered(b) }
              : statusKey === 'bereit_zur_lieferung'
                ? { label: tt('hero_btn'), onClick: () => advanceToTransit(b) }
                : undefined;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_street || tt('orders_board')}
                  subtitle={b.fields.order_status?.label}
                  actions={
                    <button
                      onClick={() => { setEditBestellRecord(b); setCreateBestellOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
                {nextAction && (
                  <div className="px-6 pb-4 pt-2">
                    <button
                      onClick={nextAction.onClick}
                      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {nextAction.label}
                    </button>
                  </div>
                )}
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()}
                  subtitle={f.fields.driver_status?.label}
                  actions={
                    <button
                      onClick={() => { setEditFahrerRecord(f); setCreateFahrerOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', id: enriched.record_id });
                  }}
                  onAddBestellverwaltung={() => {
                    setCreateBestellDefaults({ fahrer: f.record_id });
                    setEditBestellRecord(undefined);
                    setCreateBestellOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim()}
                  subtitle={k.fields.customer_status?.label}
                  actions={
                    <button
                      onClick={() => { setCreateKundeOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', id: enriched.record_id });
                  }}
                  onAddBestellverwaltung={() => {
                    setCreateBestellDefaults({ kunde: k.record_id });
                    setEditBestellRecord(undefined);
                    setCreateBestellOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={createBestellOpen}
        onClose={() => { setCreateBestellOpen(false); setEditBestellRecord(undefined); setCreateBestellDefaults(undefined); }}
        onSubmit={async fields => {
          if (editBestellRecord) {
            await LivingAppsService.updateBestellverwaltungEntry(editBestellRecord.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editBestellRecord?.fields ?? createBestellDefaults}
        recordId={editBestellRecord?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={createFahrerOpen}
        onClose={() => { setCreateFahrerOpen(false); setEditFahrerRecord(undefined); }}
        onSubmit={async fields => {
          if (editFahrerRecord) {
            await LivingAppsService.updateFahrerverwaltungEntry(editFahrerRecord.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editFahrerRecord?.fields}
        recordId={editFahrerRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={createKundeOpen}
        onClose={() => setCreateKundeOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenverwaltungEntry(fields);
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
