import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { formatDateTime } from '@/lib/formatters';
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
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconPlus,
  IconTruck,
  IconPackage,
  IconUsers,
  IconCircleCheck,
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
        id: `bestellverwaltung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fields.ordered_items?.slice(0, 40),
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  // KPIs
  const aktiveBestellungen = useMemo(
    () => bestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s !== 'geliefert' && s !== 'storniert';
    }),
    [bestellverwaltung],
  );
  const unterwegsBestellungen = useMemo(
    () => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [bestellverwaltung],
  );
  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );
  const imEinsatzFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung],
  );

  // Today's orders
  const todayKey = format(clock, 'yyyy-MM-dd');
  const heuteBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  // Hero: orders "unterwegs" without a driver assigned
  const ohnefahrer = useMemo(
    () => enrichedBestellverwaltung.filter(b =>
      lookupKey(b.fields.order_status) === 'bereit_zur_lieferung' && !b.fields.fahrer,
    ),
    [enrichedBestellverwaltung],
  );

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editTarget, setEditTarget] = useState<EnrichedBestellverwaltung | undefined>(undefined);

  // Advance status helper (shared across hero, worklist, overlay footer)
  const advanceStatus = useCallback((bestellung: EnrichedBestellverwaltung) => {
    const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const current = lookupKey(bestellung.fields.order_status) ?? 'neu';
    const idx = statusOrder.indexOf(current);
    if (idx < 0 || idx >= statusOrder.length - 1) return;
    const next = statusOrder[idx + 1];
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const prevStatus = bestellung.fields.order_status;

    // Optimistic
    setBestellverwaltung(prev => prev.map(b =>
      b.record_id === bestellung.record_id
        ? { ...b, fields: { ...b.fields, order_status: { key: next, label: nextLabel } } }
        : b,
    ));

    LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: next }).catch(() => fetchAll());

    undoToast(
      tx`${bestellung.kundeName || tx('Bestellung')} — ${nextLabel}`,
      () => {
        setBestellverwaltung(prev => prev.map(b =>
          b.record_id === bestellung.record_id
            ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
            : b,
        ));
        LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: prevStatus as any }).catch(() => fetchAll());
      },
    );
  }, [setBestellverwaltung, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const bestellung = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!bestellung) return;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const prevStatus = bestellung.fields.order_status;

    setBestellverwaltung(prev => prev.map(b =>
      b.record_id === rid
        ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newLabel } } }
        : b,
    ));

    LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn }).catch(() => fetchAll());

    undoToast(
      tx`${bestellung.kundeName || tx('Bestellung')} — ${newLabel}`,
      () => {
        setBestellverwaltung(prev => prev.map(b =>
          b.record_id === rid
            ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
            : b,
        ));
        LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevStatus as any }).catch(() => fetchAll());
      },
    );
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const unterwegsNamen = namen(unterwegsBestellungen.map(b => {
    const eb = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
    return eb?.kundeName ?? '';
  }));
  const contextLine = unterwegsBestellungen.length > 0
    ? tx`${unterwegsNamen} — unterwegs`
    : aktiveBestellungen.length > 0
      ? tx`${String(aktiveBestellungen.length)} aktive Bestellungen`
      : tx('Keine aktiven Bestellungen');

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          onClick={() => { setCreateDefaults(undefined); setCreateOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ohnefahrer.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Fahrer zuweisen'),
              onClick: () => {
                setEditTarget(ohnefahrer[0]);
                setCreateOpen(true);
              },
            }}
          >
            <b>{namen(ohnefahrer.map(b => b.kundeName ?? ''))}</b>{' '}
            {tx('bereit zur Lieferung — noch kein Fahrer zugewiesen.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Aktiv')}
              value={aktiveBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={aktiveBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsBestellungen.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrer verfügbar')}
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tx('Im Einsatz')}
              value={imEinsatzFahrer.length}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
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
              setCreateDefaults({ order_status: column });
              setEditTarget(undefined);
              setCreateOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute fällig')}
              items={heuteBestellungen.map(b => {
                const statusKey = lookupKey(b.fields.order_status);
                const isUnderway = statusKey === 'unterwegs';
                const isDone = statusKey === 'geliefert';
                const nextLabel = !isDone && statusKey !== 'storniert'
                  ? tx('Weiterschalten')
                  : undefined;
                return {
                  id: b.record_id,
                  title: b.kundeName || tx('Unbekannter Kunde'),
                  secondLine: (
                    <>
                      <span className={isUnderway ? 'font-medium text-primary' : 'font-medium text-muted-foreground'}>
                        {b.fields.order_status?.label ?? '—'}
                      </span>
                      {b.fields.desired_delivery_time && (
                        <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                      )}
                    </>
                  ),
                  action: nextLabel && !isDone && statusKey !== 'storniert'
                    ? { label: '→', onClick: () => advanceStatus(b) }
                    : undefined,
                };
              })}
              onItemClick={id => {
                const b = enrichedBestellverwaltung.find(x => x.record_id === id);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              empty={{
                text: tx('Keine Lieferungen für heute geplant'),
                action: { label: tx('Bestellung anlegen'), onClick: () => setCreateOpen(true) },
              }}
            />
            <WorkList
              title={tx('Fahrer-Status')}
              items={fahrerverwaltung.map(f => {
                const statusKey = lookupKey(f.fields.driver_status);
                const isVerfuegbar = statusKey === 'verfuegbar';
                return {
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || tx('Fahrer'),
                  secondLine: (
                    <>
                      <span className={isVerfuegbar ? 'font-medium text-success' : 'font-medium text-muted-foreground'}>
                        {f.fields.driver_status?.label ?? '—'}
                      </span>
                      {f.fields.vehicle_type?.label && (
                        <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                      )}
                    </>
                  ),
                };
              })}
              onItemClick={id => {
                const f = fahrerverwaltung.find(x => x.record_id === id);
                if (f) overlay.replace({ type: 'fahrerverwaltung', record: f });
              }}
              empty={{ text: tx('Keine Fahrer erfasst') }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setEditTarget(undefined); setCreateDefaults(undefined); }}
        onSubmit={async fields => {
          if (editTarget) {
            await LivingAppsService.updateBestellverwaltungEntry(editTarget.record_id, fields as any);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields as any);
          }
          fetchAll();
        }}
        defaultValues={editTarget ? editTarget.fields as any : createDefaults}
        recordId={editTarget?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={false}
        enablePhotoLocation={false}
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            return (
              <>
                <RecordHeader
                  title={top.record.kundeName || appLabel('bestellverwaltung')}
                  subtitle={top.record.fields.order_status?.label}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {top.record.fields.order_status?.label}
                    </span>
                  }
                />
                <BestellverwaltungDetails
                  record={top.record}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrerverwaltung', record: f })}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kundenverwaltung', record: k })}
                />
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            return (
              <>
                <RecordHeader
                  title={`${top.record.fields.driver_first_name ?? ''} ${top.record.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={top.record.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={top.record}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const eb = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
                    if (eb) overlay.push({ type: 'bestellverwaltung', record: eb });
                  }}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ fahrer: top.record.record_id });
                    setEditTarget(undefined);
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kundenverwaltung') {
            return (
              <>
                <RecordHeader
                  title={`${top.record.fields.first_name ?? ''} ${top.record.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={top.record.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={top.record}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => {
                    const eb = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
                    if (eb) overlay.push({ type: 'bestellverwaltung', record: eb });
                  }}
                  onAddBestellverwaltung={() => {
                    setCreateDefaults({ kunde: top.record.record_id });
                    setEditTarget(undefined);
                    setCreateOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type !== 'bestellverwaltung') return undefined;
          const statusKey = lookupKey(top.record.fields.order_status);
          const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
          const idx = statusOrder.indexOf(statusKey ?? '');
          if (idx < 0 || idx >= statusOrder.length - 1) return undefined;
          const nextKey = statusOrder[idx + 1];
          const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextKey)?.label ?? nextKey;
          return { label: `→ ${nextLabel}`, onClick: () => advanceStatus(top.record) };
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            setEditTarget(top.record);
            setCreateOpen(true);
          }
        }}
      />
    </>
  );
}
