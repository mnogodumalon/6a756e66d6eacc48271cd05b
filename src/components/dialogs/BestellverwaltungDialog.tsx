/**
 * BestellverwaltungDialog — pre-generated create/edit dialog for Bestellverwaltung.
 *
 * Props: open, onClose, onSubmit(fields) => Promise<void>, defaultValues?,
 * recordId? (pass when EDITING — enables the attachments section),
 * fahrerverwaltungList (full hook array — resolves the Fahrerverwaltung applookup),
 * kundenverwaltungList (full hook array — resolves the Kundenverwaltung applookup),
 * enablePhotoScan?, enablePhotoLocation?.
 *
 * defaultValues is SHAPE-TOLERANT and its prop type is the EXPORTED
 * BestellverwaltungDialogDefaults — NOT the entity field type: lookup fields accept
 * the bare KEY string (or LookupValue), applookup fields the bare record id
 * (or record URL); the dialog normalizes. Type prefill STATE with the export:
 *  ❌ useState<Partial<Bestellverwaltung['fields']>>({ … })   // LookupValue fields reject string prefills (TS2322)
 *  ✓ useState<BestellverwaltungDialogDefaults | undefined>(undefined)
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung, LookupValue } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { extractRecordId, createRecordUrl, cleanFieldsForApi, getUserProfile, LivingAppsService } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ComputedContext } from '@/config/form-enhancements/types';
import { applyFieldOrder, flattenFieldOrder, applyDefaults, evalComputed, numberInputProps, clampNumberValue, classifyComputed, extractApplookupRefs, mergeApplookupRefs, resolveApplookupRef } from '@/config/form-enhancements/types';
import { formEnhancements, computedDeps, computedApplookupRefs } from '@/config/form-enhancements/Bestellverwaltung';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { t, appLabel, fieldLabel, lookupLabel, localeTag, CURRENCY } from '@/i18n';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/Combobox';
import { FahrerverwaltungDialog } from '@/components/dialogs/FahrerverwaltungDialog';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import { IconAlertCircle, IconCamera, IconChevronDown, IconCircleCheck, IconClipboard, IconCrosshair, IconFileText, IconLoader2, IconPhotoPlus, IconSparkles, IconUpload, IconX } from '@tabler/icons-react';
import { fileToDataUri, extractFromInput, extractPhotoMeta, reverseGeocode } from '@/lib/ai';
import { GeoMapPicker } from '@/components/GeoMapPicker';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { lookupKey } from '@/lib/formatters';

/** Widened prefill type for BestellverwaltungDialog.defaultValues — see file header. */
export type BestellverwaltungDialogDefaults = Omit<Bestellverwaltung['fields'], 'order_status' | 'payment_method'> & {
    order_status?: LookupValue | string;
    payment_method?: LookupValue | string;
  };

interface BestellverwaltungDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Bestellverwaltung['fields']) => Promise<void>;
  /** SHAPE-TOLERANT: lookup fields accept the bare key (string) or the
   *  LookupValue object; applookup fields the bare record id or the full
   *  record URL — the dialog normalizes both. */
  defaultValues?: BestellverwaltungDialogDefaults;
  /** Record id when editing — enables the attachments section. Omit on create. */
  recordId?: string;
  fahrerverwaltungList: Fahrerverwaltung[];
  kundenverwaltungList: Kundenverwaltung[];
  enablePhotoScan?: boolean;
  enablePhotoLocation?: boolean;
}

// defaultValues are SHAPE-TOLERANT: the dialog resolves bare lookup keys via
// its own options and bare record ids via the field's target app — consumers
// never carry the LookupValue/record-URL shape in their head.
const NORMALIZE_LOOKUPS: Record<string, readonly { key: string; label: string }[]> = {
  order_status: LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [],
  payment_method: LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [],
};
const NORMALIZE_APPLOOKUPS: Record<string, string> = {
  fahrer: APP_IDS.FAHRERVERWALTUNG,
  kunde: APP_IDS.KUNDENVERWALTUNG,
};
function normalizeDefaults(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [k, opts] of Object.entries(NORMALIZE_LOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string') out[k] = opts.find(o => o.key === v) ?? { key: v, label: v };
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? opts.find(o => o.key === x) ?? { key: x, label: x } : x));
  }
  for (const [k, appId] of Object.entries(NORMALIZE_APPLOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string' && v !== '' && !v.startsWith('http')) out[k] = createRecordUrl(appId, v);
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' && x !== '' && !x.startsWith('http') ? createRecordUrl(appId, x) : x));
  }
  return out;
}

