import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { useState, useMemo, useCallback } from 'react';
import { makeT, appLabel, fieldLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
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
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { format } from 'date-fns';
import {
  IconAlertTriangle,
  IconPackage,
  IconTruck,
  IconCircleCheck,
  IconClock,
  IconPlus,
  IconUser,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    page_title: 'Lieferzentrale',
    context_idle: 'Alles läuft — keine offenen Eskalationen.',
    context_underway: 'Unterwegs: {names}.',
    hero_title: '{n} Lieferung unterwegs ohne Aktualisierung',
    hero_title_plural: '{n} Lieferungen unterwegs ohne Aktualisierung',
    hero_action: 'Als geliefert markieren',
    kpi_total: 'Bestellungen heute',
    kpi_underway: 'Unterwegs',
    kpi_ready: 'Bereit zur Lieferung',
    kpi_done: 'Geliefert',
    aside_today: 'Fällig heute',
    aside_drivers: 'Fahrer',
    aside_empty: 'Keine ausstehenden Lieferungen',
    aside_drivers_empty: 'Keine Fahrer erfasst',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    new_customer: 'Neuer Kunde',
    mark_delivered: '✓ Geliefert',
    status_neu: 'Neu',
    status_in_bearbeitung: 'In Bearbeitung',
    status_bereit: 'Bereit zur Lieferung',
    status_unterwegs: 'Unterwegs',
    status_geliefert: 'Geliefert',
    status_storniert: 'Storniert',
    driver_available: 'Verfügbar',
    driver_on_duty: 'Im Einsatz',
    driver_unavailable: 'Nicht verfügbar',
  },
  en: {
    page_title: 'Delivery Center',
    context_idle: 'Everything running — no open escalations.',
    context_underway: 'En route: {names}.',
    hero_title: '{n} delivery en route without update',
    hero_title_plural: '{n} deliveries en route without update',
    hero_action: 'Mark as delivered',
    kpi_total: "Today's orders",
    kpi_underway: 'En route',
    kpi_ready: 'Ready for delivery',
    kpi_done: 'Delivered',
    aside_today: 'Due today',
    aside_drivers: 'Drivers',
    aside_empty: 'No pending deliveries',
    aside_drivers_empty: 'No drivers on record',
    new_order: 'New order',
    new_driver: 'New driver',
    new_customer: 'New customer',
    mark_delivered: '✓ Delivered',
    status_neu: 'New',
    status_in_bearbeitung: 'In progress',
    status_bereit: 'Ready for delivery',
    status_unterwegs: 'En route',
    status_geliefert: 'Delivered',
    status_storniert: 'Cancelled',
    driver_available: 'Available',
    driver_on_duty: 'On duty',
    driver_unavailable: 'Unavailable',
  },
  cs: {
    page_title: 'Centrum doručování',
    context_idle: 'Vše funguje — žádné eskalace.',
    context_underway: 'Na cestě: {names}.',
    hero_title: '{n} doručení na cestě bez aktualizace',
    hero_title_plural: '{n} doručení na cestě bez aktualizace',
    hero_action: 'Označit jako doručené',
    kpi_total: 'Objednávky dnes',
    kpi_underway: 'Na cestě',
    kpi_ready: 'Připraveno k doručení',
    kpi_done: 'Doručeno',
    aside_today: 'Splatné dnes',
    aside_drivers: 'Řidiči',
    aside_empty: 'Žádné čekající doručení',
    aside_drivers_empty: 'Žádní řidiči',
    new_order: 'Nová objednávka',
    new_driver: 'Nový řidič',
    new_customer: 'Nový zákazník',
    mark_delivered: '✓ Doručeno',
    status_neu: 'Nová',
    status_in_bearbeitung: 'Zpracovává se',
    status_bereit: 'Připraveno',
    status_unterwegs: 'Na cestě',
    status_geliefert: 'Doručeno',
    status_storniert: 'Stornováno',
    driver_available: 'K dispozici',
    driver_on_duty: 'Ve službě',
    driver_unavailable: 'Nedostupný',
  },
});

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'default';
}

const COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

