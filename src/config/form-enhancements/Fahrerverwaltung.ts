import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'driver_first_name',
    'driver_last_name',
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
    'vehicle_type': { kind: 'lookup', key: 'fahrrad', label: 'Fahrrad' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
