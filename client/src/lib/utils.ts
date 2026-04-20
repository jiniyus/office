import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalize(str: string = ''): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Natural sort comparator that handles numbers correctly (5 before 10, not 10 before 5)
export function naturalCompare(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Split each string into parts: numbers and non-numbers
  const aParts = aLower.split(/(\d+)/);
  const bParts = bLower.split(/(\d+)/);

  // Compare each part
  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    // If both parts are numbers, compare numerically
    if (/^\d+$/.test(aPart) && /^\d+$/.test(bPart)) {
      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);
      if (aNum !== bNum) return aNum - bNum;
    } else {
      // Otherwise, compare lexicographically
      if (aPart !== bPart) {
        return aPart.localeCompare(bPart);
      }
    }
  }

  // If all parts are equal, shorter string comes first
  return aParts.length - bParts.length;
}