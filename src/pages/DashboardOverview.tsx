import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  MapWidget,
  MapRouteLinks,
  type MapMarker,
} from '@/components/widgets/MapWidget';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import {
  IconAlertTriangle,
  IconPlus,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'kundenverwaltung'; record: Kundenverwaltung }
  | { type: 'fahrerverwaltung'; record: Fahrerverwaltung }
  | { type: 'bestellverwaltung'; record: EnrichedBestellverwaltung };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'warning';
}

function toneForDriverStatus(status: string | undefined): 'success' | 'warning' | 'destructive' | 'default' {
  if (status === 'verfuegbar') return 'success';
  if (status === 'im_einsatz') return 'primary' as any;
  if (status === 'nicht_verfuegbar') return 'warning';
  return 'default';
}

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung, setFahrerverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

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
      const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : (b.fahrerName || undefined),
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  const todayKey = format(clock, 'yyyy-MM-dd');

  const bestellungenHeute = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  const unterwegs = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const ohnefahrer = useMemo(
    () => unterwegs.filter(b => !extractRecordId(b.fields.fahrer)),
    [unterwegs],
  );

  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const umsatzHeute = useMemo(
    () => bestellungenHeute.reduce((s, b) => s + (b.fields.total_amount ?? 0), 0),
    [bestellungenHeute],
  );

  const markers = useMemo<MapMarker[]>(
    () => enrichedBestellverwaltung.flatMap(b => {
      const geo = b.fields.delivery_location;
      if (!geo) return [];
      const status = lookupKey(b.fields.order_status);
      return [{
        id: `bestellung:${b.record_id}`,
        lat: geo.lat,
        long: geo.long,
        title: b.kundeName || tx('Bestellung'),
        subtitle: geo.info,
        tone: status === 'geliefert' ? 'success' : status === 'unterwegs' ? 'primary' : 'warning',
        icon: 'truck' as const,
      }];
    }),
    [enrichedBestellverwaltung],
  );

  // Dialog state
  const [bestellungDialog, setBestellungDialog] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>();
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | undefined>();

  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>();

  const [kundeDialog, setKundeDialog] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>();

  // Advance order status (shared helper)
  const STATUS_NEXT: Record<string, string> = {
    'neu': 'in_bearbeitung',
    'in_bearbeitung': 'bereit_zur_lieferung',
    'bereit_zur_lieferung': 'unterwegs',
    'unterwegs': 'geliefert',
  };

  const advanceBestellung = useCallback(async (b: EnrichedBestellverwaltung) => {
    const current = lookupKey(b.fields.order_status);
    const next = current ? STATUS_NEXT[current] : 'in_bearbeitung';
    if (!next) return;
    const prev = b.fields.order_status;
    setBestellverwaltung(bs => bs.map(x =>
      x.record_id === b.record_id
        ? { ...x, fields: { ...x.fields, order_status: lookupOption('bestellverwaltung', 'order_status', next) } }
        : x
    ));
    undoToast(
      tx`${b.kundeName || tx('Bestellung')} — ${lookupOption('bestellverwaltung', 'order_status', next).label}`,
      async () => {
        setBestellverwaltung(bs => bs.map(x =>
          x.record_id === b.record_id ? { ...x, fields: { ...x.fields, order_status: prev } } : x
        ));
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: current ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
    if (!b) return;
    const prev = b.fields.order_status;
    const prevKey = lookupKey(prev);
    setBestellverwaltung(bs => bs.map(x =>
      x.record_id === rid
        ? { ...x, fields: { ...x.fields, order_status: lookupOption('bestellverwaltung', 'order_status', newColumn) } }
        : x
    ));
    undoToast(
      tx`${b.kundeName || tx('Bestellung')} — ${lookupOption('bestellverwaltung', 'order_status', newColumn).label}`,
      async () => {
        setBestellverwaltung(bs => bs.map(x =>
          x.record_id === rid ? { ...x, fields: { ...x.fields, order_status: prev } } : x
        ));
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevKey ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  const setFahrerStatus = useCallback(async (f: Fahrerverwaltung, nextStatus: string) => {
    const prev = f.fields.driver_status;
    setFahrerverwaltung(fs => fs.map(x =>
      x.record_id === f.record_id
        ? { ...x, fields: { ...x.fields, driver_status: lookupOption('fahrerverwaltung', 'driver_status', nextStatus) } }
        : x
    ));
    undoToast(
      tx`${[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ')} — ${lookupOption('fahrerverwaltung', 'driver_status', nextStatus).label}`,
      async () => {
        setFahrerverwaltung(fs => fs.map(x =>
          x.record_id === f.record_id ? { ...x, fields: { ...x.fields, driver_status: prev } } : x
        ));
        await LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: lookupKey(prev) ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: nextStatus });
    } catch {
      await fetchAll();
    }
  }, [setFahrerverwaltung, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const greeting = gruss(clock);
  const contextLine = (() => {
    if (bestellungenHeute.length === 0) return tx('Heute stehen keine Lieferungen an.');
    const kundenHeute = bestellungenHeute.map(b => b.kundeName).filter(Boolean) as string[];
    const parts: string[] = [];
    if (kundenHeute.length > 0) parts.push(tx`Heute liefern wir an ${namen(kundenHeute)}.`);
    if (verfuegbareFahrer.length > 0) {
      const fahrerNamen = verfuegbareFahrer.map(f => f.fields.driver_first_name).filter(Boolean) as string[];
      parts.push(tx`${namen(fahrerNamen)} ${verfuegbareFahrer.length === 1 ? tx('ist verfügbar') : tx('sind verfügbar')}.`);
    }
    return parts.join(' ');
  })();

  const heroBestellung = ohnefahrer[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{greeting}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{contextLine}</p>
        </div>
        <button
          onClick={() => { setEditingBestellung(undefined); setBestellungDefaults(undefined); setBestellungDialog(true); }}
          className="mt-3 sm:mt-0 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBestellung ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Fahrer zuweisen'),
              onClick: () => {
                setEditingBestellung(heroBestellung);
                setBestellungDefaults(heroBestellung.fields as BestellverwaltungDialogDefaults);
                setBestellungDialog(true);
              },
            }}
          >
            <b>{namen(ohnefahrer.map(b => b.kundeName).filter(Boolean) as string[])}</b>{' '}
            {tx('unterwegs ohne Fahrer')} — {ohnefahrer.length > 1 ? tx`${ohnefahrer.length} Bestellungen betroffen` : tx('bitte Fahrer zuweisen')}.
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Heute')}
              value={bestellungenHeute.length}
              tone={bestellungenHeute.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegs.length}
              tone={unterwegs.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrer verfügbar')}
              value={verfuegbareFahrer.length}
              tone={verfuegbareFahrer.length === 0 ? 'warning' : 'success'}
            />
            <StatStripItem
              title={tx('Umsatz heute')}
              value={formatCurrency(umsatzHeute)}
              tone="default"
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
              const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
              if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setEditingBestellung(undefined);
              setBestellungDefaults({ order_status: column });
              setBestellungDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute & dringend')}
              items={[
                ...bestellungenHeute
                  .filter(b => lookupKey(b.fields.order_status) !== 'geliefert' && lookupKey(b.fields.order_status) !== 'storniert')
                  .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? ''))
                  .slice(0, 8)
                  .map(b => {
                    const status = lookupKey(b.fields.order_status);
                    const next = status ? STATUS_NEXT[status] : undefined;
                    const statusLabel = b.fields.order_status?.label ?? status ?? '—';
                    const statusColor = status === 'unterwegs' ? 'text-primary font-medium'
                      : status === 'bereit_zur_lieferung' ? 'text-warning font-medium'
                      : 'text-muted-foreground';
                    return {
                      id: b.record_id,
                      title: b.kundeName || tx('Unbekannter Kunde'),
                      secondLine: (
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={statusColor}>{statusLabel}</span>
                          {b.fields.desired_delivery_time && (
                            <span className="text-muted-foreground shrink-0">· {formatDateTime(b.fields.desired_delivery_time)}</span>
                          )}
                        </span>
                      ),
                      action: next ? {
                        label: `→ ${lookupOption('bestellverwaltung', 'order_status', next).label}`,
                        onClick: () => advanceBestellung(b),
                      } : undefined,
                    };
                  }),
              ]}
              onItemClick={id => {
                const b = enrichedBestellverwaltung.find(x => x.record_id === id);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              empty={{
                text: tx('Alle heutigen Lieferungen sind erledigt'),
                action: {
                  label: tx('Neue Bestellung'),
                  onClick: () => { setEditingBestellung(undefined); setBestellungDefaults(undefined); setBestellungDialog(true); },
                },
              }}
            />
            <MapWidget
              markers={markers}
              onMarkerClick={m => {
                const rid = m.id.split(':')[1];
                const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellungDialog}
        onClose={() => setBestellungDialog(false)}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialog}
        onClose={() => setFahrerDialog(false)}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingFahrer?.fields}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => {
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

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            setEditingBestellung(top.record);
            setBestellungDefaults(top.record.fields as BestellverwaltungDialogDefaults);
            setBestellungDialog(true);
          } else if (top.type === 'fahrerverwaltung') {
            setEditingFahrer(top.record);
            setFahrerDialog(true);
          } else if (top.type === 'kundenverwaltung') {
            setEditingKunde(top.record);
            setKundeDialog(true);
          }
        }}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record;
            const status = lookupKey(b.fields.order_status);
            const next = status ? STATUS_NEXT[status] : undefined;
            const geo = b.fields.delivery_location;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrerverwaltung', record: f })}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kundenverwaltung', record: k })}
                />
                {geo && <MapRouteLinks lat={geo.lat} long={geo.long} />}
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record;
            const driverStatus = lookupKey(f.fields.driver_status);
            return (
              <>
                <RecordHeader
                  title={[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setEditingBestellung(undefined);
                    setBestellungDefaults({ fahrer: f.record_id });
                    setBestellungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kundenverwaltung') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={[k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setEditingBestellung(undefined);
                    setBestellungDefaults({ kunde: k.record_id });
                    setBestellungDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record;
            const status = lookupKey(b.fields.order_status);
            const next = status ? STATUS_NEXT[status] : undefined;
            if (!next) return undefined;
            return {
              label: tx`→ ${lookupOption('bestellverwaltung', 'order_status', next).label}`,
              onClick: () => advanceBestellung(b),
            };
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record;
            const driverStatus = lookupKey(f.fields.driver_status);
            if (driverStatus === 'verfuegbar') {
              return {
                label: tx('Als im Einsatz markieren'),
                onClick: () => setFahrerStatus(f, 'im_einsatz'),
              };
            }
            if (driverStatus === 'im_einsatz') {
              return {
                label: tx('Als verfügbar markieren'),
                onClick: () => setFahrerStatus(f, 'verfuegbar'),
              };
            }
          }
          return undefined;
        }}
      />
    </>
  );
}
