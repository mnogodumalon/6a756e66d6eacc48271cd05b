import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { lookupKey, formatCurrency, formatDateTime } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
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
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { IconAlertTriangle, IconTruck, IconUsers, IconShoppingCart, IconPackage, IconCircleCheck, IconPlus, IconMotorbike } from '@tabler/icons-react';

// Pre-generated overlay union
export type OverlayItem =
  | { type: 'kundenverwaltung'; record: Kundenverwaltung }
  | { type: 'fahrerverwaltung'; record: Fahrerverwaltung }
  | { type: 'bestellverwaltung'; record: EnrichedBestellverwaltung };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'neu') return 'warning';
  if (status === 'in_bearbeitung') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'primary';
  if (status === 'unterwegs') return 'success';
  if (status === 'geliefert') return 'default';
  if (status === 'storniert') return 'default';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    kundenverwaltung,
    fahrerverwaltung,
    bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap,
    fahrerverwaltungMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedBestellverwaltung = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedBestellverwaltung.map(b => {
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

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | undefined>(undefined);
  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | undefined>(undefined);
  const [kundeDialog, setKundeDialog] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | undefined>(undefined);

  // Advance order status
  const advanceStatus = useCallback(async (bestellung: EnrichedBestellverwaltung | Bestellverwaltung) => {
    const STATUS_ORDER = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const current = lookupKey(bestellung.fields.order_status);
    const idx = STATUS_ORDER.indexOf(current ?? '');
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return;
    const next = STATUS_ORDER[idx + 1];
    const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === next)?.label ?? next;
    const prevStatus = bestellung.fields.order_status;

    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === bestellung.record_id
          ? { ...b, fields: { ...b.fields, order_status: { key: next, label: nextLabel } } }
          : b,
      ),
    );

    undoToast(
      tx`Status → ${nextLabel}`,
      async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === bestellung.record_id
              ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, {
          order_status: typeof prevStatus === 'object' && prevStatus !== null ? (prevStatus as { key: string }).key : prevStatus ?? undefined,
        });
      },
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: next });
    } catch {
      fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const newLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const bestellung = bestellverwaltung.find(b => b.record_id === rid);
    if (!bestellung) return;
    const prevStatus = bestellung.fields.order_status;

    setBestellverwaltung(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newLabel } } }
          : b,
      ),
    );

    undoToast(
      tx`Status → ${newLabel}`,
      async () => {
        setBestellverwaltung(prev =>
          prev.map(b =>
            b.record_id === rid
              ? { ...b, fields: { ...b.fields, order_status: prevStatus } }
              : b,
          ),
        );
        await LivingAppsService.updateBestellverwaltungEntry(rid, {
          order_status: typeof prevStatus === 'object' && prevStatus !== null ? (prevStatus as { key: string }).key : prevStatus ?? undefined,
        });
      },
    );

    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // ─── All hooks ABOVE this line ───────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ─────────────────────────────

  const today = format(clock, 'yyyy-MM-dd');

  const offeneBestellungen = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    return s !== 'geliefert' && s !== 'storniert';
  });

  const neuBestellungen = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu');
  const unterwegsBestellungen = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs');

  const verfuegbareFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar');
  const imEinsatzFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz');

  const heuteBestellungen = enrichedBestellverwaltung.filter(b => {
    const dt = b.fields.desired_delivery_time ?? b.fields.order_date;
    if (!dt) return false;
    return dt.startsWith(today);
  });

  // Überfällige: desired_delivery_time in der Vergangenheit & nicht geliefert/storniert
  const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
  const ueberfaellige = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    if (s === 'geliefert' || s === 'storniert') return false;
    const dt = b.fields.desired_delivery_time;
    if (!dt) return false;
    return dt < nowStr;
  });

  const nextStatusLabel = (b: EnrichedBestellverwaltung) => {
    const STATUS_ORDER = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'];
    const current = lookupKey(b.fields.order_status);
    const idx = STATUS_ORDER.indexOf(current ?? '');
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
    return LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.[idx + 1]?.label ?? null;
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {gruss(clock)} — {tx('FreshRoute CRM')} {/* i18n-exempt */}
        </h1>
        <p className="text-muted-foreground mt-1">
          {offeneBestellungen.length > 0
            ? tx`${offeneBestellungen.length} offene Bestellungen — ${namen(unterwegsBestellungen.map(b => b.kundeName))} unterwegs`
            : tx('Keine offenen Bestellungen — alles geliefert!')}
        </p>
      </div>

      {/* Dashboard */}
      <DashboardGrid
        variant="wide"
        hero={
          ueberfaellige.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Weiterschalten'),
                onClick: () => void advanceStatus(ueberfaellige[0]),
              }}
            >
              <b>{namen(ueberfaellige.map(b => b.kundeName))}</b>{' '}
              {tx`— ${ueberfaellige.length} Bestellung(en) überfällig`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneBestellungen.length}
              icon={<IconShoppingCart size={16} />}
              tone={offeneBestellungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Neu')}
              value={neuBestellungen.length}
              icon={<IconPackage size={16} />}
              tone={neuBestellungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Unterwegs')}
              value={unterwegsBestellungen.length}
              icon={<IconMotorbike size={16} />}
              tone={unterwegsBestellungen.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrer verfügbar')}
              value={verfuegbareFahrer.length}
              icon={<IconUsers size={16} />}
              tone={verfuegbareFahrer.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tx('Im Einsatz')}
              value={imEinsatzFahrer.length}
              icon={<IconTruck size={16} />}
              tone={imEinsatzFahrer.length > 0 ? 'primary' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1] ?? '';
              const rec = enrichedBestellverwaltung.find(b => b.record_id === rid);
              if (rec) overlay.replace({ type: 'bestellverwaltung', record: rec });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setBestellDefaults({ order_status: column });
              setEditingBestellung(undefined);
              setBestellDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute fällig')}
              items={heuteBestellungen.map(b => {
                const nextLabel = nextStatusLabel(b);
                return {
                  id: b.record_id,
                  title: b.kundeName || tx('Unbekannt'),
                  secondLine: (
                    <>
                      <span className="font-medium" style={{ color: lookupKey(b.fields.order_status) === 'unterwegs' ? 'var(--color-success)' : undefined }}>
                        {b.fields.order_status?.label ?? tx('Kein Status')}
                      </span>
                      {b.fields.delivery_city && (
                        <span className="text-muted-foreground"> · {b.fields.delivery_city}</span>
                      )}
                    </>
                  ),
                  action: nextLabel
                    ? { label: `→ ${nextLabel}`, onClick: () => void advanceStatus(b) }
                    : undefined,
                };
              })}
              onItemClick={id => {
                const rec = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (rec) overlay.replace({ type: 'bestellverwaltung', record: rec });
              }}
              empty={{
                text: tx('Heute keine Lieferungen geplant'),
                action: {
                  label: tx('Neue Bestellung'),
                  onClick: () => { setBestellDefaults(undefined); setEditingBestellung(undefined); setBestellDialog(true); },
                },
              }}
            />
            <WorkList
              title={tx('Fahrer')}
              items={fahrerverwaltung.map(f => ({
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
                const f = fahrerverwaltung.find(r => r.record_id === id);
                if (f) overlay.replace({ type: 'fahrerverwaltung', record: f });
              }}
              empty={{
                text: tx('Keine Fahrer eingetragen'),
                action: {
                  label: tx('Fahrer hinzufügen'),
                  onClick: () => { setEditingFahrer(undefined); setFahrerDialog(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => setBestellDialog(false)}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
            undoToast(tx`Bestellung aktualisiert`);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
            undoToast(tx`Bestellung erstellt`);
          }
          fetchAll();
        }}
        defaultValues={editingBestellung ? editingBestellung.fields : bestellDefaults}
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
            undoToast(tx`Fahrer aktualisiert`);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
            undoToast(tx`Fahrer hinzugefügt`);
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
            undoToast(tx`Kunde aktualisiert`);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields);
            undoToast(tx`Kunde erstellt`);
          }
          fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />

      {/* Overlay stack — ONE host for all entity types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellverwaltung') {
            const b = top.record;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  actions={
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => { setEditingBestellung(b); setBestellDefaults(undefined); setBestellDialog(true); }}
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
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
                  actions={
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => { setEditingFahrer(f); setFahrerDialog(true); }}
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
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
                    setEditingBestellung(undefined);
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
                  actions={
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => { setEditingKunde(k); setKundeDialog(true); }}
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
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
                    setEditingBestellung(undefined);
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
            const nextLabel = nextStatusLabel(b);
            if (!nextLabel) return undefined;
            return {
              label: tx`→ ${nextLabel}`,
              onClick: () => void advanceStatus(b),
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellverwaltung') { setEditingBestellung(top.record); setBestellDefaults(undefined); setBestellDialog(true); }
          if (top.type === 'fahrerverwaltung') { setEditingFahrer(top.record); setFahrerDialog(true); }
          if (top.type === 'kundenverwaltung') { setEditingKunde(top.record); setKundeDialog(true); }
        }}
      />
    </>
  );
}
