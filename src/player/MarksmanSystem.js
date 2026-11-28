// ============================================================================
// SNIPER MARKSMAN DIFFICULTY, BADGES, TITLES & BALLISTIC LRF ENGINE
// (src/player/MarksmanSystem.js)
// - Physics-based Shot Difficulty grading (Distance, Gravity Drop, Moving Lead,
//   Elevation Angle, Anatomical Hit Zone, Cover Penetration, Collateral, Stance)
// - Tiered Metallic Badges (Bronze -> Silver -> Gold -> Platinum -> Mythic Diamond)
//   + Situational Feat Ribbons & Consecutive Deadeye Sniper Streaks
// - 8 Progressive Earned Marksman Titles persisted to localStorage
// - Exact Ballistic Solution & Laser Rangefinder (LRF) Auto-Zero Calculator
// ============================================================================

const STORAGE_KEY = 'bb_marksman_profile_v1';

export const MARKSMAN_TIERS = [
  {
    grade: 'C',
    id: 'marksman_hit',
    badgeName: 'MARKSMAN',
    color: '#74b9ff',
    accent: '#0984e3',
    minScore: 0,
    icon: '🎯'
  },
  {
    grade: 'B',
    id: 'sharpshooter',
    badgeName: 'SHARPSHOOTER',
    color: '#e69d5c',
    accent: '#cd7f32',
    minScore: 150,
    icon: '🥉'
  },
  {
    grade: 'A',
    id: 'deadeye',
    badgeName: 'DEADEYE',
    color: '#dfe6e9',
    accent: '#95a5a6',
    minScore: 280,
    icon: '🥈'
  },
  {
    grade: 'S',
    id: 'eagle_eye',
    badgeName: 'EAGLE EYE',
    color: '#ffd32a',
    accent: '#f39c12',
    minScore: 440,
    icon: '🥇'
  },
  {
    grade: 'S+',
    id: 'ghost_marksman',
    badgeName: 'GHOST MARKSMAN',
    color: '#00d2d3',
    accent: '#00a8a8',
    minScore: 650,
    icon: '💠'
  },
  {
    grade: '★',
    id: 'god_shot',
    badgeName: 'MYTHIC GOD-SHOT',
    color: '#ff6b81',
    accent: '#7ef9ff',
    minScore: 900,
    icon: '👑'
  }
];

export const MARKSMAN_TITLES = [
  {
    rank: 1,
    id: 'scout_spotter',
    title: 'SCOUT SPOTTER',
    icon: '📡',
    color: '#74b9ff',
    check: (p) => p.lrfSpots >= 3 || p.longestShotM >= 90 || p.totalMarksmanHits >= 2
  },
  {
    rank: 2,
    id: 'sharpshooter',
    title: 'SHARPSHOOTER',
    icon: '🥉',
    color: '#e69d5c',
    check: (p) =>
      p.totalMarksmanKills >= 1 &&
      (p.longestKillM >= 140 || p.bestDifficulty >= 165 || p.totalMarksmanKills >= 3)
  },
  {
    rank: 3,
    id: 'deadeye',
    title: 'DEADEYE',
    icon: '🥈',
    color: '#dfe6e9',
    check: (p) =>
      p.totalMarksmanKills >= 1 &&
      (p.longestHeadshotM >= 200 || p.bestDifficulty >= 290 || p.bestStreak >= 3)
  },
  {
    rank: 4,
    id: 'counter_sniper',
    title: 'COUNTER-SNIPER',
    icon: '🔭',
    color: '#a29bfe',
    check: (p) => p.totalMarksmanKills >= 1 && (p.counterSnipes >= 3 || p.longestKillM >= 265)
  },
  {
    rank: 5,
    id: 'eagle_eye',
    title: 'EAGLE EYE',
    icon: '🥇',
    color: '#ffd32a',
    check: (p) => p.totalMarksmanKills >= 1 && (p.longestKillM >= 320 || p.bestDifficulty >= 440)
  },
  {
    rank: 6,
    id: 'ghost_recon',
    title: 'GHOST RECON',
    icon: '👻',
    color: '#00d2d3',
    check: (p) =>
      p.totalMarksmanKills >= 1 &&
      (p.bestStreak >= 5 || p.longestKillM >= 390 || p.bestDifficulty >= 650)
  },
  {
    rank: 7,
    id: 'white_death',
    title: 'WHITE DEATH',
    icon: '❄️',
    color: '#81ecec',
    check: (p) =>
      p.totalMarksmanKills >= 1 &&
      (p.ironSightLongshots >= 1 || p.bestStreak >= 8 || p.totalHeadshots >= 20)
  },
  {
    rank: 8,
    id: 'mythic_longshot',
    title: 'MYTHIC LONGSHOT',
    icon: '👑',
    color: '#ff6b81',
    check: (p) => p.totalMarksmanKills >= 1 && (p.longestKillM >= 480 || p.bestDifficulty >= 900)
  }
];

