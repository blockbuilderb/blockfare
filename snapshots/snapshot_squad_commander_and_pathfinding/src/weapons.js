import * as THREE from '../vendor/three.module.js';
import { TEXTURES } from './textures.js?v=22';

export const WEAPON_DEFS = {
  m4a1: {
    id: 'm4a1',
    name: 'M4A1 TACTICAL',
    shortName: 'M4A1',
    caliber: 'AUTO • 5.56x45MM • EOTECH HOLO',
    type: 'gun',
    opticType: 'holo',
    soundType: 'rifle',
    auto: true,
    rpm: 760,
    damage: 30,
    headshotMult: 1.9,
    voxelDamage: 26,
    clipSize: 30,
    reserveAmmo: 180,
    reloadTime: 1.75,
    recoilPitch: 0.014,
    recoilYaw: 0.006,
    spreadHip: 0.02,
    spreadAds: 0.0001,
    adsFov: 44,
    hasCantedSight: true,
    bodyColor: 0x282d33,
    accentColor: 0x4e5835
  },
  ak15: {
    id: 'ak15',
    name: 'AK-15 ASSAULT',
    shortName: 'AK-15',
    caliber: 'AUTO • 7.62x39MM • KOBRA REFLEX',
    type: 'gun',
    opticType: 'kobra',
    soundType: 'rifle',
    auto: true,
    rpm: 640,
    damage: 37,
    headshotMult: 2.0,
    voxelDamage: 34,
    clipSize: 30,
    reserveAmmo: 180,
    reloadTime: 1.85,
    recoilPitch: 0.019,
    recoilYaw: 0.008,
    spreadHip: 0.024,
    spreadAds: 0.0001,
    adsFov: 44,
    hasCantedSight: true,
    bodyColor: 0x22262a,
    accentColor: 0x784828
  },
  vector: {
    id: 'vector',
    name: 'KRISS VECTOR .45',
    shortName: 'VECTOR',
    caliber: 'AUTO • .45 ACP • AIMPOINT MICRO',
    type: 'gun',
    opticType: 'reddot',
    soundType: 'smg',
    auto: true,
    rpm: 1100,
    damage: 23,
    headshotMult: 1.75,
    voxelDamage: 16,
    clipSize: 40,
    reserveAmmo: 240,
    reloadTime: 1.5,
    recoilPitch: 0.011,
    recoilYaw: 0.007,
    spreadHip: 0.018,
    spreadAds: 0.0002,
    adsFov: 48,
    bodyColor: 0x2c3035,
    accentColor: 0x8c8265
  },
  m249: {
    id: 'm249',
    name: 'M249 SAW LMG',
    shortName: 'M249',
    caliber: 'AUTO • 5.56MM • 3.4X ACOG + CANTED',
    type: 'gun',
    opticType: 'acog',
    soundType: 'lmg',
    auto: true,
    rpm: 800,
    damage: 28,
    headshotMult: 1.8,
    voxelDamage: 42,
    clipSize: 100,
    reserveAmmo: 300,
    reloadTime: 2.8,
    recoilPitch: 0.016,
    recoilYaw: 0.01,
    spreadHip: 0.03,
    spreadAds: 0.0002,
    adsFov: 34,
    hasCantedSight: true,
    bodyColor: 0x2b3036,
    accentColor: 0x3b4d3b
  },
  sv98: {
    id: 'sv98',
    name: 'SV-98M SNIPER',
    shortName: 'SV-98',
    caliber: 'BOLT • 7.62x54R • 8X SCOPE + CANTED',
    type: 'gun',
    opticType: 'sniper8x',
    soundType: 'sniper',
    auto: false,
    rpm: 56,
    damage: 94,
    headshotMult: 2.5,
    voxelDamage: 65,
    clipSize: 10,
    reserveAmmo: 60,
    reloadTime: 2.2,
    recoilPitch: 0.052,
    recoilYaw: 0.004,
    spreadHip: 0.05,
    spreadAds: 0.0,
    adsFov: 15,
    hasCantedSight: true,
    isScoped: true,
    bodyColor: 0x3d5235,
    accentColor: 0x1c1e21
  },
  mp443: {
    id: 'mp443',
    name: 'MP-443 GRACH',
    shortName: 'MP443',
    caliber: 'SEMI • 9x19MM • TRITIUM IRON SIGHTS',
    type: 'gun',
    opticType: 'iron',
    soundType: 'pistol',
    auto: false,
    rpm: 460,
    damage: 26,
    headshotMult: 1.85,
    voxelDamage: 14,
    clipSize: 18,
    reserveAmmo: 90,
    reloadTime: 1.2,
    recoilPitch: 0.012,
    recoilYaw: 0.004,
    spreadHip: 0.015,
    spreadAds: 0.0001,
    adsFov: 54,
    bodyColor: 0x222629,
    accentColor: 0x3c4248
  },
  rpg7: {
    id: 'rpg7',
    name: 'RPG-7V2 HEAT LAUNCHER',
    shortName: 'RPG-7',
    caliber: 'EXPLOSIVE • 85MM PG-7V • PGO-7 OPTIC',
    type: 'rpg',
    opticType: 'rpgSight',
    auto: false,
    rpm: 38,
    clipSize: 1,
    reserveAmmo: 6,
    reloadTime: 2.2,
    recoilPitch: 0.055,
    recoilYaw: 0.01,
    adsFov: 42,
    bodyColor: 0x4b5338,
    accentColor: 0x6e472b
  },
  c4: {
    id: 'c4',
    name: 'C4 BREACH CHARGE',
    shortName: 'C4 CHARGE',
    caliber: 'LMB: THROW • RMB: DETONATE',
    type: 'c4',
    auto: false,
    rpm: 100,
    clipSize: 5,
    reserveAmmo: 5,
    reloadTime: 1.4,
    adsFov: 68,
    bodyColor: 0x5c6650,
    accentColor: 0xc0392b
  },
  medkit: {
    id: 'medkit',
    name: 'COMBAT MEDKIT BOX',
    shortName: 'MEDKIT',
    caliber: 'HOLD LMB: RAPID HEAL + BANDAGE',
    type: 'medkit',
    auto: true,
    rpm: 300,
    clipSize: 100,
    reserveAmmo: 100,
    reloadTime: 0.5,
    adsFov: 68,
    bodyColor: 0x27ae60,
    accentColor: 0xecf0f1
  },
  hammer: {
    id: 'hammer',
    name: 'TACTICAL SLEDGE / BUILDER',
    shortName: 'HAMMER',
    caliber: 'LMB: BUILD HESCO • RMB: BREACH WALL',
    type: 'hammer',
    auto: false,
    rpm: 150,
    clipSize: 99,
    reserveAmmo: 99,
    reloadTime: 0.5,
    adsFov: 68,
    bodyColor: 0x7f8c8d,
    accentColor: 0x8c6239
  },
  ammocrate: {
    id: 'ammocrate',
    name: 'AMMO SUPPLY CRATE',
    shortName: 'AMMO',
    caliber: 'LMB: DROP AMMO CRATE (RESUPPLIES TEAM)',
    type: 'ammocrate',
    auto: false,
    rpm: 30,
    clipSize: 3,
    reserveAmmo: 3,
    reloadTime: 0.5,
    adsFov: 68,
    bodyColor: 0x27ae60,
    accentColor: 0x2ecc71
  }
};

