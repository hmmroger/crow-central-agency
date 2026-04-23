/**
 * Handle exposed by dialog content components via useImperativeHandle.
 * The renderer creates a ref and passes it to the content component as `ref`.
 */
export interface ModalDialogHandle {
  canDismiss?: () => boolean | Promise<boolean>;
}

/**
 * Generic config used at call sites for type-safe component/props pairing.
 * P is inferred from the component's props type; Omit strips onClose/ref
 * since the dialog renderer injects them automatically.
 */
export interface ModalDialogShowConfig<P> {
  id: string;
  /** Content component to render inside the dialog */
  component: React.ComponentType<P>;
  /** Props passed to the content component (onClose and ref are injected automatically) */
  componentProps?: Omit<P, "onClose" | "ref">;
  /** When provided, renders a header bar with title + close button */
  title?: string;
  /** Called when the dialog dismisses (Escape, backdrop click, programmatic) */
  onClose?: () => void;
  /** Container class for sizing (e.g. "w-80", "max-w-md") */
  className?: string;
  /** ARIA role for the dialog (default: "dialog") */
  role?: "dialog" | "alertdialog";
  /** ID of the element labelling the dialog (fallback when title is not used) */
  ariaLabelledBy?: string;
  /** ID of the element describing the dialog */
  ariaDescribedBy?: string;
  /** When true, enables arrow-key list navigation. Content must use useModalDialogListNav() + useListItem(). */
  listNavigation?: boolean;
}

// General config used in the context provider
export type ModalDialogConfig = ModalDialogShowConfig<ModalDialogContentProps>;

export interface ModalDialogContentProps {
  onClose: () => void;
  ref?: React.Ref<ModalDialogHandle>;
  [key: string]: unknown;
}

export interface ModalDialogContextValue {
  showDialog: <P>(config: ModalDialogShowConfig<P>) => void;
  /** Dismiss the topmost dialog, or a specific dialog by id */
  hideDialog: (id?: string) => void;
  isDialogOpen: (id: string) => boolean;
}
