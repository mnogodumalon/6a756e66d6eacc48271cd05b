import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { useState, useMemo, useCallback } from 'react';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
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
import { IconTruck, IconAlertTriangle, IconPackage, IconUsers, IconCurrencyEuro } from '@tabler/icons-react';
import { format } from 'date-fns';

const tt = makeT({
  de: {
    greeting_ctx: 'Kein Fahrer im Einsatz',
    ctx_orders: '{n} aktive Lieferung',
    ctx_orders_many: '{n} aktive Lieferungen',
    ctx_driver_on: '{drivers} im Einsatz',
    ueberfaellig_banner: '{n} Bestellung{pl} ohne Fahrer — sofort zuweisen!',
    ueberfaellig_aktion: 'Fahrer zuweisen',
    stat_aktiv: 'Aktiv',
    stat_heute: 'Heute',
    stat_fahrer: 'Fahrer verfügbar',
    stat_umsatz: 'Umsatz (gesamt)',
    liste_heute: 'Heute zu liefern',
    liste_ohne_fahrer: 'Ohne Fahrer',
    neue_bestellung: 'Neue Bestellung',
    kein_eintrag_fahrer: 'Alle haben einen Fahrer — super!',
    kein_eintrag_heute: 'Heute keine Lieferungen',
    advance_label: 'Weiter',
    cancel_btn: 'Stornieren',
    toast_moved: '{name} → {col}',
    toast_storniert: '{name} storniert',
    toast_created: 'Bestellung erstellt',
  },
  en: {
    greeting_ctx: 'No driver on duty',
    ctx_orders: '{n} active delivery',
    ctx_orders_many: '{n} active deliveries',
    ctx_driver_on: '{drivers} on duty',
    ueberfaellig_banner: '{n} order{pl} without a driver — assign now!',
    ueberfaellig_aktion: 'Assign driver',
    stat_aktiv: 'Active',
    stat_heute: 'Today',
    stat_fahrer: 'Drivers available',
    stat_umsatz: 'Revenue (total)',
    liste_heute: 'Deliver today',
    liste_ohne_fahrer: 'Without driver',
    neue_bestellung: 'New order',
    kein_eintrag_fahrer: 'All have a driver — great!',
    kein_eintrag_heute: 'No deliveries today',
    advance_label: 'Advance',
    cancel_btn: 'Cancel',
    toast_moved: '{name} → {col}',
    toast_storniert: '{name} cancelled',
    toast_created: 'Order created',
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
  return 'warning'; // neu
}

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | undefined>(undefined);
  const [editFahrerOpen, setEditFahrerOpen] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>(undefined);
  const [editKundeOpen, setEditKundeOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const todayKey = format(clock, 'yyyy-MM-dd');

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const activeStatuses = useMemo(
    () => new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']),
    [],
  );

  const aktiveBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => activeStatuses.has(lookupKey(b.fields.order_status) ?? '')),
    [enrichedBestellverwaltung, activeStatuses],
  );

  const heuteBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date;
      if (!dt) return false;
      return dt.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  const ohneFahrerAktiv = useMemo(
    () => aktiveBestellungen.filter(b => !extractRecordId(b.fields.fahrer)),
    [aktiveBestellungen],
  );

  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const imEinsatzFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  const gesamtUmsatz = useMemo(
    () => bestellverwaltung.reduce((s, b) => s + (b.fields.total_amount ?? 0), 0),
    [bestellverwaltung],
  );

  const filteredCards = useMemo(
    () => filterStatus ? enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === filterStatus) : enrichedBestellverwaltung,
    [enrichedBestellverwaltung, filterStatus],
  );

  const cards = useMemo<KanbanCard[]>(
    () => filteredCards.map(b => {
      const status = lookupKey(b.fields.order_status) ?? 'neu';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fields.delivery_street ?? undefined,
        tone: toneForStatus(status),
      };
    }),
    [filteredCards],
  );

  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const cur = lookupKey(b.fields.order_status) ?? 'neu';
    const statusFlow = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const curIdx = statusFlow.indexOf(cur);
    if (curIdx < 0 || curIdx >= statusFlow.length - 1) return;
    const next = statusFlow[curIdx + 1];
    const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
    const prevStatus = b.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(r => r.record_id === b.record_id
        ? { ...r, fields: { ...r.fields, order_status: { key: next, label: nextLabel } } }
        : r)
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
      undoToast(tt('toast_moved', { name: b.kundeName || b.record_id, col: nextLabel }), async () => {
        setBestellverwaltung(prev =>
          prev.map(r => r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
            : r)
        );
        try {
          await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: prevStatus ? (prevStatus as { key: string }).key : 'neu' });
        } catch { await fetchAll(); }
      });
    } catch {
      await fetchAll();
    }
  }, [COLUMNS, setBestellverwaltung, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string): Promise<void | string> => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const found = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!found) return;
    const prev = found.fields.order_status;
    const newLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    setBestellverwaltung(prev2 =>
      prev2.map(r => r.record_id === rid
        ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: newLabel } } }
        : r)
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(tt('toast_moved', { name: found.kundeName || rid, col: newLabel }), async () => {
        setBestellverwaltung(prev2 =>
          prev2.map(r => r.record_id === rid
            ? { ...r, fields: { ...r.fields, order_status: prev } }
            : r)
        );
        try {
          await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prev ? (prev as { key: string }).key : 'neu' });
        } catch { await fetchAll(); }
      });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, COLUMNS, setBestellverwaltung, fetchAll]);

  const openBestellungAdd = useCallback((column?: string) => {
    setCreateDefaults(column ? { order_status: column } : undefined);
    setEditingBestellung(undefined);
    setCreateOpen(true);
  }, []);

  // Context line
  const driverNames = imEinsatzFahrer.map(f => `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()).filter(Boolean);
  const activeCount = aktiveBestellungen.length;
  const contextLine = imEinsatzFahrer.length > 0
    ? `${tt('ctx_driver_on', { drivers: namen(driverNames) })} — ${activeCount === 1 ? tt('ctx_orders', { n: activeCount }) : tt('ctx_orders_many', { n: activeCount })}`
    : tt('greeting_ctx');

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const topOverlay = overlay.top;
  const bestellungRecord = topOverlay?.type === 'bestellung'
    ? bestellverwaltung.find(b => b.record_id === topOverlay.id)
    : undefined;
  const fahrerRecord = topOverlay?.type === 'fahrer'
    ? fahrerverwaltung.find(f => f.record_id === topOverlay.id)
    : undefined;
  const kundeRecord = topOverlay?.type === 'kunde'
    ? kundenverwaltung.find(k => k.record_id === topOverlay.id)
    : undefined;

  const currentEnriched = bestellungRecord
    ? enrichedBestellverwaltung.find(b => b.record_id === bestellungRecord.record_id)
    : undefined;

  const canAdvance = (b: EnrichedBestellverwaltung) => {
    const cur = lookupKey(b.fields.order_status) ?? 'neu';
    return ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs'].includes(cur);
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
            {gruss(clock)}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{contextLine}</p>
        </div>
        <button
          onClick={() => openBestellungAdd()}
          className="shrink-0 mt-2 sm:mt-0 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <IconPackage size={16} className="shrink-0" />
          {tt('neue_bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ohneFahrerAktiv.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('ueberfaellig_aktion'),
              onClick: () => {
                const first = ohneFahrerAktiv[0];
                const enriched = enrichedBestellverwaltung.find(b => b.record_id === first.record_id);
                if (enriched) {
                  setEditingBestellung(enriched);
                  setCreateOpen(true);
                }
              },
            }}
          >
            <b>{namen(ohneFahrerAktiv.map(b => {
              const e = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
              return e?.kundeName || b.record_id;
            }))}</b>
            {' '}— {tt('ueberfaellig_banner', { n: ohneFahrerAktiv.length, pl: ohneFahrerAktiv.length !== 1 ? 'en' : '' })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('stat_aktiv')}
              value={aktiveBestellungen.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={aktiveBestellungen.length > 0 ? 'primary' : 'default'}
              onClick={() => setFilterStatus(f => f === 'unterwegs' ? null : 'unterwegs')}
              active={filterStatus === 'unterwegs'}
            />
            <StatStripItem
              title={tt('stat_heute')}
              value={heuteBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={heuteBestellungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('stat_fahrer')}
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tt('stat_umsatz')}
              value={formatCurrency(gesamtUmsatz)}
              icon={<IconCurrencyEuro size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        aside={<>
          <WorkList
            title={tt('liste_heute')}
            items={heuteBestellungen.map(b => ({
              id: b.record_id,
              title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
              secondLine: (
                <>
                  <span className={`font-medium ${lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {b.fields.order_status?.label}
                  </span>
                  {b.fields.desired_delivery_time && (
                    <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                  )}
                </>
              ),
              action: canAdvance(b) ? {
                label: tt('advance_label'),
                onClick: () => void advanceStatus(b),
              } : undefined,
            }))}
            onItemClick={id => overlay.replace({ type: 'bestellung', id })}
            empty={{ text: tt('kein_eintrag_heute'), action: { label: tt('neue_bestellung'), onClick: () => openBestellungAdd() } }}
          />
          <WorkList
            title={tt('liste_ohne_fahrer')}
            items={ohneFahrerAktiv.map(b => ({
              id: b.record_id,
              title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
              secondLine: (
                <>
                  <span className="font-medium text-warning">{b.fields.order_status?.label}</span>
                  {b.fields.delivery_city && (
                    <span className="text-muted-foreground"> · {b.fields.delivery_city}</span>
                  )}
                </>
              ),
              action: {
                label: tt('ueberfaellig_aktion'),
                onClick: () => {
                  const enriched = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
                  if (enriched) {
                    setEditingBestellung(enriched);
                    setCreateOpen(true);
                  }
                },
              },
            }))}
            onItemClick={id => overlay.replace({ type: 'bestellung', id })}
            empty={{ text: tt('kein_eintrag_fahrer') }}
          />
        </>}
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert', 'geliefert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => openBestellungAdd(column)}
          />
        }
      />

      {/* Overlay Host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung' && bestellungRecord) {
            return (
              <>
                <RecordHeader
                  title={currentEnriched?.kundeName || bestellungRecord.fields.delivery_city || appLabel('bestellverwaltung')}
                  subtitle={bestellungRecord.fields.order_status?.label}
                />
                <BestellverwaltungDetails
                  record={bestellungRecord}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
                />
              </>
            );
          }
          if (top.type === 'fahrer' && fahrerRecord) {
            return (
              <>
                <RecordHeader
                  title={`${fahrerRecord.fields.driver_first_name ?? ''} ${fahrerRecord.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={fahrerRecord.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={fahrerRecord}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ fahrer: fahrerRecord.record_id });
                    setEditingBestellung(undefined);
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde' && kundeRecord) {
            return (
              <>
                <RecordHeader
                  title={`${kundeRecord.fields.first_name ?? ''} ${kundeRecord.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={kundeRecord.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={kundeRecord}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ kunde: kundeRecord.record_id });
                    setEditingBestellung(undefined);
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung' && bestellungRecord) {
            const enriched = enrichedBestellverwaltung.find(b => b.record_id === bestellungRecord.record_id);
            if (enriched && canAdvance(enriched)) {
              const cur = lookupKey(enriched.fields.order_status) ?? 'neu';
              const statusFlow = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
              const curIdx = statusFlow.indexOf(cur);
              const next = statusFlow[curIdx + 1];
              const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
              return {
                label: `${tt('advance_label')}: ${nextLabel}`,
                onClick: () => void advanceStatus(enriched),
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const enriched = enrichedBestellverwaltung.find(b => b.record_id === top.id);
            if (enriched) {
              setEditingBestellung(enriched);
              setCreateOpen(true);
            }
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) { setEditingFahrer(f); setEditFahrerOpen(true); }
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) { setEditingKunde(k); setEditKundeOpen(true); }
          }
        }}
      />

      {/* Bestellung Dialog */}
      <BestellverwaltungDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setEditingBestellung(undefined); setCreateDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingBestellung ? editingBestellung.fields : createDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      {/* Fahrer Dialog */}
      <FahrerverwaltungDialog
        open={editFahrerOpen}
        onClose={() => { setEditFahrerOpen(false); setEditingFahrer(undefined); }}
        onSubmit={async (fields) => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          }
          fetchAll();
        }}
        defaultValues={editingFahrer?.fields}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {/* Kunde Dialog */}
      <KundenverwaltungDialog
        open={editKundeOpen}
        onClose={() => { setEditKundeOpen(false); setEditingKunde(undefined); }}
        onSubmit={async (fields) => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
          }
          fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
