import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
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
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import { useState, useMemo } from 'react';
import { IconPackage, IconTruck, IconUsers, IconAlertTriangle, IconPlus } from '@tabler/icons-react';

const tt = makeT({
  de: {
    greeting_ctx_none: 'Keine offenen Bestellungen — alles im Zeitplan.',
    greeting_ctx: 'Heute offen: {n} Bestellung(en) unterwegs.',
    hero_msg: 'Bestellung{plural} ohne Fahrer — bitte Fahrer zuweisen.',
    hero_action: 'Fahrer zuweisen',
    new_order: 'Neue Bestellung',
    orders_today: 'Heute erwartet',
    orders_active: 'Aktive Aufträge',
    drivers_available: 'Fahrer verfügbar',
    revenue_today: 'Umsatz heute',
    worklist_title: 'Unterwegs — fällig heute',
    worklist_drivers: 'Fahrerstatus',
    empty_orders: 'Keine Lieferungen heute — jetzt neue Bestellung aufnehmen',
    empty_drivers: 'Kein Fahrer verfügbar',
    assign_driver: 'Fahrer zuweisen',
    mark_delivered: '✓ Geliefert',
    driver_available: 'Verfügbar',
    driver_busy: 'Im Einsatz',
  },
  en: {
    greeting_ctx_none: 'No open orders — everything on schedule.',
    greeting_ctx: 'Today open: {n} order(s) on the way.',
    hero_msg: 'Order{plural} without driver — please assign a driver.',
    hero_action: 'Assign driver',
    new_order: 'New Order',
    orders_today: 'Expected today',
    orders_active: 'Active orders',
    drivers_available: 'Drivers available',
    revenue_today: "Today's revenue",
    worklist_title: 'On the way — due today',
    worklist_drivers: 'Driver status',
    empty_orders: 'No deliveries today — create a new order',
    empty_drivers: 'No driver available',
    assign_driver: 'Assign driver',
    mark_delivered: '✓ Delivered',
    driver_available: 'Available',
    driver_busy: 'On duty',
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
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | undefined>(undefined);

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>(undefined);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>(undefined);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [kundeDefaults, setKundeDefaults] = useState<KundenverwaltungDialogDefaults | undefined>(undefined);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>(undefined);

  // Derived data — all hooks above
  const todayKey = format(clock, 'yyyy-MM-dd');

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? 'neu';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || b.fields.delivery_city || 'Bestellung',
          subtitle: b.fields.desired_delivery_time
            ? formatDate(b.fields.desired_delivery_time)
            : b.fields.order_date
            ? formatDate(b.fields.order_date)
            : undefined,
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung],
  );

  // KPIs
  const activeOrders = useMemo(
    () => bestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s === 'neu' || s === 'in_bearbeitung' || s === 'bereit_zur_lieferung' || s === 'unterwegs';
    }),
    [bestellverwaltung],
  );

  const todayDeliveries = useMemo(
    () => bestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(todayKey);
    }),
    [bestellverwaltung, todayKey],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const todayRevenue = useMemo(
    () => bestellverwaltung
      .filter(b => {
        const s = lookupKey(b.fields.order_status);
        const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
        return s === 'geliefert' && dt.startsWith(todayKey);
      })
      .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [bestellverwaltung, todayKey],
  );

  // Hero: orders "unterwegs" without a driver
  const ordersWithoutDriver = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return (s === 'unterwegs' || s === 'bereit_zur_lieferung') && !extractRecordId(b.fields.fahrer);
    }),
    [enrichedBestellverwaltung],
  );

  // WorkList: orders on the way / due today
  const onTheWayToday = useMemo(
    () => enrichedBestellverwaltung
      .filter(b => {
        const s = lookupKey(b.fields.order_status);
        return s === 'unterwegs';
      })
      .slice(0, 8),
    [enrichedBestellverwaltung],
  );

  // ─── Every hook goes ABOVE this line ───────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ───────────────────────────

  const greeting = gruss(clock);
  const ctxLine = activeOrders.length === 0
    ? tt('greeting_ctx_none')
    : tt('greeting_ctx', { n: activeOrders.length });

  // Advance: mark as delivered (shared write path)
  function markDelivered(b: EnrichedBestellverwaltung) {
    const prev = bestellverwaltung.map(x => x);
    setBestellverwaltung(prev.map(x =>
      x.record_id === b.record_id
        ? { ...x, fields: { ...x.fields, order_status: { key: 'geliefert', label: 'Geliefert' } } }
        : x,
    ));
    LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'geliefert' })
      .catch(() => {
        setBestellverwaltung(prev);
        fetchAll();
      });
    undoToast(
      `${b.kundeName || 'Bestellung'} — ${tc('abgeschlossen')}`,
      () => {
        setBestellverwaltung(prev);
        LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'unterwegs' }).catch(() => fetchAll());
      },
    );
  }

  // Move card on kanban
  async function moveCard(cardId: string, newColumn: string) {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = bestellverwaltung.find(x => x.record_id === rid);
    if (!b) return;
    const prevStatus = lookupKey(b.fields.order_status) ?? '';
    const newLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    setBestellverwaltung(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, order_status: { key: newColumn, label: newLabel } } }
          : x,
      ),
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(
        `${b.fields.delivery_city ?? 'Bestellung'} — ${tc('geaendert')}`,
        () => {
          setBestellverwaltung(prev =>
            prev.map(x =>
              x.record_id === rid
                ? { ...x, fields: { ...x.fields, order_status: { key: prevStatus, label: COLUMNS.find(c => c.key === prevStatus)?.label ?? prevStatus } } }
                : x,
            ),
          );
          LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevStatus }).catch(() => fetchAll());
        },
      );
    } catch {
      fetchAll();
    }
  }

  const heroName = namen(ordersWithoutDriver.map(b => b.kundeName));

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{greeting}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{ctxLine}</p>
        </div>
        <button
          onClick={() => { setBestellungDefaults(undefined); setEditingBestellung(undefined); setBestellungDialogOpen(true); }}
          className="mt-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:mt-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('new_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ordersWithoutDriver.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => {
                const first = ordersWithoutDriver[0];
                if (first) {
                  setEditingBestellung(first);
                  setBestellungDefaults({ ...first.fields });
                  setBestellungDialogOpen(true);
                }
              },
            }}
          >
            <b>{heroName}</b> — {tt('hero_msg', { plural: ordersWithoutDriver.length > 1 ? 'en' : '' })}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('orders_active')}
              value={activeOrders.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('orders_today')}
              value={todayDeliveries.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={todayDeliveries.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('drivers_available')}
              value={availableDrivers.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={availableDrivers.length === 0 ? 'warning' : 'success'}
            />
            <StatStripItem
              title={tt('revenue_today')}
              value={formatCurrency(todayRevenue)}
              tone={todayRevenue > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              if (rid) overlay.replace({ type: 'bestellung', id: rid });
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
              title={tt('worklist_title')}
              items={onTheWayToday.map(b => ({
                id: b.record_id,
                title: b.kundeName || b.fields.delivery_city || 'Bestellung',
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{b.fahrerName || tt('assign_driver')}</span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDate(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('mark_delivered'),
                  onClick: () => markDelivered(b),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('empty_orders'),
                action: {
                  label: tt('new_order'),
                  onClick: () => { setBestellungDefaults(undefined); setEditingBestellung(undefined); setBestellungDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={tt('worklist_drivers')}
              items={fahrerverwaltung.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || 'Fahrer',
                secondLine: (
                  <>
                    <span className={
                      lookupKey(f.fields.driver_status) === 'verfuegbar'
                        ? 'font-medium text-success'
                        : lookupKey(f.fields.driver_status) === 'im_einsatz'
                        ? 'font-medium text-primary'
                        : 'font-medium text-muted-foreground'
                    }>
                      {f.fields.driver_status?.label ?? '—'}
                    </span>
                    {f.fields.vehicle_type && (
                      <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('empty_drivers'),
                action: {
                  label: tc('neu'),
                  onClick: () => { setEditingFahrer(undefined); setFahrerDefaults(undefined); setFahrerDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* ── Overlay stack ── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_city || 'Bestellung'}
                  subtitle={b.fields.order_status?.label}
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || 'Fahrer'}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setEditingBestellung(undefined);
                    setBestellungDefaults({ fahrer: f.record_id });
                    setBestellungDialogOpen(true);
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || 'Kunde'}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setEditingBestellung(undefined);
                    setBestellungDefaults({ kunde: k.record_id });
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
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return undefined;
            const status = lookupKey(b.fields.order_status);
            if (status === 'unterwegs') {
              return { label: tt('mark_delivered'), onClick: () => { markDelivered(b); overlay.close(); } };
            }
            return undefined;
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (b) { setEditingBestellung(b); setBestellungDefaults({ ...b.fields }); setBestellungDialogOpen(true); }
          }
          if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) { setEditingFahrer(f); setFahrerDefaults({ ...f.fields }); setFahrerDialogOpen(true); }
          }
          if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) { setEditingKunde(k); setKundeDefaults({ ...k.fields }); setKundeDialogOpen(true); }
          }
        }}
      />

      {/* ── Dialogs ── */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => setBestellungDialogOpen(false)}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
            undoToast(`${editingBestellung.kundeName || 'Bestellung'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
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
        onClose={() => setFahrerDialogOpen(false)}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
            undoToast(`${editingFahrer.fields.driver_first_name ?? 'Fahrer'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={fahrerDefaults}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => setKundeDialogOpen(false)}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
            undoToast(`${editingKunde.fields.first_name ?? 'Kunde'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={kundeDefaults}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