const PRECISION_WEAPON_IDS = new Set([
  'sv98',
  'm40a5',
  'dvl10',
  'awm',
  'm200_intervention',
  'barrett_m82',
  'gm6_lynx',
  'ntw20',
  'mk14',
  'sr25',
  'deagle',
  'warbow',
  'heavy_crossbow'
]);

export const PLAYSTYLE_TITLES = [
  {
    id: 'sharpshooter',
    title: 'SHARPSHOOTER',
    icon: '🎯',
    color: '#ffd32a'
  },
  {
    id: 'ace_pilot',
    title: 'ACE PILOT',
    icon: '✈️',
    color: '#48dbfb'
  },
  {
    id: 'tank_buster',
    title: 'TANK BUSTER',
    icon: '💥',
    color: '#f39c12'
  },
  {
    id: 'lifesaver',
    title: 'LIFESAVER',
    icon: '⚕️',
    color: '#2ecc71'
  },
  {
    id: 'attacker',
    title: 'ATTACKER',
    icon: '⚔️',
    color: '#ff6b81'
  },
  {
    id: 'defender',
    title: 'DEFENDER',
    icon: '🛡️',
    color: '#00d2d3'
  },
  {
    id: 'braveheart',
    title: 'BRAVEHEART',
    icon: '🦁',
    color: '#ff9f43'
  },
  {
    id: 'camper',
    title: 'ROOFTOP CAMPER',
    icon: '🏕️',
    color: '#a29bfe'
  }
];

/**
 * Computes a live dynamic Playstyle / Combat Reputation Title for either the Human Player
 * (honoring `profile.pinnedTitleId` if pinned, or `AUTO` based on live match actions) or any AI Bot!
 */
export function resolveUnitPlaystyleTitle(unit, profile = null) {
  if (!unit) return null;
  if (profile && profile.pinnedTitleId && profile.pinnedTitleId !== 'auto') {
    const pinnedPlay = PLAYSTYLE_TITLES.find((t) => t.id === profile.pinnedTitleId);
    if (pinnedPlay) return pinnedPlay;
    const pinnedMark = MARKSMAN_TITLES.find((t) => t.id === profile.pinnedTitleId);
    if (pinnedMark) {
      return { id: pinnedMark.id, title: pinnedMark.title, icon: pinnedMark.icon, color: pinnedMark.color };
    }
  }

  const planes = unit.planesDestroyed || 0;
  const pilotMissions = unit.pilotMissionsCompleted || 0;
  const tanks = unit.tanksDestroyed || 0;
  const vehs = unit.vehiclesDestroyed || planes + tanks + (unit.carsDestroyed || 0);
  const revives = unit.revives || 0;
  const captures = unit.captures || 0;
  const kills = unit.kills || 0;
  const deaths = unit.deaths || 0;
  const camperKills = unit.camperKills || 0;
  const defKills = unit.defenderKills || 0;
  const roleUpper = String(unit.role || '').toUpperCase();

  if (planes >= 2 || pilotMissions >= 1 || (roleUpper === 'PILOT' && (planes >= 1 || kills >= 3))) {
    return PLAYSTYLE_TITLES[1]; // ACE PILOT
  }
  if (tanks >= 2 || vehs >= 3 || (tanks >= 1 && roleUpper === 'ENGINEER')) {
    return PLAYSTYLE_TITLES[2]; // TANK BUSTER
  }
  if (revives >= 3 || (roleUpper === 'MEDIC' && revives >= 2)) {
    return PLAYSTYLE_TITLES[3]; // LIFESAVER
  }
  if (camperKills >= 3 || (roleUpper === 'RECON' && kills >= 4 && deaths === 0 && captures === 0)) {
    return PLAYSTYLE_TITLES[7]; // ROOFTOP CAMPER
  }
  if (profile && profile.activeTitle && (profile.totalMarksmanKills >= 2 || roleUpper === 'RECON')) {
    return {
      id: 'marksman_earned',
      title: profile.activeTitle,
      icon: profile.activeTitleIcon || '🎯',
      color: profile.activeTitleColor || '#ffd32a'
    };
  }
  if (roleUpper === 'RECON' && kills >= 2) {
    return PLAYSTYLE_TITLES[0]; // SHARPSHOOTER
  }
  if (captures >= 2 && kills >= 2) {
    return PLAYSTYLE_TITLES[4]; // ATTACKER
  }
  if (defKills >= 3 || (unit.isGarrisonDefender && kills >= 2)) {
    return PLAYSTYLE_TITLES[5]; // DEFENDER
  }
  if (kills >= 5 && deaths <= Math.max(1, Math.floor(kills * 0.35))) {
    return PLAYSTYLE_TITLES[6]; // BRAVEHEART
  }
  if (captures >= 1) {
    return PLAYSTYLE_TITLES[4]; // ATTACKER
  }
  if (revives >= 1) {
    return PLAYSTYLE_TITLES[3]; // LIFESAVER
  }
  return null;
}

