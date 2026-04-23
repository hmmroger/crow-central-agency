import { useSensorsQuery } from "../../hooks/queries/use-sensors-query.js";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";

interface SensorsSectionProps {
  sensorIds: string[];
  onToggle: (sensorId: string) => void;
}

/**
 * Sensor selection section in the agent editor.
 * Shows a toggle for each available sensor registered on the backend.
 */
export function SensorsSection({ sensorIds, onToggle }: SensorsSectionProps) {
  const { data: sensors, isLoading } = useSensorsQuery();

  if (isLoading || !sensors || sensors.length === 0) {
    return (
      <FieldGroup label="Sensors">
        <p className="text-xs text-text-muted">{isLoading ? "Loading sensors..." : "No sensors available."}</p>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup label="Sensors">
      <p className="mb-1.5 text-xs text-text-muted">Contextual sensors that provide real-time data to the agent.</p>
      <div className="flex flex-col gap-1.5">
        {sensors.map((sensor) => (
          <Toggle
            key={sensor.id}
            checked={sensorIds.includes(sensor.id)}
            onChange={() => onToggle(sensor.id)}
            label={sensor.name}
            variant="secondary"
          />
        ))}
      </div>
    </FieldGroup>
  );
}
