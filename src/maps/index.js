// ============================================================================
// MAP REGISTRY (src/maps/index.js)
// Multi-Era Map & Theater Definitions:
//  1. frugis_river     — MODERN ERA (Jets, B-2 Spirit Bomber, Tanks, IFVs, HQ Bike Warehouse)
//  2. medieval_citadel — MEDIEVAL ERA (Stone Castles, Siege Trebuchets, Warhorses, Swordsmen & Mounted Archers)
//  3. jurassic_island  — JURASSIC ERA (Prehistoric Jungle Island — Humans vs Dinosaurs)
// ============================================================================

import { TERRAIN } from '../config.js?v=126';
import { FRUGIS_RIVER_MAP } from './frugis-river.js?v=126';

export const MEDIEVAL_CITADEL_MAP = {
  id: 'medieval_citadel',
  era: 'medieval',
  isBeta: true,
  eraLabel: 'MEDIEVAL ERA (12TH CENTURY • BETA)',
  name: 'IRONKEEP CITADEL & CASTLE VALLEY (BETA)',
  subtitle: 'BETA PREVIEW • STONE CASTLES, TREBUCHETS & CAVALRY • NO MODERN AIRCRAFT',
  dimensions: {
    width: 7600,
    depth: 5200,
    segmentsX: 560,
    segmentsZ: 380,
    riverWidth: 52,
    riverLength: 5200,
    riverWaterY: -0.85
  },

  bridges: [
    { z: -400, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 },
    { z: 0, widthX: 42, spanZ: 36.0, isCentralPlaza: true, parapetHalfSpanZ: 17.2 },
    { z: 400, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 }
  ],

  // Only medieval castle plateaus & siege camp pads (NO modern airfields, B-2 lanes, or bike warehouses)
  gradedPads: [
    { x: -660, z: -280, rx: 66, rz: 56, h: 2.5 },   // Obj A: West Barony Stone Keep
    { x: -320, z: 320, rx: 62, rz: 54, h: 1.25 },   // Obj B: Royal Siege Camp & Warhorse Lists
    { x: 0, z: 0, rx: 68, rz: 58, h: 1.25 },        // Obj C: King's Stone Bridge Citadel
    { x: 330, z: -320, rx: 66, rz: 56, h: 6.25 },   // Obj D: Highland Crown Fortress
    { x: 660, z: 280, rx: 66, rz: 56, h: 2.5 },     // Obj E: East Citadel Garrison
    { x: -640, z: 270, rx: 45, rz: 38, h: 2.5 },    // North-West Feudal Watch Hamlet
    { x: 640, z: -270, rx: 45, rz: 38, h: 2.5 },    // South-East Feudal Watch Hamlet
    { x: -1060, z: 0, rx: 50, rz: 42, h: 1.25 },     // West Vanguard Castle Gatehouse
    { x: 1060, z: 0, rx: 50, rz: 42, h: 1.25 },      // East Vanguard Castle Gatehouse
    { x: -1520, z: 0, rx: 82, rz: 68, h: 1.25 },     // West Kingdom Grand Castle HQ
    { x: 1520, z: 0, rx: 82, rz: 68, h: 1.25 }       // East Empire Grand Castle HQ
  ],

  spawns: {
    US_BASE: { x: -1520, z: 0 },
    RU_BASE: { x: 1520, z: 0 }
  },

  flags: [
    {
      id: 'A',
      name: 'OBJ ALPHA — WEST BARONY KEEP',
      x: -660, z: -280,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'B',
      name: 'OBJ BRAVO — ROYAL SIEGE ENCAMPMENT',
      x: -320, z: 320,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'C',
      name: "OBJ CHARLIE — KING'S BRIDGE CITADEL",
      x: 0,
      z: 0,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_CHARLIE,
      useGroundHeight: true
    },
    {
      id: 'D',
      name: 'OBJ DELTA — HIGHLAND CROWN FORTRESS',
      x: 330, z: -320,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'E',
      name: 'OBJ ECHO — EAST IRON CITADEL',
      x: 660, z: 280,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    }
  ],

  // Medieval Castles, Half-Timbered Tudor Village Guildhalls, Windmills & Timber Palisades are built by buildMedievalCastlesAndFortifications()
  buildings: [],

  watchtowers: [
    [-750, 18],
    [-750, -18],
    [748, -18],
    [748, 18],
    [-522, 12],
    [520, -12],
    [-286, -104],
    [-132, 120],
    [-18, 26],
    [16, -30],
    [284, 102]
  ],

  // NO modern HESCO bastions, NO modern sandbag bunkers, NO shipping containers, NO radar towers in Medieval Era!
  hescoBastions: [],
  sandbagBunkers: [],
  shippingContainers: [],
  radarTowers: [],

  ammoCrates: [
    [-940, -4],
    [-920, 8],
    [940, 4],
    [920, -8],
    [-655, -4],
    [655, 4],
    [-376, -136],
    [-182, 162],
    [-4, 3],
    [6, -3],
    [192, -162],
    [376, 136]
  ],

  treeCoords: FRUGIS_RIVER_MAP.treeCoords
};