export function createDefaultMarksmanProfile() {
  return {
    longestShotM: 0,
    longestKillM: 0,
    longestHeadshotM: 0,
    bestDifficulty: 0,
    bestStreak: 0,
    totalMarksmanKills: 0,
    totalMarksmanHits: 0,
    totalHeadshots: 0,
    counterSnipes: 0,
    ironSightLongshots: 0,
    lrfSpots: 0,
    unlockedRank: 0,
    activeTitle: null,
    activeTitleIcon: '',
    activeTitleColor: '#74b9ff'
  };
}

export function loadMarksmanProfile() {
  const base = createDefaultMarksmanProfile();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.assign(base, parsed);
        }
      }
    }
  } catch (_) {}
  syncActiveMarksmanTitle(base);
  return base;
}

export function saveMarksmanProfile(profile) {
  if (!profile) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  } catch (_) {}
}

export function syncActiveMarksmanTitle(profile) {
  if (!profile) return null;
  let prevRank = profile.unlockedRank || 0;
  let highest = null;
  for (let i = 0; i < MARKSMAN_TITLES.length; i++) {
    const t = MARKSMAN_TITLES[i];
    if (t.check(profile)) {
      highest = t;
    }
  }
  let newlyUnlocked = null;
  if (highest && highest.rank > prevRank) {
    profile.unlockedRank = highest.rank;
    newlyUnlocked = highest;
  } else if (prevRank > 0 && (!highest || highest.rank < prevRank)) {
    highest = MARKSMAN_TITLES.find((t) => t.rank === prevRank) || highest;
  }
  if (highest) {
    profile.activeTitle = highest.title;
    profile.activeTitleIcon = highest.icon;
    profile.activeTitleColor = highest.color;
  }
  return newlyUnlocked;
}

export function isPrecisionMarksmanWeapon(wepDef) {
  if (!wepDef) return false;
  if (PRECISION_WEAPON_IDS.has(wepDef.id)) return true;
  if (wepDef.isBoltSniper || wepDef.isBow || wepDef.isCrossbow) return true;
  if (wepDef.soundType === 'sniper' && !wepDef.auto) return true;
  return false;
}

/**
 * Simulates the exact 60Hz discrete ballistic step (`_stepBallisticBullet` + `executeFire` zeroing)
 * along an inclined or level sightline of slant distance `d` and vertical drop `elevDeltaM = shooterY - targetY`:
 * - Matches `vel.y -= g * dt; vel *= (1 - drag * dt); pos += vel * dt` to < 0.01m at 1,500m+!
 * - Returns exact view-space `dropTan = tan(theta_drop)` so the 20x–40x laser pipper lands dead-on headshots!
 */
function simulateExactBallisticArc(d, elevDeltaM, v0, g, drag, zeroDist) {
  const sinPitch = Math.max(-0.85, Math.min(0.85, -elevDeltaM / Math.max(1, d)));
  const cosPitch = Math.sqrt(Math.max(0.04, 1 - sinPitch * sinPitch));
  const zeroElev = (g * zeroDist) / (2 * v0 * v0);

  // Camera forward in (horizX, worldY) = (cosPitch, sinPitch); camera up = (-sinPitch, cosPitch)
  // Launch dir = normalize(camFwd + zeroElev * camUp) — identical to `_firePelletDir.set(0, zeroElev, -1).normalize().applyQuaternion(camQuat)`!
  let lx = cosPitch - zeroElev * sinPitch;
  let ly = sinPitch + zeroElev * cosPitch;
  const lLen = Math.hypot(lx, ly) || 1;
  lx /= lLen;
  ly /= lLen;

  let vx = lx * v0;
  let vy = ly * v0;
  let px = 0;
  let py = 0;
  let t = 0;
  const dt = 1 / 240;
  const damp = Math.max(0.88, 1 - drag * dt);
  let prevProj = 0;
  let prevPerpUp = 0;

  for (let step = 0; step < 1400; step++) {
    prevProj = px * cosPitch + py * sinPitch;
    prevPerpUp = -px * sinPitch + py * cosPitch;
    vy -= g * dt;
    vx *= damp;
    vy *= damp;
    px += vx * dt;
    py += vy * dt;
    t += dt;
    const proj = px * cosPitch + py * sinPitch;
    if (proj >= d) {
      const span = Math.max(1e-4, proj - prevProj);
      const frac = (d - prevProj) / span;
      const curPerpUp = -px * sinPitch + py * cosPitch;
      const interpPerpUp = prevPerpUp + (curPerpUp - prevPerpUp) * frac;
      const exactT = t - dt * (1 - frac);
      const holdoverM = -interpPerpUp; // positive = bullet lands BELOW crosshair
      const dropTan = holdoverM / Math.max(1, d);
      const impactAngleDeg = Number(((Math.atan2(-vy, Math.max(1, Math.abs(vx))) * 180) / Math.PI).toFixed(1));
      return { flightTimeS: exactT, holdoverM, dropTan, impactAngleDeg };
    }
  }
  const finalPerpUp = -px * sinPitch + py * cosPitch;
  return {
    flightTimeS: t,
    holdoverM: -finalPerpUp,
    dropTan: -finalPerpUp / Math.max(1, px * cosPitch + py * sinPitch),
    impactAngleDeg: Number(((Math.atan2(-vy, Math.max(1, Math.abs(vx))) * 180) / Math.PI).toFixed(1))
  };
}

