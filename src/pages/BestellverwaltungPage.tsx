import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IconPencil, IconTrash, IconPlus, IconSearch, IconArrowsUpDown, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

export default function BestellverwaltungPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Bestellverwaltung[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Bestellverwaltung | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bestellverwaltung | null>(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [fahrerverwaltungList, setFahrerverwaltungList] = useState<Fahrerverwaltung[]>([]);
  const [kundenverwaltungList, setKundenverwaltungList] = useState<Kundenverwaltung[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, fahrerverwaltungData, kundenverwaltungData] = await Promise.all([
        LivingAppsService.getBestellverwaltung(),
        LivingAppsService.getFahrerverwaltung(),
        LivingAppsService.getKundenverwaltung(),
      ]);
      setRecords(mainData);
      setFahrerverwaltungList(fahrerverwaltungData);
      setKundenverwaltungList(kundenverwaltungData);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(fields: Bestellverwaltung['fields']) {
    await LivingAppsService.createBestellverwaltungEntry(fields);
    await loadData();
    setDialogOpen(false);
  }

  async function handleUpdate(fields: Bestellverwaltung['fields']) {
    if (!editingRecord) return;
    await LivingAppsService.updateBestellverwaltungEntry(editingRecord.record_id, fields);
    await loadData();
    setEditingRecord(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await LivingAppsService.deleteBestellverwaltungEntry(deleteTarget.record_id);
    setRecords(prev => prev.filter(r => r.record_id !== deleteTarget.record_id));
    setDeleteTarget(null);
  }

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

  const filtered = records.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return Object.values(r.fields).some(v => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.some(item => typeof item === 'object' && item !== null && 'label' in item ? String((item as any).label).toLowerCase().includes(s) : String(item).toLowerCase().includes(s));
      if (typeof v === 'object' && 'label' in (v as any)) return String((v as any).label).toLowerCase().includes(s);
      return String(v).toLowerCase().includes(s);
    });
  });

  function toggleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  }

  function sortRecords<T extends { fields: Record<string, any> }>(recs: T[]): T[] {
    if (!sortKey) return recs;
    return [...recs].sort((a, b) => {
      let va: any = a.fields[sortKey], vb: any = b.fields[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'object' && 'label' in va) va = va.label;
      if (typeof vb === 'object' && 'label' in vb) vb = vb.label;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PageShell
      title={appLabel('bestellverwaltung')}
      subtitle={`${records.length} ${t('in_system', { entity: appLabel('bestellverwaltung') })}`}
      action={
        <Button onClick={() => setDialogOpen(true)} className="shrink-0 rounded-full shadow-sm">
          <IconPlus className="h-4 w-4 mr-2" /> {t('add')}
        </Button>
      }
    >
      <div className="relative w-full max-w-sm">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_entity', { entity: appLabel('bestellverwaltung') })}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
        <Table className="[&_tbody_td]:px-6 [&_tbody_td]:py-2 [&_tbody_td]:text-base [&_tbody_td]:font-medium [&_tbody_tr:first-child_td]:pt-6 [&_tbody_tr:last-child_td]:pb-10">
          <TableHeader className="bg-secondary">
            <TableRow className="border-b border-input">
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('fahrer')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'fahrer')}
                  {sortKey === 'fahrer' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_notes')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_notes')}
                  {sortKey === 'delivery_notes' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('order_date')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'order_date')}
                  {sortKey === 'order_date' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('ordered_items')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'ordered_items')}
                  {sortKey === 'ordered_items' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('total_amount')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'total_amount')}
                  {sortKey === 'total_amount' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('order_status')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'order_status')}
                  {sortKey === 'order_status' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('payment_method')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'payment_method')}
                  {sortKey === 'payment_method' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('desired_delivery_time')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'desired_delivery_time')}
                  {sortKey === 'desired_delivery_time' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_street')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_street')}
                  {sortKey === 'delivery_street' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_house_number')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_house_number')}
                  {sortKey === 'delivery_house_number' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_postal_code')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_postal_code')}
                  {sortKey === 'delivery_postal_code' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('kunde')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'kunde')}
                  {sortKey === 'kunde' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_city')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_city')}
                  {sortKey === 'delivery_city' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('delivery_location')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('bestellverwaltung', 'delivery_location')}
                  {sortKey === 'delivery_location' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="w-24 uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRecords(filtered).map(record => (
              <TableRow key={record.record_id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return; navigate(`/bestellverwaltung/${record.record_id}`); }}>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getFahrerverwaltungDisplayName(record.fields.fahrer)}</span></TableCell>
                <TableCell className="max-w-xs"><span className="truncate block">{record.fields.delivery_notes ?? '—'}</span></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(record.fields.order_date)}</TableCell>
                <TableCell className="max-w-xs"><span className="truncate block">{record.fields.ordered_items ?? '—'}</span></TableCell>
                <TableCell>{record.fields.total_amount ?? '—'}</TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel('bestellverwaltung', 'order_status', record.fields.order_status?.key) ?? record.fields.order_status?.label ?? '—'}</span></TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel('bestellverwaltung', 'payment_method', record.fields.payment_method?.key) ?? record.fields.payment_method?.label ?? '—'}</span></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(record.fields.desired_delivery_time)}</TableCell>
                <TableCell className="font-medium">{record.fields.delivery_street ?? '—'}</TableCell>
                <TableCell>{record.fields.delivery_house_number ?? '—'}</TableCell>
                <TableCell>{record.fields.delivery_postal_code ?? '—'}</TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getKundenverwaltungDisplayName(record.fields.kunde)}</span></TableCell>
                <TableCell>{record.fields.delivery_city ?? '—'}</TableCell>
                <TableCell className="max-w-[200px]"><span className="truncate block" title={record.fields.delivery_location ? `${record.fields.delivery_location.lat}, ${record.fields.delivery_location.long}` : undefined}>{record.fields.delivery_location?.info ?? (record.fields.delivery_location ? `${record.fields.delivery_location.lat?.toFixed(4)}, ${record.fields.delivery_location.long?.toFixed(4)}` : '—')}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditingRecord(record)}>
                      <IconPencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(record)}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-16 text-muted-foreground">
                  {search ? t('no_results') : t('no_data_yet', { entity: appLabel('bestellverwaltung') })}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <BestellverwaltungDialog
        open={dialogOpen || !!editingRecord}
        onClose={() => { setDialogOpen(false); setEditingRecord(null); }}
        onSubmit={editingRecord ? handleUpdate : handleCreate}
        defaultValues={editingRecord?.fields}
        recordId={editingRecord?.record_id}
        fahrerverwaltungList={fahrerverwaltungList}
        kundenverwaltungList={kundenverwaltungList}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('delete_entity', { entity: appLabel('bestellverwaltung') })}
        description={t('confirm_delete_desc')}
      />

    </PageShell>
  );
}