/** An image upload in flight, and where its embed goes once it lands */
export interface PendingImagePaste {
  id: number;
  /** Mapped through every edit made while the upload runs */
  position: number;
}
