import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { makeT, appLabel, fieldLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format, parseISO, isBefore, isToday } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { MapWidget, MapRouteLinks, type MapMarker, type MapTone } from '@/components/widgets/MapWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog, type BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconPackage, IconTruck, IconAlertTriangle, IconPlus, IconCheck, IconUser, IconMapPin,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_zero: 'Noch keine Bestellungen heute — starte den Tag!',
    context_active: 'Heute aktiv: {names}.',
    context_deliveries: '{n} Bestellung{s} unterwegs, {c} Kunden warten.',
    neu: 'Neu',
    unterwegs: 'Unterwegs',
    verfuegbar: 'Verfügbar',
    umsatz_heute: 'Umsatz heute',
    faellig_banner: '{names} — Lieferzeit überschritten.',
    faellig_action: 'Status prüfen',
    list_heute: 'Heute fällig & unterwegs',
    list_morgen: 'Warteschlange',
    empty_heute: 'Keine offenen Lieferungen heute',
    empty_morgen: 'Kein Nachschub geplant',
    neue_bestellung: 'Neue Bestellung',
    bearbeiten: 'Bearbeiten',
    advance_label: '✓ Geliefert',
    cancel_label: 'Stornieren',
    karte_titel: 'Lieferorte',
    new_bestellung_title: 'Neue Bestellung',
    geliefert_toast: 'Als geliefert markiert',
    undo_geliefert: 'Rückgängig',
  },
  en: {
    context_zero: 'No orders today — start the day!',
    context_active: 'Active today: {names}.',
    context_deliveries: '{n} order{s} en route, {c} customers waiting.',
    neu: 'New',
    unterwegs: 'En Route',
    verfuegbar: 'Available',
    umsatz_heute: 'Revenue today',
    faellig_banner: '{names} — delivery time exceeded.',
    faellig_action: 'Review status',
    list_heute: 'Due today & en route',
    list_morgen: 'Queue',
    empty_heute: 'No open deliveries today',
    empty_morgen: 'No orders queued',
    neue_bestellung: 'New Order',
    bearbeiten: 'Edit',
    advance_label: '✓ Delivered',
    cancel_label: 'Cancel',
    karte_titel: 'Delivery locations',
    new_bestellung_title: 'New Order',
    geliefert_toast: 'Marked as delivered',
    undo_geliefert: 'Undo',
  },
  cs: {
    context_zero: 'Dnes žádné objednávky — začněte den!',
    context_active: 'Dnes aktivní: {names}.',
    context_deliveries: '{n} objednávk{s} na cestě, {c} zákazníků čeká.',
    neu: 'Nové',
    unterwegs: 'Na cestě',
    verfuegbar: 'Dostupný',
    umsatz_heute: 'Tržby dnes',
    faellig_banner: '{names} — čas doručení překročen.',
    faellig_action: 'Zkontrolovat stav',
    list_heute: 'Splatné dnes & na cestě',
    list_morgen: 'Fronta',
    empty_heute: 'Žádné otevřené doručení dnes',
    empty_morgen: 'Žádné objednávky ve frontě',
    neue_bestellung: 'Nová objednávka',
    bearbeiten: 'Upravit',
    advance_label: '✓ Doručeno',
    cancel_label: 'Zrušit',
    karte_titel: 'Místa doručení',
    new_bestellung_title: 'Nová objednávka',
    geliefert_toast: 'Označeno jako doručeno',
    undo_geliefert: 'Zpět',
  },
});

const ORDER_COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

