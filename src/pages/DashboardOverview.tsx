import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import type { FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconTruck,
  IconUsers,
  IconPackage,
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconBike,
} from '@tabler/icons-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    context_empty: 'Noch keine Bestellungen — richte deine erste Route ein.',
    no_driver: 'Kein Fahrer',
    setup_hint: 'Füge Fahrer und Bestellungen hinzu, um dein Dashboard zu befüllen.',
    context_orders: '{n} aktive Bestellungen heute',
    context_riders: '{n} Fahrer verfügbar',
    kpi_active: 'Aktiv',
    kpi_urgent: 'Unterwegs',
    kpi_ready: 'Bereit',
    kpi_drivers: 'Verfügbare Fahrer',
    hero_title: '{n} Bestellung(en) bereit zur Lieferung — kein Fahrer zugewiesen',
    hero_action: 'Fahrer zuweisen',
    list_urgent: 'Unterwegs & fällig',
    list_drivers: 'Fahrer im Einsatz',
    driver_empty: 'Alle Fahrer verfügbar',
    order_empty: 'Keine Bestellungen unterwegs',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    advance_delivered: '✓ Geliefert',
    advance_on_way: '→ Unterwegs',
    undo_delivered: 'Bestellung als geliefert markiert',
    undo_on_way: 'Bestellung auf Unterwegs gesetzt',
    undo_move: 'Status geändert',
  },
  en: {
    context_empty: 'No orders yet — set up your first route.',
    no_driver: 'No Driver',
    setup_hint: 'Add drivers and orders to fill your dashboard.',
    context_orders: '{n} active orders today',
    context_riders: '{n} drivers available',
    kpi_active: 'Active',
    kpi_urgent: 'En Route',
    kpi_ready: 'Ready',
    kpi_drivers: 'Available Drivers',
    hero_title: '{n} order(s) ready for delivery — no driver assigned',
    hero_action: 'Assign Driver',
    list_urgent: 'En Route & Due',
    list_drivers: 'Drivers On Duty',
    driver_empty: 'All drivers available',
    order_empty: 'No orders on the way',
    new_order: 'New Order',
    new_driver: 'New Driver',
    advance_delivered: '✓ Delivered',
    advance_on_way: '→ En Route',
    undo_delivered: 'Order marked as delivered',
    undo_on_way: 'Order set to en route',
    undo_move: 'Status changed',
  },
  cs: {
    context_empty: 'Zatím žádné objednávky — nastavte první trasu.',
    no_driver: 'Žádný řidič',
    setup_hint: 'Přidejte řidiče a objednávky pro naplnění dashboardu.',
    context_orders: '{n} aktivních objednávek dnes',
    context_riders: '{n} dostupných řidičů',
    kpi_active: 'Aktivní',
    kpi_urgent: 'Na cestě',
    kpi_ready: 'Připraveno',
    kpi_drivers: 'Dostupní řidiči',
    hero_title: '{n} objednávka(ek) připravena k doručení — není přiřazen řidič',
    hero_action: 'Přiřadit řidiče',
    list_urgent: 'Na cestě & splatné',
    list_drivers: 'Řidiči ve službě',
    driver_empty: 'Všichni řidiči jsou dostupní',
    order_empty: 'Žádné objednávky na cestě',
    new_order: 'Nová objednávka',
    new_driver: 'Nový řidič',
    advance_delivered: '✓ Doručeno',
    advance_on_way: '→ Na cestě',
    undo_delivered: 'Objednávka označena jako doručena',
    undo_on_way: 'Objednávka nastavena na cestě',
    undo_move: 'Stav změněn',
  },
});

// ── Kanban columns ────────────────────────────────────────────────────────────
const COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

