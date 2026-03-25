/** Error shape thrown by query functions when API returns an error response */
export interface ApiQueryError {
  code: string;
  message: string;
}
