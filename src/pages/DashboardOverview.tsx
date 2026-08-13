import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconTruck,
  IconClock,
  IconCircleCheck,
  IconAlertTriangle,
  IconPlus,
  IconUser,
  IconPackage,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'kundenverwaltung'; record: Kundenverwaltung }
  | { type: 'fahrerverwaltung'; record: Fahrerverwaltung }
  | { type: 'bestellverwaltung'; record: EnrichedBestellverwaltung };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'storniert') return 'default';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'in_bearbeitung') return 'primary';
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
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestell, setEditingBestell] = useState<EnrichedBestellverwaltung | undefined>(undefined);
  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>(undefined);
  const [kundeDialog, setKundeDialog] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>(undefined);

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () => enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? 'neu';
      return {
        id: `bestellverwaltung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fields.order_date
          ? formatDateTime(b.fields.order_date)
          : undefined,
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung],
  );

  // KPI counts
  const neuCount = useMemo(() => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu').length, [bestellverwaltung]);
  const unterwegsCount = useMemo(() => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs').length, [bestellverwaltung]);
  const geliefertHeute = useMemo(() => {
    const todayKey = format(clock, 'yyyy-MM-dd');
    return bestellverwaltung.filter(b => {
      const key = lookupKey(b.fields.order_status);
      if (key !== 'geliefert') return false;
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date;
      return dt ? dt.startsWith(todayKey) : false;
    }).length;
  }, [bestellverwaltung, clock]);
  const fahrerImEinsatz = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // Pending (neu + in_bearbeitung) for hero
  const pendingBestell = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s === 'neu' || s === 'bereit_zur_lieferung';
    }).sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung],
  );

  // Unterwegs orders list
  const unterwegsListe = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs')
      .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung],
  );

  // Context names for greeting
  const unterwegsNamen = useMemo(
    () => namen(unterwegsListe.map(b => b.kundeName).filter(Boolean) as string[]),
    [unterwegsListe],
  );

  // Advance status helper
  function advanceStatus(b: EnrichedBestellverwaltung) {
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const stages = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const nextIdx = stages.indexOf(current) + 1;
    if (nextIdx >= stages.length) return;
    const next = stages[nextIdx];
    const prevStatus = b.fields.order_status;
    // Optimistic
    setBestellverwaltung(prev =>
      prev.map(r => r.record_id === b.record_id
        ? { ...r, fields: { ...r.fields, order_status: lookupOption('bestellverwaltung', 'order_status', next) } }
        : r,
      ),
    );
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const kundeName = b.kundeName || tx('Bestellung');
    undoToast(
      tx`${kundeName} → ${nextLabel}`,
      () => {
        setBestellverwaltung(prev =>
          prev.map(r => r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
            : r,
          ),
        );
        LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: lookupKey(prevStatus) ?? current }).catch(fetchAll);
      },
    );
    LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next }).catch(() => fetchAll());
  }

  // Move card (Kanban drag)
  async function moveCard(cardId: string, newColumn: string): Promise<void | string> {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const rec = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!rec) return;
    const prevStatus = rec.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(r => r.record_id === rid
        ? { ...r, fields: { ...r.fields, order_status: lookupOption('bestellverwaltung', 'order_status', newColumn) } }
        : r,
      ),
    );
    const col = COLUMNS.find(c => c.key === newColumn);
    const kundeName = rec.kundeName || tx('Bestellung');
    undoToast(
      tx`${kundeName} → ${col?.label ?? newColumn}`,
      () => {
        setBestellverwaltung(prev =>
          prev.map(r => r.record_id === rid
            ? { ...r, fields: { ...r.fields, order_status: prevStatus } }
            : r,
          ),
        );
        LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prevStatus) ?? newColumn }).catch(fetchAll);
      },
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }

  // Fahrer status advance
  function toggleFahrerStatus(f: Fahrerverwaltung) {
    const current = lookupKey(f.fields.driver_status) ?? 'verfuegbar';
    const next = current === 'im_einsatz' ? 'verfuegbar' : 'im_einsatz';
    const prev = f.fields.driver_status;
    setFahrerverwaltung(prev2 =>
      prev2.map(r => r.record_id === f.record_id
        ? { ...r, fields: { ...r.fields, driver_status: lookupOption('fahrerverwaltung', 'driver_status', next) } }
        : r,
      ),
    );
    const name = [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer');
    undoToast(
      tx`${name} — Status geändert`,
      () => {
        setFahrerverwaltung(prev2 =>
          prev2.map(r => r.record_id === f.record_id
            ? { ...r, fields: { ...r.fields, driver_status: prev } }
            : r,
          ),
        );
        LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: lookupKey(prev) ?? current }).catch(fetchAll);
      },
    );
    LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: next }).catch(() => fetchAll());
  }

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const contextLine = unterwegsListe.length > 0
    ? tx`Aktuell unterwegs: ${unterwegsNamen}`
    : neuCount > 0
    ? tx`${neuCount} neue Bestellungen warten auf Bearbeitung.`
    : tx`Alles läuft rund — keine offenen Bestellungen.`;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          onClick={() => { setBestellDefaults(undefined); setEditingBestell(undefined); setBestellDialog(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={pendingBestell.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Weiterschalten'),
              onClick: () => advanceStatus(pendingBestell[0]),
            }}
          >
            <b>{namen(pendingBestell.map(b => b.kundeName).filter(Boolean) as string[], 3)}</b>
            {' '}{pendingBestell.length === 1 ? tx('wartet auf Weiterleitung.') : tx('warten auf Weiterleitung.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Neu')}
              value={neuCount}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={neuCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsCount}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Heute geliefert')}
              value={geliefertHeute}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
              tone={geliefertHeute > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrer im Einsatz')}
              value={fahrerImEinsatz.length}
              icon={<IconUser size={16} className="shrink-0" />}
              tone={fahrerImEinsatz.length > 0 ? 'primary' : 'default'}
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
              const rec = enrichedBestellverwaltung.find(b => b.record_id === rid);
              if (rec) overlay.replace({ type: 'bestellverwaltung', record: rec });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellDefaults({ order_status: column });
              setEditingBestell(undefined);
              setBestellDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Unterwegs')}
              items={unterwegsListe.map(b => ({
                id: b.record_id,
                title: b.kundeName || tx('Unbekannter Kunde'),
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{tx('Unterwegs')}</span>
                    {b.fahrerName && (
                      <span className="text-muted-foreground"> · {b.fahrerName}</span>
                    )}
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · <IconClock size={12} className="inline shrink-0" /> {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Geliefert'),
                  onClick: () => advanceStatus(b),
                },
              }))}
              onItemClick={id => {
                const rec = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (rec) overlay.replace({ type: 'bestellverwaltung', record: rec });
              }}
              empty={{
                text: tx('Keine Lieferungen unterwegs — alles geliefert!'),
                action: { label: tx('Neue Bestellung'), onClick: () => { setBestellDefaults(undefined); setEditingBestell(undefined); setBestellDialog(true); } },
              }}
            />
            <WorkList
              title={tx('Fahrer')}
              items={fahrerverwaltung.map(f => {
                const status = lookupKey(f.fields.driver_status) ?? 'verfuegbar';
                const isImEinsatz = status === 'im_einsatz';
                const name = [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ');
                return {
                  id: f.record_id,
                  title: name || tx('Fahrer'),
                  secondLine: (
                    <>
                      <span className={isImEinsatz ? 'font-medium text-primary' : 'font-medium text-muted-foreground'}>
                        {f.fields.driver_status?.label ?? status}
                      </span>
                      {f.fields.delivery_zone && (
                        <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                      )}
                    </>
                  ),
                  action: {
                    label: isImEinsatz ? tx('Verfügbar') : tx('Im Einsatz'),
                    onClick: () => toggleFahrerStatus(f),
                  },
                };
              })}
              onItemClick={id => {
                const rec = fahrerverwaltung.find(f => f.record_id === id);
                if (rec) overlay.replace({ type: 'fahrerverwaltung', record: rec });
              }}
              empty={{
                text: tx('Noch keine Fahrer angelegt.'),
                action: { label: tx('Fahrer anlegen'), onClick: () => { setEditingFahrer(undefined); setFahrerDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay host — ONE shell for the entire stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    <span className="text-sm font-medium">{formatCurrency(b.fields.total_amount)}</span>
                  }
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={r => overlay.push({ type: 'fahrerverwaltung', record: r })}
                  onOpenKundenverwaltung={r => overlay.push({ type: 'kundenverwaltung', record: r })}
                />
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record as Fahrerverwaltung;
            const name = [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ');
            return (
              <>
                <RecordHeader
                  title={name || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={r => {
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === r.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setEditingBestell(undefined);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kundenverwaltung') {
            const k = top.record as Kundenverwaltung;
            const name = [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ');
            return (
              <>
                <RecordHeader
                  title={name || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={r => {
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === r.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: k.record_id });
                    setEditingBestell(undefined);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            const status = lookupKey(b.fields.order_status) ?? 'neu';
            const stages = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
            const nextIdx = stages.indexOf(status) + 1;
            if (nextIdx >= stages.length || status === 'storniert') return null;
            const nextKey = stages[nextIdx];
            const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextKey)?.label ?? nextKey;
            return {
              label: tx`→ ${nextLabel}`,
              onClick: () => {
                advanceStatus(b);
                overlay.close();
              },
            };
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record as Fahrerverwaltung;
            const status = lookupKey(f.fields.driver_status) ?? 'verfuegbar';
            const isImEinsatz = status === 'im_einsatz';
            return {
              label: isImEinsatz ? tx('Als verfügbar markieren') : tx('Im Einsatz markieren'),
              onClick: () => {
                toggleFahrerStatus(f);
                overlay.close();
              },
            };
          }
          return null;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            setEditingBestell(b);
            setBestellDefaults(undefined);
            setBestellDialog(true);
            overlay.close();
          } else if (top.type === 'fahrerverwaltung') {
            setEditingFahrer(top.record as Fahrerverwaltung);
            setFahrerDialog(true);
            overlay.close();
          } else if (top.type === 'kundenverwaltung') {
            setEditingKunde(top.record as Kundenverwaltung);
            setKundeDialog(true);
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => { setBestellDialog(false); setEditingBestell(undefined); setBestellDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingBestell) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestell.record_id, fields as any);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingBestell ? editingBestell.fields as any : bestellDefaults}
        recordId={editingBestell?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialog}
        onClose={() => { setFahrerDialog(false); setEditingFahrer(undefined); }}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields as any);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingFahrer?.fields as any}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialog}
        onClose={() => { setKundeDialog(false); setEditingKunde(undefined); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields as any);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingKunde?.fields as any}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
