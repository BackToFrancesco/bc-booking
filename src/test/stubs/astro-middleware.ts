// Sostituto del modulo virtuale `astro:middleware` per i test.
export const defineMiddleware = <T>(fn: T): T => fn;
