import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { lookupKey, formatDateTime, formatCurrency } from '@/lib/formatters';
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
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconTruckDelivery,
  IconAlertTriangle,
  IconUserCheck,
  IconPackage,
  IconPlus,
  IconCircleCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_orders: 'Heute {n} Bestellungen — {drivers} im Einsatz.',
    context_none: 'Noch keine Bestellungen — bereit für den ersten Auftrag!',
    hero_overdue: '{n} Bestellung{suffix} überfällig — sofort weiterschalten.',
    hero_action: 'Weiterschalten',
    kpi_active: 'Aktiv',
    kpi_available_drivers: 'Fahrer verfügbar',
    kpi_today: 'Heute fällig',
    kpi_revenue: 'Umsatz heute',
    worklist_title: 'Heute fällig & unterwegs',
    worklist_drivers: 'Fahrer im Einsatz',
    worklist_empty: 'Keine aktuellen Lieferungen',
    worklist_drivers_empty: 'Alle Fahrer verfügbar',
    action_deliver: '✓ Geliefert',
    action_dispatch: '→ Unterwegs',
    status_prefix: 'Status: ',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    new_customer: 'Neuer Kunde',
    dashboard_title: 'FreshRoute CRM',
  },
  en: {
    context_orders: 'Today {n} orders — {drivers} on the road.',
    context_none: 'No orders yet — ready for the first assignment!',
    hero_overdue: '{n} order{suffix} overdue — advance status now.',
    hero_action: 'Advance status',
    kpi_active: 'Active',
    kpi_available_drivers: 'Drivers available',
    kpi_today: 'Due today',
    kpi_revenue: 'Revenue today',
    worklist_title: 'Due today & en route',
    worklist_drivers: 'Drivers on duty',
    worklist_empty: 'No current deliveries',
    worklist_drivers_empty: 'All drivers available',
    action_deliver: '✓ Delivered',
    action_dispatch: '→ En route',
    status_prefix: 'Status: ',
    new_order: 'New order',
    new_driver: 'New driver',
    new_customer: 'New customer',
    dashboard_title: 'FreshRoute CRM',
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

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editingBestellung, setEditingBestellung] = useState<Bestellverwaltung | null>(null);

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | null>(null);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | null>(null);

  // Status advance
  const STATUS_NEXT: Record<string, string> = {
    neu: 'in_bearbeitung',
    in_bearbeitung: 'bereit_zur_lieferung',
    bereit_zur_lieferung: 'unterwegs',
    unterwegs: 'geliefert',
  };

  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const next = STATUS_NEXT[current];
    if (!next) return;
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const snapshot = b.fields.order_status;
    // Optimistic
    setBestellverwaltung(prev =>
      prev.map(r =>
        r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: { key: next, label: nextLabel } } }
          : r,
      ),
    );
    const name = b.kundeName || b.fields.delivery_street || b.record_id;
    undoToast(`${name} — ${nextLabel}`, async () => {
      setBestellverwaltung(prev =>
        prev.map(r =>
          r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: snapshot } }
            : r,
        ),
      );
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: current });
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
    } catch {
      await fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
    if (!b) return;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const snapshot = b.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(r =>
        r.record_id === rid
          ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: newLabel } } }
          : r,
      ),
    );
    const name = b.kundeName || b.fields.delivery_street || rid;
    undoToast(`${name} — ${newLabel}`, async () => {
      const prevKey = lookupKey(snapshot) ?? 'neu';
      const prevLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === prevKey)?.label ?? prevKey;
      setBestellverwaltung(prev =>
        prev.map(r =>
          r.record_id === rid
            ? { ...r, fields: { ...r.fields, order_status: snapshot } }
            : r,
        ),
      );
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevKey });
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  // Derived data
  const todayKey = format(clock, 'yyyy-MM-dd');

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || b.fields.delivery_street || '—',
          subtitle: b.fields.delivery_city
            ? `${b.fields.delivery_city}${b.fahrerName ? ` · ${b.fahrerName}` : ''}`
            : b.fahrerName || undefined,
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  const activeOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s && !['geliefert', 'storniert'].includes(s);
    }),
    [enrichedBestellverwaltung],
  );

  const overdueOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      if (!s || ['geliefert', 'storniert'].includes(s)) return false;
      const dt = b.fields.desired_delivery_time;
      if (!dt) return false;
      return dt < format(clock, "yyyy-MM-dd'T'HH:mm");
    }),
    [enrichedBestellverwaltung, clock],
  );

  const todayOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date;
      if (!dt) return false;
      return dt.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  const activeDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const todayRevenue = useMemo(
    () => todayOrders
      .filter(b => lookupKey(b.fields.order_status) === 'geliefert')
      .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [todayOrders],
  );

  const urgentOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s === 'unterwegs' || s === 'bereit_zur_lieferung';
    }),
    [enrichedBestellverwaltung],
  );

  // Context line
  const contextLine = useMemo(() => {
    if (enrichedBestellverwaltung.length === 0) return tt('context_none');
    const todayCount = todayOrders.length;
    const driverNames = namen(activeDrivers.map(f => f.fields.driver_first_name ?? ''));
    return tt('context_orders', { n: todayCount, drivers: driverNames || String(activeDrivers.length) });
  }, [enrichedBestellverwaltung, todayOrders, activeDrivers]);

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const openBestellungCreate = (defaults?: BestellverwaltungDialogDefaults) => {
    setEditingBestellung(null);
    setBestellungDefaults(defaults);
    setBestellungDialogOpen(true);
  };

  const openBestellungEdit = (b: Bestellverwaltung) => {
    setEditingBestellung(b);
    setBestellungDefaults(undefined);
    setBestellungDialogOpen(true);
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => openBestellungCreate()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('new_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          overdueOrders.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  const first = overdueOrders[0];
                  if (first) void advanceStatus(first);
                },
              }}
            >
              <b>{namen(overdueOrders.map(b => b.kundeName || b.fields.delivery_street || ''))}</b>
              {' '}{tt('hero_overdue', {
                n: overdueOrders.length,
                suffix: overdueOrders.length === 1 ? '' : 'en',
              })}
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
              title={tt('kpi_today')}
              value={todayOrders.length}
              icon={<IconTruckDelivery size={16} />}
              tone={todayOrders.length > 0 ? 'default' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_available_drivers')}
              value={availableDrivers.length}
              icon={<IconUserCheck size={16} />}
              tone={availableDrivers.length === 0 && fahrerverwaltung.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_revenue')}
              value={formatCurrency(todayRevenue)}
              icon={<IconCircleCheck size={16} />}
              tone={todayRevenue > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert', 'geliefert']}
            onCardClick={card => {
              const id = card.id.split(':')[1] ?? '';
              overlay.replace({ type: 'bestellung', id });
            }}
            onCardMove={moveCard}
            onAddCard={column => openBestellungCreate({ order_status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('worklist_title')}
              items={urgentOrders.map(b => {
                const s = lookupKey(b.fields.order_status) ?? '';
                const isUnterwegs = s === 'unterwegs';
                const statusLabel = b.fields.order_status?.label ?? s;
                return {
                  id: b.record_id,
                  title: b.kundeName || b.fields.delivery_street || '—',
                  secondLine: (
                    <>
                      <span className={`font-medium ${isUnterwegs ? 'text-primary' : 'text-warning'}`}>{statusLabel}</span>
                      {b.fields.desired_delivery_time && (
                        <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                      )}
                    </>
                  ),
                  action: isUnterwegs
                    ? { label: tt('action_deliver'), onClick: () => void advanceStatus(b) }
                    : { label: tt('action_dispatch'), onClick: () => void advanceStatus(b) },
                };
              })}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              max={6}
              empty={{
                text: tt('worklist_empty'),
                action: { label: tt('new_order'), onClick: () => openBestellungCreate() },
              }}
            />
            <WorkList
              title={tt('worklist_drivers')}
              items={activeDrivers.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{f.fields.vehicle_type?.label ?? ''}</span>
                    {f.fields.delivery_zone && (
                      <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              max={5}
              empty={{
                text: tt('worklist_drivers_empty'),
                action: { label: tt('new_driver'), onClick: () => { setEditingFahrer(null); setFahrerDialogOpen(true); } },
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
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return null;
            const enriched = enrichedBestellverwaltung.find(r => r.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.kundeName || b.fields.delivery_street || '—'}
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
            const f = fahrerverwaltung.find(r => r.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—'}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => openBestellungCreate({ fahrer: f.record_id })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = kundenverwaltung.find(r => r.record_id === top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || '—'}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => openBestellungCreate({ kunde: k.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return undefined;
            const s = lookupKey(b.fields.order_status) ?? '';
            const next = STATUS_NEXT[s];
            if (!next) return undefined;
            const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
            return { label: `→ ${nextLabel}`, onClick: () => void advanceStatus(b) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (b) openBestellungEdit(b);
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(r => r.record_id === top.id);
            if (f) { setEditingFahrer(f); setFahrerDialogOpen(true); }
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(r => r.record_id === top.id);
            if (k) { setEditingKunde(k); setKundeDialogOpen(true); }
          }
        }}
      />

      {/* Bestellung Dialog */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => setBestellungDialogOpen(false)}
        onSubmit={async (fields) => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingBestellung?.fields ?? bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      {/* Fahrer Dialog */}
      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => setFahrerDialogOpen(false)}
        onSubmit={async (fields) => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingFahrer?.fields}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {/* Kunde Dialog */}
      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => setKundeDialogOpen(false)}
        onSubmit={async (fields) => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
