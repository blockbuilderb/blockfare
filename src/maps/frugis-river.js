// ============================================================================
// MAP DEFINITION: FRUGIS RIVER VALLEY (7,600m x 5,200m Grand Combined-Arms Theater)
// All 5 Forward Operating Bases (A-E) start NEUTRAL (0%) for fair Conquest starts.
// ============================================================================

import { TERRAIN } from '../config.js?v=148';

export const FRUGIS_RIVER_MAP = {
  "id": "frugis_river",
  "era": "modern",
  "eraLabel": "MODERN ERA (21ST CENTURY)",
  "name": "FRUGIS RIVER VALLEY",
  "subtitle": "COMBINED ARMS & AIR COMBAT • 7,600M × 5,200M GRAND THEATER",
  "dimensions": {
    "width": 7600,
    "depth": 5200,
    "segmentsX": 560,
    "segmentsZ": 380,
    "riverWidth": 52,
    "riverLength": 5200,
    "riverWaterY": -0.85
  },
  "bridges": [
    {
      "z": -400,
      "widthX": 92,
      "spanZ": 17,
      "isCentralPlaza": false,
      "parapetHalfSpanZ": 7.2
    },
    {
      "z": 0,
      "widthX": 92,
      "spanZ": 36,
      "isCentralPlaza": true,
      "parapetHalfSpanZ": 17.2
    },
    {
      "z": 400,
      "widthX": 92,
      "spanZ": 17,
      "isCentralPlaza": false,
      "parapetHalfSpanZ": 7.2
    }
  ],
  "gradedPads": [
    {
      "x": -660,
      "z": -280,
      "rx": 112,
      "rz": 98,
      "h": 2.5
    },
    {
      "x": -320,
      "z": 320,
      "rx": 116,
      "rz": 100,
      "h": 1.25
    },
    {
      "x": 0,
      "z": 0,
      "rx": 78,
      "rz": 68,
      "h": 1.25
    },
    {
      "x": 330,
      "z": -320,
      "rx": 114,
      "rz": 102,
      "h": 6.25
    },
    {
      "x": 660,
      "z": 280,
      "rx": 116,
      "rz": 100,
      "h": 2.5
    },
    {
      "x": -640,
      "z": 270,
      "rx": 45,
      "rz": 38,
      "h": 2.5
    },
    {
      "x": 640,
      "z": -270,
      "rx": 45,
      "rz": 38,
      "h": 2.5
    },
    {
      "x": -1060,
      "z": 0,
      "rx": 48,
      "rz": 40,
      "h": 1.25
    },
    {
      "x": 1060,
      "z": 0,
      "rx": 48,
      "rz": 40,
      "h": 1.25
    },
    {
      "x": -1520,
      "z": 0,
      "rx": 78,
      "rz": 64,
      "h": 1.25
    },
    {
      "x": 1520,
      "z": 0,
      "rx": 78,
      "rz": 64,
      "h": 1.25
    },
    {
      "x": -2735,
      "z": -86,
      "rx": 225,
      "rz": 58,
      "h": 1.25
    },
    {
      "x": 2735,
      "z": 86,
      "rx": 225,
      "rz": 58,
      "h": 1.25
    },
    {
      "x": -2785,
      "z": -140,
      "rx": 145,
      "rz": 38,
      "h": 1.25
    },
    {
      "x": 2785,
      "z": 140,
      "rx": 145,
      "rz": 38,
      "h": 1.25
    },
    {
      "x": -1605,
      "z": -38,
      "rx": 58,
      "rz": 36,
      "h": 1.25
    },
    {
      "x": 1605,
      "z": 38,
      "rx": 58,
      "rz": 36,
      "h": 1.25
    },
    {
      "x": -1496,
      "z": 74,
      "rx": 92,
      "rz": 44,
      "h": 1.25
    },
    {
      "x": 1496,
      "z": -74,
      "rx": 92,
      "rz": 44,
      "h": 1.25
    },
    {
      "x": -116,
      "z": 0,
      "rx": 118,
      "rz": 168,
      "h": 1.25
    },
    {
      "x": 116,
      "z": 0,
      "rx": 118,
      "rz": 168,
      "h": 1.25
    },
    {
      "x": -60,
      "z": -400,
      "rx": 36,
      "rz": 28,
      "h": 1.25
    },
    {
      "x": 60,
      "z": -400,
      "rx": 36,
      "rz": 28,
      "h": 1.25
    },
    {
      "x": -60,
      "z": 400,
      "rx": 36,
      "rz": 28,
      "h": 1.25
    },
    {
      "x": 60,
      "z": 400,
      "rx": 36,
      "rz": 28,
      "h": 1.25
    }
  ],
  "spawns": {
    "US_BASE": {
      "x": -1520,
      "z": 0
    },
    "RU_BASE": {
      "x": 1520,
      "z": 0
    }
  },
  "flags": [
    {
      "id": "A",
      "name": "OBJ ALPHA — WEST FRUGIS TOWN CENTER",
      "x": -660,
      "z": -280,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "B",
      "name": "OBJ BRAVO — LOGISTICS DISTRIBUTION CENTER",
      "x": -320,
      "z": 320,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "C",
      "name": "OBJ CHARLIE — MIDTOWN NYC SKYLINE & PLAZA",
      "x": 0,
      "z": 0,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_CHARLIE,
      "useGroundHeight": true
    },
    {
      "id": "D",
      "name": "OBJ DELTA — HIGHLAND TOWN CENTER",
      "x": 330,
      "z": -320,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "E",
      "name": "OBJ ECHO — EAST DISTRIBUTION CENTER",
      "x": 660,
      "z": 280,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    }
  ],
  "buildings": [
    [-1226, -20, 12, 10, 3, "darkConcrete"],
    [-1226, 8, 11, 9, 3, "concrete"],
    [-1246, -18, 11, 9, 2, "concrete"],
    [-1246, 8, 11, 9, 2, "darkConcrete"],
    [1212, 6, 12, 10, 3, "darkConcrete"],
    [1212, -20, 11, 9, 3, "concrete"],
    [1232, 6, 11, 9, 2, "concrete"],
    [1232, -18, 11, 9, 2, "darkConcrete"],
    [-854, -18, 11, 9, 3, "concrete"],
    [-872, -18, 11, 9, 3, "brick"],
    [-872, 8, 11, 9, 2, "darkConcrete"],
    [844, 8, 11, 9, 3, "concrete"],
    [862, 8, 11, 9, 3, "brick"],
    [862, -18, 11, 9, 2, "darkConcrete"],

    // ─── OBJECTIVE A (-660, -280 / gx=-528, gz=-224): WEST FRUGIS TOWN CENTER (16 Buildings framing Civic Square) ───
    [-536, -268, 16, 12, 6, "brick"],
    [-566, -266, 12, 10, 4, "concrete"],
    [-504, -266, 12, 10, 4, "concrete"],
    [-536, -192, 16, 12, 4, "brick"],
    [-566, -192, 12, 10, 4, "darkConcrete"],
    [-504, -192, 12, 10, 4, "brick"],
    [-572, -242, 12, 11, 5, "brick"],
    [-572, -216, 12, 11, 4, "concrete"],
    [-496, -242, 12, 11, 5, "concrete"],
    [-496, -216, 12, 11, 4, "brick"],
    [-600, -266, 12, 10, 3, "brick"],
    [-600, -230, 12, 10, 4, "concrete"],
    [-600, -194, 12, 10, 3, "darkConcrete"],
    [-468, -266, 12, 10, 3, "concrete"],
    [-468, -230, 12, 10, 4, "brick"],
    [-468, -194, 12, 10, 3, "brick"],

    // ─── OBJECTIVE B (-320, +320 / gx=-256, gz=+256): LOGISTICS DISTRIBUTION CENTER (8 Fulfillment Halls & Dispatch Offices) ───
    [-292, 288, 20, 18, 3, "darkConcrete"],
    [-242, 288, 20, 18, 3, "concrete"],
    [-292, 206, 20, 18, 3, "concrete"],
    [-242, 206, 20, 18, 3, "darkConcrete"],
    [-318, 240, 14, 12, 5, "darkConcrete"],
    [-318, 268, 12, 10, 3, "brick"],
    [-208, 240, 14, 12, 5, "concrete"],
    [-208, 268, 12, 10, 3, "brick"],

    // ─── OBJECTIVE C (0, 0): MIDTOWN MANHATTAN / NEW YORK CITY AVENUE & SKYLINE GRID (28 Towers & Corner Mid-Rises!) ───
    // West Manhattan — Riverfront Skyline Avenue (gx = -58..-55, roomy 27.5m×25m+ UH-60M rooftop helipads, <=18F!)
    [-58, -35, 24, 20, 18, "darkConcrete"],
    [-58, 15, 24, 20, 17, "concrete"],
    [-56, -66, 21, 18, 15, "brick"],
    [-56, 48, 22, 20, 16, "darkConcrete"],
    [-55, -98, 20, 18, 11, "concrete"],
    [-55, 80, 20, 18, 12, "brick"],
    // West Manhattan — 5th Avenue / Rockefeller Core (gx = -97..-95)
    [-97, -35, 23, 20, 18, "concrete"],
    [-97, 15, 23, 20, 16, "darkConcrete"],
    [-95, -66, 20, 18, 13, "brick"],
    [-95, 48, 20, 18, 14, "concrete"],
    [-95, -98, 20, 18, 9, "brick"],
    [-95, 80, 20, 18, 10, "darkConcrete"],
    // West Manhattan — 7th Avenue / Hell's Kitchen Brownstones (gx = -136)
    [-136, -34, 21, 19, 12, "brick"],
    [-136, 15, 21, 19, 11, "darkConcrete"],
    [-135, -66, 20, 18, 8, "concrete"],
    [-135, 48, 20, 18, 8, "brick"],
    // East Midtown — Riverfront UN / Chrysler Row (gx = +34, roomy 27.5m×25m+ UH-60M rooftop helipads!)
    [34, 15, 24, 20, 18, "darkConcrete"],
    [34, -35, 24, 20, 17, "concrete"],
    [35, -66, 22, 20, 16, "concrete"],
    [35, 48, 21, 18, 15, "brick"],
    [35, -98, 20, 18, 12, "darkConcrete"],
    [35, 80, 20, 18, 11, "concrete"],
    // East Midtown — Lexington / MetLife Core (gx = +74)
    [74, 15, 23, 20, 18, "concrete"],
    [74, -35, 23, 20, 16, "darkConcrete"],
    [75, -66, 20, 18, 13, "brick"],
    [75, 48, 20, 18, 14, "darkConcrete"],
    [75, -98, 20, 18, 10, "brick"],
    [75, 80, 20, 18, 9, "concrete"],
    // East Midtown — Park Avenue Outer Commercial Row (gx = +115)
    [115, -34, 21, 19, 11, "concrete"],
    [115, 15, 21, 19, 12, "brick"],
    [115, -66, 20, 18, 8, "brick"],
    [115, 48, 20, 18, 8, "darkConcrete"],

    // ─── OBJECTIVE D (+330, -320 / gx=+264, gz=-256): HIGHLAND GARRISON TOWN CENTER (16 Town Square Buildings) ───
    [256, -300, 16, 12, 6, "concrete"],
    [226, -298, 12, 10, 4, "brick"],
    [288, -298, 12, 10, 4, "darkConcrete"],
    [256, -224, 16, 12, 4, "brick"],
    [226, -224, 12, 10, 4, "concrete"],
    [288, -224, 12, 10, 4, "brick"],
    [220, -274, 12, 11, 5, "brick"],
    [220, -248, 12, 11, 4, "darkConcrete"],
    [296, -274, 12, 11, 5, "darkConcrete"],
    [296, -248, 12, 11, 4, "brick"],
    [192, -296, 12, 10, 3, "concrete"],
    [192, -260, 12, 10, 4, "brick"],
    [192, -224, 12, 10, 3, "concrete"],
    [324, -296, 12, 10, 3, "brick"],
    [324, -260, 12, 10, 4, "concrete"],
    [324, -224, 12, 10, 3, "darkConcrete"],

    // ─── OBJECTIVE E (+660, +280 / gx=+528, gz=+224): EAST REGIONAL DISTRIBUTION CENTER (8 Distribution Halls & Control Towers) ───
    [492, 256, 20, 18, 3, "concrete"],
    [542, 256, 20, 18, 3, "darkConcrete"],
    [492, 174, 20, 18, 3, "darkConcrete"],
    [542, 174, 20, 18, 3, "concrete"],
    [466, 208, 14, 12, 5, "brick"],
    [466, 236, 12, 10, 3, "concrete"],
    [576, 208, 14, 12, 5, "darkConcrete"],
    [576, 236, 12, 10, 3, "brick"],

    [-522, 210, 13, 10, 4, "brick"],
    [-502, 218, 11, 9, 3, "concrete"],
    [-540, 214, 11, 9, 3, "darkConcrete"],
    [504, -224, 13, 10, 4, "brick"],
    [522, -214, 11, 9, 3, "concrete"],
    [486, -220, 11, 9, 3, "darkConcrete"],
    [-50, 316, 12, 10, 3, "brick"],
    [38, 316, 12, 10, 3, "concrete"],
    [-50, -326, 12, 10, 3, "concrete"],
    [38, -326, 12, 10, 3, "brick"],
    [-636, -20, 12, 10, 3, "brick"],
    [624, 12, 12, 10, 3, "brick"],
    [-296, -124, 12, 10, 3, "concrete"],
    [282, 112, 12, 10, 3, "concrete"]
  ],
  "watchtowers": [
    [-1206, 14],
    [-1206, -16],
    [1204, -16],
    [1204, 14],
    [-842, 10],
    [840, -12],
    [-510, -216],
    [-256, 276],
    [-218, 224],
    [-34, 42],
    [30, -46],
    [528, 246],
    [484, 198]
  ],
  "hescoBastions": [
    [
      -1196,
      -14,
      24,
      false
    ],
    [
      1196,
      -10,
      24,
      false
    ],
    [
      -846,
      -6,
      12,
      true
    ],
    [
      842,
      6,
      12,
      true
    ],
    [
      -532,
      -224,
      10,
      true
    ],
    [
      -258,
      238,
      12,
      true
    ],
    [
      246,
      -252,
      12,
      false
    ],
    [
      258,
      -238,
      14,
      true
    ],
    [
      524,
      212,
      12,
      true
    ],
    [
      -444,
      -8,
      12,
      false
    ],
    [
      444,
      -8,
      12,
      false
    ]
  ],
  "sandbagBunkers": [
    [
      -527,
      -224
    ],
    [
      -255,
      256
    ],
    [
      -15,
      0
    ],
    [
      15,
      0
    ],
    [
      264,
      -256
    ],
    [
      528,
      226
    ],
    [
      -510,
      208
    ],
    [
      510,
      -208
    ],
    [
      -41,
      320
    ],
    [
      41,
      320
    ],
    [
      -41,
      -320
    ],
    [
      41,
      -320
    ],
    [
      -178,
      0
    ],
    [
      178,
      0
    ]
  ],
  "shippingContainers": [
    [-1212, 10, true, "containerBlue", 0],
    [-1212, -12, true, "containerOlive", 0],
    [1206, -12, true, "containerRed", 0],
    [1206, 10, true, "containerOlive", 0],
    [-850, 8, true, "containerBlue", 0],
    [846, -10, true, "containerRed", 0],

    // ─── FOB B (-320, +320 / gx=-256, gz=+256): INTERMODAL DISTRIBUTION CENTER CONTAINER STACKS ───
    [-286, 236, true, "containerRed", 0],
    [-286, 236, true, "containerBlue", 3],
    [-286, 248, true, "containerOlive", 0],
    [-286, 266, true, "containerBlue", 0],
    [-286, 266, true, "containerRed", 3],
    [-274, 236, true, "containerBlue", 0],
    [-274, 266, true, "containerOlive", 0],
    [-274, 266, true, "containerBlue", 3],
    [-242, 236, true, "containerOlive", 0],
    [-242, 236, true, "containerRed", 3],
    [-242, 266, true, "containerRed", 0],
    [-230, 236, true, "containerBlue", 0],
    [-230, 236, true, "containerOlive", 3],
    [-230, 248, true, "containerRed", 0],
    [-230, 266, true, "containerOlive", 0],
    [-230, 266, true, "containerBlue", 3],

    // ─── FOB E (+660, +280 / gx=+528, gz=+224): EAST REGIONAL DISTRIBUTION CENTER CONTAINER BAYS ───
    [498, 204, true, "containerBlue", 0],
    [498, 204, true, "containerRed", 3],
    [498, 218, true, "containerOlive", 0],
    [498, 236, true, "containerRed", 0],
    [498, 236, true, "containerBlue", 3],
    [510, 204, true, "containerOlive", 0],
    [510, 236, true, "containerBlue", 0],
    [510, 236, true, "containerOlive", 3],
    [544, 204, true, "containerRed", 0],
    [544, 204, true, "containerBlue", 3],
    [544, 236, true, "containerOlive", 0],
    [556, 204, true, "containerBlue", 0],
    [556, 204, true, "containerRed", 3],
    [556, 218, true, "containerRed", 0],
    [556, 236, true, "containerBlue", 0],
    [556, 236, true, "containerOlive", 3],

    // ─── NYC OUTER FREIGHT & HIGHWAY CHECKPOINTS ───
    [-136, -96, true, "containerBlue", 0],
    [116, 82, true, "containerRed", 0],
    [-332, 9, true, "containerOlive", 0],
    [326, -12, true, "containerRed", 0]
  ],
  "radarTowers": [
    [
      354,
      -402
    ],
    [
      306,
      -402
    ]
  ],
  "powerTowers": [
    [
      -1120,
      -168
    ],
    [
      -760,
      -158
    ],
    [
      -420,
      -148
    ],
    [
      -132,
      -138
    ],
    [
      132,
      -138
    ],
    [
      420,
      -148
    ],
    [
      760,
      -158
    ],
    [
      1120,
      -168
    ],
    [
      -168,
      162
    ],
    [
      168,
      162
    ]
  ],
  "ammoCrates": [
    [
      -1510,
      -4
    ],
    [
      -1490,
      8
    ],
    [
      1510,
      4
    ],
    [
      1490,
      -8
    ],
    [
      -1055,
      -4
    ],
    [
      1055,
      4
    ],
    [
      -656,
      -276
    ],
    [
      -317,
      317
    ],
    [
      -4,
      3
    ],
    [
      6,
      -3
    ],
    [
      327,
      -317
    ],
    [
      656,
      276
    ],
    [
      -636,
      266
    ],
    [
      636,
      -266
    ]
  ],
  "treeCoords": [
    [
      -1359,
      143
    ],
    [
      -1296,
      154
    ],
    [
      -1201,
      -305
    ],
    [
      -1122,
      203
    ],
    [
      -1011,
      -146
    ],
    [
      -916,
      178
    ],
    [
      -822,
      -178
    ],
    [
      -727,
      138
    ],
    [
      -679,
      -105
    ],
    [
      -537,
      73
    ],
    [
      -450,
      -316
    ],
    [
      -419,
      305
    ],
    [
      -395,
      -381
    ],
    [
      -371,
      373
    ],
    [
      -348,
      -89
    ],
    [
      -340,
      348
    ],
    [
      -308,
      -389
    ],
    [
      -269,
      381
    ],
    [
      -253,
      -356
    ],
    [
      -229,
      -62
    ],
    [
      -221,
      78
    ],
    [
      -205,
      373
    ],
    [
      -197,
      -340
    ],
    [
      -174,
      133
    ],
    [
      -150,
      -381
    ],
    [
      -134,
      -138
    ],
    [
      -111,
      397
    ],
    [
      -87,
      -364
    ],
    [
      -76,
      149
    ],
    [
      -66,
      -154
    ],
    [
      -51,
      381
    ],
    [
      -44,
      -389
    ],
    [
      44,
      389
    ],
    [
      51,
      -381
    ],
    [
      66,
      154
    ],
    [
      76,
      -149
    ],
    [
      87,
      365
    ],
    [
      111,
      -397
    ],
    [
      134,
      138
    ],
    [
      150,
      381
    ],
    [
      174,
      -133
    ],
    [
      198,
      340
    ],
    [
      205,
      -373
    ],
    [
      221,
      -78
    ],
    [
      229,
      62
    ],
    [
      253,
      356
    ],
    [
      269,
      -381
    ],
    [
      308,
      389
    ],
    [
      340,
      -348
    ],
    [
      348,
      89
    ],
    [
      371,
      -373
    ],
    [
      395,
      381
    ],
    [
      419,
      -305
    ],
    [
      450,
      316
    ],
    [
      537,
      -73
    ],
    [
      679,
      105
    ],
    [
      727,
      -138
    ],
    [
      822,
      178
    ],
    [
      916,
      -178
    ],
    [
      1011,
      146
    ],
    [
      1122,
      -202
    ],
    [
      1201,
      227
    ],
    [
      1296,
      -154
    ],
    [
      1359,
      138
    ],
    [
      -758,
      -356
    ],
    [
      -758,
      356
    ],
    [
      758,
      -356
    ],
    [
      758,
      356
    ],
    [
      -490,
      41
    ],
    [
      490,
      -40
    ],
    [
      -225,
      -145
    ],
    [
      225,
      145
    ],
    [
      -427,
      -267
    ],
    [
      427,
      267
    ],
    [
      -174,
      300
    ],
    [
      174,
      -300
    ],
    [
      -869,
      -89
    ],
    [
      869,
      89
    ],
    [
      -869,
      73
    ],
    [
      869,
      -73
    ],
    [
      -1320,
      180
    ],
    [
      -1260,
      -220
    ],
    [
      -1180,
      260
    ],
    [
      -1120,
      -290
    ],
    [
      -980,
      210
    ],
    [
      -920,
      -240
    ],
    [
      -840,
      340
    ],
    [
      -780,
      -360
    ],
    [
      -540,
      380
    ],
    [
      -490,
      -390
    ],
    [
      -210,
      440
    ],
    [
      -180,
      -450
    ],
    [
      180,
      450
    ],
    [
      210,
      -440
    ],
    [
      490,
      390
    ],
    [
      540,
      -380
    ],
    [
      780,
      360
    ],
    [
      840,
      -340
    ],
    [
      920,
      240
    ],
    [
      980,
      -210
    ],
    [
      1120,
      290
    ],
    [
      1180,
      -260
    ],
    [
      1260,
      220
    ],
    [
      1320,
      -180
    ]
  ]
};
