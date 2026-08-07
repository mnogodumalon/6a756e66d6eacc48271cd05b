import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
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
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog, type FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconTruckDelivery,
  IconAlertTriangle,
  IconUsers,
  IconCircleCheck,
  IconPlus,
  IconCurrencyEuro,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    today: 'Heute',
    in_transit: 'Unterwegs',
    unassigned: 'Ohne Fahrer',
    revenue: 'Umsatz heute',
    hero_title: 'Bestellungen unterwegs ohne Fahrer',
    hero_action: 'Fahrer zuweisen',
    new_order: 'Neue Bestellung',
    due_today: 'Fällig heute',
    drivers: 'Fahrer im Einsatz',
    no_due: 'Alle pünktlich — nächste Lieferung morgen',
    no_drivers: 'Alle Fahrer verfügbar',
    empty_title: 'Erste Bestellung aufnehmen',
    empty_sub: 'Noch keine Bestellungen vorhanden.',
    empty_cta: 'Bestellung erstellen',
    status_advance: 'Weiterschalten',
    context_orders: '{n} Bestellungen heute',
    context_drivers: '{n} Fahrer im Einsatz',
    context_none: 'Keine Bestellungen heute',
    undo_moved: 'Status geändert',
  },
  en: {
    today: 'Today',
    in_transit: 'In Transit',
    unassigned: 'No Driver',
    revenue: "Today's Revenue",
    hero_title: 'Orders in transit without driver',
    hero_action: 'Assign Driver',
    new_order: 'New Order',
    due_today: 'Due Today',
    drivers: 'Drivers on Duty',
    no_due: 'All on time — next delivery tomorrow',
    no_drivers: 'All drivers available',
    empty_title: 'Create your first order',
    empty_sub: 'No orders yet.',
    empty_cta: 'Create order',
    status_advance: 'Advance',
    context_orders: '{n} orders today',
    context_drivers: '{n} drivers on duty',
    context_none: 'No orders today',
    undo_moved: 'Status updated',
  },
  cs: {
    today: 'Dnes',
    in_transit: 'Na cestě',
    unassigned: 'Bez řidiče',
    revenue: 'Tržby dnes',
    hero_title: 'Objednávky na cestě bez řidiče',
    hero_action: 'Přiřadit řidiče',
    new_order: 'Nová objednávka',
    due_today: 'Splatné dnes',
    drivers: 'Řidiči ve službě',
    no_due: 'Vše včas — další doručení zítra',
    no_drivers: 'Všichni řidiči k dispozici',
    empty_title: 'Vytvořte první objednávku',
    empty_sub: 'Zatím žádné objednávky.',
    empty_cta: 'Vytvořit objednávku',
    status_advance: 'Posunout',
    context_orders: '{n} objednávek dnes',
    context_drivers: '{n} řidičů ve službě',
    context_none: 'Žádné objednávky dnes',
    undo_moved: 'Stav aktualizován',
  },
});

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

const STATUS_ORDER: Record<string, number> = {
  neu: 0,
  in_bearbeitung: 1,
  bereit_zur_lieferung: 2,
  unterwegs: 3,
  geliefert: 4,
  storniert: 5,
};

function nextStatus(current: string | undefined): string | null {
  const order = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
  const idx = order.indexOf(current ?? '');
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null; /* i18n-exempt */
}

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'default';
}

