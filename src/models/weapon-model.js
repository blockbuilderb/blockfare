// ============================================================================
// 3D FIRST-PERSON WEAPON, ATTACHMENT & ARMS MODEL BUILDER (src/models/weapon-model.js)
// Accurate real-life firearm & melee geometry:
// - M4A1 (SOPMOD stock, stepped receiver, STANAG angled mag, A2 front sight)
// - AK-15 (Stamped receiver, curved 30R banana mag, 45° gas block, folding stock)
// - FN SCAR-H (Monolithic FDE upper, folding Ugg-boot stock, straight 7.62 NATO mag)
// - AS VAL (Integral full-length knurled suppressor barrel, tubular skeleton stock)
// - FN P90 TR (Bullpup monobody, translucent top-mounted 50R horizontal mag)
// - Steyr AUG A3 (Bullpup rear magwell, integrated front vertical foregrip, A3 rail)
// - KRISS Vector (Super-V downward recoil block, forward-angled Glock .45 mag)
// - HK MP7A2 (Grip-fed PDW magazine, collapsible wire stock, folding foregrip)
// - Benelli M1014 (Full-length underbarrel tube magazine, ribbed forend, ghost ring)
// - M249 SAW / PKP Pecheneg (Bipod, heatshield, box mag + brass ammo feed belt)
// - SV-98 / AWM .338 (Thumbhole sniper chassis, fluted barrel, muzzle brake, bolt knob)
// - MK14 EBR (Twin-rod EBR chassis, long barrel, 20R box mag)
// - M9 Beretta / MP-443 / Glock 18C / Desert Eagle / USP .45 (Reciprocating slides)
// - ★ Karambit & ★ Butterfly Knife (Single right-hand grip + CS2 spin/flip pivots!)
// ============================================================================

import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=144';

// Cached shared geometries & materials for 1st-person Spec-Ops Operator Arms, Watch & Articulated Tactical Gloves
const _fpArmGeos = {
  upperSleeve: new THREE.CylinderGeometry(0.039, 0.045, 0.22, 10),
  forearmSleeve: new THREE.CylinderGeometry(0.033, 0.04, 0.22, 10),
  sleeveFold: new THREE.CylinderGeometry(0.042, 0.041, 0.038, 10),
  elbowPad: new THREE.BoxGeometry(0.056, 0.026, 0.095),
  wristSkin: new THREE.CylinderGeometry(0.027, 0.03, 0.046, 10),
  gloveCuff: new THREE.CylinderGeometry(0.031, 0.032, 0.034, 10),
  velcroTab: new THREE.BoxGeometry(0.038, 0.012, 0.024),
  watchBand: new THREE.CylinderGeometry(0.0315, 0.0315, 0.022, 12),
  watchCase: new THREE.BoxGeometry(0.034, 0.012, 0.038),
  watchScreen: new THREE.BoxGeometry(0.026, 0.004, 0.028),
  watchTick: new THREE.BoxGeometry(0.016, 0.0045, 0.005),
  palmCore: new THREE.BoxGeometry(0.06, 0.034, 0.074),
  suedePatch: new THREE.BoxGeometry(0.054, 0.008, 0.062),
  knuckleGuard: new THREE.BoxGeometry(0.062, 0.012, 0.022),
  knucklePod: new THREE.SphereGeometry(0.0075, 6, 6),
  thumbProx: new THREE.CylinderGeometry(0.0095, 0.011, 0.036, 8),
  thumbDist: new THREE.CylinderGeometry(0.008, 0.0095, 0.028, 8),
  fingerProx: new THREE.CylinderGeometry(0.008, 0.009, 0.034, 7),
  fingerDist: new THREE.CylinderGeometry(0.007, 0.008, 0.028, 7)
};
for (const g of Object.values(_fpArmGeos)) {
  g.userData.shared = true;
}

const _fpWatchCaseMat = new THREE.MeshStandardMaterial({
  color: 0x15191e,
  roughness: 0.35,
  metalness: 0.78
});
_fpWatchCaseMat.userData.shared = true;
const _fpWatchScreenMat = new THREE.MeshBasicMaterial({ color: 0x0a2e24 });
_fpWatchScreenMat.userData.shared = true;
const _fpWatchGlowMat = new THREE.MeshBasicMaterial({ color: 0x2ed573 });
_fpWatchGlowMat.userData.shared = true;
const _fpCarbonKnuckleMat = new THREE.MeshStandardMaterial({
  color: 0x111418,
  roughness: 0.26,
  metalness: 0.65
});
_fpCarbonKnuckleMat.userData.shared = true;
const _fpTanSuedeMat = new THREE.MeshStandardMaterial({
  color: 0x594a3a,
  roughness: 0.88
});
_fpTanSuedeMat.userData.shared = true;