// ── Overlay union ─────────────────────────────────────────────────────────────
type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

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

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const [bestellungOpen, setBestellungOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | null>(null);

  const [fahrerOpen, setFahrerOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>();
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | null>(null);

  const [kundeOpen, setKundeOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | null>(null);

  // ── Overlay stack ──────────────────────────────────────────────────────────
  const overlay = useRecordOverlayStack<OverlayItem>();

  // ── Kanban cards ───────────────────────────────────────────────────────────
  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || appLabel('kundenverwaltung'),
          subtitle: b.fields.delivery_street
            ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}`.trim()
            : (b.fields.desired_delivery_time ? formatDateTime(b.fields.desired_delivery_time) : undefined),
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung],
  );

  // ── Status-advance helper (shared by HeroBanner, WorkList, overlay footer) ─
  const advanceToDelivered = useCallback(
    async (b: EnrichedBestellverwaltung) => {
      const prev = b.fields.order_status;
      setBestellverwaltung(curr =>
        curr.map(x =>
          x.record_id === b.record_id
            ? { ...x, fields: { ...x.fields, order_status: { key: 'geliefert', label: COLUMNS.find(c => c.key === 'geliefert')?.label ?? 'geliefert' } } }
            : x,
        ),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'geliefert' });
        undoToast(tt('undo_delivered'), async () => {
          setBestellverwaltung(curr =>
            curr.map(x =>
              x.record_id === b.record_id
                ? { ...x, fields: { ...x.fields, order_status: prev } }
                : x,
            ),
          );
          await LivingAppsService.updateBestellverwaltungEntry(b.record_id, {
            order_status: prev ? (typeof prev === 'object' ? prev.key : prev) : 'unterwegs',
          });
        });
      } catch {
        await fetchAll();
      }
    },
    [setBestellverwaltung, fetchAll],
  );

  const advanceToOnWay = useCallback(
    async (b: EnrichedBestellverwaltung) => {
      const prev = b.fields.order_status;
      setBestellverwaltung(curr =>
        curr.map(x =>
          x.record_id === b.record_id
            ? { ...x, fields: { ...x.fields, order_status: { key: 'unterwegs', label: COLUMNS.find(c => c.key === 'unterwegs')?.label ?? 'unterwegs' } } }
            : x,
        ),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'unterwegs' });
        undoToast(tt('undo_on_way'), async () => {
          setBestellverwaltung(curr =>
            curr.map(x =>
              x.record_id === b.record_id
                ? { ...x, fields: { ...x.fields, order_status: prev } }
                : x,
            ),
          );
          await LivingAppsService.updateBestellverwaltungEntry(b.record_id, {
            order_status: prev ? (typeof prev === 'object' ? prev.key : prev) : 'bereit_zur_lieferung',
          });
        });
      } catch {
        await fetchAll();
      }
    },
    [setBestellverwaltung, fetchAll],
  );

  // ── onCardMove (optimistic + undo) ─────────────────────────────────────────
  const moveCard = useCallback(
    async (cardId: string, newColumn: string) => {
      const rid = cardId.split(':')[1];
      if (!rid) return;
      const target = bestellverwaltung.find(b => b.record_id === rid);
      if (!target) return;
      const prevStatus = target.fields.order_status;
      const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
      setBestellverwaltung(curr =>
        curr.map(b =>
          b.record_id === rid
            ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: colLabel } } }
            : b,
        ),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
        undoToast(tt('undo_move'), async () => {
          setBestellverwaltung(curr =>
            curr.map(b =>
              b.record_id === rid
                ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
                : b,
            ),
          );
          await LivingAppsService.updateBestellverwaltungEntry(rid, {
            order_status: prevStatus ? (typeof prevStatus === 'object' ? prevStatus.key : prevStatus) : newColumn,
          });
        });
      } catch {
        await fetchAll();
      }
    },
    [bestellverwaltung, setBestellverwaltung, fetchAll],
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const activeOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s && s !== 'geliefert' && s !== 'storniert';
    }),
    [enrichedBestellverwaltung],
  );
  const onWayOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );
  const readyOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [enrichedBestellverwaltung],
  );
  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  // Hero: orders ready but no driver assigned
  const readyNoDriver = useMemo(
    () => readyOrders.filter(b => !extractRecordId(b.fields.fahrer)),
    [readyOrders],
  );

  // WorkList items: on-way orders
  const onWayItems = useMemo(
    () =>
      onWayOrders.map(b => {
        const enriched = enrichedBestellverwaltung.find(e => e.record_id === b.record_id)!;
        return {
          id: b.record_id,
          title: enriched.kundeName || appLabel('kundenverwaltung'),
          secondLine: (
            <span className="text-muted-foreground text-xs">
              {enriched.fahrerName
                ? <span className="font-medium text-primary">{enriched.fahrerName}</span>
                : <span className="text-warning">{tt('no_driver')}</span>}
              {b.fields.desired_delivery_time && (
                <span> · {formatDateTime(b.fields.desired_delivery_time)}</span>
              )}
            </span>
          ),
          action: {
            label: tt('advance_delivered'),
            onClick: () => void advanceToDelivered(enriched),
          },
        };
      }),
    [onWayOrders, enrichedBestellverwaltung, advanceToDelivered],
  );

  // WorkList items: active drivers (im_einsatz)
  const activeDriverItems = useMemo(
    () =>
      fahrerverwaltung
        .filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz')
        .map(f => {
          const myOrders = bestellverwaltung.filter(
            b => extractRecordId(b.fields.fahrer) === f.record_id && lookupKey(b.fields.order_status) === 'unterwegs',
          );
          return {
            id: f.record_id,
            title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
            secondLine: (
              <span className="text-muted-foreground text-xs">
                <span className="font-medium text-primary">{f.fields.vehicle_type?.label ?? '—'}</span>
                {myOrders.length > 0 && <span> · {myOrders.length} Bestellung(en)</span>}
              </span>
            ),
          };
        }),
    [fahrerverwaltung, bestellverwaltung],
  );

  // ── Context line ───────────────────────────────────────────────────────────
  const contextLine = useMemo(() => {
    if (bestellverwaltung.length === 0) return tt('context_empty');
    const names = onWayOrders.length > 0
      ? namen(onWayOrders.map(b => {
          const e = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
          return e?.kundeName ?? '';
        }))
      : null;
    const driverPart = availableDrivers.length > 0
      ? tt('context_riders', { n: availableDrivers.length })
      : null;
    const orderPart = names
      ? `${names} unterwegs`
      : tt('context_orders', { n: activeOrders.length });
    return [orderPart, driverPart].filter(Boolean).join(' · ');
  }, [bestellverwaltung.length, onWayOrders, enrichedBestellverwaltung, availableDrivers.length, activeOrders.length, clock]);

  // ─── All hooks above — early returns below ────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Overlay helpers ────────────────────────────────────────────────────────
  const overlayBestellung = (id: string) => overlay.push({ type: 'bestellung', id });
  const overlayFahrer = (id: string) => overlay.push({ type: 'fahrer', id });
  const overlayKunde = (id: string) => overlay.push({ type: 'kunde', id });

  const currentBestellung = overlay.top?.type === 'bestellung'
    ? (bestellverwaltung.find(b => b.record_id === overlay.top!.id) ?? null)
    : null;
  const currentFahrer = overlay.top?.type === 'fahrer'
    ? (fahrerverwaltung.find(f => f.record_id === overlay.top!.id) ?? null)
    : null;
  const currentKunde = overlay.top?.type === 'kunde'
    ? (kundenverwaltung.find(k => k.record_id === overlay.top!.id) ?? null)
    : null;

  // Derive enriched for overlay footer
  const currentEnrichedBestellung = currentBestellung
    ? enrichedBestellverwaltung.find(e => e.record_id === currentBestellung.record_id) ?? null
    : null;

  const overlayFooterAction = (() => {
    if (!currentBestellung) return undefined;
    const s = lookupKey(currentBestellung.fields.order_status);
    if (s === 'bereit_zur_lieferung') {
      return { label: tt('advance_on_way'), onClick: () => { if (currentEnrichedBestellung) void advanceToOnWay(currentEnrichedBestellung); overlay.close(); } };
    }
    if (s === 'unterwegs') {
      return { label: tt('advance_delivered'), onClick: () => { if (currentEnrichedBestellung) void advanceToDelivered(currentEnrichedBestellung); overlay.close(); } };
    }
    return undefined;
  })();

  // Empty state
  if (bestellverwaltung.length === 0 && fahrerverwaltung.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="rounded-2xl bg-primary/10 p-5">
          <IconTruck size={48} className="text-primary" stroke={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">{tt('context_empty')}</h2>
          <p className="text-muted-foreground max-w-xs">{tt('setup_hint')}</p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            onClick={() => { setBestellungDefaults(undefined); setEditingBestellung(null); setBestellungOpen(true); }}
          >
            <IconPlus size={16} />
            {tt('new_order')}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            onClick={() => { setFahrerDefaults(undefined); setEditingFahrer(null); setFahrerOpen(true); }}
          >
            <IconBike size={16} />
            {tt('new_driver')}
          </button>
        </div>
        <BestellverwaltungDialog
          open={bestellungOpen}
          onClose={() => setBestellungOpen(false)}
          onSubmit={async (fields) => { await LivingAppsService.createBestellverwaltungEntry(fields); fetchAll(); }}
          defaultValues={bestellungDefaults}
          fahrerverwaltungList={fahrerverwaltung}
          kundenverwaltungList={kundenverwaltung}
          enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
        />
        <FahrerverwaltungDialog
          open={fahrerOpen}
          onClose={() => setFahrerOpen(false)}
          onSubmit={async (fields) => { await LivingAppsService.createFahrerverwaltungEntry(fields); fetchAll(); }}
          defaultValues={fahrerDefaults}
          enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{contextLine}</p>
        </div>
        <button
          className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          onClick={() => { setBestellungDefaults(undefined); setEditingBestellung(null); setBestellungOpen(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          <span className="hidden sm:inline">{tt('new_order')}</span>
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          readyNoDriver.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  setEditingBestellung(enrichedBestellverwaltung.find(e => e.record_id === readyNoDriver[0].record_id) ?? null);
                  setBestellungDefaults(readyNoDriver[0].fields as BestellverwaltungDialogDefaults);
                  setBestellungOpen(true);
                },
              }}
            >
              <b>{tt('hero_title', { n: readyNoDriver.length })}</b>
              {readyNoDriver[0].fields.delivery_street && (
                <span> — {readyNoDriver[0].fields.delivery_street} {readyNoDriver[0].fields.delivery_house_number ?? ''}</span>
              )}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_active')}
              value={activeOrders.length}
              icon={<IconPackage size={16} />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_urgent')}
              value={onWayOrders.length}
              icon={<IconTruck size={16} />}
              tone={onWayOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_ready')}
              value={readyOrders.length}
              icon={<IconCheck size={16} />}
              tone={readyOrders.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_drivers')}
              value={availableDrivers.length}
              icon={<IconUsers size={16} />}
              tone={availableDrivers.length > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => overlayBestellung(card.id.split(':')[1] ?? '')}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellungDefaults({ order_status: column } as BestellverwaltungDialogDefaults);
              setEditingBestellung(null);
              setBestellungOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('list_urgent')}
              items={onWayItems}
              onItemClick={id => overlayBestellung(id)}
              empty={{
                text: tt('order_empty'),
                action: {
                  label: tt('new_order'),
                  onClick: () => { setBestellungDefaults(undefined); setEditingBestellung(null); setBestellungOpen(true); },
                },
              }}
            />
            <WorkList
              title={tt('list_drivers')}
              items={activeDriverItems}
              onItemClick={id => overlayFahrer(id)}
              empty={{
                text: tt('driver_empty'),
                action: {
                  label: tt('new_driver'),
                  onClick: () => { setFahrerDefaults(undefined); setEditingFahrer(null); setFahrerOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellungOpen}
        onClose={() => { setBestellungOpen(false); setEditingBestellung(null); setBestellungDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingBestellung ? editingBestellung.fields as BestellverwaltungDialogDefaults : bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerOpen}
        onClose={() => { setFahrerOpen(false); setEditingFahrer(null); setFahrerDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingFahrer ? editingFahrer.fields as FahrerverwaltungDialogDefaults : fahrerDefaults}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeOpen}
        onClose={() => { setKundeOpen(false); setEditingKunde(null); }}
        onSubmit={async (fields) => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />

      {/* Overlay host — one shell for all entities */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            const enriched = enrichedBestellverwaltung.find(e => e.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.kundeName || appLabel('kundenverwaltung')}
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
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ fahrer: f.record_id } as BestellverwaltungDialogDefaults);
                    setEditingBestellung(null);
                    setBestellungOpen(true);
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ kunde: k.record_id } as BestellverwaltungDialogDefaults);
                    setEditingBestellung(null);
                    setBestellungOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return undefined;
            const s = lookupKey(b.fields.order_status);
            const enriched = enrichedBestellverwaltung.find(e => e.record_id === top.id);
            if (s === 'bereit_zur_lieferung' && enriched) {
              return { label: tt('advance_on_way'), onClick: () => { void advanceToOnWay(enriched); overlay.close(); } };
            }
            if (s === 'unterwegs' && enriched) {
              return { label: tt('advance_delivered'), onClick: () => { void advanceToDelivered(enriched); overlay.close(); } };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const enriched = enrichedBestellverwaltung.find(e => e.record_id === top.id);
            if (enriched) {
              setEditingBestellung(enriched);
              setBestellungDefaults(undefined);
              setBestellungOpen(true);
              overlay.close();
            }
          }
          if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) {
              setEditingFahrer(f);
              setFahrerDefaults(undefined);
              setFahrerOpen(true);
              overlay.close();
            }
          }
          if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) {
              setEditingKunde(k);
              setKundeOpen(true);
              overlay.close();
            }
          }
        }}
      />
    </>
  );
}
