import type { Kundenverwaltung } from '@/types/app';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

interface KundenverwaltungViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Kundenverwaltung | null;
  onEdit: (record: Kundenverwaltung) => void;
}

export function KundenverwaltungViewDialog({ open, onClose, record, onEdit }: KundenverwaltungViewDialogProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('kundenverwaltung') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'first_name')}</Label>
            <p className="text-sm">{record.fields.first_name ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'last_name')}</Label>
            <p className="text-sm">{record.fields.last_name ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'email')}</Label>
            <p className="text-sm">{record.fields.email ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'phone')}</Label>
            <p className="text-sm">{record.fields.phone ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'street')}</Label>
            <p className="text-sm">{record.fields.street ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'house_number')}</Label>
            <p className="text-sm">{record.fields.house_number ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'postal_code')}</Label>
            <p className="text-sm">{record.fields.postal_code ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'city')}</Label>
            <p className="text-sm">{record.fields.city ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'customer_since')}</Label>
            <p className="text-sm">{formatDate(record.fields.customer_since)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'customer_status')}</Label>
            <Badge variant="secondary">{lookupLabel('kundenverwaltung', 'customer_status', record.fields.customer_status?.key) ?? record.fields.customer_status?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'notes')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.notes ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.KUNDENVERWALTUNG} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}