export function createWeaponViewModel(def, team = 'US', custom = {}) {
  const group = new THREE.Group();

  const skinFinish = def.skinFinish || (custom && custom.skinFinish) || null;
  const isPureGold = skinFinish === 'pure_gold';
  const isPureBlue = skinFinish === 'pure_blue';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPureGold ? 0xffd32a : isPureBlue ? 0x0652dd : def.bodyColor,
    roughness: isPureGold || isPureBlue ? 0.15 : 0.46,
    metalness: isPureGold ? 0.94 : isPureBlue ? 0.88 : 0.45,
    emissive: isPureGold ? 0x2a1d00 : isPureBlue ? 0x001542 : 0x000000,
    flatShading: true
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: isPureGold ? 0xd4af37 : isPureBlue ? 0x00d2d3 : def.accentColor,
    roughness: isPureGold || isPureBlue ? 0.2 : 0.68,
    metalness: isPureGold || isPureBlue ? 0.86 : 0.3,
    emissive: isPureGold ? 0x1f1400 : isPureBlue ? 0x002438 : 0x000000,
    flatShading: true
  });

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: isPureGold ? 0xe5b822 : isPureBlue ? 0x0984e3 : 0x181c20,
    roughness: isPureGold || isPureBlue ? 0.18 : 0.38,
    metalness: isPureGold || isPureBlue ? 0.9 : 0.72,
    flatShading: true
  });

  const sleeveMat = new THREE.MeshStandardMaterial({
    map: team === 'US' ? TEXTURES.camoUS : TEXTURES.camoRU,
    roughness: 0.85
  });

  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.78
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe0b899,
    roughness: 0.8
  });

  const buildArm = (isLeft) => {
    const armGroup = new THREE.Group();
    const sideSign = isLeft ? 1 : -1;

    // 1. Extended Combat-Shirt Upper/Lower Forearm Sleeve + Rolled Cuff + Molded Elbow Pad
    const upperSleeve = new THREE.Mesh(_fpArmGeos.upperSleeve, sleeveMat);
    upperSleeve.rotation.x = Math.PI / 2;
    upperSleeve.position.set(sideSign * 0.008, -0.012, 0.31);

    const forearm = new THREE.Mesh(_fpArmGeos.forearmSleeve, sleeveMat);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.set(0, -0.003, 0.135);

    const sleeveFold = new THREE.Mesh(_fpArmGeos.sleeveFold, sleeveMat);
    sleeveFold.rotation.x = Math.PI / 2;
    sleeveFold.position.set(0, -0.002, 0.036);

    const elbowPad = new THREE.Mesh(_fpArmGeos.elbowPad, _fpCarbonKnuckleMat);
    elbowPad.position.set(sideSign * 0.006, -0.036, 0.25);

    // 2. Exposed Wrist + Tactical Wrist Gear (Garmin/Tactical Watch on Left Arm, Paracord Cuff on Right Arm)
    const wrist = new THREE.Mesh(_fpArmGeos.wristSkin, skinMat);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, 0, 0.006);

    const gloveCuff = new THREE.Mesh(_fpArmGeos.gloveCuff, gloveMat);
    gloveCuff.rotation.x = Math.PI / 2;
    gloveCuff.position.set(0, 0, -0.016);

    const velcroTab = new THREE.Mesh(_fpArmGeos.velcroTab, _fpTanSuedeMat);
    velcroTab.position.set(0, 0.028, -0.016);

    armGroup.add(upperSleeve, forearm, sleeveFold, elbowPad, wrist, gloveCuff, velcroTab);

    if (isLeft) {
      // Inward-canted Operator Tactical Watch / GPS Foretrex (visible during hipfire,ADS, reload & inspect!)
      const watchGroup = new THREE.Group();
      watchGroup.name = 'tacticalWatchGroup';
      watchGroup.position.set(0, 0, 0.008);
      watchGroup.rotation.z = -0.78; // Angled inward toward the operator's eyes
      const band = new THREE.Mesh(_fpArmGeos.watchBand, _fpWatchCaseMat);
      band.rotation.x = Math.PI / 2;
      const bezel = new THREE.Mesh(_fpArmGeos.watchCase, _fpWatchCaseMat);
      bezel.position.set(0, 0.031, 0);
      const screen = new THREE.Mesh(_fpArmGeos.watchScreen, _fpWatchScreenMat);
      screen.position.set(0, 0.036, 0);
      const readoutTop = new THREE.Mesh(_fpArmGeos.watchTick, _fpWatchGlowMat);
      readoutTop.position.set(0, 0.0375, -0.005);
      const readoutBot = new THREE.Mesh(_fpArmGeos.watchTick, _fpWatchGlowMat);
      readoutBot.scale.set(0.68, 1, 0.8);
      readoutBot.position.set(-0.003, 0.0375, 0.005);
      watchGroup.add(band, bezel, screen, readoutTop, readoutBot);
      armGroup.add(watchGroup);
    } else {
      const paracordBand = new THREE.Mesh(_fpArmGeos.watchBand, _fpTanSuedeMat);
      paracordBand.rotation.x = Math.PI / 2;
      paracordBand.position.set(0, 0, 0.008);
      armGroup.add(paracordBand);
    }

    // 3. Sculpted Hard-Knuckle Tactical Glove Hand + Thumb + Curled Grip Fingers + Articulated Index Trigger Finger
    const handGroup = new THREE.Group();
    handGroup.name = isLeft ? 'leftHandGroup' : 'rightHandGroup';
    handGroup.position.set(0, -0.002, -0.056);

    const palm = new THREE.Mesh(_fpArmGeos.palmCore, gloveMat);
    const suedePalm = new THREE.Mesh(_fpArmGeos.suedePatch, _fpTanSuedeMat);
    suedePalm.position.set(-sideSign * 0.004, -0.015, 0);

    const knuckleBar = new THREE.Mesh(_fpArmGeos.knuckleGuard, _fpCarbonKnuckleMat);
    knuckleBar.position.set(0, 0.018, -0.024);
    handGroup.add(palm, suedePalm, knuckleBar);
    for (let k = 0; k < 4; k++) {
      const pod = new THREE.Mesh(_fpArmGeos.knucklePod, _fpCarbonKnuckleMat);
      pod.position.set((k - 1.5) * 0.014, 0.023, -0.026);
      handGroup.add(pod);
    }

    // Opposable Thumb wrapping inward over the grip / handguard C-clamp
    const thumbPivot = new THREE.Group();
    thumbPivot.name = isLeft ? 'leftThumbGroup' : 'rightThumbGroup';
    thumbPivot.position.set(sideSign * 0.028, 0.006, -0.012);
    thumbPivot.rotation.set(isLeft ? 0.18 : 0.32, -sideSign * (isLeft ? 0.58 : 0.46), sideSign * 0.35);
    const thumb1 = new THREE.Mesh(_fpArmGeos.thumbProx, gloveMat);
    thumb1.rotation.x = Math.PI / 2;
    thumb1.position.set(0, 0, -0.016);
    const thumb2 = new THREE.Mesh(_fpArmGeos.thumbDist, _fpTanSuedeMat);
    thumb2.rotation.x = Math.PI / 2 + 0.38;
    thumb2.position.set(-sideSign * 0.005, -0.006, -0.04);
    thumbPivot.add(thumb1, thumb2);
    handGroup.add(thumbPivot);

    // Index Finger (Extended Trigger Finger on Right Hand; C-Clamp / Forend Support Finger on Left Hand)
    const indexPivot = new THREE.Group();
    indexPivot.name = isLeft ? 'leftIndexGroup' : 'triggerFingerGroup';
    indexPivot.position.set(sideSign * 0.02, 0.008, -0.036);
    indexPivot.rotation.set(isLeft ? 0.62 : 0.24, -sideSign * (isLeft ? 0.12 : 0.22), 0);
    indexPivot.userData.baseRotX = indexPivot.rotation.x;
    indexPivot.userData.baseRotY = indexPivot.rotation.y;
    const idx1 = new THREE.Mesh(_fpArmGeos.fingerProx, gloveMat);
    idx1.rotation.x = Math.PI / 2;
    idx1.position.set(0, 0, -0.016);
    const idx2 = new THREE.Mesh(_fpArmGeos.fingerDist, _fpTanSuedeMat);
    idx2.rotation.x = Math.PI / 2 + (isLeft ? 0.72 : 0.48);
    idx2.position.set(-sideSign * 0.004, -0.01, -0.038);
    indexPivot.add(idx1, idx2);
    handGroup.add(indexPivot);

    // Curled Middle, Ring & Little Fingers wrapping firmly around the grip / handguard
    const gripFingers = new THREE.Group();
    gripFingers.name = isLeft ? 'leftGripFingers' : 'rightGripFingers';
    for (let f = 0; f < 3; f++) {
      const fX = sideSign * (0.006 - f * 0.014);
      const curl = 0.85 + f * 0.08;
      const fProx = new THREE.Mesh(_fpArmGeos.fingerProx, gloveMat);
      fProx.rotation.x = Math.PI / 2 + curl * 0.55;
      fProx.position.set(fX, -0.002, -0.044);
      const fDist = new THREE.Mesh(_fpArmGeos.fingerDist, _fpTanSuedeMat);
      fDist.rotation.x = Math.PI / 2 + curl * 1.25;
      fDist.position.set(fX, -0.022, -0.056);
      gripFingers.add(fProx, fDist);
    }
    handGroup.add(gripFingers);
    armGroup.add(handGroup);

    armGroup.name = isLeft ? 'leftArmGroup' : 'rightArmGroup';
    return armGroup;
  };

  const leftArm = buildArm(true);
  const rightArm = buildArm(false);

  if (def.type === 'rpg' || def.type === 'stinger') {
    const isStinger = def.type === 'stinger';
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(
        isStinger ? 0.052 : 0.042,
        isStinger ? 0.052 : 0.042,
        isStinger ? 1.12 : 0.96,
        10
      ),
      isStinger ? bodyMat : accentMat
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0, -0.18);
    group.add(tube);

    // Flared exhaust vent cone at rear of launcher tube
    const ventCone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.058, 0.14, 10),
      darkSteelMat
    );
    ventCone.rotation.x = Math.PI / 2;
    ventCone.position.set(0, 0, 0.34);
    group.add(ventCone);

    // Pistol grip & trigger assembly under launcher tube
    const launcherGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.095, 0.042), darkSteelMat);
    launcherGrip.position.set(0, -0.068, -0.18);
    launcherGrip.rotation.x = 0.24;
    group.add(launcherGrip);

    if (isStinger) {
      const seekerCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.064, 0.16, 10),
        accentMat
      );
      seekerCollar.rotation.x = Math.PI / 2;
      seekerCollar.position.set(0, 0, -0.68);
      group.add(seekerCollar);

      const iffFrame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.025), accentMat);
      iffFrame.position.set(-0.085, 0.02, -0.52);
      group.add(iffFrame);

      const bcuCanister = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8),
        accentMat
      );
      bcuCanister.position.set(0.04, -0.09, -0.42);
      bcuCanister.rotation.z = -0.35;
      group.add(bcuCanister);
    } else {
      const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.074, 0.34, 10), bodyMat);
      warhead.rotation.x = -Math.PI / 2;
      warhead.position.set(0, 0, -0.76);
      warhead.name = 'rpgWarhead';
      group.add(warhead);
    }

    const sightGroup = new THREE.Group();
    sightGroup.position.set(0, 0.108, -0.34);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.012), bodyMat);
    postL.position.x = -0.026;
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.012), bodyMat);
    postR.position.x = 0.026;
    const frontPin = new THREE.Mesh(
      new THREE.BoxGeometry(0.0045, 0.018, 0.005),
      new THREE.MeshBasicMaterial({ color: isStinger ? 0x00d2d3 : 0xff3333 })
    );
    frontPin.position.y = -0.012;
    frontPin.name = 'frontSightPin';
    sightGroup.add(postL, postR, frontPin);
    sightGroup.name = 'opticSightGroup';
    group.add(sightGroup);

    leftArm.position.set(-0.06, -0.06, -0.36);
    leftArm.rotation.set(0.2, 0.35, 0);
    rightArm.position.set(0.04, -0.08, -0.14);
    rightArm.rotation.set(0.15, -0.1, 0);
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);
  } else if (def.type === 'binoculars') {
    // Dual-Tube Rubber-Armored AN/PVS-21 Recon Laser Rangefinder Binoculars
    const binoGroup = new THREE.Group();
    binoGroup.position.set(0, -0.025, -0.22);
    const barrelGeo = new THREE.CylinderGeometry(0.032, 0.026, 0.165, 14);
    const lensGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.004, 14);
    const lensCoatMat = new THREE.MeshBasicMaterial({ color: 0x00a8a8, transparent: true, opacity: 0.72 });
    for (const side of [-1, 1]) {
      const tube = new THREE.Mesh(barrelGeo, bodyMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(side * 0.044, 0, 0);
      const lens = new THREE.Mesh(lensGeo, lensCoatMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * 0.044, 0, -0.083);
      binoGroup.add(tube, lens);
    }
    const hingeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.024, 0.095), darkSteelMat);
    const lrfEmitter = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.022, 0.075), accentMat);
    lrfEmitter.position.set(0, 0.024, -0.02);
    const lrfButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.008, 10),
      new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
    );
    lrfButton.position.set(0.036, 0.032, 0.02);
    binoGroup.add(hingeBridge, lrfEmitter, lrfButton);
    group.add(binoGroup);

    leftArm.position.set(-0.085, -0.055, -0.21);
    rightArm.position.set(0.085, -0.055, -0.21);
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
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
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
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
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);
  } else if (def.type === 'hammer') {
    const hammerSkin = def.skinFinish || (custom && custom.hammerSkin) || null;
    if (hammerSkin === 'karambit') {
      // ★ RARE GOLD SECTION: CS2-ACCURATE SMOOTH-CURVED 3D KARAMBIT (Signature Thumb/Finger Hole + Curved Talon Blade)
      const goldBladeMat = new THREE.MeshStandardMaterial({
        color: 0xffd32a,
        roughness: 0.11,
        metalness: 0.96,
        emissive: 0x332200,
        flatShading: false
      });
      const darkGripMat = new THREE.MeshStandardMaterial({
        color: 0x14181f,
        roughness: 0.36,
        metalness: 0.62,
        flatShading: false
      });
      const edgeMat = new THREE.MeshStandardMaterial({
        color: 0xfff7c2,
        roughness: 0.06,
        metalness: 0.99,
        emissive: 0x261900,
        flatShading: false
      });

      // Pivot positioned at the Signature Thumb/Index Retention Ring (0, 0, 0) so CS2 Inspect [F] spins around the hole!
      const knifePivot = new THREE.Group();
      knifePivot.name = 'knifePivotGroup';
      knifePivot.position.set(0.01, -0.03, -0.24);
      knifePivot.rotation.set(-0.18, -0.24, 0.1);
      knifePivot.userData.baseRot = knifePivot.rotation.clone();

      // 1. Signature CS2 Circular Thumb / Index Finger Retention Ring (Smooth High-Segment Torus + Beveled Inner Rim)
      const ringOuter = new THREE.Mesh(
        new THREE.TorusGeometry(0.0235, 0.0062, 24, 48),
        goldBladeMat
      );
      ringOuter.rotation.y = Math.PI / 2;
      knifePivot.add(ringOuter);

      const ringInnerChamfer = new THREE.Mesh(
        new THREE.TorusGeometry(0.0192, 0.0028, 18, 40),
        darkGripMat
      );
      ringInnerChamfer.rotation.y = Math.PI / 2;
      knifePivot.add(ringInnerChamfer);

      // Pommel skull-crusher rear tang spur on the ring
      const pommelSpur = new THREE.Mesh(
        new THREE.ConeGeometry(0.0055, 0.014, 12),
        goldBladeMat
      );
      pommelSpur.position.set(0, -0.02, 0.021);
      pommelSpur.rotation.x = 2.25;
      knifePivot.add(pommelSpur);

      // 2. Smoothly Curved CS2 Ergonomic Handle Tang + 3 Scalloped Finger Choils (ExtrudeGeometry in YZ plane)
      // Note: With rotation.y = Math.PI / 2, shape X (u) maps to -Z (forward), shape Y (v) maps to +Y (up)
      const handleTangShape = new THREE.Shape();
      handleTangShape.moveTo(-0.015, 0.016);
      // Smooth arched dorsal handle spine sweeping forward
      handleTangShape.bezierCurveTo(-0.02, 0.052, -0.006, 0.095, 0.016, 0.124);
      // Upper bolster & thumb ramp
      handleTangShape.quadraticCurveTo(0.03, 0.128, 0.044, 0.112);
      // 3 Smooth Concave CS2 Finger Choil Scallops along the front grip
      handleTangShape.quadraticCurveTo(0.023, 0.095, 0.033, 0.079);
      handleTangShape.quadraticCurveTo(0.016, 0.063, 0.025, 0.047);
      handleTangShape.quadraticCurveTo(0.01, 0.032, 0.019, 0.016);
      // Arc smoothly around the top of the signature thumb hole
      handleTangShape.quadraticCurveTo(0.002, 0.024, -0.015, 0.016);

      const tangGeo = new THREE.ExtrudeGeometry(handleTangShape, {
        depth: 0.008,
        bevelEnabled: true,
        bevelThickness: 0.0022,
        bevelSize: 0.0018,
        bevelSegments: 4,
        curveSegments: 28
      });
      const tangMesh = new THREE.Mesh(tangGeo, goldBladeMat);
      tangMesh.rotation.y = Math.PI / 2;
      tangMesh.position.x = -0.004;
      knifePivot.add(tangMesh);

      // Contoured G10 Matte-Black Grip Scales overlaid on both sides of the curved tang
      const gripScaleGeo = new THREE.ExtrudeGeometry(handleTangShape, {
        depth: 0.017,
        bevelEnabled: true,
        bevelThickness: 0.0035,
        bevelSize: 0.0025,
        bevelSegments: 5,
        curveSegments: 28
      });
      const gripScaleMesh = new THREE.Mesh(gripScaleGeo, darkGripMat);
      gripScaleMesh.rotation.y = Math.PI / 2;
      gripScaleMesh.position.x = -0.0085;
      gripScaleMesh.scale.set(0.92, 0.93, 1);
      gripScaleMesh.position.y += 0.004;
      knifePivot.add(gripScaleMesh);

      // 3 Flush Gold Torx Fasteners & Ergonomic Grip Ribs along the curved handle
      const pinCoords = [
        [0.036, -0.004],
        [0.068, -0.011],
        [0.098, -0.022]
      ];
      for (const [py, pz] of pinCoords) {
        const torxPin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0038, 0.0038, 0.026, 14),
          goldBladeMat
        );
        torxPin.rotation.z = Math.PI / 2;
        torxPin.position.set(0, py, pz);
        knifePivot.add(torxPin);
      }

      // Spine thumb jimping notches at top of handle bolster
      for (let j = 0; j < 5; j++) {
        const jimp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0018, 0.0018, 0.016, 8),
          goldBladeMat
        );
        jimp.rotation.z = Math.PI / 2;
        jimp.position.set(0, 0.114 + j * 0.0045, -0.008 - j * 0.0042);
        knifePivot.add(jimp);
      }

      // 3. Smoothly Curved CS2 Hawkbill Tiger-Claw Blade (Continuous Bezier Arc + Hollow-Ground Bevel)
      const bladeEdgeShape = new THREE.Shape();
      bladeEdgeShape.moveTo(0.016, 0.122);
      // Sweeping convex dorsal spine curve out to the down-curved talon point
      bladeEdgeShape.bezierCurveTo(0.056, 0.184, 0.128, 0.198, 0.182, 0.124);
      // Razor-sharp concave sickle inner cutting edge curving back to the choil
      bladeEdgeShape.bezierCurveTo(0.138, 0.16, 0.078, 0.15, 0.044, 0.11);
      bladeEdgeShape.lineTo(0.016, 0.122);

      const bladeEdgeGeo = new THREE.ExtrudeGeometry(bladeEdgeShape, {
        depth: 0.0026,
        bevelEnabled: true,
        bevelThickness: 0.0022,
        bevelSize: 0.002,
        bevelSegments: 4,
        curveSegments: 36
      });
      const bladeEdgeMesh = new THREE.Mesh(bladeEdgeGeo, edgeMat);
      bladeEdgeMesh.rotation.y = Math.PI / 2;
      bladeEdgeMesh.position.x = -0.0013;
      knifePivot.add(bladeEdgeMesh);

      // Thicker Satin-Gold Upper Blade Spine Flat (creates authentic CS2 two-tone grind bevel)
      const bladeSpineShape = new THREE.Shape();
      bladeSpineShape.moveTo(0.016, 0.122);
      bladeSpineShape.bezierCurveTo(0.056, 0.184, 0.128, 0.198, 0.182, 0.124);
      bladeSpineShape.bezierCurveTo(0.132, 0.175, 0.072, 0.164, 0.032, 0.116);
      bladeSpineShape.lineTo(0.016, 0.122);

      const bladeSpineGeo = new THREE.ExtrudeGeometry(bladeSpineShape, {
        depth: 0.0068,
        bevelEnabled: true,
        bevelThickness: 0.0018,
        bevelSize: 0.0014,
        bevelSegments: 4,
        curveSegments: 36
      });
      const bladeSpineMesh = new THREE.Mesh(bladeSpineGeo, goldBladeMat);
      bladeSpineMesh.rotation.y = Math.PI / 2;
      bladeSpineMesh.position.x = -0.0034;
      knifePivot.add(bladeSpineMesh);

      group.add(knifePivot);

      // ONLY ONE ARM (Right Hand & Forearm) gripping the Karambit handle — fixes the 2-arm bug!
      rightArm.position.set(0.015, -0.075, -0.19);
      rightArm.rotation.set(0.22, -0.12, 0.05);
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(rightArm);
    } else if (hammerSkin === 'butterfly') {
      // ★ RARE GOLD SECTION: CS2-ACCURATE SMOOTH-CURVED 3D BUTTERFLY KNIFE / BALISONG (With Signature Thumb Hole & Articulated Curved Handles)
      const sapphireMat = new THREE.MeshStandardMaterial({
        color: 0x0652dd,
        roughness: 0.12,
        metalness: 0.92,
        emissive: 0x001845,
        flatShading: false
      });
      const goldTrimMat = new THREE.MeshStandardMaterial({
        color: 0xffd32a,
        roughness: 0.1,
        metalness: 0.96,
        emissive: 0x2b1d00,
        flatShading: false
      });
      const bladeSteelMat = new THREE.MeshStandardMaterial({
        color: 0x00d2d3,
        roughness: 0.08,
        metalness: 0.98,
        emissive: 0x002633,
        flatShading: false
      });

      const knifePivot = new THREE.Group();
      knifePivot.name = 'knifePivotGroup';
      knifePivot.position.set(0.01, -0.015, -0.24);
      knifePivot.rotation.set(-0.28, -0.18, 0.06);
      knifePivot.userData.baseRot = knifePivot.rotation.clone();

      // Helper to build a smooth, S-curved CS2 Balisong Handle with through-holes & signature upper thumb hole
      const buildCurvedBalisongHandle = (mirrorCurve = 1) => {
        const hShape = new THREE.Shape();
        const s = mirrorCurve; // +1 for Safe Handle, -1 for Bite Handle
        hShape.moveTo(-0.008 * s, 0.008);
        // Rounded bolster pivot head
        hShape.quadraticCurveTo(0, 0.013, 0.008 * s, 0.008);
        // Smooth CS2 S-curved outer ergonomic contour down to flared pommel
        hShape.bezierCurveTo(
          0.013 * s,
          -0.032,
          0.016 * s,
          -0.088,
          0.009 * s,
          -0.132
        );
        // Rounded pommel bottom
        hShape.quadraticCurveTo(0, -0.14, -0.008 * s, -0.132);
        // Smooth inner channel curve back up to pivot bolster
        hShape.bezierCurveTo(
          -0.004 * s,
          -0.088,
          -0.005 * s,
          -0.035,
          -0.008 * s,
          0.008
        );

        // Signature upper thumb/index hole + 3 skeletonized handle cutouts punched right through the 3D geometry
        const holeOffsets = [
          [0.001 * s, -0.024, 0.0044],
          [0.003 * s, -0.052, 0.004],
          [0.004 * s, -0.08, 0.004],
          [0.003 * s, -0.108, 0.0038]
        ];
        for (const [hx, hy, hr] of holeOffsets) {
          const holePath = new THREE.Path();
          holePath.absarc(hx, hy, hr, 0, Math.PI * 2, true);
          hShape.holes.push(holePath);
        }

        const hGeo = new THREE.ExtrudeGeometry(hShape, {
          depth: 0.011,
          bevelEnabled: true,
          bevelThickness: 0.0022,
          bevelSize: 0.0018,
          bevelSegments: 4,
          curveSegments: 28
        });
        const hMesh = new THREE.Mesh(hGeo, sapphireMat);
        hMesh.rotation.y = Math.PI / 2;
        hMesh.position.x = -0.0055;

        const hGroup = new THREE.Group();
        hGroup.add(hMesh);

        // Gold beveled rings around each skeletonized handle hole
        for (const [hx, hy, hr] of holeOffsets) {
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(hr + 0.0008, 0.0012, 12, 24),
            goldTrimMat
          );
          rim.rotation.y = Math.PI / 2;
          rim.position.set(0, hy, -hx);
          hGroup.add(rim);
        }

        // Gold Torx Pivot Bolt at handle origin (0, 0, 0)
        const pivotBolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0052, 0.0052, 0.017, 16),
          goldTrimMat
        );
        pivotBolt.rotation.z = Math.PI / 2;
        hGroup.add(pivotBolt);

        return hGroup;
      };

      // Articulated Safe Handle & Bite Handle pivoted at the tang pins so CS2 Inspect [F] flips them!
      const safeHandleGroup = buildCurvedBalisongHandle(1);
      safeHandleGroup.name = 'baliSafeHandle';
      safeHandleGroup.position.set(0, 0.04, -0.014);

      const biteHandleGroup = buildCurvedBalisongHandle(-1);
      biteHandleGroup.name = 'baliBiteHandle';
      biteHandleGroup.position.set(0, 0.04, 0.014);

      // Rounded Spring T-Latch at bottom of Bite Handle
      const latchStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0028, 0.0028, 0.022, 12),
        goldTrimMat
      );
      latchStem.rotation.x = Math.PI / 2;
      latchStem.position.set(0, -0.136, -0.008);
      const latchBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0038, 0.0038, 0.016, 12),
        goldTrimMat
      );
      latchBar.rotation.z = Math.PI / 2;
      latchBar.position.set(0, -0.136, -0.018);
      biteHandleGroup.add(latchStem, latchBar);

      // Smooth Curved CS2 Clip-Point / Bowie-Spear Blade with Signature Ricasso Thumb Hole & Tang Horns
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-0.016, 0.038);
      // Tang kick & guard horns
      bladeShape.quadraticCurveTo(-0.024, 0.045, -0.013, 0.054);
      // Sweeping CS2 clip-point spine up to the needle tip
      bladeShape.bezierCurveTo(-0.012, 0.115, -0.016, 0.162, 0.002, 0.206);
      // Curved belly cutting edge sweeping back down to the choil
      bladeShape.bezierCurveTo(0.021, 0.158, 0.018, 0.095, 0.013, 0.054);
      bladeShape.quadraticCurveTo(0.024, 0.045, 0.016, 0.038);
      bladeShape.lineTo(-0.016, 0.038);

      // Signature CS2 Circular Thumb / Ricasso Hole punched right through the blade base
      const ricassoThumbHole = new THREE.Path();
      ricassoThumbHole.absarc(0, 0.068, 0.0068, 0, Math.PI * 2, true);
      bladeShape.holes.push(ricassoThumbHole);

      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.0045,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.0018,
        bevelSegments: 4,
        curveSegments: 32
      });
      const bladeMesh = new THREE.Mesh(bladeGeo, bladeSteelMat);
      bladeMesh.rotation.y = Math.PI / 2;
      bladeMesh.position.x = -0.00225;

      // Gold Bezel Ring around the Blade's Signature Thumb Hole
      const bladeThumbRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.0074, 0.0016, 16, 32),
        goldTrimMat
      );
      bladeThumbRing.rotation.y = Math.PI / 2;
      bladeThumbRing.position.set(0, 0.068, 0);

      // Smooth Curved Gold Fuller Groove along upper blade flat
      const fullerGeo = new THREE.CylinderGeometry(0.0018, 0.0026, 0.088, 12);
      const fuller = new THREE.Mesh(fullerGeo, goldTrimMat);
      fuller.position.set(0, 0.132, 0.002);

      knifePivot.add(
        safeHandleGroup,
        biteHandleGroup,
        bladeMesh,
        bladeThumbRing,
        fuller
      );
      group.add(knifePivot);

      // ONLY ONE ARM (Right Hand & Forearm) gripping the Butterfly Knife — no duplicate second arm!
      rightArm.position.set(0.015, -0.085, -0.19);
      rightArm.rotation.set(0.2, -0.1, 0.04);
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(rightArm);
    } else {
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.018, 0.44, 8),
        accentMat
      );
      handle.position.set(0, -0.04, -0.28);
      handle.rotation.x = -0.35;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.085, 0.095), bodyMat);
      head.position.set(0, 0.14, -0.36);
      group.add(handle, head);

      rightArm.position.set(0.03, -0.09, -0.24);
      leftArm.position.set(-0.04, -0.14, -0.21);
      leftArm.userData.basePos = leftArm.position.clone();
      leftArm.userData.baseRot = leftArm.rotation.clone();
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(leftArm, rightArm);
    }
  } else if (def.type === 'melee_sword') {
    if (def.isDinoClaws) {
      // ─── VELOCIRAPTOR SICKLE TALONS & SCALED FORELIMBS ───────────────────────────
      const dinoScaleMat = new THREE.MeshStandardMaterial({
        color: 0x3f6232,
        roughness: 0.72,
        flatShading: true
      });
      const clawBoneMat = new THREE.MeshStandardMaterial({
        color: 0xeae2ce,
        roughness: 0.45,
        metalness: 0.15
      });
      for (const side of [-1, 1]) {
        const clawGroup = new THREE.Group();
        const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.34), dinoScaleMat);
        armMesh.position.set(0, 0, 0.12);
        clawGroup.add(armMesh);
        for (let c = -1; c <= 1; c++) {
          const talon = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.16, 6), clawBoneMat);
          talon.rotation.x = -Math.PI / 2.4;
          talon.position.set(c * 0.025, -0.01, -0.11);
          clawGroup.add(talon);
        }
        clawGroup.position.set(side * 0.18, -0.08, -0.26);
        clawGroup.rotation.set(0.2, -side * 0.18, side * 0.12);
        group.add(clawGroup);
      }
    } else if (def.isTwoHandedSword) {
      // ─── 2H DOUBLE-HANDED GREATSWORD / ZWEIHÄNDER (HELD WITH BOTH HANDS, NO SHIELD) ───
      const bladeSteelMat = new THREE.MeshStandardMaterial({
        color: 0xeff3f8,
        metalness: 0.95,
        roughness: 0.14
      });
      const brassHiltMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.88,
        roughness: 0.22
      });
      const leatherGripMat = new THREE.MeshStandardMaterial({
        color: 0x3b2314,
        roughness: 0.85
      });

      const swordPivot = new THREE.Group();
      swordPivot.name = 'swordPivot';
      swordPivot.position.set(0.06, -0.15, -0.32);
      swordPivot.rotation.set(0.24, -0.12, -0.08);
      swordPivot.userData.basePos = swordPivot.position.clone();
      swordPivot.userData.baseRot = swordPivot.rotation.clone();

      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 1), brassHiltMat);
      pommel.position.set(0, -0.22, 0);
      const twoHandGrip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.017, 0.019, 0.28, 10),
        leatherGripMat
      );
      twoHandGrip.position.set(0, -0.065, 0);
      const gripRing = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), brassHiltMat);
      gripRing.position.set(0, -0.065, 0);
      const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.026, 0.034), brassHiltMat);
      crossguard.position.set(0, 0.085, 0);
      // Zweihänder side-ring (Seitenring) & down-curved quillion tips
      const sideRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 8, 16), brassHiltMat);
      sideRing.rotation.x = Math.PI / 2;
      sideRing.position.set(0, 0.085, -0.028);
      // Zweihänder ricasso leather wrap & parrying hooks (Parierhaken)
      const ricasso = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.17, 0.018), leatherGripMat);
      ricasso.position.set(0, 0.17, 0);
      const parryHooks = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.024), brassHiltMat);
      parryHooks.position.set(0, 0.255, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.9, 0.012), bladeSteelMat);
      blade.position.set(0, 0.69, 0);
      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.16, 4), bladeSteelMat);
      bladeTip.position.set(0, 1.21, 0);
      bladeTip.rotation.y = Math.PI / 4;
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.7, 0.014), brassHiltMat);
      fuller.position.set(0, 0.58, 0);

      // Dynamic Mount & Blade Cleave Motion Trail Ribbon (flares during active swing release!)
      const trailMat = new THREE.MeshBasicMaterial({
        color: 0xdbeafe,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const swingTrail = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.92), trailMat);
      swingTrail.name = 'swordSwingTrail';
      swingTrail.position.set(0.11, 0.72, 0);

      swordPivot.add(
        pommel,
        twoHandGrip,
        gripRing,
        crossguard,
        sideRing,
        ricasso,
        parryHooks,
        blade,
        bladeTip,
        fuller,
        swingTrail
      );
      group.add(swordPivot);

      rightArm.position.set(0.07, -0.14, -0.25);
      leftArm.position.set(-0.02, -0.22, -0.24);
      leftArm.userData.basePos = leftArm.position.clone();
      leftArm.userData.baseRot = leftArm.rotation.clone();
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(leftArm, rightArm);
    } else if (def.isPolearm) {
      // ─── KNIGHT POLEARM / LONG WAR SPEAR & COUCHED CAVALRY LANCE ──────────────
      const ashShaftMat = new THREE.MeshStandardMaterial({
        color: 0x6e472b,
        roughness: 0.78
      });
      const steelHeadMat = new THREE.MeshStandardMaterial({
        color: 0xe6edf3,
        metalness: 0.94,
        roughness: 0.16
      });
      const brassTrimMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.85,
        roughness: 0.24
      });
      const pennantMat = new THREE.MeshStandardMaterial({
        color: team === 'US' ? 0x2563eb : 0xdc2626,
        roughness: 0.6,
        side: THREE.DoubleSide
      });

      const swordPivot = new THREE.Group();
      swordPivot.name = 'swordPivot';
      swordPivot.position.set(0.18, -0.14, -0.34);
      swordPivot.rotation.set(-1.18, -0.08, 0.0);
      swordPivot.userData.basePos = swordPivot.position.clone();
      swordPivot.userData.baseRot = swordPivot.rotation.clone();

      // Long ash-wood polearm shaft + steel vamplate hand-guard cone + armor-piercing spearhead & halberd fluke
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.024, 1.55, 10),
        ashShaftMat
      );
      shaft.position.set(0, 0.42, 0);
      const vamplate = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.14, 10),
        brassTrimMat
      );
      vamplate.position.set(0, 0.08, 0);
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.12, 10),
        brassTrimMat
      );
      collar.position.set(0, 1.16, 0);
      const spearPoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.036, 0.34, 4),
        steelHeadMat
      );
      spearPoint.position.set(0, 1.38, 0);
      spearPoint.rotation.y = Math.PI / 4;
      const halberdAxe = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.16, 0.012),
        steelHeadMat
      );
      halberdAxe.position.set(0.06, 1.18, 0);
      const bannerPennant = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.09, 0.006),
        pennantMat
      );
      bannerPennant.position.set(-0.11, 1.1, 0);

      swordPivot.add(shaft, vamplate, collar, spearPoint, halberdAxe, bannerPennant);
      group.add(swordPivot);

      rightArm.position.set(0.17, -0.16, -0.24);
      leftArm.position.set(-0.08, -0.15, -0.32);
      leftArm.userData.basePos = leftArm.position.clone();
      leftArm.userData.baseRot = leftArm.rotation.clone();
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(leftArm, rightArm);
    } else if (def.isTwoHandedShield) {
      // ─── 2H LARGE PAVISE / TOWER SHIELD (HELD WITH BOTH HANDS — 92% SHIELD WALL BLOCK) ───
      const shieldFaceMat = new THREE.MeshStandardMaterial({
        color: team === 'US' ? 0x1e3a8a : 0x991b1b,
        roughness: 0.55,
        metalness: 0.25
      });
      const brassRimMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.86,
        roughness: 0.22
      });
      const ironBossMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.9,
        roughness: 0.2
      });

      const shieldPivot = new THREE.Group();
      shieldPivot.name = 'shieldPivot';
      shieldPivot.position.set(0.0, -0.12, -0.34);
      shieldPivot.rotation.set(0.04, 0.08, 0.0);
      shieldPivot.userData.basePos = shieldPivot.position.clone();
      shieldPivot.userData.baseRot = shieldPivot.rotation.clone();

      // Left & right Pavise panels with an upper eye-slit viewport so the player can see through when raised!
      const lowerBoard = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.032), shieldFaceMat);
      lowerBoard.position.set(0, -0.08, 0);
      const upperLeft = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.032), shieldFaceMat);
      upperLeft.position.set(-0.155, 0.21, 0);
      const upperRight = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.032), shieldFaceMat);
      upperRight.position.set(0.155, 0.21, 0);
      const topBrow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.038), brassRimMat);
      topBrow.position.set(0, 0.3, 0);
      const bottomRim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.038), brassRimMat);
      bottomRim.position.set(0, -0.3, 0);
      const leftRim = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.62, 0.038), brassRimMat);
      leftRim.position.set(-0.24, 0.0, 0);
      const rightRim = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.62, 0.038), brassRimMat);
      rightRim.position.set(0.24, 0.0, 0);
      const centerSpine = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.042), brassRimMat);
      centerSpine.position.set(0, -0.07, 0);
      const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.042), brassRimMat);
      crossBar.position.set(0, -0.02, 0);
      const centerBoss = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.08, 8), ironBossMat);
      centerBoss.rotation.x = -Math.PI / 2;
      centerBoss.position.set(0, -0.02, -0.035);

      shieldPivot.add(
        lowerBoard,
        upperLeft,
        upperRight,
        topBrow,
        bottomRim,
        leftRim,
        rightRim,
        centerSpine,
        crossBar,
        centerBoss
      );
      group.add(shieldPivot);

      leftArm.position.set(-0.15, -0.14, -0.24);
      rightArm.position.set(0.15, -0.14, -0.24);
      leftArm.userData.basePos = leftArm.position.clone();
      leftArm.userData.baseRot = leftArm.rotation.clone();
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(leftArm, rightArm);
    } else {
      // ─── 1H TEMPLAR ARMING SWORD (RIGHT HAND) & 1H HERALDIC HEATER SHIELD (LEFT ARM) ──────
      const bladeSteelMat = new THREE.MeshStandardMaterial({
        color: 0xe6edf3,
        metalness: 0.92,
        roughness: 0.16
      });
      const brassHiltMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.85,
        roughness: 0.25
      });
      const leatherGripMat = new THREE.MeshStandardMaterial({
        color: 0x4a2c18,
        roughness: 0.85
      });
      const shieldFaceMat = new THREE.MeshStandardMaterial({
        color: team === 'US' ? 0x1d4ed8 : 0xb91c1c,
        roughness: 0.55,
        metalness: 0.25
      });

      const swordPivot = new THREE.Group();
      swordPivot.name = 'swordPivot';
      swordPivot.position.set(0.14, -0.12, -0.28);
      swordPivot.rotation.set(0.28, -0.18, -0.12);
      swordPivot.userData.basePos = swordPivot.position.clone();
      swordPivot.userData.baseRot = swordPivot.rotation.clone();

      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), brassHiltMat);
      pommel.position.set(0, -0.11, 0);
      const hiltGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.15, 10), leatherGripMat);
      hiltGrip.position.set(0, -0.025, 0);
      const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.022, 0.028), brassHiltMat);
      crossguard.position.set(0, 0.055, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.72, 0.01), bladeSteelMat);
      blade.position.set(0, 0.42, 0);
      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.11, 4), bladeSteelMat);
      bladeTip.position.set(0, 0.83, 0);
      bladeTip.rotation.y = Math.PI / 4;
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.52, 0.012), brassHiltMat);
      fuller.position.set(0, 0.34, 0);

      swordPivot.add(pommel, hiltGrip, crossguard, blade, bladeTip, fuller);
      group.add(swordPivot);

      // Left-Hip / Baldric Leather & Brass Scabbard (Sheaths the Broadsword when Slung!)
      const scabbardPivot = new THREE.Group();
      scabbardPivot.name = 'scabbardPivot';
      scabbardPivot.position.set(-0.18, -0.22, -0.27);
      scabbardPivot.rotation.set(-0.85, 0.32, -0.68);
      scabbardPivot.userData.basePos = scabbardPivot.position.clone();
      scabbardPivot.userData.baseRot = scabbardPivot.rotation.clone();

      const scabbardBody = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.76, 0.022), leatherGripMat);
      scabbardBody.position.set(0, -0.36, 0);
      const scabbardLocket = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.045, 0.028), brassHiltMat);
      scabbardLocket.position.set(0, 0.01, 0);
      const scabbardRingBand = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.032, 0.026), brassHiltMat);
      scabbardRingBand.position.set(0, -0.18, 0);
      const scabbardChape = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 4), brassHiltMat);
      scabbardChape.position.set(0, -0.78, 0);
      scabbardChape.rotation.x = Math.PI;
      scabbardChape.rotation.y = Math.PI / 4;
      const baldricStrap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.42, 0.012), leatherGripMat);
      baldricStrap.position.set(0.08, -0.06, 0.012);
      baldricStrap.rotation.z = -0.62;
      scabbardPivot.add(scabbardBody, scabbardLocket, scabbardRingBand, scabbardChape, baldricStrap);
      group.add(scabbardPivot);

      // Left-Arm 1H Heraldic Heater Shield (Raises center-screen when holding RMB to block!)
      const shieldPivot = new THREE.Group();
      shieldPivot.name = 'shieldPivot';
      shieldPivot.position.set(-0.24, -0.11, -0.32);
      shieldPivot.rotation.set(0.08, 0.42, 0.05);
      shieldPivot.userData.basePos = shieldPivot.position.clone();
      shieldPivot.userData.baseRot = shieldPivot.rotation.clone();

      const shieldBoard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.024), shieldFaceMat);
      const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.305, 0.445, 0.018), brassHiltMat);
      shieldRim.position.z = 0.004;
      const crossVert = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.38, 0.028), brassHiltMat);
      const crossHoriz = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.042, 0.028), brassHiltMat);
      crossHoriz.position.y = 0.05;
      shieldPivot.add(shieldBoard, shieldRim, crossVert, crossHoriz);
      group.add(shieldPivot);

      rightArm.position.set(0.14, -0.15, -0.22);
      leftArm.position.set(-0.18, -0.14, -0.24);
      leftArm.userData.basePos = leftArm.position.clone();
      leftArm.userData.baseRot = leftArm.rotation.clone();
      rightArm.userData.basePos = rightArm.position.clone();
      rightArm.userData.baseRot = rightArm.rotation.clone();
      group.add(leftArm, rightArm);
    }
  } else if (def.isCrossbow) {
    // ─── HEAVY SIEGE ARBALEST CROSSBOW (WALNUT TILLER + STEEL PROD + QUARREL BOLT) ───
    const walnutMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.78 });
    const steelProdMat = new THREE.MeshStandardMaterial({
      color: 0xadb5bd,
      metalness: 0.88,
      roughness: 0.25
    });
    const brassNutMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.82,
      roughness: 0.28
    });
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xecf0f1 });

    const xbowGroup = new THREE.Group();
    xbowGroup.position.set(0, -0.06, -0.28);

    // Carved Walnut Tiller Stock + Cheekpiece
    const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.64), walnutMat);
    tiller.position.set(0, -0.01, -0.08);
    // Horizontal Tempered Steel Prod (Left & Right swept bow limbs)
    const prodCenter = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.032, 0.038), brassNutMat);
    prodCenter.position.set(0, 0.015, -0.38);
    const prodLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.026, 0.028), steelProdMat);
    prodLeft.position.set(-0.22, 0.015, -0.34);
    prodLeft.rotation.y = 0.28;
    const prodRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.026, 0.028), steelProdMat);
    prodRight.position.set(0.22, 0.015, -0.34);
    prodRight.rotation.y = -0.28;

    // Front Foot Stirrup & Bowstring Group (animates forward on launch & back when spanning)
    const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 16), steelProdMat);
    stirrup.rotation.x = Math.PI / 2;
    stirrup.position.set(0, 0.01, -0.44);

    const bowStringGroup = new THREE.Group();
    bowStringGroup.name = 'bowStringGroup';
    const stringLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.36, 6), stringMat);
    stringLeft.rotation.z = Math.PI / 2;
    stringLeft.rotation.y = -0.42;
    stringLeft.position.set(-0.18, 0.026, -0.23);
    const stringRight = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.36, 6), stringMat);
    stringRight.rotation.z = Math.PI / 2;
    stringRight.rotation.y = 0.42;
    stringRight.position.set(0.18, 0.026, -0.23);
    bowStringGroup.add(stringLeft, stringRight);
    bowStringGroup.userData.basePos = bowStringGroup.position.clone();

    // Seated Heavy Steel Quarrel Bolt Group (streaks forward off the rail when fired!)
    const nockedProjectile = new THREE.Group();
    nockedProjectile.name = 'nockedProjectile';
    const boltShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.42, 6), walnutMat);
    boltShaft.rotation.x = Math.PI / 2;
    boltShaft.position.set(0, 0.032, -0.25);
    const boltHead = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4), steelProdMat);
    boltHead.rotation.x = -Math.PI / 2;
    boltHead.position.set(0, 0.032, -0.47);
    const boltFletch = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.065), brassNutMat);
    boltFletch.position.set(0, 0.032, -0.07);
    const fireTipXbow = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.095, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6b00 })
    );
    fireTipXbow.name = 'fireTipMesh';
    fireTipXbow.rotation.x = -Math.PI / 2;
    fireTipXbow.position.set(0, 0.032, -0.48);
    fireTipXbow.visible = false;
    nockedProjectile.add(boltShaft, boltHead, boltFletch, fireTipXbow);
    nockedProjectile.userData.basePos = nockedProjectile.position.clone();

    xbowGroup.add(
      tiller,
      prodCenter,
      prodLeft,
      prodRight,
      stirrup,
      bowStringGroup,
      nockedProjectile
    );
    group.add(xbowGroup);

    leftArm.position.set(-0.05, -0.09, -0.36);
    rightArm.position.set(0.04, -0.1, -0.16);
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);
  } else if (def.isBow) {
    // ─── ROYAL ENGLISH YEW LONGBOW + BOWSTRING + NOCKED BODKIN ARROW ───────────────
    // Canted diagonally (~33 deg) and offset slightly right so the bow limb never blocks the center ADS reticle!
    const yewWoodMat = new THREE.MeshStandardMaterial({
      color: 0x7a4924,
      roughness: 0.78
    });
    const hornTipMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.65,
      roughness: 0.35
    });
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xecf0f1 });
    const arrowShaftMat = new THREE.MeshStandardMaterial({ color: 0xc89d66, roughness: 0.75 });
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.6 });

    const bowGroup = new THREE.Group();
    bowGroup.position.set(0.06, -0.05, -0.38);
    bowGroup.rotation.z = -0.56;

    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), hornTipMat);
    const upperLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.36, 8), yewWoodMat);
    upperLimb.position.set(0, 0.25, 0.04);
    upperLimb.rotation.x = 0.24;
    const lowerLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.009, 0.36, 8), yewWoodMat);
    lowerLimb.position.set(0, -0.25, 0.04);
    lowerLimb.rotation.x = -0.24;

    const bowString = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.82, 6), stringMat);
    bowString.name = 'bowStringGroup';
    bowString.position.set(0, 0, 0.085);
    bowString.userData.basePos = bowString.position.clone();

    // Nocked Feathered War Arrow Group (streaks forward off the bow rest when loosed!)
    const nockedProjectile = new THREE.Group();
    nockedProjectile.name = 'nockedProjectile';
    const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.6, 6), arrowShaftMat);
    arrowShaft.rotation.x = Math.PI / 2;
    arrowShaft.position.set(-0.018, 0.01, -0.08);
    const bodkinHead = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.052, 4), darkSteelMat);
    bodkinHead.rotation.x = -Math.PI / 2;
    bodkinHead.position.set(-0.018, 0.01, -0.39);
    const fletching = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.075), featherMat);
    fletching.position.set(-0.018, 0.01, 0.17);
    const fireTipBow = new THREE.Mesh(
      new THREE.ConeGeometry(0.026, 0.09, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6b00 })
    );
    fireTipBow.name = 'fireTipMesh';
    fireTipBow.rotation.x = -Math.PI / 2;
    fireTipBow.position.set(-0.018, 0.01, -0.4);
    fireTipBow.visible = false;
    nockedProjectile.add(arrowShaft, bodkinHead, fletching, fireTipBow);
    nockedProjectile.userData.basePos = nockedProjectile.position.clone();

    bowGroup.add(riser, upperLimb, lowerLimb, bowString, nockedProjectile);
    group.add(bowGroup);

    leftArm.position.set(-0.05, -0.06, -0.32);
    rightArm.position.set(0.05, -0.08, -0.18);
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);
  } else if (def.isThrowingBlade || def.isVenomSpit) {
    // ─── THROWING DAGGERS OR DILOPHOSAURUS VENOM GLANDS ────────────────────────────
    const bladeMat = new THREE.MeshStandardMaterial({
      color: def.isVenomSpit ? 0x2ecc71 : 0xd0d7de,
      metalness: def.isVenomSpit ? 0.2 : 0.88,
      roughness: 0.25
    });
    const daggerBlade = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 4), bladeMat);
    daggerBlade.rotation.x = -Math.PI / 2;
    daggerBlade.position.set(0.08, -0.04, -0.34);
    const daggerGrip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.11), accentMat);
    daggerGrip.position.set(0.08, -0.04, -0.2);
    group.add(daggerBlade, daggerGrip);

    rightArm.position.set(0.08, -0.08, -0.2);
    leftArm.position.set(-0.08, -0.11, -0.24);
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);
  } else {
    // ─── REAL-LIFE FIREARM ARCHITECTURE PER WEAPON FAMILY ────────────────────────
    const wId = def.id || 'm4a1';
    const isPistol =
      def.slot === 'secondary' ||
      wId === 'mp443' ||
      wId === 'm9_beretta' ||
      wId === 'five_seven' ||
      wId === 'usp45' ||
      wId === 'g18' ||
      wId === 'deagle';
    const isBullpup = wId === 'p90' || wId === 'aug_a3' || wId === 'ash12' || wId === 'gm6_lynx';
    const isAsh12 = wId === 'ash12';
    const isAkFamily = wId === 'ak15';
    const isScar = wId === 'scar_h' || wId === 'mcx_spear';
    const isMcx = wId === 'mcx_spear';
    const isHk416 = wId === 'hk416';
    const isAsVal = wId === 'as_val' || wId === 'dvl10';
    const isMp5sd = wId === 'mp5sd';
    const isVector = wId === 'vector';
    const isMp7 = wId === 'mp7';
    const isShotgun = wId === 'm1014' || wId === 'rem870' || wId === 'aa12';
    const isBoxLmg = wId === 'm249' || wId === 'pkp';
    const isAmr = wId === 'barrett_m82' || wId === 'gm6_lynx' || wId === 'ntw20';
    const isSniper =
      wId === 'sv98' ||
      wId === 'awm' ||
      wId === 'm40a5' ||
      wId === 'dvl10' ||
      wId === 'm200_intervention' ||
      isAmr;
    const isDmr = wId === 'mk14' || wId === 'sr25';

    const length = isPistol
      ? wId === 'deagle'
        ? 0.32
        : wId === 'five_seven'
        ? 0.275
        : 0.26
      : wId === 'ntw20' || wId === 'barrett_m82' || wId === 'm200_intervention'
      ? 0.98
      : wId === 'gm6_lynx'
      ? 0.78
      : isSniper
      ? 0.88
      : isDmr
      ? 0.82
      : isBoxLmg
      ? 0.76
      : isAsh12
      ? 0.58
      : isBullpup
      ? 0.54
      : isMp5sd
      ? 0.54
      : isVector || isMp7
      ? 0.46
      : isShotgun
      ? 0.74
      : isMcx
      ? 0.71
      : 0.68;

    // 1. Sculpted Ergonomic Pistol Grip + Finger Grooves + Trigger Guard + Curved Trigger Blade (on all firearms!)
    const pGrip = new THREE.Mesh(
      new THREE.BoxGeometry(isPistol ? 0.03 : 0.034, isPistol ? 0.095 : 0.092, 0.044),
      accentMat
    );
    pGrip.position.set(0, isPistol ? -0.056 : -0.068, isPistol ? -0.195 : -0.155);
    pGrip.rotation.x = isPistol ? 0.22 : 0.28;
    group.add(pGrip);

    // Molded finger-groove ribs & flared grip baseplate
    for (let fg = 0; fg < 3; fg++) {
      const grooveRib = new THREE.Mesh(
        new THREE.BoxGeometry(isPistol ? 0.032 : 0.036, 0.008, 0.01),
        darkSteelMat
      );
      grooveRib.position.set(
        0,
        (isPistol ? -0.036 : -0.046) - fg * 0.02,
        (isPistol ? -0.215 : -0.175) + fg * 0.005
      );
      grooveRib.rotation.x = isPistol ? 0.22 : 0.28;
      group.add(grooveRib);
    }

    const trigGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.022, 0.048),
      darkSteelMat
    );
    trigGuard.position.set(0, isPistol ? -0.02 : -0.038, isPistol ? -0.225 : -0.19);
    group.add(trigGuard);

    // Curved 3D Trigger Blade inside Trigger Guard
    const triggerBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.007, 0.018, 0.008),
      darkSteelMat
    );
    triggerBlade.position.set(0, isPistol ? -0.013 : -0.03, isPistol ? -0.222 : -0.186);
    triggerBlade.rotation.x = -0.35;
    triggerBlade.name = 'triggerBladeMesh';
    triggerBlade.userData.baseRotX = -0.35;
    triggerBlade.userData.baseZ = triggerBlade.position.z;
    group.add(triggerBlade);

    // 2. Upper & Lower Receiver Geometry + Ejection Port + Fire Selector + Magwell (customized per firearm!)
    const recWidth = isPistol ? 0.034 : isScar || isBoxLmg ? 0.072 : 0.064;
    const recHeight = isPistol ? 0.036 : isScar ? 0.098 : isVector ? 0.11 : 0.086;
    const recLen = length * (isPistol ? 0.56 : isBullpup ? 0.78 : 0.58);
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(recWidth, recHeight, recLen),
      bodyMat
    );
    receiver.position.set(0, isPistol ? 0.004 : 0, isBullpup ? -0.18 : -0.22);
    group.add(receiver);

    // Lower receiver stepped magwell collar & ambidextrous fire selector switch
    if (!isPistol) {
      const ejPort = new THREE.Mesh(
        new THREE.BoxGeometry(0.005, 0.02, 0.068),
        darkSteelMat
      );
      ejPort.position.set(
        recWidth * 0.505,
        0.012,
        wId === 'aug_a3' ? -0.06 : wId === 'p90' ? -0.12 : -0.24
      );
      group.add(ejPort);

      // Brass deflector bump behind ejection port
      const brassDefl = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.018, 0.016),
        bodyMat
      );
      brassDefl.position.set(recWidth * 0.52, 0.012, -0.2);
      group.add(brassDefl);

      // Left & right fire-selector lever switches above pistol grip
      const selLeverL = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.009, 0.024),
        darkSteelMat
      );
      selLeverL.position.set(-recWidth * 0.52, -0.018, -0.155);
      selLeverL.rotation.x = 0.25;
      const selLeverR = selLeverL.clone();
      selLeverR.position.x = recWidth * 0.52;
      group.add(selLeverL, selLeverR);

      if (!isBullpup && !isMp7 && !isShotgun) {
        const magwell = new THREE.Mesh(
          new THREE.BoxGeometry(recWidth * 0.92, 0.042, 0.078),
          bodyMat
        );
        magwell.position.set(0, -0.044, isVector ? -0.3 : -0.285);
        magwell.rotation.x = isVector ? 0.22 : -0.08;
        group.add(magwell);
      }
    }

    // Weapon-specific real-life architectural details:
    if (wId === 'm4a1') {
      // M4A1: Forward Assist Plunger on upper right receiver + A2 Triangular Front Sight Post (FSB) + Quad-Rail Handguard Vents
      const fwdAssist = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.032, 8),
        darkSteelMat
      );
      fwdAssist.rotation.x = Math.PI / 2;
      fwdAssist.rotation.y = -0.22;
      fwdAssist.position.set(recWidth * 0.48, 0.014, -0.12);
      group.add(fwdAssist);

      // Low-profile gas block / A2 Front Sight Base (stays strictly below sightY = 0.060 so ADS is never blocked!)
      const fsbTower = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.032, 4),
        darkSteelMat
      );
      fsbTower.position.set(0, 0.034, -0.22 - length * 0.64);
      fsbTower.rotation.y = Math.PI / 4;
      group.add(fsbTower);
    } else if (isVector) {
      // KRISS Vector Super-V downward off-axis recoil block in front of trigger guard + side bolt-catch paddles
      const superVBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.058, 0.115, 0.085),
        bodyMat
      );
      superVBlock.position.set(0, -0.038, -0.295);
      superVBlock.rotation.x = 0.18;
      group.add(superVBlock);

      const vectorFoldingKnuckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.064, 0.038, 0.032),
        darkSteelMat
      );
      vectorFoldingKnuckle.position.set(0, 0.01, -0.075);
      group.add(vectorFoldingKnuckle);
    } else if (isAkFamily) {
      // AK-15 stamped ribbed dust cover (flush with receiver top y <= 0.043 so it NEVER blocks iron sights or optics!)
      const dustCover = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.027, recLen * 0.88, 6),
        darkSteelMat
      );
      dustCover.rotation.x = Math.PI / 2;
      dustCover.position.set(0, 0.016, -0.2);
      group.add(dustCover);

      const gasTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, length * 0.42, 8),
        darkSteelMat
      );
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.026, -0.22 - length * 0.44);
      group.add(gasTube);

      // 45° angled AK gas block connecting gas tube to barrel
      const akGasBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, 0.032, 0.028),
        darkSteelMat
      );
      akGasBlock.position.set(0, 0.022, -0.22 - length * 0.64);
      akGasBlock.rotation.x = 0.48;
      group.add(akGasBlock);

      // Underbarrel steel cleaning rod
      const cleaningRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0035, 0.0035, length * 0.56, 6),
        darkSteelMat
      );
      cleaningRod.rotation.x = Math.PI / 2;
      cleaningRod.position.set(0, 0.001, -0.22 - length * 0.66);
      group.add(cleaningRod);
    } else if (isScar) {
      // FN SCAR-H: Monolithic upper cooling vents + forward reciprocating charging handle + Ugg-boot stock hinge block
      const scarCharging = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.048, 8),
        darkSteelMat
      );
      scarCharging.rotation.z = Math.PI / 2;
      scarCharging.position.set(-0.044, 0.024, -0.36);
      group.add(scarCharging);

      const scarHinge = new THREE.Mesh(
        new THREE.BoxGeometry(0.068, 0.095, 0.028),
        darkSteelMat
      );
      scarHinge.position.set(0, -0.008, -0.065);
      group.add(scarHinge);
    } else if (isAsVal) {
      // AS VAL: 5 Machined Knurled Heat-Dissipation Rings along the Integral Suppressor Shroud
      for (let r = 0; r < 5; r++) {
        const knurlRing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0245, 0.0245, 0.012, 12),
          accentMat
        );
        knurlRing.rotation.x = Math.PI / 2;
        knurlRing.position.set(0, 0.014, -0.36 - r * 0.065);
        group.add(knurlRing);
      }
    } else if (wId === 'aug_a3') {
      // Steyr AUG A3 integrated folding front vertical foregrip with pivot pin + angled left charging handle
      const augGrip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.017, 0.095, 8),
        accentMat
      );
      augGrip.position.set(0, -0.068, -0.39);
      augGrip.rotation.x = 0.12;
      group.add(augGrip);

      const augHinge = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.022, 0.032),
        darkSteelMat
      );
      augHinge.position.set(0, -0.022, -0.39);
      group.add(augHinge);
    } else if (wId === 'p90') {
      // FN P90 ergonomic front thumbhole loop, downward hand-stop beak & rear thumbhole bridge
      const p90FrontLoop = new THREE.Mesh(
        new THREE.BoxGeometry(0.054, 0.075, 0.09),
        bodyMat
      );
      p90FrontLoop.position.set(0, -0.038, -0.35);
      group.add(p90FrontLoop);

      const p90Beak = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.048, 0.032),
        accentMat
      );
      p90Beak.position.set(0, -0.054, -0.415);
      p90Beak.rotation.x = -0.32;
      group.add(p90Beak);
    } else if (isMp7) {
      // HK MP7A2: Dual telescoping steel stock guide rods along left & right sides of the receiver
      const rodL = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.28, 6),
        darkSteelMat
      );
      rodL.rotation.x = Math.PI / 2;
      rodL.position.set(-0.034, 0.004, -0.12);
      const rodR = rodL.clone();
      rodR.position.x = 0.034;
      group.add(rodL, rodR);
    } else if (isShotgun) {
      // Benelli M1014 full-length underbarrel 7-round tubular magazine + ARGO dual gas cylinders + ribbed combat forend
      const magTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, length * 0.72, 10),
        darkSteelMat
      );
      magTube.rotation.x = Math.PI / 2;
      magTube.position.set(0, -0.014, -0.22 - length * 0.56);
      group.add(magTube);

      // Barrel clamp bracket joining barrel and mag tube
      const barrelClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.046, 0.022),
        darkSteelMat
      );
      barrelClamp.position.set(0, 0.0, -0.22 - length * 0.82);
      group.add(barrelClamp);
    } else if (isBoxLmg) {
      // M249 / PKP folding front bipod legs + top ventilated barrel heatshield + folding carry handle
      const bipodL = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
        darkSteelMat
      );
      bipodL.position.set(-0.045, -0.07, -0.22 - length * 0.62);
      bipodL.rotation.set(0.35, 0, -0.28);
      const bipodR = bipodL.clone();
      bipodR.position.x = 0.045;
      bipodR.rotation.z = 0.28;
      group.add(bipodL, bipodR);

      // LMG side carry handle bar & grip cylinder — folded down/right below receiver rail so ADS sight picture is 100% unobstructed!
      const carryGrip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.056, 8),
        accentMat
      );
      carryGrip.rotation.z = -0.42;
      carryGrip.position.set(0.054, 0.022, -0.34);
      group.add(carryGrip);
    } else if (isSniper) {
      // Sniper / Anti-Materiel folding front bipod + bolt handle knob + AMR signature muzzle brake / hydraulic damper
      const bipodL = new THREE.Mesh(
        new THREE.CylinderGeometry(isAmr ? 0.008 : 0.006, isAmr ? 0.008 : 0.006, isAmr ? 0.175 : 0.15, 6),
        darkSteelMat
      );
      bipodL.position.set(-0.044, -0.068, -0.22 - length * 0.56);
      bipodL.rotation.set(0.45, 0, -0.25);
      const bipodR = bipodL.clone();
      bipodR.position.x = 0.044;
      bipodR.rotation.z = 0.25;
      group.add(bipodL, bipodR);

      // Spherical bolt knob on bolt-action sniper receivers
      if (wId !== 'barrett_m82' && wId !== 'gm6_lynx') {
        const boltKnob = new THREE.Mesh(
          new THREE.SphereGeometry(wId === 'ntw20' ? 0.017 : 0.013, 8, 8),
          darkSteelMat
        );
        boltKnob.position.set(0.058, 0.018, -0.14);
        group.add(boltKnob);
      }
      if (isAmr && (!custom || !custom.muzzle || custom.muzzle === 'stock')) {
        // Signature Arrowhead Dual-Chamber .50 BMG / 20mm Anti-Materiel Tank-Style Muzzle Brake!
        const amrBrake = new THREE.Mesh(
          new THREE.BoxGeometry(wId === 'ntw20' ? 0.064 : 0.054, 0.036, 0.095),
          darkSteelMat
        );
        amrBrake.position.set(0, 0.014, -0.22 - length * 0.96);
        group.add(amrBrake);
      }
      if (wId === 'ntw20') {
        // Denel NTW-20 side-mounted 3-round 20mm box magazine + upper hydraulic recoil cylinder
        const sideMag = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.115), accentMat);
        sideMag.position.set(-0.068, 0.012, -0.25);
        group.add(sideMag);
      }
    } else if (isDmr) {
      // MK14 EBR / KAC SR-25: Exposed underbarrel gas block / precision folding DMR bipod
      if (wId === 'sr25') {
        const srBipodL = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0055, 0.0055, 0.14, 6),
          darkSteelMat
        );
        srBipodL.position.set(-0.038, -0.058, -0.22 - length * 0.56);
        srBipodL.rotation.set(0.42, 0, -0.24);
        const srBipodR = srBipodL.clone();
        srBipodR.position.x = 0.038;
        srBipodR.rotation.z = 0.24;
        group.add(srBipodL, srBipodR);
      } else {
        const m14GasCyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, length * 0.42, 8),
          darkSteelMat
        );
        m14GasCyl.rotation.x = Math.PI / 2;
        m14GasCyl.position.set(0, -0.008, -0.22 - length * 0.62);
        group.add(m14GasCyl);
      }
    } else if (isHk416) {
      // HK416A5 CAG: Stepped piston upper rail + Geissele SMR cross-bolts & slim gas block
      const hkGasReg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.042, 8),
        darkSteelMat
      );
      hkGasReg.rotation.x = Math.PI / 2;
      hkGasReg.position.set(0, 0.028, -0.22 - length * 0.66);
      group.add(hkGasReg);
    } else if (isMp5sd) {
      // HK MP5SD6: Ribbed rubberized integral suppressor shroud + classic hooded HK ring front sight (centered on sightY = 0.060!)
      for (let r = 0; r < 6; r++) {
        const sdRib = new THREE.Mesh(
          new THREE.TorusGeometry(0.026, 0.0035, 8, 16),
          darkSteelMat
        );
        sdRib.position.set(0, 0.01, -0.34 - r * 0.048);
        group.add(sdRib);
      }
      if (!def.opticType && (!custom || !custom.optic || custom.optic === 'factory')) {
        const hkRingHood = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0022, 8, 20),
          darkSteelMat
        );
        hkRingHood.position.set(0, 0.060, -0.52);
        group.add(hkRingHood);
      }
    } else if (isAsh12) {
      // ShAK-12 / ASh-12.7x55mm: Flush top rail bridge (topY <= 0.048 so iron sights & all optics align cleanly!)
      const ashBridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.014, 0.28),
        accentMat
      );
      ashBridge.position.set(0, 0.041, -0.24);
      group.add(ashBridge);
    }

    // 3. MIL-STD-1913 Picatinny Top Rail + Machined Cross-Slot Recoil Lugs (clearly visible in ADS & Inspect!)
    const railLen = length * (isPistol ? 0.56 : isBullpup ? 0.62 : 0.84);
    const railCenterZ = -0.22 - length * (isPistol ? 0.04 : 0.15);
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(
        isPistol ? 0.022 : 0.034,
        isPistol ? 0.005 : 0.011,
        railLen
      ),
      accentMat
    );
    topRail.position.set(0, isPistol ? 0.045 : 0.048, railCenterZ);
    group.add(topRail);

    // Individual 3D Picatinny Rail Teeth along the upper rail
    if (!isPistol) {
      const numTeeth = Math.min(12, Math.max(6, Math.floor(railLen / 0.045)));
      const startZ = railCenterZ + railLen * 0.44;
      for (let t = 0; t < numTeeth; t++) {
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.036, 0.005, 0.014),
          darkSteelMat
        );
        tooth.position.set(0, 0.055, startZ - t * (railLen * 0.88 / numTeeth));
        group.add(tooth);
      }
    }

    // 4. Buttstock & Charging Handle / Bolt Carrier / Pistol Slide
    if (!isPistol) {
      const chargingHandle = new THREE.Mesh(
        new THREE.BoxGeometry(isSniper ? 0.072 : 0.056, 0.016, 0.042),
        darkSteelMat
      );
      chargingHandle.position.set(isSniper || isAkFamily ? 0.032 : 0, 0.038, -0.11);
      chargingHandle.name = 'boltCarrierMesh';
      chargingHandle.userData.baseZ = -0.11;
      group.add(chargingHandle);

      if (!isBullpup) {
        if (isAsVal || isMp7 || isVector) {
          // Tubular / Folding Skeleton Stock
          const topStrut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6),
            darkSteelMat
          );
          topStrut.rotation.x = Math.PI / 2;
          topStrut.position.set(0, 0.01, -0.03);
          const botStrut = topStrut.clone();
          botStrut.position.set(0, -0.035, -0.03);
          botStrut.rotation.x = Math.PI / 2 + 0.15;
          const buttPad = new THREE.Mesh(
            new THREE.BoxGeometry(0.038, 0.105, 0.024),
            accentMat
          );
          buttPad.position.set(0, -0.018, 0.07);
          group.add(topStrut, botStrut, buttPad);
        } else {
          // SOPMOD / SCAR Ugg-boot / Sniper Thumbhole Buttstock
          const stock = new THREE.Mesh(
            new THREE.BoxGeometry(isScar ? 0.058 : 0.05, isScar ? 0.115 : 0.1, 0.21),
            isSniper ? bodyMat : accentMat
          );
          stock.position.set(0, -0.018, -0.035);
          group.add(stock);
          const cheekRiser = new THREE.Mesh(
            new THREE.BoxGeometry(0.054, 0.024, 0.13),
            darkSteelMat
          );
          cheekRiser.position.set(0, 0.032, -0.04);
          group.add(cheekRiser);
        }
      } else {
        // Bullpup thick rear cheek/buttplate housing (P90 / AUG A3)
        const bullpupButt = new THREE.Mesh(
          new THREE.BoxGeometry(0.066, 0.118, 0.18),
          bodyMat
        );
        bullpupButt.position.set(0, -0.012, -0.045);
        group.add(bullpupButt);
      }
    } else {
      // Reciprocating Pistol Slide (`boltCarrierMesh`) with rear serrations, ejection port & model-specific mechanics
      const slideHeight = wId === 'deagle' ? 0.028 : 0.025;
      const slideWidth = wId === 'deagle' ? 0.038 : 0.035;
      const pistolSlide = new THREE.Group();
      pistolSlide.position.set(0, 0.032, -0.22);
      pistolSlide.name = 'boltCarrierMesh';
      pistolSlide.userData.baseZ = -0.22;

      const slideMain = new THREE.Mesh(
        new THREE.BoxGeometry(slideWidth, slideHeight, length * 0.72),
        wId === 'm9_beretta' || wId === 'deagle' ? bodyMat : accentMat
      );
      pistolSlide.add(slideMain);

      // Rear slide grip serrations on left & right sides
      for (let sr = 0; sr < 4; sr++) {
        const serration = new THREE.Mesh(
          new THREE.BoxGeometry(slideWidth + 0.002, slideHeight * 0.72, 0.004),
          darkSteelMat
        );
        serration.position.set(0, 0, 0.048 - sr * 0.01);
        pistolSlide.add(serration);
      }

      if (wId === 'm9_beretta') {
        // M9 Beretta 92FS: Signature open-top cutaway slide exposing the rounded 9mm barrel + rear external hammer spur & safety decocker!
        const exposedBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0095, 0.0095, length * 0.62, 10),
          darkSteelMat
        );
        exposedBarrel.rotation.x = Math.PI / 2;
        exposedBarrel.position.set(0, 0.007, -0.025);
        pistolSlide.add(exposedBarrel);

        const m9Hammer = new THREE.Mesh(
          new THREE.BoxGeometry(0.008, 0.016, 0.014),
          darkSteelMat
        );
        m9Hammer.position.set(0, 0.022, -0.125);
        m9Hammer.rotation.x = 0.45;
        group.add(m9Hammer);
      } else if (wId === 'deagle') {
        // .50 AE Desert Eagle: Triangular heavy barrel profile + top Weaver scope rail slots + external skeletonized hammer
        const deagleTopRib = new THREE.Mesh(
          new THREE.BoxGeometry(0.024, 0.006, length * 0.68),
          darkSteelMat
        );
        deagleTopRib.position.set(0, slideHeight * 0.36, -0.01);
        pistolSlide.add(deagleTopRib);

        const deagleHammer = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.018, 0.016),
          darkSteelMat
        );
        deagleHammer.position.set(0, 0.024, -0.115);
        deagleHammer.rotation.x = 0.4;
        group.add(deagleHammer);
      } else if (wId === 'g18') {
        // Glock 18C: Top-slide compensator port cutout + left-side rear full-auto fire-selector wing
        const compCut = new THREE.Mesh(
          new THREE.BoxGeometry(0.016, 0.004, 0.032),
          darkSteelMat
        );
        compCut.position.set(0, slideHeight * 0.51, -0.045);
        pistolSlide.add(compCut);

        const g18Selector = new THREE.Mesh(
          new THREE.BoxGeometry(0.008, 0.01, 0.018),
          darkSteelMat
        );
        g18Selector.position.set(-slideWidth * 0.55, 0, 0.042);
        g18Selector.rotation.x = -0.35;
        pistolSlide.add(g18Selector);
      } else if (wId === 'usp45' || wId === 'five_seven') {
        // HK USP .45 Tactical / FN Five-seveN MK2: Extended threaded barrel / scalloped front slide profile
        const threadProtector = new THREE.Mesh(
          new THREE.CylinderGeometry(wId === 'five_seven' ? 0.0085 : 0.0105, wId === 'five_seven' ? 0.0085 : 0.0105, 0.022, 10),
          darkSteelMat
        );
        threadProtector.rotation.x = Math.PI / 2;
        threadProtector.position.set(0, 0.014, -0.22 - length * 0.86);
        group.add(threadProtector);
      }

      group.add(pistolSlide);
    }

    // 5. Handguard & Cylindrical Free-Float Barrel
    const handguard = new THREE.Mesh(
      new THREE.BoxGeometry(
        isPistol ? 0.032 : isMp5sd ? 0.052 : 0.058,
        isPistol ? 0.024 : isMp5sd ? 0.056 : 0.074,
        length * (isPistol ? 0.42 : isBullpup ? 0.34 : 0.48)
      ),
      isMcx ? bodyMat : accentMat
    );
    handguard.position.set(
      0,
      isPistol ? 0.008 : 0,
      -0.22 - length * (isPistol ? 0.36 : 0.44)
    );
    group.add(handguard);

    // Handguard cooling slots / M-LOK vents on rifles & SMGs
    if (!isPistol && !isAsVal && !isMp5sd) {
      for (let v = 0; v < 3; v++) {
        const ventSlot = new THREE.Mesh(
          new THREE.BoxGeometry(0.061, 0.014, 0.034),
          darkSteelMat
        );
        ventSlot.position.set(0, 0.004, -0.22 - length * (0.32 + v * 0.09));
        group.add(ventSlot);
      }
    }

    // True Cylindrical Gun Barrel (`CylinderGeometry`) instead of a square box!
    const barrelRadius =
      isAsVal || isMp5sd
        ? 0.023 // Integral suppressor barrel shroud
        : isAsh12
        ? 0.0155
        : isSniper || isShotgun
        ? 0.013
        : isPistol
        ? 0.0085
        : 0.011;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(barrelRadius, barrelRadius, length * 0.52, 10),
      darkSteelMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.014, -0.22 - length * 0.7);
    group.add(barrel);

    if (isSniper || (isAsh12 && (!custom || !custom.muzzle || custom.muzzle === 'stock'))) {
      // Heavy Multi-Baffle Tank-Style Muzzle Brake (AWM .338 / SV-98M / ASh-12.7mm CQB)
      const brake = new THREE.Mesh(
        new THREE.BoxGeometry(isAsh12 ? 0.042 : 0.036, isAsh12 ? 0.034 : 0.028, 0.074),
        darkSteelMat
      );
      brake.position.set(0, 0.014, -0.22 - length * 0.96);
      group.add(brake);

      for (let b = 0; b < 2; b++) {
        const bafflePort = new THREE.Mesh(
          new THREE.BoxGeometry(isAsh12 ? 0.045 : 0.039, 0.015, 0.014),
          bodyMat
        );
        bafflePort.position.set(0, 0.014, -0.22 - length * 0.94 - b * 0.024);
        group.add(bafflePort);
      }
    }

    const gripId = custom && custom.grip ? custom.grip : 'std_grip';
    const hasLaserMod = gripId === 'match_laser' || gripId === 'mawl_c1' || gripId === 'raptar_lrf';

    if (gripId === 'raptar_lrf' && !isPistol) {
      // Wilcox RAPTAR-S Rail-Mounted Ballistic LRF & Laser Designator Pod
      const raptarBox = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.088), accentMat);
      raptarBox.position.set(0.034, 0.038, -0.22 - length * 0.44);
      const raptarLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 10),
        new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
      );
      raptarLens.rotation.x = Math.PI / 2;
      raptarLens.position.set(0.034, 0.041, -0.22 - length * 0.44 - 0.046);
      group.add(raptarBox, raptarLens);
    }

    if (!isPistol && (!isBullpup || hasLaserMod) && !isSniper) {
      if (gripId === 'mawl_c1') {
        // BE Meyers MAWL-C1+ offset side-straddling green/IR laser module
        const mawlBridge = new THREE.Mesh(
          new THREE.BoxGeometry(0.052, 0.014, 0.068),
          accentMat
        );
        mawlBridge.position.set(0.016, 0.052, -0.22 - length * 0.48);
        const mawlPod = new THREE.Mesh(
          new THREE.BoxGeometry(0.026, 0.028, 0.095),
          darkSteelMat
        );
        mawlPod.position.set(0.038, 0.036, -0.22 - length * 0.49);
        const mawlLens1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10),
          new THREE.MeshBasicMaterial({ color: 0x00ff88 })
        );
        mawlLens1.rotation.x = Math.PI / 2;
        mawlLens1.position.set(0.038, 0.041, -0.22 - length * 0.49 - 0.049);
        const mawlLens2 = mawlLens1.clone();
        mawlLens2.position.y = 0.03;
        group.add(mawlBridge, mawlPod, mawlLens1, mawlLens2);
      } else {
        const peqBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.02, 0.072),
          darkSteelMat
        );
        peqBox.position.set(0.028, 0.03, -0.22 - length * 0.46);
        group.add(peqBox);
        if (gripId === 'match_laser') {
          const peqEmitter = new THREE.Mesh(
            new THREE.CylinderGeometry(0.005, 0.005, 0.008, 8),
            new THREE.MeshBasicMaterial({ color: 0x2ecc71 })
          );
          peqEmitter.rotation.x = Math.PI / 2;
          peqEmitter.position.set(0.028, 0.03, -0.22 - length * 0.46 - 0.038);
          group.add(peqEmitter);
        }
      }

      if (!isMp5sd && !isAsVal && !isBullpup) {
        const frontGasBlock = new THREE.Mesh(
          new THREE.BoxGeometry(0.024, 0.038, 0.03),
          darkSteelMat
        );
        frontGasBlock.position.set(0, 0.03, -0.22 - length * 0.64);
        group.add(frontGasBlock);
      }
    }

    // Distinct 3D Underbarrel Foregrips (RK-1 45° Cant, Magpul RVG, Angled AFG, Harris Bipod+Grip)
    if (!isPistol && wId !== 'p90') {
      const gripZ = -0.22 - length * 0.42;
      if (gripId === 'rk1_b25u') {
        // Zenitco RK-1 on B-25U 45° canted rail mount!
        const b25Mount = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.022, 0.038), darkSteelMat);
        b25Mount.position.set(-0.016, -0.038, gripZ);
        b25Mount.rotation.z = -0.68;
        const rk1Grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.016, 0.095, 10),
          darkSteelMat
        );
        rk1Grip.position.set(-0.048, -0.068, gripZ);
        rk1Grip.rotation.z = -0.72;
        group.add(b25Mount, rk1Grip);
      } else if (gripId === 'angled_grip') {
        // Triangular Magpul AFG Angled Foregrip
        const afgBase = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.016, 0.105), darkSteelMat);
        afgBase.position.set(0, -0.042, gripZ);
        const afgRamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.078), accentMat);
        afgRamp.position.set(0, -0.056, gripZ + 0.01);
        afgRamp.rotation.x = 0.36;
        group.add(afgBase, afgRamp);
      } else if (gripId === 'bipod_grip') {
        // Harris Swivel Bipod + Vertical Foregrip Pod
        const podGrip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.018, 0.092, 8),
          darkSteelMat
        );
        podGrip.position.set(0, -0.068, gripZ + 0.02);
        const hLegL = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0055, 0.0055, 0.135, 6),
          darkSteelMat
        );
        hLegL.position.set(-0.036, -0.065, gripZ - 0.055);
        hLegL.rotation.set(0.38, 0, -0.28);
        const hLegR = hLegL.clone();
        hLegR.position.x = 0.036;
        hLegR.rotation.z = 0.28;
        group.add(podGrip, hLegL, hLegR);
      } else if (gripId === 'vert_foregrip' || (!isSniper && wId !== 'aug_a3')) {
        const foregrip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.017, gripId === 'vert_foregrip' ? 0.096 : 0.086, 8),
          gripId === 'vert_foregrip' ? accentMat : darkSteelMat
        );
        foregrip.position.set(0, -0.066, gripZ);
        group.add(foregrip);
      }
    } else if (isPistol && gripId !== 'std_grip') {
      const laserBox = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.068), darkSteelMat);
      laserBox.position.set(0, -0.016, -0.22 - length * 0.45);
      group.add(laserBox);
      if (hasLaserMod) {
        const laserLens = new THREE.Mesh(
          new THREE.BoxGeometry(0.011, 0.011, 0.008),
          new THREE.MeshBasicMaterial({ color: gripId === 'mawl_c1' ? 0x00ff88 : 0x2ecc71 })
        );
        laserLens.position.set(0, -0.016, -0.22 - length * 0.45 - 0.036);
        group.add(laserLens);
      }
    }

    // 6. 3D Muzzle Attachment (Flash Hider, Warden Blast, Compensator, Lantac Dragon, SOCOM Silencer, KAC QDC Suppressor)
    const rawMuzzle = custom && custom.muzzle ? custom.muzzle : 'stock';
    const muzzleId =
      (wId === 'as_val' || wId === 'mp5sd') && rawMuzzle === 'stock' ? 'integral' : rawMuzzle;
    const barrelTipZ = -0.22 - length * 0.94;
    if (muzzleId === 'flash_hider' || muzzleId === 'compensator') {
      const fhMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          muzzleId === 'compensator' ? 0.02 : 0.016,
          0.015,
          muzzleId === 'compensator' ? 0.085 : 0.072,
          8
        ),
        darkSteelMat
      );
      fhMesh.rotation.x = Math.PI / 2;
      fhMesh.position.set(0, 0.014, barrelTipZ - 0.03);
      fhMesh.name = 'muzzleAttachmentMesh';
      group.add(fhMesh);
    } else if (muzzleId === 'lantac_dragon') {
      const brakeGroup = new THREE.Group();
      brakeGroup.name = 'muzzleAttachmentMesh';
      const dragonBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.092), darkSteelMat);
      dragonBody.position.set(0, 0.014, barrelTipZ - 0.038);
      brakeGroup.add(dragonBody);
      for (let g = 0; g < 3; g++) {
        const gill = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.012, 0.01), bodyMat);
        gill.position.set(0, 0.014, barrelTipZ - 0.02 - g * 0.022);
        brakeGroup.add(gill);
      }
      group.add(brakeGroup);
    } else if (muzzleId === 'warden_blast') {
      const wardenMat = new THREE.MeshStandardMaterial({
        color: isPureGold ? 0xffd32a : isPureBlue ? 0x00d2d3 : 0x7c6848,
        roughness: 0.42,
        metalness: 0.55
      });
      const wardenCan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.024, 0.095, 12),
        wardenMat
      );
      wardenCan.rotation.x = Math.PI / 2;
      wardenCan.position.set(0, 0.014, barrelTipZ - 0.042);
      wardenCan.name = 'muzzleAttachmentMesh';
      group.add(wardenCan);
    } else if (muzzleId === 'silencer' || muzzleId === 'qdc_suppressor' || muzzleId === 'tbac_338_ultra') {
      const isQdc = muzzleId === 'qdc_suppressor' || muzzleId === 'tbac_338_ultra';
      const silLen = isPistol
        ? isQdc
          ? 0.165
          : 0.14
        : muzzleId === 'tbac_338_ultra'
        ? 0.285
        : isQdc
        ? 0.245
        : 0.21;
      const silRad = muzzleId === 'tbac_338_ultra' ? 0.031 : isQdc ? 0.0275 : 0.025;
      const silGroup = new THREE.Group();
      silGroup.name = 'muzzleAttachmentMesh';
      const silMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(silRad, silRad, silLen, 12),
        darkSteelMat
      );
      silMesh.rotation.x = Math.PI / 2;
      silMesh.position.set(0, 0.014, barrelTipZ - silLen * 0.45);
      silGroup.add(silMesh);
      if (isQdc) {
        const qdCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(silRad * 1.12, silRad * 1.12, 0.038, 12),
          accentMat
        );
        qdCollar.rotation.x = Math.PI / 2;
        qdCollar.position.set(0, 0.014, barrelTipZ - 0.012);
        silGroup.add(qdCollar);
      }
      group.add(silGroup);
    }

    // 7. Weapon-Specific Magazine Geometry (P90 Top Mag, AUG/ASh-12 Bullpup Rear Mag, AK/MP5SD Curved Mag, Jungle Taped, Quad-60, Drum)
    const magId = custom && custom.magazine ? custom.magazine : 'std_mag';
    const mag = new THREE.Group();
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf1c40f,
      roughness: 0.28,
      metalness: 0.78
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xe67e22,
      roughness: 0.32,
      metalness: 0.68
    });

    let baseMagY = -0.105;
    let baseMagZ = -0.29;
    let baseMagRotX = -0.18;

    if (wId === 'p90') {
      const p90MagMat = new THREE.MeshStandardMaterial({
        color: isPureGold ? 0xffd32a : isPureBlue ? 0x00d2d3 : 0x3b3228,
        roughness: 0.25,
        metalness: 0.4,
        transparent: true,
        opacity: 0.86
      });
      const p90Mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.024, 0.26), p90MagMat);
      const p90BrassCore = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.21), brassMat);
      const p90Turret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.021, 0.025, 10),
        darkSteelMat
      );
      p90Turret.position.set(0, 0, 0.105);
      mag.add(p90Mag, p90BrassCore, p90Turret);
      baseMagY = 0.036;
      baseMagZ = -0.19;
      baseMagRotX = 0;
    } else {
      const baseMagHeight = isBoxLmg
        ? 0.145
        : isPistol
        ? wId === 'g18'
          ? 0.135
          : 0.092
        : isSniper || isDmr || isScar || isAsh12
        ? 0.14
        : 0.175;
      const baseMagWidth = isBoxLmg ? 0.115 : isPistol ? 0.026 : isMp5sd ? 0.028 : 0.038;
      const magDepth = isPistol ? 0.038 : isSniper || isDmr || isScar || isAsh12 ? 0.078 : isMp5sd ? 0.048 : 0.066;
      const magHeight =
        magId === 'ext_mag'
          ? baseMagHeight * 1.3
          : magId === 'quad_60'
          ? baseMagHeight * 1.24
          : magId === 'drum_mag'
          ? baseMagHeight * 1.15
          : baseMagHeight;
      const magWidth =
        magId === 'drum_mag'
          ? Math.max(0.095, baseMagWidth * 1.9)
          : magId === 'quad_60'
          ? baseMagWidth * 1.48
          : baseMagWidth;

      if (isAkFamily || isMp5sd) {
        const upperMag = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth, magHeight * 0.55, magDepth),
          isMp5sd ? darkSteelMat : accentMat
        );
        upperMag.position.set(0, magHeight * 0.22, 0);
        const lowerMag = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth, magHeight * 0.58, magDepth * 0.95),
          isMp5sd ? darkSteelMat : accentMat
        );
        lowerMag.position.set(0, -magHeight * 0.24, -0.022);
        lowerMag.rotation.x = -0.28;
        const akFloorplate = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth * 1.12, 0.012, magDepth * 1.05),
          darkSteelMat
        );
        akFloorplate.position.set(0, -magHeight * 0.52, -0.038);
        akFloorplate.rotation.x = -0.28;
        mag.add(upperMag, lowerMag, akFloorplate);
      } else {
        const magBody = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth, magHeight, magDepth),
          isBoxLmg ? bodyMat : accentMat
        );
        const magBaseplate = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth * 1.12, 0.012, magDepth * 1.08),
          darkSteelMat
        );
        magBaseplate.position.set(0, -magHeight * 0.5, 0);
        mag.add(magBody, magBaseplate);
      }

      if (magId === 'jungle_taped' && !isPistol && !isBoxLmg) {
        // Second coupled magazine + blue tactical tape bands
        const tapeMat = new THREE.MeshStandardMaterial({ color: 0x1d6fa5, roughness: 0.65 });
        const twinMag = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth * 0.95, magHeight * 0.95, magDepth * 0.95),
          darkSteelMat
        );
        twinMag.position.set(magWidth * 1.18, -0.018, 0.005);
        const tapeBand1 = new THREE.Mesh(
          new THREE.BoxGeometry(magWidth * 2.35, 0.018, magDepth * 1.08),
          tapeMat
        );
        tapeBand1.position.set(magWidth * 0.58, -magHeight * 0.12, 0);
        const tapeBand2 = tapeBand1.clone();
        tapeBand2.position.y = -magHeight * 0.34;
        mag.add(twinMag, tapeBand1, tapeBand2);
      }

      if (isBoxLmg) {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.075, 0.052), brassMat);
        belt.position.set(-0.045, magHeight * 0.45, 0);
        belt.rotation.z = -0.35;
        mag.add(belt);
      }

      const topRound = new THREE.Mesh(
        new THREE.BoxGeometry(isPistol ? 0.012 : 0.016, 0.012, isPistol ? 0.032 : 0.052),
        brassMat
      );
      topRound.position.set(0, magHeight * 0.5 + 0.005, -0.004);
      topRound.visible = false;
      topRound.name = 'magTopBrass';
      mag.add(topRound);

      baseMagY = (isPistol ? -0.078 : -0.105) - (magHeight - baseMagHeight) * 0.4;
      baseMagZ = isPistol
        ? -0.195
        : wId === 'aug_a3' || isAsh12
        ? -0.055 // Bullpup rear magazine behind pistol grip!
        : isMp7
        ? -0.155 // MP7 grip-fed magazine!
        : isVector
        ? -0.305 // Vector forward Super-V magwell!
        : -0.285;
      baseMagRotX = isPistol
        ? 0.22
        : isVector
        ? 0.26
        : isScar || isSniper || isDmr || isAsh12
        ? 0.0
        : -0.18;
    }

    mag.position.set(0, baseMagY, baseMagZ);
    mag.rotation.x = baseMagRotX;
    mag.userData.baseY = baseMagY;
    mag.userData.baseZ = baseMagZ;
    mag.userData.baseRotX = baseMagRotX;
    mag.name = 'magazineMesh';
    group.add(mag);

    // 3D Loose Brass Cartridge for Tarkov Slow Reload
    const bulletGroup = new THREE.Group();
    const casingMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.036, 6),
      brassMat
    );
    casingMesh.rotation.x = Math.PI / 2;
    const tipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.018, 6), copperMat);
    tipMesh.rotation.x = -Math.PI / 2;
    tipMesh.position.z = -0.026;
    bulletGroup.add(casingMesh, tipMesh);
    bulletGroup.visible = false;
    bulletGroup.name = 'packingBulletMesh';
    group.add(bulletGroup);

    // 8. 3D BARREL IRON SIGHTS vs. MOUNTED 3D OPTIC HOUSING (16 CoD / Tarkov Optics + 45° Canted Dot!)
    const OPTIC_ID_MAP = {
      rmr_mini: 'rmr',
      rmr: 'rmr',
      reddot: 'reddot',
      kobra: 'kobra',
      okp7: 'okp7',
      holo: 'holo',
      vortex_uh1: 'uh1',
      uh1: 'uh1',
      prism_2x: 'prism2x',
      prism2x: 'prism2x',
      holo_g33: 'holo3x',
      holo3x: 'holo3x',
      acog: 'acog',
      elcan_dr: 'elcan4x',
      elcan4x: 'elcan4x',
      valday_1_6x: 'valday6x',
      valday6x: 'valday6x',
      vudu_3_6x: 'lpvo36',
      lpvo36: 'lpvo36',
      flir_thermal: 'flir',
      flir: 'flir',
      an_pas13_sniper_ir: 'sniperFlir',
      sniperFlir: 'sniperFlir',
      sniper8x: 'sniper8x',
      nightforce_12x: 'sniper12x',
      sniper12x: 'sniper12x',
      raptor_fvm40_13x: 'raptor13x',
      raptor13x: 'raptor13x',
      leupold_mark5_16x: 'sniper16x',
      sniper16x: 'sniper16x',
      hensoldt_elr_27x: 'sniper27x',
      sniper27x: 'sniper27x',
      ballistic_40x: 'sniper40x',
      sniper40x: 'sniper40x'
    };
    const rawOpticKey =
      custom && custom.optic
        ? custom.optic === 'factory'
          ? null
          : custom.optic
        : def.opticType || null;
    const activeOptic = rawOpticKey ? OPTIC_ID_MAP[rawOpticKey] || rawOpticKey : null;

    if (!activeOptic) {
      const ironGroup = new THREE.Group();
      ironGroup.name = 'ironSightGroup';
      const sightY = isPistol ? 0.052 : 0.06;
      const rearZ = isPistol ? -0.145 : -0.14;
      const frontZ = isPistol ? -0.3 : -0.22 - length * 0.64;

      const rearBase = new THREE.Mesh(
        new THREE.BoxGeometry(isPistol ? 0.026 : 0.032, 0.004, 0.012),
        bodyMat
      );
      rearBase.position.set(0, sightY - 0.007, rearZ);

      const leftEar = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.011, 0.01), bodyMat);
      leftEar.position.set(-0.0125, sightY - 0.001, rearZ);

      const rightEar = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.011, 0.01), bodyMat);
      rightEar.position.set(0.0125, sightY - 0.001, rearZ);

      const rearDotMat = new THREE.MeshBasicMaterial({ color: 0x7bed9f });
      const rearDotL = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0022, 0.002), rearDotMat);
      rearDotL.position.set(-0.0125, sightY - 0.001, rearZ + 0.0052);
      const rearDotR = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0022, 0.002), rearDotMat);
      rearDotR.position.set(0.0125, sightY - 0.001, rearZ + 0.0052);

      const frontBase = new THREE.Mesh(
        new THREE.BoxGeometry(isPistol ? 0.024 : 0.03, 0.0045, 0.014),
        bodyMat
      );
      frontBase.position.set(0, sightY - 0.0075, frontZ);

      const frontWingL = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.012), bodyMat);
      frontWingL.position.set(-0.013, sightY - 0.0015, frontZ);

      const frontWingR = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.012), bodyMat);
      frontWingR.position.set(0.013, sightY - 0.0015, frontZ);

      const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0065, 0.006), bodyMat);
      frontPost.position.set(0, sightY - 0.0068, frontZ);

      const frontPinMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
      const frontPin = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0034, 0.006), frontPinMat);
      frontPin.position.set(0, sightY - 0.0022, frontZ);
      frontPin.name = 'frontSightPin';

      ironGroup.add(
        rearBase,
        leftEar,
        rightEar,
        rearDotL,
        rearDotR,
        frontBase,
        frontWingL,
        frontWingR,
        frontPost,
        frontPin
      );
      group.add(ironGroup);
    } else {
      const isLongScope =
        activeOptic === 'valday6x' ||
        activeOptic === 'lpvo36' ||
        activeOptic === 'sniper8x' ||
        activeOptic === 'sniper12x' ||
        activeOptic === 'raptor13x' ||
        activeOptic === 'sniper16x' ||
        activeOptic === 'sniper27x' ||
        activeOptic === 'sniper40x';
      const isMidPrism =
        activeOptic === 'prism2x' || activeOptic === 'acog' || activeOptic === 'elcan4x';
      const isHoloFam =
        activeOptic === 'holo' || activeOptic === 'uh1' || activeOptic === 'holo3x';
      const isFlir = activeOptic === 'flir' || activeOptic === 'sniperFlir';

      const mountY = isPistol ? 0.044 : 0.048;
      const mountZ = isPistol ? -0.21 : -0.22;
      const clampW = isPistol ? 0.032 : 0.046;
      const clampH = isPistol ? 0.008 : 0.011;
      const clampD = isLongScope || isFlir
        ? 0.165
        : activeOptic === 'holo3x'
        ? 0.135
        : isMidPrism
        ? 0.098
        : isPistol
        ? 0.042
        : 0.068;

      const mountBase = new THREE.Mesh(new THREE.BoxGeometry(clampW, clampH, clampD), darkSteelMat);
      mountBase.position.set(0, mountY + clampH * 0.5, mountZ);
      mountBase.name = 'opticMountBase';
      group.add(mountBase);

      const sightGroup = new THREE.Group();
      sightGroup.position.set(0, isPistol ? 0.064 : 0.082, mountZ);
      sightGroup.name = 'opticSightGroup';

      const glassMat = new THREE.MeshBasicMaterial({
        color: activeOptic === 'okp7' ? 0x2ecc71 : isFlir ? 0x00ffcc : 0x55ccff,
        transparent: true,
        opacity: activeOptic === 'okp7' ? 0.18 : 0.12,
        depthWrite: false
      });
      const hollowSteelMat = new THREE.MeshStandardMaterial({
        color: isPureGold ? 0xe5b822 : isPureBlue ? 0x0984e3 : 0x181c20,
        roughness: 0.36,
        metalness: 0.72,
        side: THREE.DoubleSide,
        flatShading: true
      });

      if (activeOptic === 'rmr' || activeOptic === 'okp7') {
        // Ultra-compact open-top Trijicon RMR / Tarkov OKP-7 rimless green reflex
        const basePlate = new THREE.Mesh(
          new THREE.BoxGeometry(isPistol ? 0.032 : 0.04, 0.007, 0.044),
          darkSteelMat
        );
        basePlate.position.y = -0.018;
        sightGroup.add(basePlate);
        if (activeOptic === 'okp7') {
          const sideArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.006, 0.028, 0.036),
            darkSteelMat
          );
          sideArm.position.set(-0.02, -0.004, 0);
          const rimlessGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.019, 0.019, 0.0025, 16),
            glassMat
          );
          rimlessGlass.rotation.x = Math.PI / 2;
          rimlessGlass.position.set(0, 0.004, -0.012);
          sightGroup.add(sideArm, rimlessGlass);
        } else {
          const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.026, 0.028), darkSteelMat);
          wingL.position.set(-0.018, -0.001, -0.006);
          const wingR = wingL.clone();
          wingR.position.x = 0.018;
          const lens = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.002), glassMat);
          lens.position.set(0, 0.0, -0.014);
          sightGroup.add(wingL, wingR, lens);
        }
      } else if (isHoloFam) {
        // Boxy EOTech EXPS3 / Vortex AMG UH-1 Gen II open hood (+ hollow G33 flip magnifier for holo3x!)
        const holoZ = activeOptic === 'holo3x' ? -0.038 : 0;
        const hoodLen = activeOptic === 'uh1' ? 0.088 : 0.072;
        const hoodMat = activeOptic === 'uh1' ? accentMat : bodyMat;
        const frameW = isPistol ? 0.044 : 0.056;
        const frameH = isPistol ? 0.044 : 0.052;
        const wallT = 0.005;

        const baseBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, hoodLen), hoodMat);
        baseBar.position.set(0, -frameH / 2, holoZ);
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, hoodLen), hoodMat);
        topBar.position.set(0, frameH / 2, holoZ);
        const leftW = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, hoodLen), hoodMat);
        leftW.position.set(-frameW / 2, 0, holoZ);
        const rightW = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, hoodLen), hoodMat);
        rightW.position.set(frameW / 2, 0, holoZ);
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(frameW - wallT * 2, frameH - wallT * 2, 0.002),
          glassMat
        );
        lens.position.z = holoZ;
        sightGroup.add(baseBar, topBar, leftW, rightW, lens);

        if (activeOptic === 'holo3x') {
          // Open-ended cylindrical G33 3x Flip-to-Side Magnifier behind EOTech hood (never blocks bore!)
          const g33Tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.023, 0.068, 16, 1, true),
            hollowSteelMat
          );
          g33Tube.rotation.x = Math.PI / 2;
          g33Tube.position.set(0, 0.002, 0.042);
          const g33Hinge = new THREE.Mesh(
            new THREE.BoxGeometry(0.018, 0.014, 0.026),
            accentMat
          );
          g33Hinge.position.set(0.022, -0.022, 0.042);
          sightGroup.add(g33Tube, g33Hinge);
        }
      } else if (isMidPrism) {
        // Open-bore Prism 2.0x / Trijicon ACOG TA31 / Elcan Specter-DR (hollow optical tube so bore is 100% clear!)
        const prismMat = new THREE.MeshStandardMaterial({
          color:
            activeOptic === 'elcan4x'
              ? isPureGold
                ? 0xffd32a
                : isPureBlue
                ? 0x0652dd
                : 0x6b5d45
              : isPureGold
              ? 0xe5b822
              : isPureBlue
              ? 0x0984e3
              : 0x181c20,
          roughness: 0.42,
          metalness: 0.58,
          side: THREE.DoubleSide
        });
        const tubeLen = activeOptic === 'prism2x' ? 0.095 : 0.135;
        const mainCyl = new THREE.Mesh(
          new THREE.CylinderGeometry(
            activeOptic === 'elcan4x' ? 0.026 : 0.024,
            0.023,
            tubeLen,
            16,
            1,
            true
          ),
          prismMat
        );
        mainCyl.rotation.x = Math.PI / 2;
        sightGroup.add(mainCyl);

        if (activeOptic === 'acog') {
          const fiberStrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.006, 0.005, 0.072),
            new THREE.MeshBasicMaterial({ color: 0xff3b30 })
          );
          fiberStrip.position.set(0, 0.027, -0.01);
          sightGroup.add(fiberStrip);
        } else if (activeOptic === 'elcan4x') {
          const saddleL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.034, 0.088), prismMat);
          saddleL.position.set(-0.026, 0, 0);
          const saddleR = saddleL.clone();
          saddleR.position.x = 0.026;
          const lever = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.012), darkSteelMat);
          lever.position.set(-0.034, -0.006, 0.01);
          sightGroup.add(saddleL, saddleR, lever);
        } else {
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10),
            accentMat
          );
          cap.position.set(0, 0.028, 0);
          sightGroup.add(cap);
        }
      } else if (isFlir) {
        // Open-bore Trijicon REAP-IR (`flir`) & AN/PAS-13G Long-Range Thermal Sniper (`sniperFlir`)
        const bodyLen = activeOptic === 'sniperFlir' ? 0.235 : 0.155;
        const frameW = 0.056;
        const frameH = 0.048;
        const wallT = 0.006;
        const bBot = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, bodyLen), darkSteelMat);
        bBot.position.y = -frameH / 2;
        const bTop = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, bodyLen), darkSteelMat);
        bTop.position.y = frameH / 2;
        const bLeft = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, bodyLen), darkSteelMat);
        bLeft.position.x = -frameW / 2;
        const bRight = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, bodyLen), darkSteelMat);
        bRight.position.x = frameW / 2;
        const eyecup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.023, 0.021, 0.045, 14, 1, true),
          hollowSteelMat
        );
        eyecup.rotation.x = Math.PI / 2;
        eyecup.position.set(0, 0, bodyLen * 0.5 + 0.018);
        const objBezel = new THREE.Mesh(
          new THREE.CylinderGeometry(activeOptic === 'sniperFlir' ? 0.031 : 0.026, 0.024, 0.036, 14, 1, true),
          hollowSteelMat
        );
        objBezel.rotation.x = Math.PI / 2;
        objBezel.position.set(0, 0, -bodyLen * 0.5 - 0.014);
        const irGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.002, 14),
          glassMat
        );
        irGlass.rotation.x = Math.PI / 2;
        sightGroup.add(bBot, bTop, bLeft, bRight, eyecup, objBezel, irGlass);
      } else if (isLongScope) {
        // Open-bore cylindrical LPVO (Valday 1-6x / Vudu 3-6x) & Sniper Scope (Razor 8x / Nightforce ATACR 6-12x)
        const isHeavySniper = activeOptic === 'sniper8x' || activeOptic === 'sniper12x';
        const scopeMat = new THREE.MeshStandardMaterial({
          color:
            activeOptic === 'lpvo36' || activeOptic === 'sniper8x'
              ? isPureGold
                ? 0xffd32a
                : isPureBlue
                ? 0x0652dd
                : 0x5e493a
              : isPureGold
              ? 0xe5b822
              : isPureBlue
              ? 0x0984e3
              : 0x181c20,
          roughness: 0.36,
          metalness: 0.62,
          side: THREE.DoubleSide
        });
        const tubeLen = activeOptic === 'sniper12x' ? 0.275 : isHeavySniper ? 0.245 : 0.195;
        const mainTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, tubeLen, 16, 1, true),
          scopeMat
        );
        mainTube.rotation.x = Math.PI / 2;

        const ocularBell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.022, 0.056, 16, 1, true),
          scopeMat
        );
        ocularBell.rotation.x = Math.PI / 2;
        ocularBell.position.z = tubeLen * 0.42;

        const throwLever = new THREE.Mesh(
          new THREE.BoxGeometry(0.006, 0.022, 0.008),
          accentMat
        );
        throwLever.position.set(-0.024, 0.016, tubeLen * 0.32);
        throwLever.rotation.z = 0.55;

        const objRad = activeOptic === 'sniper12x' ? 0.029 : isHeavySniper ? 0.026 : 0.022;
        const objBell = new THREE.Mesh(
          new THREE.CylinderGeometry(objRad, 0.02, isHeavySniper ? 0.075 : 0.048, 16, 1, true),
          scopeMat
        );
        objBell.rotation.x = Math.PI / 2;
        objBell.position.z = -tubeLen * 0.44;

        const elevTurret = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.014, 10),
          darkSteelMat
        );
        elevTurret.position.set(0, 0.026, 0);
        const windTurret = elevTurret.clone();
        windTurret.rotation.z = Math.PI / 2;
        windTurret.position.set(0.025, 0, 0);

        const ringBaseRear = new THREE.Mesh(
          new THREE.BoxGeometry(0.038, 0.012, 0.018),
          darkSteelMat
        );
        ringBaseRear.position.set(0, -0.022, 0.046);
        const ringBaseFront = ringBaseRear.clone();
        ringBaseFront.position.z = -0.048;

        sightGroup.add(
          mainTube,
          ocularBell,
          throwLever,
          objBell,
          elevTurret,
          windTurret,
          ringBaseRear,
          ringBaseFront
        );
      } else {
        // Aimpoint Micro T-2 (`reddot`) / Kobra EKP-8-18 (`kobra`) — wide clear aperture!
        const depth = isPistol ? 0.048 : 0.072;
        const frameW = isPistol ? 0.044 : 0.052;
        const frameH = isPistol ? 0.044 : 0.052;
        const wallT = 0.005;

        const baseBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, depth), bodyMat);
        baseBar.position.y = -frameH / 2;
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, depth), bodyMat);
        leftWall.position.x = -frameW / 2;
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, frameH, depth), bodyMat);
        rightWall.position.x = frameW / 2;
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(frameW - wallT * 2, frameH - wallT * 2, 0.002),
          glassMat
        );
        sightGroup.add(baseBar, leftWall, rightWall, lens);
        if (activeOptic !== 'kobra') {
          const topBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, wallT, depth), bodyMat);
          topBar.position.y = frameH / 2;
          sightGroup.add(topBar);
        }
      }

      // 45° Canted Micro Red-Dot Housing on the right 45° offset rail when `def.hasCantedSight` is active!
      if (!isPistol && def.hasCantedSight && (isLongScope || isMidPrism || isFlir)) {
        const cantedGroup = new THREE.Group();
        cantedGroup.name = 'cantedMicroSightGroup';
        cantedGroup.position.set(0.036, -0.012, -0.055);
        cantedGroup.rotation.z = -Math.PI / 4;
        const cantArm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.032), darkSteelMat);
        const cantHoodL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.024), darkSteelMat);
        cantHoodL.position.set(-0.011, 0.012, 0);
        const cantHoodR = cantHoodL.clone();
        cantHoodR.position.x = 0.011;
        const cantDot = new THREE.Mesh(
          new THREE.BoxGeometry(0.0035, 0.0035, 0.003),
          new THREE.MeshBasicMaterial({ color: 0xff3b30 })
        );
        cantDot.position.set(0, 0.013, 0);
        cantedGroup.add(cantArm, cantHoodL, cantHoodR, cantDot);
        sightGroup.add(cantedGroup);
      }

      group.add(sightGroup);
    }

    if (isPistol) {
      leftArm.position.set(-0.024, -0.108, -0.185);
      leftArm.rotation.set(0.18, 0.22, 0);
      rightArm.position.set(0.024, -0.104, -0.175);
      rightArm.rotation.set(0.18, -0.14, 0);
    } else {
      leftArm.position.set(-0.045, -0.065, -0.22 - length * 0.36);
      leftArm.rotation.set(0.22, 0.38, -0.1);
      rightArm.position.set(0.038, -0.085, -0.16);
      rightArm.rotation.set(0.12, -0.08, 0);
    }
    leftArm.userData.basePos = leftArm.position.clone();
    leftArm.userData.baseRot = leftArm.rotation.clone();
    rightArm.userData.basePos = rightArm.position.clone();
    rightArm.userData.baseRot = rightArm.rotation.clone();
    group.add(leftArm, rightArm);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.088, 0.088), flashMat);
    const extraMuzzleLen =
      muzzleId === 'qdc_suppressor'
        ? 0.22
        : muzzleId === 'silencer'
        ? 0.18
        : muzzleId === 'warden_blast' || muzzleId === 'lantac_dragon'
        ? 0.08
        : muzzleId === 'flash_hider' || muzzleId === 'compensator'
        ? 0.05
        : 0;
    flash.position.set(0, -0.008, -0.26 - length * 0.88 - extraMuzzleLen);
    flash.name = 'muzzleFlash';
    group.add(flash);
  }

  return group;
}

