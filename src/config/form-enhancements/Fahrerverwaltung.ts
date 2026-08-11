import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    { row: ['driver_first_name', 'driver_last_name'] },
    'driver_phone',
    'driver_email',
    'vehicle_type',
    'delivery_zone',
    'driver_status',
    'work_start',
    'work_end',
    'driver_notes',
  ],
  defaults: {
    'driver_status': { kind: 'lookup', key: 'verfuegbar', label: 'Verfügbar' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, { lookupKey: string }[]> = {};