export const JURASSIC_ISLAND_MAP = {
  id: 'jurassic_island',
  era: 'jurassic',
  isBeta: true,
  eraLabel: 'JURASSIC ERA (65 MILLION BC • BETA)',
  name: 'ISLA CARNIVORA — HUMANS VS DINOSAURS (BETA)',
  subtitle: 'BETA PREVIEW • EXPEDITION HUMANS (US) VS PREHISTORIC DINOSAUR PACK (RU)',
  dimensions: {
    width: 7600,
    depth: 5200,
    segmentsX: 560,
    segmentsZ: 380,
    riverWidth: 52,
    riverLength: 5200,
    riverWaterY: -0.85
  },

  bridges: [
    { z: -400, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 },
    { z: 0, widthX: 42, spanZ: 36.0, isCentralPlaza: true, parapetHalfSpanZ: 17.2 },
    { z: 400, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 }
  ],

  gradedPads: [
    { x: -660, z: -280, rx: 64, rz: 54, h: 2.5 },   // Obj A: Raptor Paddock West
    { x: -320, z: 320, rx: 60, rz: 52, h: 1.25 },   // Obj B: Amber Lagoon Research Outpost
    { x: 0, z: 0, rx: 66, rz: 56, h: 1.25 },        // Obj C: Jungle Gorge Crossing
    { x: 330, z: -320, rx: 64, rz: 54, h: 6.25 },   // Obj D: T-Rex Highland Ridge
    { x: 660, z: 280, rx: 64, rz: 54, h: 2.5 },     // Obj E: Volcanic Nesting Grounds
    { x: -1060, z: 0, rx: 48, rz: 40, h: 1.25 },     // Human Ranger Checkpoint
    { x: 1060, z: 0, rx: 48, rz: 40, h: 1.25 },      // Dino Territory Bone Canyon
    { x: -1520, z: 0, rx: 78, rz: 64, h: 1.25 },     // Human Expedition Base Camp
    { x: 1520, z: 0, rx: 78, rz: 64, h: 1.25 }       // Dinosaur Alpha Lair
  ],

  spawns: {
    US_BASE: { x: -1520, z: 0 },
    RU_BASE: { x: 1520, z: 0 }
  },

  flags: [
    {
      id: 'A',
      name: 'OBJ ALPHA — RAPTOR PADDOCK SECTOR',
      x: -660, z: -280,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'B',
      name: 'OBJ BRAVO — AMBER LAGOON LABS',
      x: -320, z: 320,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'C',
      name: 'OBJ CHARLIE — JUNGLE GORGE CROSSING',
      x: 0,
      z: 0,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_CHARLIE,
      useGroundHeight: true
    },
    {
      id: 'D',
      name: 'OBJ DELTA — T-REX HIGHLAND RIDGE',
      x: 330, z: -320,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'E',
      name: 'OBJ ECHO — VOLCANIC DINO NESTS',
      x: 660, z: 280,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    }
  ],

  // Outpost research bunkers on Human side & overgrown ruins in center
  buildings: [
    [-768, -12, 9, 7, 2, 'darkConcrete'],
    [-768, 8, 8, 6, 2, 'concrete'],
    [-312, -120, 9, 7, 2, 'concrete'],
    [-296, -106, 8, 6, 2, 'darkConcrete'],
    [-154, 130, 9, 7, 2, 'concrete'],
    [-22, -18, 9, 7, 2, 'darkConcrete'],
    [16, 12, 8, 6, 2, 'darkConcrete'],
    [148, -134, 8, 6, 2, 'brick'],
    [298, 110, 8, 6, 2, 'brick']
  ],

  watchtowers: [
    [-750, 14],
    [-750, -16],
    [-522, 10],
    [-286, -104],
    [-132, 120],
    [-18, 26],
    [16, -30],
    [152, -120],
    [284, 102]
  ],

  hescoBastions: [
    [-740, -14, 24, false],
    [-308, -112, 10, true],
    [-150, 114, 12, true]
  ],

  sandbagBunkers: [
    [-303, -112],
    [-147, 132],
    [-15, 0],
    [15, 0],
    [156, -132],
    [304, 114]
  ],

  shippingContainers: [],
  radarTowers: [],

  ammoCrates: [
    [-940, -4],
    [-920, 8],
    [940, 4],
    [920, -8],
    [-655, -4],
    [655, 4],
    [-376, -136],
    [-182, 162],
    [-4, 3],
    [6, -3],
    [192, -162],
    [376, 136]
  ],

  // Extra-lush prehistoric jungle canopy
  treeCoords: [
    ...FRUGIS_RIVER_MAP.treeCoords,
    [-400, -170], [-350, -110], [-210, 190], [-160, 140], [-35, -35],
    [35, 35], [170, -190], [220, -140], [350, 170], [410, 115],
    [-600, -35], [-600, 35], [600, -35], [600, 35],
    [-700, -60], [700, 60], [820, -30], [840, 40], [890, -50], [890, 50]
  ]
};

export const MAPS = {
  frugis_river: FRUGIS_RIVER_MAP,
  medieval_citadel: MEDIEVAL_CITADEL_MAP,
  jurassic_island: JURASSIC_ISLAND_MAP
};

export const ERA_TO_MAP_ID = {
  modern: 'frugis_river',
  medieval: 'medieval_citadel',
  jurassic: 'jurassic_island'
};

export const DEFAULT_MAP_ID = 'frugis_river';

export function getMapDefinition(mapId = DEFAULT_MAP_ID) {
  if (ERA_TO_MAP_ID[mapId]) {
    return MAPS[ERA_TO_MAP_ID[mapId]];
  }
  return MAPS[mapId] || FRUGIS_RIVER_MAP;
}

export { FRUGIS_RIVER_MAP };