export default function DashboardOverview() {
  const {
    kundenverwaltung, setKundenverwaltung,
    fahrerverwaltung, setFahrerverwaltung,
    bestellverwaltung, setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellungDialogOpen, setBestellungDialogOpen] = useState(false);
  const [bestellungDefaults, setBestellungDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | null>(null);

  const [fahrerDialogOpen, setFahrerDialogOpen] = useState(false);
  const [fahrerDefaults, setFahrerDefaults] = useState<FahrerverwaltungDialogDefaults | undefined>(undefined);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | null>(null);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | null>(null);

  // Status advance helper — shared by hero, work list rows and overlay footer
  const advanceToDelivered = useCallback(async (bestellung: EnrichedBestellverwaltung) => {
    const prev = bestellverwaltung.map(b => b);
    setBestellverwaltung(prev => prev.map(b =>
      b.record_id === bestellung.record_id
        ? { ...b, fields: { ...b.fields, order_status: { key: 'geliefert', label: tt('status_geliefert') } } }
        : b
    ));
    undoToast(
      `${bestellung.kundeName || tt('status_geliefert')} — ${tt('mark_delivered')}`,
      async () => {
        setBestellverwaltung(prev);
        await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: 'unterwegs' });
      }
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: 'geliefert' });
    } catch {
      await fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const todayBestellungen = useMemo(() =>
    enrichedBestellverwaltung.filter(b => {
      const dt = b.fields.desired_delivery_time ?? b.fields.order_date ?? '';
      return dt.startsWith(today);
    }),
    [enrichedBestellverwaltung, today]
  );

  const unterwegs = useMemo(() =>
    enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung]
  );

  const bereit = useMemo(() =>
    enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [enrichedBestellverwaltung]
  );

  const geliefert = useMemo(() =>
    enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'geliefert'),
    [enrichedBestellverwaltung]
  );

  // Hero: unterwegs orders that may need attention (any unterwegs = relevant)
  const heroBestellungen = unterwegs.slice(0, 3);

  // KanbanCards
  const cards = useMemo<KanbanCard[]>(() =>
    enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? 'neu';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || b.fields.delivery_city || 'Bestellung',
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : formatDateTime(b.fields.order_date),
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung]
  );

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    const bestellung = enrichedBestellverwaltung.find(b => b.record_id === rid);
    if (!bestellung) return;
    const snapshot = bestellverwaltung.map(b => b);
    setBestellverwaltung(prev => prev.map(b =>
      b.record_id === rid
        ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: colLabel } } }
        : b
    ));
    undoToast(
      `${bestellung.kundeName || 'Bestellung'} → ${colLabel}`,
      async () => {
        setBestellverwaltung(snapshot);
        await LivingAppsService.updateBestellverwaltungEntry(rid, {
          order_status: lookupKey(bestellung.fields.order_status) ?? 'neu',
        });
      }
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [enrichedBestellverwaltung, bestellverwaltung, setBestellverwaltung, fetchAll]);

  // Context line
  const contextLine = useMemo(() => {
    if (unterwegs.length === 0) return tt('context_idle');
    const names = namen(unterwegs.map(b => b.kundeName || b.fields.delivery_city || ''));
    return tt('context_underway', { names });
  }, [unterwegs]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const openCreateBestellung = (defaults?: BestellverwaltungDialogDefaults) => {
    setEditingBestellung(null);
    setBestellungDefaults(defaults);
    setBestellungDialogOpen(true);
  };

  const openEditBestellung = (b: EnrichedBestellverwaltung) => {
    setEditingBestellung(b);
    setBestellungDefaults(undefined);
    setBestellungDialogOpen(true);
  };

  const openCreateFahrer = () => {
    setEditingFahrer(null);
    setFahrerDefaults(undefined);
    setFahrerDialogOpen(true);
  };

  const openCreateKunde = () => {
    setEditingKunde(null);
    setKundeDialogOpen(true);
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)} {tt('page_title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => openCreateBestellung()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <IconPlus size={16} className="shrink-0" />
              {tt('new_order')}
            </button>
          </div>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={unterwegs.length > 0 && (
          <HeroBanner
            icon={<IconTruck size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => heroBestellungen[0] && advanceToDelivered(heroBestellungen[0]),
            }}
          >
            <b>{namen(heroBestellungen.map(b => b.kundeName || b.fields.delivery_city || ''))}</b>
            {' '}{unterwegs.length === 1 ? tt('hero_title', { n: unterwegs.length }) : tt('hero_title_plural', { n: unterwegs.length })}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_total')}
              value={todayBestellungen.length}
              icon={<IconPackage size={18} />}
            />
            <StatStripItem
              title={tt('kpi_underway')}
              value={unterwegs.length}
              icon={<IconTruck size={18} />}
              tone={unterwegs.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_ready')}
              value={bereit.length}
              icon={<IconClock size={18} />}
              tone={bereit.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_done')}
              value={geliefert.length}
              icon={<IconCircleCheck size={18} />}
              tone={geliefert.length > 0 ? 'success' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['storniert']}
            onCardClick={card => {
              const id = card.id.split(':')[1] ?? '';
              overlay.replace({ type: 'bestellung', id });
            }}
            onCardMove={moveCard}
            onAddCard={column => openCreateBestellung({ order_status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_today')}
              items={todayBestellungen
                .filter(b => lookupKey(b.fields.order_status) !== 'geliefert' && lookupKey(b.fields.order_status) !== 'storniert')
                .sort((a, b) => (a.fields.desired_delivery_time ?? a.fields.order_date ?? '').localeCompare(b.fields.desired_delivery_time ?? b.fields.order_date ?? ''))
                .map(b => {
                  const status = lookupKey(b.fields.order_status);
                  const statusLabel = b.fields.order_status?.label ?? status ?? '';
                  const isUnterwegs = status === 'unterwegs';
                  return {
                    id: b.record_id,
                    title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
                    secondLine: (
                      <>
                        <span className={`font-medium ${isUnterwegs ? 'text-primary' : 'text-muted-foreground'}`}>
                          {statusLabel}
                        </span>
                        {b.fields.desired_delivery_time && (
                          <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                        )}
                      </>
                    ),
                    action: isUnterwegs ? {
                      label: tt('mark_delivered'),
                      onClick: () => advanceToDelivered(b),
                    } : undefined,
                  };
                })}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('aside_empty'),
                action: { label: tt('new_order'), onClick: () => openCreateBestellung() },
              }}
            />
            <WorkList
              title={tt('aside_drivers')}
              items={fahrerverwaltung
                .filter(f => lookupKey(f.fields.driver_status) !== 'inaktiv')
                .map(f => {
                  const status = lookupKey(f.fields.driver_status);
                  const isAvail = status === 'verfuegbar';
                  const isOnDuty = status === 'im_einsatz';
                  return {
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
                    secondLine: (
                      <>
                        <span className={`font-medium ${isOnDuty ? 'text-primary' : isAvail ? 'text-success' : 'text-muted-foreground'}`}>
                          {f.fields.driver_status?.label ?? status ?? ''}
                        </span>
                        {f.fields.delivery_zone && (
                          <span className="text-muted-foreground"> · {f.fields.delivery_zone}</span>
                        )}
                      </>
                    ),
                  };
                })}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('aside_drivers_empty'),
                action: { label: tt('new_driver'), onClick: openCreateFahrer },
              }}
            />
          </>
        }
      />

      {/* Overlay stack — single host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return null;
            const status = lookupKey(b.fields.order_status);
            const isUnterwegs = status === 'unterwegs';
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isUnterwegs ? 'bg-primary/10 text-primary' :
                      status === 'geliefert' ? 'bg-success/10 text-success' :
                      status === 'storniert' ? 'bg-muted text-muted-foreground' :
                      'bg-warning/10 text-warning-foreground'
                    }`}>
                      {b.fields.order_status?.label ?? status}
                    </span>
                  }
                />
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  onOpenFahrerverwaltung={f => overlay.push({ type: 'fahrer', id: f.record_id })}
                  kundenverwaltungList={kundenverwaltung}
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
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => openCreateBestellung({ fahrer: f.record_id })}
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
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => openCreateBestellung({ kunde: k.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (!b) return undefined;
            const status = lookupKey(b.fields.order_status);
            if (status === 'unterwegs') {
              return { label: tt('mark_delivered'), onClick: () => advanceToDelivered(b) };
            }
            return undefined;
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = enrichedBestellverwaltung.find(x => x.record_id === top.id);
            if (b) { openEditBestellung(b); overlay.close(); }
          } else if (top.type === 'fahrer') {
            const f = fahrerverwaltung.find(x => x.record_id === top.id);
            if (f) { setEditingFahrer(f); setFahrerDefaults(undefined); setFahrerDialogOpen(true); overlay.close(); }
          } else if (top.type === 'kunde') {
            const k = kundenverwaltung.find(x => x.record_id === top.id);
            if (k) { setEditingKunde(k); setKundeDialogOpen(true); overlay.close(); }
          }
        }}
      />

      {/* Bestellung create/edit dialog */}
      <BestellverwaltungDialog
        open={bestellungDialogOpen}
        onClose={() => { setBestellungDialogOpen(false); setEditingBestellung(null); setBestellungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields as any);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingBestellung ? editingBestellung.fields as any : bestellungDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      {/* Fahrer create/edit dialog */}
      <FahrerverwaltungDialog
        open={fahrerDialogOpen}
        onClose={() => { setFahrerDialogOpen(false); setEditingFahrer(null); setFahrerDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingFahrer) {
            await LivingAppsService.updateFahrerverwaltungEntry(editingFahrer.record_id, fields as any);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingFahrer ? editingFahrer.fields as any : fahrerDefaults}
        recordId={editingFahrer?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      {/* Kunde create/edit dialog */}
      <KundenverwaltungDialog
        open={kundeDialogOpen}
        onClose={() => { setKundeDialogOpen(false); setEditingKunde(null); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenverwaltungEntry(editingKunde.record_id, fields as any);
          } else {
            await LivingAppsService.createKundenverwaltungEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingKunde ? editingKunde.fields as any : undefined}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
