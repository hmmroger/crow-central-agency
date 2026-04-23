import type { ReactNode } from "react";

interface FieldGroupProps {
  /** Field label */
  label: string;
  /** Whether the field is required */
  required?: boolean;
  /** Optional action element (e.g. generate button) */
  action?: ReactNode;
  children: ReactNode;
}

/** Field group with label and optional action element */
export function FieldGroup({ label, required, action, children }: FieldGroupProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-text-neutral">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}
