import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { lookupKey, formatCurrency, formatDateTime } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { MapWidget, MapRouteLinks, type MapMarker, type MapTone } from '@/components/widgets/MapWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import type { FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { IconTruck, IconAlertTriangle, IconPackage, IconUsers, IconMapPin, IconPlus } from '@tabler/icons-react';

// Pre-generated overlay union — one branch per entity.
export type OverlayItem =
  | { type: 'kundenverwaltung'; record: Kundenverwaltung }
  | { type: 'fahrerverwaltung'; record: Fahrerverwaltung }
  | { type: 'bestellverwaltung'; record: EnrichedBestellverwaltung };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning'; // neu
}

function toneForDelivery(status: string | undefined): MapTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'default';
}

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellDialogOpen, setBestellDialogOpen] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellId, setEditingBestellId] = useState<string | undefined>(undefined);
  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>(undefined);
  const [editingFahrerId, setEditingFahrerId] = useState<string | undefined>(undefined);
  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [editingKundeId, setEditingKundeId] = useState<string | undefined>(undefined);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [mapView, setMapView] = useState(false);

  // Kanban columns — INSIDE component, locale-aware getter
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const today = format(clock, 'yyyy-MM-dd');

  // Active (non-cancelled) orders
  const activeBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) !== 'storniert'),
    [enrichedBestellverwaltung],
  );

  // Unterwegs orders
  const unterwegsBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  // Overdue: unterwegs with desired_delivery_time in the past
  const ueberfaellig = useMemo(
    () => unterwegsBestellungen.filter(b => {
      const dt = b.fields.desired_delivery_time;
      if (!dt) return false;
      return dt < format(clock, "yyyy-MM-dd'T'HH:mm");
    }),
    [unterwegsBestellungen, clock],
  );

  // Heute fällig
  const heuteFaellig = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time;
      if (!dt) return false;
      const dayPart = dt.slice(0, 10);
      const status = lookupKey(b.fields.order_status);
      return dayPart === today && status !== 'geliefert' && status !== 'storniert';
    }),
    [enrichedBestellverwaltung, today],
  );

  // Available drivers
  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  // Neu orders
  const neuBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu'),
    [enrichedBestellverwaltung],
  );

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () => enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `bestellverwaltung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fields.delivery_city ?? undefined,
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  // Map markers for delivery locations
  const markers = useMemo<MapMarker[]>(
    () => {
      const filtered = statusFilter
        ? enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === statusFilter)
        : enrichedBestellverwaltung;
      return filtered.flatMap(b => {
        const geo = b.fields.delivery_location;
        if (!geo) return [];
        const status = lookupKey(b.fields.order_status);
        return [{
          id: `bestellverwaltung:${b.record_id}`,
          lat: geo.lat,
          long: geo.long,
          title: b.kundeName || b.fields.delivery_city || tx('Lieferung'),
          subtitle: b.fields.delivery_street ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}`.trim() : undefined,
          tone: toneForDelivery(status),
          icon: 'truck' as const,
        }];
      });
    },
    [enrichedBestellverwaltung, statusFilter],
  );

  // Advance status helper
  const advanceStatus = useCallback((bestellung: EnrichedBestellverwaltung) => {
    const currentStatus = lookupKey(bestellung.fields.order_status) ?? 'neu';
    const STATUS_SEQUENCE = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const currentIdx = STATUS_SEQUENCE.indexOf(currentStatus);
    if (currentIdx < 0 || currentIdx >= STATUS_SEQUENCE.length - 1) return;
    const nextStatus = STATUS_SEQUENCE[currentIdx + 1];
    const prevLookup = bestellung.fields.order_status;

    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === bestellung.record_id
          ? { ...b, fields: { ...b.fields, order_status: lookupOption('bestellverwaltung', 'order_status', nextStatus) } }
          : b,
      ),
    );

    const undo = () => {
      setBestellverwaltung(prev =>
        prev.map(b =>
          b.record_id === bestellung.record_id
            ? { ...b, fields: { ...b.fields, order_status: prevLookup } }
            : b,
        ),
      );
      LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: currentStatus }).catch(() => fetchAll());
    };

    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
    undoToast(tx`${bestellung.kundeName || ''} → ${nextLabel}`, undo);

    LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: nextStatus })
      .catch(() => { fetchAll(); });
  }, [setBestellverwaltung, fetchAll]);

  // Kanban card move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const bestellung = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!bestellung) return;
    const prevLookup = bestellung.fields.order_status;
    const prevKey = lookupKey(prevLookup);

    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: lookupOption('bestellverwaltung', 'order_status', newColumn) } }
          : b,
      ),
    );

    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const undo = () => {
      setBestellverwaltung(prev =>
        prev.map(b =>
          b.record_id === rid
            ? { ...b, fields: { ...b.fields, order_status: prevLookup } }
            : b,
        ),
      );
      LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevKey ?? newColumn }).catch(() => fetchAll());
    };
    undoToast(tx`${bestellung.kundeName || ''} → ${newLabel}`, undo);

    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      fetchAll();
    }
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const unterwegsNamen = unterwegsBestellungen.map(b => b.kundeName).filter(Boolean);
  const contextLine = unterwegsBestellungen.length > 0
    ? tx`${namen(unterwegsNamen)} unterwegs — ${verfuegbareFahrer.length} Fahrer verfügbar`
    : neuBestellungen.length > 0
    ? tx`${neuBestellungen.length} neue Bestellungen — ${verfuegbareFahrer.length} Fahrer verfügbar`
    : tx`Alle Bestellungen erledigt — ${verfuegbareFahrer.length} Fahrer verfügbar`;

  const overlayRecord = overlay.top;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{gruss(clock)}</h1>
        <p className="mt-1 text-muted-foreground">{contextLine}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() => { setBestellDefaults(undefined); setEditingBestellId(undefined); setBestellDialogOpen(true); }}
          >
            <IconPlus size={15} className="shrink-0" />
            {tx('Neue Bestellung')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            onClick={() => setMapView(v => !v)}
          >
            <IconMapPin size={15} className="shrink-0" />
            {mapView ? tx('Kanban') : tx('Karte')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaellig.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Status weiterschalten'),
              onClick: () => advanceStatus(ueberfaellig[0]),
            }}
          >
            <b>{namen(ueberfaellig.map(b => b.kundeName).filter(Boolean))}</b>
            {' '}{tx('überfällig — Lieferzeit überschritten')}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsBestellungen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'unterwegs' ? null : 'unterwegs')}
              active={statusFilter === 'unterwegs'}
            />
            <StatStripItem
              title={tx('Neu')}
              value={neuBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={neuBestellungen.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'neu' ? null : 'neu')}
              active={statusFilter === 'neu'}
            />
            <StatStripItem
              title={tx('Fahrer frei')}
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length === 0 ? 'destructive' : 'success'}
            />
            <StatStripItem
              title={tx('Heute fällig')}
              value={heuteFaellig.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={heuteFaellig.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'bereit_zur_lieferung' ? null : 'bereit_zur_lieferung')}
              active={statusFilter === 'bereit_zur_lieferung'}
            />
          </StatStrip>
        }
        primary={
          mapView ? (
            <MapWidget
              markers={markers}
              onMarkerClick={m => {
                const rid = m.id.split(':')[1];
                const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              onMapPointClick={undefined}
              legend={[
                { label: tx('Neu / In Bearbeitung'), tone: 'default' },
                { label: tx('Bereit'), tone: 'warning' },
                { label: tx('Unterwegs'), tone: 'primary' },
                { label: tx('Geliefert'), tone: 'success' },
              ]}
            />
          ) : (
            <KanbanWidget
              cards={statusFilter ? cards.filter(c => c.column === statusFilter) : cards}
              columns={COLUMNS}
              defaultCollapsed={['geliefert', 'storniert']}
              onCardClick={card => {
                const rid = card.id.split(':')[1];
                const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              onCardMove={moveCard}
              onAddCard={column => {
                setBestellDefaults({ order_status: column });
                setEditingBestellId(undefined);
                setBestellDialogOpen(true);
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tx('Heute fällig & unterwegs')}
              items={heuteFaellig.slice(0, 8).map(b => ({
                id: b.record_id,
                title: b.kundeName || appLabel('bestellverwaltung'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-primary' : 'text-warning-foreground'}`}>
                      {b.fields.order_status?.label ?? '—'}
                    </span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Weiterschalten'),
                  onClick: () => advanceStatus(b),
                },
              }))}
              onItemClick={id => {
                const b = enrichedBestellverwaltung.find(x => x.record_id === id);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              empty={{
                text: neuBestellungen.length > 0
                  ? tx('Keine heutigen Lieferungen — neue Bestellungen warten')
                  : tx('Keine Lieferungen heute — alles erledigt'),
                action: { label: tx('Neue Bestellung'), onClick: () => setBestellDialogOpen(true) },
              }}
            />
            <WorkList
              title={tx('Fahrer im Überblick')}
              items={fahrerverwaltung.slice(0, 6).map(f => {
                const statusKey = lookupKey(f.fields.driver_status);
                return {
                  id: f.record_id,
                  title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || appLabel('fahrerverwaltung'),
                  secondLine: (
                    <>
                      <span className={`font-medium ${statusKey === 'verfuegbar' ? 'text-success' : statusKey === 'im_einsatz' ? 'text-primary' : 'text-muted-foreground'}`}>
                        {f.fields.driver_status?.label ?? '—'}
                      </span>
                      {f.fields.vehicle_type && (
                        <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                      )}
                    </>
                  ),
                  action: statusKey === 'im_einsatz' ? {
                    label: tx('Abmelden'),
                    onClick: () => {
                      const prev = f.fields.driver_status;
                      LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: 'verfuegbar' })
                        .then(() => fetchAll())
                        .catch(() => fetchAll());
                      undoToast(tx`${f.fields.driver_first_name ?? ''} — verfügbar gesetzt`, () => {
                        LivingAppsService.updateFahrerverwaltungEntry(f.record_id, { driver_status: prev?.key ?? 'im_einsatz' }).catch(() => fetchAll());
                        fetchAll();
                      });
                    },
                  } : undefined,
                };
              })}
              onItemClick={id => {
                const f = fahrerverwaltung.find(x => x.record_id === id);
                if (f) overlay.replace({ type: 'fahrerverwaltung', record: f });
              }}
              empty={{
                text: tx('Keine Fahrer angelegt'),
                action: { label: tx('Fahrer anlegen'), onClick: () => setFahrerDialogOpen(true) },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialogOpen}
        onClose={() => setBestellDialogOpen(false)}
        onSubmit={async fields => {
          if (editingBestellId) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellId, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellDefaults}
        recordId={editingBestellId}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => setFahrerDialogOpen(false)}
        onSubmit={async fields => {
          if (editingFahrerId) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrerId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrerDefaults}
        recordId={editingFahrerId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundenDialogOpen}
        onClose={() => setKundenDialogOpen(false)}
        onSubmit={async fields => {
          if (editingKundeId) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKundeId, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        recordId={editingKundeId}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />

      {/* Record overlay host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record;
            const geo = b.fields.delivery_location;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(b.fields.order_status) === 'geliefert' ? 'bg-success/10 text-success' :
                      lookupKey(b.fields.order_status) === 'unterwegs' ? 'bg-primary/10 text-primary' :
                      lookupKey(b.fields.order_status) === 'storniert' ? 'bg-muted text-muted-foreground' :
                      'bg-warning/10 text-warning-foreground'
                    }`}>
                      {b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : ''}
                    </span>
                  }
                />
                {geo && (
                  <div className="px-4 pb-2">
                    <MapRouteLinks lat={geo.lat} long={geo.long} />
                  </div>
                )}
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrerverwaltung', record: f })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kundenverwaltung', record: k })}
                />
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record;
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
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setEditingBestellId(undefined);
                    setBestellDialogOpen(true);
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
                    const enriched = enrichedBestellverwaltung.find(e => e.record_id === b.record_id);
                    if (enriched) overlay.push({ type: 'bestellverwaltung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: k.record_id });
                    setEditingBestellId(undefined);
                    setBestellDialogOpen(true);
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
            const STATUS_SEQUENCE = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
            const idx = STATUS_SEQUENCE.indexOf(status);
            if (idx < 0 || idx >= STATUS_SEQUENCE.length - 1) return undefined;
            const nextStatus = STATUS_SEQUENCE[idx + 1];
            const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
            return {
              label: tx`→ ${nextLabel}`,
              onClick: () => { advanceStatus(b); overlay.close(); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            setBestellDefaults(undefined);
            setEditingBestellId(b.record_id);
            setBestellDialogOpen(true);
          } else if (top.type === 'fahrerverwaltung') {
            const f = top.record as Fahrerverwaltung;
            setFahrerDefaults(undefined);
            setEditingFahrerId(f.record_id);
            setFahrerDialogOpen(true);
          } else if (top.type === 'kundenverwaltung') {
            const k = top.record as Kundenverwaltung;
            setEditingKundeId(k.record_id);
            setKundenDialogOpen(true);
          }
        }}
      />
    </>
  );
}
