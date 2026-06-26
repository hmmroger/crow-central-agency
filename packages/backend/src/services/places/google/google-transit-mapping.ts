import { TRANSIT_VEHICLE_TYPE, type TransitVehicleType } from "../places-manager.types.js";

/**
 * Collapse Google's transit `vehicleType` enum into the curated neutral set.
 * Unknown or undefined values fall back to `OTHER`.
 */
export function transitVehicleTypeFromGoogle(value: string | undefined): TransitVehicleType {
  if (!value) {
    return TRANSIT_VEHICLE_TYPE.OTHER;
  }

  switch (value) {
    case "AIRPLANE":
      return TRANSIT_VEHICLE_TYPE.AIRPLANE;

    case "BUS":
    case "INTERCITY_BUS":
    case "TROLLEYBUS":
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
      return TRANSIT_VEHICLE_TYPE.RAIL;

    case "MONORAIL":
      return TRANSIT_VEHICLE_TYPE.MONORAIL;

    case "FERRY":
      return TRANSIT_VEHICLE_TYPE.FERRY;

    case "CABLE_CAR":
    case "FUNICULAR":
      return TRANSIT_VEHICLE_TYPE.CABLE;

    case "GONDOLA_LIFT":
      return TRANSIT_VEHICLE_TYPE.GONDOLAS;

    case "SHARE_TAXI":
    default:
      return TRANSIT_VEHICLE_TYPE.OTHER;
  }
}
