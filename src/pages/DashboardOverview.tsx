import { useState, useMemo, useCallback } from 'react';
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
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import {
  IconAlertTriangle,
  IconTruck,
  IconUsers,
  IconPackage,
  IconCircleCheck,
  IconPlus,
  IconUser,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    hero_title: 'Bereit zur Lieferung — kein Fahrer zugewiesen',
    hero_action: 'Fahrer zuweisen',
    kpi_active: 'Aktive Bestellungen',
    kpi_ready: 'Bereit zur Lieferung',
    kpi_delivered: 'Heute geliefert',
    kpi_drivers: 'Fahrer im Einsatz',
    today_orders: 'Heutige Lieferungen',
    unassigned: 'Ohne Fahrer',
    no_today: 'Keine Lieferungen heute',
    no_unassigned: 'Alle Bestellungen haben Fahrer',
    new_order: 'Neue Bestellung',
    status_advance: '→ Weiterschalten',
    context_line: 'Heute: {n} aktive Bestellungen — {drivers} Fahrer im Einsatz.',
    context_empty: 'Noch keine Bestellungen. Erfasse die erste Lieferung!',
    next_status: 'Weiter',
  },
  en: {
    hero_title: 'Ready for Delivery — no driver assigned',
    hero_action: 'Assign Driver',
    kpi_active: 'Active Orders',
    kpi_ready: 'Ready for Delivery',
    kpi_delivered: 'Delivered Today',
    kpi_drivers: 'Drivers On Duty',
    today_orders: 'Today\'s Deliveries',
    unassigned: 'Without Driver',
    no_today: 'No deliveries today',
    no_unassigned: 'All orders have a driver',
    new_order: 'New Order',
    status_advance: '→ Next Status',
    context_line: 'Today: {n} active orders — {drivers} drivers on duty.',
    context_empty: 'No orders yet. Create the first delivery!',
    next_status: 'Next',
  },
});

// Status pipeline
const STATUS_NEXT: Record<string, string> = {
  neu: 'in_bearbeitung',
  in_bearbeitung: 'bereit_zur_lieferung',
  bereit_zur_lieferung: 'unterwegs',
  unterwegs: 'geliefert',
};

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'default';
}

// Overlay stack item union
type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

