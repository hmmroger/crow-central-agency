import type { ReactNode } from "react";

interface FieldGroupProps {
  /** Field label */
  label: string;
  /** Optional action element (e.g. generate button) */
  action?: ReactNode;
  children: ReactNode;
}

/** Field group with label and optional action element */
export function FieldGroup({ label, action, children }: FieldGroupProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-text-secondary">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
