// ============================================================================
// 2D VECTOR WEAPON SILHOUETTES & GEAR ICONS (src/assets/gunsmith-svg.js)
// Edit this file to customize 2D warehouse/gunsmith weapon SVG silhouettes,
// attachment overlay graphics, and gear/grid size metadata.
// ============================================================================

import { WEAPON_DEFS } from './weapon-defs.js?v=118';
import { ATTACHMENT_CATALOG } from './attachment-defs.js?v=118';

export const CLASS_META = [
  { id: 'engineer', label: 'ENGINEER', short: 'ENG', icon: '🛠️', gadgetId: 'rpg7', gadget: 'RPG-7 HEAT + HAMMER' },
  { id: 'assault', label: 'ASSAULT', short: 'ASL', icon: '💥', gadgetId: 'c4', gadget: 'C4 BREACH + HAMMER' },
  { id: 'medic', label: 'MEDIC', short: 'MED', icon: '➕', gadgetId: 'medkit', gadget: 'MEDKIT BOX + HAMMER' },
  { id: 'support', label: 'SUPPORT', short: 'SUP', icon: '📦', gadgetId: 'ammocrate', gadget: 'AMMO CRATE + HAMMER' },
  { id: 'recon', label: 'RECON', short: 'RCN', icon: '🎯', gadgetId: 'c4', gadget: 'C4 + BEACON + HAMMER' },
  { id: 'armor', label: 'ARMOR CREWMAN', short: 'ARM', icon: '🛡️', gadgetId: 'rpg7', gadget: 'TROPHY APS [X] + AUTO-REPAIR (+22 HP/S)' },
  { id: 'pilot', label: 'COMBAT PILOT', short: 'PLT', icon: '✈️', gadgetId: 'stinger', gadget: 'ECM/DIRCM [X] + G-SUIT (+25 HP/S)' },
  // Mount & Blade Medieval Era Classes
  { id: 'swordsman', label: 'FOOTMAN (1H SWORD & SHIELD)', short: '1H SWD', icon: '⚔️', gadgetId: 'c4', gadget: '1H ARMING SWORD + 1H HEATER SHIELD (70% BLOCK)' },
  { id: 'greatsword_knight', label: 'CHAMPION (2H GREATSWORD)', short: '2H SWD', icon: '🗡️', gadgetId: 'medkit', gadget: '2H ZWEIHÄNDER (165 DMG CLEAVE + 45% PARRY)' },
  { id: 'polearm_knight', label: 'LANCER KNIGHT (POLEARM SPEAR)', short: 'LANCE', icon: '🔱', gadgetId: 'c4', gadget: 'LONG SPEAR / HALBERD + COUCHED LANCE (280 DMG)' },
  { id: 'archer', label: 'YEW LONGBOWMAN (ARCHER)', short: 'BOW', icon: '🏹', gadgetId: 'ammocrate', gadget: 'YEW LONGBOW + 1H SWORD + QUIVER CART' },
  { id: 'crossbowman', label: 'SIEGE ARBALESTER (CROSSBOW + 2H SHIELD)', short: 'XBOW', icon: '🎯', gadgetId: 'ammocrate', gadget: 'HEAVY CROSSBOW (148 DMG) + 2H PAVISE SHIELD (92% BLOCK)' },
  { id: 'mounted_knight', label: 'ROYAL HORSE ARCHER & LANCER', short: 'HORSE', icon: '🐎', gadgetId: 'medkit', gadget: 'WARHORSE MOUNT + YEW LONGBOW + KNIGHT LANCE' },
  { id: 'dino_raptor', label: 'VELOCIRAPTOR PACK HUNTER', short: 'DINO', icon: '🦖', gadgetId: 'medkit', gadget: 'RAZOR TALONS + ACID SPIT + MOUNT ALPHA T-REX' }
];

export const WEAPON_GRID_SIZES = {
  m4a1: { cols: 4, rows: 2, label: '4×2', cat: 'ASSAULT RIFLE', weight: '3.4 kg' },
  hk416: { cols: 4, rows: 2, label: '4×2', cat: 'CAG CARBINE', weight: '3.5 kg' },
  mcx_spear: { cols: 4, rows: 2, label: '4×2', cat: '6.8MM XM7 RIFLE', weight: '3.8 kg' },
  ak15: { cols: 4, rows: 2, label: '4×2', cat: 'ASSAULT RIFLE', weight: '3.6 kg' },
  scar_h: { cols: 4, rows: 2, label: '4×2', cat: 'BATTLE RIFLE', weight: '3.9 kg' },
  as_val: { cols: 4, rows: 2, label: '4×2', cat: 'SUPPRESSED AR', weight: '2.9 kg' },
  aug_a3: { cols: 4, rows: 2, label: '4×2', cat: 'BULLPUP RIFLE', weight: '3.6 kg' },
  ash12: { cols: 4, rows: 2, label: '4×2', cat: '12.7MM BULLPUP', weight: '4.6 kg' },
  vector: { cols: 3, rows: 2, label: '3×2', cat: 'SMG / PDW', weight: '2.7 kg' },
  mp7: { cols: 3, rows: 2, label: '3×2', cat: 'AP PDW', weight: '2.1 kg' },
  mp5sd: { cols: 3, rows: 2, label: '3×2', cat: 'SUPPRESSED SMG', weight: '3.1 kg' },
  p90: { cols: 3, rows: 2, label: '3×2', cat: '50R BULLPUP PDW', weight: '2.6 kg' },
  m1014: { cols: 4, rows: 2, label: '4×2', cat: 'COMBAT SHOTGUN', weight: '3.8 kg' },
  m249: { cols: 5, rows: 2, label: '5×2', cat: 'SQUAD LMG', weight: '7.5 kg' },
  pkp: { cols: 5, rows: 2, label: '5×2', cat: 'HEAVY LMG', weight: '8.2 kg' },
  sv98: { cols: 5, rows: 2, label: '5×2', cat: 'BOLT SNIPER', weight: '5.8 kg' },
  awm: { cols: 5, rows: 2, label: '5×2', cat: '.338 MAGNUM SNIPER', weight: '6.5 kg' },
  mk14: { cols: 5, rows: 2, label: '5×2', cat: 'MARKSMAN DMR', weight: '5.1 kg' },
  sr25: { cols: 5, rows: 2, label: '5×2', cat: 'PRECISION DMR', weight: '4.8 kg' },
  mp443: { cols: 2, rows: 1, label: '2×1', cat: 'SIDEARM PISTOL', weight: '0.95 kg' },
  m9_beretta: { cols: 2, rows: 1, label: '2×1', cat: '9MM SERVICE PISTOL', weight: '0.97 kg' },
  five_seven: { cols: 2, rows: 1, label: '2×1', cat: '5.7MM AP PISTOL', weight: '0.74 kg' },
  usp45: { cols: 2, rows: 1, label: '2×1', cat: 'TACTICAL PISTOL', weight: '1.02 kg' },
  g18: { cols: 2, rows: 1, label: '2×1', cat: 'MACHINE PISTOL', weight: '0.98 kg' },
  deagle: { cols: 2, rows: 1, label: '2×1', cat: 'HAND CANNON', weight: '1.99 kg' },
  hammer: { cols: 2, rows: 1, label: '2×1', cat: 'MELEE / BUILDER', weight: '1.45 kg' },
  longsword: { cols: 4, rows: 2, label: '4×2', cat: '1H SWORD & 1H SHIELD', weight: '3.8 kg' },
  greatsword_2h: { cols: 5, rows: 2, label: '5×2', cat: '2H ZWEIHÄNDER', weight: '3.2 kg' },
  knight_lance: { cols: 5, rows: 2, label: '5×2', cat: 'POLEARM / LANCE', weight: '4.1 kg' },
  tower_shield_2h: { cols: 4, rows: 2, label: '4×2', cat: '2H PAVISE SHIELD', weight: '6.8 kg' },
  warbow: { cols: 4, rows: 2, label: '4×2', cat: 'YEW LONGBOW', weight: '1.6 kg' },
  heavy_crossbow: { cols: 4, rows: 2, label: '4×2', cat: 'SIEGE ARBALEST', weight: '5.4 kg' },
  throwing_knives: { cols: 2, rows: 1, label: '2×1', cat: 'THROWING DAGGERS', weight: '1.2 kg' }
};

