export interface BusLine {
  id: number;
  internalId: number;
  name: string;
}

export interface Route {
  id: number;
  name: string;
}

export interface Stop {
  code: number;
  name: string;
}

export interface BusTime {
  line: number;
  destination: string;
  arrival: string;
}

export interface StopGeoPoint {
  code: number;
  name: string;
  order: number;
  lat: number;
  lon: number;
}

export interface RouteGeoData {
  routeId: number;
  routeName: string;
  stops: StopGeoPoint[];
}

export interface Vehicle {
  vehicleId: string;
  lineId: number;
  routeId: number;
  direction: string;
  origin: string;
  destination: string;
  distanceMeters: number;
  speedKmh: number;
  delayMinutes: number;
  status: string;
  lat: number;
  lon: number;
}

export interface StopVehicles {
  stopCode: number;
  vehicles: Vehicle[];
}

export interface NearbyStop {
  code: number;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  lineIds: number[];
}

export type ArrivalType = "relative" | "absolute";

export interface ParsedArrival {
  raw: string;
  type: ArrivalType;
  minutes: number | null;
}

export interface ScheduleStop {
  order: number;
  code: number;
  name: string;
  arrival: ParsedArrival | null;
}

export interface RouteSchedule {
  lineId: number;
  routeId: number;
  routeName: string;
  fetchedAt: string;
  stops: ScheduleStop[];
}
