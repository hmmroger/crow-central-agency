/**
 * Generic config used at call sites for type-safe component/props pairing.
 * P is inferred from the component's props type; Omit strips onClose
 * since the dialog renderer injects it automatically.
 */
export interface ModalDialogShowConfig<P> {
  id: string;
  /** Content component to render inside the dialog */
  component: React.ComponentType<P>;
  /** Props passed to the content component (onClose is injected automatically) */
  componentProps?: Omit<P, "onClose">;
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
  [key: string]: unknown;
}

export interface ModalDialogContextValue {
  showDialog: <P>(config: ModalDialogShowConfig<P>) => void;
  hideDialog: () => void;
  isDialogOpen: (id: string) => boolean;
}
