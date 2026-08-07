import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey, formatDateTime, formatCurrency } from '@/lib/formatters';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
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
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconTruckDelivery, IconAlertCircle, IconUserCheck, IconPackage } from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_orders: '{n} Bestellungen aktiv',
    context_drivers: '{n} Fahrer im Einsatz',
    hero_title: '{n} Bestellung{p} wartete auf Zuweisung',
    hero_action: 'Jetzt zuweisen',
    kpi_active: 'Aktive Bestellungen',
    kpi_underway: 'Unterwegs',
    kpi_available: 'Fahrer verfügbar',
    kpi_today: 'Heute gewünscht',
    list_duetoday: 'Heute gewünschte Lieferungen',
    list_drivers: 'Fahrer-Übersicht',
    list_empty_orders: 'Keine Lieferungen für heute — super!',
    list_empty_drivers: 'Keine Fahrer angelegt',
    new_order: 'Neue Bestellung',
    new_driver: 'Neuer Fahrer',
    status_advance: '→ Weiter',
    status_pickup: 'Fertig zur Abholung',
  },
  en: {
    context_orders: '{n} orders active',
    context_drivers: '{n} drivers on the road',
    hero_title: '{n} order{p} waiting for driver assignment',
    hero_action: 'Assign now',
    kpi_active: 'Active Orders',
    kpi_underway: 'On the way',
    kpi_available: 'Drivers available',
    kpi_today: 'Due today',
    list_duetoday: 'Deliveries due today',
    list_drivers: 'Driver overview',
    list_empty_orders: 'No deliveries due today — great!',
    list_empty_drivers: 'No drivers added yet',
    new_order: 'New Order',
    new_driver: 'New Driver',
    status_advance: '→ Next',
    status_pickup: 'Ready for pickup',
  },
  cs: {
    context_orders: '{n} aktivních objednávek',
    context_drivers: '{n} řidičů v terénu',
    hero_title: '{n} objednávka čeká na přiřazení řidiče',
    hero_action: 'Přiřadit nyní',
    kpi_active: 'Aktivní objednávky',
    kpi_underway: 'Na cestě',
    kpi_available: 'Dostupní řidiči',
    kpi_today: 'Dnes požadováno',
    list_duetoday: 'Dodávky na dnes',
    list_drivers: 'Přehled řidičů',
    list_empty_orders: 'Dnes žádné dodávky — skvělé!',
    list_empty_drivers: 'Zatím žádní řidiči',
    new_order: 'Nová objednávka',
    new_driver: 'Nový řidič',
    status_advance: '→ Dál',
    status_pickup: 'Připraveno k vyzvednutí',
  },
});

type OverlayItem =
  | { type: 'bestellung'; id: string }
  | { type: 'fahrer'; id: string }
  | { type: 'kunde'; id: string };

const COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'geliefert') return 'success';
  if (status === 'unterwegs') return 'primary';
  if (status === 'bereit_zur_lieferung') return 'warning';
  if (status === 'storniert') return 'default';
  return 'warning';
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

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [bestellEditId, setBestellEditId] = useState<string | undefined>(undefined);

  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [fahrerEditId, setFahrerEditId] = useState<string | undefined>(undefined);

  const [kundeDialog, setKundeDialog] = useState(false);

  // Derived values for the dashboard
  const today = format(clock, 'yyyy-MM-dd');

  const activeOrders = useMemo(() =>
    enrichedBestellverwaltung.filter(b => {
      const s = lookupKey(b.fields.order_status);
      return s !== 'geliefert' && s !== 'storniert';
    }),
    [enrichedBestellverwaltung]
  );

  const underwayOrders = useMemo(() =>
    enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung]
  );

  const readyOrders = useMemo(() =>
    enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [enrichedBestellverwaltung]
  );

  const availableDrivers = useMemo(() =>
    fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const busyDrivers = useMemo(() =>
    fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'im_einsatz'),
    [fahrerverwaltung]
  );

  const dueTodayOrders = useMemo(() =>
    enrichedBestellverwaltung
      .filter(b => {
        const s = lookupKey(b.fields.order_status);
        if (s === 'geliefert' || s === 'storniert') return false;
        const dt = b.fields.desired_delivery_time;
        return dt ? dt.slice(0, 10) === today : false;
      })
      .sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung, today]
  );

  // Advance status helper (shared by WorkList, HeroBanner, overlay footer)
  const advanceStatus = useCallback(async (b: EnrichedBestellverwaltung) => {
    const STATUS_FLOW: Record<string, string> = {
      neu: 'in_bearbeitung',
      in_bearbeitung: 'bereit_zur_lieferung',
      bereit_zur_lieferung: 'unterwegs',
      unterwegs: 'geliefert',
    };
    const current = lookupKey(b.fields.order_status) ?? 'neu';
    const next = STATUS_FLOW[current];
    if (!next) return;

    const nextOpt = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).find(o => o.key === next);
    const prevFields = { ...b.fields };

    // Optimistic update
    setBestellverwaltung(prev =>
      prev.map(r =>
        r.record_id === b.record_id
          ? { ...r, fields: { ...r.fields, order_status: { key: next, label: nextOpt?.label ?? next } } }
          : r
      )
    );

    undoToast(`${b.kundeName || b.fields.delivery_street || 'Bestellung'} → ${nextOpt?.label ?? next}`, async () => {
      setBestellverwaltung(prev =>
        prev.map(r =>
          r.record_id === b.record_id
            ? { ...r, fields: { ...r.fields, order_status: prevFields.order_status } }
            : r
        )
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: current });
      } catch {
        fetchAll();
      }
    });

    try {
      await LivingAppsService.updateBestellverwaltungEntry(b.record_id, { order_status: next });
    } catch {
      fetchAll();
    }
  }, [setBestellverwaltung, fetchAll]);

  // Move card on kanban drag
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const b = bestellverwaltung.find(r => r.record_id === rid);
    if (!b) return;
    const prevStatus = lookupKey(b.fields.order_status);
    const nextOpt = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).find(o => o.key === newColumn);

    setBestellverwaltung(prev =>
      prev.map(r =>
        r.record_id === rid
          ? { ...r, fields: { ...r.fields, order_status: { key: newColumn, label: nextOpt?.label ?? newColumn } } }
          : r
      )
    );

    undoToast(`Status → ${nextOpt?.label ?? newColumn}`, async () => {
      setBestellverwaltung(prev =>
        prev.map(r =>
          r.record_id === rid
            ? { ...r, fields: { ...r.fields, order_status: b.fields.order_status } }
            : r
        )
      );
      try {
        await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: prevStatus ?? newColumn });
      } catch {
        fetchAll();
      }
    });

    try {
      await LivingAppsService.updateBestellverwaltungEntry(rid, { order_status: newColumn });
    } catch {
      fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(() =>
    enrichedBestellverwaltung.map(b => {
      const status = lookupKey(b.fields.order_status) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `bestellung:${b.record_id}`,
        column: status,
        title: b.kundeName || b.fields.delivery_street || appLabel('bestellverwaltung'),
        subtitle: b.fields.desired_delivery_time
          ? formatDateTime(b.fields.desired_delivery_time)
          : b.fahrerName || undefined,
        tone: toneForStatus(status),
      };
    }),
    [enrichedBestellverwaltung]
  );

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ───

  // Context line
  const contextParts: string[] = [];
  if (activeOrders.length > 0)
    contextParts.push(tt('context_orders', { n: activeOrders.length }));
  if (busyDrivers.length > 0)
    contextParts.push(tt('context_drivers', { n: busyDrivers.length }));
  const contextLine = contextParts.length > 0
    ? contextParts.join(' · ')
    : namen(availableDrivers.map(f => `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()));

  // Hero: orders in "bereit_zur_lieferung" without driver assigned
  const unassigned = readyOrders.filter(b => !b.fields.fahrer);
  const heroContent = unassigned.length > 0 ? (
    <HeroBanner
      icon={<IconAlertCircle size={18} />}
      action={{
        label: tt('hero_action'),
        onClick: () => {
          const first = unassigned[0];
          if (first) {
            setBestellDefaults({ order_status: 'bereit_zur_lieferung' });
            setBestellEditId(first.record_id);
            setBestellDialog(true);
          }
        },
      }}
    >
      <b>{namen(unassigned.map(b => b.kundeName || b.fields.delivery_street || ''))}</b>{' '}
      {tt('hero_title', { n: unassigned.length, p: unassigned.length === 1 ? '' : 'en' })}
    </HeroBanner>
  ) : null;

  // Overlay helpers
  const findBestellung = (id: string) => enrichedBestellverwaltung.find(b => b.record_id === id);
  const findFahrer = (id: string) => fahrerverwaltung.find(f => f.record_id === id);
  const findKunde = (id: string) => kundenverwaltung.find(k => k.record_id === id);

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); }}
          >
            <IconPackage size={16} className="shrink-0" />
            {tt('new_order')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroContent}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_active')}
              value={activeOrders.length}
              icon={<IconPackage size={16} />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_underway')}
              value={underwayOrders.length}
              icon={<IconTruckDelivery size={16} />}
              tone={underwayOrders.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_available')}
              value={availableDrivers.length}
              icon={<IconUserCheck size={16} />}
              tone={availableDrivers.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tt('kpi_today')}
              value={dueTodayOrders.length}
              icon={<IconTruckDelivery size={16} />}
              tone={dueTodayOrders.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => overlay.replace({ type: 'bestellung', id: card.id.split(':')[1] ?? '' })}
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
              title={tt('list_duetoday')}
              items={dueTodayOrders.map(b => ({
                id: b.record_id,
                title: b.kundeName || b.fields.delivery_street || appLabel('bestellverwaltung'),
                secondLine: (
                  <>
                    <span className={`font-medium ${
                      lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-warning' :
                      lookupKey(b.fields.order_status) === 'bereit_zur_lieferung' ? 'text-amber-600' :
                      'text-muted-foreground'
                    }`}>
                      {b.fields.order_status?.label ?? '—'}
                    </span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: lookupKey(b.fields.order_status) !== 'geliefert' && lookupKey(b.fields.order_status) !== 'storniert'
                  ? { label: tt('status_advance'), onClick: () => advanceStatus(b) }
                  : undefined,
              }))}
              onItemClick={id => overlay.replace({ type: 'bestellung', id })}
              empty={{
                text: tt('list_empty_orders'),
                action: { label: tt('new_order'), onClick: () => { setBestellDefaults(undefined); setBestellEditId(undefined); setBestellDialog(true); } },
              }}
            />
            <WorkList
              title={tt('list_drivers')}
              items={fahrerverwaltung.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${
                      lookupKey(f.fields.driver_status) === 'verfuegbar' ? 'text-success' :
                      lookupKey(f.fields.driver_status) === 'im_einsatz' ? 'text-warning' :
                      'text-muted-foreground'
                    }`}>
                      {f.fields.driver_status?.label ?? '—'}
                    </span>
                    {f.fields.vehicle_type && (
                      <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => overlay.replace({ type: 'fahrer', id })}
              empty={{
                text: tt('list_empty_drivers'),
                action: { label: tt('new_driver'), onClick: () => { setFahrerEditId(undefined); setFahrerDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* RecordOverlayHost — ONE shell for all overlay types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = findBestellung(top.id);
            if (!b) return null;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_street || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={b.fields.total_amount != null
                    ? <span className="text-xs font-medium text-muted-foreground">{formatCurrency(b.fields.total_amount)}</span>
                    : undefined}
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
            const f = findFahrer(top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim()}
                  subtitle={f.fields.driver_status?.label}
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setBestellEditId(undefined);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = findKunde(top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim()}
                  subtitle={k.fields.customer_status?.label}
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={b => overlay.push({ type: 'bestellung', id: b.record_id })}
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
          if (top.type === 'bestellung') {
            const b = findBestellung(top.id);
            if (!b) return undefined;
            const s = lookupKey(b.fields.order_status);
            const STATUS_FLOW: Record<string, string> = {
              neu: 'in_bearbeitung',
              in_bearbeitung: 'bereit_zur_lieferung',
              bereit_zur_lieferung: 'unterwegs',
              unterwegs: 'geliefert',
            };
            const nextKey = s ? STATUS_FLOW[s] : undefined;
            if (!nextKey) return undefined;
            const nextOpt = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).find(o => o.key === nextKey);
            return {
              label: `→ ${nextOpt?.label ?? nextKey}`,
              onClick: () => advanceStatus(b),
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'bestellung') {
            const b = findBestellung(top.id);
            if (!b) return;
            setBestellDefaults(undefined);
            setBestellEditId(b.record_id);
            setBestellDialog(true);
          } else if (top.type === 'fahrer') {
            setFahrerEditId(top.id);
            setFahrerDialog(true);
          }
        }}
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => { setBestellDialog(false); setBestellEditId(undefined); setBestellDefaults(undefined); }}
        onSubmit={async fields => {
          if (bestellEditId) {
            await LivingAppsService.updateBestellverwaltungEntry(bestellEditId, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={bestellEditId
          ? (findBestellung(bestellEditId)?.fields as BestellverwaltungDialogDefaults)
          : bestellDefaults}
        recordId={bestellEditId}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialog}
        onClose={() => { setFahrerDialog(false); setFahrerEditId(undefined); }}
        onSubmit={async fields => {
          if (fahrerEditId) {
            await LivingAppsService.updateFahrerverwaltungEntry(fahrerEditId, fields);
          } else {
            await LivingAppsService.createFahrerverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrerEditId ? fahrerverwaltung.find(f => f.record_id === fahrerEditId)?.fields : undefined}
        recordId={fahrerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrerverwaltung']}
      />

      <KundenverwaltungDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenverwaltungEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kundenverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kundenverwaltung']}
      />
    </>
  );
}
