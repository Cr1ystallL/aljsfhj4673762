/**
 * Page width scale.
 *
 * Every screen hardcoded `max-w-[480px] sm:max-w-[640px]`, so the product was a
 * phone-wide strip on a desktop with black on either side, and there was no one
 * place to change that.
 *
 * `reading` keeps that column for the game screens, whose boards and canvases
 * are laid out against a narrow viewport. `wide` lets grid and list screens
 * spread out once there is room.
 */
export const PAGE_WIDTH = {
  reading: 'max-w-[480px] sm:max-w-[640px]',
  wide: 'max-w-[480px] sm:max-w-[640px] lg:max-w-[900px] xl:max-w-page',
} as const;

export type PageWidth = keyof typeof PAGE_WIDTH;
