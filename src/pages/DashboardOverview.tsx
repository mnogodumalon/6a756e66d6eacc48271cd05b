import { useMemo, useState, useCallback } from 'react';
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
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog, type FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog, type KundenverwaltungDialogDefaults } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel, fieldLabel } from '@/i18n';
import { IconPlus, IconTruck, IconClock, IconAlertTriangle, IconPackage, IconUser } from '@tabler/icons-react';
import { format } from 'date-fns';

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'default';
  if (status === 'storniert') return 'default';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'success';
  if (status === 'in_bearbeitung') return 'warning';
  return 'warning'; // neu
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
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [bestellungOpen, setBestellungOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [bestellungEditId, setBestellungEditId] = useState<string | undefined>(undefined);

  const [fahrerOpen, setFahrerOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>(undefined);
  const [fahrerEditId, setFahrerEditId] = useState<string | undefined>(undefined);

  const [kundeOpen, setKundeOpen] = useState(false);
  const [kundeDefaults, setKundeDefaults] = useState<KundenverwaltungDialogDefaults | undefined>(undefined);
  const [kundeEditId, setKundeEditId] = useState<string | undefined>(undefined);

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  // Columns from schema — inside component body so locale-aware getters work
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // KPI derivations
  const today = format(clock, 'yyyy-MM-dd');
  const neueBestellungen = useMemo(() => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu'), [bestellverwaltung]);
  const unterwegsBestellungen = useMemo(() => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'), [bestellverwaltung]);
  const aktiveFahrer = useMemo(() => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'), [fahrerverwaltung]);
  const verfuegbareFahrer = useMemo(() => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'), [fahrerverwaltung]);

  // Heutige Bestellungen (by desired_delivery_time or order_date)
  const heutigeBestellungen = useMemo(() =>
    bestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date;
      return dt?.startsWith(today);
    }), [bestellverwaltung, today]);

  // Urgent: neue Bestellungen without a driver
  const ohnefahrer = useMemo(() => neueBestellungen.filter(b => !b.fields.fahrer), [neueBestellungen]);

  // Worklist: active deliveries (unterwegs) — driver + customer + ETA
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () => enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fields.order_date ? formatDateTime(b.fields.order_date) : undefined,
        tone: toneForStatus(status),
        meta: b.fahrerName || undefined,
      };
    }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  // Advance status helper — shared across HeroBanner, WorkList, overlay footer
  const advanceStatus = useCallback(async (b: Bestellverwaltung) => {
    const STATUS_FLOW: Record<string, string> = {
      neu: 'in_bearbeitung',
      in_bearbeitung: 'bereit_zur_lieferung',
      bereit_zur_lieferung: 'unterwegs',
      unterwegs: 'geliefert',
    };
    const current = lookupKey(b.fields.order_status);
    const next = current ? STATUS_FLOW[current] : undefined;
    if (!next) return;
    const prevStatus = b.fields.order_status;
    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(r => r.record_id === b.record_id
        ? { ...r, fields: { ...r.fields, order_status: { key: next, label: next } } }
        : r)
    );
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const kundeRec = kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '');
    const kundeName = kundeRec ? `${kundeRec.fields.first_name ?? ''} ${kundeRec.fields.last_name ?? ''}`.trim() : tx('Bestellung');
    undoToast(tx`${kundeName} → ${nextLabel}`, async () => {
      setBestellverwaltung(prev =>
        prev.map(r => r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
          : r)
      );
      try { await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: lookupKey(prevStatus) }); }
      catch { fetchAll(); }
    });
    try { await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next }); }
    catch { fetchAll(); }
  }, [setBestellverwaltung, kundenverwaltungMap, fetchAll]);

  const onCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = bestellverwaltung.find(r => r.record_id === rid);
    if (!b) return;
    const prevStatus = b.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(r => r.record_id === rid
        ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: newColumn } } }
        : r)
    );
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const kundeRec = kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '');
    const kundeName = kundeRec ? `${kundeRec.fields.first_name ?? ''} ${kundeRec.fields.last_name ?? ''}`.trim() : tx('Bestellung');
    undoToast(tx`${kundeName} → ${nextLabel}`, async () => {
      setBestellverwaltung(prev =>
        prev.map(r => r.record_id === rid
          ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
          : r)
      );
      try { await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prevStatus) }); }
      catch { fetchAll(); }
    });
    try { await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn }); }
    catch { fetchAll(); }
  }, [bestellverwaltung, setBestellverwaltung, kundenverwaltungMap, fetchAll]);

  // ─── Every hook goes ABOVE this line ───────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ────────────────────────────────

  const topOhnefahrer = ohnefahrer[0];

  // Filtered cards for worklist (unterwegs or all)
  const activeDeliveries = enrichedBestellverwaltung.filter(b =>
    lookupKey(b.fields.order_status) === 'unterwegs'
  );

  // Fahrer-Worklist: fahrer im Einsatz mit ihren Bestellungen
  const fahrerMitBestellungen = aktiveFahrer.map(f => {
    const bestellungen = bestellverwaltung.filter(b =>
      extractRecordId(b.fields.fahrer) === f.record_id &&
      (lookupKey(b.fields.order_status) === 'unterwegs' || lookupKey(b.fields.order_status) === 'bereit_zur_lieferung')
    );
    return { fahrer: f, bestellungen };
  });

  // Context line
  const newNames = namen(neueBestellungen.map(b => {
    const k = kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '');
    return k ? `${k.fields.first_name ?? ''}` : '';
  }).filter(Boolean));

  const contextLine = neueBestellungen.length > 0
    ? tx`${neueBestellungen.length} neue Bestellungen — ${newNames} warten auf Bearbeitung.`
    : unterwegsBestellungen.length > 0
      ? tx`${unterwegsBestellungen.length} Lieferungen unterwegs, ${aktiveFahrer.length} Fahrer im Einsatz.`
      : tx`Keine offenen Bestellungen — alle Lieferungen erledigt.`;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)} FreshRoute CRM{/* i18n-exempt */}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => { setBestellungDefaults(undefined); setBestellungEditId(undefined); setBestellungOpen(true); }}
          className="mt-3 sm:mt-0 inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={topOhnefahrer && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Fahrer zuweisen'),
              onClick: () => {
                setBestellungDefaults({ kunde: extractRecordId(topOhnefahrer.fields.kunde) ?? undefined });
                setBestellungEditId(topOhnefahrer.record_id);
                setBestellungOpen(true);
              }
            }}
          >
            <b>{namen(ohnefahrer.map(b => {
              const k = kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '');
              return k ? `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() : '';
            }).filter(Boolean))}</b> {tx('— neue Bestellungen ohne Fahrer.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Neu')}
              value={neueBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={neueBestellungen.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'neu' ? null : 'neu')}
              active={statusFilter === 'neu'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsBestellungen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'unterwegs' ? null : 'unterwegs')}
              active={statusFilter === 'unterwegs'}
            />
            <StatStripItem
              title={tx('Heute')}
              value={heutigeBestellungen.length}
              icon={<IconClock size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Fahrer verfügbar')}
              value={verfuegbareFahrer.length}
              icon={<IconUser size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length === 0 && aktiveFahrer.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={statusFilter ? cards.filter(c => c.column === statusFilter) : cards}
            columns={COLUMNS}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
            onCardMove={onCardMove}
            onAddCard={column => {
              setBestellungDefaults({ order_status: column });
              setBestellungEditId(undefined);
              setBestellungOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Lieferungen unterwegs')}
              items={activeDeliveries.map(b => {
                const status = lookupKey(b.fields.order_status);
                const statusLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === status)?.label ?? status ?? '';
                return {
                  id: b.record_id,
                  title: b.kundeName || tx('Unbekannter Kunde'),
                  secondLine: (
                    <>
                      <span className="font-medium text-primary">{statusLabel}</span>
                      {b.fields.desired_delivery_time && (
                        <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                      )}
                      {b.fahrerName && <span className="text-muted-foreground"> · {b.fahrerName}</span>}
                    </>
                  ),
                  action: { label: tx('✓ Geliefert'), onClick: () => advanceStatus(b) },
                };
              })}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{ text: tx('Keine Lieferungen unterwegs — alle Bestellungen erledigt.'), action: { label: tx('Neue Bestellung'), onClick: () => setBestellungOpen(true) } }}
            />
            <WorkList
              title={tx('Fahrer im Einsatz')}
              items={fahrerMitBestellungen.map(({ fahrer, bestellungen }) => ({
                id: fahrer.record_id,
                title: `${fahrer.fields.driver_first_name ?? ''} ${fahrer.fields.driver_last_name ?? ''}`.trim(),
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{tx('Im Einsatz')}</span>
                    <span className="text-muted-foreground"> · {bestellungen.length} {tx('Lieferung(en)')}</span>
                    {fahrer.fields.delivery_zone && <span className="text-muted-foreground"> · {fahrer.fields.delivery_zone}</span>}
                  </>
                ),
                action: { label: tx('Frei melden'), onClick: async () => {
                  const prev = fahrer.fields.driver_status;
                  setFahrerverwaltung(fs =>
                    fs.map(f => f.record_id === fahrer.record_id
                      ? { ...f, fields: { ...f.fields, driver_status: { key: 'verfuegbar', label: tx('Verfügbar') } } }
                      : f)
                  );
                  undoToast(tx`${fahrer.fields.driver_first_name ?? ''} — frei gemeldet`, async () => {
                    setFahrerverwaltung(fs =>
                      fs.map(f => f.record_id === fahrer.record_id
                        ? { ...f, fields: { ...f.fields, driver_status: prev } }
                        : f)
                    );
                    try { await LivingAppsService.updateFahrerverwaltungEntry(fahrer.record_id, { driver_status: lookupKey(prev) }); }
                    catch { fetchAll(); }
                  });
                  try { await LivingAppsService.updateFahrerverwaltungEntry(fahrer.record_id, { driver_status: 'verfuegbar' }); }
                  catch { fetchAll(); }
                }},
              }))}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{ text: tx('Alle Fahrer verfügbar — kein aktiver Einsatz.'), action: { label: tx('Neuer Fahrer'), onClick: () => setFahrerOpen(true) } }}
            />
          </>
        }
      />

      {/* RecordOverlayHost — ONE shell for the whole overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return null;
            const kundeRec = kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '');
            const fahrerRec = fahrerverwaltungMap.get(extractRecordId(b.fields.fahrer) ?? '');
            return (
              <>
                <RecordHeader
                  title={kundeRec ? `${kundeRec.fields.first_name ?? ''} ${kundeRec.fields.last_name ?? ''}`.trim() : tx('Bestellung')}
                  subtitle={b.fields.order_status?.label}
                  badges={b.fields.total_amount != null ? <span className="text-sm font-semibold text-foreground">{formatCurrency(b.fields.total_amount)}</span> : undefined}
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
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
                  subtitle={f.fields.driver_status?.label}
                  meta={f.fields.vehicle_type?.label ? <span>{f.fields.vehicle_type.label}</span> : undefined}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ fahrer: f.record_id });
                    setBestellungEditId(undefined);
                    setBestellungOpen(true);
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
                  subtitle={k.fields.customer_status?.label}
                  meta={k.fields.city ? <span>{k.fields.city}</span> : undefined}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellungDefaults({ kunde: k.record_id });
                    setBestellungEditId(undefined);
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
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (!b) return undefined;
            const status = lookupKey(b.fields.order_status);
            const STATUS_NEXT_LABEL: Record<string, string> = {
              neu: tx('In Bearbeitung nehmen'),
              in_bearbeitung: tx('Bereit zur Lieferung'),
              bereit_zur_lieferung: tx('Unterwegs melden'),
              unterwegs: tx('Als geliefert markieren'),
            };
            if (!status || !STATUS_NEXT_LABEL[status]) return undefined;
            return { label: STATUS_NEXT_LABEL[status], onClick: () => advanceStatus(b) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(r => r.record_id === top.id);
            if (b) {
              setBestellungDefaults(b.fields as BestellverwaltungDialogDefaults);
              setBestellungEditId(b.record_id);
              setBestellungOpen(true);
            }
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(r => r.record_id === top.id);
            if (f) {
              setFahrerDefaults(f.fields as FahrerverwaltungDialogDefaults);
              setFahrerEditId(f.record_id);
              setFahrerOpen(true);
            }
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(r => r.record_id === top.id);
            if (k) {
              setKundeDefaults(k.fields as KundenverwaltungDialogDefaults);
              setKundeEditId(k.record_id);
              setKundeOpen(true);
            }
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellungOpen}
        onClose={() => setBestellungOpen(false)}
        recordId={bestellungEditId}
        defaultValues={bestellungDefaults}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
        onSubmit={async fields => {
          if (bestellungEditId) {
            await LivingAppsService.updateBestellverwaltungEntry(bestellungEditId, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
      />
      <FahrerverwaltungDialog
        open={fahrerOpen}
        onClose={() => setFahrerOpen(false)}
        recordId={fahrerEditId}
        defaultValues={fahrerDefaults}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
        onSubmit={async fields => {
          if (fahrerEditId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerEditId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
      />
      <KundenverwaltungDialog
        open={kundeOpen}
        onClose={() => setKundeOpen(false)}
        recordId={kundeEditId}
        defaultValues={kundeDefaults}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
        onSubmit={async fields => {
          if (kundeEditId) {
            await LivingAppsService.updateKundenverwaltungEntry(kundeEditId, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
      />
    </>
  );
}