/**
 * Computes exact ballistic flight time, gravity drop, holdover relative to current zero,
 * view-space laser pipper tangent (`dropTan`), and moving-target lead for Binoculars & 20x–40x Smart Scopes.
 */
export function computeBallisticSolution(
  distM,
  elevDeltaM = 0,
  targetSpeedMps = 0,
  wepDef = null,
  currentZeroM = 100
) {
  const d = Math.max(1, Number(distM) || 1);
  const v0 = Math.max(60, wepDef?.muzzleVelocity || 1180);
  const g = typeof wepDef?.bulletGravity === 'number' ? wepDef.bulletGravity : 5.8;
  const drag = wepDef?.isBuckshot ? 0.35 : 0.06;
  const zeroDist = Math.max(25, Number(currentZeroM) || 100);

  const simZeroed = simulateExactBallisticArc(d, elevDeltaM, v0, g, drag, zeroDist);
  const simBore = simulateExactBallisticArc(d, elevDeltaM, v0, g, drag, 0);
  const flightTimeS = simZeroed.flightTimeS;
  const rawGravityDropM = Math.max(0, simBore.holdoverM);
  const holdoverM = simZeroed.holdoverM;
  const holdoverMils = (holdoverM / d) * 1000;
  const leadMeters = Math.max(0, targetSpeedMps) * flightTimeS;
  const horizDist = Math.max(1, Math.sqrt(Math.max(1, d * d - elevDeltaM * elevDeltaM)));
  const elevAngleDeg = Number(((Math.atan2(-elevDeltaM, horizDist) * 180) / Math.PI).toFixed(1));

  // Solve exact `recommendedZeroM` so pressing [F] auto-zeros the crosshair dead-on at `d` (up to 2,500m!)
  const cosPitch = horizDist / Math.max(1, d);
  const exactZeroM = Math.max(
    25,
    Math.min(2500, Math.round((rawGravityDropM * 2 * v0 * v0) / Math.max(0.5, g * d * Math.max(0.25, cosPitch))))
  );

  return {
    distanceM: Number(d.toFixed(1)),
    flightTimeS: Number(flightTimeS.toFixed(2)),
    rawGravityDropM: Number(rawGravityDropM.toFixed(2)),
    holdoverM: Number(holdoverM.toFixed(3)),
    dropTan: simZeroed.dropTan,
    holdoverMils: Number(holdoverMils.toFixed(1)),
    leadMeters: Number(leadMeters.toFixed(2)),
    elevAngleDeg,
    impactAngleDeg: simZeroed.impactAngleDeg,
    recommendedZeroM: exactZeroM
  };
}

/**
 * Maps anatomical hitZone + relative vertical/lateral hit offset onto the 44×58 Soldier Anatomy SVG
 * and returns a crisp anatomical name.
 */
export function resolveAnatomyDiagramTarget(hitZone = 'thorax', relHitY = 1.15, relLateral = 0, isHeadshot = false) {
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  if (isHeadshot || hitZone === 'head') {
    const isUpperCranial = relHitY >= 1.56;
    return {
      zoneKey: 'head',
      partLabel: isUpperCranial ? 'CRANIAL BULLSEYE' : 'HEAD / NECK',
      shortPart: 'HEAD',
      svgX: Number(clamp(22 + relLateral * 10, 18, 26).toFixed(1)),
      svgY: Number(clamp(isUpperCranial ? 7.2 : 10.4, 5, 12).toFixed(1)),
      anatomyMult: 1.58
    };
  }
  if (hitZone === 'leftArm') {
    return {
      zoneKey: 'leftArm',
      partLabel: 'LEFT BRACHIAL / ARM',
      shortPart: 'L.ARM',
      svgX: 10.8,
      svgY: Number(clamp(24 - (relHitY - 1.05) * 18, 17, 31).toFixed(1)),
      anatomyMult: 1.12
    };
  }
  if (hitZone === 'rightArm') {
    return {
      zoneKey: 'rightArm',
      partLabel: 'RIGHT BRACHIAL / ARM',
      shortPart: 'R.ARM',
      svgX: 33.2,
      svgY: Number(clamp(24 - (relHitY - 1.05) * 18, 17, 31).toFixed(1)),
      anatomyMult: 1.12
    };
  }
  if (hitZone === 'leftLeg') {
    return {
      zoneKey: 'leftLeg',
      partLabel: relHitY < 0.45 ? 'LEFT SHIN / KNEE' : 'LEFT FEMORAL',
      shortPart: 'L.LEG',
      svgX: 18.0,
      svgY: Number(clamp(50 - relHitY * 18, 36, 53).toFixed(1)),
      anatomyMult: 1.1
    };
  }
  if (hitZone === 'rightLeg') {
    return {
      zoneKey: 'rightLeg',
      partLabel: relHitY < 0.45 ? 'RIGHT SHIN / KNEE' : 'RIGHT FEMORAL',
      shortPart: 'R.LEG',
      svgX: 26.0,
      svgY: Number(clamp(50 - relHitY * 18, 36, 53).toFixed(1)),
      anatomyMult: 1.1
    };
  }
  const isHeartZone = relHitY >= 1.12;
  return {
    zoneKey: 'thorax',
    partLabel: isHeartZone ? 'HEART / UPPER THORAX' : 'CENTER SPINE / TORSO',
    shortPart: isHeartZone ? 'HEART/THORAX' : 'TORSO',
    svgX: Number(clamp(22 + relLateral * 12, 16.5, 27.5).toFixed(1)),
    svgY: Number(clamp(isHeartZone ? 20.5 : 28.0, 16.5, 31.5).toFixed(1)),
    anatomyMult: isHeartZone ? 1.26 : 1.05
  };
}

