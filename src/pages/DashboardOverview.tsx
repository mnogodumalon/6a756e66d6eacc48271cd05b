import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Kundenverwaltung, Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { MapWidget } from '@/components/widgets/MapWidget';
import type { MapMarker } from '@/components/widgets/MapWidget';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  RecordSection,
  RecordField,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDetails } from '@/components/details/BestellverwaltungDetails';
import { FahrerverwaltungDetails } from '@/components/details/FahrerverwaltungDetails';
import { KundenverwaltungDetails } from '@/components/details/KundenverwaltungDetails';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import type { BestellverwaltungDialogDefaults } from '@/components/dialogs/BestellverwaltungDialog';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel, fieldLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconPackage,
  IconTruck,
  IconUsers,
  IconAlertTriangle,
  IconMapPin,
  IconCheck,
  IconClock,
  IconCircleX,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    contextLine: 'Heute aktive Bestellungen im Blick',
    heroMsg: '{names} — Bestellung{pl} überfällig',
    heroAction: 'Als unterwegs markieren',
    stripActive: 'Aktiv',
    stripUnterwegs: 'Unterwegs',
    stripDrivers: 'Fahrer verfügbar',
    stripRevenue: 'Umsatz heute',
    listTodayTitle: 'Heute zu liefern',
    listOverdueTitle: 'Überfällig',
    emptyToday: 'Keine Lieferungen heute — nächste Bestellung anlegen',
    emptyOverdue: 'Alles im Zeitplan',
    newOrder: 'Neue Bestellung',
    markUnterwegs: '→ Unterwegs',
    markGeliefert: '✓ Geliefert',
    undoStatus: 'Status zurückgesetzt',
    mapTitle: 'Lieferorte',
  },
  en: {
    contextLine: "Today's active orders at a glance",
    heroMsg: '{names} — order{pl} overdue',
    heroAction: 'Mark as on the way',
    stripActive: 'Active',
    stripUnterwegs: 'On the way',
    stripDrivers: 'Drivers available',
    stripRevenue: "Today's revenue",
    listTodayTitle: 'Deliver today',
    listOverdueTitle: 'Overdue',
    emptyToday: 'No deliveries today — create next order',
    emptyOverdue: 'Everything on schedule',
    newOrder: 'New order',
    markUnterwegs: '→ On the way',
    markGeliefert: '✓ Delivered',
    undoStatus: 'Status reverted',
    mapTitle: 'Delivery locations',
  },
  cs: {
    contextLine: 'Dnešní aktivní objednávky přehledně',
    heroMsg: '{names} — objednávk{pl} po termínu',
    heroAction: 'Označit jako na cestě',
    stripActive: 'Aktivní',
    stripUnterwegs: 'Na cestě',
    stripDrivers: 'Dostupní řidiči',
    stripRevenue: 'Tržby dnes',
    listTodayTitle: 'Doručit dnes',
    listOverdueTitle: 'Po termínu',
    emptyToday: 'Dnes žádné doručení — vytvořit objednávku',
    emptyOverdue: 'Vše dle plánu',
    newOrder: 'Nová objednávka',
    markUnterwegs: '→ Na cestě',
    markGeliefert: '✓ Doručeno',
    undoStatus: 'Stav vrácen',
    mapTitle: 'Místa doručení',
  },
});

type OverlayItem =
  | { type: 'bestellung'; record: EnrichedBestellverwaltung }
  | { type: 'fahrer'; record: Fahrerverwaltung }
  | { type: 'kunde'; record: Kundenverwaltung };

const STATUS_NEXT: Record<string, string> = {
  neu: 'in_bearbeitung',
  in_bearbeitung: 'bereit_zur_lieferung',
  bereit_zur_lieferung: 'unterwegs',
  unterwegs: 'geliefert',
};

const STATUS_TONE: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'destructive'> = {
  neu: 'default',
  in_bearbeitung: 'primary',
  bereit_zur_lieferung: 'warning',
  unterwegs: 'primary',
  geliefert: 'success',
  storniert: 'destructive',
};