function numToHex(num, fallback = '#3a424a') {
  if (typeof num !== 'number') return fallback;
  return '#' + num.toString(16).padStart(6, '0');
}

export function buildWeaponSvg(weaponId, attMap = {}, opts = {}) {
  const def = WEAPON_DEFS[weaponId] || WEAPON_DEFS.m4a1;
  const isSecondary = def.slot === 'secondary';
  const skinFinish = opts.skinFinish || (attMap && attMap.skinFinish) || def.skinFinish || null;
  const isPureGold = skinFinish === 'pure_gold';
  const isPureBlue = skinFinish === 'pure_blue';
  const bodyCol = isPureGold
    ? '#ffd32a'
    : isPureBlue
    ? '#0652dd'
    : numToHex(def.bodyColor, '#2e353d');
  const accentCol = isPureGold
    ? '#d4af37'
    : isPureBlue
    ? '#00d2d3'
    : numToHex(def.accentColor, '#535c68');
  const strokeCol = isPureGold
    ? '#fff3a1'
    : isPureBlue
    ? '#74b9ff'
    : opts.strokeColor || 'rgba(236, 240, 241, 0.55)';
  const heightPx = opts.height || (isSecondary ? 44 : 64);

  if (weaponId === 'hammer' || skinFinish === 'karambit' || skinFinish === 'butterfly') {
    if (skinFinish === 'karambit') {
      return `
        <svg viewBox="0 0 210 86" style="width:100%;height:${heightPx}px;display:block;overflow:visible;">
          <polygon points="27,70 34,63 36,72" fill="#ffd32a" stroke="#b7791f" stroke-width="1"/>
          <circle cx="46" cy="58" r="15.5" fill="#ffd32a" stroke="#fff9c4" stroke-width="1.6"/>
          <circle cx="46" cy="58" r="11.5" fill="#182028" stroke="#b7791f" stroke-width="1.2"/>
          <circle cx="46" cy="58" r="9.2" fill="#070a0f" stroke="#ffd32a" stroke-width="0.9"/>
          <path d="M55,45 C68,28 92,20 114,24 L118,38 Q105,40 99,47 Q92,39 83,52 Q75,45 66,60 Q58,54 55,45 Z" fill="#161d26" stroke="#ffd32a" stroke-width="1.8"/>
          <path d="M62,46 C74,33 93,26 110,29 L112,35 C95,35 78,42 65,53 Z" fill="#222d3a" stroke="rgba(255,211,42,0.55)" stroke-width="1"/>
          <circle cx="70" cy="48" r="2.1" fill="#ffd32a"/>
          <circle cx="86" cy="39" r="2.1" fill="#ffd32a"/>
          <circle cx="103" cy="33" r="2.1" fill="#ffd32a"/>
          <line x1="104" y1="21" x2="105" y2="25" stroke="#fff9c4" stroke-width="1.5"/>
          <line x1="108" y1="21" x2="109" y2="25" stroke="#fff9c4" stroke-width="1.5"/>
          <line x1="112" y1="22" x2="113" y2="26" stroke="#fff9c4" stroke-width="1.5"/>
          <path d="M114,24 C148,14 182,28 194,64 C172,40 144,34 118,38 Z" fill="#fff6b3" stroke="#fffde7" stroke-width="1.4"/>
          <path d="M114,24 C148,14 182,28 194,64 C175,34 146,25 116,32 Z" fill="#ffd32a" stroke="#f39c12" stroke-width="1.2"/>
          <path d="M124,27 C148,22 170,30 183,49" fill="none" stroke="#8c5800" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      `;
    }
    if (skinFinish === 'butterfly') {
      return `
        <svg viewBox="0 0 210 86" style="width:100%;height:${heightPx}px;display:block;overflow:visible;">
          <path d="M104,35 C82,24 52,20 26,28 C21,30 21,36 27,37 C52,33 80,35 104,40 Z" fill="#0652dd" stroke="#ffd32a" stroke-width="1.5"/>
          <path d="M104,51 C82,62 52,66 26,58 C21,56 21,50 27,49 C52,53 80,51 104,46 Z" fill="#0652dd" stroke="#00d2d3" stroke-width="1.5"/>
          <path d="M24,54 L14,57 M14,53 L14,61" stroke="#ffd32a" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="88" cy="34" r="2.7" fill="#070a0f" stroke="#ffd32a" stroke-width="1.1"/>
          <ellipse cx="70" cy="31.5" rx="4.5" ry="2.2" fill="#070a0f" stroke="#ffd32a" stroke-width="1"/>
          <ellipse cx="51" cy="31" rx="4.5" ry="2.1" fill="#070a0f" stroke="#ffd32a" stroke-width="1"/>
          <circle cx="35" cy="32.5" r="2.2" fill="#070a0f" stroke="#ffd32a" stroke-width="1"/>
          <circle cx="88" cy="52" r="2.7" fill="#070a0f" stroke="#00d2d3" stroke-width="1.1"/>
          <ellipse cx="70" cy="54.5" rx="4.5" ry="2.2" fill="#070a0f" stroke="#00d2d3" stroke-width="1"/>
          <ellipse cx="51" cy="55" rx="4.5" ry="2.1" fill="#070a0f" stroke="#00d2d3" stroke-width="1"/>
          <circle cx="35" cy="53.5" r="2.2" fill="#070a0f" stroke="#00d2d3" stroke-width="1"/>
          <circle cx="104" cy="36" r="3.8" fill="#ffd32a" stroke="#111" stroke-width="1"/>
          <circle cx="104" cy="50" r="3.8" fill="#ffd32a" stroke="#111" stroke-width="1"/>
          <path d="M105,35 L112,31 Q116,35 122,35 C148,35 174,31 196,42 C176,55 146,53 120,51 Q115,51 112,55 L105,51 Z" fill="#00d2d3" stroke="#ffd32a" stroke-width="1.6"/>
          <circle cx="119" cy="43" r="3.6" fill="#070a0f" stroke="#ffd32a" stroke-width="1.4"/>
          <path d="M128,42 C148,41 168,40 183,42.5" fill="none" stroke="#ffd32a" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 210 86" style="width:100%;height:${heightPx}px;display:block;overflow:visible;">
        <rect x="34" y="38" width="118" height="10" rx="2" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.4"/>
        <rect x="142" y="18" width="32" height="50" rx="3" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.6"/>
      </svg>
    `;
  }

  const muzzleId = attMap.muzzle || 'stock';
  const opticId = attMap.optic || 'factory';
  const magId = attMap.magazine || 'std_mag';
  const gripId = attMap.grip || 'std_grip';
  const ammoId = attMap.ammoType || 'fmj';

  const opticItem = (ATTACHMENT_CATALOG.optic || []).find((o) => o.id === opticId);
  const activeOpticType =
    opticId && opticId !== 'factory' && opticItem && opticItem.opticType
      ? opticItem.opticType
      : def.opticType && def.opticType !== 'iron'
      ? def.opticType
      : null;
  const hasCanted = Boolean(opticItem && opticItem.grantCanted);

  if (isSecondary) {
    const isDeagle = weaponId === 'deagle';
    const isG18 = weaponId === 'g18';
    const isUsp = weaponId === 'usp45';
    const isFiveSeven = weaponId === 'five_seven';
    const muzzleX = isDeagle ? 152 : isFiveSeven ? 144 : 140;

    // 1. Pistol Muzzle Attachments
    let pistolMuzzleSvg = '';
    if (muzzleId === 'silencer' || muzzleId === 'qdc_suppressor') {
      const len = muzzleId === 'qdc_suppressor' ? 44 : 38;
      pistolMuzzleSvg = `
        <g class="svg-part-muzzle">
          <rect x="${muzzleX - 1}" y="21.5" width="${len}" height="11.5" rx="2" fill="#17202a" stroke="#2ecc71" stroke-width="1.4"/>
          <line x1="${muzzleX + 9}" y1="22" x2="${muzzleX + 9}" y2="33" stroke="#2ecc71" stroke-width="1" opacity="0.65"/>
          <line x1="${muzzleX + 19}" y1="22" x2="${muzzleX + 19}" y2="33" stroke="#2ecc71" stroke-width="1" opacity="0.65"/>
          <line x1="${muzzleX + 29}" y1="22" x2="${muzzleX + 29}" y2="33" stroke="#2ecc71" stroke-width="1" opacity="0.65"/>
        </g>
      `;
    } else if (muzzleId === 'compensator' || muzzleId === 'lantac_dragon') {
      pistolMuzzleSvg = `
        <g class="svg-part-muzzle">
          <polygon points="${muzzleX},21 ${muzzleX + 18},21 ${muzzleX + 20},34 ${muzzleX},34" fill="#2c3e50" stroke="#f1c40f" stroke-width="1.3"/>
          <line x1="${muzzleX + 5}" y1="21" x2="${muzzleX + 5}" y2="29" stroke="#111" stroke-width="2"/>
          <line x1="${muzzleX + 11}" y1="21" x2="${muzzleX + 11}" y2="29" stroke="#111" stroke-width="2"/>
        </g>
      `;
    } else if (muzzleId === 'flash_hider' || muzzleId === 'warden_blast') {
      pistolMuzzleSvg = `
        <g class="svg-part-muzzle">
          <rect x="${muzzleX}" y="22.5" width="${muzzleId === 'warden_blast' ? 16 : 12}" height="9" rx="1.5" fill="#34495e" stroke="#74b9ff" stroke-width="1.2"/>
        </g>
      `;
    }

    // 2. Pistol Magazine Attachments
    let pistolMagSvg = '';
    if (magId === 'drum_mag') {
      pistolMagSvg = `
        <g class="svg-part-mag">
          <polygon points="44,58 56,60 51,74 39,72" fill="#1e2b24" stroke="#2ecc71" stroke-width="1.2"/>
          <circle cx="46" cy="77" r="11" fill="#1b2620" stroke="#2ecc71" stroke-width="1.5"/>
          <circle cx="46" cy="77" r="4.5" fill="#0d1310" stroke="#7bed9f" stroke-width="1"/>
        </g>
      `;
    } else if (magId === 'ext_mag' || magId === 'quad_60' || isG18) {
      const bottomY = magId === 'quad_60' ? 84 : magId === 'ext_mag' ? 82 : 74;
      pistolMagSvg = `
        <g class="svg-part-mag">
          <polygon points="42,58 56,60 ${48},${bottomY} ${35},${bottomY - 2}" fill="#1b242c" stroke="${magId !== 'std_mag' ? '#2ecc71' : 'rgba(241,196,15,0.65)'}" stroke-width="1.3"/>
        </g>
      `;
    } else if (magId === 'fast_mag' || magId === 'jungle_taped') {
      pistolMagSvg = `
        <g class="svg-part-mag">
          <path d="M40,62 Q46,72 55,64" fill="none" stroke="${magId === 'jungle_taped' ? '#3498db' : '#f1c40f'}" stroke-width="2.2"/>
        </g>
      `;
    }

    // 3. Pistol Underbarrel Rail
    let pistolUnderbarrelSvg = '';
    if (gripId === 'match_laser' || gripId === 'mawl_c1') {
      const beamCol = gripId === 'mawl_c1' ? '#00ff88' : '#2ecc71';
      pistolUnderbarrelSvg = `
        <g class="svg-part-grip">
          <rect x="90" y="34" width="26" height="8.5" rx="2" fill="#1f2e3d" stroke="${beamCol}" stroke-width="1.3"/>
          <circle cx="116" cy="38" r="2.2" fill="${beamCol}"/>
          <line x1="118" y1="38" x2="192" y2="38" stroke="${beamCol}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.95"/>
        </g>
      `;
    } else if (gripId !== 'std_grip') {
      pistolUnderbarrelSvg = `
        <g class="svg-part-grip">
          <rect x="88" y="34" width="22" height="5.5" rx="1" fill="#2c3e50" stroke="#74b9ff" stroke-width="1.2"/>
        </g>
      `;
    }

    // 4. Pistol Slide Optic
    let pistolOpticSvg = '';
    if (!activeOpticType) {
      pistolOpticSvg = `
        <rect x="47" y="17" width="5" height="4" fill="#7bed9f"/>
        <rect x="${isDeagle ? 140 : isFiveSeven ? 135 : 131}" y="17" width="4" height="4" fill="#7bed9f"/>
      `;
    } else if (activeOpticType === 'rmr' || activeOpticType === 'okp7') {
      pistolOpticSvg = `
        <g class="svg-part-optic">
          <polygon points="52,20 55,11 69,11 71,20" fill="#16202a" stroke="${activeOpticType === 'okp7' ? '#2ecc71' : '#f39c12'}" stroke-width="1.4"/>
          <circle cx="62" cy="15" r="2" fill="${activeOpticType === 'okp7' ? '#2ecc71' : '#ff9f43'}"/>
        </g>
      `;
    } else if (activeOpticType === 'reddot' || activeOpticType === 'kobra') {
      pistolOpticSvg = `
        <g class="svg-part-optic">
          <rect x="52" y="10" width="20" height="11" rx="2" fill="#1c2833" stroke="#2ecc71" stroke-width="1.4"/>
          <circle cx="62" cy="15" r="2.2" fill="#e74c3c"/>
        </g>
      `;
    } else if (activeOpticType === 'holo' || activeOpticType === 'uh1' || activeOpticType === 'holo3x') {
      pistolOpticSvg = `
        <g class="svg-part-optic">
          <rect x="50" y="8" width="24" height="13" rx="2" fill="#1f2e3d" stroke="#2ecc71" stroke-width="1.4"/>
          <circle cx="62" cy="14" r="2.2" fill="#e74c3c"/>
        </g>
      `;
    } else if (activeOpticType === 'flir') {
      pistolOpticSvg = `
        <g class="svg-part-optic">
          <rect x="48" y="7" width="38" height="14" rx="2" fill="#1b2228" stroke="#f39c12" stroke-width="1.5"/>
          <rect x="85" y="8" width="4" height="12" fill="#ff9f43"/>
        </g>
      `;
    } else {
      pistolOpticSvg = `
        <g class="svg-part-optic">
          <polygon points="50,9 92,7 94,18 50,20" fill="#1a2530" stroke="#2ecc71" stroke-width="1.4"/>
          <line x1="60" y1="8" x2="82" y2="8" stroke="#e74c3c" stroke-width="1.8"/>
        </g>
      `;
    }

    const ammoCol =
      ammoId === 'ap_rounds' || ammoId === 'm855a1_bp'
        ? '#f1c40f'
        : ammoId === 'overpressure' || ammoId === 'rip_flesh'
        ? '#e74c3c'
        : ammoId === 'ap20_slug'
        ? '#ff9f43'
        : ammoId === 'subsonic_match'
        ? '#3498db'
        : '#151b22';

    return `
      <svg viewBox="0 0 210 86" style="width:100%;height:${heightPx}px;display:block;overflow:visible;">
        ${pistolMagSvg}
        ${pistolMuzzleSvg}
        ${pistolUnderbarrelSvg}
        <path d="${
          isDeagle
            ? 'M38,20 L146,20 L152,35 L58,36 L38,34 Z'
            : isFiveSeven
            ? 'M41,21 L141,20 L145,33 L53,34 L41,33 Z'
            : isUsp
            ? 'M42,20 L140,20 L142,34 L54,34 L42,33 Z'
            : weaponId === 'm9_beretta'
            ? 'M42,22 L76,22 L82,27 L128,27 L132,22 L142,22 L140,34 L54,34 L42,33 Z'
            : 'M44,22 L138,22 L140,34 L54,34 L44,33 Z'
        }" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.3"/>
        ${
          weaponId === 'm9_beretta'
            ? `<rect x="78" y="21" width="54" height="5.5" rx="2.5" fill="#1e242b" stroke="${strokeCol}" stroke-width="0.9"/><path d="M40,24 L34,20 L38,29 Z" fill="#1e242b" stroke="${strokeCol}" stroke-width="0.9"/>`
            : isFiveSeven
            ? `<rect x="74" y="23" width="46" height="4.5" rx="1" fill="${ammoCol}" opacity="0.88"/><line x1="52" y1="22" x2="52" y2="32" stroke="#111" stroke-width="1.6"/><line x1="57" y1="22" x2="57" y2="32" stroke="#111" stroke-width="1.6"/><line x1="62" y1="22" x2="62" y2="32" stroke="#111" stroke-width="1.6"/>`
            : isDeagle
            ? `<rect x="85" y="23" width="44" height="5" rx="1" fill="${ammoCol}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>`
            : isG18
            ? `<rect x="112" y="19" width="18" height="4" fill="#f1c40f" opacity="0.85"/><rect x="74" y="24" width="28" height="4" fill="${ammoCol}"/><line x1="60" y1="24" x2="60" y2="32" stroke="#111" stroke-width="2"/><line x1="66" y1="24" x2="66" y2="32" stroke="#111" stroke-width="2"/>`
            : `<rect x="78" y="24" width="36" height="4" fill="${ammoCol}" opacity="0.85"/>`
        }
        <path d="M52,34 L115,34 L115,39 L84,39 L82,49 L68,49 L67,40 L56,64 L40,62 L49,35 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.2"/>
        <path d="M74,39 Q77,45 73,47" fill="none" stroke="#f1c40f" stroke-width="1.8"/>
        ${pistolOpticSvg}
      </svg>
    `;
  }

  const isSniper = weaponId === 'sv98' || weaponId === 'awm' || weaponId === 'mk14' || weaponId === 'sr25';
  const isLmg = weaponId === 'm249' || weaponId === 'pkp';
  const isSmg = weaponId === 'vector' || weaponId === 'mp7' || weaponId === 'p90' || weaponId === 'mp5sd';
  const isShotgun = weaponId === 'm1014';
  const isAk = weaponId === 'ak15';
  const isScar = weaponId === 'scar_h' || weaponId === 'mcx_spear';
  const isAsVal = weaponId === 'as_val';
  const isMp5sd = weaponId === 'mp5sd';
  const isP90 = weaponId === 'p90';
  const isAug = weaponId === 'aug_a3';
  const isAsh12 = weaponId === 'ash12';

  let stockSvg = '';
  if (weaponId === 'sv98' || weaponId === 'awm') {
    stockSvg = `<path d="M16,44 L86,44 L86,66 L54,66 L44,56 L28,58 L28,72 L16,72 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.3"/>
                <rect x="38" y="39" width="28" height="5" rx="2" fill="#15191d"/>`;
  } else if (isP90 || isAug || isAsh12) {
    stockSvg = `<path d="M24,38 L88,38 L88,68 L24,68 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>`;
  } else if (isScar || weaponId === 'sr25' || weaponId === 'hk416') {
    stockSvg = `<path d="M20,40 L86,42 L86,62 L38,65 L20,70 Z" fill="${weaponId === 'mcx_spear' ? accentCol : bodyCol}" stroke="${strokeCol}" stroke-width="1.3"/>
                <rect x="32" y="38" width="36" height="5" rx="1" fill="${accentCol}"/>`;
  } else if (isAsVal || weaponId === 'vector' || isMp5sd) {
    stockSvg = `<path d="M24,44 L86,44 L86,50 L32,50 L32,68 L24,68 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.3"/>
                <line x1="32" y1="64" x2="84" y2="54" stroke="${strokeCol}" stroke-width="2.5"/>`;
  } else if (weaponId === 'mp7') {
    stockSvg = `<rect x="44" y="45" width="46" height="5" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1"/>
                <rect x="38" y="38" width="8" height="24" rx="2" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.2"/>`;
  } else {
    stockSvg = `<path d="M22,42 L86,42 L86,56 L48,58 L30,68 L22,68 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.3"/>`;
  }

  let receiverSvg = '';
  if (isP90) {
    receiverSvg = `
      <path d="M86,38 L194,38 L198,62 L152,66 L138,56 L86,58 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <rect x="74" y="31" width="98" height="7" rx="2" fill="#d4af37" opacity="0.88" stroke="${strokeCol}" stroke-width="1"/>
      <ellipse cx="154" cy="54" rx="11" ry="6" fill="#0d131a" stroke="${strokeCol}" stroke-width="1"/>
    `;
  } else if (isAsh12) {
    receiverSvg = `
      <path d="M84,36 L196,36 L198,58 L84,58 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.5"/>
      <rect x="92" y="30" width="96" height="6" rx="1.5" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.1"/>
      <rect x="150" y="42" width="42" height="12" rx="1" fill="${accentCol}" opacity="0.9"/>
    `;
  } else if (isAug) {
    receiverSvg = `
      <path d="M86,38 L188,38 L190,54 L86,56 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <path d="M168,54 L178,54 L174,78 L164,76 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.2"/>
    `;
  } else if (weaponId === 'vector') {
    receiverSvg = `
      <path d="M86,38 L195,38 L195,66 L142,68 L132,56 L86,56 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <rect x="96" y="43" width="84" height="7" rx="1" fill="${accentCol}" opacity="0.8"/>
    `;
  } else if (weaponId === 'mp7') {
    receiverSvg = `
      <path d="M88,38 L198,38 L202,54 L90,55 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <path d="M180,54 L192,54 L190,74 L180,74 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.1"/>
    `;
  } else if (isMp5sd) {
    receiverSvg = `
      <path d="M86,38 L166,38 L168,55 L86,55 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
    `;
  } else if (isLmg) {
    receiverSvg = `
      <rect x="84" y="36" width="128" height="24" rx="2" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.5"/>
      <rect x="94" y="32" width="68" height="5" rx="1" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1"/>
      <rect x="148" y="41" width="54" height="10" rx="1" fill="${accentCol}" opacity="0.85"/>
    `;
  } else if (isShotgun) {
    receiverSvg = `
      <path d="M84,40 L176,40 L176,55 L84,56 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <rect x="176" y="47" width="62" height="7" rx="2" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.1"/>
    `;
  } else {
    const hgLen = isSniper ? 64 : weaponId === 'mcx_spear' || weaponId === 'hk416' ? 54 : 48;
    receiverSvg = `
      <path d="M84,38 L168,38 L170,56 L84,56 Z" fill="${bodyCol}" stroke="${strokeCol}" stroke-width="1.4"/>
      <rect x="168" y="39" width="${hgLen}" height="14" rx="2" fill="${weaponId === 'mcx_spear' ? bodyCol : accentCol}" stroke="${strokeCol}" stroke-width="1.3"/>
      <line x1="174" y1="46" x2="${168 + hgLen - 6}" y2="46" stroke="#111" stroke-width="2" stroke-dasharray="5,3"/>
    `;
  }

  const barrelStart = isAsh12 ? 198 : isSmg ? 198 : isLmg ? 212 : isSniper ? 232 : 218;
  const barrelEnd = isAsh12 ? 226 : isSmg ? 232 : isSniper ? 274 : isShotgun ? 252 : 254;
  let barrelAndMuzzleSvg = '';

  if (isAsVal || isMp5sd) {
    const supX = isMp5sd ? 166 : 166;
    const supW = isMp5sd ? 88 : 96;
    barrelAndMuzzleSvg = `
      <rect x="${supX}" y="39" width="${supW}" height="14" rx="4" fill="#1c2228" stroke="#74b9ff" stroke-width="1.3"/>
      <line x1="180" y1="39" x2="180" y2="53" stroke="#34495e" stroke-width="1.6"/>
      <line x1="196" y1="39" x2="196" y2="53" stroke="#34495e" stroke-width="1.6"/>
      <line x1="212" y1="39" x2="212" y2="53" stroke="#34495e" stroke-width="1.6"/>
      <line x1="228" y1="39" x2="228" y2="53" stroke="#34495e" stroke-width="1.6"/>
    `;
  } else {
    barrelAndMuzzleSvg = `
      <rect x="${barrelStart}" y="43" width="${barrelEnd - barrelStart}" height="${isAsh12 ? 7 : 5}" fill="#1e242b" stroke="${strokeCol}" stroke-width="1.1"/>
    `;
  }

  const muzzleTipX = isAsVal ? 262 : isMp5sd ? 254 : barrelEnd;
  if (muzzleId === 'silencer' || muzzleId === 'qdc_suppressor') {
    const sW = muzzleId === 'qdc_suppressor' ? 44 : 38;
    barrelAndMuzzleSvg += `
      <g class="svg-part-muzzle">
        <rect x="${muzzleTipX - 2}" y="38.5" width="${sW}" height="14" rx="3" fill="#19232d" stroke="#2ecc71" stroke-width="1.5"/>
        <line x1="${muzzleTipX + 8}" y1="39" x2="${muzzleTipX + 8}" y2="52" stroke="#2ecc71" stroke-width="1" opacity="0.6"/>
        <line x1="${muzzleTipX + 18}" y1="39" x2="${muzzleTipX + 18}" y2="52" stroke="#2ecc71" stroke-width="1" opacity="0.6"/>
        <line x1="${muzzleTipX + 28}" y1="39" x2="${muzzleTipX + 28}" y2="52" stroke="#2ecc71" stroke-width="1" opacity="0.6"/>
      </g>
    `;
  } else if (muzzleId === 'compensator' || muzzleId === 'lantac_dragon') {
    barrelAndMuzzleSvg += `
      <g class="svg-part-muzzle">
        <rect x="${muzzleTipX}" y="40.5" width="21" height="10" rx="1.5" fill="#2c3e50" stroke="#f1c40f" stroke-width="1.4"/>
        <line x1="${muzzleTipX + 5}" y1="41" x2="${muzzleTipX + 5}" y2="50" stroke="#111" stroke-width="2"/>
        <line x1="${muzzleTipX + 10}" y1="41" x2="${muzzleTipX + 10}" y2="50" stroke="#111" stroke-width="2"/>
        <line x1="${muzzleTipX + 15}" y1="41" x2="${muzzleTipX + 15}" y2="50" stroke="#111" stroke-width="2"/>
      </g>
    `;
  } else if (muzzleId === 'warden_blast') {
    barrelAndMuzzleSvg += `
      <g class="svg-part-muzzle">
        <rect x="${muzzleTipX - 1}" y="39.5" width="22" height="12" rx="2" fill="#5c4b32" stroke="#f39c12" stroke-width="1.4"/>
      </g>
    `;
  } else if (muzzleId === 'flash_hider') {
    barrelAndMuzzleSvg += `
      <g class="svg-part-muzzle">
        <path d="M${muzzleTipX},42 L${muzzleTipX + 15},41 L${muzzleTipX + 15},44 L${muzzleTipX + 4},45.5 L${muzzleTipX + 15},47 L${muzzleTipX + 15},50 L${muzzleTipX},49 Z" fill="#34495e" stroke="#74b9ff" stroke-width="1.3"/>
      </g>
    `;
  } else if (!isAsVal && !isMp5sd) {
    barrelAndMuzzleSvg += isAsh12
      ? `<rect x="${muzzleTipX}" y="40" width="16" height="12" rx="1.5" fill="#22282e" stroke="${strokeCol}" stroke-width="1.2"/>`
      : `<rect x="${muzzleTipX}" y="42.5" width="7" height="6" rx="1" fill="#2c343c" stroke="${strokeCol}" stroke-width="1"/>`;
  }

  const gripSvg = isAsh12
    ? `<path d="M120,56 L134,56 L126,80 L112,78 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.2"/>`
    : `
      <path d="M98,55 L112,55 L104,80 L90,78 Z" fill="${accentCol}" stroke="${strokeCol}" stroke-width="1.2"/>
      <path d="M112,55 L124,55 L122,63 L110,63 Z" fill="none" stroke="${strokeCol}" stroke-width="1.1"/>
    `;

  let magSvg = '';
  const magColor =
    magId === 'drum_mag'
      ? '#1e2b24'
      : magId === 'ext_mag' || magId === 'quad_60'
      ? '#243342'
      : magId === 'fast_mag' || magId === 'jungle_taped'
      ? '#2c3a2e'
      : '#22282e';
  const magStroke = magId !== 'std_mag' ? '#2ecc71' : strokeCol;
  const isExtended = magId === 'ext_mag' || magId === 'quad_60';

  if (weaponId === 'p90') {
    magSvg = '';
  } else if (weaponId === 'aug_a3' || isAsh12) {
    const bottomY = isExtended ? 92 : 84;
    const mX = isAsh12 ? 56 : 48;
    magSvg = `
      <g class="svg-part-mag">
        <polygon points="${mX},56 ${mX + 17},56 ${mX + 19},${bottomY} ${mX + 2},${bottomY}" fill="${magColor}" stroke="${magStroke}" stroke-width="1.4" opacity="0.95"/>
        ${magId === 'jungle_taped' ? `<rect x="${mX + 1}" y="66" width="18" height="4" fill="#2980b9"/>` : ''}
      </g>
    `;
  } else if (magId === 'drum_mag') {
    magSvg = `
      <g class="svg-part-mag">
        <rect x="132" y="54" width="16" height="16" fill="${magColor}" stroke="${magStroke}" stroke-width="1.3"/>
        <circle cx="140" cy="77" r="15" fill="${magColor}" stroke="#2ecc71" stroke-width="1.6"/>
        <circle cx="140" cy="77" r="7" fill="#111820" stroke="#7bed9f" stroke-width="1"/>
      </g>
    `;
  } else if (isLmg) {
    const boxH = isExtended ? 32 : 25;
    magSvg = `
      <g class="svg-part-mag">
        <rect x="128" y="58" width="34" height="${boxH}" rx="3" fill="#2d4232" stroke="${magStroke}" stroke-width="1.4"/>
        <line x1="133" y1="66" x2="157" y2="66" stroke="#f1c40f" stroke-width="2" stroke-dasharray="3,2"/>
      </g>
    `;
  } else if (weaponId === 'vector') {
    const len = isExtended ? 96 : 84;
    magSvg = `
      <g class="svg-part-mag">
        <polygon points="145,62 156,62 ${144},${len} ${133},${len}" fill="${magColor}" stroke="${magStroke}" stroke-width="1.4"/>
      </g>
    `;
  } else if (isAk || isMp5sd) {
    const ext = isExtended ? 94 : 83;
    const w = isMp5sd ? 10 : 15;
    magSvg = `
      <g class="svg-part-mag">
        <path d="M132,55 L${132 + w},55 Q${139 + w},73 ${147 + w},${ext} L${132 + w},${ext + 2} Q137,74 132,55 Z" fill="${isAk ? '#6e3b23' : magColor}" stroke="${magStroke}" stroke-width="1.4"/>
        ${magId === 'jungle_taped' ? `<rect x="133" y="66" width="${w + 6}" height="4" fill="#2980b9"/>` : ''}
      </g>
    `;
  } else if (!isShotgun) {
    const bottomY = isExtended ? 93 : isSniper || weaponId === 'mcx_spear' ? 76 : 83;
    const extraW = magId === 'quad_60' ? 5 : 0;
    magSvg = `
      <g class="svg-part-mag">
        <polygon points="132,55 ${148 + extraW},55 ${152 + extraW},${bottomY} 135,${bottomY}" fill="${magColor}" stroke="${magStroke}" stroke-width="1.4"/>
        ${magId === 'jungle_taped' ? `<polygon points="139,57 154,57 158,${bottomY - 1} 142,${bottomY - 1}" fill="#1a242f" stroke="#3498db" stroke-width="1.2"/><rect x="133" y="67" width="23" height="4" fill="#2980b9"/>` : ''}
        ${magId === 'fast_mag' ? `<path d="M136,${bottomY} Q144,${bottomY + 9} 151,${bottomY}" fill="none" stroke="#f1c40f" stroke-width="1.8"/>` : ''}
      </g>
    `;
  }

  let underbarrelSvg = '';
  if (gripId === 'angled_grip') {
    underbarrelSvg = `
      <g class="svg-part-grip">
        <polygon points="172,53 200,53 192,66 180,66" fill="#2c3e50" stroke="#2ecc71" stroke-width="1.4"/>
      </g>
    `;
  } else if (gripId === 'vert_foregrip' || gripId === 'rk1_b25u') {
    const skew = gripId === 'rk1_b25u' ? 7 : 0;
    underbarrelSvg = `
      <g class="svg-part-grip">
        <polygon points="178,53 190,53 ${190 - skew},73 ${178 - skew},73" fill="#1e2b37" stroke="#2ecc71" stroke-width="1.4"/>
      </g>
    `;
  } else if (gripId === 'bipod_grip') {
    underbarrelSvg = `
      <g class="svg-part-grip">
        <rect x="178" y="53" width="11" height="17" rx="2" fill="#1e2b37" stroke="#2ecc71" stroke-width="1.3"/>
        <line x1="202" y1="53" x2="192" y2="75" stroke="#7bed9f" stroke-width="2"/>
        <line x1="206" y1="53" x2="216" y2="75" stroke="#7bed9f" stroke-width="2"/>
      </g>
    `;
  } else if (gripId === 'match_laser' || gripId === 'mawl_c1') {
    const beamCol = gripId === 'mawl_c1' ? '#00ff88' : '#2ecc71';
    underbarrelSvg = `
      <g class="svg-part-grip">
        <rect x="178" y="53" width="11" height="17" rx="2" fill="#243447" stroke="${beamCol}" stroke-width="1.4"/>
        <rect x="188" y="34" width="22" height="6.5" rx="1" fill="#2c3e50" stroke="${beamCol}" stroke-width="1.3"/>
        <line x1="210" y1="37" x2="298" y2="37" stroke="${beamCol}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.95"/>
      </g>
    `;
  } else if (isSniper || isLmg) {
    underbarrelSvg = `
      <line x1="206" y1="53" x2="196" y2="73" stroke="#7f8c8d" stroke-width="2"/>
      <line x1="209" y1="53" x2="218" y2="73" stroke="#7f8c8d" stroke-width="2"/>
    `;
  }

  let opticSvg = '';
  const frontPostX = isSniper ? 224 : isSmg ? 192 : 208;
  if (!activeOpticType) {
    opticSvg = `
      <g class="svg-part-optic">
        <path d="M92,38 L97,29 L101,29 L103,38 Z" fill="#2c3e50" stroke="#f1c40f" stroke-width="1.2"/>
        <circle cx="99" cy="31" r="1.4" fill="#7bed9f"/>
        <path d="M${frontPostX - 4},40 L${frontPostX},28 L${frontPostX + 5},28 L${frontPostX + 7},40 Z" fill="#2c3e50" stroke="#f1c40f" stroke-width="1.2"/>
        <circle cx="${frontPostX + 2}" cy="29.5" r="1.4" fill="#7bed9f"/>
        <line x1="99" y1="30" x2="${frontPostX + 2}" y2="29.5" stroke="rgba(241,196,15,0.45)" stroke-width="1" stroke-dasharray="3,3"/>
      </g>
    `;
  } else if (activeOpticType === 'rmr' || activeOpticType === 'okp7') {
    const col = activeOpticType === 'okp7' ? '#2ecc71' : '#ff9f43';
    opticSvg = `
      <g class="svg-part-optic">
        <path d="M116,38 L120,26 L138,26 L140,38 Z" fill="#18222c" stroke="${col}" stroke-width="1.5"/>
        <circle cx="129" cy="31" r="2.3" fill="${col}"/>
      </g>
    `;
  } else if (activeOpticType === 'reddot' || activeOpticType === 'kobra') {
    opticSvg = `
      <g class="svg-part-optic">
        <rect x="116" y="25" width="26" height="13" rx="2" fill="#1e2933" stroke="#2ecc71" stroke-width="1.5"/>
        <circle cx="129" cy="31" r="2.5" fill="#e74c3c"/>
      </g>
    `;
  } else if (activeOpticType === 'holo' || activeOpticType === 'uh1') {
    opticSvg = `
      <g class="svg-part-optic">
        <rect x="112" y="23" width="32" height="15" rx="2" fill="#222f3d" stroke="#2ecc71" stroke-width="1.5"/>
        <rect x="117" y="26" width="16" height="8" rx="1" fill="#0d1821" stroke="#7bed9f" stroke-width="1"/>
        <circle cx="125" cy="30" r="2" fill="#e74c3c"/>
      </g>
    `;
  } else if (activeOpticType === 'holo3x') {
    opticSvg = `
      <g class="svg-part-optic">
        <rect x="98" y="24" width="22" height="14" rx="3" fill="#1b2631" stroke="#74b9ff" stroke-width="1.4"/>
        <rect x="124" y="23" width="28" height="15" rx="2" fill="#222f3d" stroke="#2ecc71" stroke-width="1.5"/>
        <circle cx="138" cy="30" r="2" fill="#e74c3c"/>
      </g>
    `;
  } else if (activeOpticType === 'prism2x' || activeOpticType === 'acog' || activeOpticType === 'elcan4x') {
    const bodyFill = activeOpticType === 'elcan4x' ? '#5c503a' : '#22303f';
    opticSvg = `
      <g class="svg-part-optic">
        <polygon points="104,21 154,19 158,36 144,38 110,38 104,33" fill="${bodyFill}" stroke="#2ecc71" stroke-width="1.5"/>
        ${activeOpticType === 'acog' ? '<line x1="116" y1="19" x2="144" y2="19" stroke="#e74c3c" stroke-width="2.2"/>' : '<circle cx="130" cy="28" r="2.2" fill="#f1c40f"/>'}
      </g>
    `;
  } else if (activeOpticType === 'flir') {
    opticSvg = `
      <g class="svg-part-optic">
        <rect x="98" y="18" width="66" height="19" rx="3" fill="#1c2329" stroke="#ff9f43" stroke-width="1.6"/>
        <rect x="162" y="19" width="6" height="17" rx="1" fill="#ffa502"/>
        <circle cx="124" cy="27" r="3" fill="#ff6b6b"/>
      </g>
    `;
  } else {
    // valday6x / lpvo36 / sniper8x / sniper12x stepped variable / sniper scope
    const rightX = activeOpticType === 'sniper12x' ? 184 : 176;
    opticSvg = `
      <g class="svg-part-optic">
        <rect x="112" y="31" width="6" height="7" fill="#34495e"/>
        <rect x="148" y="31" width="6" height="7" fill="#34495e"/>
        <polygon points="94,18 ${rightX},15 ${rightX},31 154,28 112,28 94,30" fill="#1a2530" stroke="#2ecc71" stroke-width="1.5"/>
        <rect x="131" y="13" width="8" height="5" fill="#f1c40f"/>
      </g>
    `;
  }
  if (hasCanted && activeOpticType) {
    opticSvg += `<circle cx="164" cy="34" r="2.4" fill="#ff4757" stroke="#111" stroke-width="0.8"/>`;
  }

  const ammoTipCol =
    ammoId === 'ap_rounds' || ammoId === 'm855a1_bp'
      ? '#f1c40f'
      : ammoId === 'overpressure' || ammoId === 'rip_flesh'
      ? '#e74c3c'
      : ammoId === 'ap20_slug'
      ? '#ff9f43'
      : ammoId === 'subsonic_match'
      ? '#3498db'
      : '#d35400';

  const chamberSvg = `
    <rect x="128" y="42" width="16" height="5" rx="1" fill="#111" stroke="${ammoTipCol}" stroke-width="1.2"/>
  `;

  return `
    <svg viewBox="0 0 310 98" style="width:100%;height:${heightPx}px;display:block;overflow:visible;">
      ${stockSvg}
      ${barrelAndMuzzleSvg}
      ${underbarrelSvg}
      ${magSvg}
      ${gripSvg}
      ${receiverSvg}
      ${chamberSvg}
      ${opticSvg}
    </svg>
  `;
}