/**
 * Evaluates a ballistic hit/kill for Marksman Badges, Difficulty Score, Feat Ribbons,
 * Earned Titles, and 2D Trajectory + Anatomy Replay Card data.
 */
export function evaluateMarksmanShot(params, profile = null) {
  const {
    wepDef = null,
    weaponLabel = 'RIFLE',
    distanceM = 0,
    flightTimeS = 0,
    gravityMps2 = 9.81,
    shooterPos = null,
    impactPos = null,
    damageDealt = 0,
    isKill = false,
    isHeadshot = false,
    oneShotKill = false,
    hitZone = 'thorax',
    relHitY = 1.15,
    relLateral = 0,
    fracturedLimb = null,
    targetSpeedMps = 0,
    targetRole = '',
    penetratedCover = false,
    collateralCount = 1,
    isAds = true,
    useCantedSight = false,
    opticType = null,
    stance = 'STANDING',
    isHoldingBreath = false,
    currentDeadeyeStreak = 0,
    isFriendly = false,
    throughSmoke = false,
    targetInSmoke = false,
    smokeNormPos = 0.65,
    rapidDoubleShot = false,
    wasRescuing = false,
    entryAspect = 'FRONT',
    entryBearingDeg = 0,
    impactAngleDeg = null,
    victimName = 'ENEMY',
    priorVictims = null
  } = params || {};

  // STRICT KILL-ONLY TRIGGER: Merely landing a non-lethal shot (or hitting an ally) NEVER shows the Sniper Card!
  if (!isKill || isFriendly) {
    return { triggered: false };
  }

  if (!wepDef || wepDef.isBuckshot || wepDef.isMountedMg || wepDef.isVenomSpit) {
    return { triggered: false };
  }

  const isPrecision = isPrecisionMarksmanWeapon(wepDef);
  const dist = Math.max(0, Number(distanceM) || 0);
  const hasSmokeFeat = Boolean(throughSmoke || targetInSmoke);
  const multiKillChainCount = Array.isArray(priorVictims) ? priorVictims.length + 1 : Math.max(1, Number(collateralCount) || 1);
  const isDoubleShotFeat = Boolean(multiKillChainCount >= 2 || collateralCount >= 2 || rapidDoubleShot);
  const isMedicTarget = String(targetRole || '').toUpperCase() === 'MEDIC';

  // Kill eligibility rules:
  let eligible = false;
  if (isPrecision) {
    eligible =
      dist >= 20 ||
      hasSmokeFeat ||
      isDoubleShotFeat ||
      isMedicTarget ||
      isHeadshot ||
      penetratedCover ||
      targetSpeedMps >= 2.5;
  } else {
    eligible = dist >= 85 || (isHeadshot && dist >= 65) || (hasSmokeFeat && dist >= 45);
  }

  if (!eligible) {
    return { triggered: false };
  }

  const effFlightS =
    flightTimeS > 0 ? flightTimeS : dist / Math.max(60, wepDef.muzzleVelocity || 850);
  const gVal = typeof gravityMps2 === 'number' ? gravityMps2 : 9.81;
  const gravityDropM = 0.5 * gVal * effFlightS * effFlightS;
  const elevDeltaM =
    shooterPos && impactPos ? (shooterPos.y || 0) - (impactPos.y || 0) : 0;
  const horizSpanM = Math.max(1, Math.sqrt(Math.max(1, dist * dist - elevDeltaM * elevDeltaM)));
  const launchAngleDeg = Number(((Math.atan2(-elevDeltaM, horizSpanM) * 180) / Math.PI).toFixed(1));
  const terminalDescentDeg =
    typeof impactAngleDeg === 'number' && Number.isFinite(impactAngleDeg)
      ? Number(impactAngleDeg.toFixed(1))
      : Number(
          (
            (Math.atan2(elevDeltaM + gVal * effFlightS * effFlightS, horizSpanM) * 180) /
            Math.PI
          ).toFixed(1)
        );
  const cleanSpeed = Math.max(0, Number(targetSpeedMps) || 0);
  const leadMeters = cleanSpeed * effFlightS;
  const motionState = cleanSpeed >= 4.2 ? 'SPRINTING' : cleanSpeed >= 0.85 ? 'MOVING' : 'STILL';
  const normAspect =
    entryAspect === 'BACK' || entryAspect === 'LEFT SIDE' || entryAspect === 'RIGHT SIDE'
      ? entryAspect
      : 'FRONT';
  const cleanBearingDeg = Math.max(-180, Math.min(180, Math.round(Number(entryBearingDeg) || 0)));

  const anatomy = resolveAnatomyDiagramTarget(hitZone, relHitY, relLateral, isHeadshot);

  const currentVictimRecord = {
    name: victimName || 'ENEMY',
    role: String(targetRole || 'SOLDIER').toUpperCase(),
    hitZone,
    anatomy,
    isHeadshot: Boolean(isHeadshot),
    distanceM: Number(dist.toFixed(1)),
    entryAspect: normAspect,
    entryBearingDeg: cleanBearingDeg,
    motionState,
    speedMps: Number(cleanSpeed.toFixed(1)),
    leadMeters: Number(leadMeters.toFixed(1))
  };
  const victims = Array.isArray(priorVictims) && priorVictims.length > 0
    ? [...priorVictims.slice(-4), currentVictimRecord]
    : [currentVictimRecord];
  const multiKillCount = Math.max(victims.length, Number(collateralCount) || 1);

  // Physics-based Shot Difficulty Formula:
  const distPts = dist * 1.15 + Math.max(0, dist - 150) * 0.72 + Math.max(0, dist - 300) * 0.95;
  const dropPts = Math.min(260, gravityDropM * 62);
  const leadPts = targetSpeedMps >= 1.6 ? Math.min(240, targetSpeedMps * 14 + leadMeters * 34) : 0;
  const elevPts = Math.abs(elevDeltaM) >= 16 ? Math.min(110, Math.abs(elevDeltaM) * 1.15) : 0;

  const ribbons = [];
  let contextBonus = 0;

  if (isHeadshot) {
    ribbons.push({ label: '🎯 CRANIAL BULLSEYE', color: '#ffd32a' });
  } else if (oneShotKill) {
    ribbons.push({ label: '⚡ ONE-SHOT LETHAL', color: '#ff9f43' });
  } else if (fracturedLimb) {
    ribbons.push({ label: `🦴 ${fracturedLimb.toUpperCase()} SHATTERED`, color: '#ff7675' });
    contextBonus += 35;
  }

  if (targetSpeedMps >= 4.2) {
    ribbons.push({ label: `🏃 SPRINT LEAD (${leadMeters.toFixed(1)}m)`, color: '#00d2d3' });
  } else if (targetSpeedMps >= 1.8) {
    ribbons.push({ label: `🚶 MOVING TGT (${leadMeters.toFixed(1)}m)`, color: '#74b9ff' });
  }

  if (elevDeltaM >= 18) {
    ribbons.push({ label: `🏢 +${Math.round(elevDeltaM)}M ROOFTOP OVERWATCH`, color: '#7ef9ff' });
  } else if (elevDeltaM <= -18) {
    ribbons.push({ label: `⛰️ +${Math.round(Math.abs(elevDeltaM))}M UPWARD ANGLE`, color: '#7ef9ff' });
  }

  const isCounterSniper = isKill && String(targetRole || '').toUpperCase() === 'RECON' && dist >= 80;
  if (isCounterSniper) {
    ribbons.push({ label: '🔭 COUNTER-SNIPER', color: '#a29bfe' });
    contextBonus += 70;
  }

  if (penetratedCover) {
    ribbons.push({ label: '🧱 COVER WALLBANG', color: '#ff9f43' });
    contextBonus += 85;
  }

  if (multiKillCount >= 2) {
    const mkLabel =
      collateralCount >= 2
        ? `⚡⚡ COLLATERAL ${multiKillCount}× KIA`
        : multiKillCount >= 4
        ? `💀 ${multiKillCount}× MULTI-SNIPE`
        : multiKillCount === 3
        ? '⚡⚡⚡ TRIPLE SNIPE (3× KIA)'
        : '⚡⚡ DOUBLE SNIPE (2× KIA)';
    ribbons.unshift({ label: mkLabel, color: '#ff9f43' });
    contextBonus += 125 * (multiKillCount - 1);
  }
  if (normAspect === 'BACK') {
    ribbons.push({ label: '🗡️ BACK SHOT', color: '#a29bfe' });
  } else if (normAspect === 'LEFT SIDE' || normAspect === 'RIGHT SIDE') {
    ribbons.push({ label: `📐 ${normAspect} FLANK`, color: '#74b9ff' });
  }

  if (hasSmokeFeat) {
    ribbons.unshift({
      label:
        throughSmoke && targetInSmoke
          ? '🌫️ BLIND SMOKE ASSASSIN'
          : targetInSmoke
          ? '💨 TARGET IN SMOKE'
          : '🌫️ SMOKE PIERCER',
      color: '#81ecec'
    });
    contextBonus += throughSmoke && targetInSmoke ? 145 : 115;
  }

  if (isMedicTarget) {
    ribbons.unshift({
      label: wasRescuing ? '⚕️ TRIAGE REVIVE DENIED' : '⚕️ ENEMY MEDIC SNIPED',
      color: '#ff6b81'
    });
    contextBonus += wasRescuing ? 85 : 55;
  }

  const isIronOrCanted = Boolean(!opticType || useCantedSight);
  if (!isAds && dist >= 25) {
    ribbons.push({ label: '🦅 NO-SCOPE', color: '#ff6b81' });
    contextBonus += 115;
  } else if (isIronOrCanted && dist >= 90 && !wepDef.isBow) {
    ribbons.push({ label: '❄️ IRON-SIGHT SNIPE', color: '#81ecec' });
    contextBonus += 85;
  }

  if (stance === 'STANDING' && !isHoldingBreath && dist >= 150) {
    contextBonus += 35;
  }

  const nextStreak = isKill ? (currentDeadeyeStreak || 0) + 1 : currentDeadeyeStreak || 0;
  if (isKill && nextStreak >= 3) {
    const streakName =
      nextStreak >= 10
        ? `🔥 ${nextStreak}× ANGEL OF DEATH`
        : nextStreak >= 5
        ? `🔥 ${nextStreak}× GRIM REAPER`
        : `🔥 ${nextStreak}× DEADEYE STREAK`;
    ribbons.push({ label: streakName, color: '#ff6b81' });
    contextBonus += Math.min(180, nextStreak * 22);
  }

  const killFactor = isKill ? 1.0 : 0.68;
  const rawScore = ((distPts + dropPts + leadPts + elevPts) * anatomy.anatomyMult + contextBonus) * killFactor;
  const difficultyScore = Math.max(25, Math.round(rawScore));

  let tier = MARKSMAN_TIERS[0];
  for (let i = 0; i < MARKSMAN_TIERS.length; i++) {
    if (difficultyScore >= MARKSMAN_TIERS[i].minScore) {
      tier = MARKSMAN_TIERS[i];
    }
  }
  if (isKill && isHeadshot && dist >= 420 && tier.minScore < 900) {
    tier = MARKSMAN_TIERS[MARKSMAN_TIERS.length - 1];
  }

  // Situational Card Archetype & Distinct Visual Header Theme (Smoke, Double-Shot, Medic, Cranial Headshot, Standard):
  let cardVariant = 'standard';
  let displayBadge = tier;
  if (hasSmokeFeat) {
    cardVariant = 'smoke_piercer';
    displayBadge = {
      ...tier,
      icon: '🌫️',
      badgeName:
        throughSmoke && targetInSmoke
          ? 'BLIND SMOKE ASSASSIN'
          : targetInSmoke
          ? 'IN-SMOKE TARGET HIT'
          : 'BLIND SMOKE PIERCER',
      color: '#81ecec',
      accent: '#00a8a8'
    };
  } else if (multiKillCount >= 2 || isDoubleShotFeat) {
    cardVariant = 'double_shot';
    displayBadge = {
      ...tier,
      icon: multiKillCount >= 3 ? '💀' : '⚡',
      badgeName:
        collateralCount >= 2
          ? `COLLATERAL ${multiKillCount}× KILL`
          : multiKillCount >= 4
          ? `QUAD SNIPE (${multiKillCount}× KIA)`
          : multiKillCount === 3
          ? 'TRIPLE SNIPE (3× KIA)'
          : 'DOUBLE SNIPE (2× KIA)',
      color: '#ff9f43',
      accent: '#d35400'
    };
  } else if (isMedicTarget && isKill) {
    cardVariant = 'medic_sniped';
    displayBadge = {
      ...tier,
      icon: '⚕️',
      badgeName: wasRescuing ? 'TRIAGE DENIED (MEDIC)' : 'CORPSMAN ELIMINATED',
      color: '#ff6b81',
      accent: '#c0392b'
    };
  } else if (isHeadshot) {
    cardVariant = 'headshot';
    displayBadge = {
      ...tier,
      icon: '💀',
      badgeName:
        dist >= 320
          ? 'EXTREME CRANIAL BULLSEYE'
          : oneShotKill
          ? 'CRANIAL ONE-SHOT'
          : 'CRANIAL HEADSHOT',
      color: '#ffd32a',
      accent: '#e67e22'
    };
  }

  // Battlefield-style Marksman Distance XP & Match Cash Bonus
  const bonusXp = isKill
    ? dist >= 75
      ? Math.round(dist * (isHeadshot ? 1.0 : 0.62) + difficultyScore * 0.14)
      : Math.round(difficultyScore * 0.18)
    : dist >= 120
    ? Math.round(dist * 0.22)
    : 0;
  const bonusCash = isKill && dist >= 90 ? Math.round(dist * 0.55 + difficultyScore * 0.12) : 0;

  // Update persistent Marksman Profile & check Earned Title unlocks
  let isNewRecord = false;
  let newlyUnlockedTitle = null;
  if (profile) {
    const roundDist = Number(dist.toFixed(1));
    if (roundDist > (profile.longestShotM || 0)) {
      isNewRecord = (profile.longestShotM || 0) >= 50 || roundDist >= 120;
      profile.longestShotM = roundDist;
    }
    if (isKill) {
      profile.totalMarksmanKills = (profile.totalMarksmanKills || 0) + 1;
      if (roundDist > (profile.longestKillM || 0)) {
        profile.longestKillM = roundDist;
      }
      if (isHeadshot) {
        profile.totalHeadshots = (profile.totalHeadshots || 0) + 1;
        if (roundDist > (profile.longestHeadshotM || 0)) {
          profile.longestHeadshotM = roundDist;
        }
      }
      if (isCounterSniper) {
        profile.counterSnipes = (profile.counterSnipes || 0) + 1;
      }
      if (isIronOrCanted && dist >= 150 && !wepDef.isBow) {
        profile.ironSightLongshots = (profile.ironSightLongshots || 0) + 1;
      }
      if (nextStreak > (profile.bestStreak || 0)) {
        profile.bestStreak = nextStreak;
      }
    } else {
      profile.totalMarksmanHits = (profile.totalMarksmanHits || 0) + 1;
    }
    if (difficultyScore > (profile.bestDifficulty || 0)) {
      profile.bestDifficulty = difficultyScore;
    }
    newlyUnlockedTitle = syncActiveMarksmanTitle(profile);
    saveMarksmanProfile(profile);
  }

  // Normalized 17-point parabolic arc data for the 2D HUD Trajectory Replay Canvas
  const arcSamples = [];
  for (let s = 0; s <= 16; s++) {
    const t = s / 16;
    // Parabolic arch bulge above the straight line of sight: 4 * t * (1 - t) * gravityDropM
    arcSamples.push({
      t,
      archNormalized: 4 * t * (1 - t)
    });
  }

  return {
    triggered: true,
    cardVariant,
    isFriendly: false,
    isKill,
    weaponLabel: wepDef.shortName || weaponLabel,
    distanceM: Number(dist.toFixed(1)),
    flightTimeS: Number(effFlightS.toFixed(2)),
    gravityDropM: Number(gravityDropM.toFixed(2)),
    elevDeltaM: Math.round(elevDeltaM),
    launchAngleDeg,
    impactAngleDeg: terminalDescentDeg,
    entryAspect: normAspect,
    entryBearingDeg: cleanBearingDeg,
    motionState,
    targetMoving: motionState !== 'STILL',
    targetSpeedMps: Number(cleanSpeed.toFixed(1)),
    leadMeters: Number(leadMeters.toFixed(2)),
    damageDealt: Math.round(damageDealt),
    oneShotKill: Boolean(oneShotKill),
    isHeadshot: Boolean(isHeadshot),
    isMedicTarget: Boolean(isMedicTarget),
    isDoubleShot: Boolean(multiKillCount >= 2 || isDoubleShotFeat),
    collateralCount: Number(collateralCount || 1),
    multiKillCount,
    victims,
    victimName: currentVictimRecord.name,
    throughSmoke: Boolean(throughSmoke),
    targetInSmoke: Boolean(targetInSmoke),
    smokeNormPos: Number(smokeNormPos || 0.65),
    difficultyScore,
    grade: tier.grade,
    badge: displayBadge,
    bonusXp,
    bonusCash,
    deadeyeStreak: nextStreak,
    anatomy,
    ribbons: ribbons.slice(0, 4),
    isNewRecord,
    newlyUnlockedTitle,
    trajectory: {
      elevDeltaM: Math.round(elevDeltaM),
      gravityDropM: Number(gravityDropM.toFixed(2)),
      leadMeters: Number(leadMeters.toFixed(2)),
      targetMoving: targetSpeedMps >= 1.6,
      penetratedCover: Boolean(penetratedCover),
      throughSmoke: Boolean(throughSmoke || targetInSmoke),
      smokeNormPos: Number(smokeNormPos || 0.65),
      samples: arcSamples
    }
  };
}
