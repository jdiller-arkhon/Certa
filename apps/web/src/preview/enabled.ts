/**
 * The preview gallery renders every screen from contract fixtures, with no backend. It is on in
 * development, and in a production build only when NEXT_PUBLIC_ENABLE_PREVIEW=1 (for review
 * builds). It never touches real data.
 */
export const PREVIEW_ENABLED = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_PREVIEW === '1';
