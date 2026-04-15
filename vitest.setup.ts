/**
 * Runtime polyfill so Nest can read decorator metadata that SWC emits in tests.
 * This does not generate metadata; generation is configured in `.swcrc` (see `vitest.config.ts`).
 */
import 'reflect-metadata';
