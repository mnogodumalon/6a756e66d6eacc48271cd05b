import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { makeT, fieldLabel, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
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
import { IconTruck, IconUsers, IconPlus, IconAlertTriangle, IconPackage, IconCheck } from '@tabler/icons-react';
import { format } from 'date-fns';

const tt = makeT({
  de: {
    context_zero: 'Keine aktiven Bestellungen heute.',
    context_active: 'Heute {n} Bestellungen — {names} warten auf Lieferung.',
    hero_title: '{n} {label} ohne Fahrerzuweisung',
    hero_action: 'Fahrer zuweisen',
    kpi_gesamt: 'Bestellungen gesamt',
    kpi_offen: 'Offen',
    kpi_unterwegs: 'Unterwegs',
    kpi_fahrer_aktiv: 'Fahrer im Einsatz',
    kpi_umsatz: 'Umsatz heute',
    list_pending: 'Bereit zur Auslieferung',
    list_fahrer: 'Fahrerstatus',
    list_no_pending: 'Keine Bestellungen bereit — nächste Ankunft abwarten',
    list_no_fahrer: 'Alle Fahrer verfügbar',
    action_assign: 'Zuweisen',
    action_delivered: '✓ Geliefert',
    new_order: 'Neue Bestellung',
    btn_new: 'Neue Bestellung',
    empty_title: 'Willkommen bei FreshRoute CRM',
    empty_sub: 'Erstelle die erste Bestellung und weise ihr einen Fahrer zu.',
    empty_cta: 'Erste Bestellung aufnehmen',
  },
  en: {
    context_zero: 'No active orders today.',
    context_active: 'Today {n} orders — {names} waiting for delivery.',
    hero_title: '{n} {label} without driver assignment',
    hero_action: 'Assign driver',
    kpi_gesamt: 'Orders total',
    kpi_offen: 'Open',
    kpi_unterwegs: 'On the way',
    kpi_fahrer_aktiv: 'Drivers on duty',
    kpi_umsatz: "Today's revenue",
    list_pending: 'Ready for delivery',
    list_fahrer: 'Driver status',
    list_no_pending: 'No orders ready — waiting for next arrival',
    list_no_fahrer: 'All drivers available',
    action_assign: 'Assign',
    action_delivered: '✓ Delivered',
    new_order: 'New order',
    btn_new: 'New order',
    empty_title: 'Welcome to FreshRoute CRM',
    empty_sub: 'Create the first order and assign a driver.',
    empty_cta: 'Add first order',
  },
  cs: {
    context_zero: 'Dnes žádné aktivní objednávky.',
    context_active: 'Dnes {n} objednávek — {names} čeká na doručení.',
    hero_title: '{n} {label} bez přiřazeného řidiče',
    hero_action: 'Přiřadit řidiče',
    kpi_gesamt: 'Objednávky celkem',
    kpi_offen: 'Otevřeno',
    kpi_unterwegs: 'Na cestě',
    kpi_fahrer_aktiv: 'Řidiči ve službě',
    kpi_umsatz: 'Obrat dnes',
    list_pending: 'Připraveno k doručení',
    list_fahrer: 'Stav řidičů',
    list_no_pending: 'Žádné objednávky připraveny — čekejte na příchod',
    list_no_fahrer: 'Všichni řidiči k dispozici',
    action_assign: 'Přiřadit',
    action_delivered: '✓ Doručeno',
    new_order: 'Nová objednávka',
    btn_new: 'Nová objednávka',
    empty_title: 'Vítejte v FreshRoute CRM',
    empty_sub: 'Vytvořte první objednávku a přiřaďte řidiče.',
    empty_cta: 'Přidat první objednávku',
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
  return 'default';
}

export default function DashboardOverview() {
  const {
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellDialogOpen, setBestellDialogOpen] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [bestellEditId, setBestellEditId] = useState<string | undefined>(undefined);

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>(undefined);
  const [fahrerEditId, setFahrerEditId] = useState<string | undefined>(undefined);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [kundeDefaults, setKundeDefaults] = useState<KundenverwaltungDialogDefaults | undefined>(undefined);
  const [kundeEditId, setKundeEditId] = useState<string | undefined>(undefined);

  // Kanban columns from schema
  const columns = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
    })),
    [],
  );

  const todayKey = format(clock, 'yyyy-MM-dd');

  // Derived data
  const openOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const k = lookupKey(b.fields.order_status);
      return k && !['geliefert', 'storniert'].includes(k);
    }),
    [enrichedBestellverwaltung],
  );

  const unterwegsOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const bereitOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [enrichedBestellverwaltung],
  );

  // Orders without driver assignment that are not yet delivered/cancelled
  const ohnefahrer = useMemo(
    () => openOrders.filter(b => !b.fields.fahrer),
    [openOrders],
  );

  const fahrerImEinsatz = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // Today's revenue
  const todayRevenue = useMemo(() => {
    return enrichedBestellverwaltung
      .filter(b => {
        const od = b.fields.order_date;
        return od && od.startsWith(todayKey);
      })
      .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0);
  }, [enrichedBestellverwaltung, todayKey]);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
        const status = lookupKey(b.fields.order_status) ?? columns[0]?.key ?? '';
        return {
          id: `bestellung:${b.record_id}`,
          column: status,
          title: b.kundeName || appLabel('kundenverwaltung'),
          subtitle: b.fields.delivery_street
            ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}`.trim()
            : b.fields.ordered_items?.slice(0, 40),
          tone: toneForStatus(status),
        };
      }),
    [enrichedBestellverwaltung, columns],
  );

  // Context line
  const contextLine = useMemo(() => {
    if (openOrders.length === 0) return tt('context_zero');
    const names = namen(openOrders.map(b => b.kundeName));
    return tt('context_active', { n: openOrders.length, names });
  }, [openOrders]);

  // Advance order status
  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const STATUS_FLOW: Record<string, string> = {
      neu: 'in_bearbeitung',
      in_bearbeitung: 'bereit_zur_lieferung',
      bereit_zur_lieferung: 'unterwegs',
      unterwegs: 'geliefert',
    };
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const next = STATUS_FLOW[current];
    if (!next) return;

    const nextLabel = columns.find(c => c.key === next)?.label ?? next;
    const prevStatus = b.fields.order_status;

    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(r =>
        r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: { key: next, label: nextLabel } } }
          : r,
      ),
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
      undoToast(`${b.kundeName || appLabel('kundenverwaltung')}: ${nextLabel}`, async () => {
        setBestellverwaltung(prev =>
          prev.map(r =>
            r.record_id === b.record_id
              ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
              : r,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: lookupKey(prevStatus) ?? 'neu' });
      });
    } catch {
      fetchAll();
    }
  }, [columns, setBestellverwaltung, fetchAll]);

  // Card move handler
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;

    const newLabel = columns.find(c => c.key === newColumn)?.label ?? newColumn;
    const rec = bestellverwaltung.find(b => b.record_id === rid);
    if (!rec) return;
    const prevStatus = rec.fields.order_status;

    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newLabel } } }
          : b,
      ),
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(`Status: ${newLabel}`, async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === rid
              ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prevStatus) ?? 'neu' });
      });
    } catch {
      fetchAll();
    }
  }, [columns, bestellverwaltung, setBestellverwaltung, fetchAll]);

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations below ───

  const topBereit = bereitOrders.slice(0, 8);
  const bestellungById = (id: string) => enrichedBestellverwaltung.find(b => b.record_id === id);
  const fahrerById = (id: string) => fahrerverwaltung.find(f => f.record_id === id);
  const kundeById = (id: string) => kundenverwaltung.find(k => k.record_id === id);

  const nextStatusLabel = (b: EnrichedBestellverwaltung) => {
    const STATUS_FLOW: Record<string, string> = {
      neu: 'in_bearbeitung',
      in_bearbeitung: 'bereit_zur_lieferung',
      bereit_zur_lieferung: 'unterwegs',
      unterwegs: 'geliefert',
    };
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const next = STATUS_FLOW[current];
    if (!next) return null;
    return columns.find(c => c.key === next)?.label ?? next;
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialogOpen(true); }}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('btn_new')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ohnefahrer.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => {
                  overlay.replace({ type: 'bestellung', id: ohnefahrer[0].record_id });
                },
              }}
            >
              <b>{namen(ohnefahrer.map(b => b.kundeName))}</b>{' '}
              {tt('hero_title', { n: ohnefahrer.length, label: appLabel('bestellverwaltung') })}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_gesamt')}
              value={bestellverwaltung.length}
              icon={<IconPackage size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tt('kpi_offen')}
              value={openOrders.length}
              tone={openOrders.length > 0 ? 'primary' : 'default'}
              icon={<IconTruck size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tt('kpi_unterwegs')}
              value={unterwegsOrders.length}
              tone={unterwegsOrders.length > 0 ? 'warning' : 'default'}
              icon={<IconTruck size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tt('kpi_fahrer_aktiv')}
              value={fahrerImEinsatz.length}
              tone={fahrerImEinsatz.length > 0 ? 'success' : 'default'}
              icon={<IconUsers size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tt('kpi_umsatz')}
              value={formatCurrency(todayRevenue)}
              icon={<IconCheck size={16} className="shrink-0" />}
            />
          </StatStrip>
        }
        primary={
          bestellverwaltung.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <IconPackage size={48} className="text-muted-foreground" />
              <div>
                <p className="font-semibold text-foreground">{tt('empty_title')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tt('empty_sub')}</p>
              </div>
              <button
                onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialogOpen(true); }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                <IconPlus size={16} className="shrink-0" />
                {tt('empty_cta')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              cards={cards}
              columns={columns}
              defaultCollapsed={['geliefert', 'storniert']}
              onCardClick={card => {
                const rid = card.id.split(':')[1] ?? '';
                overlay.replace({ type: 'bestellung', id: rid });
              }}
              onCardMove={moveCard}
              onAddCard={column => {
                setBestellDefaults({ order_status: column });
                setBestellEditId(undefined);
                setBestellDialogOpen(true);
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tt('list_pending')}
              items={topBereit.map(b => ({
                id: b.record_id,
                title: b.kundeName || appLabel('kundenverwaltung'),
                secondLine: (
                  <>
                    {b.fahrerName ? (
                      <span className="font-medium text-primary">{b.fahrerName}</span>
                    ) : (
                      <span className="font-medium text-warning">{tt('action_assign')}</span>
                    )}
                    {b.fields.delivery_street && (
                      <span className="text-muted-foreground"> · {b.fields.delivery_street}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('action_delivered'),
                  onClick: () => void advanceStatus(b),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('list_no_pending'),
                action: {
                  label: tt('new_order'),
                  onClick: () => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={tt('list_fahrer')}
              items={fahrerverwaltung.slice(0, 6).map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
                secondLine: (
                  <>
                    <span
                      className={
                        lookupKey(f.fields.driver_status) === 'verfuegbar'
                          ? 'font-medium text-success'
                          : lookupKey(f.fields.driver_status) === 'im_einsatz'
                          ? 'font-medium text-primary'
                          : 'font-medium text-muted-foreground'
                      }
                    >
                      {f.fields.driver_status?.label ?? '—'}
                    </span>
                    {f.fields.delivery_zone && (
                      <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('list_no_fahrer'),
                action: {
                  label: appLabel('fahrerverwaltung'),
                  onClick: () => { setFahrerDefaults(undefined); setFahrerEditId(undefined); setFahrerDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Single RecordOverlayHost for all overlay types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const rec = bestellungById(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={rec.kundeName || appLabel('kundenverwaltung')}
                  subtitle={rec.fields.order_status?.label}
                  badges={
                    rec.fields.order_status ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                        {rec.fields.order_status.label}
                      </span>
                    ) : undefined
                  }
                />
                <BestellverwaltungDetails
                  record={rec}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
              </>
            );
          }
          if (top.type === 'fahrer') {
            const rec = fahrerById(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={`${rec.fields.driver_first_name ?? ''} ${rec.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={rec.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={rec}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: rec.record_id });
                    setBestellEditId(undefined);
                    setBestellDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const rec = kundeById(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={`${rec.fields.first_name ?? ''} ${rec.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={rec.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={rec}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: rec.record_id });
                    setBestellEditId(undefined);
                    setBestellDialogOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type !== 'bestellung') return undefined;
          const rec = bestellungById(top.id);
          if (!rec) return undefined;
          const nextLabel = nextStatusLabel(rec);
          if (!nextLabel) return undefined;
          return {
            label: nextLabel,
            onClick: () => void advanceStatus(rec),
          };
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const rec = bestellungById(top.id);
            if (rec) {
              setBestellDefaults(rec.fields as BestellverwaltungDialogDefaults);
              setBestellEditId(rec.record_id);
              setBestellDialogOpen(true);
            }
          } else if (top.type === 'fahrer') {
            const rec = fahrerById(top.id);
            if (rec) {
              setFahrerDefaults(rec.fields as FahrerverwaltungDialogDefaults);
              setFahrerEditId(rec.record_id);
              setFahrerDialogOpen(true);
            }
          } else if (top.type === 'kunde') {
            const rec = kundeById(top.id);
            if (rec) {
              setKundeDefaults(rec.fields as KundenverwaltungDialogDefaults);
              setKundeEditId(rec.record_id);
              setKundeDialogOpen(true);
            }
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialogOpen}
        onClose={() => setBestellDialogOpen(false)}
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
        open={fahrerDialogOpen}
        onClose={() => setFahrerDialogOpen(false)}
        onSubmit={async fields => {
          if (fahrerEditId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerEditId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrerDefaults}
        recordId={fahrerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => setKundeDialogOpen(false)}
        onSubmit={async fields => {
          if (kundeEditId) {
            await LivingAppsService.updateKundenverwaltungEntry(kundeEditId, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={kundeDefaults}
        recordId={kundeEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
