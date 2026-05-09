import { MABINI_MUNICIPALITY, MABINI_PROVINCE } from '@/lib/barangays';

export const MABINI_CENTER = {
  lat: 7.308447,
  lng: 125.853422,
} as const;

export const MABINI_MAP_BOUNDS = {
  north: 7.377029,
  south: 7.242875,
  east: 126.071296,
  west: 125.82845,
} as const;

export const MABINI_LOCATION_LABEL = `${MABINI_MUNICIPALITY}, ${MABINI_PROVINCE}, Region XI` as const;

export interface MabiniMedicalFacility {
  id: string;
  name: string;
  kind: 'hospital' | 'infirmary' | 'rhu';
  lat: number;
  lng: number;
  barangay: string;
  notes: string;
}

// Municipality boundary sourced from geoBoundaries ADM3 simplified geometry for Mabini, Davao de Oro.
export const MABINI_BOUNDARY_PATHS = [
  [
    { lat: 7.286049, lng: 125.831701 },
    { lat: 7.285279, lng: 125.830194 },
    { lat: 7.27757, lng: 125.830213 },
    { lat: 7.274567, lng: 125.82845 },
    { lat: 7.271419, lng: 125.828838 },
    { lat: 7.268986, lng: 125.83175 },
    { lat: 7.279174, lng: 125.835024 },
    { lat: 7.283437, lng: 125.834627 },
    { lat: 7.286049, lng: 125.831701 },
  ],
  [
    { lat: 7.292776, lng: 125.841689 },
    { lat: 7.291606, lng: 125.839441 },
    { lat: 7.28727, lng: 125.839602 },
    { lat: 7.290992, lng: 125.844358 },
    { lat: 7.292776, lng: 125.841689 },
  ],
  [
    { lat: 7.273798, lng: 126.038392 },
    { lat: 7.322864, lng: 126.038592 },
    { lat: 7.341663, lng: 126.043818 },
    { lat: 7.377029, lng: 126.071296 },
    { lat: 7.366602, lng: 126.056484 },
    { lat: 7.352054, lng: 126.021055 },
    { lat: 7.348907, lng: 126.01295 },
    { lat: 7.342839, lng: 125.98591 },
    { lat: 7.343286, lng: 125.911979 },
    { lat: 7.341284, lng: 125.902852 },
    { lat: 7.340143, lng: 125.853667 },
    { lat: 7.340141, lng: 125.853573 },
    { lat: 7.340032, lng: 125.852652 },
    { lat: 7.337357, lng: 125.852188 },
    { lat: 7.336872, lng: 125.850107 },
    { lat: 7.334161, lng: 125.851304 },
    { lat: 7.330287, lng: 125.84978 },
    { lat: 7.328589, lng: 125.846922 },
    { lat: 7.326692, lng: 125.848833 },
    { lat: 7.322813, lng: 125.848044 },
    { lat: 7.320953, lng: 125.845563 },
    { lat: 7.31403, lng: 125.84674 },
    { lat: 7.309795, lng: 125.845261 },
    { lat: 7.308339, lng: 125.84674 },
    { lat: 7.29937, lng: 125.848277 },
    { lat: 7.297807, lng: 125.845892 },
    { lat: 7.295706, lng: 125.846024 },
    { lat: 7.291683, lng: 125.847959 },
    { lat: 7.290472, lng: 125.844574 },
    { lat: 7.286071, lng: 125.840316 },
    { lat: 7.280959, lng: 125.84066 },
    { lat: 7.280874, lng: 125.842036 },
    { lat: 7.279456, lng: 125.839769 },
    { lat: 7.278305, lng: 125.841352 },
    { lat: 7.279128, lng: 125.839667 },
    { lat: 7.276284, lng: 125.840329 },
    { lat: 7.274011, lng: 125.838933 },
    { lat: 7.269403, lng: 125.841047 },
    { lat: 7.254531, lng: 125.837785 },
    { lat: 7.248976, lng: 125.839545 },
    { lat: 7.242875, lng: 125.84371 },
    { lat: 7.244426, lng: 125.850411 },
    { lat: 7.245149, lng: 125.890521 },
    { lat: 7.246995, lng: 125.890468 },
    { lat: 7.246573, lng: 125.896482 },
    { lat: 7.273798, lng: 126.038392 },
  ],
] as const;

// Hide facility markers until we have a verified municipal facility dataset.
export const MABINI_MEDICAL_FACILITIES: ReadonlyArray<MabiniMedicalFacility> = [];

export function isNearMabini(lat: number, lng: number) {
  return (
    lat >= MABINI_MAP_BOUNDS.south
    && lat <= MABINI_MAP_BOUNDS.north
    && lng >= MABINI_MAP_BOUNDS.west
    && lng <= MABINI_MAP_BOUNDS.east
  );
}