export default function DashboardOverview() {
  const {
    kundenverwaltung, fahrerverwaltung, bestellverwaltung,
    setBestellverwaltung,
    kundenverwaltungMap, fahrerverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const enrichedBestellverwaltung = enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap });

  // Dialog state
  const [bestellDialog, setBestellDialog] = useState(false);
  const [bestellDefaults, setBestellDefaults] = useState<BestellverwaltungDialogDefaults | undefined>(undefined);
  const [editingBestellung, setEditingBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [fahrerDialog, setFahrerDialog] = useState(false);
  const [editingFahrer, setEditingFahrer] = useState<Fahrerverwaltung | null>(null);
  const [kundeDialog, setKundeDialog] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kundenverwaltung | null>(null);

  const today = format(clock, 'yyyy-MM-dd');

  // KPI derivations
  const activeOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => !['geliefert', 'storniert'].includes(lookupKey(b.fields.order_status) ?? '')),
    [enrichedBestellverwaltung]
  );

  const unterwegsOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enrichedBestellverwaltung]
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const todayRevenue = useMemo(
    () => enrichedBestellverwaltung
      .filter(b => lookupKey(b.fields.order_status) === 'geliefert' && b.fields.order_date?.startsWith(today))
      .reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0),
    [enrichedBestellverwaltung, today]
  );

  // Overdue = desired_delivery_time < now AND not geliefert/storniert
  const overdueOrders = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const k = lookupKey(b.fields.order_status) ?? '';
      if (k === 'geliefert' || k === 'storniert') return false;
      if (!b.fields.desired_delivery_time) return false;
      return new Date(b.fields.desired_delivery_time) < clock;
    }),
    [enrichedBestellverwaltung, clock]
  );

  // Today's deliveries (desired_delivery_time today)
  const todayDeliveries = useMemo(
    () => enrichedBestellverwaltung.filter(b => {
      const k = lookupKey(b.fields.order_status) ?? '';
      if (k === 'geliefert' || k === 'storniert') return false;
      return b.fields.desired_delivery_time?.startsWith(today);
    }).sort((a, b) => (a.fields.desired_delivery_time ?? '').localeCompare(b.fields.desired_delivery_time ?? '')),
    [enrichedBestellverwaltung, today]
  );

  // Advance status helper
  const advanceStatus = useCallback(async (bestellung: EnrichedBestellverwaltung) => {
    const currentKey = lookupKey(bestellung.fields.order_status) ?? '';
    const nextKey = STATUS_NEXT[currentKey];
    if (!nextKey) return;
    const nextOption = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextKey);
    const prevState = [...bestellverwaltung];
    setBestellverwaltung(prev =>
      prev.map(b => b.record_id === bestellung.record_id
        ? { ...b, fields: { ...b.fields, order_status: { key: nextKey, label: nextOption?.label ?? nextKey } } }
        : b
      )
    );
    try {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: nextKey });
      undoToast(`Status → ${nextOption?.label ?? nextKey}`, () => {
        setBestellverwaltung(prevState);
        void LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, { order_status: currentKey })
          .catch(() => fetchAll());
      });
    } catch {
      setBestellverwaltung(prevState);
      fetchAll();
    }
  }, [bestellverwaltung, setBestellverwaltung, fetchAll]);

  // ─── Every hook goes ABOVE this line ───────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ───

  const kanbanColumns: KanbanColumn[] = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: STATUS_TONE[o.key] ?? 'default',
  }));

  const kanbanCards: KanbanCard[] = enrichedBestellverwaltung.map(b => {
    const statusKey = lookupKey(b.fields.order_status) ?? '';
    const isOverdue = overdueOrders.some(o => o.record_id === b.record_id);
    return {
      id: `bestellung:${b.record_id}`,
      column: statusKey || 'neu',
      title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
      subtitle: b.fields.desired_delivery_time
        ? formatDateTime(b.fields.desired_delivery_time)
        : (b.fields.delivery_street ? `${b.fields.delivery_street} ${b.fields.delivery_house_number ?? ''}`.trim() : undefined),
      tone: isOverdue ? 'destructive' : (STATUS_TONE[statusKey] ?? 'default'),
    };
  });

  const deliveryMarkers: MapMarker[] = enrichedBestellverwaltung.flatMap(b => {
    const geo = b.fields.delivery_location;
    if (!geo) return [];
    const statusKey = lookupKey(b.fields.order_status) ?? '';
    return [{
      id: `bestellung:${b.record_id}`,
      lat: geo.lat,
      long: geo.long,
      title: b.kundeName || appLabel('bestellverwaltung'),
      subtitle: geo.info,
      tone: STATUS_TONE[statusKey] ?? 'default',
      icon: 'truck',
    }];
  });

  const greetingContext = (() => {
    if (activeOrders.length === 0) return tt('contextLine');
    const names = unterwegsOrders.map(b => b.kundeName).filter(Boolean);
    if (names.length > 0) return `${gruss(clock)} ${namen(names)} ${tt('stripUnterwegs').toLowerCase()}.`;
    return `${gruss(clock)} ${activeOrders.length} ${tt('stripActive').toLowerCase()} ${appLabel('bestellverwaltung')}.`;
  })();

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-0.5">{greetingContext}</p>
          </div>
          <button
            onClick={() => { setBestellDefaults(undefined); setEditingBestellung(null); setBestellDialog(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shrink-0"
          >
            <IconPackage size={16} className="shrink-0" />
            {tt('newOrder')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={overdueOrders.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('heroAction'),
              onClick: () => advanceStatus(overdueOrders[0]),
            }}
          >
            <b>{namen(overdueOrders.map(b => b.kundeName || b.fields.delivery_city || ''))}</b>{' '}
            {tt('heroMsg', { names: '', pl: overdueOrders.length > 1 ? 'en' : '' })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('stripActive')}
              value={activeOrders.length}
              icon={<IconPackage size={16} className="shrink-0" />}
              tone={activeOrders.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('stripUnterwegs')}
              value={unterwegsOrders.length}
              icon={<IconTruck size={16} className="shrink-0" />}
              tone={unterwegsOrders.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('stripDrivers')}
              value={availableDrivers.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={availableDrivers.length === 0 && activeOrders.length > 0 ? 'destructive' : 'success'}
            />
            <StatStripItem
              title={tt('stripRevenue')}
              value={formatCurrency(todayRevenue)}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['geliefert', 'storniert']}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              const rec = enrichedBestellverwaltung.find(b => b.record_id === id);
              if (rec) overlay.replace({ type: 'bestellung', record: rec });
            }}
            onCardMove={async (cardId, newColumn) => {
              const id = cardId.split(':')[1];
              const rec = bestellverwaltung.find(b => b.record_id === id);
              if (!rec) return;
              const newOption = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === newColumn);
              const prevState = [...bestellverwaltung];
              setBestellverwaltung(prev =>
                prev.map(b => b.record_id === id
                  ? { ...b, fields: { ...b.fields, order_status: { key: newColumn, label: newOption?.label ?? newColumn } } }
                  : b
                )
              );
              try {
                await LivingAppsService.updateBestellverwaltungEntry(id, { order_status: newColumn });
                undoToast(`→ ${newOption?.label ?? newColumn}`, () => {
                  const prev = prevState.find(b => b.record_id === id);
                  const prevKey = lookupKey(prev?.fields.order_status) ?? '';
                  setBestellverwaltung(prevState);
                  void LivingAppsService.updateBestellverwaltungEntry(id, { order_status: prevKey }).catch(() => fetchAll());
                });
              } catch {
                setBestellverwaltung(prevState);
                fetchAll();
              }
            }}
            onAddCard={column => {
              setEditingBestellung(null);
              setBestellDefaults({ order_status: column });
              setBestellDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('listTodayTitle')}
              items={todayDeliveries.map(b => ({
                id: b.record_id,
                title: b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(b.fields.order_status) === 'unterwegs' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {b.fields.order_status?.label ?? '—'}
                    </span>
                    {b.fields.desired_delivery_time && (
                      <span className="text-muted-foreground"> · {formatDateTime(b.fields.desired_delivery_time)}</span>
                    )}
                  </>
                ),
                action: STATUS_NEXT[lookupKey(b.fields.order_status) ?? '']
                  ? {
                      label: lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'
                        ? tt('markUnterwegs')
                        : lookupKey(b.fields.order_status) === 'unterwegs'
                        ? tt('markGeliefert')
                        : '→',
                      onClick: () => advanceStatus(b),
                    }
                  : undefined,
              }))}
              onItemClick={id => {
                const rec = enrichedBestellverwaltung.find(b => b.record_id === id);
                if (rec) overlay.replace({ type: 'bestellung', record: rec });
              }}
              empty={{
                text: tt('emptyToday'),
                action: { label: tt('newOrder'), onClick: () => { setBestellDefaults(undefined); setEditingBestellung(null); setBestellDialog(true); } },
              }}
            />
            {deliveryMarkers.length > 0 ? (
              <MapWidget
                markers={deliveryMarkers}
                onMarkerClick={m => {
                  const id = m.id.split(':')[1];
                  const rec = enrichedBestellverwaltung.find(b => b.record_id === id);
                  if (rec) overlay.replace({ type: 'bestellung', record: rec });
                }}
              />
            ) : (
              <WorkList
                title={fieldLabel('fahrerverwaltung', 'driver_status')}
                items={fahrerverwaltung.slice(0, 5).map(f => ({
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung'),
                  secondLine: (
                    <>
                      <span className={`font-medium ${lookupKey(f.fields.driver_status) === 'verfuegbar' ? 'text-success' : lookupKey(f.fields.driver_status) === 'im_einsatz' ? 'text-warning' : 'text-muted-foreground'}`}>
                        {f.fields.driver_status?.label ?? '—'}
                      </span>
                      {f.fields.vehicle_type && (
                        <span className="text-muted-foreground"> · {f.fields.vehicle_type.label}</span>
                      )}
                    </>
                  ),
                }))}
                onItemClick={id => {
                  const rec = fahrerverwaltung.find(f => f.record_id === id);
                  if (rec) overlay.replace({ type: 'fahrer', record: rec });
                }}
                empty={{ text: `0 ${appLabel('fahrerverwaltung')}` }}
              />
            )}
          </>
        }
      />

      {/* Dialogs */}
      <BestellverwaltungDialog
        open={bestellDialog}
        onClose={() => { setBestellDialog(false); setEditingBestellung(null); setBestellDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingBestellung) {
            await LivingAppsService.updateBestellverwaltungEntry(editingBestellung.record_id, fields);
          } else {
            await LivingAppsService.createBestellverwaltungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingBestellung?.fields ?? bestellDefaults}
        recordId={editingBestellung?.record_id}
        fahrerverwaltungList={fahrerverwaltung}
        kundenverwaltungList={kundenverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <FahrerverwaltungDialog
        open={fahrerDialog}
        onClose={() => { setFahrerDialog(false); setEditingFahrer(null); }}
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
        onClose={() => { setKundeDialog(false); setEditingKunde(null); }}
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

      {/* Record overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'bestellung') {
            const b = top.record;
            const geo = b.fields.delivery_location;
            return (
              <>
                <RecordHeader
                  title={b.kundeName || b.fields.delivery_city || appLabel('bestellverwaltung')}
                  subtitle={b.fields.order_status?.label}
                  badges={
                    b.fields.order_status
                      ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[lookupKey(b.fields.order_status) ?? ''] === 'success' ? 'bg-success/10 text-success' : STATUS_TONE[lookupKey(b.fields.order_status) ?? ''] === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{b.fields.order_status.label}</span>
                      : undefined
                  }
                  actions={
                    <button
                      onClick={() => { setEditingBestellung(b); setBestellDefaults(undefined); setBestellDialog(true); }}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      Bearbeiten
                    </button>
                  }
                />
                {geo && <MapRouteLinks lat={geo.lat} long={geo.long} />}
                <BestellverwaltungDetails
                  record={b}
                  fahrerverwaltungList={fahrerverwaltung}
                  kundenverwaltungList={kundenverwaltung}
                  onOpenFahrerverwaltung={rec => overlay.push({ type: 'fahrer', record: rec })}
                  onOpenKundenverwaltung={rec => overlay.push({ type: 'kunde', record: rec })}
                />
              </>
            );
          }
          if (top.type === 'fahrer') {
            const f = top.record;
            return (
              <>
                <RecordHeader
                  title={`${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || appLabel('fahrerverwaltung')}
                  subtitle={f.fields.driver_status?.label}
                  actions={
                    <button
                      onClick={() => { setEditingFahrer(f); setFahrerDialog(true); }}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <FahrerverwaltungDetails
                  record={f}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={rec => {
                    const enriched = enrichedBestellverwaltung.find(b => b.record_id === rec.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ fahrer: f.record_id });
                    setEditingBestellung(null);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || appLabel('kundenverwaltung')}
                  subtitle={k.fields.customer_status?.label}
                  actions={
                    <button
                      onClick={() => { setEditingKunde(k); setKundeDialog(true); }}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <KundenverwaltungDetails
                  record={k}
                  bestellverwaltungList={bestellverwaltung}
                  onOpenBestellverwaltung={rec => {
                    const enriched = enrichedBestellverwaltung.find(b => b.record_id === rec.record_id);
                    if (enriched) overlay.push({ type: 'bestellung', record: enriched });
                  }}
                  onAddBestellverwaltung={() => {
                    setBestellDefaults({ kunde: k.record_id });
                    setEditingBestellung(null);
                    setBestellDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type !== 'bestellung') return undefined;
          const b = top.record;
          const statusKey = lookupKey(b.fields.order_status) ?? '';
          const nextKey = STATUS_NEXT[statusKey];
          if (!nextKey) return undefined;
          const nextLabel = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.find(o => o.key === nextKey)?.label ?? nextKey;
          return {
            label: `→ ${nextLabel}`,
            onClick: () => {
              advanceStatus(b);
              overlay.close();
            },
          };
        }}
        onEdit={top => {
          if (top.type === 'bestellung') { setEditingBestellung(top.record); setBestellDefaults(undefined); setBestellDialog(true); }
          if (top.type === 'fahrer') { setEditingFahrer(top.record); setFahrerDialog(true); }
          if (top.type === 'kunde') { setEditingKunde(top.record); setKundeDialog(true); }
        }}
      />
    </>
  );
}
