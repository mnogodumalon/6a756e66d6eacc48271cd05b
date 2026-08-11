import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
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
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { IconPackage, IconTruck, IconUsers, IconAlertTriangle, IconCheck, IconPlus, IconUser } from '@tabler/icons-react';
import { format } from 'date-fns';

// ─── i18n ──────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    ctx_ok: 'Alle Bestellungen im Zeitplan.',
    ctx_overdue: '{n} Bestellung{s} ohne Fahrer — sofort zuweisen.',
    ctx_active: '{n} aktive Lieferung{s} unterwegs.',
    kpi_total: 'Bestellungen heute',
    kpi_active: 'Unterwegs',
    kpi_open: 'Offen',
    kpi_drivers: 'Fahrer verfügbar',
    hero_title: '{names} ohne Fahrer',
    hero_action: 'Fahrer zuweisen',
    list_urgent: 'Dringend & unzugestellt',
    list_drivers: 'Fahrer im Einsatz',
    neue_bestellung: 'Neue Bestellung',
    neuer_fahrer: 'Neuer Fahrer',
    empty_orders: 'Erste Bestellung erfassen',
    empty_drivers: 'Keiner im Einsatz',
    empty_orders_cta: 'Bestellung aufnehmen',
    assign_driver: 'Fahrer zuweisen',
    delivered: 'Als geliefert markieren',
    next_order: 'Nächste Bestellung',
    no_driver: 'Kein Fahrer',
    driver_zone: 'Zone: {zone}',
    bestellung: 'Bestellung',
    bestellungen: 'Bestellungen',
    ohne_fahrer: 'ohne Fahrer.',
    unterwegs: '→ Unterwegs',
    bereit: '→ Bereit',
    bearbeiten: '→ Bearbeiten',
    tour: 'Tour',
  },
  en: {
    ctx_ok: 'All orders on schedule.',
    ctx_overdue: '{n} order{s} without driver — assign now.',
    ctx_active: '{n} active deliver{s} on the way.',
    kpi_total: "Today's orders",
    kpi_active: 'On the way',
    kpi_open: 'Open',
    kpi_drivers: 'Drivers available',
    hero_title: '{names} without driver',
    hero_action: 'Assign driver',
    list_urgent: 'Urgent & undelivered',
    list_drivers: 'Drivers on duty',
    neue_bestellung: 'New Order',
    neuer_fahrer: 'New Driver',
    empty_orders: 'Create first order',
    empty_drivers: 'None on duty',
    empty_orders_cta: 'Add order',
    assign_driver: 'Assign driver',
    delivered: 'Mark as delivered',
    next_order: 'Next order',
    no_driver: 'No driver',
    driver_zone: 'Zone: {zone}',
    bestellung: 'Order',
    bestellungen: 'Orders',
    ohne_fahrer: 'without Driver.',
    unterwegs: '→ En Route',
    bereit: '→ Ready',
    bearbeiten: '→ Edit',
    tour: 'Tour',
  },
});

