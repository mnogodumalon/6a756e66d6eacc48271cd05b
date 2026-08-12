/**
 * Lieferung verwalten — 2-Schritt-Wizard.
 * Steps: 1) Aktive Bestellung wählen (Status: neu|in_bearbeitung|bereit_zur_lieferung|unterwegs)
 *        → 2) Status & Fahrer aktualisieren → Bestätigung.
 * Reads: bestellverwaltung, fahrerverwaltung. Writes: bestellverwaltung (updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IconTruck, IconUser, IconPackage, IconCheck, IconRefresh } from '@tabler/icons-react';

const ACTIVE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];

export default function LieferungVerwaltenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStep = Number(searchParams.get('step') ?? '1');
  const initialOrderId = searchParams.get('orderId') ?? '';

  const [step, setStep] = useState(initialStep > 0 ? initialStep : 1);
  const [selectedBestellung, setSelectedBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string>('none');
  const [newStatus, setNewStatus] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string>('');
  const [savedFahrerName, setSavedFahrerName] = useState('');

  const { bestellverwaltung, fahrerverwaltung, fahrerverwaltungMap, kundenverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const enrichedBestellungen = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap]
  );

  const aktiveBestellungen = useMemo(
    () => enrichedBestellungen.filter(b => ACTIVE_STATUSES.has(b.fields.order_status?.key ?? '')),
    [enrichedBestellungen]
  );

  // Pre-select order from URL param after data loads
  const preSelectedOrder = useMemo(() => {
    if (!initialOrderId || selectedBestellung) return null;
    return aktiveBestellungen.find(b => b.record_id === initialOrderId) ?? null;
  }, [initialOrderId, aktiveBestellungen, selectedBestellung]);

  // Live-Zähler nach Status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    aktiveBestellungen.forEach(b => {
      const key = b.fields.order_status?.key ?? '';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [aktiveBestellungen]);

  // Verfügbare Fahrer: status=verfuegbar ODER aktuell zugewiesener Fahrer
  const verfuegbareFahrer = useMemo<Fahrerverwaltung[]>(() => {
    const currentFahrerId = selectedBestellung
      ? extractRecordId(selectedBestellung.fields.fahrer)
      : null;
    return fahrerverwaltung.filter(f => {
      const statusK = f.fields.driver_status?.key;
      return statusK === 'verfuegbar' || f.record_id === currentFahrerId;
    });
  }, [fahrerverwaltung, selectedBestellung]);

  function handleSelectBestellung(id: string) {
    const found = aktiveBestellungen.find(b => b.record_id === id) ?? null;
    setSelectedBestellung(found);
    if (found) {
      const currentFahrerId = extractRecordId(found.fields.fahrer);
      setSelectedFahrerId(currentFahrerId ?? 'none');
      setNewStatus(found.fields.order_status?.key ?? ORDER_STATUS_OPTIONS[0]?.key ?? '');
      setDeliveryNotes(found.fields.delivery_notes ?? '');
    }
    const next = 2;
    setStep(next);
    setSearchParams(p => { p.set('step', String(next)); return p; });
  }

  function handlePreSelect() {
    if (preSelectedOrder) {
      handleSelectBestellung(preSelectedOrder.record_id);
    }
  }

  async function handleSave() {
    if (!selectedBestellung || !newStatus) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fahrerUrl = selectedFahrerId !== 'none'
        ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
        : undefined;
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        order_status: newStatus,
        fahrer: fahrerUrl,
        delivery_notes: deliveryNotes || undefined,
      });
      const fahrerRecord = selectedFahrerId !== 'none'
        ? fahrerverwaltungMap.get(selectedFahrerId)
        : null;
      const fahrerName = fahrerRecord
        ? `${fahrerRecord.fields.driver_first_name ?? ''} ${fahrerRecord.fields.driver_last_name ?? ''}`.trim()
        : '';
      setSavedStatus(newStatus);
      setSavedFahrerName(fahrerName);
      setSuccess(true);
      await fetchAll();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedBestellung(null);
    setSelectedFahrerId('none');
    setNewStatus('');
    setDeliveryNotes('');
    setSaveError(null);
    setSuccess(false);
    setSavedStatus('');
    setSavedFahrerName('');
    setStep(1);
    setSearchParams(p => { p.set('step', '1'); return p; });
  }

  const savedStatusOption = ORDER_STATUS_OPTIONS.find(o => o.key === savedStatus);

  return (
    <IntentWizardShell
      title={tx('Lieferung verwalten')}
      subtitle={tx('Bestellung wählen, Status aktualisieren und Fahrer zuweisen')}
      steps={[{ label: tx('Bestellung') }, { label: tx('Aktualisieren') }]}
      currentStep={step}
      onStepChange={s => { setStep(s); setSearchParams(p => { p.set('step', String(s)); return p; }); }}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {step === 1 && (
        <div className="space-y-4">
          {/* Live-Zähler */}
          {aktiveBestellungen.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([key, count]) => {
                const opt = ORDER_STATUS_OPTIONS.find(o => o.key === key);
                return (
                  <div key={key} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm">
                    <StatusBadge statusKey={key} label={opt?.label ?? key} />
                    <span className="font-medium text-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pre-select from URL */}
          {preSelectedOrder && (
            <div className="rounded-2xl border bg-card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {tx('Vorausgewählt')}: {preSelectedOrder.kundeName || tx('Unbekannter Kunde')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(preSelectedOrder.fields.order_date)} · {formatCurrency(preSelectedOrder.fields.total_amount)}
                </p>
              </div>
              <Button size="sm" onClick={handlePreSelect}>{tx('Übernehmen')}</Button>
            </div>
          )}

          <EntitySelectStep
            items={aktiveBestellungen.map(b => ({
              id: b.record_id,
              title: b.kundeName || tx('Unbekannter Kunde'),
              subtitle: `${formatDate(b.fields.order_date)} · ${formatCurrency(b.fields.total_amount)}`,
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                ...(b.fahrerName ? [{ label: tx('Fahrer'), value: b.fahrerName }] : []),
                ...(b.fields.ordered_items ? [{ label: tx('Artikel'), value: b.fields.ordered_items.length > 40 ? b.fields.ordered_items.slice(0, 40) + '…' : b.fields.ordered_items }] : []),
              ],
              icon: <IconPackage size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectBestellung}
            searchPlaceholder={tx('Bestellung suchen …')}
            emptyText={tx('Keine aktiven Bestellungen vorhanden')}
            emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
          />
        </div>
      )}

      {step === 2 && (
        selectedBestellung ? (
          success ? (
            /* Bestätigungsview */
            <div className="space-y-6 text-center py-8">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-5">
                  <IconCheck size={40} className="text-primary" stroke={1.5} />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{tx('Bestellung aktualisiert')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {tx('Die Änderungen wurden erfolgreich gespeichert.')}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left space-y-3 max-w-sm mx-auto">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-24">{tx('Neuer Status')}</span>
                  <StatusBadge statusKey={savedStatus} label={savedStatusOption?.label ?? savedStatus} />
                </div>
                {savedFahrerName && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-24">{tx('Fahrer')}</span>
                    <span className="text-sm font-medium text-foreground">{savedFahrerName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-24">{tx('Kunde')}</span>
                  <span className="text-sm text-foreground truncate">{selectedBestellung.kundeName || '—'}</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleReset} className="gap-2">
                  <IconRefresh size={16} stroke={1.5} />
                  {tx('Weitere Bestellung bearbeiten')}
                </Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            /* Status & Fahrer-Formular */
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Bestellungsübersicht */}
              <div className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <IconPackage size={18} className="text-primary" stroke={1.5} />
                  <span className="font-medium text-foreground">{selectedBestellung.kundeName || tx('Unbekannter Kunde')}</span>
                  <StatusBadge statusKey={selectedBestellung.fields.order_status?.key} label={selectedBestellung.fields.order_status?.label} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{tx('Bestelldatum')}</span>
                    <p className="font-medium">{formatDate(selectedBestellung.fields.order_date)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tx('Betrag')}</span>
                    <p className="font-medium">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                  </div>
                  {selectedBestellung.fields.ordered_items && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{tx('Artikel')}</span>
                      <p className="text-sm line-clamp-2">{selectedBestellung.fields.ordered_items}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{tx('Neuer Status')}</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Status wählen …')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fahrer */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <IconUser size={16} stroke={1.5} />
                  {tx('Fahrer zuweisen')}
                  <span className="text-muted-foreground font-normal ml-1">{tx('(optional)')}</span>
                </label>
                <Select value={selectedFahrerId} onValueChange={setSelectedFahrerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Fahrer wählen …')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tx('Kein Fahrer')}</SelectItem>
                    {verfuegbareFahrer.map(f => {
                      const name = `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim();
                      const statusK = lookupKey(f.fields.driver_status);
                      const isCurrentFahrer = extractRecordId(selectedBestellung.fields.fahrer) === f.record_id;
                      const label = isCurrentFahrer
                        ? `${name} (${tx('aktuell')})`
                        : statusK === 'im_einsatz'
                          ? `${name} (${tx('im Einsatz')})`
                          : name;
                      return (
                        <SelectItem key={f.record_id} value={f.record_id}>{label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Notizen */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {tx('Liefernotizen')}
                  <span className="text-muted-foreground font-normal ml-1">{tx('(optional)')}</span>
                </label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tx('Hinweise für die Lieferung …')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {saveError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {saveError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving || !newStatus}
                  className="flex-1 gap-2"
                >
                  <IconCheck size={16} stroke={1.5} />
                  {saving ? tx('Wird gespeichert …') : tx('Änderungen speichern')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setStep(1); setSearchParams(p => { p.set('step', '1'); return p; }); }}
                >
                  {tx('Andere Bestellung wählen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          /* Fallback: kein Bestellung gewählt */
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine Bestellung aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => { setStep(1); setSearchParams(p => { p.set('step', '1'); return p; }); }}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
