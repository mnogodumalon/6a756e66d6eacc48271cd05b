import { useState } from 'react';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Badge } from '@/components/ui/badge';
import { IconPencil, IconChevronDown } from '@tabler/icons-react';
import { GeoMapPicker } from '@/components/GeoMapPicker';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

interface BestellverwaltungViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Bestellverwaltung | null;
  onEdit: (record: Bestellverwaltung) => void;
  fahrerverwaltungList: Fahrerverwaltung[];
  kundenverwaltungList: Kundenverwaltung[];
}

export function BestellverwaltungViewDialog({ open, onClose, record, onEdit, fahrerverwaltungList, kundenverwaltungList }: BestellverwaltungViewDialogProps) {
  const [showCoords, setShowCoords] = useState(false);

  function getFahrerverwaltungDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return fahrerverwaltungList.find(r => r.record_id === id)?.fields.driver_first_name ?? '—';
  }

  function getKundenverwaltungDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return kundenverwaltungList.find(r => r.record_id === id)?.fields.first_name ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('bestellverwaltung') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'fahrer')}</Label>
            <p className="text-sm">{getFahrerverwaltungDisplayName(record.fields.fahrer)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_notes')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.delivery_notes ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'order_date')}</Label>
            <p className="text-sm">{formatDate(record.fields.order_date)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'ordered_items')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.ordered_items ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'total_amount')}</Label>
            <p className="text-sm">{record.fields.total_amount ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'order_status')}</Label>
            <Badge variant="secondary">{lookupLabel('bestellverwaltung', 'order_status', record.fields.order_status?.key) ?? record.fields.order_status?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'payment_method')}</Label>
            <Badge variant="secondary">{lookupLabel('bestellverwaltung', 'payment_method', record.fields.payment_method?.key) ?? record.fields.payment_method?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'desired_delivery_time')}</Label>
            <p className="text-sm">{formatDate(record.fields.desired_delivery_time)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_street')}</Label>
            <p className="text-sm">{record.fields.delivery_street ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_house_number')}</Label>
            <p className="text-sm">{record.fields.delivery_house_number ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_postal_code')}</Label>
            <p className="text-sm">{record.fields.delivery_postal_code ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'kunde')}</Label>
            <p className="text-sm">{getKundenverwaltungDisplayName(record.fields.kunde)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_city')}</Label>
            <p className="text-sm">{record.fields.delivery_city ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('bestellverwaltung', 'delivery_location')}</Label>
            {record.fields.delivery_location?.info && (
              <p className="text-sm text-muted-foreground break-words whitespace-normal">{record.fields.delivery_location.info}</p>
            )}
            {record.fields.delivery_location?.lat != null && record.fields.delivery_location?.long != null && (
              <GeoMapPicker
                lat={record.fields.delivery_location.lat}
                lng={record.fields.delivery_location.long}
                readOnly
              />
            )}
            {record.fields.delivery_location?.lat != null && record.fields.delivery_location?.long != null && (
              <MapRouteLinks lat={record.fields.delivery_location.lat} long={record.fields.delivery_location.long} className="mt-1" />
            )}
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 max-sm:py-2 transition-colors" onClick={() => setShowCoords(v => !v)}>
              {showCoords ? t('fr_hide_coords') : t('fr_show_coords')}
              <IconChevronDown className={`h-3 w-3 transition-transform ${showCoords ? "rotate-180" : ""}`} />
            </button>
            {showCoords && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-muted-foreground">{t('fr_lat')}:</span> {record.fields.delivery_location?.lat?.toFixed(6) ?? '—'}</div>
                <div><span className="text-xs text-muted-foreground">{t('fr_long')}:</span> {record.fields.delivery_location?.long?.toFixed(6) ?? '—'}</div>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.BESTELLVERWALTUNG} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}