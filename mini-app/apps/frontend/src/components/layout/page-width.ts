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
  // md (768), not lg (1024): Telegram Desktop windows after fullscreen
  // are often 800–1000px, so an lg-only widen never fired.
  wide: 'max-w-[480px] sm:max-w-[640px] md:max-w-[840px] lg:max-w-[960px] xl:max-w-page',
} as const;

export type PageWidth = keyof typeof PAGE_WIDTH;
