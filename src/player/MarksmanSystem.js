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
 * Computes exact ballistic flight time, gravity drop, holdover relative to current zero,
 * and moving-target lead for Laser Rangefinder Binoculars & In-Scope Digital LRF.
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

  // Analytical flight time including linear drag first-order expansion: t ≈ (d / v0) * (1 + 0.5 * drag * (d / v0))
  const tIdeal = d / v0;
  const flightTimeS = tIdeal * (1 + 0.5 * drag * tIdeal);
  const rawGravityDropM = 0.5 * g * flightTimeS * flightTimeS;

  // Zeroing upward launch compensation at range `d`: y_zero = ((g * D_zero) / (2 * v0^2)) * d
  const zeroDist = Math.max(25, Number(currentZeroM) || 100);
  const zeroLiftM = ((g * zeroDist) / (2 * v0 * v0)) * d;
  const holdoverM = rawGravityDropM - zeroLiftM;
  const holdoverMils = (holdoverM / d) * 1000;
  const leadMeters = Math.max(0, targetSpeedMps) * flightTimeS;
  const elevAngleDeg = Math.round((Math.atan2(-elevDeltaM, Math.max(1, Math.sqrt(Math.max(1, d * d - elevDeltaM * elevDeltaM)))) * 180) / Math.PI);
  // Exact zero distance `D_zero` such that `zeroLiftM === rawGravityDropM` (accounting for drag!):
  const exactZeroM = Math.max(25, Math.min(1500, Math.round((rawGravityDropM * 2 * v0 * v0) / Math.max(0.5, g * d))));

  return {
    distanceM: Number(d.toFixed(1)),
    flightTimeS: Number(flightTimeS.toFixed(2)),
    rawGravityDropM: Number(rawGravityDropM.toFixed(2)),
    holdoverM: Number(holdoverM.toFixed(2)),
    holdoverMils: Number(holdoverMils.toFixed(1)),
    leadMeters: Number(leadMeters.toFixed(2)),
    elevAngleDeg,
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
    wasRescuing = false
  } = params || {};

  if (!wepDef || wepDef.isBuckshot || wepDef.isMountedMg || wepDef.isVenomSpit) {
    return { triggered: false };
  }

  const isPrecision = isPrecisionMarksmanWeapon(wepDef);
  const dist = Math.max(0, Number(distanceM) || 0);
  const hasSmokeFeat = Boolean(throughSmoke || targetInSmoke);
  const isDoubleShotFeat = Boolean(collateralCount >= 2 || (isKill && rapidDoubleShot));
  const isMedicTarget = String(targetRole || '').toUpperCase() === 'MEDIC';

  // Friendly Fire Warning Card (`⚠️ BLUE-ON-BLUE TEAMFIRE`) triggers immediately on precision friendly hits/kills!
  if (isFriendly) {
    if (!isPrecision && dist < 25) {
      return { triggered: false };
    }
    const effFlightFF =
      flightTimeS > 0 ? flightTimeS : dist / Math.max(60, wepDef.muzzleVelocity || 850);
    const gravDropFF =
      0.5 * (typeof gravityMps2 === 'number' ? gravityMps2 : 9.81) * effFlightFF * effFlightFF;
    const elevFF = shooterPos && impactPos ? (shooterPos.y || 0) - (impactPos.y || 0) : 0;
    const anatomyFF = resolveAnatomyDiagramTarget(hitZone, relHitY, relLateral, isHeadshot);
    if (profile && isKill) {
      saveMarksmanProfile(profile);
    }
    return {
      triggered: true,
      cardVariant: 'friendly_fire',
      isFriendly: true,
      isKill: Boolean(isKill),
      weaponLabel: wepDef.shortName || weaponLabel,
      distanceM: Number(dist.toFixed(1)),
      flightTimeS: Number(effFlightFF.toFixed(2)),
      gravityDropM: Number(gravDropFF.toFixed(2)),
      elevDeltaM: Math.round(elevFF),
      targetSpeedMps: Number(targetSpeedMps.toFixed(1)),
      leadMeters: Number((Math.max(0, targetSpeedMps) * effFlightFF).toFixed(2)),
      damageDealt: Math.round(damageDealt),
      oneShotKill: false,
      isHeadshot: Boolean(isHeadshot),
      throughSmoke: Boolean(throughSmoke),
      targetInSmoke: Boolean(targetInSmoke),
      smokeNormPos: Number(smokeNormPos || 0.65),
      difficultyScore: 0,
      grade: 'FF',
      badge: {
        grade: 'FF',
        id: 'blue_on_blue',
        badgeName: isKill ? 'BLUE-ON-BLUE TEAMKILL!' : 'FRIENDLY FIRE WARNING!',
        color: '#ff3838',
        accent: '#b71540',
        icon: '⚠️'
      },
      penaltyText: isKill ? '-$0.10 PENALTY' : 'CHECK TARGET PID!',
      bonusXp: 0,
      bonusCash: 0,
      deadeyeStreak: 0,
      anatomy: anatomyFF,
      ribbons: [
        { label: '⚠️ FRIENDLY TARGET', color: '#ff3838' },
        { label: isKill ? '💸 -$0.10 COURT-MARTIAL' : '🛑 CEASE FIRE!', color: '#ff9f43' }
      ],
      isNewRecord: false,
      newlyUnlockedTitle: null,
      trajectory: {
        elevDeltaM: Math.round(elevFF),
        gravityDropM: Number(gravDropFF.toFixed(2)),
        leadMeters: 0,
        targetMoving: targetSpeedMps >= 1.6,
        penetratedCover: Boolean(penetratedCover),
        throughSmoke: Boolean(throughSmoke || targetInSmoke),
        smokeNormPos: Number(smokeNormPos || 0.65),
        samples: []
      }
    };
  }

  // Eligibility rules (including Smoke-Occluded, Medic, Double-Shot & Headshot feats):
  let eligible = false;
  if (isKill) {
    if (isPrecision) {
      eligible =
        dist >= 30 ||
        hasSmokeFeat ||
        isDoubleShotFeat ||
        isMedicTarget ||
        (dist >= 15 && (isHeadshot || penetratedCover || collateralCount >= 2 || targetSpeedMps >= 3.2));
    } else {
      eligible = dist >= 95 || (isHeadshot && dist >= 75) || (hasSmokeFeat && dist >= 45);
    }
  } else {
    if (isPrecision) {
      eligible =
        dist >= 115 ||
        (hasSmokeFeat && dist >= 35) ||
        (dist >= 85 && (isHeadshot || Boolean(fracturedLimb)));
    } else {
      eligible = (dist >= 135 && isHeadshot) || (hasSmokeFeat && dist >= 75 && isHeadshot);
    }
  }

  if (!eligible) {
    return { triggered: false };
  }

  const effFlightS =
    flightTimeS > 0 ? flightTimeS : dist / Math.max(60, wepDef.muzzleVelocity || 850);
  const gravityDropM = 0.5 * (typeof gravityMps2 === 'number' ? gravityMps2 : 9.81) * effFlightS * effFlightS;
  const elevDeltaM =
    shooterPos && impactPos ? (shooterPos.y || 0) - (impactPos.y || 0) : 0;
  const leadMeters = Math.max(0, targetSpeedMps) * effFlightS;

  const anatomy = resolveAnatomyDiagramTarget(hitZone, relHitY, relLateral, isHeadshot);

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

  if (collateralCount >= 2) {
    ribbons.unshift({ label: `⚡⚡ COLLATERAL ${collateralCount}×`, color: '#ff9f43' });
    contextBonus += 135 * (collateralCount - 1);
  } else if (isKill && rapidDoubleShot) {
    ribbons.unshift({ label: '⚡⚡ RAPID DOUBLE SHOT', color: '#ff9f43' });
    contextBonus += 110;
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
  } else if (isDoubleShotFeat) {
    cardVariant = 'double_shot';
    displayBadge = {
      ...tier,
      icon: '⚡',
      badgeName: collateralCount >= 2 ? `DOUBLE-PIERCE (${collateralCount}×)` : 'RAPID DOUBLE SHOT',
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
    targetSpeedMps: Number(targetSpeedMps.toFixed(1)),
    leadMeters: Number(leadMeters.toFixed(2)),
    damageDealt: Math.round(damageDealt),
    oneShotKill: Boolean(oneShotKill),
    isHeadshot: Boolean(isHeadshot),
    isMedicTarget: Boolean(isMedicTarget),
    isDoubleShot: Boolean(isDoubleShotFeat),
    collateralCount: Number(collateralCount || 1),
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