export default function DashboardOverview() {
  // Columns from schema — all declared (storniert collapsed, geliefert collapsed)
  // Must be inside component: LOOKUP_OPTIONS labels are locale-aware getters
  const COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
  }));
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedBestellverwaltung | null>(null);
  const [fahrDialogOpen, setFahrDialogOpen] = useState(false);
  const [fahrEditRecord, setFahrEditRecord] = useState<Fahrerverwaltung | null>(null);
  const [fahrCreateDefaults, setFahrCreateDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>();

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const today = format(clock, 'yyyy-MM-dd');

  const todayOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(today);
    }),
    [enrichedBestellverwaltung, today],
  );

  const unterwegsOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const unterwegsOhnefahrer = useMemo(
    () => unterwegsOrders.filter(b => !extractRecordId(b.fields.fahrer)),
    [unterwegsOrders],
  );

  const revenueToday = useMemo(
    () => todayOrders
      .filter(b => lookupKey(b.fields.order_status) === 'geliefert')
      .reduce((s, b) => s + (b.fields.total_amount ?? 0), 0),
    [todayOrders],
  );

  const driversOnDuty = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      [...enrichedBestellverwaltung]
        .sort((a, b) => {
          const ao = STATUS_ORDER[lookupKey(a.fields.order_status) ?? ''] ?? 0;
          const bo2 = STATUS_ORDER[lookupKey(b.fields.order_status) ?? ''] ?? 0;
          return ao - bo2;
        })
        .map(b => {
          const status = lookupKey(b.fields.order_status) ?? 'neu';
          return {
            id: `bestellung:${b.record_id}`,
            column: status,
            title: b.kundeName || appLabel('kundenverwaltung'),
            subtitle: b.fields.delivery_street
              ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}, ${b.fields.delivery_city ?? ''}`
              : b.fahrerName || undefined,
            tone: toneForStatus(status),
          };
        }),
    [enrichedBestellverwaltung],
  );

  const advanceStatus = useCallback(
    async (b: EnrichedBestellverwaltung) => {
      const cur = lookupKey(b.fields.order_status);
      const next = nextStatus(cur);
      if (!next) return;
      const colLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
      const prev = b.fields.order_status;
      setBestellverwaltung(list =>
        list.map(r =>
          r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: { key: next, label: colLabel } } }
            : r,
        ),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
        undoToast(tt('undo_moved'), async () => {
          setBestellverwaltung(list =>
            list.map(r =>
              r.record_id === b.record_id
                ? { ...r, fields: { ...r.fields, order_status: prev } }
                : r,
            ),
          );
          await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: lookupKey(prev) ?? '' }).catch(() => fetchAll());
        });
      } catch {
        fetchAll();
      }
    },
    [setBestellverwaltung, fetchAll],
  );

  const moveCard = useCallback(
    async (cardId: string, newColumn: string) => {
      const rid = cardId.split(':')[1];
      if (!rid) return;
      const record = bestellverwaltung.find(b => b.record_id === rid);
      if (!record) return;
      const cur = lookupKey(record.fields.order_status) ?? 'neu';
      // Block backwards from geliefert
      if (cur === 'geliefert' && newColumn !== 'geliefert') {
        return 'Gelieferte Bestellungen können nicht zurückgeschaltet werden.';
      }
      const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
      const prev = record.fields.order_status;
      setBestellverwaltung(list =>
        list.map(r =>
          r.record_id === rid
            ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: colLabel } } }
            : r,
        ),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
        undoToast(tt('undo_moved'), async () => {
          setBestellverwaltung(list =>
            list.map(r =>
              r.record_id === rid
                ? { ...r, fields: { ...r.fields, order_status: prev } }
                : r,
            ),
          );
          await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prev) ?? '' }).catch(() => fetchAll());
        });
      } catch {
        fetchAll();
      }
    },
    [bestellverwaltung, setBestellverwaltung, fetchAll],
  );

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ───

  const topItem = overlay.top;
  const currentBestellung = topItem?.type === 'bestellung'
    ? enrichedBestellverwaltung.find(b => b.record_id === topItem.id) ?? null
    : null;
  const currentFahrer = topItem?.type === 'fahrer'
    ? fahrerverwaltung.find(f => f.record_id === topItem.id) ?? null
    : null;
  const currentKunde = topItem?.type === 'kunde'
    ? kundenverwaltung.find(k => k.record_id === topItem.id) ?? null
    : null;

  const contextLine = todayOrders.length > 0
    ? `${gruss(clock)} ${tt('context_orders', { n: todayOrders.length })}${driversOnDuty.length > 0 ? ` · ${tt('context_drivers', { n: driversOnDuty.length })}` : ''}`
    : `${gruss(clock)} ${tt('context_none')}`;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{contextLine}</h1>
        </div>
        <button
          onClick={() => { setCreateDefaults(undefined); setCreateOpen(true); }}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('new_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          unterwegsOhnefahrer.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  const first = unterwegsOhnefahrer[0];
                  if (first) {
                    setEditRecord(enrichedBestellverwaltung.find(b => b.record_id === first.record_id) ?? null);
                    setEditOpen(true);
                  }
                },
              }}
            >
              <b>{namen(unterwegsOhnefahrer.map(b => b.kundeName || appLabel('kundenverwaltung')))}</b> {tt('hero_title')}.
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('today')}
              value={todayOrders.length}
              icon={<IconTruckDelivery size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('in_transit')}
              value={unterwegsOrders.length}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
              tone={unterwegsOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('unassigned')}
              value={unterwegsOhnefahrer.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={unterwegsOhnefahrer.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('revenue')}
              value={formatCurrency(revenueToday)}
              icon={<IconCurrencyEuro size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          enrichedBestellverwaltung.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <IconTruckDelivery size={48} className="text-muted-foreground" stroke={1.5} />
              <div>
                <p className="font-semibold text-foreground">{tt('empty_title')}</p>
                <p className="text-sm text-muted-foreground mt-1">{tt('empty_sub')}</p>
              </div>
              <button
                onClick={() => { setCreateDefaults(undefined); setCreateOpen(true); }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {tt('empty_cta')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              cards={cards}
              columns={COLUMNS}
              defaultCollapsed={['geliefert', 'storniert']}
              onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
              onCardMove={moveCard}
              onAddCard={column => {
                setCreateDefaults({ order_status: column });
                setCreateOpen(true);
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tt('due_today')}
              items={todayOrders
                .filter(b => {
                  const s = lookupKey(b.fields.order_status);
                  return s !== 'geliefert' && s !== 'storniert';
                })
                .slice(0, 8)
                .map(b => {
                  const cur = lookupKey(b.fields.order_status);
                  const next = nextStatus(cur);
                  const statusLabel = b.fields.order_status?.label ?? cur ?? '';
                  return {
                    id: b.record_id,
                    title: b.kundeName || appLabel('kundenverwaltung'),
                    secondLine: (
                      <>
                        <span className={cur === 'unterwegs' ? 'font-medium text-primary' : cur === 'neu' ? 'font-medium text-warning' : 'font-medium text-foreground'}>
                          {statusLabel}
                        </span>
                        {b.fahrerName && (
                          <span className="text-muted-foreground"> · {b.fahrerName}</span>
                        )}
                      </>
                    ),
                    action: next
                      ? {
                          label: tt('status_advance'),
                          onClick: () => void advanceStatus(b),
                        }
                      : undefined,
                  };
                })}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('no_due'),
                action: {
                  label: tt('new_order'),
                  onClick: () => { setCreateDefaults(undefined); setCreateOpen(true); },
                },
              }}
            />
            <WorkList
              title={tt('drivers')}
              items={fahrerverwaltung
                .filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz' || lookupKey(f.fields.driver_status) === 'verfuegbar')
                .slice(0, 6)
                .map(f => {
                  const statusKey = lookupKey(f.fields.driver_status);
                  const ordersForDriver = enrichedBestellverwaltung.filter(b => extractRecordId(b.fields.fahrer) === f.record_id && lookupKey(b.fields.order_status) === 'unterwegs');
                  return {
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
                    secondLine: (
                      <>
                        <span className={statusKey === 'im_einsatz' ? 'font-medium text-primary' : 'font-medium text-muted-foreground'}>
                          {f.fields.driver_status?.label ?? statusKey}
                        </span>
                        {ordersForDriver.length > 0 && (
                          <span className="text-muted-foreground"> · {ordersForDriver.length} unterwegs</span>
                        )}
                      </>
                    ),
                  };
                })}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('no_drivers'),
                action: {
                  label: appLabel('fahrerverwaltung'),
                  onClick: () => { setFahrCreateDefaults(undefined); setFahrDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createBestellverwaltungEntry(fields);
          fetchAll();
        }}
        defaultValues={createDefaults}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />
      <BestellverwaltungDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditRecord(null); }}
        onSubmit={async fields => {
          if (!editRecord) return;
          await LivingAppsService.updateBestellverwaltungEntry(editRecord.record_id, fields);
          fetchAll();
        }}
        defaultValues={editRecord?.fields}
        recordId={editRecord?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />
      <FahrerverwaltungDialog
        open={fahrDialogOpen}
        onClose={() => { setFahrDialogOpen(false); setFahrEditRecord(null); }}
        onSubmit={async fields => {
          if (fahrEditRecord) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrEditRecord.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrEditRecord?.fields ?? fahrCreateDefaults}
        recordId={fahrEditRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {/* Overlay stack — ONE shell */}
      <RecordOverlayHost
        overlay={overlay}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(r => r.record_id === top.id);
            if (b) { setEditRecord(b); setEditOpen(true); }
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(r => r.record_id === top.id);
            if (f) { setFahrEditRecord(f); setFahrDialogOpen(true); }
          }
        }}
        render={top => {
          if (top.type === 'bestellung' && currentBestellung) {
            const cur = lookupKey(currentBestellung.fields.order_status);
            const next = nextStatus(cur);
            const nextLabel = next ? COLUMNS.find(c => c.key === next)?.label ?? '' : null;
            return (
              <>
                <RecordHeader
                  title={currentBestellung.kundeName || appLabel('kundenverwaltung')}
                  subtitle={currentBestellung.fields.order_status?.label}
                  badges={
                    currentBestellung.fahrerName ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconUsers size={12} className="shrink-0" />
                        {currentBestellung.fahrerName}
                      </span>
                    ) : undefined
                  }
                />
                <BestellverwaltungDetails
                  record={currentBestellung}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
              </>
            );
          }
          if (top.type === 'fahrer' && currentFahrer) {
            return (
              <>
                <RecordHeader
                  title={`${currentFahrer.fields.driver_first_name ?? ''} ${currentFahrer.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={currentFahrer.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={currentFahrer}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ fahrer: currentFahrer.record_id });
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde' && currentKunde) {
            return (
              <>
                <RecordHeader
                  title={`${currentKunde.fields.first_name ?? ''} ${currentKunde.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={currentKunde.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={currentKunde}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ kunde: currentKunde.record_id });
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung' && currentBestellung) {
            const cur = lookupKey(currentBestellung.fields.order_status);
            const next = nextStatus(cur);
            if (!next) return undefined;
            const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
            return {
              label: `→ ${nextLabel}`,
              onClick: () => {
                void advanceStatus(currentBestellung);
                overlay.close();
              },
            };
          }
          return undefined;
        }}
      />
    </>
  );
}