// Tone mapping for order status
function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'default';
}

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [createBestellOpen, setCreateBestellOpen] = useState(false);
  const [createFahrerOpen, setCreateFahrerOpen] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editBestellRecord, setEditBestellRecord] = useState<Bestellverwaltung | null>(null);

  // ─── ALL hooks ABOVE early-returns ─────────────────────────────────────

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const todayKey = format(clock, 'yyyy-MM-dd');

  const todayOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const d = b.fields.order_date ?? b.fields.desired_delivery_time ?? '';
      return d.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  const unterwegsOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const openOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s === 'neu' || s === 'in_bearbeitung' || s === 'bereit_zur_lieferung';
    }),
    [enrichedBestellverwaltung],
  );

  // Orders without a driver assigned that are not yet delivered/cancelled
  const ohnefahrer = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return !b.fields.fahrer && s !== 'geliefert' && s !== 'storniert';
    }),
    [enrichedBestellverwaltung],
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const activeDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // Kanban columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: (() => {
        if (o.key === 'geliefert') return 'success' as KanbanTone;
        if (o.key === 'unterwegs') return 'primary' as KanbanTone;
        if (o.key === 'bereit_zur_lieferung') return 'warning' as KanbanTone;
        if (o.key === 'storniert') return 'default' as KanbanTone;
        return 'default' as KanbanTone;
      })(),
    })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? 'neu';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || b.fields.delivery_city || tt('bestellung'),
          subtitle: b.fields.desired_delivery_time
            ? formatDateTime(b.fields.desired_delivery_time)
            : b.fahrerName || tt('no_driver'),
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung],
  );

  // Advance a bestellung to the next status
  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const idx = statusOrder.indexOf(current);
    if (idx < 0 || idx >= statusOrder.length - 1) return;
    const nextStatus = statusOrder[idx + 1];
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
    const snapshot = [...bestellverwaltung];
    // Optimistic update
    setBestellverwaltung(prev => prev.map(r =>
      r.record_id === b.record_id
        ? { ...r, fields: { ...r.fields, order_status: { key: nextStatus, label: nextLabel } } }
        : r,
    ));
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: nextStatus });
      undoToast(`${b.kundeName || tt('bestellung')} — ${nextLabel}`, async () => {
        setBestellverwaltung(snapshot);
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: current });
      });
    } catch {
      fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll, COLUMNS]);

  const onCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = bestellverwaltung.find(r => r.record_id === rid);
    if (!b) return;
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    if (current === newColumn) return;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const snapshot = [...bestellverwaltung];
    setBestellverwaltung(prev => prev.map(r =>
      r.record_id === rid
        ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: newLabel } } }
        : r,
    ));
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      const displayName = enrichedBestellverwaltung.find(e => e.record_id === rid)?.kundeName || tt('bestellung');
      undoToast(`${displayName} — ${newLabel}`, async () => {
        setBestellverwaltung(snapshot);
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: current });
      });
    } catch {
      fetchAll();
    }
  }, [bestellverwaltung, enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Below: plain derivations only ─────────────────────────────────────

  const contextLine = ohnefahrer.length > 0
    ? tt('ctx_overdue', { n: ohnefahrer.length, s: ohnefahrer.length !== 1 ? 'en' : '' })
    : unterwegsOrders.length > 0
    ? tt('ctx_active', { n: unterwegsOrders.length, s: unterwegsOrders.length !== 1 ? 'en' : '' })
    : tt('ctx_ok');

  // Urgent list: open orders without driver or today's delivery
  const urgentOrders = enrichedBestellverwaltung
    .filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s !== 'geliefert' && s !== 'storniert';
    })
    .sort((a, b) => {
      // Sort: without driver first, then by desired delivery time
      const aHasDriver = !!a.fields.fahrer;
      const bHasDriver = !!b.fields.fahrer;
      if (!aHasDriver && bHasDriver) return -1;
      if (aHasDriver && !bHasDriver) return 1;
      return (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '');
    })
    .slice(0, 8);

  const isEmpty = bestellverwaltung.length === 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextLine}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setBestellDefaults(undefined); setEditBestellRecord(null); setCreateBestellOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('neue_bestellung')}
          </button>
          <button
            onClick={() => setCreateFahrerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors shrink-0"
          >
            <IconUser size={16} className="shrink-0" />
            {tt('neuer_fahrer')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ohnefahrer.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => {
                const first = ohnefahrer[0];
                if (first) overlay.replace({ type: 'bestellung', id: first.record_id });
              },
            }}
          >
            <b>{namen(ohnefahrer.map(b => b.kundeName || tt('bestellung')))}</b> {tt('hero_title', { names: '' }).replace('{names} ', '')} — {ohnefahrer.length} {(ohnefahrer.length === 1 ? tt('bestellung') : tt('bestellungen'))} {tt('ohne_fahrer')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_total')}
              value={todayOrders.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('kpi_active')}
              value={unterwegsOrders.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_open')}
              value={openOrders.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={ohnefahrer.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_drivers')}
              value={availableDrivers.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={availableDrivers.length === 0 ? 'warning' : 'success'}
            />
          </StatStrip>
        }
        primary={
          isEmpty ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border border-dashed">
              <IconPackage size={48} className="text-muted-foreground" stroke={1.5} />
              <div className="text-center">
                <p className="font-medium">{tt('empty_orders')}</p>
                <p className="text-sm text-muted-foreground mt-1">{contextLine}</p>
              </div>
              <button
                onClick={() => setCreateBestellOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <IconPlus size={16} className="shrink-0" />
                {tt('empty_orders_cta')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              columns={COLUMNS}
              cards={cards}
              defaultCollapsed={['storniert']}
              onCardClick={card => {
                const id = card.id.split(':')[1];
                if (id) overlay.replace({ type: 'bestellung', id });
              }}
              onCardMove={onCardMove}
              onAddCard={column => {
                setBestellDefaults({ order_status: column });
                setEditBestellRecord(null);
                setCreateBestellOpen(true);
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tt('list_urgent')}
              items={urgentOrders.map(b => ({
                id: b.record_id,
                title: b.kundeName || b.fields.delivery_city || tt('bestellung'),
                secondLine: (
                  <>
                    {!b.fields.fahrer ? (
                      <span className="font-medium text-warning">{tt('no_driver')}</span>
                    ) : (
                      <span className="text-muted-foreground">{b.fahrerName}</span>
                    )}
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: (() => {
                  const s = lookupKey(b.fields.order_status) ?? 'neu';
                  if (s === 'unterwegs') return { label: `✓ ${tc('abschliessen')}`, onClick: () => advanceStatus(b) };
                  if (s === 'bereit_zur_lieferung') return { label: tt('unterwegs'), onClick: () => advanceStatus(b) };
                  if (s === 'in_bearbeitung') return { label: tt('bereit'), onClick: () => advanceStatus(b) };
                  return { label: tt('bearbeiten'), onClick: () => advanceStatus(b) };
                })(),
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('ctx_ok'),
                action: { label: tt('neue_bestellung'), onClick: () => setCreateBestellOpen(true) },
              }}
            />
            <WorkList
              title={tt('list_drivers')}
              items={activeDrivers.map(f => {
                const myOrders = enrichedBestellverwaltung.filter(
                  b => extractRecordId(b.fields.fahrer) === f.record_id &&
                    lookupKey(b.fields.order_status) === 'unterwegs',
                );
                return {
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim(),
                  secondLine: (
                    <>
                      <span className="font-medium text-primary">{f.fields.vehicle_type?.label ?? ''}</span>
                      {f.fields.delivery_zone && (
                        <span className="text-muted-foreground"> · {tt('driver_zone', { zone: f.fields.delivery_zone })}</span>
                      )}
                      {myOrders.length > 0 && (
                        <span className="text-muted-foreground"> · {myOrders.length} {tt('tour')}{myOrders.length > 1 ? 'en' : ''}</span>
                      )}
                    </>
                  ),
                };
              })}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('empty_drivers'),
                action: { label: tt('neuer_fahrer'), onClick: () => setCreateFahrerOpen(true) },
              }}
            />
          </>
        }
      />

      {/* ─── Overlays ─────────────────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return null;
            const enriched = enrichedBestellverwaltung.find(r => r.record_id === top.id) ?? { ...b, fahrerName: '', kundeName: '' };
            const statusKey = lookupKey(b.fields.order_status) ?? 'neu';
            const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
            const hasNext = statusOrder.indexOf(statusKey) < statusOrder.length - 1 && statusKey !== 'storniert';
            return (
              <>
                <RecordHeader
                  title={enriched.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung')}
                  subtitle={b.fields.desired_delivery_time ? formatDateTime(b.fields.desired_delivery_time) : undefined}
                  badges={
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {b.fields.order_status?.label ?? statusKey}
                    </span>
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
            const f = fahrerverwaltung.find(r => r.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()}
                  subtitle={f.fields.vehicle_type?.label}
                  badges={
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {f.fields.driver_status?.label ?? ''}
                    </span>
                  }
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b2 => overlay.push({ type: 'bestellung', id: b2.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setCreateBestellOpen(true);
                  }}
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim()}
                  subtitle={[k.fields.street, k.fields.city].filter(Boolean).join(', ')}
                  badges={
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {k.fields.customer_status?.label ?? ''}
                    </span>
                  }
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b2 => overlay.push({ type: 'bestellung', id: b2.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: k.record_id });
                    setCreateBestellOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return undefined;
            const enriched = enrichedBestellverwaltung.find(r => r.record_id === top.id) ?? { ...b, fahrerName: '', kundeName: '' };
            const statusKey = lookupKey(b.fields.order_status) ?? 'neu';
            const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
            const idx = statusOrder.indexOf(statusKey);
            if (idx < 0 || idx >= statusOrder.length - 1 || statusKey === 'storniert') return undefined;
            const nextKey = statusOrder[idx + 1];
            const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextKey)?.label ?? nextKey;
            return {
              label: `→ ${nextLabel}`,
              onClick: () => advanceStatus(enriched as EnrichedBestellverwaltung),
            };
          }
          return undefined;
        }}
      />

      {/* ─── Dialogs ──────────────────────────────────────────────────── */}
      <BestellverwaltungDialog
        open={createBestellOpen}
        onClose={() => { setCreateBestellOpen(false); setBestellDefaults(undefined); setEditBestellRecord(null); }}
        onSubmit={async fields => {
          if (editBestellRecord) {
            await LivingAppsService.updateBestellverwaltungEntry(editBestellRecord.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellDefaults}
        recordId={editBestellRecord?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={createFahrerOpen}
        onClose={() => setCreateFahrerOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createFahrerverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />
    </div>
  );
}
