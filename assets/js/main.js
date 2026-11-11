// Entry point. The page is complete without JavaScript; each module adds one thing.
import { build } from './swarm.js';
import './page.js';       // the theme switch, the email address, the name
import './cards.js';      // tilting cards, scenes that play only on screen
import './projects.js';   // the live project list
import './player.js';     // the Ad Astra card and its YouTube player
import './adastra.js';    // the Ad Astra cover: parallax and grain

// The drone swarm builds the page first. The galaxy starts once it is done, when the
// browser is idle: the words are on screen before it asks anything of the GPU.
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
requestAnimationFrame(() => build().then(() => idle(() => import('./galaxy/index.js').then((m) => m.boot()), { timeout: 800 })));