export const CLASS_LOADOUTS = {
  engineer: ['m4a1', 'mp443', 'rpg7', 'hammer'],
  assault: ['ak15', 'mp443', 'c4', 'hammer'],
  medic: ['vector', 'mp443', 'medkit', 'hammer'],
  support: ['m249', 'mp443', 'ammocrate', 'hammer'],
  recon: ['sv98', 'mp443', 'c4', 'hammer']
};

export function createWeaponViewModel(def, team = 'US') {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.bodyColor,
    roughness: 0.5,
    metalness: 0.4,
    flatShading: true
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: def.accentColor,
    roughness: 0.72,
    flatShading: true
  });

  const sleeveMat = new THREE.MeshStandardMaterial({
    map: team === 'US' ? TEXTURES.camoUS : TEXTURES.camoRU,
    roughness: 0.85
  });

  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.8
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe0b899,
    roughness: 0.8
  });

  const buildArm = (isLeft) => {
    const armGroup = new THREE.Group();
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.28), sleeveMat);
    forearm.position.set(0, 0, 0.14);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.058, 0.04), skinMat);
    wrist.position.set(0, 0, -0.01);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.068, 0.085), gloveMat);
    glove.position.set(0, 0, -0.05);
    armGroup.add(forearm, wrist, glove);
    armGroup.name = isLeft ? 'leftArmGroup' : 'rightArmGroup';
    return armGroup;
  };

  const leftArm = buildArm(true);
  const rightArm = buildArm(false);

  if (def.type === 'rpg') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.96, 8), accentMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0, -0.18);
    group.add(tube);

    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.34, 8), bodyMat);
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.set(0, 0, -0.76);
    warhead.name = 'rpgWarhead';
    group.add(warhead);

    // Hollow RPG Iron/Optical Sight Frame at y = 0.082
    const sightGroup = new THREE.Group();
    sightGroup.position.set(0, 0.082, -0.34);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.012), bodyMat);
    postL.position.x = -0.022;
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.012), bodyMat);
    postR.position.x = 0.022;
    const barT = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.012), bodyMat);
    barT.position.y = 0.022;
    const frontPin = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.024, 0.005),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    frontPin.position.y = -0.008;
    sightGroup.add(postL, postR, barT, frontPin);
    sightGroup.name = 'opticSightGroup';
    group.add(sightGroup);

    leftArm.position.set(-0.06, -0.06, -0.36);
    leftArm.rotation.set(0.2, 0.35, 0);
    rightArm.position.set(0.04, -0.08, -0.14);
    rightArm.rotation.set(0.15, -0.1, 0);
    group.add(leftArm, rightArm);
  } else if (def.type === 'c4') {
    const clacker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.04), bodyMat);
    clacker.position.set(0.08, -0.04, -0.22);
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.018, 0.018),
      new THREE.MeshBasicMaterial({ color: 0xff2222 })
    );
    led.position.set(0.08, 0.02, -0.22);

    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.19), accentMat);
    brick.position.set(-0.08, -0.03, -0.26);
    group.add(clacker, led, brick);

    leftArm.position.set(-0.09, -0.06, -0.24);
    rightArm.position.set(0.08, -0.07, -0.2);
    group.add(leftArm, rightArm);
  } else if (def.type === 'medkit') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.14), bodyMat);
    box.position.set(0, -0.03, -0.26);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.145), accentMat);
    crossH.position.set(0, -0.03, -0.26);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.145), accentMat);
    crossV.position.set(0, -0.03, -0.26);
    group.add(box, crossH, crossV);

    leftArm.position.set(-0.09, -0.05, -0.25);
    rightArm.position.set(0.09, -0.05, -0.25);
    group.add(leftArm, rightArm);
  } else if (def.type === 'hammer') {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.44, 0.038), accentMat);
    handle.position.set(0, -0.04, -0.28);
    handle.rotation.x = -0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.085, 0.095), bodyMat);
    head.position.set(0, 0.14, -0.36);
    group.add(handle, head);

    rightArm.position.set(0.03, -0.09, -0.24);
    leftArm.position.set(-0.03, -0.14, -0.2);
    group.add(leftArm, rightArm);
  } else {
    const isPistol = def.id === 'mp443';
    const length = isPistol ? 0.26 : def.id === 'sv98' ? 0.86 : def.id === 'vector' ? 0.48 : 0.66;

    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.092, length * 0.62),
      bodyMat
    );
    receiver.position.set(0, 0, -0.22);
    group.add(receiver);

    // Picatinny top rail along upper receiver & handguard (clearly visible in ADS view!)
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.014, length * 0.88),
      accentMat
    );
    topRail.position.set(0, 0.049, -0.22 - length * 0.16);
    group.add(topRail);

    if (!isPistol) {
      // Rear charging handle / receiver tang visible at the base of the optic in ADS
      const chargingHandle = new THREE.Mesh(
        new THREE.BoxGeometry(0.056, 0.018, 0.045),
        accentMat
      );
      chargingHandle.position.set(0, 0.046, -0.09);
      group.add(chargingHandle);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.1, 0.2), accentMat);
      stock.position.set(0, -0.018, -0.04);
      group.add(stock);
    }

    const handguard = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.08, length * 0.48),
      accentMat
    );
    handguard.position.set(0, 0, -0.22 - length * 0.44);
    group.add(handguard);

    if (!isPistol) {
      // Forward tactical PEQ-15 laser box & front gas block visible ahead of optic in ADS
      const peqBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.022, 0.075),
        bodyMat
      );
      peqBox.position.set(0.018, 0.046, -0.22 - length * 0.46);
      group.add(peqBox);

      const frontGasBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.038, 0.032),
        bodyMat
      );
      frontGasBlock.position.set(0, 0.032, -0.22 - length * 0.64);
      group.add(frontGasBlock);
    }

    if (!isPistol && def.id !== 'sv98') {
      const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.09, 0.036), bodyMat);
      foregrip.position.set(0, -0.068, -0.22 - length * 0.42);
      group.add(foregrip);
    }

    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.024, length * 0.44),
      bodyMat
    );
    barrel.position.set(0, 0.012, -0.22 - length * 0.72);
    group.add(barrel);

    const magHeight = def.id === 'm249' ? 0.15 : isPistol ? 0.11 : 0.18;
    const magWidth = def.id === 'm249' ? 0.12 : 0.044;
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(magWidth, magHeight, 0.072),
      accentMat
    );
    mag.position.set(0, -0.105, isPistol ? -0.17 : -0.29);
    mag.rotation.x = isPistol ? 0.14 : -0.18;
    mag.name = 'magazineMesh';
    group.add(mag);

    // =========================================================================
    // HOLLOW SEE-THROUGH 3D OPTIC SIGHT HOUSING (Centered at y = 0.082)
    // =========================================================================
    if (!isPistol) {
      const sightGroup = new THREE.Group();
      sightGroup.position.set(0, 0.082, -0.22);
      sightGroup.name = 'opticSightGroup';

      const depth = def.opticType === 'acog' ? 0.13 : def.isScoped ? 0.26 : 0.075;
      const frameW = 0.054;
      const frameH = 0.046;
      const wallT = 0.0065;

      // Bottom rail base, Left wall, Right wall, Top hood (Hollow inside!)
      const baseBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, depth), bodyMat);
      baseBar.position.y = -frameH / 2;

      const topBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, depth), bodyMat);
      topBar.position.y = frameH / 2;

      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, depth), bodyMat);
      leftWall.position.x = -frameW / 2;

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, depth), bodyMat);
      rightWall.position.x = frameW / 2;

      // Translucent cyan optic glass lens (no duplicate 3D reticle dot inside—
      // the crisp ADS optic overlay provides the single precision aiming point!)
      const glassMat = new THREE.MeshBasicMaterial({
        color: 0x55ccff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false
      });
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(frameW - wallT * 2, frameH - wallT * 2, 0.002),
        glassMat
      );

      sightGroup.add(baseBar, topBar, leftWall, rightWall, lens);
      group.add(sightGroup);
    } else {
      // Pistol Iron Sight Posts
      const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.008), bodyMat);
      rearL.position.set(-0.012, 0.056, -0.12);
      const rearR = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.008), bodyMat);
      rearR.position.set(0.012, 0.056, -0.12);
      const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.013, 0.008), bodyMat);
      frontDot.position.set(0, 0.056, -0.34);
      group.add(rearL, rearR, frontDot);
    }

    if (isPistol) {
      leftArm.position.set(-0.03, -0.08, -0.15);
      leftArm.rotation.set(0.15, 0.25, 0);
      rightArm.position.set(0.03, -0.075, -0.14);
      rightArm.rotation.set(0.15, -0.15, 0);
    } else {
      leftArm.position.set(-0.045, -0.065, -0.22 - length * 0.38);
      leftArm.rotation.set(0.22, 0.38, -0.1);
      rightArm.position.set(0.038, -0.085, -0.16);
      rightArm.rotation.set(0.12, -0.08, 0);
    }
    group.add(leftArm, rightArm);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0
    });
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.17), flashMat);
    flash.position.set(0, 0.01, -0.26 - length * 0.88);
    flash.name = 'muzzleFlash';
    group.add(flash);
  }

  return group;
}