function toneForOrderStatus(status: string | undefined): KanbanTone {
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
  return 'warning';
}

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const enrichedBestellverwaltung: EnrichedBestellverwaltung[] = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap],
  );

  const [createBestellOpen, setCreateBestellOpen] = useState(false);
  const [createBestellDefaults, setCreateBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editBestellung, setEditBestellung] = useState<Bestellverwaltung | null>(null);
  const [createFahrerOpen, setCreateFahrerOpen] = useState(false);
  const [editFahrer, setEditFahrer] = useState<Fahrerverwaltung | null>(null);
  const [createKundeOpen, setCreateKundeOpen] = useState(false);
  const [editKunde, setEditKunde] = useState<Kundenverwaltung | null>(null);

  // ─── advance to next status — shared write path ─────────────────────────
  const advanceToGeliefert = useCallback(async (b: EnrichedBestellverwaltung) => {
    const before = b.fields.order_status?.key;
    setBestellverwaltung(prev =>
      prev.map(x => x.record_id === b.record_id
        ? { ...x, fields: { ...x.fields, order_status: { key: 'geliefert', label: 'Geliefert' } } }
        : x),
    );
    undoToast(tt('geliefert_toast'), async () => {
      setBestellverwaltung(prev =>
        prev.map(x => x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, order_status: { key: before ?? 'unterwegs', label: before ?? 'Unterwegs' } } }
          : x),
      );
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: before ?? 'unterwegs' });
    });
    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: 'geliefert' });
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // ─── Kanban card move ────────────────────────────────────────────────────
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const label = ORDER_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    setBestellverwaltung(prev =>
      prev.map(b => b.record_id === rid
        ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label } } }
        : b),
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
      undoToast(`Status → ${label}`);
    } catch {
      await fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // ─── derived data (below hooks, above early returns) ─────────────────────
  // All hooks must be above loading/error early returns
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const todayKey = format(clock, 'yyyy-MM-dd');

  // Überfällige: desired_delivery_time vergangen, Status NICHT geliefert/storniert
  const TERMINAL = new Set(['geliefert', 'storniert']);
  const ueberfaellige = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    if (TERMINAL.has(s ?? '')) return false;
    if (!b.fields.desired_delivery_time) return false;
    try {
      return isBefore(parseISO(b.fields.desired_delivery_time), clock);
    } catch { return false; }
  });

  const unterwegsHeute = enrichedBestellverwaltung.filter(b => {
    const s = lookupKey(b.fields.order_status);
    if (!b.fields.desired_delivery_time) return false;
    try {
      return isToday(parseISO(b.fields.desired_delivery_time)) && !TERMINAL.has(s ?? '');
    } catch { return false; }
  });

  const neueBestellungen = enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'neu');

  const verfuegbareFahrer = fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar');

  const umsatzHeute = enrichedBestellverwaltung
    .filter(b => b.fields.order_date && isToday(parseISO(b.fields.order_date)))
    .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0);

  // Context line
  const aktiveNames = unterwegsHeute.map(b => b.kundeName).filter(Boolean);
  let contextLine: string;
  if (unterwegsHeute.length === 0 && neueBestellungen.length === 0) {
    contextLine = tt('context_zero');
  } else if (unterwegsHeute.length > 0) {
    contextLine = tt('context_deliveries', {
      n: String(unterwegsHeute.length),
      s: unterwegsHeute.length === 1 ? '' : 'en',
      c: String(new Set(unterwegsHeute.map(b => extractRecordId(b.fields.kunde))).size),
    });
  } else {
    contextLine = tt('context_active', { names: namen(aktiveNames) });
  }

  // Kanban cards
  const cards = enrichedBestellverwaltung.map(b => {
    const status = lookupKey(b.fields.order_status) ?? ORDER_COLUMNS[0]?.key ?? '';
    return {
      id: `bestellung:${b.record_id}`,
      column: status,
      title: b.kundeName || b.fields.delivery_city || `#${b.record_id.slice(-4)}`,
      subtitle: b.fields.desired_delivery_time
        ? formatDate(b.fields.desired_delivery_time)
        : b.fields.ordered_items?.slice(0, 40),
      tone: toneForOrderStatus(status),
    } as KanbanCard;
  });

  // Map markers — only Bestellungen mit Geo
  const markers = enrichedBestellverwaltung.flatMap(b => {
    const geo = b.fields.delivery_location;
    if (!geo) return [];
    const s = lookupKey(b.fields.order_status);
    if (TERMINAL.has(s ?? '')) return [];
    return [{
      id: `bestellung:${b.record_id}`,
      lat: geo.lat,
      long: geo.long,
      title: b.kundeName || b.fields.delivery_city || '—',
      subtitle: geo.info ?? b.fields.delivery_street,
      tone: toneForDelivery(s),
      icon: 'truck' as const,
    } as MapMarker];
  });

  // WorkList items — aktive Lieferungen heute
  const lieferungenHeute = unterwegsHeute
    .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? ''))
    .slice(0, 8)
    .map(b => ({
      id: b.record_id,
      title: b.kundeName || b.fields.delivery_city || '—',
      secondLine: (
        <span className="flex gap-1.5 flex-wrap">
          <span className={`font-medium ${lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-primary' : 'text-warning'}`}>
            {b.fields.order_status?.label ?? '—'}
          </span>
          {b.fields.desired_delivery_time && (
            <span className="text-muted-foreground">· {formatDate(b.fields.desired_delivery_time)}</span>
          )}
        </span>
      ),
      action: lookupKey(b.fields.order_status) !== 'geliefert'
        ? { label: tt('advance_label'), onClick: () => void advanceToGeliefert(b) }
        : undefined,
    }));

  // WorkList items — neu/in_bearbeitung als Queue
  const queue = enrichedBestellverwaltung
    .filter(b => ['neu', 'in_bearbeitung', 'bereit_zur_lieferung'].includes(lookupKey(b.fields.order_status) ?? ''))
    .sort((a, b) => (a.fields.order_date ?? '').localeCompare(b.fields.order_date ?? ''))
    .slice(0, 6)
    .map(b => ({
      id: b.record_id,
      title: b.kundeName || b.fields.delivery_city || '—',
      secondLine: (
        <span className="flex gap-1.5 flex-wrap">
          <span className="font-medium text-muted-foreground">{b.fields.order_status?.label ?? '—'}</span>
          {b.fields.ordered_items && (
            <span className="text-muted-foreground truncate max-w-[140px]">· {b.fields.ordered_items.slice(0, 30)}</span>
          )}
        </span>
      ),
      action: lookupKey(b.fields.order_status) === 'neu'
        ? { label: '→ Bearbeiten', onClick: () => { setEditBestellung(b); } }
        : undefined,
    }));

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
          </div>
          <Button
            size="sm"
            onClick={() => { setCreateBestellDefaults(undefined); setCreateBestellOpen(true); }}
            className="shrink-0"
          >
            <IconPlus size={16} className="shrink-0 mr-1.5" />
            {tt('neue_bestellung')}
          </Button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaellige.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('faellig_action'),
              onClick: () => {
                const first = ueberfaellige[0];
                if (first) overlay.replace({ type: 'bestellung', id: first.record_id });
              },
            }}
          >
            <b>{namen(ueberfaellige.map(b => b.kundeName || b.fields.delivery_city || ''))}</b>
            {' '}— {tt('faellig_banner', { names: '' }).replace('{names}', '').trim()}
            {' '}{ueberfaellige.length > 1 ? `(${ueberfaellige.length})` : ''}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('neu')}
              value={neueBestellungen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={neueBestellungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('unterwegs')}
              value={unterwegsHeute.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsHeute.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('verfuegbar')}
              value={verfuegbareFahrer.length}
              icon={<IconUser size={16} className="shrink-0" />}
              tone={verfuegbareFahrer.length === 0 && unterwegsHeute.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('umsatz_heute')}
              value={formatCurrency(umsatzHeute)}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={ORDER_COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => {
              setCreateBestellDefaults({ order_status: column });
              setCreateBestellOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('list_heute')}
              items={lieferungenHeute}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('empty_heute'),
                action: { label: tt('neue_bestellung'), onClick: () => setCreateBestellOpen(true) },
              }}
            />
            {markers.length > 0 ? (
              <MapWidget
                markers={markers}
                legend={[
                  { label: 'Unterwegs', tone: 'primary' },
                  { label: 'Bereit', tone: 'warning' },
                  { label: 'Geliefert', tone: 'success' },
                ]}
                onMarkerClick={m => overlay.replace({ type: 'bestellung', id: m.id.split(':')[1] ?? '' })}
              />
            ) : (
              <WorkList
                title={tt('list_morgen')}
                items={queue}
                onItemClick={id => overlay.replace({ type: 'bestellung', id })}
                empty={{
                  text: tt('empty_morgen'),
                  action: { label: tt('neue_bestellung'), onClick: () => setCreateBestellOpen(true) },
                }}
              />
            )}
          </>
        }
      />

      {/* Record overlay stack — ONE shell */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={b.fields.delivery_city ? <span className="text-xs text-muted-foreground flex items-center gap-1"><IconMapPin size={13} className="shrink-0" />{b.fields.delivery_city}</span> : undefined}
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  onOpenKundenverwaltung={k => overlay.push({ type: 'kunde', id: k.record_id })}
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
                  title={[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setCreateBestellDefaults({ fahrer: f.record_id });
                    setCreateBestellOpen(true);
                  }}
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
                  title={[k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    const kidUrl = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, k.record_id);
                    setCreateBestellDefaults({ kunde: kidUrl });
                    setCreateBestellOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            const s = b ? lookupKey(b.fields.order_status) : undefined;
            if (b && s && !TERMINAL.has(s)) {
              return { label: tt('advance_label'), onClick: () => void advanceToGeliefert(b) };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = bestellverwaltung.find(x => x.record_id === top.id);
            if (b) setEditBestellung(b);
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) setEditFahrer(f);
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) setEditKunde(k);
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={createBestellOpen}
        onClose={() => setCreateBestellOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createBestellverwaltungEntry(fields);
          fetchAll();
        }}
        defaultValues={createBestellDefaults}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      {editBestellung && (
        <BestellverwaltungDialog
          open={!!editBestellung}
          onClose={() => setEditBestellung(null)}
          onSubmit={async fields => {
            await LivingAppsService.updateBestellverwaltungEntry(editBestellung.record_id, fields);
            fetchAll();
          }}
          defaultValues={editBestellung.fields as BestellverwaltungDialogDefaults}
          recordId={editBestellung.record_id}
          fahrerverwaltungList={fahrerverwaltung}
          kundenverwaltungList={kundenverwaltung}
          enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
        />
      )}

      <FahrerverwaltungDialog
        open={createFahrerOpen}
        onClose={() => setCreateFahrerOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createFahrerverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {editFahrer && (
        <FahrerverwaltungDialog
          open={!!editFahrer}
          onClose={() => setEditFahrer(null)}
          onSubmit={async fields => {
            await LivingAppsService.updateFahrerverwaltungEntry(editFahrer.record_id, fields);
            fetchAll();
          }}
          defaultValues={editFahrer.fields}
          recordId={editFahrer.record_id}
          enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
        />
      )}

      <KundenverwaltungDialog
        open={createKundeOpen}
        onClose={() => setCreateKundeOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />

      {editKunde && (
        <KundenverwaltungDialog
          open={!!editKunde}
          onClose={() => setEditKunde(null)}
          onSubmit={async fields => {
            await LivingAppsService.updateKundenverwaltungEntry(editKunde.record_id, fields);
            fetchAll();
          }}
          defaultValues={editKunde.fields}
          recordId={editKunde.record_id}
          enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
        />
      )}
    </>
  );
}
