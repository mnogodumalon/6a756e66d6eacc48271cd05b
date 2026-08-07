import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
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
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog, type FahrerverwaltungDialogDefaults } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog, type KundenverwaltungDialogDefaults } from '@/components/dialogs/KundenverwaltungDialog';
import {
  IconAlertTriangle,
  IconPlus,
  IconTruck,
  IconPackage,
  IconUsers,
  IconCircleCheck,
  IconClockHour4,
} from '@tabler/icons-react';

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

const BESTELL_COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

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

  // Dialog states
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<Bestellverwaltung | null>(null);

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | null>(null);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | null>(null);

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  // Advance status helper — must be above early returns (Rules of Hooks)
  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const currentKey = lookupKey(b.fields.order_status) ?? 'neu';
    const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const idx = statusOrder.indexOf(currentKey);
    if (idx < 0 || idx >= statusOrder.length - 1) return;
    const nextKey = statusOrder[idx + 1];
    const colLabel = BESTELL_COLUMNS.find(c => c.key === nextKey)?.label ?? nextKey;
    setBestellverwaltung(bs =>
      bs.map(x =>
        x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, order_status: { key: nextKey, label: colLabel } } }
          : x
      )
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: nextKey });
      undoToast(`${b.kundeName || 'Bestellung'} → ${colLabel}`, async () => {
        setBestellverwaltung(bs =>
          bs.map(x =>
            x.record_id === b.record_id
              ? { ...x, fields: { ...x.fields, order_status: b.fields.order_status } }
              : x
          )
        );
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: currentKey });
      });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // ─── Every hook above this line ─────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations only below ────────────────────────────────────────────

  const today = format(clock, 'yyyy-MM-dd');

  const offeneBestellungen = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    return s !== 'geliefert' && s !== 'storniert';
  });

  const unterwegsBestellungen = enrichedBestellverwaltung.filter(b =>
    lookupKey(b.fields.order_status) === 'unterwegs'
  );

  const heuteFaellig = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    if (s === 'geliefert' || s === 'storniert') return false;
    const dt = b.fields.desired_delivery_time;
    if (!dt) return false;
    return dt.slice(0, 10) <= today;
  });

  const ueberfaellig = heuteFaellig.filter(b => {
    const dt = b.fields.desired_delivery_time;
    return dt ? dt.slice(0, 10) < today : false;
  });

  const verfuegbareFahrer = fahrerverwaltung.filter(f =>
    lookupKey(f.fields.driver_status) === 'verfuegbar'
  );

  const imEinsatzFahrer = fahrerverwaltung.filter(f =>
    lookupKey(f.fields.driver_status) === 'im_einsatz'
  );

  // Kanban cards
  const cards: KanbanCard[] = enrichedBestellverwaltung.map(b => {
    const status = lookupKey(b.fields.order_status) ?? 'neu';
    return {
      id: `bestellung:${b.record_id}`,
      column: status,
      title: b.kundeName || 'Unbekannter Kunde',
      subtitle: b.fields.desired_delivery_time
        ? format(new Date(b.fields.desired_delivery_time), 'dd.MM. HH:mm', { locale: de })
        : b.fields.delivery_city ?? undefined,
      tone: toneForStatus(status),
    };
  });

  // Move handler
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const colLabel = BESTELL_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    const prev = bestellverwaltung.find(b => b.record_id === rid);
    if (!prev) return;
    setBestellverwaltung(bs =>
      bs.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: colLabel } } }
          : b
      )
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(`Status → ${colLabel}`, async () => {
        const oldStatus = lookupKey(prev.fields.order_status) ?? 'neu';
        setBestellverwaltung(bs =>
          bs.map(b =>
            b.record_id === rid
              ? { ...b, fields: { ...b.fields, order_status: prev.fields.order_status } }
              : b
          )
        );
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: oldStatus });
      });
    } catch {
      await fetchAll();
    }
  };

  const nextStatusLabel = (b: EnrichedBestellverwaltung): string | null => {
    const currentKey = lookupKey(b.fields.order_status) ?? 'neu';
    const statusOrder = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const idx = statusOrder.indexOf(currentKey);
    if (idx < 0 || idx >= statusOrder.length - 1) return null;
    const nextKey = statusOrder[idx + 1];
    return BESTELL_COLUMNS.find(c => c.key === nextKey)?.label ?? null;
  };

  // Context line
  const unterwegsNamen = namen(unterwegsBestellungen.map(b => b.kundeName || '').filter(Boolean));
  const contextLine = unterwegsBestellungen.length > 0
    ? `${unterwegsNamen} ${unterwegsBestellungen.length === 1 ? 'ist' : 'sind'} gerade unterwegs — ${verfuegbareFahrer.length} Fahrer verfügbar.`
    : offeneBestellungen.length > 0
      ? `${offeneBestellungen.length} offene Lieferung${offeneBestellungen.length !== 1 ? 'en' : ''} — ${verfuegbareFahrer.length} Fahrer verfügbar.`
      : `Alle Lieferungen erledigt — ${verfuegbareFahrer.length} Fahrer bereit.`;

  // Overlay helpers
  const openBestellungInOverlay = (b: Bestellverwaltung) =>
    overlay.push({ type: 'bestellung', id: b.record_id });
  const openFahrerInOverlay = (f: Fahrerverwaltung) =>
    overlay.push({ type: 'fahrer', id: f.record_id });
  const openKundeInOverlay = (k: Kundenverwaltung) =>
    overlay.push({ type: 'kunde', id: k.record_id });

  const openAddBestellungForFahrer = (fahrerId: string) => {
    setBestellungDefaults({ fahrer: fahrerId });
    setEditingBestellung(null);
    setBestellungDialogOpen(true);
  };

  const openAddBestellungForKunde = (kundeId: string) => {
    setBestellungDefaults({ kunde: kundeId });
    setEditingBestellung(null);
    setBestellungDialogOpen(true);
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setBestellungDefaults(undefined); setEditingBestellung(null); setBestellungDialogOpen(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          Neue Bestellung
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaellig.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: `Weiterschalten`,
                onClick: () => void advanceStatus(ueberfaellig[0]),
              }}
            >
              <b>{namen(ueberfaellig.map(b => b.kundeName || '').filter(Boolean))}</b>
              {ueberfaellig.length === 1 ? ' — Lieferung überfällig' : ` — ${ueberfaellig.length} Lieferungen überfällig`}
              {ueberfaellig[0].fields.desired_delivery_time
                ? ` seit ${format(new Date(ueberfaellig[0].fields.desired_delivery_time), 'dd.MM. HH:mm', { locale: de })}`
                : ''}
              .
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title="Offen"
              value={offeneBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={offeneBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title="Unterwegs"
              value={unterwegsBestellungen.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title="Heute fällig"
              value={heuteFaellig.length}
              icon={<IconClockHour4 size={16} className="shrink-0" />}
              tone={heuteFaellig.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title="Fahrer verfügbar"
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length > 0 ? 'success' : 'warning'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={BESTELL_COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] })}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellungDefaults({ order_status: column });
              setEditingBestellung(null);
              setBestellungDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title="Heute fällig & überfällig"
              items={heuteFaellig.slice(0, 8).map(b => {
                const next = nextStatusLabel(b);
                const isUeberfaellig = (b.fields.desired_delivery_time ?? '') < format(clock, "yyyy-MM-dd'T'HH:mm");
                return {
                  id: b.record_id,
                  title: b.kundeName || 'Unbekannter Kunde',
                  secondLine: (
                    <>
                      <span className={`font-medium ${isUeberfaellig ? 'text-destructive' : 'text-warning'}`}>
                        {isUeberfaellig ? 'Überfällig' : 'Heute fällig'}
                      </span>
                      {b.fields.desired_delivery_time && (
                        <span className="text-muted-foreground"> · {format(new Date(b.fields.desired_delivery_time), 'HH:mm', { locale: de })} Uhr</span>
                      )}
                      {b.fields.delivery_city && (
                        <span className="text-muted-foreground"> · {b.fields.delivery_city}</span>
                      )}
                    </>
                  ),
                  action: next ? { label: `→ ${next}`, onClick: () => void advanceStatus(b) } : undefined,
                };
              })}
              onItemClick={id => {
                const b = bestellverwaltung.find(x => x.record_id === id);
                if (b) overlay.replace({ type: 'bestellung', id });
              }}
              empty={{
                text: 'Alle Lieferungen pünktlich — nächste Lieferung aufrufen',
                action: {
                  label: 'Neue Bestellung',
                  onClick: () => { setBestellungDefaults(undefined); setEditingBestellung(null); setBestellungDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={`Fahrer (${imEinsatzFahrer.length} im Einsatz)`}
              items={fahrerverwaltung
                .filter(f => {
                  const s = lookupKey(f.fields.driver_status);
                  return s !== 'inaktiv';
                })
                .slice(0, 6)
                .map(f => {
                  const statusKey = lookupKey(f.fields.driver_status);
                  const statusLabel = f.fields.driver_status?.label ?? statusKey ?? '—';
                  const statusColor =
                    statusKey === 'verfuegbar' ? 'text-success' :
                    statusKey === 'im_einsatz' ? 'text-primary' :
                    'text-muted-foreground';
                  return {
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || 'Unbekannter Fahrer',
                    secondLine: (
                      <>
                        <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                        {f.fields.vehicle_type?.label && (
                          <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                        )}
                        {f.fields.delivery_zone && (
                          <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                        )}
                      </>
                    ),
                    action: statusKey === 'verfuegbar' ? {
                      label: 'Zuweisen',
                      onClick: () => openAddBestellungForFahrer(f.record_id),
                    } : undefined,
                  };
                })}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: 'Noch keine Fahrer erfasst',
                action: {
                  label: 'Fahrer anlegen',
                  onClick: () => { setEditingFahrer(null); setFahrerDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Record overlay — ONE host, multi-type stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            const enriched = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.kundeName || 'Bestellung'}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    b.fields.total_amount != null ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {formatCurrency(b.fields.total_amount)}
                      </span>
                    ) : undefined
                  }
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={openFahrerInOverlay}
                  onOpenKundenverwaltung={openKundeInOverlay}
                />
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || 'Fahrer'}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={openBestellungInOverlay}
                  onAddBestellverwaltung={() => openAddBestellungForFahrer(f.record_id)}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || 'Kunde'}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={openBestellungInOverlay}
                  onAddBestellverwaltung={() => openAddBestellungForKunde(k.record_id)}
                />
              </>
            );
          }
          return null;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(x => x.record_id === top.id);
            if (b) { setEditingBestellung(b); setBestellungDefaults(undefined); setBestellungDialogOpen(true); overlay.close(); }
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) { setEditingFahrer(f); setFahrerDialogOpen(true); overlay.close(); }
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) { setEditingKunde(k); setKundeDialogOpen(true); overlay.close(); }
          }
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return undefined;
            const next = nextStatusLabel(b);
            if (!next) return undefined;
            return { label: `→ ${next}`, onClick: () => void advanceStatus(b) };
          }
          return undefined;
        }}
      />

      {/* Bestellung Dialog */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => { setBestellungDialogOpen(false); setEditingBestellung(null); setBestellungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingBestellung ? editingBestellung.fields : bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      {/* Fahrer Dialog */}
      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => { setFahrerDialogOpen(false); setEditingFahrer(null); }}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingFahrer?.fields}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {/* Kunde Dialog */}
      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => { setKundeDialogOpen(false); setEditingKunde(null); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
