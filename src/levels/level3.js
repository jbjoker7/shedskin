import { buildPlaceholder } from './placeholder.js';

// PLACEHOLDER — replaced by the authored "The Chimney" layout.
const level = buildPlaceholder('The Chimney', 'the only way out is up', 'chimney', 124, ['C', '*']);
level.pressure = {
  spawnTilesBelow: 8,
  triggerTilesFromBottom: 13,
  speedTps: 2.6,
  stalls: [
    { tilesFromBottom: 40, dur: 2.5 },
    { tilesFromBottom: 66, dur: 2.5 },
    { tilesFromBottom: 84, dur: 2.0 },
  ],
  stopTilesFromBottom: 112,
};
export default level;
