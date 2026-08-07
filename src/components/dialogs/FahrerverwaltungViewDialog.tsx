import type { Fahrerverwaltung } from '@/types/app';
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

interface FahrerverwaltungViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Fahrerverwaltung | null;
  onEdit: (record: Fahrerverwaltung) => void;
}

export function FahrerverwaltungViewDialog({ open, onClose, record, onEdit }: FahrerverwaltungViewDialogProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fahrerverwaltung anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vorname</Label>
            <p className="text-sm">{record.fields.driver_first_name ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nachname</Label>
            <p className="text-sm">{record.fields.driver_last_name ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Telefonnummer</Label>
            <p className="text-sm">{record.fields.driver_phone ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">E-Mail-Adresse</Label>
            <p className="text-sm">{record.fields.driver_email ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fahrzeugtyp</Label>
            <Badge variant="secondary">{record.fields.vehicle_type?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Liefergebiet</Label>
            <p className="text-sm">{record.fields.delivery_zone ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Verfügbarkeitsstatus</Label>
            <Badge variant="secondary">{record.fields.driver_status?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Arbeitsbeginn</Label>
            <p className="text-sm">{record.fields.work_start ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Arbeitsende</Label>
            <p className="text-sm">{record.fields.work_end ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Anmerkungen</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.driver_notes ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.FAHRERVERWALTUNG} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}