export default function DashboardOverview() {
  const {
    kundenverwaltung,
    fahrerverwaltung,
    bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap,
    fahrerverwaltungMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [bestellEditId, setBestellEditId] = useState<string | undefined>();
  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [kundeDialog, setKundeDialog] = useState(false);

  // KPI filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const today = format(clock, 'yyyy-MM-dd');

  // KPIs
  const activeOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s && !['geliefert', 'storniert'].includes(s);
    }),
    [enrichedBestellverwaltung],
  );

  const readyOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [enrichedBestellverwaltung],
  );

  const deliveredToday = useMemo(
    () => enrichedBestellverwaltung.filter(b =>
      lookupKey(b.fields.order_status) === 'geliefert' &&
      b.fields.desired_delivery_time?.startsWith(today),
    ),
    [enrichedBestellverwaltung, today],
  );

  const driversOnDuty = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // Hero: ready orders without a driver
  const readyWithoutDriver = useMemo(
    () => readyOrders.filter(b => !extractRecordId(b.fields.fahrer)),
    [readyOrders],
  );

  // WorkList: today's deliveries (desired_delivery_time = today)
  const todayDeliveries = useMemo(
    () => enrichedBestellverwaltung
      .filter(b => {
        const s = lookupKey(b.fields.order_status);
        return (b.fields.desired_delivery_time?.startsWith(today) || b.fields.order_date?.startsWith(today)) &&
          s && !['geliefert', 'storniert'].includes(s);
      })
      .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung, today],
  );

  // WorkList: unassigned orders (no fahrer, not delivered/cancelled)
  const unassignedOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return !extractRecordId(b.fields.fahrer) && s && !['geliefert', 'storniert'].includes(s);
    }),
    [enrichedBestellverwaltung],
  );

  // Advance status helper — shared by hero, board, worklist
  const advanceStatus = useCallback(async (bestellung: EnrichedBestellverwaltung) => {
    const current = lookupKey(bestellung.fields.order_status);
    const next = current ? STATUS_NEXT[current] : undefined;
    if (!next) return;

    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const prevFields = bestellung.fields;

    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === bestellung.record_id
          ? { ...b, fields: { ...b.fields, order_status: { key: next, label: nextLabel } } }
          : b,
      ),
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: next });
      undoToast(`Status → ${nextLabel}`, async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === bestellung.record_id
              ? { ...b, fields: { ...b.fields, order_status: prevFields.order_status } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, {
          order_status: lookupKey(prevFields.order_status),
        });
      });
    } catch {
      fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // Kanban move card
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = bestellverwaltung.find(x => x.record_id === rid);
    if (!b) return;

    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;

    setBestellverwaltung(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, order_status: { key: newColumn, label: newLabel } } }
          : x,
      ),
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(`Status → ${newLabel}`);
    } catch {
      fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // Kanban columns
  const COLUMNS: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
    })),
    [],
  );

  // Kanban cards (with optional status filter)
  const cards = useMemo<KanbanCard[]>(
    () => {
      const source = statusFilter
        ? enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === statusFilter)
        : enrichedBestellverwaltung;
      return source.map(b => {
        const status = lookupKey(b.fields.order_status) ?? '';
        return {
          id: `bestellung:${b.record_id}`,
          column: status || (COLUMNS[0]?.key ?? ''),
          title: b.kundeName || appLabel('kundenverwaltung'),
          subtitle: b.fields.delivery_street
            ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}`.trim()
            : b.fahrerName || undefined,
          tone: toneForStatus(status),
        };
      });
    },
    [enrichedBestellverwaltung, statusFilter, COLUMNS],
  );

  // Context line
  const contextLine = useMemo(() => {
    if (enrichedBestellverwaltung.length === 0) return tt('context_empty');
    return tt('context_line', { n: String(activeOrders.length), drivers: String(driversOnDuty.length) });
  }, [enrichedBestellverwaltung.length, activeOrders.length, driversOnDuty.length]);

  // ─── All hooks above ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Find record by id for overlay
  const findBestellung = (id: string) => enrichedBestellverwaltung.find(b => b.record_id === id);
  const findFahrer = (id: string) => fahrerverwaltung.find(f => f.record_id === id);
  const findKunde = (id: string) => kundenverwaltung.find(k => k.record_id === id);

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{contextLine}</p>
        </div>
        <button
          onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); }}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          <span className="hidden sm:inline">{tt('new_order')}</span>
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          readyWithoutDriver.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  const b = readyWithoutDriver[0];
                  setBestellDefaults({ order_status: 'bereit_zur_lieferung' });
                  setBestellEditId(b.record_id);
                  setBestellDialog(true);
                },
              }}
            >
              <b>{namen(readyWithoutDriver.map(b => b.kundeName || '?'))}</b> {tt('hero_title')}
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
              onClick={() => setStatusFilter(null)}
              active={statusFilter === null}
            />
            <StatStripItem
              title={tt('kpi_ready')}
              value={readyOrders.length}
              icon={<IconTruck size={16} />}
              tone={readyOrders.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'bereit_zur_lieferung' ? null : 'bereit_zur_lieferung')}
              active={statusFilter === 'bereit_zur_lieferung'}
            />
            <StatStripItem
              title={tt('kpi_delivered')}
              value={deliveredToday.length}
              icon={<IconCircleCheck size={16} />}
              tone={deliveredToday.length > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'geliefert' ? null : 'geliefert')}
              active={statusFilter === 'geliefert'}
            />
            <StatStripItem
              title={tt('kpi_drivers')}
              value={driversOnDuty.length}
              icon={<IconUsers size={16} />}
              tone={driversOnDuty.length > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => {
              const id = card.id.split(':')[1] ?? '';
              overlay.replace({ type: 'bestellung', id });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellDefaults({ order_status: column });
              setBestellEditId(undefined);
              setBestellDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('today_orders')}
              items={todayDeliveries.map(b => ({
                id: b.record_id,
                title: b.kundeName || appLabel('kundenverwaltung'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-primary' : 'text-muted-foreground'}`}>
                      {b.fields.order_status?.label}
                    </span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDate(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: STATUS_NEXT[lookupKey(b.fields.order_status) ?? '']
                  ? { label: tt('next_status'), onClick: () => advanceStatus(b) }
                  : undefined,
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('no_today'),
                action: {
                  label: tt('new_order'),
                  onClick: () => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); },
                },
              }}
            />
            <WorkList
              title={tt('unassigned')}
              items={unassignedOrders.map(b => ({
                id: b.record_id,
                title: b.kundeName || appLabel('kundenverwaltung'),
                secondLine: (
                  <>
                    <span className="font-medium text-warning">
                      {b.fields.order_status?.label}
                    </span>
                    {b.fields.delivery_city && (
                      <span className="text-muted-foreground"> · {b.fields.delivery_city}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('hero_action'),
                  onClick: () => {
                    setBestellDefaults({ order_status: lookupKey(b.fields.order_status) });
                    setBestellEditId(b.record_id);
                    setBestellDialog(true);
                  },
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{ text: tt('no_unassigned') }}
            />
          </>
        }
      />

      {/* ONE RecordOverlayHost for all entity types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = findBestellung(top.id);
            if (!b) return null;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('kundenverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    b.fields.total_amount != null ? (
                      <span className="text-sm font-medium text-foreground">{formatCurrency(b.fields.total_amount)}</span>
                    ) : undefined
                  }
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
            const f = findFahrer(top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()}
                  subtitle={f.fields.driver_status?.label}
                  meta={f.fields.driver_phone ? (
                    <a href={`tel:${f.fields.driver_phone}`} className="text-sm text-primary hover:underline">
                      {f.fields.driver_phone}
                    </a>
                  ) : undefined}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setBestellEditId(undefined);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = findKunde(top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim()}
                  subtitle={k.fields.customer_status?.label}
                  meta={k.fields.phone ? (
                    <a href={`tel:${k.fields.phone}`} className="text-sm text-primary hover:underline">
                      {k.fields.phone}
                    </a>
                  ) : undefined}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: k.record_id });
                    setBestellEditId(undefined);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type !== 'bestellung') return undefined;
          const b = findBestellung(top.id);
          if (!b) return undefined;
          const current = lookupKey(b.fields.order_status);
          const next = current ? STATUS_NEXT[current] : undefined;
          if (!next) return undefined;
          const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
          return { label: `→ ${nextLabel}`, onClick: () => advanceStatus(b) };
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = findBestellung(top.id);
            if (!b) return;
            setBestellDefaults(undefined);
            setBestellEditId(b.record_id);
            setBestellDialog(true);
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => setBestellDialog(false)}
        onSubmit={async fields => {
          if (bestellEditId) {
            await LivingAppsService.updateBestellverwaltungEntry(bestellEditId, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellDefaults}
        recordId={bestellEditId}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />
      <FahrerverwaltungDialog
        open={fahrerDialog}
        onClose={() => setFahrerDialog(false)}
        onSubmit={async fields => {
          await LivingAppsService.createFahrerverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />
      <KundenverwaltungDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
