/**
 * Output Processing Module
 * 
 * Centralized output handling including coalescing and directives.
 * 
 * @module lib/output
 */

export * from './coalescer.js';
export * from './directives.js';

export { default as coalescer } from './coalescer.js';
export { default as directives } from './directives.js';
