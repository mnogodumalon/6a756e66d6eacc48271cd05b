import { useMemo, useState, useCallback } from 'react';
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
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconTruck, IconUsers, IconCurrencyEuro, IconAlertTriangle,
  IconPlus, IconCheck,
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

  const clock = useClock();

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const overlay = useRecordOverlayStack<OverlayItem>();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Dialog state
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [bestellEditId, setBestellEditId] = useState<string | undefined>(undefined);

  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [fahrerEditId, setFahrerEditId] = useState<string | undefined>(undefined);

  const [kundeDialog, setKundeDialog] = useState(false);
  const [kundeEditId, setKundeEditId] = useState<string | undefined>(undefined);

  // COLUMNS from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Today key
  const todayKey = format(clock, 'yyyy-MM-dd');

  // Derived data — after all hooks
  const todayBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const dl = b.fields.desired_delivery_time;
      return dl && dl.startsWith(todayKey);
    }),
    [enrichedBestellverwaltung, todayKey],
  );

  const unterwegsBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const heutigerUmsatz = useMemo(
    () => enrichedBestellverwaltung
      .filter(b => lookupKey(b.fields.order_status) === 'geliefert' && b.fields.order_date?.startsWith(todayKey))
      .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [enrichedBestellverwaltung, todayKey],
  );

  const offeneBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s === 'neu' || s === 'in_bearbeitung' || s === 'bereit_zur_lieferung';
    }),
    [enrichedBestellverwaltung],
  );

  // Cards for Kanban
  const cards = useMemo<KanbanCard[]>(
    () => {
      const filtered = statusFilter
        ? enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === statusFilter)
        : enrichedBestellverwaltung;
      return filtered.map(b => {
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
      });
    },
    [enrichedBestellverwaltung, COLUMNS, statusFilter],
  );

  // Status advance helper
  const advanceStatus = useCallback(async (order: EnrichedBestellverwaltung) => {
    const currentStatus = lookupKey(order.fields.order_status) ?? 'neu';
    const statusFlow: Record<string, string> = {
      neu: 'in_bearbeitung',
      in_bearbeitung: 'bereit_zur_lieferung',
      bereit_zur_lieferung: 'unterwegs',
      unterwegs: 'geliefert',
    };
    const nextStatus = statusFlow[currentStatus];
    if (!nextStatus) return;

    const nextLookup = lookupOption('bestellverwaltung', 'order_status', nextStatus);
    const prevLookup = order.fields.order_status;
    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(b => b.record_id === order.record_id
        ? { ...b, fields: { ...b.fields, order_status: nextLookup } }
        : b),
    );
    const label = nextLookup.label;
    undoToast(tx`${label} — Status aktualisiert`, async () => {
      setBestellverwaltung(prev =>
        prev.map(b => b.record_id === order.record_id
          ? { ...b, fields: { ...b.fields, order_status: prevLookup } }
          : b),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(order.record_id, { order_status: currentStatus });
      } catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(order.record_id, { order_status: nextStatus });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // Card move handler
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const order = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!order) return;

    const prevLookup = order.fields.order_status;
    const nextLookup = lookupOption('bestellverwaltung', 'order_status', newColumn);
    setBestellverwaltung(prev =>
      prev.map(b => b.record_id === rid
        ? { ...b, fields: { ...b.fields, order_status: nextLookup } }
        : b),
    );
    undoToast(tx`${nextLookup.label} — Status geändert`, async () => {
      setBestellverwaltung(prev =>
        prev.map(b => b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: prevLookup } }
          : b),
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prevLookup) ?? '' });
      } catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  // Context line
  const contextLine = useMemo(() => {
    if (unterwegsBestellungen.length === 0 && todayBestellungen.length === 0) {
      return tx('Noch keine Bestellungen heute — bereit für den Start!');
    }
    const names = unterwegsBestellungen.map(b => b.kundeName || tx('Unbekannt'));
    if (unterwegsBestellungen.length > 0) {
      return tx`${namen(names, 3)} ${unterwegsBestellungen.length === 1 ? tx('wird gerade beliefert') : tx('werden gerade beliefert')}`;
    }
    return tx`${todayBestellungen.length} ${tx('Lieferungen für heute geplant')}`;
  }, [unterwegsBestellungen, todayBestellungen]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Hero: Bestellungen "neu" die keinen Fahrer haben
  const ohnefahrer = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    return (s === 'neu' || s === 'bereit_zur_lieferung') && !b.fields.fahrer;
  });

  const firstOhnefahrer = ohnefahrer[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Bestellung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ohnefahrer.length > 0 && firstOhnefahrer ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Fahrer zuweisen'),
              onClick: () => {
                const enriched = enrichedBestellverwaltung.find(b => b.record_id === firstOhnefahrer.record_id);
                if (enriched) {
                  setBestellDefaults({ order_status: lookupKey(firstOhnefahrer.fields.order_status) ?? 'neu' });
                  setBestellEditId(firstOhnefahrer.record_id);
                  setBestellDialog(true);
                }
              },
            }}
          >
            <b>{namen(ohnefahrer.map(b => b.kundeName || tx('Unbekannt')), 3)}</b>
            {' '}{ohnefahrer.length === 1 ? tx('hat noch keinen Fahrer') : tx('haben noch keinen Fahrer')}
            {' — '}{tx('bitte Fahrer zuweisen.')}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Bestellungen')}
              value={bestellverwaltung.length}
              icon={<IconTruck size={16} />}
            />
            <StatStripItem
              title={tx('Heute geplant')}
              value={todayBestellungen.length}
              icon={<IconCheck size={16} />}
              tone={todayBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Umsatz heute')}
              value={formatCurrency(heutigerUmsatz)}
              icon={<IconCurrencyEuro size={16} />}
              tone={heutigerUmsatz > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrer verfügbar')}
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} />}
              tone={verfuegbareFahrer.length === 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === '__fahrer' ? null : '__fahrer')}
              active={statusFilter === '__fahrer'}
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
              const found = enrichedBestellverwaltung.find(b => b.record_id === rid);
              if (found) overlay.replace({ type: 'bestellverwaltung', record: found });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellDefaults({ order_status: column });
              setBestellEditId(undefined);
              setBestellDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Offen & in Bearbeitung')}
              items={offeneBestellungen.slice(0, 8).map(b => {
                const s = lookupKey(b.fields.order_status);
                const statusColors: Record<string, string> = {
                  neu: 'text-muted-foreground',
                  in_bearbeitung: 'text-primary',
                  bereit_zur_lieferung: 'text-warning',
                };
                return {
                  id: b.record_id,
                  title: b.kundeName || appLabel('kundenverwaltung'),
                  secondLine: (
                    <span className={statusColors[s ?? ''] ?? 'text-muted-foreground'}>
                      {b.fields.order_status?.label ?? '—'}
                      {b.fields.desired_delivery_time ? (
                        <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                      ) : null}
                    </span>
                  ),
                  action: {
                    label: tx('Weiter'),
                    onClick: () => advanceStatus(b),
                  },
                };
              })}
              onItemClick={id => {
                const found = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (found) overlay.replace({ type: 'bestellverwaltung', record: found });
              }}
              empty={{
                text: tx('Alle Bestellungen erledigt — Glückwunsch!'),
                action: { label: tx('Neue Bestellung'), onClick: () => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); } },
              }}
            />
            <WorkList
              title={tx('Fahrer im Einsatz')}
              items={fahrerverwaltung
                .filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz' || lookupKey(f.fields.driver_status) === 'verfuegbar')
                .slice(0, 6)
                .map(f => {
                  const status = lookupKey(f.fields.driver_status);
                  const aktiveBestellungen = bestellverwaltung.filter(
                    b => extractRecordId(b.fields.fahrer) === f.record_id && lookupKey(b.fields.order_status) === 'unterwegs',
                  );
                  return {
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
                    secondLine: (
                      <span className={status === 'im_einsatz' ? 'text-primary' : 'text-success'}>
                        {f.fields.driver_status?.label ?? '—'}
                        {aktiveBestellungen.length > 0 && (
                          <span className="text-muted-foreground"> · {aktiveBestellungen.length} {tx('unterwegs')}</span>
                        )}
                      </span>
                    ),
                  };
                })}
              onItemClick={id => {
                const found = fahrerverwaltung.find(f => f.record_id === id);
                if (found) overlay.replace({ type: 'fahrerverwaltung', record: found });
              }}
              empty={{
                text: tx('Noch keine Fahrer angelegt'),
                action: { label: tx('Fahrer hinzufügen'), onClick: () => { setFahrerEditId(undefined); setFahrerDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('kundenverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={<span className="text-xs text-muted-foreground">{b.fields.delivery_city ?? ''}</span>}
                />
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
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
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
                    setBestellEditId(undefined);
                    setBestellDialog(true);
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
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
                    setBestellEditId(undefined);
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
            const b = top.record;
            const s = lookupKey(b.fields.order_status);
            const canAdvance = s === 'neu' || s === 'in_bearbeitung' || s === 'bereit_zur_lieferung' || s === 'unterwegs';
            if (!canAdvance) return null;
            const labels: Record<string, string> = {
              neu: tx('In Bearbeitung nehmen'),
              in_bearbeitung: tx('Bereit zur Lieferung'),
              bereit_zur_lieferung: tx('Auf den Weg schicken'),
              unterwegs: tx('Als geliefert markieren'),
            };
            return {
              label: labels[s ?? ''] ?? tx('Weiter'),
              onClick: () => advanceStatus(b),
            };
          }
          return null;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            setBestellDefaults(undefined);
            setBestellEditId(top.record.record_id);
            setBestellDialog(true);
            overlay.close();
          } else if (top.type === 'fahrerverwaltung') {
            setFahrerEditId(top.record.record_id);
            setFahrerDialog(true);
            overlay.close();
          } else if (top.type === 'kundenverwaltung') {
            setKundeEditId(top.record.record_id);
            setKundeDialog(true);
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => setBestellDialog(false)}
        onSubmit={async fields => {
          if (bestellEditId) {
            await LivingAppsService.updateBestellverwaltungEntry(bestellEditId, fields as Bestellverwaltung['fields']);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields as Bestellverwaltung['fields']);
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
        open={fahrerDialog}
        onClose={() => setFahrerDialog(false)}
        onSubmit={async fields => {
          if (fahrerEditId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerEditId, fields as Fahrerverwaltung['fields']);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields as Fahrerverwaltung['fields']);
          }
          fetchAll();
        }}
        recordId={fahrerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => {
          if (kundeEditId) {
            await LivingAppsService.updateKundenverwaltungEntry(kundeEditId, fields as Kundenverwaltung['fields']);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields as Kundenverwaltung['fields']);
          }
          fetchAll();
        }}
        recordId={kundeEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </div>
  );
}
