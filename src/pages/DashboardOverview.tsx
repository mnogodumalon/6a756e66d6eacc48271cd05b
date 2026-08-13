import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import type { ChartRow } from '@/components/widgets/ChartWidget';
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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconPackage,
  IconTruckDelivery,
  IconUsers,
  IconAlertTriangle,
  IconClock,
  IconCheck,
  IconCircleCheck,
  IconUserOff,
} from '@tabler/icons-react';

// Pre-generated overlay union — one branch per entity, `record` typed the way
// the data flows on this page: Enriched* where enrichment exists, the raw
// record type otherwise.
export type OverlayItem =
  | { type: 'kundenverwaltung'; record: Kundenverwaltung }
  | { type: 'fahrerverwaltung'; record: Fahrerverwaltung }
  | { type: 'bestellverwaltung'; record: EnrichedBestellverwaltung };

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  // ── Hooks ──────────────────────────────────────────────────────────────
  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const [bestellDialog, setBestellDialog] = useState<{ open: boolean; defaults?: BestellverwaltungDialogDefaults; recordId?: string }>({ open: false });
  const [fahrerDialog, setFahrerDialog] = useState<{ open: boolean; recordId?: string }>({ open: false });
  const [kundeDialog, setKundeDialog] = useState<{ open: boolean; recordId?: string }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const today = format(clock, 'yyyy-MM-dd');
  const todayPrefix = today; // for string comparison with datetimeminute fields

  // Derived data — inside component body (locale-aware)
  const orderStatusOptions = useMemo(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const kanbanColumns = useMemo(() => orderStatusOptions, [orderStatusOptions]);

  const kanbanCards: KanbanCard[] = useMemo(() =>
    enrichedBestellverwaltung
      .sort((a, b) => (a.fields.order_date ?? '').localeCompare(b.fields.order_date ?? ''))
      .map(r => ({
        id: `bestellung:${r.record_id}`,
        column: lookupKey(r.fields.order_status) ?? '',
        title: r.kundeName || tx('Unbekannter Kunde'),
        subtitle: r.fields.desired_delivery_time
          ? formatDateTime(r.fields.desired_delivery_time)
          : (r.fields.ordered_items ?? '').slice(0, 60),
        tone: ((): KanbanCard['tone'] => {
          const s = lookupKey(r.fields.order_status);
          if (s === 'geliefert') return 'success';
          if (s === 'storniert') return 'destructive';
          if (s === 'unterwegs') return 'primary';
          return 'default';
        })(),
      })),
    [enrichedBestellverwaltung]
  );

  // KPIs
  const neu = useMemo(() => enrichedBestellverwaltung.filter(r => lookupKey(r.fields.order_status) === 'neu'), [enrichedBestellverwaltung]);
  const unterwegs = useMemo(() => enrichedBestellverwaltung.filter(r => lookupKey(r.fields.order_status) === 'unterwegs'), [enrichedBestellverwaltung]);
  const geliefert = useMemo(() => enrichedBestellverwaltung.filter(r => lookupKey(r.fields.order_status) === 'geliefert'), [enrichedBestellverwaltung]);
  const ohnefahrer = useMemo(() => enrichedBestellverwaltung.filter(r => !r.fields.fahrer && lookupKey(r.fields.order_status) !== 'geliefert' && lookupKey(r.fields.order_status) !== 'storniert'), [enrichedBestellverwaltung]);

  // Bestellungen ohne Fahrer die heute geliefert werden sollen (Hero signal)
  const heuteFaelligOhneFahrer = useMemo(() =>
    enrichedBestellverwaltung.filter(r => {
      const status = lookupKey(r.fields.order_status);
      if (status === 'geliefert' || status === 'storniert') return false;
      if (r.fields.fahrer) return false;
      const dt = r.fields.desired_delivery_time;
      return dt ? dt.startsWith(todayPrefix) : false;
    }),
    [enrichedBestellverwaltung, todayPrefix]
  );

  // WorkList: offene Bestellungen heute fällig oder ohne Lieferzeit (urgent)
  const heuteFaellig = useMemo(() =>
    enrichedBestellverwaltung
      .filter(r => {
        const s = lookupKey(r.fields.order_status);
        if (s === 'geliefert' || s === 'storniert') return false;
        const dt = r.fields.desired_delivery_time;
        return dt ? dt.startsWith(todayPrefix) : false;
      })
      .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung, todayPrefix]
  );

  // Chart rows
  const bestellChartRows: ChartRow<EnrichedBestellverwaltung>[] = useMemo(() =>
    enrichedBestellverwaltung.map(r => ({ id: `bestellung:${r.record_id}`, data: r })),
    [enrichedBestellverwaltung]
  );

  // ── Advance helper (optimistic status change) ──────────────────────────
  const advanceStatus = useCallback((r: EnrichedBestellverwaltung, newStatus: string) => {
    const prevStatus = r.fields.order_status;
    const newLv = lookupOption('bestellverwaltung', 'order_status', newStatus);
    setBestellverwaltung(list =>
      list.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, order_status: newLv } } : x)
    );
    LivingAppsService.updateBestellverwaltungEntry(r.record_id, { order_status: newStatus })
      .catch(() => {
        setBestellverwaltung(list =>
          list.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, order_status: prevStatus } } : x)
        );
        fetchAll();
      });
    undoToast(tx`${r.kundeName || tx('Bestellung')} — Status aktualisiert`, () => {
      setBestellverwaltung(list2 =>
        list2.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, order_status: prevStatus } } : x)
      );
      LivingAppsService.updateBestellverwaltungEntry(r.record_id, { order_status: (prevStatus as any)?.key ?? prevStatus }).catch(() => fetchAll());
    });
  }, [setBestellverwaltung, fetchAll]);

  // ── onCardMove ──────────────────────────────────────────────────────────
  const handleCardMove = useCallback((cardId: string, newColumn: string) => {
    const id = cardId.split(':')[1];
    const r = enrichedBestellverwaltung.find(x => x.record_id === id);
    if (!r) return;
    advanceStatus(r, newColumn);
  }, [enrichedBestellverwaltung, advanceStatus]);

  // ── Fahrer assign helper ────────────────────────────────────────────────
  const assignNextDriver = useCallback((r: EnrichedBestellverwaltung) => {
    const available = fahrerverwaltung.find(f => lookupKey(f.fields.driver_status) === 'verfuegbar');
    if (!available) return;
    const prevFahrer = r.fields.fahrer;
    const newUrl = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, available.record_id);
    setBestellverwaltung(prev =>
      prev.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, fahrer: newUrl } } : x)
    );
    LivingAppsService.updateBestellverwaltungEntry(r.record_id, { fahrer: newUrl }).catch(() => {
      setBestellverwaltung(prev =>
        prev.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, fahrer: prevFahrer } } : x)
      );
      fetchAll();
    });
    undoToast(tx`${available.fields.driver_first_name ?? tx('Fahrer')} — zugewiesen`, () => {
      setBestellverwaltung(prev2 =>
        prev2.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, fahrer: prevFahrer } } : x)
      );
      LivingAppsService.updateBestellverwaltungEntry(r.record_id, { fahrer: prevFahrer ?? undefined }).catch(() => fetchAll());
    });
  }, [fahrerverwaltung, setBestellverwaltung, fetchAll]);

  // ── filter state ───────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // ── Early returns AFTER all hooks ──────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Derivations only below (no hooks) ──────────────────────────────────
  const verfuegbareFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar');
  const verfuegbarText = verfuegbareFahrer.length > 0
    ? namen(verfuegbareFahrer.map(f => [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ')))
    : null;

  // Context line
  const activeOrders = enrichedBestellverwaltung.filter(r => {
    const s = lookupKey(r.fields.order_status);
    return s !== 'geliefert' && s !== 'storniert';
  });
  let contextLine = '';
  if (activeOrders.length === 0) {
    contextLine = tx('Keine offenen Bestellungen — alles erledigt.');
  } else {
    const namesStr = namen(activeOrders.map(r => r.kundeName).filter(Boolean));
    contextLine = namesStr
      ? tx`${namesStr} — ${activeOrders.length} offene Bestellungen.`
      : tx`${activeOrders.length} offene Bestellungen aktuell.`;
  }

  // Filtered kanban cards
  const filteredCards = filterStatus
    ? kanbanCards.filter(c => c.column === filterStatus)
    : kanbanCards;

  const firstHeuteFaelligOhneFahrer = heuteFaelligOhneFahrer[0];

  return (
    <>
      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog.open}
        onClose={() => setBestellDialog({ open: false })}
        onSubmit={async fields => {
          if (bestellDialog.recordId) {
            await LivingAppsService.updateBestellverwaltungEntry(bestellDialog.recordId, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellDialog.defaults}
        recordId={bestellDialog.recordId}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />
      <FahrerverwaltungDialog
        open={fahrerDialog.open}
        onClose={() => setFahrerDialog({ open: false })}
        onSubmit={async fields => {
          if (fahrerDialog.recordId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerDialog.recordId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        recordId={fahrerDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />
      <KundenverwaltungDialog
        open={kundeDialog.open}
        onClose={() => setKundeDialog({ open: false })}
        onSubmit={async fields => {
          if (kundeDialog.recordId) {
            await LivingAppsService.updateKundenverwaltungEntry(kundeDialog.recordId, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        recordId={kundeDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={tx('Bestellung löschen')}
        description={tx('Diese Bestellung wird unwiderruflich gelöscht.')}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await LivingAppsService.deleteBestellverwaltungEntry(deleteTarget);
          fetchAll();
          setDeleteTarget(null);
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Overlay host — one shell for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.kundeName || tx('Bestellung')}
                  subtitle={r.fields.desired_delivery_time ? formatDateTime(r.fields.desired_delivery_time) : undefined}
                  badges={r.fields.order_status ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {r.fields.order_status.label}
                    </span>
                  ) : undefined}
                />
                <BestellverwaltungDetails
                  record={r}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={rec => overlay.push({ type: 'fahrerverwaltung', record: rec })}
                  onOpenKundenverwaltung={rec => overlay.push({ type: 'kundenverwaltung', record: rec })}
                />
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.driver_first_name, r.fields.driver_last_name].filter(Boolean).join(' ') || appLabel('fahrerverwaltung')}
                  subtitle={r.fields.delivery_zone}
                  badges={r.fields.driver_status ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {r.fields.driver_status.label}
                    </span>
                  ) : undefined}
                />
                <FahrerverwaltungDetails
                  record={r}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={rec => {
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === rec.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => setBestellDialog({
                    open: true,
                    defaults: { fahrer: r.record_id },
                  })}
                />
              </>
            );
          }
          if (top.type === 'kundenverwaltung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.first_name, r.fields.last_name].filter(Boolean).join(' ') || appLabel('kundenverwaltung')}
                  subtitle={[r.fields.street, r.fields.house_number].filter(Boolean).join(' ')}
                  badges={r.fields.customer_status ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {r.fields.customer_status.label}
                    </span>
                  ) : undefined}
                />
                <KundenverwaltungDetails
                  record={r}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={rec => {
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === rec.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => setBestellDialog({
                    open: true,
                    defaults: { kunde: r.record_id },
                  })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellverwaltung') {
            const r = top.record;
            const s = lookupKey(r.fields.order_status);
            if (s === 'geliefert' || s === 'storniert') return undefined;
            const nextMap: Record<string, string> = {
              neu: 'in_bearbeitung',
              in_bearbeitung: 'bereit_zur_lieferung',
              bereit_zur_lieferung: 'unterwegs',
              unterwegs: 'geliefert',
            };
            const nextStatus = s ? nextMap[s] : undefined;
            const nextLabel: Record<string, string> = {
              in_bearbeitung: tx('In Bearbeitung setzen'),
              bereit_zur_lieferung: tx('Bereit zur Lieferung'),
              unterwegs: tx('Unterwegs melden'),
              geliefert: tx('Als geliefert markieren'),
            };
            if (!nextStatus) return undefined;
            return {
              label: nextLabel[nextStatus] ?? tx('Weiterschalten'),
              onClick: () => { advanceStatus(r, nextStatus); overlay.close(); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            setBestellDialog({ open: true, defaults: top.record.fields as BestellverwaltungDialogDefaults, recordId: top.record.record_id });
          } else if (top.type === 'fahrerverwaltung') {
            setFahrerDialog({ open: true, recordId: top.record.record_id });
          } else if (top.type === 'kundenverwaltung') {
            setKundeDialog({ open: true, recordId: top.record.record_id });
          }
        }}
      />

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">{contextLine}</p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heuteFaelligOhneFahrer.length > 0 && firstHeuteFaelligOhneFahrer ? (
          <HeroBanner
            icon={<IconUserOff size={18} />}
            action={{
              label: verfuegbareFahrer.length > 0
                ? tx('Fahrer zuweisen')
                : tx('Bestellung öffnen'),
              onClick: () => {
                if (verfuegbareFahrer.length > 0) {
                  assignNextDriver(firstHeuteFaelligOhneFahrer);
                } else {
                  overlay.replace({ type: 'bestellverwaltung', record: firstHeuteFaelligOhneFahrer });
                }
              },
            }}
          >
            <b>{namen(heuteFaelligOhneFahrer.map(r => r.kundeName).filter(Boolean))}</b>
            {' '}{heuteFaelligOhneFahrer.length === 1
              ? tx('— Bestellung heute fällig, kein Fahrer zugewiesen.')
              : tx`— ${heuteFaelligOhneFahrer.length} Bestellungen heute fällig ohne Fahrer.`}
            {verfuegbarText ? <> {tx`Verfügbar: ${verfuegbarText}.`}</> : null}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Neu')}
              value={neu.length}
              icon={<IconPackage size={16} />}
              tone={neu.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilterStatus(f => f === 'neu' ? null : 'neu')}
              active={filterStatus === 'neu'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegs.length}
              icon={<IconTruckDelivery size={16} />}
              tone={unterwegs.length > 0 ? 'primary' : 'default'}
              onClick={() => setFilterStatus(f => f === 'unterwegs' ? null : 'unterwegs')}
              active={filterStatus === 'unterwegs'}
            />
            <StatStripItem
              title={tx('Geliefert heute')}
              value={geliefert.filter(r => (r.fields.desired_delivery_time ?? '').startsWith(todayPrefix)).length}
              icon={<IconCircleCheck size={16} />}
              tone="success"
            />
            <StatStripItem
              title={tx('Ohne Fahrer')}
              value={ohnefahrer.length}
              icon={<IconUserOff size={16} />}
              tone={ohnefahrer.length > 0 ? 'destructive' : 'default'}
              onClick={() => setFilterStatus(f => f === '__ohnefahrer' ? null : '__ohnefahrer')}
              active={filterStatus === '__ohnefahrer'}
            />
            <StatStripItem
              title={tx('Fahrer aktiv')}
              value={fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz').length}
              icon={<IconUsers size={16} />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={filterStatus === '__ohnefahrer'
              ? kanbanCards.filter(c => {
                const id = c.id.split(':')[1];
                const r = enrichedBestellverwaltung.find(x => x.record_id === id);
                return r ? !r.fields.fahrer : false;
              })
              : filteredCards
            }
            defaultCollapsed={['storniert']}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              const r = enrichedBestellverwaltung.find(x => x.record_id === id);
              if (r) overlay.replace({ type: 'bestellverwaltung', record: r });
            }}
            onCardMove={handleCardMove}
            onAddCard={column => {
              setBestellDialog({
                open: true,
                defaults: { order_status: column },
              });
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute fällig')}
              items={heuteFaellig.map(r => {
                const s = lookupKey(r.fields.order_status);
                const nextMap: Record<string, string> = {
                  neu: 'in_bearbeitung',
                  in_bearbeitung: 'bereit_zur_lieferung',
                  bereit_zur_lieferung: 'unterwegs',
                  unterwegs: 'geliefert',
                };
                const nextStatus = s ? nextMap[s] : undefined;
                const advanceLabel: Record<string, string> = {
                  in_bearbeitung: tx('→ Bearbeitung'),
                  bereit_zur_lieferung: tx('→ Bereit'),
                  unterwegs: tx('→ Unterwegs'),
                  geliefert: tx('✓ Geliefert'),
                };
                return {
                  id: r.record_id,
                  title: r.kundeName || tx('Unbekannter Kunde'),
                  secondLine: (
                    <>
                      <span className={
                        s === 'unterwegs' ? 'font-medium text-primary' :
                        s === 'neu' ? 'font-medium text-warning-foreground' :
                        'font-medium text-foreground'
                      }>
                        {r.fields.order_status?.label ?? tx('Kein Status')}
                      </span>
                      {r.fields.desired_delivery_time
                        ? <span className="text-muted-foreground"> · {formatDateTime(r.fields.desired_delivery_time)}</span>
                        : null}
                      {!r.fields.fahrer
                        ? <span className="text-destructive ml-1">· {tx('kein Fahrer')}</span>
                        : null}
                    </>
                  ),
                  action: nextStatus ? {
                    label: advanceLabel[nextStatus] ?? tx('Weiter'),
                    onClick: () => advanceStatus(r, nextStatus),
                  } : undefined,
                };
              })}
              onItemClick={id => {
                const r = enrichedBestellverwaltung.find(x => x.record_id === id);
                if (r) overlay.replace({ type: 'bestellverwaltung', record: r });
              }}
              empty={{
                text: tx('Keine Lieferungen heute — alles planmäßig.'),
                action: {
                  label: tx('Neue Bestellung'),
                  onClick: () => setBestellDialog({ open: true }),
                },
              }}
            />
            <ChartWidget
              title={tx('Umsatz nach Monat')}
              rows={bestellChartRows}
              dimension={{
                kind: 'time',
                accessor: r => r.data.fields.order_date ?? null,
              }}
              measure={{
                aggregate: 'sum',
                label: tx('Umsatz'),
                value: r => r.data.fields.total_amount ?? null,
                format: 'currency',
              }}
              timeEnd={format(clock, "yyyy-MM-dd'T'HH:mm")}
            />
          </>
        }
      />
    </>
  );
}