export function BestellverwaltungDialog({ open, onClose, onSubmit, defaultValues, recordId, fahrerverwaltungList, kundenverwaltungList, enablePhotoScan = true, enablePhotoLocation = true }: BestellverwaltungDialogProps) {
  const [fields, setFields] = useState<Partial<Bestellverwaltung['fields']>>({});
  const [saving, setSaving] = useState(false);
  const normalizedDefaults = useMemo<Record<string, unknown> | undefined>(
    () => (defaultValues ? normalizeDefaults(defaultValues as Record<string, unknown>) : undefined),
    [defaultValues],
  );
  // Dirty-tracking: in edit-mode the Speichern button is disabled until the
  // user actually changes something. JSON.stringify is good enough for our
  // fields (plain values + LookupValue objects + string arrays).
  const isDirty = useMemo(() => {
    if (!normalizedDefaults) return true;  // create-mode: always allow submit
    try {
      return JSON.stringify(fields) !== JSON.stringify(normalizedDefaults);
    } catch {
      return true;
    }
  }, [fields, normalizedDefaults]);
  // Inline-Create state for "Fahrerverwaltung" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraFahrerverwaltung` list, and select it in
  // the originating Combobox via the captured `createFahrerverwaltungField`.
  const [createFahrerverwaltungOpen, setCreateFahrerverwaltungOpen] = useState(false);
  const [createFahrerverwaltungInitial, setCreateFahrerverwaltungInitial] = useState('');
  const [createFahrerverwaltungField, setCreateFahrerverwaltungField] = useState<string>('');
  const [extraFahrerverwaltung, setExtraFahrerverwaltung] = useState< Fahrerverwaltung[]>([]);
  const fahrerverwaltungListAll = useMemo(
    () => [...fahrerverwaltungList, ...extraFahrerverwaltung],
    [fahrerverwaltungList, extraFahrerverwaltung],
  );
  function openCreateFahrerverwaltung(fieldKey: string, q: string) {
    setCreateFahrerverwaltungField(fieldKey);
    setCreateFahrerverwaltungInitial(q);
    setCreateFahrerverwaltungOpen(true);
  }
  // Inline-Create state for "Kundenverwaltung" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraKundenverwaltung` list, and select it in
  // the originating Combobox via the captured `createKundenverwaltungField`.
  const [createKundenverwaltungOpen, setCreateKundenverwaltungOpen] = useState(false);
  const [createKundenverwaltungInitial, setCreateKundenverwaltungInitial] = useState('');
  const [createKundenverwaltungField, setCreateKundenverwaltungField] = useState<string>('');
  const [extraKundenverwaltung, setExtraKundenverwaltung] = useState< Kundenverwaltung[]>([]);
  const kundenverwaltungListAll = useMemo(
    () => [...kundenverwaltungList, ...extraKundenverwaltung],
    [kundenverwaltungList, extraKundenverwaltung],
  );
  function openCreateKundenverwaltung(fieldKey: string, q: string) {
    setCreateKundenverwaltungField(fieldKey);
    setCreateKundenverwaltungInitial(q);
    setCreateKundenverwaltungOpen(true);
  }
  const [showErrors, setShowErrors] = useState(false);
  const REQUIRED_FIELDS = ['order_date', 'ordered_items', 'total_amount', 'order_status', 'kunde'] as const;
  const missingRequired = REQUIRED_FIELDS.filter(k => {
    const v = (fields as Record<string, unknown>)[k];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [usePersonalInfo, setUsePersonalInfo] = useState(() => {
    try { return localStorage.getItem('ai-use-personal-info') === 'true'; } catch { return false; }
  });
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [aiText, setAiText] = useState('');

  // Computed-field plumbing. Pure no-op when formEnhancements.computed is {}.
  // The number renderer uses computedValues only as a fallback when the user
  // hasn't typed anything — clearing the input always restores the computation.
  // computedContext exposes applookup list props so { kind: 'applookup', ... }
  // operands can resolve to numeric fields on the target record.
  const computedContext = useMemo<ComputedContext>(() => ({
    lookupLists: {
      'fahrer': fahrerverwaltungList,
      'kunde': kundenverwaltungList,
    },
  }), [fahrerverwaltungList, kundenverwaltungList, ]);
  const computedValues = useMemo<Record<string, number | null>>(() => {
    let out: Record<string, number | null> = {};
    const entries = Object.entries(formEnhancements.computed);
    for (let i = 0; i < 5; i++) {
      const merged: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
      for (const [k, v] of Object.entries(out)) {
        if (v === null) continue;
        const cur = merged[k];
        if (cur === undefined || cur === null || cur === '') merged[k] = v;
      }
      const next: Record<string, number | null> = {};
      let changed = false;
      for (const [key, spec] of entries) {
        const v = evalComputed(spec, merged, computedContext);
        next[key] = v;
        if (v !== out[key]) changed = true;
      }
      out = next;
      if (!changed) break;
    }
    return out;
  }, [fields, computedContext]);

  useEffect(() => {
    if (open) {
      setFields(applyDefaults(normalizedDefaults ?? {}, formEnhancements.defaults) as Partial<Bestellverwaltung['fields']>);
      setPreview(null);
      setScanSuccess(false);
      setAiText('');
      setSubmitError(null);
      setGeoFromPhoto(false);
    }
  }, [open, normalizedDefaults]);
  useEffect(() => {
    try { localStorage.setItem('ai-use-personal-info', String(usePersonalInfo)); } catch {}
  }, [usePersonalInfo]);
  async function handleShowProfileInfo() {
    if (showProfileInfo) { setShowProfileInfo(false); return; }
    setProfileLoading(true);
    try {
      const p = await getUserProfile();
      setProfileData(p);
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
      setShowProfileInfo(true);
    }
  }

  // Submit errors surface IN the dialog (it is modal — a banner in the page
  // body would be hidden behind it). A consumer onSubmit that THROWS (the
  // documented "throw to prevent closing" validation pattern) lands here:
  // the dialog stays open, nothing is saved, the message is visible.
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired.length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      // Fill empty number slots from computed values; user-typed values always win.
      // CRITICAL: only backend-mapped keys may be backfilled. Virtual computeds
      // (sub-agent invents `_netto`, `_bestellung_gesamtbetrag` etc. for the
      // "Berechnungen" display) have no backend counterpart — writing them
      // triggers a 422 from the Living-Apps API ("field does not exist").
      const merged = { ...fields };
      for (const [key, val] of Object.entries(computedValues)) {
        if (val === null) continue;
        if (!backendFieldSet.has(key)) continue;
        const cur = (merged as Record<string, unknown>)[key];
        if (cur === undefined || cur === null || cur === '') {
          (merged as Record<string, unknown>)[key] = val;
        }
      }
      const clean = cleanFieldsForApi(merged, 'bestellverwaltung');
      await onSubmit(clean as Bestellverwaltung['fields']);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : t('submit_error'));
    } finally {
      setSaving(false);
    }
  }

  const [locating, setLocating] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [geoFromPhoto, setGeoFromPhoto] = useState(false);
  const geoDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  async function geoLocate(fieldKey: string) {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      let info = '';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        info = data.display_name ?? '';
      } catch {}
      setFields(f => ({ ...f, [fieldKey]: { lat: latitude, long: longitude, info } as any }));
      setGeoFromPhoto(false);
      setLocating(false);
    }, () => { setLocating(false); });
  }
  function handleMapMove(fieldKey: string, lat: number, lng: number) {
    setFields(f => ({ ...f, [fieldKey]: { ...((f as any)[fieldKey] ?? {}), lat, long: lng } }));
    clearTimeout(geoDebounceRef.current);
    geoDebounceRef.current = setTimeout(async () => {
      const info = await reverseGeocode(lat, lng);
      setFields(f => ({ ...f, [fieldKey]: { ...((f as any)[fieldKey] ?? {}), info } }));
    }, 600);
  }

  async function handleAiExtract(file?: File) {
    if (!file && !aiText.trim()) return;
    setScanning(true);
    setScanSuccess(false);
    try {
      let uri: string | undefined;
      let gps: { latitude: number; longitude: number } | null = null;
      let geoAddr = '';
      const parts: string[] = [];
      if (file) {
        const [dataUri, meta] = await Promise.all([fileToDataUri(file), extractPhotoMeta(file)]);
        uri = dataUri;
        if (file.type.startsWith('image/')) setPreview(uri);
        gps = enablePhotoLocation ? meta?.gps ?? null : null;
        if (gps) {
          geoAddr = await reverseGeocode(gps.latitude, gps.longitude);
          parts.push(`Location coordinates: ${gps.latitude}, ${gps.longitude}`);
          if (geoAddr) parts.push(`Reverse-geocoded address: ${geoAddr}`);
        }
        if (meta?.dateTime) {
          parts.push(`Date taken: ${meta.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')}`);
        }
      }
      const contextParts: string[] = [];
      if (parts.length) {
        contextParts.push(`<photo-metadata>\nThe following metadata was extracted from the photo\'s EXIF data:\n${parts.join('\n')}\n</photo-metadata>`);
      }
      contextParts.push(`<available-records field="fahrer" entity="Fahrerverwaltung">\n${JSON.stringify(fahrerverwaltungList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      contextParts.push(`<available-records field="kunde" entity="Kundenverwaltung">\n${JSON.stringify(kundenverwaltungList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      if (usePersonalInfo) {
        try {
          const profile = await getUserProfile();
          contextParts.push(`<user-profile>\nThe following is the logged-in user\'s personal information. Use this to pre-fill relevant fields like name, email, address, company etc. when appropriate:\n${JSON.stringify(profile, null, 2)}\n</user-profile>`);
        } catch (err) {
          console.warn('Failed to fetch user profile:', err);
        }
      }
      const photoContext = contextParts.length ? contextParts.join('\n') : undefined;
      const schema = `{\n  "fahrer": string | null, // Display name from Fahrerverwaltung (see <available-records>)\n  "delivery_notes": string | null, // Lieferhinweise\n  "order_date": string | null, // YYYY-MM-DDTHH:MM\n  "ordered_items": string | null, // Bestellte Artikel\n  "total_amount": number | null, // Gesamtbetrag (€)\n  "order_status": LookupValue | null, // Bestellstatus (select one key: "neu" | "in_bearbeitung" | "bereit_zur_lieferung" | "unterwegs" | "geliefert" | "storniert") mapping: neu=Neu, in_bearbeitung=In Bearbeitung, bereit_zur_lieferung=Bereit zur Lieferung, unterwegs=Unterwegs, geliefert=Geliefert, storniert=Storniert\n  "payment_method": LookupValue | null, // Zahlungsmethode (select one key: "bar" | "ec_karte" | "paypal" | "ueberweisung" | "kreditkarte") mapping: bar=Barzahlung bei Lieferung, ec_karte=EC-Karte bei Lieferung, paypal=PayPal, ueberweisung=Überweisung, kreditkarte=Kreditkarte\n  "desired_delivery_time": string | null, // YYYY-MM-DDTHH:MM\n  "delivery_street": string | null, // Lieferstraße\n  "delivery_house_number": string | null, // Lieferhausnummer\n  "delivery_postal_code": string | null, // Lieferpostleitzahl\n  "kunde": string | null, // Display name from Kundenverwaltung (see <available-records>)\n  "delivery_city": string | null, // Lieferstadt\n}`;
      const raw = await extractFromInput<Record<string, unknown>>(schema, {
        dataUri: uri,
        userText: aiText.trim() || undefined,
        photoContext,
        intent: DIALOG_INTENT,
      });
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["fahrer", "kunde"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null) merged[k] = v;
        }
        const fahrerName = raw['fahrer'] as string | null;
        if (fahrerName) {
          const fahrerMatch = fahrerverwaltungList.find(r => matchName(fahrerName!, [String(r.fields.driver_first_name ?? '')]));
          if (fahrerMatch) merged['fahrer'] = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerMatch.record_id);
        }
        const kundeName = raw['kunde'] as string | null;
        if (kundeName) {
          const kundeMatch = kundenverwaltungList.find(r => matchName(kundeName!, [[r.fields.first_name ?? '', r.fields.last_name ?? ''].filter(Boolean).join(' ')]));
          if (kundeMatch) merged['kunde'] = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, kundeMatch.record_id);
        }
        return merged as Partial<Bestellverwaltung['fields']>;
      });
      if (gps) {
        setFields(f => ({ ...f, delivery_location: { lat: gps.latitude, long: gps.longitude, info: geoAddr } as any }));
        setGeoFromPhoto(true);
      }
      setAiText('');
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    } catch (err) {
      console.error(`${t('scan_error')}:`, err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleAiExtract(f);
    e.target.value = '';
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleAiExtract(file);
    }
  }, []);

  const DIALOG_INTENT = defaultValues
    ? t('edit_entity', { entity: appLabel('bestellverwaltung') })
    : t('new_entity', { entity: appLabel('bestellverwaltung') });

  const fieldBlocks: Record<string, React.ReactNode> = {
    'fahrer': (
      <div key="fahrer" className="space-y-1.5">
        <Label htmlFor="fahrer">{fieldLabel('bestellverwaltung', 'fahrer')}</Label>
        <Combobox
          id="fahrer"
          placeholder="Welcher Fahrer liefert?"
          items={fahrerverwaltungListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.driver_first_name ?? r.record_id),
          }))}
          value={extractRecordId(fields.fahrer)}
          onChange={id => setFields(f => ({ ...f, fahrer: id ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, id) : undefined }))}
          onCreateNew={(q) => openCreateFahrerverwaltung("fahrer", q)}
          createLabel={t('create_in', { entity: appLabel('fahrerverwaltung') })}
        />
      </div>
    ),
    'delivery_notes': (
      <div key="delivery_notes" className="space-y-1.5">
        <Label htmlFor="delivery_notes">{fieldLabel('bestellverwaltung', 'delivery_notes')}</Label>
        <Textarea
          id="delivery_notes"
          placeholder="Besondere Hinweise, Klingeln, Haustüren..."
          value={fields.delivery_notes ?? ''}
          onChange={e => setFields(f => ({ ...f, delivery_notes: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'order_date': (
      <div key="order_date" className="space-y-1.5">
        <Label htmlFor="order_date">{fieldLabel('bestellverwaltung', 'order_date')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <DatePicker
          id="order_date"
          placeholder="Wann wurde bestellt?"
          mode="datetime"
          value={fields.order_date ?? null}
          onChange={v => setFields(f => ({ ...f, order_date: v ?? undefined }))}
          required
        />
        {showErrors && !fields.order_date && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'ordered_items': (
      <div key="ordered_items" className="space-y-1.5">
        <Label htmlFor="ordered_items">{fieldLabel('bestellverwaltung', 'ordered_items')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Textarea
          id="ordered_items"
          placeholder="Artikel, Menge, Größe – alles auflisten"
          value={fields.ordered_items ?? ''}
          onChange={e => setFields(f => ({ ...f, ordered_items: e.target.value }))}
          rows={3}
        />
        {showErrors && !fields.ordered_items && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'total_amount': (
      <div key="total_amount" className="space-y-1.5">
        <Label htmlFor="total_amount">{fieldLabel('bestellverwaltung', 'total_amount')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Input
          id="total_amount"
          type="number"
          step="any"
          {...numberInputProps(formEnhancements, 'total_amount')}
          placeholder="z. B. 24,99"
          value={fields.total_amount !== undefined ? fields.total_amount : (computedValues['total_amount'] ?? '')}
          onChange={e => setFields(f => ({ ...f, total_amount: clampNumberValue(formEnhancements, 'total_amount', e.target.value) }))}
        />
        {showErrors && !fields.total_amount && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'order_status': (
      <div key="order_status" className="space-y-1.5">
        <Label htmlFor="order_status">{fieldLabel('bestellverwaltung', 'order_status')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Select
          value={lookupKey(fields.order_status) ?? ''}
          onValueChange={v => setFields(f => ({ ...f, order_status: v === 'none' ? undefined : v as any }))}
        >
          <SelectTrigger id="order_status" className="max-sm:h-11"><SelectValue placeholder="Aktueller Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="neu">{lookupLabel('bestellverwaltung', 'order_status', 'neu') ?? 'Neu'}</SelectItem>
            <SelectItem value="in_bearbeitung">{lookupLabel('bestellverwaltung', 'order_status', 'in_bearbeitung') ?? 'In Bearbeitung'}</SelectItem>
            <SelectItem value="bereit_zur_lieferung">{lookupLabel('bestellverwaltung', 'order_status', 'bereit_zur_lieferung') ?? 'Bereit zur Lieferung'}</SelectItem>
            <SelectItem value="unterwegs">{lookupLabel('bestellverwaltung', 'order_status', 'unterwegs') ?? 'Unterwegs'}</SelectItem>
            <SelectItem value="geliefert">{lookupLabel('bestellverwaltung', 'order_status', 'geliefert') ?? 'Geliefert'}</SelectItem>
            <SelectItem value="storniert">{lookupLabel('bestellverwaltung', 'order_status', 'storniert') ?? 'Storniert'}</SelectItem>
          </SelectContent>
        </Select>
        {showErrors && !fields.order_status && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'payment_method': (
      <div key="payment_method" className="space-y-1.5">
        <Label htmlFor="payment_method">{fieldLabel('bestellverwaltung', 'payment_method')}</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.payment_method) === 'bar'}
            onClick={() => setFields(f => ({ ...f, payment_method: (lookupKey(f.payment_method) === 'bar' ? undefined : 'bar') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.payment_method) === 'bar'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('bestellverwaltung', 'payment_method', 'bar') ?? 'Barzahlung bei Lieferung'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.payment_method) === 'ec_karte'}
            onClick={() => setFields(f => ({ ...f, payment_method: (lookupKey(f.payment_method) === 'ec_karte' ? undefined : 'ec_karte') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.payment_method) === 'ec_karte'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('bestellverwaltung', 'payment_method', 'ec_karte') ?? 'EC-Karte bei Lieferung'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.payment_method) === 'paypal'}
            onClick={() => setFields(f => ({ ...f, payment_method: (lookupKey(f.payment_method) === 'paypal' ? undefined : 'paypal') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.payment_method) === 'paypal'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('bestellverwaltung', 'payment_method', 'paypal') ?? 'PayPal'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.payment_method) === 'ueberweisung'}
            onClick={() => setFields(f => ({ ...f, payment_method: (lookupKey(f.payment_method) === 'ueberweisung' ? undefined : 'ueberweisung') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.payment_method) === 'ueberweisung'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('bestellverwaltung', 'payment_method', 'ueberweisung') ?? 'Überweisung'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.payment_method) === 'kreditkarte'}
            onClick={() => setFields(f => ({ ...f, payment_method: (lookupKey(f.payment_method) === 'kreditkarte' ? undefined : 'kreditkarte') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.payment_method) === 'kreditkarte'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('bestellverwaltung', 'payment_method', 'kreditkarte') ?? 'Kreditkarte'}
          </button>
        </div>
      </div>
    ),
    'desired_delivery_time': (
      <div key="desired_delivery_time" className="space-y-1.5">
        <Label htmlFor="desired_delivery_time">{fieldLabel('bestellverwaltung', 'desired_delivery_time')}</Label>
        <DatePicker
          id="desired_delivery_time"
          placeholder="Wann liefern?"
          mode="datetime"
          value={fields.desired_delivery_time ?? null}
          onChange={v => setFields(f => ({ ...f, desired_delivery_time: v ?? undefined }))}
        />
      </div>
    ),
    'delivery_street': (
      <div key="delivery_street" className="space-y-1.5">
        <Label htmlFor="delivery_street">{fieldLabel('bestellverwaltung', 'delivery_street')}</Label>
        <Input
          id="delivery_street"
          placeholder="z. B. Potsdamer Straße"
          value={fields.delivery_street ?? ''}
          onChange={e => setFields(f => ({ ...f, delivery_street: e.target.value }))}
        />
      </div>
    ),
    'delivery_house_number': (
      <div key="delivery_house_number" className="space-y-1.5">
        <Label htmlFor="delivery_house_number">{fieldLabel('bestellverwaltung', 'delivery_house_number')}</Label>
        <Input
          id="delivery_house_number"
          placeholder="z. B. 1"
          value={fields.delivery_house_number ?? ''}
          onChange={e => setFields(f => ({ ...f, delivery_house_number: e.target.value }))}
        />
      </div>
    ),
    'delivery_postal_code': (
      <div key="delivery_postal_code" className="space-y-1.5">
        <Label htmlFor="delivery_postal_code">{fieldLabel('bestellverwaltung', 'delivery_postal_code')}</Label>
        <Input
          id="delivery_postal_code"
          placeholder="z. B. 10785"
          value={fields.delivery_postal_code ?? ''}
          onChange={e => setFields(f => ({ ...f, delivery_postal_code: e.target.value }))}
        />
      </div>
    ),
    'kunde': (
      <div key="kunde" className="space-y-1.5">
        <Label htmlFor="kunde">{fieldLabel('bestellverwaltung', 'kunde')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Combobox
          id="kunde"
          placeholder="Welcher Kunde?"
          items={kundenverwaltungListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.first_name ?? r.record_id),
          }))}
          value={extractRecordId(fields.kunde)}
          onChange={id => setFields(f => ({ ...f, kunde: id ? createRecordUrl(APP_IDS.KUNDENVERWALTUNG, id) : undefined }))}
          onCreateNew={(q) => openCreateKundenverwaltung("kunde", q)}
          createLabel={t('create_in', { entity: appLabel('kundenverwaltung') })}
        />
        {showErrors && !fields.kunde && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'delivery_city': (
      <div key="delivery_city" className="space-y-1.5">
        <Label htmlFor="delivery_city">{fieldLabel('bestellverwaltung', 'delivery_city')}</Label>
        <Input
          id="delivery_city"
          placeholder="z. B. Berlin"
          value={fields.delivery_city ?? ''}
          onChange={e => setFields(f => ({ ...f, delivery_city: e.target.value }))}
        />
      </div>
    ),
    'delivery_location': (
      <div key="delivery_location" className="space-y-1.5">
        <Label htmlFor="delivery_location">{fieldLabel('bestellverwaltung', 'delivery_location')}</Label>
        <div className="space-y-3">
          <Button type="button" variant="outline" className="w-full max-sm:h-11" disabled={locating} onClick={() => geoLocate("delivery_location")}>
            {locating ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconCrosshair className="h-4 w-4 mr-1.5" />}
            {t('fr_use_location')}
          </Button>
          <AddressAutocomplete
            placeholder={t('fr_search_address')}
            onSelect={r => setFields(f => ({ ...f, delivery_location: { lat: r.lat, long: r.long, info: r.label } as any }))}
          />
          {geoFromPhoto && fields.delivery_location && (
            <p className="text-xs text-primary italic">{t('fr_photo_location')}</p>
          )}
          {fields.delivery_location?.info && (
            <p className="text-sm text-muted-foreground break-words whitespace-normal">
              {fields.delivery_location.info}
            </p>
          )}
          {fields.delivery_location?.lat != null && fields.delivery_location?.long != null && (
            <GeoMapPicker
              lat={fields.delivery_location.lat}
              lng={fields.delivery_location.long}
              onChange={(lat, lng) => handleMapMove("delivery_location", lat, lng)}
            />
          )}
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 max-sm:py-2 transition-colors" onClick={() => setShowCoords(v => !v)}>
            {showCoords ? t('fr_hide_coords') : t('fr_show_coords')}
            <IconChevronDown className={`h-3 w-3 transition-transform ${showCoords ? "rotate-180" : ""}`} />
          </button>
          {showCoords && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{t('fr_lat')}</Label>
                <Input type="number" step="any"
                  value={fields.delivery_location?.lat ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setFields(f => ({ ...f, delivery_location: { ...(f.delivery_location as any ?? {}), lat: v ? Number(v) : undefined } }));
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('fr_long')}</Label>
                <Input type="number" step="any"
                  value={fields.delivery_location?.long ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setFields(f => ({ ...f, delivery_location: { ...(f.delivery_location as any ?? {}), long: v ? Number(v) : undefined } }));
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    ),
  };
  const orderedFields = applyFieldOrder(Object.keys(fieldBlocks), formEnhancements.fieldOrder);
  const orderedFieldsKey = orderedFields.map((it) => typeof it === 'string' ? it : it.row.join('+')).join(',');

  // Render-Modell für Computed-Felder:
  //
  //   • BACKEND-FELDER mit computed-Eintrag (z.B. gesamtpreis bei einer
  //     Katzenpension) bleiben als normales Eingabe-Feld stehen. Der Number-
  //     Input nutzt den computed-Wert als Vorschlag, der User kann jederzeit
  //     überschreiben (clearing → restore computed).
  //   • VIRTUELLE computed-Keys (Eintrag in formEnhancements.computed, ABER
  //     kein passendes Backend-Feld in orderedFields) erscheinen NICHT als
  //     Input, sondern unten als kompakte 'Berechnungen'-Übersicht oder als
  //     Inline-Hint unter dem letzten beitragenden Input.
  const FIELD_LABELS: Record<string, string> = {"fahrer": "Lieferfahrer", "delivery_notes": "Lieferhinweise", "order_date": "Bestelldatum und -uhrzeit", "ordered_items": "Bestellte Artikel", "total_amount": "Gesamtbetrag (€)", "order_status": "Bestellstatus", "payment_method": "Zahlungsmethode", "desired_delivery_time": "Gewünschter Lieferzeitpunkt", "delivery_street": "Lieferstraße", "delivery_house_number": "Lieferhausnummer", "delivery_postal_code": "Lieferpostleitzahl", "kunde": "Kunde", "delivery_city": "Lieferstadt", "delivery_location": "Lieferort auf Karte"};
  const CURRENCY_KEYS = new Set<string>(["total_amount"]);
  // Applookup-Referenz-Labels: pro applookup-Feld in dieser Form (ownKey)
  // eine Map { lookupKey: label } für ALLE Felder des Target-Schemas. Wird
  // beim Render-Walk gefiltert auf die in der computed-Formel tatsächlich
  // referenzierten lookupKeys (siehe applookupRefs unten).
  const APPLOOKUP_LABELS: Record<string, Record<string, string>> = {"fahrer": {"driver_first_name": "Vorname", "driver_last_name": "Nachname", "driver_phone": "Telefonnummer", "driver_email": "E-Mail-Adresse", "vehicle_type": "Fahrzeugtyp", "delivery_zone": "Liefergebiet", "driver_status": "Verfügbarkeitsstatus", "work_start": "Arbeitsbeginn", "work_end": "Arbeitsende", "driver_notes": "Anmerkungen"}, "kunde": {"first_name": "Vorname", "last_name": "Nachname", "email": "E-Mail-Adresse", "phone": "Telefonnummer", "street": "Straße", "house_number": "Hausnummer", "postal_code": "Postleitzahl", "city": "Stadt", "customer_since": "Kunde seit", "customer_status": "Kundenstatus", "notes": "Anmerkungen"}};
  const inputFields = useMemo(() => flattenFieldOrder(orderedFields), [orderedFieldsKey]);
  const backendFieldSet = useMemo(() => new Set(inputFields), [inputFields.join(',')]);
  const virtualComputed = useMemo(
    () => Object.fromEntries(
      Object.entries(formEnhancements.computed).filter(([k]) => !backendFieldSet.has(k)),
    ),
    [backendFieldSet],
  );
  const virtualFormEnhancements = useMemo(
    () => ({ ...formEnhancements, computed: virtualComputed }),
    [virtualComputed],
  );
  const computedLayout = useMemo(
    () => classifyComputed(virtualFormEnhancements, inputFields, computedDeps),
    [virtualFormEnhancements, inputFields.join(',')],
  );
  // Applookup-Referenzen: pro ownKey (Lookup-Feld im Form) die Liste der
  // lookupKeys, die in irgendeiner computed-Formel referenziert werden.
  // MODUS-1: aus dem Spec-Tree extrahiert. MODUS-2: aus dem Build-Time-
  // Export computedApplookupRefs (parse-formulas hat Regex-Pairs gesammelt).
  // Pro (ownKey, lookupKey)-Paar nur einmal; pro ownKey können aber mehrere
  // lookupKeys gleichzeitig auftauchen (z.B. einzelpreis UND karten10_preis
  // beim Yoga-Kurs), und alle werden separat als Inline-Hint gerendert.
  const applookupRefs = useMemo(
    () => mergeApplookupRefs(
      extractApplookupRefs(formEnhancements.computed),
      computedApplookupRefs,
    ),
    [],
  );
  function summaryLabel(k: string): string {
    if (FIELD_LABELS[k]) return FIELD_LABELS[k];
    // Leading underscore(s) als Virtual-Marker abstreifen; Unterstriche zu
    // Leerzeichen, jedes Wort kapitalisieren. Umlaute kommen vom Sub-Agent
    // direkt im Key (z. B. `_buchung_dauer_nächte`) — JS/TS/Vite unterstützen
    // Unicode-Identifier nativ, daher keine ASCII-Transliteration nötig.
    return k.replace(/^_+/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  function formatSummaryValue(k: string, v: unknown): string {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    // Backend-Feld mit €-Label ODER virtueller Computed-Key, dessen Name nach Geld aussieht.
    const looksLikeCurrency = CURRENCY_KEYS.has(k) || /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k);
    if (looksLikeCurrency) {
      return n.toLocaleString(localeTag(), { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toLocaleString(localeTag(), { maximumFractionDigits: 2 });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0 max-sm:[&>button]:size-10 max-sm:[&>button]:grid max-sm:[&>button]:place-items-center max-sm:[&>button]:rounded-full max-sm:[&>button]:border max-sm:[&>button]:border-input max-sm:[&>button]:bg-background max-sm:[&>button]:opacity-100 max-sm:[&>button>svg]:size-5">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex flex-row items-center gap-3 space-y-0">
          <DialogTitle className="flex-1 truncate text-left">{DIALOG_INTENT}</DialogTitle>
          {enablePhotoScan && (
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              aria-expanded={aiOpen}
              aria-controls="ai-fill-panel"
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 max-sm:py-2.5 max-sm:px-4 text-xs font-semibold transition-all mr-7 max-sm:mr-12 shadow-sm ${
                aiOpen
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/50'
              }`}
            >
              <IconSparkles className={`h-3.5 w-3.5 ${aiOpen ? '' : 'text-primary'}`} />
              <span className="hidden sm:inline">{t('smart_fill')}</span>
              <IconChevronDown className={`h-3 w-3 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </DialogHeader>
        {enablePhotoScan && aiOpen && (
          <div id="ai-fill-panel" className="border-b bg-muted/20 px-6 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t('scan_header_sub')}</p>
            <div className="flex items-start gap-2 pl-0.5">
              <Checkbox
                id="ai-use-personal-info"
                checked={usePersonalInfo}
                onCheckedChange={(v) => setUsePersonalInfo(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <Label htmlFor="ai-use-personal-info" className="text-xs font-normal text-muted-foreground cursor-pointer inline">
                  {t('useinfo_label')}
                </Label>
                {' '}
                <button type="button" onClick={handleShowProfileInfo} className="text-xs text-primary hover:underline whitespace-nowrap">
                  {profileLoading ? t('useinfo_loading') : `(${t('useinfo_more')})`}
                </button>
              </span>
            </div>
            {showProfileInfo && (
              <div className="rounded-md border bg-muted/50 p-2 text-xs max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">{t('profile_preamble')}</p>
                {profileData ? Object.values(profileData).map((v, i) => (
                  <span key={i}>{i > 0 && ", "}{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                )) : (
                  <span className="text-muted-foreground">{t('useinfo_error')}</span>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${scanning
                  ? 'border-primary/40 bg-primary/5'
                  : scanSuccess
                    ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                    : dragOver
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconLoader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('scan_analyzing')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('scan_analyzing_sub')}</p>
                  </div>
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <IconCircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">{t('scan_success')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('scan_success_sub')}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/8 flex items-center justify-center">
                    <IconPhotoPlus className="h-7 w-7 text-primary/70" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('scan_upload')}</p>
                  </div>
                </div>
              )}

              {preview && !scanning && (
                <div className="absolute top-2 right-2">
                  <div className="relative group">
                    <img src={preview} alt="" className="h-10 w-10 rounded-md object-cover border shadow-sm" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted-foreground/80 text-white flex items-center justify-center"
                    >
                      <IconX className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                <IconCamera className="h-3.5 w-3.5 mr-1" />{t('scan_camera_btn')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <IconUpload className="h-3.5 w-3.5 mr-1" />{t('scan_file_btn')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => {
                  e.stopPropagation();
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'application/pdf,.pdf';
                    fileInputRef.current.click();
                    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = 'image/*,application/pdf'; }, 100);
                  }
                }}>
                <IconFileText className="h-3.5 w-3.5 mr-1" />{t('scan_doc_btn')}
              </Button>
            </div>

            <div className="relative">
              <Textarea
                placeholder={t('scan_text_placeholder')}
                value={aiText}
                onChange={e => {
                  setAiText(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 56), 96) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && aiText.trim() && !scanning) {
                    e.preventDefault();
                    handleAiExtract();
                  }
                }}
                disabled={scanning}
                rows={2}
                className="pr-12 resize-none text-sm overflow-y-auto"
              />
              <button
                type="button"
                className="absolute right-2 top-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={scanning}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setAiText(prev => prev ? prev + '\n' + text : text);
                  } catch {}
                }}
                title={t('paste')}
              >
                <IconClipboard className="h-4 w-4" />
              </button>
            </div>
            {aiText.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                disabled={scanning}
                onClick={() => handleAiExtract()}
              >
                <IconSparkles className="h-3.5 w-3.5 mr-1.5" />{t('scan_text_analyze')}
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0 min-w-0 max-sm:[&_input]:h-11">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 min-w-0">
            {(() => {
              const renderField = (k: string) => {
                const inlineHints = computedLayout.anchors[k] ?? [];
                const refs = applookupRefs[k] ?? [];
                return (
                  <div key={k} className="space-y-1.5 min-w-0">
                    {fieldBlocks[k]}
                    {refs.map(({ lookupKey }) => {
                      // Show the live numeric value the formula will pull from
                      // the selected lookup target (e.g. "Monatspreis: 34,90 €"
                      // under the Tarif combobox). Hidden while no lookup is
                      // selected or the target field is non-numeric.
                      const v = resolveApplookupRef(k, lookupKey, fields as Record<string, unknown>, computedContext);
                      if (v === null) return null;
                      const lbl = APPLOOKUP_LABELS[k]?.[lookupKey] ?? lookupKey;
                      const text = formatSummaryValue(lookupKey, v);
                      return (
                        <div key={`alh-${k}-${lookupKey}`} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{lbl}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                    {inlineHints.map((cKey) => {
                      const v = computedValues[cKey];
                      const text = formatSummaryValue(cKey, v);
                      if (text === '—') return null;
                      return (
                        <div key={cKey} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{summaryLabel(cKey)}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              };
              return orderedFields.map((item, idx) => {
                if (typeof item === 'string') return renderField(item);
                const cols = item.cols ?? `repeat(${item.row.length}, minmax(0, 1fr))`;
                return (
                  <div key={`row-${idx}`} className="grid gap-3" style={{ gridTemplateColumns: cols }}>
                    {item.row.map(renderField)}
                  </div>
                );
              });
            })()}
            {(computedLayout.aggregates.length > 0 || computedLayout.finalTotal) && (
              <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                {computedLayout.aggregates.length > 0 && (
                  <dl className="space-y-1.5 pb-2">
                    {computedLayout.aggregates.map((k) => {
                      const userVal = (fields as Record<string, unknown>)[k];
                      const computed = computedValues[k];
                      const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                      return (
                        <div key={k} className="flex justify-between items-baseline gap-3">
                          <dt className="text-sm text-muted-foreground truncate">{summaryLabel(k)}</dt>
                          <dd className="text-sm font-medium tabular-nums whitespace-nowrap">{formatSummaryValue(k, v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {computedLayout.finalTotal && (() => {
                  const k = computedLayout.finalTotal;
                  const userVal = (fields as Record<string, unknown>)[k];
                  const computed = computedValues[k];
                  const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                  // Innere Border nur wenn aggregates existieren — sonst hätten wir
                  // zwei direkt aufeinanderfolgende Striche (Outer + Inner) mit nur
                  // einer Aggregat-Zeile dazwischen → zu viel visuelles Rauschen.
                  const sep = computedLayout.aggregates.length > 0 ? 'pt-3 border-t border-border' : 'pt-1';
                  return (
                    <div className={`flex justify-between items-baseline gap-3 ${sep}`}>
                      <span className="text-base font-semibold text-foreground">{summaryLabel(k)}</span>
                      <span className="text-lg font-bold tabular-nums whitespace-nowrap text-foreground">{formatSummaryValue(k, v)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {showErrors && missingRequired.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1.5" role="alert">
                <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                {t('missing_required')}
              </p>
            )}
            {recordId && (
              <div className="pt-2 border-t border-border">
                <AttachmentsSection appId={APP_IDS.BESTELLVERWALTUNG} recordId={recordId} />
              </div>
            )}
          </div>
          {submitError && (
            <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/10 px-6 py-2.5 text-sm text-destructive" role="alert">
              <IconAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{submitError}</span>
            </div>
          )}
          <DialogFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-6 py-3 gap-2 max-sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} className="max-sm:h-12 max-sm:flex-1 max-sm:text-base">{t('cancel')}</Button>
            <Button
              type="submit"
              className="max-sm:h-12 max-sm:flex-1 max-sm:text-base"
              disabled={saving || !isDirty || (showErrors && missingRequired.length > 0)}
            >
              {saving ? t('saving') : defaultValues ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {createFahrerverwaltungOpen && (
      <FahrerverwaltungDialog
        open={createFahrerverwaltungOpen}
        onClose={() => setCreateFahrerverwaltungOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createFahrerverwaltungEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Fahrerverwaltung;
            setExtraFahrerverwaltung(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, result.id);
            setFields(prev => ({ ...prev, [createFahrerverwaltungField]: url } as any));
          }
          setCreateFahrerverwaltungOpen(false);
        }}
        defaultValues={createFahrerverwaltungInitial
          ? ({ driver_first_name: createFahrerverwaltungInitial } as any)
          : undefined}
      />
    )}
    {createKundenverwaltungOpen && (
      <KundenverwaltungDialog
        open={createKundenverwaltungOpen}
        onClose={() => setCreateKundenverwaltungOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createKundenverwaltungEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Kundenverwaltung;
            setExtraKundenverwaltung(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, result.id);
            setFields(prev => ({ ...prev, [createKundenverwaltungField]: url } as any));
          }
          setCreateKundenverwaltungOpen(false);
        }}
        defaultValues={createKundenverwaltungInitial
          ? ({ first_name: createKundenverwaltungInitial } as any)
          : undefined}
      />
    )}
    </>
  );
}