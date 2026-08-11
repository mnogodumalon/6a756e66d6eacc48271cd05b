import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { makeT, appLabel, fieldLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog, type FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog, type KundenverwaltungDialogDefaults } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconPackage,
  IconUsers,
  IconTruck,
  IconAlertTriangle,
  IconPlus,
  IconCheck,
  IconClock,
  IconCircleCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    greeting_ctx_many: 'Heute {n} Bestellungen — {names} warten auf Lieferung.',
    greeting_ctx_none: 'Keine offenen Bestellungen. Bereit für neue Aufträge!',
    greeting_ctx_one: 'Heute eine Bestellung — {name} wartet auf Lieferung.',
    orders_active: 'Aktive Bestellungen',
    orders_today: 'Heute erwartet',
    drivers_available: 'Fahrer verfügbar',
    customers_total: 'Kunden',
    hero_unassigned: '{n} {orders} ohne Fahrer — bitte jetzt zuweisen.',
    hero_assign: 'Fahrer zuweisen',
    hero_order: 'Bestellung',
    hero_orders: 'Bestellungen',
    col_neu: 'Neu',
    col_bearbeitung: 'In Bearbeitung',
    col_bereit: 'Bereit',
    col_unterwegs: 'Unterwegs',
    col_geliefert: 'Geliefert',
    col_storniert: 'Storniert',
    worklist_urgent: 'Dringend — ohne Fahrer',
    worklist_today: 'Heute fällig',
    worklist_empty_urgent: 'Alle Bestellungen sind zugewiesen.',
    worklist_empty_today: 'Keine Lieferungen für heute — gut so!',
    assign_driver: 'Fahrer zuweisen',
    mark_delivered: 'Geliefert',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    delivered_toast: 'Als geliefert markiert',
    undo: 'Rückgängig',
    en_greeting_ctx_many: 'Today {n} orders — {names} waiting for delivery.',
    en_greeting_ctx_none: 'No open orders. Ready for new assignments!',
    en_greeting_ctx_one: 'Today one order — {name} waiting for delivery.',
    en_orders_active: 'Active Orders',
    en_orders_today: 'Due Today',
    en_drivers_available: 'Available Drivers',
    en_customers_total: 'Customers',
    en_hero_unassigned: '{n} {orders} without driver — please assign now.',
    en_hero_assign: 'Assign Driver',
    en_hero_order: 'order',
    en_hero_orders: 'orders',
    en_worklist_urgent: 'Urgent — without driver',
    en_worklist_today: 'Due today',
    en_worklist_empty_urgent: 'All orders have assigned drivers.',
    en_worklist_empty_today: 'No deliveries for today — great!',
    en_assign_driver: 'Assign driver',
    en_mark_delivered: 'Delivered',
    en_new_order: 'New order',
    en_new_driver: 'New driver',
    en_delivered_toast: 'Marked as delivered',
    en_undo: 'Undo',
  },
  en: {
    greeting_ctx_many: 'Today {n} orders — {names} waiting for delivery.',
    greeting_ctx_none: 'No open orders. Ready for new assignments!',
    greeting_ctx_one: 'Today one order — {name} waiting for delivery.',
    orders_active: 'Active Orders',
    orders_today: 'Due Today',
    drivers_available: 'Available Drivers',
    customers_total: 'Customers',
    hero_unassigned: '{n} {orders} without driver — please assign now.',
    hero_assign: 'Assign Driver',
    hero_order: 'order',
    hero_orders: 'orders',
    worklist_urgent: 'Urgent — without driver',
    worklist_today: 'Due today',
    worklist_empty_urgent: 'All orders have assigned drivers.',
    worklist_empty_today: 'No deliveries for today — great!',
    assign_driver: 'Assign driver',
    mark_delivered: 'Delivered',
    new_order: 'New order',
    new_driver: 'New driver',
    delivered_toast: 'Marked as delivered',
    undo: 'Undo',
    en_greeting_ctx_many: 'Today {n} orders — {names} waiting for delivery.',
    en_greeting_ctx_none: 'No open orders. Ready for new assignments!',
    en_greeting_ctx_one: 'Today one order — {name} waiting for delivery.',
    en_orders_active: 'Active Orders',
    en_orders_today: 'Due Today',
    en_drivers_available: 'Available Drivers',
    en_customers_total: 'Customers',
    en_hero_unassigned: '{n} {orders} without driver — please assign now.',
    en_hero_assign: 'Assign Driver',
    en_hero_order: 'order',
    en_hero_orders: 'orders',
    en_worklist_urgent: 'Urgent — without driver',
    en_worklist_today: 'Due today',
    en_worklist_empty_urgent: 'All orders have assigned drivers.',
    en_worklist_empty_today: 'No deliveries for today — great!',
    en_assign_driver: 'Assign driver',
    en_mark_delivered: 'Delivered',
    en_new_order: 'New order',
    en_new_driver: 'New driver',
    en_delivered_toast: 'Marked as delivered',
    en_undo: 'Undo',
    col_neu: 'New',
    col_bearbeitung: 'In Progress',
    col_bereit: 'Ready',
    col_unterwegs: 'On the way',
    col_geliefert: 'Delivered',
    col_storniert: 'Cancelled',
  },
});

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'warning';
}

