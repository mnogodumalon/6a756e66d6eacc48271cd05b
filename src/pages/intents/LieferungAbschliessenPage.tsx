/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen (status: neu|in_bearbeitung|bereit_zur_lieferung) →
 *        2) Fahrer zuweisen (status: verfuegbar) + Bestellung auf 'unterwegs' setzen →
 *        3) Lieferung abschließen (delivery_notes eingeben, order_status → 'geliefert').
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { enrichBestellverwaltung } from '@/lib/enrich';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { makeT } from '@/i18n';
import { IconTruck, IconUser, IconMapPin, IconCheck, IconPackage } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';

const tt = makeT({
  de: {
    title: 'Lieferung abschließen',
    subtitle: 'Bestellung auswählen, Fahrer zuweisen und Lieferung bestätigen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Abschließen',
    bestellung_suchen: 'Bestellung suchen …',
    keine_bestellungen: 'Keine aktiven Bestellungen',
    bestellung_vom: 'Bestellt am',
    fahrer_suchen: 'Fahrer suchen …',
    keine_fahrer: 'Keine verfügbaren Fahrer',
    ohne_fahrerzuweisung: 'Ohne Fahrerzuweisung fortfahren',
    fahrer_ausgewaehlt: 'Fahrer ausgewählt',
    kein_fahrer: 'Kein Fahrer',
    weiter_schritt3: 'Weiter zu Schritt 3',
    zurueck: 'Zurück',
    lieferung_abschliessen: 'Lieferung abschließen',
    abschlussnotiz: 'Abschlussnotiz (optional)',
    abschlussnotiz_placeholder: 'Notiz zur Lieferung …',
    zusammenfassung: 'Lieferungszusammenfassung',
    lieferadresse: 'Lieferadresse',
    bestellte_artikel: 'Bestellte Artikel',
    gesamtbetrag: 'Gesamtbetrag',
    fahrer: 'Fahrer',
    kein_fahrer_zugewiesen: 'Kein Fahrer zugewiesen',
    erfolgreich: 'Lieferung erfolgreich abgeschlossen!',
    neue_lieferung: 'Neue Lieferung abschließen',
    zurueck_dashboard: 'Zurück zum Dashboard',
    schritt2_fehlt: 'Dieser Schritt braucht die Auswahl aus Schritt 1.',
    schritt3_fehlt: 'Dieser Schritt braucht die Auswahl aus den vorherigen Schritten.',
    neu_starten: 'Neu starten',
    wird_gespeichert: 'Wird gespeichert …',
    kunde: 'Kunde',
    unbekannter_kunde: 'Unbekannter Kunde',
    status: 'Status',
  },
  en: {
    title: 'Complete Delivery',
    subtitle: 'Select order, assign driver, and confirm delivery',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Complete',
    bestellung_suchen: 'Search order …',
    keine_bestellungen: 'No active orders',
    bestellung_vom: 'Ordered on',
    fahrer_suchen: 'Search driver …',
    keine_fahrer: 'No available drivers',
    ohne_fahrerzuweisung: 'Continue without driver',
    fahrer_ausgewaehlt: 'Driver selected',
    kein_fahrer: 'No driver',
    weiter_schritt3: 'Continue to step 3',
    zurueck: 'Back',
    lieferung_abschliessen: 'Complete Delivery',
    abschlussnotiz: 'Closing note (optional)',
    abschlussnotiz_placeholder: 'Note about the delivery …',
    zusammenfassung: 'Delivery Summary',
    lieferadresse: 'Delivery Address',
    bestellte_artikel: 'Ordered Items',
    gesamtbetrag: 'Total Amount',
    fahrer: 'Driver',
    kein_fahrer_zugewiesen: 'No driver assigned',
    erfolgreich: 'Delivery successfully completed!',
    neue_lieferung: 'Complete new delivery',
    zurueck_dashboard: 'Back to Dashboard',
    schritt2_fehlt: 'This step requires a selection from step 1.',
    schritt3_fehlt: 'This step requires selections from previous steps.',
    neu_starten: 'Start over',
    wird_gespeichert: 'Saving …',
    kunde: 'Customer',
    unbekannter_kunde: 'Unknown customer',
    status: 'Status',
  },
  cs: {
    title: 'Dokončit doručení',
    subtitle: 'Vyberte objednávku, přiřaďte řidiče a potvrďte doručení',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Dokončit',
    bestellung_suchen: 'Hledat objednávku …',
    keine_bestellungen: 'Žádné aktivní objednávky',
    bestellung_vom: 'Objednáno dne',
    fahrer_suchen: 'Hledat řidiče …',
    keine_fahrer: 'Žádní dostupní řidiči',
    ohne_fahrerzuweisung: 'Pokračovat bez řidiče',
    fahrer_ausgewaehlt: 'Řidič vybrán',
    kein_fahrer: 'Žádný řidič',
    weiter_schritt3: 'Pokračovat na krok 3',
    zurueck: 'Zpět',
    lieferung_abschliessen: 'Dokončit doručení',
    abschlussnotiz: 'Závěrečná poznámka (volitelné)',
    abschlussnotiz_placeholder: 'Poznámka k doručení …',
    zusammenfassung: 'Přehled doručení',
    lieferadresse: 'Adresa doručení',
    bestellte_artikel: 'Objednané položky',
    gesamtbetrag: 'Celková částka',
    fahrer: 'Řidič',
    kein_fahrer_zugewiesen: 'Žádný řidič nepřiřazen',
    erfolgreich: 'Doručení úspěšně dokončeno!',
    neue_lieferung: 'Dokončit nové doručení',
    zurueck_dashboard: 'Zpět na nástěnku',
    schritt2_fehlt: 'Tento krok vyžaduje výběr z kroku 1.',
    schritt3_fehlt: 'Tento krok vyžaduje výběry z předchozích kroků.',
    neu_starten: 'Začít znovu',
    wird_gespeichert: 'Ukládám …',
    kunde: 'Zákazník',
    unbekannter_kunde: 'Neznámý zákazník',
    status: 'Stav',
  },
});

