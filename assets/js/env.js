// What the device can afford, and what the visitor asked for.

// Phones and small CPUs get fewer stars, fewer cover tiles, a shorter reverb, and
// stereo instead of HRTF.
export const small = innerWidth < 700 || (navigator.hardwareConcurrency || 8) <= 4;

// Wide screens put the text in a column on the left and the scene behind everything.
export const wide = () => innerWidth >= 1000;

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export const $ = (id) => document.getElementById(id);
