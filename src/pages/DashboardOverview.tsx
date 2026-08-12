import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconTruck,
  IconUsers,
  IconCurrencyEuro,
  IconAlertTriangle,
  IconShoppingCart,
  IconCheck,
} from '@tabler/icons-react';
import { format } from 'date-fns';

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
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [bestellEditId, setBestellEditId] = useState<string | undefined>(undefined);

  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [fahrerEditId, setFahrerEditId] = useState<string | undefined>(undefined);

  const [kundenDialog, setKundenDialog] = useState(false);
  const [kundenEditId, setKundenEditId] = useState<string | undefined>(undefined);

  // Enriched data
  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  // KPI derivations — all based on clock
  const today = format(clock, 'yyyy-MM-dd');

  const aktivefahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz' || lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung],
  );

  const bestellungenHeute = useMemo(
    () => bestellverwaltung.filter(b => b.fields.order_date?.startsWith(today)),
    [bestellverwaltung, today],
  );

  const umsatzHeute = useMemo(
    () => bestellungenHeute.reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [bestellungenHeute],
  );

  const unterwegsBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung],
  );

  const neueBestellungen = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu'),
    [enrichedBestellverwaltung],
  );

  // Hero: neue Bestellungen die noch niemand bearbeitet hat
  const heroBestellungen = neueBestellungen;

  // Kanban columns
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () => enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || tx('Unbekannter Kunde'),
        subtitle: b.fahrerName
          ? tx`${b.fahrerName} · ${b.fields.delivery_city ?? ''}`
          : (b.fields.delivery_city ?? undefined),
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung, COLUMNS],
  );

  // Status advance helper — shared across banner, list and overlay footer
  const advanceStatus = useCallback(async (bestellung: EnrichedBestellverwaltung) => {
    const current = lookupKey(bestellung.fields.order_status);
    const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const idx = statusOrder.indexOf(current ?? '');
    if (idx === -1 || idx >= statusOrder.length - 1) return;
    const newStatus = statusOrder[idx + 1];
    const prevStatus = bestellung.fields.order_status;
    // Optimistic
    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === bestellung.record_id
          ? { ...b, fields: { ...b.fields, order_status: lookupOption('bestellverwaltung', 'order_status', newStatus) } }
          : b,
      ),
    );
    const name = bestellung.kundeName || tx('Bestellung');
    undoToast(
      tx`${name} → ${lookupOption('bestellverwaltung', 'order_status', newStatus).label}`,
      async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === bestellung.record_id
              ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: current ?? '' });
      },
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: newStatus });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // onCardMove for kanban
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
    if (!b) return;
    const prevStatus = b.fields.order_status;
    setBestellverwaltung(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, order_status: lookupOption('bestellverwaltung', 'order_status', newColumn) } }
          : x,
      ),
    );
    const name = b.kundeName || tx('Bestellung');
    undoToast(
      tx`${name} → ${lookupOption('bestellverwaltung', 'order_status', newColumn).label}`,
      async () => {
        setBestellverwaltung(prev =>
          prev.map(x =>
            x.record_id === rid
              ? { ...x, fields: { ...x.fields, order_status: prevStatus } }
              : x,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: lookupKey(prevStatus) ?? '' });
      },
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, setBestellverwaltung, fetchAll]);

  // ─── All hooks above this line ───────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations only below ───────────────────────────────────────

  const contextLine = unterwegsBestellungen.length > 0
    ? tx`${gruss(clock)} Aktuell ${String(unterwegsBestellungen.length)} Lieferung${unterwegsBestellungen.length !== 1 ? 'en' : ''} unterwegs${unterwegsBestellungen[0]?.kundeName ? ` — ${namen(unterwegsBestellungen.map(b => b.kundeName))}` : ''}.`
    : neueBestellungen.length > 0
    ? tx`${gruss(clock)} ${String(neueBestellungen.length)} neue${neueBestellungen.length !== 1 ? tx(' Bestellungen') : tx(' Bestellung')} warten auf Bearbeitung.`
    : tx`${gruss(clock)} Keine offenen Lieferungen — alles erledigt.`;

  const nextStatusLabel = (b: EnrichedBestellverwaltung) => {
    const current = lookupKey(b.fields.order_status);
    const map: Record<string, string> = {
      'neu': tx('In Bearbeitung'),
      'in_bearbeitung': tx('Bereit'),
      'bereit_zur_lieferung': tx('Unterwegs'),
      'unterwegs': tx('Geliefert'),
    };
    return map[current ?? ''] ?? null;
  };

  const verfuegbareFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar');

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{tx('Lieferübersicht')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
          </div>
          <button
            onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
          >
            <IconShoppingCart size={16} className="shrink-0" />
            {tx('Neue Bestellung')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBestellungen.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('In Bearbeitung nehmen'),
              onClick: () => void advanceStatus(heroBestellungen[0]),
            }}
          >
            <b>{namen(heroBestellungen.map(b => b.kundeName))}</b>
            {' '}{heroBestellungen.length === 1 ? tx('wartet auf Bearbeitung') : tx`— ${String(heroBestellungen.length)} neue Bestellungen warten`}.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconTruck size={16} />}
              tone={unterwegsBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Heute bestellt')}
              value={bestellungenHeute.length}
              icon={<IconShoppingCart size={16} />}
              tone="default"
            />
            <StatStripItem
              title={tx('Umsatz heute')}
              value={formatCurrency(umsatzHeute)}
              icon={<IconCurrencyEuro size={16} />}
              tone="default"
            />
            <StatStripItem
              title={tx('Aktive Fahrer')}
              value={`${aktivefahrer.length} / ${fahrerverwaltung.length}`}
              icon={<IconUsers size={16} />}
              tone={verfuegbareFahrer.length === 0 && fahrerverwaltung.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={COLUMNS}
            cards={cards}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const b = enrichedBestellverwaltung.find(x => x.record_id === rid);
              if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
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
              title={tx('Unterwegs — in Echtzeit')}
              items={unterwegsBestellungen.map(b => ({
                id: b.record_id,
                title: b.kundeName || tx('Unbekannter Kunde'),
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{tx('Unterwegs')}</span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                    {b.fahrerName && (
                      <span className="text-muted-foreground"> · {b.fahrerName}</span>
                    )}
                  </>
                ),
                action: {
                  label: <span className="flex items-center gap-1"><IconCheck size={14} />{tx('Geliefert')}</span>,
                  onClick: () => void advanceStatus(b),
                },
              }))}
              onItemClick={id => {
                const b = enrichedBestellverwaltung.find(x => x.record_id === id);
                if (b) overlay.replace({ type: 'bestellverwaltung', record: b });
              }}
              empty={{
                text: tx('Keine Lieferungen unterwegs — alle Bestellungen warten oder wurden geliefert.'),
                action: { label: tx('Neue Bestellung'), onClick: () => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); } },
              }}
            />
            <WorkList
              title={tx('Fahrer-Status')}
              items={fahrerverwaltung.slice(0, 6).map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || tx('Fahrer'),
                secondLine: (
                  <>
                    <span className={
                      lookupKey(f.fields.driver_status) === 'verfuegbar' ? 'font-medium text-success' :
                      lookupKey(f.fields.driver_status) === 'im_einsatz' ? 'font-medium text-primary' :
                      'text-muted-foreground'
                    }>
                      {f.fields.driver_status?.label ?? tx('Unbekannt')}
                    </span>
                    {f.fields.vehicle_type && (
                      <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => {
                const f = fahrerverwaltung.find(x => x.record_id === id);
                if (f) overlay.replace({ type: 'fahrerverwaltung', record: f });
              }}
              empty={{
                text: tx('Noch keine Fahrer erfasst. Füge deinen ersten Fahrer hinzu.'),
                action: { label: tx('Fahrer anlegen'), onClick: () => { setFahrerEditId(undefined); setFahrerDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* Record overlay host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            const nextLabel = nextStatusLabel(b);
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    b.fields.delivery_city
                      ? <span className="text-xs text-muted-foreground">{b.fields.delivery_street} {b.fields.delivery_house_number}, {b.fields.delivery_city}</span>
                      : undefined
                  }
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrerverwaltung', record: f })}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kundenverwaltung', record: k })}
                />
              </>
            );
          }
          if (top.type === 'fahrerverwaltung') {
            const f = top.record as Fahrerverwaltung;
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
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
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
            const k = top.record as Kundenverwaltung;
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
                    const enriched = enrichedBestellverwaltung.find(x => x.record_id === b.record_id);
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
            const b = top.record as EnrichedBestellverwaltung;
            const nextLabel = nextStatusLabel(b);
            if (!nextLabel) return undefined;
            return { label: `→ ${nextLabel}`, onClick: () => void advanceStatus(b) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record as EnrichedBestellverwaltung;
            setBestellDefaults(b.fields as BestellverwaltungDialogDefaults);
            setBestellEditId(b.record_id);
            setBestellDialog(true);
            overlay.close();
          } else if (top.type === 'fahrerverwaltung') {
            const f = top.record as Fahrerverwaltung;
            setFahrerEditId(f.record_id);
            setFahrerDialog(true);
            overlay.close();
          } else if (top.type === 'kundenverwaltung') {
            const k = top.record as Kundenverwaltung;
            setKundenEditId(k.record_id);
            setKundenDialog(true);
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
        open={fahrerDialog}
        onClose={() => setFahrerDialog(false)}
        onSubmit={async fields => {
          if (fahrerEditId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerEditId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        recordId={fahrerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundenDialog}
        onClose={() => setKundenDialog(false)}
        onSubmit={async fields => {
          if (kundenEditId) {
            await LivingAppsService.updateKundenverwaltungEntry(kundenEditId, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          fetchAll();
        }}
        recordId={kundenEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