/**
 * Animates the 1st-person Bow (`warbow`) or Crossbow (`heavy_crossbow`) viewmodel:
 * - `cycleProgress` in `(0, 1)`:
 *   1. `0.00 .. 0.18`: String snaps forward & arrow/bolt physically streaks out of the bow/crossbow!
 *   2. `0.18 .. 0.58`: Right hand reaches to quiver and seats a fresh arrow/bolt onto the rest/groove.
 *   3. `0.58 .. 1.00`: Draws bowstring / spans crossbow string back to ready position.
 * - `cycleProgress <= 0` or `>= 1`:
 *   Ready to loose; holding RMB (`adsAmount`) pulls the string & arrow back with extra draw tension!
 */
export function animateBowOrCrossbowMesh(
  weaponMesh,
  cycleProgress = 0,
  adsAmount = 0,
  isCrossbow = false,
  isFireArrow = false
) {
  if (!weaponMesh) return;
  const proj = weaponMesh.getObjectByName('nockedProjectile');
  const str = weaponMesh.getObjectByName('bowStringGroup');
  const rightArm = weaponMesh.getObjectByName('rightArmGroup');
  const fireTip = weaponMesh.getObjectByName('fireTipMesh');
  if (!proj || !str) return;

  const baseProjPos = proj.userData.basePos || new THREE.Vector3();
  const baseStrPos = str.userData.basePos || new THREE.Vector3();

  if (cycleProgress > 0 && cycleProgress < 1) {
    if (cycleProgress < 0.18) {
      // Phase 1: Arrow/bolt launches forward off the bow/crossbow rail as the string snaps forward!
      const t = cycleProgress / 0.18;
      proj.visible = t < 0.85;
      proj.position.set(baseProjPos.x, baseProjPos.y, baseProjPos.z - t * 0.95);
      proj.rotation.set(0, 0, 0);
      str.position.set(baseStrPos.x, baseStrPos.y, baseStrPos.z - (1 - t * 0.3) * 0.14);
      if (rightArm && rightArm.userData.basePos) {
        rightArm.position.set(
          rightArm.userData.basePos.x + 0.02,
          rightArm.userData.basePos.y + 0.015,
          rightArm.userData.basePos.z + 0.06
        );
      }
    } else if (cycleProgress < 0.58) {
      // Phase 2: Reach to quiver, bring a fresh arrow/bolt onto the bow rest / crossbow groove
      const t = (cycleProgress - 0.18) / 0.4;
      const ease = 1 - Math.pow(1 - t, 2);
      proj.visible = t > 0.12;
      proj.position.set(
        baseProjPos.x + (1 - ease) * 0.09,
        baseProjPos.y + (1 - ease) * 0.12,
        baseProjPos.z - 0.12 + (1 - ease) * 0.28
      );
      proj.rotation.set((1 - ease) * -0.28, (1 - ease) * 0.22, 0);
      str.position.set(baseStrPos.x, baseStrPos.y, baseStrPos.z - (isCrossbow ? 0.12 : 0.08));
      if (rightArm && rightArm.userData.basePos) {
        rightArm.position.set(
          rightArm.userData.basePos.x + (1 - ease) * 0.08,
          rightArm.userData.basePos.y + (1 - ease) * 0.06,
          rightArm.userData.basePos.z - ease * 0.08
        );
      }
    } else {
      // Phase 3: Draw the bowstring / span the crossbow back to full draw
      const t = (cycleProgress - 0.58) / 0.42;
      const ease = t * t * (3 - 2 * t);
      proj.visible = true;
      const drawZ = THREE.MathUtils.lerp(-0.12, 0, ease);
      proj.position.set(baseProjPos.x, baseProjPos.y, baseProjPos.z + drawZ);
      proj.rotation.set(0, 0, 0);
      str.position.set(baseStrPos.x, baseStrPos.y, baseStrPos.z + drawZ * 0.9);
      if (rightArm && rightArm.userData.basePos) {
        rightArm.position.set(
          rightArm.userData.basePos.x,
          rightArm.userData.basePos.y,
          rightArm.userData.basePos.z + drawZ
        );
      }
    }
  } else {
    // Ready to fire — holding RMB (adsAmount) pulls the bowstring & arrow taut toward the archer's cheek
    proj.visible = true;
    const extraDraw = isCrossbow ? 0 : (adsAmount || 0) * 0.09;
    proj.position.set(baseProjPos.x, baseProjPos.y, baseProjPos.z + extraDraw);
    proj.rotation.set(0, 0, 0);
    str.position.set(baseStrPos.x, baseStrPos.y, baseStrPos.z + extraDraw);
    if (rightArm && rightArm.userData.basePos) {
      rightArm.position.set(
        rightArm.userData.basePos.x,
        rightArm.userData.basePos.y,
        rightArm.userData.basePos.z + extraDraw
      );
    }
  }
  if (fireTip) {
    fireTip.visible = Boolean(isFireArrow && proj.visible);
    if (fireTip.visible) {
      const flicker = 0.92 + Math.sin(performance.now() * 0.025) * 0.14;
      fireTip.scale.set(flicker, 1 + (flicker - 1) * 1.4, flicker);
    }
  }
}
