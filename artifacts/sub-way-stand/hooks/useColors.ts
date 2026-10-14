import colors from '@/constants/colors';

/** The app ships a single dark palette (see constants/colors.ts). */
export function useColors() {
  return { ...colors.dark, radius: colors.radius };
}
