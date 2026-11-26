// ============================================================================
// MAP DEFINITION: FRUGIS RIVER VALLEY (7,600m x 5,200m Grand Combined-Arms Theater)
// All 5 Forward Operating Bases (A-E) start NEUTRAL (0%) for fair Conquest starts.
// ============================================================================

import { TERRAIN } from '../config.js?v=136';

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
      "rx": 64,
      "rz": 54,
      "h": 2.5
    },
    {
      "x": -320,
      "z": 320,
      "rx": 60,
      "rz": 52,
      "h": 1.25
    },
    {
      "x": 0,
      "z": 0,
      "rx": 66,
      "rz": 56,
      "h": 1.25
    },
    {
      "x": 330,
      "z": -320,
      "rx": 64,
      "rz": 54,
      "h": 6.25
    },
    {
      "x": 660,
      "z": 280,
      "rx": 64,
      "rz": 54,
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
      "x": -82,
      "z": 0,
      "rx": 88,
      "rz": 105,
      "h": 1.25
    },
    {
      "x": 82,
      "z": 0,
      "rx": 88,
      "rz": 105,
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
      "name": "OBJ ALPHA — WEST FRUGIS TOWN",
      "x": -660,
      "z": -280,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "B",
      "name": "OBJ BRAVO — LOGISTICS CONTAINER YARD",
      "x": -320,
      "z": 320,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "C",
      "name": "OBJ CHARLIE — DOWNTOWN SKYLINE & BRIDGE PLAZA",
      "x": 0,
      "z": 0,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_CHARLIE,
      "useGroundHeight": true
    },
    {
      "id": "D",
      "name": "OBJ DELTA — RADAR HILL GARRISON",
      "x": 330,
      "z": -320,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    },
    {
      "id": "E",
      "name": "OBJ ECHO — EAST INDUSTRIAL SECTOR",
      "x": 660,
      "z": 280,
      "owner": "NEUTRAL",
      "captureProgress": 0,
      "radius": TERRAIN.FLAG_RADIUS_DEFAULT,
      "useGroundHeight": false
    }
  ],
  "buildings": [
    [
      -1224,
      -14,
      9,
      7,
      2,
      "darkConcrete"
    ],
    [
      -1224,
      8,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -1238,
      -12,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -1238,
      6,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      1214,
      6,
      9,
      7,
      2,
      "darkConcrete"
    ],
    [
      1214,
      -16,
      8,
      6,
      2,
      "concrete"
    ],
    [
      1228,
      6,
      8,
      6,
      2,
      "concrete"
    ],
    [
      1228,
      -14,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -854,
      -14,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -866,
      -14,
      8,
      6,
      2,
      "brick"
    ],
    [
      -866,
      10,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      846,
      8,
      8,
      6,
      2,
      "concrete"
    ],
    [
      858,
      8,
      8,
      6,
      2,
      "brick"
    ],
    [
      858,
      -16,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -544,
      -236,
      10,
      7,
      3,
      "brick"
    ],
    [
      -528,
      -238,
      9,
      7,
      4,
      "concrete"
    ],
    [
      -514,
      -232,
      8,
      7,
      3,
      "brick"
    ],
    [
      -540,
      -218,
      9,
      6,
      3,
      "concrete"
    ],
    [
      -524,
      -216,
      8,
      6,
      2,
      "brick"
    ],
    [
      -514,
      -220,
      7,
      6,
      2,
      "darkConcrete"
    ],
    [
      -556,
      -232,
      8,
      6,
      3,
      "concrete"
    ],
    [
      -556,
      -218,
      8,
      6,
      2,
      "brick"
    ],
    [
      -542,
      -206,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -526,
      -204,
      8,
      6,
      3,
      "brick"
    ],
    [
      -502,
      -234,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -502,
      -220,
      8,
      6,
      3,
      "brick"
    ],
    [
      -270,
      254,
      10,
      7,
      3,
      "darkConcrete"
    ],
    [
      -248,
      260,
      9,
      6,
      2,
      "concrete"
    ],
    [
      -262,
      266,
      8,
      6,
      2,
      "brick"
    ],
    [
      -254,
      240,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -282,
      252,
      8,
      6,
      3,
      "concrete"
    ],
    [
      -282,
      264,
      8,
      6,
      2,
      "brick"
    ],
    [
      -274,
      238,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -236,
      258,
      8,
      6,
      3,
      "darkConcrete"
    ],
    [
      -236,
      244,
      8,
      6,
      2,
      "brick"
    ],
    [
      -248,
      272,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -59,
      -36,
      22,
      20,
      16,
      "darkConcrete"
    ],
    [
      -57,
      17,
      20,
      18,
      14,
      "concrete"
    ],
    [
      -92,
      -34,
      18,
      16,
      12,
      "concrete"
    ],
    [
      -92,
      18,
      18,
      16,
      11,
      "darkConcrete"
    ],
    [
      -66,
      -66,
      18,
      16,
      10,
      "brick"
    ],
    [
      -66,
      50,
      18,
      16,
      10,
      "brick"
    ],
    [
      38,
      17,
      22,
      20,
      16,
      "darkConcrete"
    ],
    [
      38,
      -34,
      20,
      18,
      14,
      "concrete"
    ],
    [
      75,
      -34,
      18,
      16,
      11,
      "darkConcrete"
    ],
    [
      75,
      18,
      18,
      16,
      12,
      "concrete"
    ],
    [
      49,
      -66,
      18,
      16,
      10,
      "brick"
    ],
    [
      49,
      50,
      18,
      16,
      10,
      "brick"
    ],
    [
      252,
      -262,
      10,
      7,
      3,
      "darkConcrete"
    ],
    [
      268,
      -254,
      9,
      7,
      3,
      "concrete"
    ],
    [
      256,
      -244,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      262,
      -268,
      8,
      6,
      2,
      "brick"
    ],
    [
      268,
      -242,
      8,
      6,
      2,
      "concrete"
    ],
    [
      240,
      -260,
      8,
      6,
      3,
      "concrete"
    ],
    [
      242,
      -244,
      8,
      6,
      2,
      "brick"
    ],
    [
      280,
      -256,
      8,
      6,
      3,
      "darkConcrete"
    ],
    [
      280,
      -242,
      8,
      6,
      2,
      "brick"
    ],
    [
      250,
      -274,
      8,
      6,
      2,
      "concrete"
    ],
    [
      276,
      -270,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      516,
      216,
      10,
      7,
      4,
      "brick"
    ],
    [
      532,
      220,
      9,
      7,
      3,
      "concrete"
    ],
    [
      520,
      232,
      9,
      6,
      3,
      "brick"
    ],
    [
      536,
      234,
      8,
      6,
      3,
      "darkConcrete"
    ],
    [
      508,
      226,
      8,
      6,
      2,
      "concrete"
    ],
    [
      530,
      210,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      496,
      216,
      8,
      6,
      3,
      "concrete"
    ],
    [
      496,
      230,
      8,
      6,
      2,
      "brick"
    ],
    [
      548,
      220,
      8,
      6,
      3,
      "brick"
    ],
    [
      548,
      234,
      8,
      6,
      2,
      "concrete"
    ],
    [
      516,
      204,
      8,
      6,
      2,
      "brick"
    ],
    [
      542,
      208,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -518,
      212,
      9,
      7,
      3,
      "brick"
    ],
    [
      -504,
      218,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -532,
      214,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      506,
      -220,
      9,
      7,
      3,
      "brick"
    ],
    [
      518,
      -214,
      8,
      6,
      2,
      "concrete"
    ],
    [
      492,
      -218,
      8,
      6,
      2,
      "darkConcrete"
    ],
    [
      -47,
      316,
      8,
      6,
      2,
      "brick"
    ],
    [
      39,
      316,
      8,
      6,
      2,
      "concrete"
    ],
    [
      -47,
      -324,
      8,
      6,
      2,
      "concrete"
    ],
    [
      39,
      -324,
      8,
      6,
      2,
      "brick"
    ],
    [
      -634,
      -18,
      8,
      6,
      2,
      "brick"
    ],
    [
      626,
      12,
      8,
      6,
      2,
      "brick"
    ],
    [
      -294,
      -121,
      8,
      6,
      2,
      "concrete"
    ],
    [
      282,
      112,
      8,
      6,
      2,
      "concrete"
    ]
  ],
  "watchtowers": [
    [
      -1206,
      14
    ],
    [
      -1206,
      -16
    ],
    [
      1204,
      -16
    ],
    [
      1204,
      14
    ],
    [
      -842,
      10
    ],
    [
      840,
      -12
    ],
    [
      -510,
      -216
    ],
    [
      -240,
      244
    ],
    [
      -34,
      42
    ],
    [
      30,
      -46
    ],
    [
      508,
      214
    ]
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
    [
      -1212,
      10,
      true,
      "containerBlue",
      0
    ],
    [
      -1212,
      -12,
      true,
      "containerOlive",
      0
    ],
    [
      1206,
      -12,
      true,
      "containerRed",
      0
    ],
    [
      1206,
      10,
      true,
      "containerOlive",
      0
    ],
    [
      -850,
      8,
      true,
      "containerBlue",
      0
    ],
    [
      846,
      -10,
      true,
      "containerRed",
      0
    ],
    [
      -262,
      244,
      true,
      "containerRed",
      0
    ],
    [
      -262,
      244,
      true,
      "containerBlue",
      3
    ],
    [
      -252,
      246,
      false,
      "containerOlive",
      0
    ],
    [
      -244,
      250,
      true,
      "containerRed",
      0
    ],
    [
      -244,
      250,
      true,
      "containerOlive",
      3
    ],
    [
      274,
      -266,
      true,
      "containerOlive",
      0
    ],
    [
      -332,
      9,
      true,
      "containerOlive",
      0
    ],
    [
      326,
      -12,
      true,
      "containerRed",
      0
    ]
  ],
  "radarTowers": [
    [
      344,
      -332
    ],
    [
      312,
      -338
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
      -142,
      -73
    ],
    [
      142,
      73
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