export function buildGearSvg(kind, id = '') {
  if (kind === 'vest') {
    const col =
      id === 'heavy_vest'
        ? '#f1c40f'
        : id === 'plate_vest'
        ? '#3498db'
        : id === 'triton_rig'
        ? '#2ecc71'
        : '#7f8c8d';
    return `
      <svg viewBox="0 0 80 76" style="width:58px;height:54px;display:block;margin:0 auto;">
        <path d="M22,10 L32,10 L35,20 L45,20 L48,10 L58,10 L66,26 L58,34 L58,66 L22,66 L22,34 L14,26 Z" fill="rgba(30,42,54,0.95)" stroke="${col}" stroke-width="2"/>
        <rect x="28" y="28" width="24" height="16" rx="2" fill="rgba(255,255,255,0.08)" stroke="${col}" stroke-width="1.3"/>
        <rect x="24" y="48" width="7" height="13" rx="1" fill="${col}" opacity="0.78"/>
        <rect x="33" y="48" width="7" height="13" rx="1" fill="${col}" opacity="0.78"/>
        <rect x="42" y="48" width="7" height="13" rx="1" fill="${col}" opacity="0.78"/>
        <rect x="51" y="48" width="5" height="13" rx="1" fill="${col}" opacity="0.55"/>
      </svg>
    `;
  }
  if (kind === 'tacticalGear') {
    const isNvg = id === 'gpnvg18_nvg';
    const isAltyn = id === 'altyn_faceshield';
    const isStim = id === 'propital_rig';
    const isFast = id === 'fast_mt_comtac';
    const col = isNvg
      ? '#00ff88'
      : isStim
      ? '#ff6b6b'
      : isAltyn
      ? '#f1c40f'
      : isFast
      ? '#48dbfb'
      : '#95a5a6';
    if (isStim) {
      return `
        <svg viewBox="0 0 80 76" style="width:58px;height:54px;display:block;margin:0 auto;">
          <rect x="18" y="18" width="44" height="44" rx="6" fill="rgba(42,24,28,0.95)" stroke="${col}" stroke-width="2"/>
          <rect x="28" y="10" width="9" height="42" rx="2" fill="#f1c40f" stroke="#fff" stroke-width="1"/>
          <rect x="43" y="10" width="9" height="42" rx="2" fill="#2ecc71" stroke="#fff" stroke-width="1"/>
          <path d="M36,44 L44,44 M40,40 L40,48" stroke="#fff" stroke-width="2.4"/>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 80 76" style="width:58px;height:54px;display:block;margin:0 auto;">
        <path d="M16,42 C16,18 64,18 64,42 L60,54 L20,54 Z" fill="rgba(28,38,46,0.96)" stroke="${col}" stroke-width="2"/>
        ${
          isAltyn
            ? `<rect x="22" y="36" width="36" height="22" rx="3" fill="#2c3e50" stroke="${col}" stroke-width="1.8"/><rect x="27" y="42" width="26" height="5" rx="1" fill="#0b131b" stroke="#7bed9f" stroke-width="1"/>`
            : ''
        }
        ${
          isNvg
            ? `<circle cx="23" cy="36" r="5" fill="#081a12" stroke="#00ff88" stroke-width="1.6"/>
               <circle cx="34" cy="36" r="5" fill="#081a12" stroke="#00ff88" stroke-width="1.6"/>
               <circle cx="46" cy="36" r="5" fill="#081a12" stroke="#00ff88" stroke-width="1.6"/>
               <circle cx="57" cy="36" r="5" fill="#081a12" stroke="#00ff88" stroke-width="1.6"/>`
            : ''
        }
        ${
          isFast
            ? `<ellipse cx="18" cy="46" rx="5" ry="9" fill="#1e293b" stroke="${col}" stroke-width="1.5"/>
               <ellipse cx="62" cy="46" rx="5" ry="9" fill="#1e293b" stroke="${col}" stroke-width="1.5"/>`
            : ''
        }
      </svg>
    `;
  }
  if (kind === 'backpack') {
    const isRaid = id === 'raid_pack';
    const isLarge = id === 'beta2_pack';
    const isMed = id === 'berkut_pack';
    const isSmall = id === 'sling_pack';
    const col = isRaid
      ? '#f1c40f'
      : isLarge
      ? '#e67e22'
      : isMed
      ? '#2ecc71'
      : isSmall
      ? '#3498db'
      : '#7f8c8d';
    const fill = isRaid
      ? 'rgba(55, 68, 46, 0.95)'
      : isLarge
      ? 'rgba(62, 52, 38, 0.95)'
      : isMed
      ? 'rgba(36, 52, 42, 0.95)'
      : 'rgba(28, 38, 48, 0.95)';
    const w = isRaid ? 44 : isLarge ? 38 : isMed ? 34 : isSmall ? 28 : 22;
    const h = isRaid ? 54 : isLarge ? 48 : isMed ? 42 : isSmall ? 36 : 28;
    const x = 40 - w / 2;
    const y = 40 - h / 2;
    return `
      <svg viewBox="0 0 80 76" style="width:58px;height:54px;display:block;margin:0 auto;">
        <path d="M33,${y} Q40,${y - 7} 47,${y}" fill="none" stroke="${col}" stroke-width="2.2"/>
        <path d="M${x},${y + 8} Q${x - 7},40 ${x},${y + h - 4}" fill="none" stroke="${col}" stroke-width="2" opacity="0.75"/>
        <path d="M${x + w},${y + 8} Q${x + w + 7},40 ${x + w},${y + h - 4}" fill="none" stroke="${col}" stroke-width="2" opacity="0.75"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${col}" stroke-width="2"/>
        <path d="M${x},${y + 12} L${x + w},${y + 12}" stroke="${col}" stroke-width="1.4" opacity="0.85"/>
        <rect x="${x + 5}" y="${y + 17}" width="${w - 10}" height="${Math.max(10, h - 23)}" rx="2" fill="rgba(0,0,0,0.28)" stroke="${col}" stroke-width="1.1"/>
        ${
          isRaid || isLarge
            ? `<rect x="${x - 5}" y="${y + 14}" width="5" height="${h - 22}" rx="1.5" fill="${fill}" stroke="${col}" stroke-width="1.2"/>
               <rect x="${x + w}" y="${y + 14}" width="5" height="${h - 22}" rx="1.5" fill="${fill}" stroke="${col}" stroke-width="1.2"/>`
            : ''
        }
      </svg>
    `;
  }
  if (kind === 'optic') {
    return `
      <svg viewBox="0 0 90 50" style="width:100%;height:34px;display:block;">
        <polygon points="16,16 74,12 74,34 56,30 32,30 16,32" fill="#1e2b37" stroke="#74b9ff" stroke-width="1.6"/>
        <circle cx="45" cy="22" r="4" fill="none" stroke="#e74c3c" stroke-width="1.5"/>
        <rect x="28" y="30" width="34" height="7" fill="#34495e"/>
      </svg>
    `;
  }
  if (kind === 'muzzle') {
    return `
      <svg viewBox="0 0 90 50" style="width:100%;height:34px;display:block;">
        <rect x="14" y="16" width="62" height="18" rx="4" fill="#1c2833" stroke="#2ecc71" stroke-width="1.6"/>
        <line x1="28" y1="16" x2="28" y2="34" stroke="#7bed9f" stroke-width="1.2"/>
        <line x1="44" y1="16" x2="44" y2="34" stroke="#7bed9f" stroke-width="1.2"/>
        <line x1="60" y1="16" x2="60" y2="34" stroke="#7bed9f" stroke-width="1.2"/>
      </svg>
    `;
  }
  if (kind === 'magazine') {
    return `
      <svg viewBox="0 0 80 54" style="width:100%;height:34px;display:block;">
        <path d="M28,8 L48,8 Q54,28 58,46 L38,48 Q32,28 28,8 Z" fill="#22303c" stroke="#f1c40f" stroke-width="1.6"/>
        <circle cx="44" cy="14" r="2.5" fill="#f39c12"/>
      </svg>
    `;
  }
  if (kind === 'grip') {
    return `
      <svg viewBox="0 0 80 54" style="width:100%;height:34px;display:block;">
        <rect x="18" y="12" width="44" height="7" fill="#34495e"/>
        <polygon points="30,19 48,19 42,45 28,44" fill="#1f2e3d" stroke="#2ecc71" stroke-width="1.6"/>
      </svg>
    `;
  }
  if (kind === 'ammoType') {
    return `
      <svg viewBox="0 0 80 54" style="width:100%;height:34px;display:block;">
        <rect x="20" y="22" width="40" height="22" rx="2" fill="#2c3e50" stroke="#e67e22" stroke-width="1.5"/>
        <path d="M28,22 L28,12 L31,6 L34,12 L34,22 Z" fill="#f1c40f"/>
        <path d="M38,22 L38,12 L41,6 L44,12 L44,22 Z" fill="#e74c3c"/>
        <path d="M48,22 L48,12 L51,6 L54,12 L54,22 Z" fill="#f1c40f"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 80 54" style="width:100%;height:36px;display:block;">
      <rect x="14" y="12" width="52" height="32" rx="3" fill="#1e2d24" stroke="#2ecc71" stroke-width="1.6"/>
      <line x1="14" y1="24" x2="66" y2="24" stroke="#2ecc71" stroke-width="1.2"/>
      <rect x="33" y="19" width="14" height="10" rx="1" fill="#f1c40f"/>
    </svg>
  `;
}
