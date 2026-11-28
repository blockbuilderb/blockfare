// ============================================================================
// VOXEL MATERIAL PALETTE & DESTRUCTION PROPERTIES (src/assets/voxel-materials.js)
// Edit this file to patch voxel block colors, HP, roughness, or batch limits.
// ============================================================================

import { MAT_HP } from '../config.js?v=149';

export const VOXEL_SIZE = 1.25;

export const MAT_DEFS = {
  brick: { hp: MAT_HP.BRICK, color: 0xd97f6c, map: 'brick', roughness: 0.9, maxInstances: 320000 },
  concrete: { hp: MAT_HP.CONCRETE, color: 0xcfd6dd, map: 'concrete', roughness: 0.85, maxInstances: 520000 },
  darkConcrete: { hp: MAT_HP.DARK_CONCRETE, color: 0x828c96, map: 'darkConcrete', roughness: 0.85, maxInstances: 420000 },
  steelBeam: { hp: MAT_HP.STEEL_BEAM, color: 0x2c3540, map: 'darkConcrete', roughness: 0.36, metalness: 0.78, maxInstances: 220000 },
  sandbag: { hp: MAT_HP.SANDBAG, color: 0xdfd0a8, map: 'sandbag', roughness: 0.95, maxInstances: 64000 },
  wood: { hp: MAT_HP.WOOD, color: 0xc89666, map: 'wood', roughness: 0.9, maxInstances: 120000 },
  containerRed: { hp: MAT_HP.CONTAINER, color: 0xc0392b, map: 'container', roughness: 0.65, maxInstances: 14000 },
  containerBlue: { hp: MAT_HP.CONTAINER, color: 0x2980b9, map: 'container', roughness: 0.65, maxInstances: 14000 },
  containerOlive: { hp: MAT_HP.CONTAINER, color: 0x556b2f, map: 'container', roughness: 0.65, maxInstances: 14000 }
};