const AKTIVE_STATUSKEYS = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

function formatEuro(amount: number | undefined): string {
  if (amount == null) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDateDisplay(dateStr: string | undefined): string {
  if (!dateStr) return '–';
  try {
    return format(parseISO(dateStr), 'dd.MM.yyyy');
  } catch {
    return dateStr;
  }
}

export default function LieferungAbschliessenPage() {
  const [searchParams] = useSearchParams();
  const initialBestellungId = searchParams.get('bestellungId');

  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, kundenverwaltungMap, fahrerverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState<number>(() => {
    if (initialBestellungId) return 2;
    return 1;
  });
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(initialBestellungId);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [savedBestellung, setSavedBestellung] = useState<EnrichedBestellverwaltung | null>(null);

  const enrichedBestellungen = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap]
  );

  const aktiveBestellungen = useMemo(
    () => enrichedBestellungen.filter(b => b.fields.order_status?.key != null && AKTIVE_STATUSKEYS.has(b.fields.order_status.key)),
    [enrichedBestellungen]
  );

  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const selectedBestellung = useMemo(
    () => enrichedBestellungen.find(b => b.record_id === selectedBestellungId) ?? null,
    [enrichedBestellungen, selectedBestellungId]
  );

  const selectedFahrer = useMemo(
    () => (selectedFahrerId ? fahrerverwaltungMap.get(selectedFahrerId) ?? null : null),
    [fahrerverwaltungMap, selectedFahrerId]
  );

  // Pre-select existing fahrer from Bestellung when entering step 2
  const handleSelectBestellung = (id: string) => {
    setSelectedBestellungId(id);
    const bestellung = enrichedBestellungen.find(b => b.record_id === id);
    if (bestellung?.fields.fahrer) {
      const existingFahrerId = extractRecordId(bestellung.fields.fahrer);
      if (existingFahrerId) setSelectedFahrerId(existingFahrerId);
    }
    setStep(2);
  };

  const handleFahrerWeiter = async (fahrerId: string | null) => {
    if (!selectedBestellungId) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { order_status: 'unterwegs' };
      if (fahrerId) {
        updateData.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId);
      }
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, updateData);
      if (fahrerId) {
        await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, { driver_status: 'im_einsatz' });
      }
      setSelectedFahrerId(fahrerId);
      await fetchAll();
      setStep(3);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAbschliessen = async () => {
    if (!selectedBestellungId) return;
    setSaving(true);
    try {
      const updatePayload: Record<string, unknown> = { order_status: 'geliefert' };
      if (deliveryNotes.trim()) updatePayload.delivery_notes = deliveryNotes.trim();
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, updatePayload);
      if (selectedFahrerId) {
        await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, { driver_status: 'verfuegbar' });
      }
      const finalBestellung = enrichedBestellungen.find(b => b.record_id === selectedBestellungId) ?? null;
      setSavedBestellung(finalBestellung);
      await fetchAll();
      setDone(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setDeliveryNotes('');
    setDone(false);
    setSavedBestellung(null);
    setStep(1);
  };

  const kundenverwaltungArr = kundenverwaltung;
  void kundenverwaltungArr;

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveBestellungen.map(b => {
            const kundeRecord = b.fields.kunde ? kundenverwaltungMap.get(extractRecordId(b.fields.kunde) ?? '') : null;
            const kundeName = kundeRecord
              ? `${kundeRecord.fields.first_name ?? ''} ${kundeRecord.fields.last_name ?? ''}`.trim() || tt('unbekannter_kunde')
              : (b.kundeName || tt('unbekannter_kunde'));
            return {
              id: b.record_id,
              title: `#${b.record_id.slice(-6).toUpperCase()} — ${kundeName}`,
              subtitle: [
                b.fields.order_date ? `${tt('bestellung_vom')}: ${formatDateDisplay(b.fields.order_date)}` : null,
                b.fields.total_amount != null ? formatEuro(b.fields.total_amount) : null,
                b.fields.ordered_items ? b.fields.ordered_items.slice(0, 60) + (b.fields.ordered_items.length > 60 ? ' …' : '') : null,
              ].filter(Boolean).join(' · '),
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tt('bestellung_suchen')}
          emptyText={tt('keine_bestellungen')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-6">
            {/* Bestellungsinfo */}
            <div className="rounded-2xl border bg-card p-4 flex flex-wrap gap-3 items-center overflow-hidden">
              <IconPackage size={20} className="text-primary shrink-0" stroke={1.5} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  #{selectedBestellung.record_id.slice(-6).toUpperCase()} — {selectedBestellung.kundeName || tt('unbekannter_kunde')}
                </p>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge statusKey={selectedBestellung.fields.order_status.key} label={selectedBestellung.fields.order_status.label} />
                )}
              </div>
            </div>

            {/* Fahrerliste */}
            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim(),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `Zone: ${f.fields.delivery_zone}` : null,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={(id) => {
                setSelectedFahrerId(id);
              }}
              searchPlaceholder={tt('fahrer_suchen')}
              emptyText={tt('keine_fahrer')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
            />

            {/* Ausgewählter Fahrer Anzeige */}
            {selectedFahrerId && (
              <div className="rounded-xl border bg-secondary/50 p-3 flex items-center gap-2">
                <IconCheck size={16} className="text-green-600 shrink-0" stroke={2} />
                <span className="text-sm font-medium">
                  {tt('fahrer_ausgewaehlt')}: {
                    (() => {
                      const f = fahrerverwaltungMap.get(selectedFahrerId);
                      return f ? `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() : selectedFahrerId;
                    })()
                  }
                </span>
              </div>
            )}

            {/* Aktions-Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto"
              >
                {tt('zurueck')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleFahrerWeiter(null)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {tt('ohne_fahrerzuweisung')}
              </Button>
              <Button
                onClick={() => handleFahrerWeiter(selectedFahrerId)}
                disabled={saving || !selectedFahrerId}
                className="w-full sm:flex-1"
              >
                {saving ? tt('wird_gespeichert') : tt('weiter_schritt3')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('schritt2_fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neu_starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Lieferung abschließen */}
      {step === 3 && (
        done ? (
          /* Erfolgszustand */
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-4">
                  <IconCheck size={32} className="text-green-600" stroke={2} />
                </div>
              </div>
              <h2 className="text-lg font-semibold">{tt('erfolgreich')}</h2>
              {savedBestellung && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>#{savedBestellung.record_id.slice(-6).toUpperCase()} — {savedBestellung.kundeName || tt('unbekannter_kunde')}</p>
                  {savedBestellung.fields.total_amount != null && (
                    <p className="font-medium text-foreground">{formatEuro(savedBestellung.fields.total_amount)}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleReset} className="w-full sm:flex-1">
                {tt('neue_lieferung')}
              </Button>
              <a href="#/" className="w-full sm:flex-1">
                <Button variant="outline" className="w-full">{tt('zurueck_dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          selectedBestellung ? (
            <div className="space-y-6">
              {/* Zusammenfassung */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-4 border-b">
                  <h3 className="font-semibold flex items-center gap-2">
                    <IconTruck size={18} className="text-primary" stroke={1.5} />
                    {tt('zusammenfassung')}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  {/* Kunde */}
                  <div className="flex gap-2 min-w-0">
                    <span className="text-sm text-muted-foreground shrink-0 w-32">{tt('kunde')}:</span>
                    <span className="text-sm font-medium truncate">{selectedBestellung.kundeName || tt('unbekannter_kunde')}</span>
                  </div>

                  {/* Bestellte Artikel */}
                  {selectedBestellung.fields.ordered_items && (
                    <div className="flex gap-2 min-w-0">
                      <span className="text-sm text-muted-foreground shrink-0 w-32">{tt('bestellte_artikel')}:</span>
                      <span className="text-sm">{selectedBestellung.fields.ordered_items}</span>
                    </div>
                  )}

                  {/* Gesamtbetrag */}
                  {selectedBestellung.fields.total_amount != null && (
                    <div className="flex gap-2 min-w-0">
                      <span className="text-sm text-muted-foreground shrink-0 w-32">{tt('gesamtbetrag')}:</span>
                      <span className="text-sm font-semibold">{formatEuro(selectedBestellung.fields.total_amount)}</span>
                    </div>
                  )}

                  {/* Lieferadresse */}
                  {(selectedBestellung.fields.delivery_street || selectedBestellung.fields.delivery_city) && (
                    <div className="flex gap-2 min-w-0">
                      <span className="text-sm text-muted-foreground shrink-0 w-32">{tt('lieferadresse')}:</span>
                      <span className="text-sm">
                        <IconMapPin size={14} className="inline mr-1 text-muted-foreground" stroke={1.5} />
                        {[
                          selectedBestellung.fields.delivery_street,
                          selectedBestellung.fields.delivery_house_number,
                          selectedBestellung.fields.delivery_postal_code,
                          selectedBestellung.fields.delivery_city,
                        ].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Fahrer */}
                  <div className="flex gap-2 min-w-0">
                    <span className="text-sm text-muted-foreground shrink-0 w-32">{tt('fahrer')}:</span>
                    <span className="text-sm">
                      {selectedFahrer
                        ? `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()
                        : tt('kein_fahrer_zugewiesen')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Abschlussnotiz */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tt('abschlussnotiz')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('abschlussnotiz_placeholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Aktions-Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  {tt('zurueck')}
                </Button>
                <Button
                  onClick={handleAbschliessen}
                  disabled={saving}
                  className="w-full sm:flex-1"
                >
                  <IconCheck size={16} stroke={2} className="mr-2" />
                  {saving ? tt('wird_gespeichert') : tt('lieferung_abschliessen')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('schritt3_fehlt')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('neu_starten')}</Button>
            </div>
          )
        )
      )}
    </IntentWizardShell>
  );
}
