/**
 * Utility functions for the frontend
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge
 * This allows conditional classes and merging of Tailwind utility classes
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-blue-500", "text-white")
 * cn("p-4", className) // Merges with incoming className prop
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