export default function DashboardOverview() {
  const clock = useClock();

  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editingBestellung, setEditingBestellung] = useState<Bestellverwaltung | undefined>();

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>();
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>();

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>();

  // Kanban columns — inside component so locale-aware getters work
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const activeOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s && s !== 'geliefert' && s !== 'storniert';
    }),
    [enrichedBestellverwaltung],
  );

  const todayOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(today);
    }),
    [enrichedBestellverwaltung, today],
  );

  const unassignedOrders = useMemo(
    () => activeOrders.filter(b => !b.fields.fahrer),
    [activeOrders],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  // Context line for greeting
  const contextLine = useMemo(() => {
    const waitingKunden = activeOrders.map(b => b.kundeName).filter(Boolean);
    if (waitingKunden.length === 0) return tt('greeting_ctx_none');
    if (waitingKunden.length === 1) return tt('greeting_ctx_one', { name: waitingKunden[0] });
    return tt('greeting_ctx_many', { n: String(waitingKunden.length), names: namen(waitingKunden) });
  }, [activeOrders]);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? 'neu';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || appLabel('kundenverwaltung'),
          subtitle: b.fields.desired_delivery_time
            ? formatDate(b.fields.desired_delivery_time)
            : b.fields.delivery_city ?? b.fields.delivery_street ?? '',
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung],
  );

  // Advance a bestellung to "geliefert"
  const markDelivered = useCallback(async (b: EnrichedBestellverwaltung) => {
    const prevStatus = b.fields.order_status;
    // Optimistic
    setBestellverwaltung(prev =>
      prev.map(x =>
        x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, order_status: { key: 'geliefert', label: 'Geliefert' } } }
          : x,
      ),
    );
    undoToast(
      tt('delivered_toast'),
      async () => {
        setBestellverwaltung(prev =>
          prev.map(x =>
            x.record_id === b.record_id
              ? { ...x, fields: { ...x.fields, order_status: prevStatus } }
              : x,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: prevStatus?.key ?? undefined });
      },
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'geliefert' });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // Card move handler
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const record = bestellverwaltung.find(b => b.record_id === rid);
    if (!record) return;
    const prevStatus = record.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn } } }
          : b,
      ),
    );
    undoToast(
      `Status → ${COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn}`,
      async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === rid
              ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevStatus?.key ?? undefined });
      },
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll, COLUMNS]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Overlay helpers (below early returns — plain derivations)
  const topItem = overlay.top;
  const currentBestellung = topItem?.type === 'bestellung'
    ? bestellverwaltung.find(b => b.record_id === topItem.id)
    : undefined;
  const currentFahrer = topItem?.type === 'fahrer'
    ? fahrerverwaltung.find(f => f.record_id === topItem.id)
    : undefined;
  const currentKunde = topItem?.type === 'kunde'
    ? kundenverwaltung.find(k => k.record_id === topItem.id)
    : undefined;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-muted-foreground">{contextLine}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => { setEditingFahrer(undefined); setFahrerDefaults(undefined); setFahrerDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('new_driver')}
          </button>
          <button
            onClick={() => { setEditingBestellung(undefined); setBestellungDefaults(undefined); setBestellungDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('new_order')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          unassignedOrders.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_assign'),
                onClick: () => {
                  const first = unassignedOrders[0];
                  setEditingBestellung(first);
                  setBestellungDefaults(first.fields as BestellverwaltungDialogDefaults);
                  setBestellungDialogOpen(true);
                },
              }}
            >
              <b>{namen(unassignedOrders.map(b => b.kundeName).filter(Boolean))}</b>
              {' '}—{' '}
              {tt('hero_unassigned', {
                n: String(unassignedOrders.length),
                orders: unassignedOrders.length === 1 ? tt('hero_order') : tt('hero_orders'),
              })}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('orders_active')}
              value={activeOrders.length}
              icon={<IconPackage size={14} />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('orders_today')}
              value={todayOrders.length}
              icon={<IconClock size={14} />}
              tone={todayOrders.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('drivers_available')}
              value={availableDrivers.length}
              icon={<IconTruck size={14} />}
              tone={availableDrivers.length === 0 ? 'destructive' : availableDrivers.length < 2 ? 'warning' : 'success'}
            />
            <StatStripItem
              title={tt('customers_total')}
              value={kundenverwaltung.length}
              icon={<IconUsers size={14} />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => {
              const id = card.id.split(':')[1] ?? '';
              overlay.replace({ type: 'bestellung', id });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setEditingBestellung(undefined);
              setBestellungDefaults({ order_status: column });
              setBestellungDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('worklist_urgent')}
              items={unassignedOrders.slice(0, 8).map(b => ({
                id: b.record_id,
                title: b.kundeName || appLabel('kundenverwaltung'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tt('worklist_urgent')}</span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDate(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('assign_driver'),
                  onClick: () => {
                    setEditingBestellung(b);
                    setBestellungDefaults(b.fields as BestellverwaltungDialogDefaults);
                    setBestellungDialogOpen(true);
                  },
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{ text: tt('worklist_empty_urgent') }}
            />
            <WorkList
              title={tt('worklist_today')}
              items={todayOrders.slice(0, 8).map(b => {
                const status = lookupKey(b.fields.order_status);
                const isDelivered = status === 'geliefert';
                return {
                  id: b.record_id,
                  title: b.kundeName || appLabel('kundenverwaltung'),
                  secondLine: (
                    <>
                      <span className={isDelivered ? 'font-medium text-success' : 'font-medium text-warning'}>
                        {b.fields.order_status?.label ?? status}
                      </span>
                      {b.fields.desired_delivery_time && (
                        <span className="text-muted-foreground"> · {formatDate(b.fields.desired_delivery_time)}</span>
                      )}
                    </>
                  ),
                  action: !isDelivered ? {
                    label: tt('mark_delivered'),
                    onClick: () => markDelivered(b),
                  } : undefined,
                };
              })}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{ text: tt('worklist_empty_today') }}
            />
          </>
        }
      />

      {/* Overlay stack — ONE host for all entity types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const rec = bestellverwaltung.find(b => b.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={enrichedBestellverwaltung.find(b => b.record_id === rec.record_id)?.kundeName || appLabel('kundenverwaltung')}
                  subtitle={rec.fields.order_status?.label}
                  badges={
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {rec.fields.order_status?.label}
                    </span>
                  }
                />
                <BestellverwaltungDetails
                  record={rec}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
              </>
            );
          }
          if (top.type === 'fahrer') {
            const rec = fahrerverwaltung.find(f => f.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.driver_first_name, rec.fields.driver_last_name].filter(Boolean).join(' ')}
                  subtitle={rec.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={rec}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ fahrer: rec.record_id });
                    setBestellungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const rec = kundenverwaltung.find(k => k.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.first_name, rec.fields.last_name].filter(Boolean).join(' ')}
                  subtitle={rec.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={rec}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ kunde: rec.record_id });
                    setBestellungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const rec = bestellverwaltung.find(b => b.record_id === top.id);
            if (!rec) return undefined;
            const status = lookupKey(rec.fields.order_status);
            if (status === 'geliefert' || status === 'storniert') return undefined;
            if (status === 'unterwegs') {
              const enriched = enrichedBestellverwaltung.find(b => b.record_id === rec.record_id);
              if (enriched) {
                return {
                  label: tt('mark_delivered'),
                  onClick: () => { void markDelivered(enriched); overlay.close(); },
                };
              }
            }
            return {
              label: tt('assign_driver'),
              onClick: () => {
                overlay.close();
                setEditingBestellung(rec);
                setBestellungDefaults(rec.fields as BestellverwaltungDialogDefaults);
                setBestellungDialogOpen(true);
              },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const rec = bestellverwaltung.find(b => b.record_id === top.id);
            if (rec) {
              overlay.close();
              setEditingBestellung(rec);
              setBestellungDefaults(rec.fields as BestellverwaltungDialogDefaults);
              setBestellungDialogOpen(true);
            }
          } else if (top.type === 'fahrer') {
            const rec = fahrerverwaltung.find(f => f.record_id === top.id);
            if (rec) {
              overlay.close();
              setEditingFahrer(rec);
              setFahrerDefaults(rec.fields as FahrerverwaltungDialogDefaults);
              setFahrerDialogOpen(true);
            }
          } else if (top.type === 'kunde') {
            const rec = kundenverwaltung.find(k => k.record_id === top.id);
            if (rec) {
              overlay.close();
              setEditingKunde(rec);
              setKundeDialogOpen(true);
            }
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => { setBestellungDialogOpen(false); setEditingBestellung(undefined); setBestellungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => { setFahrerDialogOpen(false); setEditingFahrer(undefined); setFahrerDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={fahrerDefaults}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => { setKundeDialogOpen(false); setEditingKunde(undefined); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingKunde?.fields as KundenverwaltungDialogDefaults | undefined}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
