import { TRANSIT_VEHICLE_TYPE, type TransitVehicleType } from "../places-manager.types.js";

/**
 * Collapse Google's transit `vehicleType` enum into the curated neutral set.
 * Unknown or undefined values fall back to `OTHER`.
 */
export function transitVehicleTypeFromGoogle(value: string | undefined): TransitVehicleType {
  switch (value) {
    case "BUS":
    case "INTERCITY_BUS":
    case "TROLLEYBUS":
    case "SHARE_TAXI":
    case "COACH":
      return TRANSIT_VEHICLE_TYPE.BUS;

    case "SUBWAY":
    case "METRO_RAIL":
      return TRANSIT_VEHICLE_TYPE.SUBWAY;

    case "TRAM":
      return TRANSIT_VEHICLE_TYPE.TRAM;

    case "RAIL":
    case "HEAVY_RAIL":
    case "COMMUTER_TRAIN":
    case "HIGH_SPEED_TRAIN":
    case "LONG_DISTANCE_TRAIN":
    case "MONORAIL":
      return TRANSIT_VEHICLE_TYPE.RAIL;

    case "FERRY":
      return TRANSIT_VEHICLE_TYPE.FERRY;

    case "CABLE_CAR":
    case "GONDOLA_LIFT":
    case "FUNICULAR":
      return TRANSIT_VEHICLE_TYPE.CABLE;

    case undefined:
    default:
      return TRANSIT_VEHICLE_TYPE.OTHER;
  }
}
