// ============================================================================
// MAP DEFINITION: FRUGIS RIVER VALLEY (2,400m x 1,500m Squad-Scale Conquest)
// Edit this file to patch terrain plateaus, HQ bases, Conquest objectives (A-E),
// bridges, multi-story buildings, fortifications, ammo crates, and tree cover.
// ============================================================================

import { TERRAIN } from '../config.js?v=90';

export const FRUGIS_RIVER_MAP = {
  id: 'frugis_river',
  era: 'modern',
  eraLabel: 'MODERN ERA (21ST CENTURY)',
  name: 'FRUGIS RIVER VALLEY',
  subtitle: 'COMBINED ARMS & AIR COMBAT • 4,800M × 3,200M THEATER',
  dimensions: {
    width: 4800,
    depth: 3200,
    segmentsX: 360,
    segmentsZ: 240,
    riverWidth: 52,
    riverLength: 3200,
    riverWaterY: -0.85
  },

  // Three fortified stone/concrete bridges spanning the central river gorge
  bridges: [
    { z: -220, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 },
    { z: 0, widthX: 42, spanZ: 36.0, isCentralPlaza: true, parapetHalfSpanZ: 17.2 },
    { z: 220, widthX: 42, spanZ: 17.0, isCentralPlaza: false, parapetHalfSpanZ: 7.2 }
  ],

  // Flattened/graded urban & base terrain pads aligned to VOXEL_SIZE (1.25m) multiples
  gradedPads: [
    { x: -380, z: -140, rx: 64, rz: 54, h: 2.5 },   // Obj A: West Frugis Town District
    { x: -185, z: 165, rx: 60, rz: 52, h: 1.25 },   // Obj B: North Container & Logistics Yard
    { x: 0, z: 0, rx: 66, rz: 56, h: 1.25 },        // Obj C: Central River City & Bridges
    { x: 195, z: -165, rx: 64, rz: 54, h: 6.25 },   // Obj D: Radar Hill & Trench Complex (High Ground)
    { x: 380, z: 140, rx: 64, rz: 54, h: 2.5 },     // Obj E: East Industrial District
    { x: -360, z: 130, rx: 45, rz: 38, h: 2.5 },    // North-West Hamlet Outpost
    { x: 360, z: -130, rx: 45, rz: 38, h: 2.5 },    // South-East Hamlet Outpost
    { x: -660, z: 0, rx: 48, rz: 40, h: 1.25 },     // US Forward Highway Transit Depot
    { x: 660, z: 0, rx: 48, rz: 40, h: 1.25 },      // RU Forward Highway Transit Depot
    { x: -950, z: 0, rx: 78, rz: 64, h: 1.25 },     // US Main Base & Motor Pool (587m from Obj A)
    { x: 950, z: 0, rx: 78, rz: 64, h: 1.25 },      // RU Main Base & Motor Pool (587m from Obj E)
    { x: -865, z: -76, rx: 205, rz: 48, h: 1.25 },  // US West 360m Extended Airfield Runway Lane 1 & Side Flight-Line Parking Apron
    { x: 865, z: 76, rx: 205, rz: 48, h: 1.25 },    // RU East 360m Extended Airfield Runway Lane 1 & Side Flight-Line Parking Apron
    { x: -865, z: -112, rx: 205, rz: 42, h: 1.25 }, // US West 360m Dedicated Northrop B-2 Spirit Stealth Runway Lane 2
    { x: 865, z: 112, rx: 205, rz: 42, h: 1.25 },   // RU East 360m Dedicated Northrop B-2 Spirit Stealth Runway Lane 2
    { x: -1035, z: -38, rx: 58, rz: 36, h: 1.25 },  // US West Secret Cliffside Cave at Very Back of HQ Base (1903 Wright Flyer I)
    { x: 1035, z: 38, rx: 58, rz: 36, h: 1.25 },    // RU East Secret Cliffside Cave at Very Back of HQ Base (1903 Wright Flyer I)
    { x: -926, z: 74, rx: 92, rz: 44, h: 1.25 },    // US HQ Right-Side Motorcycle, 2-Stroke, E-Moto, Scooter & ATV Warehouse
    { x: 926, z: -74, rx: 92, rz: 44, h: 1.25 }     // RU HQ Right-Side Motorcycle, 2-Stroke, E-Moto, Scooter & ATV Warehouse
  ],

  // Main Faction HQ Spawn Coordinates (>580m from nearest capture flags)
  spawns: {
    US_BASE: { x: -950, z: 0 },
    RU_BASE: { x: 950, z: 0 }
  },

  // Conquest Capture Objectives (A-E)
  flags: [
    {
      id: 'A',
      name: 'OBJ ALPHA — WEST FRUGIS TOWN',
      x: -380,
      z: -140,
      owner: 'US',
      captureProgress: 100,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'B',
      name: 'OBJ BRAVO — LOGISTICS CONTAINER YARD',
      x: -185,
      z: 165,
      owner: 'US',
      captureProgress: 80,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'C',
      name: 'OBJ CHARLIE — RIVER CITY BRIDGE PLAZA',
      x: 0,
      z: 0,
      owner: 'NEUTRAL',
      captureProgress: 0,
      radius: TERRAIN.FLAG_RADIUS_CHARLIE,
      useGroundHeight: true
    },
    {
      id: 'D',
      name: 'OBJ DELTA — RADAR HILL GARRISON',
      x: 195,
      z: -165,
      owner: 'RU',
      captureProgress: -80,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    },
    {
      id: 'E',
      name: 'OBJ ECHO — EAST INDUSTRIAL SECTOR',
      x: 380,
      z: 140,
      owner: 'RU',
      captureProgress: -100,
      radius: TERRAIN.FLAG_RADIUS_DEFAULT,
      useGroundHeight: false
    }
  ],

  // Multi-story destructible voxel buildings: [startGx, startGz, width, depth, floors, wallMat]
  buildings: [
    // US & RU Main HQ Bases
    [-768, -14, 9, 7, 2, 'darkConcrete'],
    [-768, 8, 8, 6, 2, 'concrete'],
    [-782, -12, 8, 6, 2, 'concrete'],
    [-782, 6, 8, 6, 2, 'darkConcrete'],
    [758, 6, 9, 7, 2, 'darkConcrete'],
    [758, -16, 8, 6, 2, 'concrete'],
    [772, 6, 8, 6, 2, 'concrete'],
    [772, -14, 8, 6, 2, 'darkConcrete'],

    // US & RU Highway Transit Depots
    [-534, -14, 8, 6, 2, 'concrete'],
    [-546, -14, 8, 6, 2, 'brick'],
    [-546, 10, 8, 6, 2, 'darkConcrete'],
    [526, 8, 8, 6, 2, 'concrete'],
    [538, 8, 8, 6, 2, 'brick'],
    [538, -16, 8, 6, 2, 'darkConcrete'],

    // Sector A: West Frugis Town District (Forward Base Alpha — Expanded Urban Complex)
    [-320, -124, 10, 7, 3, 'brick'],
    [-304, -126, 9, 7, 4, 'concrete'],
    [-290, -120, 8, 7, 3, 'brick'],
    [-316, -106, 9, 6, 3, 'concrete'],
    [-300, -104, 8, 6, 2, 'brick'],
    [-290, -108, 7, 6, 2, 'darkConcrete'],
    [-332, -120, 8, 6, 3, 'concrete'],
    [-332, -106, 8, 6, 2, 'brick'],
    [-318, -94, 8, 6, 2, 'darkConcrete'],
    [-302, -92, 8, 6, 3, 'brick'],
    [-278, -122, 8, 6, 2, 'concrete'],
    [-278, -108, 8, 6, 3, 'brick'],

    // Sector B: North Logistics & Container Yard (Forward Base Bravo — Expanded Compound)
    [-162, 130, 10, 7, 3, 'darkConcrete'],
    [-140, 136, 9, 6, 2, 'concrete'],
    [-154, 142, 8, 6, 2, 'brick'],
    [-146, 116, 8, 6, 2, 'darkConcrete'],
    [-174, 128, 8, 6, 3, 'concrete'],
    [-174, 140, 8, 6, 2, 'brick'],
    [-166, 114, 8, 6, 2, 'concrete'],
    [-128, 134, 8, 6, 3, 'darkConcrete'],
    [-128, 120, 8, 6, 2, 'brick'],
    [-140, 148, 8, 6, 2, 'darkConcrete'],

    // Sector C: Central River City & Bridge Plaza (Forward Base Charlie — Expanded City Center)
    [-8, -13, 7, 6, 2, 'darkConcrete'],
    [1, 7, 7, 6, 2, 'concrete'],
    [-28, -22, 10, 7, 4, 'darkConcrete'],
    [18, -22, 10, 7, 4, 'concrete'],
    [-26, 12, 9, 7, 3, 'brick'],
    [17, 12, 9, 7, 3, 'brick'],
    [-32, -5, 8, 6, 2, 'concrete'],
    [24, -5, 8, 6, 2, 'darkConcrete'],
    [-40, -34, 8, 6, 3, 'brick'],
    [-40, 26, 8, 6, 3, 'concrete'],
    [30, -34, 8, 6, 3, 'brick'],
    [30, 26, 8, 6, 3, 'concrete'],
    [-28, 26, 8, 6, 2, 'darkConcrete'],
    [18, 26, 8, 6, 2, 'darkConcrete'],
    [-28, -34, 8, 6, 2, 'concrete'],
    [18, -34, 8, 6, 2, 'concrete'],

    // Sector D: Radar Hill & Trench Garrison (Forward Base Delta — Expanded Hilltop Fortress)
    [144, -138, 10, 7, 3, 'darkConcrete'],
    [160, -130, 9, 7, 3, 'concrete'],
    [148, -120, 8, 6, 2, 'darkConcrete'],
    [154, -144, 8, 6, 2, 'brick'],
    [160, -118, 8, 6, 2, 'concrete'],
    [132, -136, 8, 6, 3, 'concrete'],
    [134, -120, 8, 6, 2, 'brick'],
    [172, -132, 8, 6, 3, 'darkConcrete'],
    [172, -118, 8, 6, 2, 'brick'],
    [142, -150, 8, 6, 2, 'concrete'],
    [168, -146, 8, 6, 2, 'darkConcrete'],

    // Sector E: East Industrial District (Forward Base Echo — Expanded Factory Sector)
    [292, 104, 10, 7, 4, 'brick'],
    [308, 108, 9, 7, 3, 'concrete'],
    [296, 120, 9, 6, 3, 'brick'],
    [312, 122, 8, 6, 3, 'darkConcrete'],
    [284, 114, 8, 6, 2, 'concrete'],
    [306, 98, 8, 6, 2, 'darkConcrete'],
    [272, 104, 8, 6, 3, 'concrete'],
    [272, 118, 8, 6, 2, 'brick'],
    [324, 108, 8, 6, 3, 'brick'],
    [324, 122, 8, 6, 2, 'concrete'],
    [292, 92, 8, 6, 2, 'brick'],
    [318, 96, 8, 6, 2, 'concrete'],

    // Inter-Sector Villages, Roadside Outposts & Bridge Checkpoints
    [-294, 100, 9, 7, 3, 'brick'],
    [-280, 106, 8, 6, 2, 'concrete'],
    [-308, 102, 8, 6, 2, 'darkConcrete'],
    [282, -108, 9, 7, 3, 'brick'],
    [294, -102, 8, 6, 2, 'concrete'],
    [268, -106, 8, 6, 2, 'darkConcrete'],
    [-24, 172, 8, 6, 2, 'brick'],
    [16, 172, 8, 6, 2, 'concrete'],
    [-24, -180, 8, 6, 2, 'concrete'],
    [16, -180, 8, 6, 2, 'brick'],
    [-410, -18, 8, 6, 2, 'brick'],
    [402, 12, 8, 6, 2, 'brick'],
    [-190, -78, 8, 6, 2, 'concrete'],
    [182, 72, 8, 6, 2, 'concrete']
  ],

  // Wooden Watchtowers: [startGx, startGz]
  watchtowers: [
    [-750, 14],
    [-750, -16],
    [748, -16],
    [748, 14],
    [-522, 10],
    [520, -12],
    [-286, -104],
    [-132, 120],
    [-18, 26],
    [16, -30],
    [284, 102]
  ],

  // HESCO Bastion Walls: [startGx, startGz, length, alongX]
  hescoBastions: [
    [-740, -14, 24, false],
    [740, -10, 24, false],
    [-526, -6, 12, true],
    [522, 6, 12, true],
    [-308, -112, 10, true],
    [-150, 114, 12, true],
    [138, -128, 12, false],
    [150, -114, 14, true],
    [300, 100, 12, true],
    [-220, -8, 12, false],
    [220, -8, 12, false]
  ],

  // Sandbag Bunkers: [centerGx, centerGz]
  sandbagBunkers: [
    [-303, -112],
    [-147, 132],
    [-15, 0],
    [15, 0],
    [156, -132],
    [304, 114],
    [-286, 96],
    [286, -96],
    [-14, 176],
    [14, 176],
    [-14, -176],
    [14, -176],
    [-115, 0],
    [115, 0]
  ],

  // Shipping Containers: [startGx, startGz, alongX, matType, offsetGy]
  shippingContainers: [
    [-756, 10, true, 'containerBlue', 0],
    [-756, -12, true, 'containerOlive', 0],
    [750, -12, true, 'containerRed', 0],
    [750, 10, true, 'containerOlive', 0],
    [-530, 8, true, 'containerBlue', 0],
    [526, -10, true, 'containerRed', 0],
    [-154, 120, true, 'containerRed', 0],
    [-154, 120, true, 'containerBlue', 3],
    [-144, 122, false, 'containerOlive', 0],
    [-136, 126, true, 'containerRed', 0],
    [-136, 126, true, 'containerOlive', 3],
    [166, -142, true, 'containerOlive', 0],
    [-214, 6, true, 'containerOlive', 0],
    [210, -8, true, 'containerRed', 0]
  ],

  // Radar Towers: [wx, wz]
  radarTowers: [
    [204, -172],
    [182, -178]
  ],

  // Pre-placed Base & Objective Ammo Crates: [wx, wz]
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
    [376, 136],
    [-356, 126],
    [356, -126]
  ],

  // Low-poly Pine Trees & Boulders: [wx, wz]
  treeCoords: [
    [-860, -85], [-820, 95], [-760, -140], [-710, 125], [-640, -90],
    [-580, 110], [-520, -110], [-460, 85], [-430, -65], [-340, 45],
    [-285, -195], [-265, 188], [-250, -235], [-235, 230], [-220, -55],
    [-215, 215], [-195, -240], [-170, 235], [-160, -220], [-145, -38],
    [-140, 48], [-130, 230], [-125, -210], [-110, 82], [-95, -235],
    [-85, -85], [-70, 245], [-55, -225], [-48, 92], [-42, -95],
    [-32, 235], [-28, -240], [28, 240], [32, -235], [42, 95],
    [48, -92], [55, 225], [70, -245], [85, 85], [95, 235],
    [110, -82], [125, 210], [130, -230], [140, -48], [145, 38],
    [160, 220], [170, -235], [195, 240], [215, -215], [220, 55],
    [235, -230], [250, 235], [265, -188], [285, 195],
    [340, -45], [430, 65], [460, -85], [520, 110], [580, -110],
    [640, 90], [710, -125], [760, 140], [820, -95], [860, 85],
    [-480, -220], [-480, 220], [480, -220], [480, 220],
    [-310, 25], [310, -25], [-90, -45], [90, 45],
    [-270, -165], [270, 165], [-110, 185], [110, -185],
    [-550, -55], [550, 55], [-550, 45], [550, -45]
  ]
};
