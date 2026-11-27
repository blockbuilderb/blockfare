// ============================================================================
// 3D GROUND ARMOR & SHORAD VEHICLE MODELS (src/models/armor-models.js)
// AC-130J Ghostrider fidelity ground combat vehicles with merged/cached shared
// BufferGeometries for low draw calls and authentic FLIR thermal contrast:
//   1. buildTankModel(ctx)   — US M1A2 SEP v3 Abrams vs RU T-90M Proryv
//   2. buildHumveeModel(ctx) — US M1151 Up-Armored Humvee vs RU GAZ-233014 Tigr-M
//   3. buildApcModel(ctx)    — US LAV-25A2 / Stryker vs RU BTR-82A 8x8
//   4. buildSpaagModel(ctx)  — US LAV-AD 8x8 vs RU 2K22M1 Tunguska SPAAG
// Orientation invariant: Vehicle group forward is LOCAL -Z (Nose/Glacis/Headlights),
// +Z = REAR (Taillights/Exhaust). Hull meshes attach to a Math.PI-rotated hullRoot
// while turretPivot uses vehicles.js (+Math.PI) so both hull & turret face -Z!
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

function _createForwardHullRoot(group) {
  const hullRoot = new THREE.Group();
  hullRoot.name = 'armorHullRoot';
  hullRoot.rotation.y = Math.PI;
  hullRoot.updateMatrix();
  group.add(hullRoot);
  return hullRoot;
}

// ─── MODULE-SCOPE SHARED GEOMETRY & MATERIAL CACHE (.userData.shared = true) ──
const _armorGeoCache = new Map();

function _markShared(resource) {
  if (resource) {
    resource.userData = resource.userData || {};
    resource.userData.shared = true;
  }
  return resource;
}

const _headlightMat = _markShared(new THREE.MeshBasicMaterial({ color: 0xf5f6fa }));
const _taillightMat = _markShared(new THREE.MeshBasicMaterial({ color: 0xd63031 }));
const _shtoraRedMat = _markShared(new THREE.MeshBasicMaterial({ color: 0xc21833 }));
const _opticLensMat = _markShared(
  new THREE.MeshStandardMaterial({
    color: 0x1dd1a1,
    roughness: 0.16,
    metalness: 0.84,
    flatShading: true
  })
);
// Warm olive stowage / ordnance / SAM canister coat (lum > 0.23 so it renders as
// ambient equipment in FLIR against 220°C white-hot darkMat/barrelMat parts)
const _oliveGearMat = _markShared(
  new THREE.MeshStandardMaterial({
    color: 0x586643,
    roughness: 0.78,
    metalness: 0.18,
    flatShading: true
  })
);

function _part(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  return { geo, pos: [x, y, z], rot: [rx, ry, rz] };
}

function _getCachedGeo(key, buildFn) {
  let g = _armorGeoCache.get(key);
  if (!g) {
    g = _markShared(buildFn());
    _armorGeoCache.set(key, g);
  }
  return g;
}

function _getSphereGeo(radius, wSeg = 10, hSeg = 8) {
  return _getCachedGeo(`sphere:${radius.toFixed(4)}_${wSeg}_${hSeg}`, () =>
    new THREE.SphereGeometry(radius, wSeg, hSeg)
  );
}

function _addMerged(parent, key, ctx, mat, buildPartsFn, castShadow = true, receiveShadow = false) {
  const geo = _getCachedGeo(key, () => {
    const parts = [];
    buildPartsFn(parts);
    return _markShared(ctx.mergeParts(parts));
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

function _getTankRoadwheelGeo(ctx, radius = 0.42, width = 0.54, hubR = 0.15) {
  return _getCachedGeo(`roadwheel:${radius.toFixed(3)}_${width.toFixed(3)}_${hubR.toFixed(3)}`, () => {
    const parts = [];
    const discW = width * 0.42;
    const gapOff = width * 0.28;
    // Dual inner/outer steel roadwheel discs separated by center guide-tooth channel
    parts.push(_part(ctx.getCyl(radius, radius, discW, 12, Math.PI / 2), -gapOff, 0, 0));
    parts.push(_part(ctx.getCyl(radius, radius, discW, 12, Math.PI / 2), gapOff, 0, 0));
    // Central axle spacer + armored outer grease hub cap
    parts.push(_part(ctx.getCyl(hubR * 1.15, hubR * 1.15, width * 1.06, 10, Math.PI / 2), 0, 0, 0));
    // Radial stiffener ribs / lug bolts so rotation around .rotation.x is unmistakable
    parts.push(_part(ctx.getSpokes(3, width * 1.08, 0.055, radius * 1.56), 0, 0, 0));
    return ctx.mergeParts(parts);
  });
}

function _getCtisWheelHubGeo(ctx, rimR, width, tag) {
  return _getCachedGeo(`ctisHub:${tag}:${rimR.toFixed(3)}_${width.toFixed(3)}`, () => {
    const parts = [];
    // Recessed armored steel beadlock dish
    parts.push(_part(ctx.getCyl(rimR, rimR, width * 0.94, 12, Math.PI / 2), 0, 0, 0));
    // Protruding central CTIS planetary reduction hub
    parts.push(_part(ctx.getCyl(rimR * 0.46, rimR * 0.52, width * 1.1, 10, Math.PI / 2), 0, 0, 0));
    // CTIS armored air-line guard bar + radial beadlock lug bolts
    parts.push(_part(ctx.getBox(width * 1.14, rimR * 0.24, rimR * 1.48), 0, 0, 0));
    parts.push(_part(ctx.getSpokes(4, width * 1.02, 0.045, rimR * 1.72), 0, 0, 0));
    return ctx.mergeParts(parts);
  });
}

function _appendTrackRunDetails(parts, ctx, side, xCenter, halfSpanZ, trackW, topY, botY) {
  const sx = side * xCenter;
  // Main armored track housing core + sloped front/rear return ramps
  parts.push(_part(ctx.getBox(trackW, topY - botY - 0.12, halfSpanZ * 1.84), sx, (topY + botY) * 0.5, 0));
  parts.push(_part(ctx.getBox(trackW * 0.96, 0.44, 0.72), sx, topY - 0.28, halfSpanZ - 0.18, 0.48, 0, 0));
  parts.push(_part(ctx.getBox(trackW * 0.96, 0.44, 0.72), sx, topY - 0.28, -halfSpanZ + 0.18, -0.48, 0, 0));

  // Upper return track run & lower ground-contact track belt
  parts.push(_part(ctx.getBox(trackW * 1.03, 0.075, halfSpanZ * 1.92), sx, topY, 0));
  parts.push(_part(ctx.getBox(trackW * 1.03, 0.075, halfSpanZ * 1.66), sx, botY, 0));

  // Tread grouser bars along lower belt + angled front/rear wraps
  const grouserGeo = ctx.getBox(trackW * 1.06, 0.045, 0.11);
  for (let gz = -halfSpanZ * 0.8; gz <= halfSpanZ * 0.801; gz += 0.44) {
    parts.push(_part(grouserGeo, sx, botY - 0.025, gz));
  }
  for (const dir of [-1, 1]) {
    parts.push(_part(grouserGeo, sx, botY + 0.16, dir * (halfSpanZ - 0.34), dir * -0.58, 0, 0));
    parts.push(_part(grouserGeo, sx, botY + 0.42, dir * (halfSpanZ - 0.08), dir * -1.12, 0, 0));
  }

  // Front toothed drive sprocket (+Z) & rear tensioner idler wheel (-Z)
  const sprY = topY - 0.34;
  const sprZ = halfSpanZ - 0.24;
  parts.push(_part(ctx.getCyl(0.36, 0.36, trackW * 0.92, 12, Math.PI / 2), sx, sprY, sprZ));
  parts.push(_part(ctx.getSpokes(6, trackW * 0.98, 0.08, 0.84), sx, sprY, sprZ));

  const idlZ = -halfSpanZ + 0.24;
  parts.push(_part(ctx.getCyl(0.34, 0.34, trackW * 0.88, 12, Math.PI / 2), sx, sprY, idlZ));
  parts.push(_part(ctx.getCyl(0.16, 0.16, trackW * 0.96, 8, Math.PI / 2), sx, sprY, idlZ));

  // Upper track return rollers
  const rollerGeo = ctx.getCyl(0.11, 0.11, trackW * 0.82, 8, Math.PI / 2);
  for (const rz of [-1.85, -0.62, 0.62, 1.85]) {
    if (Math.abs(rz) < halfSpanZ - 0.55) {
      parts.push(_part(rollerGeo, sx, topY - 0.12, rz));
    }
  }
}

// ============================================================================
// 1. MAIN BATTLE TANK — US M1A2 SEP v3 ABRAMS vs RU T-90M PRORYV
// Footprint: ~3.6m W x 6.8m L | +Z = Front Glacis & Smoothbore Gun, -Z = Rear
// ============================================================================
export function buildTankModel(ctx) {
  const {
    isUS,
    group,
    wheels,
    turretPivot,
    hullMat,
    eraMat,
    darkMat,
    barrelMat,
    glassMat
  } = ctx;
  const sideTag = isUS ? 'us' : 'ru';

  // ── A. 12 Articulated Roadwheels (6 per side, rotated around .rotation.x) ──
  const roadWheelGeo = _getTankRoadwheelGeo(ctx, 0.42, 0.54, 0.15);
  for (const wz of [-2.48, -1.49, -0.5, 0.5, 1.49, 2.48]) {
    for (const wx of [-1.42, 1.42]) {
      const w = new THREE.Mesh(roadWheelGeo, barrelMat);
      w.position.set(wx, 0.44, wz);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    }
  }

  const hullRoot = _createForwardHullRoot(group);

  // ── B. Hull Caterpillar Tracks, Sprockets, Idlers, Shackles & Engine Louvers (darkMat -> FLIR white-hot!) ──
  _addMerged(
    hullRoot,
    `tank:${sideTag}:hullDark`,
    ctx,
    darkMat,
    (p) => {
      for (const s of [-1, 1]) {
        _appendTrackRunDetails(p, ctx, s, 1.42, 3.26, 0.68, 0.98, 0.08);
        // Forged front recovery tow shackles on lower/upper glacis nose (+Z)
        p.push(_part(ctx.getBox(0.11, 0.14, 0.22), s * 0.92, 0.92, 3.32, 0.25, 0, 0));
        p.push(_part(ctx.getCyl(0.045, 0.045, 0.18, 8, Math.PI / 2), s * 0.92, 0.88, 3.4));
        // Rear tow pintle shackles & rubber lower mudflaps (-Z)
        p.push(_part(ctx.getBox(0.68, 0.26, 0.05), s * 1.42, 0.52, -3.32, -0.14, 0, 0));
        p.push(_part(ctx.getBox(0.1, 0.12, 0.18), s * 0.86, 0.92, -3.28));
        // Armored headlight brush-guard cages (+Z)
        p.push(_part(ctx.getBox(0.26, 0.2, 0.22), s * 1.16, 1.32, 3.16));
      }

      // Rear Engine Deck Cooling Grilles & Exhaust Louvers (-Z, glows hot in AC-130 FLIR!)
      p.push(_part(ctx.getBox(2.26, 0.08, 1.72), 0, 1.56, -2.18));
      const louverBar = ctx.getBox(0.96, 0.05, 0.075);
      for (const s of [-1, 1]) {
        for (let lz = -2.86; lz <= -1.48; lz += 0.18) {
          p.push(_part(louverBar, s * 0.56, 1.6, lz, 0.26, 0, 0));
        }
      }

      if (isUS) {
        // AGT1500 gas-turbine rear center hot exhaust louver box (-Z)
        p.push(_part(ctx.getBox(1.24, 0.36, 0.18), 0, 1.16, -3.24));
        for (let ey = 1.04; ey <= 1.28; ey += 0.08) {
          p.push(_part(ctx.getBox(1.14, 0.03, 0.22), 0, ey, -3.28, -0.22, 0, 0));
        }
      } else {
        // T-90M V-92S2F diesel port-side exhaust manifold shroud + rubber side skirt flaps
        p.push(_part(ctx.getBox(0.18, 0.22, 0.78), -1.78, 1.26, -1.95));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.05, 0.22, 5.85), s * 1.79, 0.62, 0.12));
          // Steel mounting straps around twin external rear fuel drums
          for (const bx of [-0.36, 0.36]) {
            p.push(_part(ctx.getCyl(0.355, 0.355, 0.055, 12, Math.PI / 2), s * 0.74 + bx, 1.48, -3.35));
          }
        }
      }
    },
    true,
    true
  );

  // ── C. Main Armored Lower/Upper Hull, Sloped Glacis (-Z world) & Driver Periscope Hood (hullMat) ──
  _addMerged(
    hullRoot,
    `tank:${sideTag}:hullMain`,
    ctx,
    hullMat,
    (p) => {
      // Lower armored belly tub + angled lower front glacis plate
      p.push(_part(ctx.getBox(2.02, 0.68, 5.95), 0, 0.76, -0.04));
      p.push(_part(ctx.getBox(2.68, 0.52, 0.96), 0, 0.72, 2.94, -0.54, 0, 0));
      // Upper main hull sponsons above tracks
      p.push(_part(ctx.getBox(2.84, 0.58, 6.18), 0, 1.25, -0.06));
      // Steeply sloped composite upper glacis plate (+Z)
      p.push(_part(ctx.getBox(2.8, 0.28, 1.92), 0, 1.34, 2.52, 0.34, 0, 0));
      p.push(_part(ctx.getBox(2.76, 0.22, 0.56), 0, 1.02, 3.16, 0.12, 0, 0));
      // Driver center armored hatch & 3-periscope hood (+Z)
      p.push(_part(ctx.getBox(0.76, 0.18, 0.68), 0, 1.56, 1.98, 0.12, 0, 0));
      p.push(_part(ctx.getBox(0.62, 0.12, 0.24), 0, 1.63, 2.18));
      // Front & rear track fender fairings + rear hull bulkhead
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.74, 0.14, 0.68), s * 1.42, 1.16, 3.12, 0.28, 0, 0));
        p.push(_part(ctx.getBox(0.74, 0.14, 0.58), s * 1.42, 1.18, -3.12, -0.24, 0, 0));
        // Base armored side skirt backing plates
        p.push(_part(ctx.getBox(0.12, 0.62, 6.32), s * 1.74, 1.04, 0.04));
      }
      p.push(_part(ctx.getBox(2.76, 0.62, 0.28), 0, 1.2, -3.12, -0.14, 0, 0));
      if (!isUS) {
        // T-90M splash V-rib across upper glacis
        p.push(_part(ctx.getBox(1.18, 0.08, 0.1), -0.52, 1.45, 2.35, 0.34, 0.32, 0));
        p.push(_part(ctx.getBox(1.18, 0.08, 0.1), 0.52, 1.45, 2.35, 0.34, -0.32, 0));
      }
    },
    true,
    true
  );

  // ── D. Hull ERA Side Skirts, Glacis Applique & T-90M External Rear Fuel Drums (eraMat) ──
  _addMerged(
    hullRoot,
    `tank:${sideTag}:hullEra`,
    ctx,
    eraMat,
    (p) => {
      if (isUS) {
        // M1A2 SEP v3 TUSK ARAT-1 stepped reactive armor tiles along hull flanks
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            const tz = -1.25 + i * 0.78;
            p.push(_part(ctx.getBox(0.14, 0.48, 0.72), s * 1.83, 1.06, tz));
            p.push(_part(ctx.getBox(0.16, 0.08, 0.68), s * 1.84, 1.28, tz));
          }
          // Rear flat ballistic hull panels
          p.push(_part(ctx.getBox(0.1, 0.52, 1.42), s * 1.81, 1.08, -2.42));
        }
        // NGAP reinforced lower bow armor module + rear hull APU box
        p.push(_part(ctx.getBox(2.42, 0.14, 1.32), 0, 1.42, 2.58, 0.34, 0, 0));
        p.push(_part(ctx.getBox(0.62, 0.38, 0.34), 0.92, 1.46, -3.18));
      } else {
        // T-90M Proryv heavy Relikt modular side skirt ERA plates + bolt strips
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            const rz = -1.35 + i * 0.86;
            p.push(_part(ctx.getBox(0.15, 0.56, 0.82), s * 1.83, 1.04, rz, 0, 0, s * -0.05));
            p.push(_part(ctx.getBox(0.17, 0.06, 0.78), s * 1.85, 1.28, rz));
          }
          // Signature twin cylindrical external diesel fuel drums on rear hull (z ≈ -3.35)
          p.push(_part(ctx.getCyl(0.34, 0.34, 1.14, 12, Math.PI / 2), s * 0.74, 1.48, -3.35));
          p.push(_part(ctx.getBox(0.12, 0.42, 0.46), s * 0.74, 1.34, -3.14, -0.25, 0, 0));
        }
        // Upper glacis Relikt ERA brick array
        for (let gx = -0.96; gx <= 0.97; gx += 0.48) {
          p.push(_part(ctx.getBox(0.44, 0.12, 0.76), gx, 1.44, 2.66, 0.34, 0, 0));
        }
      }
    },
    true,
    false
  );

  // ── E. RU T-90M Rear Hull Slat-Armor Cage Bars / US Tow Cables (barrelMat) ──
  _addMerged(
    hullRoot,
    `tank:${sideTag}:hullSteel`,
    ctx,
    barrelMat,
    (p) => {
      if (isUS) {
        // Braided steel recovery cables clamped along upper hull sides
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.032, 0.032, 3.6, 6), s * 1.54, 1.56, 0.35, Math.PI / 2, 0, 0));
        }
      } else {
        // T-90M Proryv rear hull & engine-compartment slat-armor bar cage (-Z)
        for (const s of [-1, 1]) {
          for (let sy = 0.86; sy <= 1.34; sy += 0.12) {
            p.push(_part(ctx.getBox(0.035, 0.03, 1.48), s * 1.88, sy, -2.52));
          }
          for (const sz of [-1.85, -2.52, -3.18]) {
            p.push(_part(ctx.getBox(0.08, 0.56, 0.04), s * 1.85, 1.1, sz));
          }
        }
        // Rear lower transom slat-armor bars beneath fuel drums
        for (let ry = 0.78; ry <= 1.14; ry += 0.12) {
          p.push(_part(ctx.getBox(2.58, 0.03, 0.04), 0, ry, -3.4));
        }
        for (const rx of [-1.15, -0.42, 0.42, 1.15]) {
          p.push(_part(ctx.getBox(0.04, 0.44, 0.14), rx, 0.96, -3.32));
        }
      }
    },
    false,
    false
  );

  // ── F. Driver Vision Periscopes, Armored Headlights (world -Z front) & Convoy Taillights (world +Z rear) ──
  _addMerged(
    hullRoot,
    `tank:${sideTag}:hullGlass`,
    ctx,
    glassMat,
    (p) => {
      for (const px of [-0.2, 0, 0.2]) {
        p.push(_part(ctx.getBox(0.14, 0.07, 0.08), px, 1.63, 2.3, 0, px * -0.35, 0));
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `tank:${sideTag}:headlights`,
    ctx,
    _headlightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.16, 0.11, 0.05), s * 1.16, 1.32, 3.26));
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `tank:${sideTag}:taillights`,
    ctx,
    _taillightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.16, 0.08, 0.05), s * 1.24, 1.34, -3.26));
      }
    },
    false,
    false
  );

  // ==========================================================================
  // 2. ROTATING TURRET (turretPivot at y = 1.95, z = -0.15 forward of engine deck)
  // Sightline note: 1P & Optic cameras sit at world y = 2.68 (local y = 0.73)
  // along x = 0. Keep center roof <= 0.46 local Y & offset sights to |x| >= 0.52!
  // ==========================================================================
  turretPivot.position.set(0, 1.95, -0.15);

  if (isUS) {
    // ── US M1A2 SEP v3 ABRAMS ANGULAR CHOBHAM TURRET ──
    _addMerged(
      turretPivot,
      'tank:us:turretHull',
      ctx,
      hullMat,
      (p) => {
        // Wide angular composite turret core + extended rear ammo bustle (-Z)
        p.push(_part(ctx.getBox(2.52, 0.78, 2.65), 0, 0.02, -0.08));
        p.push(_part(ctx.getBox(2.38, 0.66, 1.36), 0, 0.08, -1.96));
        // Sloped turret roof crown (top at local y = 0.44 -> world 2.39)
        p.push(_part(ctx.getBox(2.26, 0.08, 2.35), 0, 0.41, -0.18));
        // Swept composite frontal cheek wedges (+Z, arrowhead sweep ry = +s * angle)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(1.06, 0.74, 0.92), s * 0.72, 0.0, 1.12, 0.08, s * 0.34, 0));
          p.push(_part(ctx.getBox(0.24, 0.72, 2.55), s * 1.28, 0.02, -0.1, 0, 0, s * -0.12));
        }
        // Left-roof CITV independent thermal viewer armored cylinder + hood
        p.push(_part(ctx.getCyl(0.24, 0.27, 0.32, 10), -0.66, 0.52, 0.52));
        p.push(_part(ctx.getBox(0.32, 0.22, 0.28), -0.66, 0.55, 0.56));
        // Loader circular roof hatch (left rear)
        p.push(_part(ctx.getCyl(0.32, 0.34, 0.09, 10), -0.62, 0.45, -0.48));
        // Right-roof Commander octagonal vision-block cupola
        p.push(_part(ctx.getCyl(0.36, 0.4, 0.2, 8), 0.66, 0.48, -0.38));
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'tank:us:turretEra',
      ctx,
      eraMat,
      (p) => {
        // Layered NGAP front cheek armor appliques + Trophy APS side radar panels
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.96, 0.64, 0.24), s * 0.74, 0.0, 1.48, 0.12, s * 0.34, 0));
          p.push(_part(ctx.getBox(0.14, 0.42, 0.62), s * 1.4, 0.14, 0.28, 0, s * 0.18, 0));
          p.push(_part(ctx.getBox(0.12, 0.48, 1.18), s * 1.24, 0.1, -1.92));
        }
        // Rear bustle blowout ammo panels with pressure-relief seams (-Z)
        for (const bx of [-0.62, 0, 0.62]) {
          p.push(_part(ctx.getBox(0.56, 0.07, 1.08), bx, 0.43, -1.96));
        }
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'tank:us:turretDark',
      ctx,
      darkMat,
      (p) => {
        // Gunner primary GPS doghouse housing (right-front roof, offset x = +0.62)
        p.push(_part(ctx.getBox(0.34, 0.22, 0.42), 0.62, 0.5, 0.48));
        // CROWS II stabilized .50 cal RWS gimbal mount & sensor pod (offset x = +0.66)
        p.push(_part(ctx.getBox(0.24, 0.2, 0.32), 0.66, 0.62, -0.28));
        p.push(_part(ctx.getBox(0.18, 0.14, 0.24), 0.52, 0.62, -0.22));
        // Crosswind meteorological mast at rear bustle corner
        p.push(_part(ctx.getCyl(0.03, 0.04, 0.44, 6), 0.96, 0.6, -2.48));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'tank:us:turretSteel',
      ctx,
      barrelMat,
      (p) => {
        // Open steel bustle stowage rack (-Z) & side equipment rails
        p.push(_part(ctx.getBox(2.08, 0.045, 0.58), 0, -0.14, -2.92));
        p.push(_part(ctx.getBox(2.08, 0.045, 0.05), 0, 0.26, -3.19));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.045, 0.045, 0.58), s * 1.02, 0.26, -2.92));
          p.push(_part(ctx.getBox(0.045, 0.42, 0.045), s * 1.02, 0.06, -3.19));
          p.push(_part(ctx.getBox(0.045, 0.045, 1.55), s * 1.38, 0.28, -1.05));
          p.push(_part(ctx.getCyl(0.016, 0.024, 1.35, 6), s * 1.08, 1.02, -2.55, -0.08, 0, 0));
          // 2x6 M250 smoke grenade dischargers (6 angled cylindrical tubes per side)
          const smokeTube = ctx.getCyl(0.042, 0.042, 0.28, 8);
          for (let i = 0; i < 6; i++) {
            const row = Math.floor(i / 3);
            const col = i % 3;
            p.push(
              _part(
                smokeTube,
                s * (1.34 + col * 0.04),
                0.12 + row * 0.09,
                0.86 - col * 0.11,
                Math.PI / 2 - 0.38,
                s * (0.22 + col * 0.1),
                0
              )
            );
          }
        }
        for (const rx of [-0.52, 0, 0.52]) {
          p.push(_part(ctx.getBox(0.04, 0.42, 0.04), rx, 0.06, -3.19));
        }
      },
      true,
      false
    );

    // Articulated High-Elevation (-18° to +62°) CROWS II .50 Cal M2HB Roof RWS Pivot!
    const usRwsPivot = new THREE.Group();
    usRwsPivot.name = 'roofRwsPivot';
    usRwsPivot.position.set(0.66, 0.66, -0.18);
    _addMerged(
      usRwsPivot,
      'tank:us:roofRwsGun',
      ctx,
      barrelMat,
      (p) => {
        p.push(_part(ctx.getBox(0.16, 0.14, 0.34), 0, 0, 0.06));
        p.push(_part(ctx.getCyl(0.028, 0.034, 0.88, 8), 0, 0.01, 0.48, Math.PI / 2, 0, 0));
      },
      true,
      false
    );
    turretPivot.add(usRwsPivot);
    group.userData.roofRwsPivot = usRwsPivot;

    _addMerged(
      turretPivot,
      'tank:us:turretGear',
      ctx,
      _oliveGearMat,
      (p) => {
        // Olive stowage duffels/jerry cans inside rear bustle rack + CROWS .50 cal ammo box
        p.push(_part(ctx.getBox(0.68, 0.28, 0.42), -0.56, 0.04, -2.92));
        p.push(_part(ctx.getBox(0.58, 0.26, 0.38), 0.48, 0.03, -2.9));
        p.push(_part(ctx.getBox(0.16, 0.15, 0.26), 0.82, 0.61, -0.26));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'tank:us:turretOptics',
      ctx,
      _opticLensMat,
      (p) => {
        // CITV forward thermal window + GPS gunner window + CROWS optic lens (+Z)
        p.push(_part(ctx.getBox(0.18, 0.13, 0.05), -0.66, 0.56, 0.71));
        p.push(_part(ctx.getBox(0.18, 0.12, 0.05), 0.62, 0.51, 0.7));
        p.push(_part(ctx.getBox(0.11, 0.08, 0.04), 0.52, 0.62, -0.09));
      },
      false,
      false
    );
  } else {
    // ── RU T-90M PRORYV WELDED TURRET + RELIKT ARROWHEAD ERA + SHTORA-1 ──
    _addMerged(
      turretPivot,
      'tank:ru:turretHull',
      ctx,
      hullMat,
      (p) => {
        // Low-profile octagonal welded Proryv-3 turret core + rear autoloader bustle (-Z)
        p.push(_part(ctx.getBox(2.38, 0.64, 2.32), 0, -0.03, -0.04));
        p.push(_part(ctx.getBox(1.86, 0.54, 0.96), 0, 0.02, -1.62));
        p.push(_part(ctx.getBox(2.08, 0.08, 2.02), 0, 0.32, -0.06));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.88, 0.6, 0.84), s * 0.68, -0.03, 0.92, 0.08, s * 0.42, 0));
          // Commander cupola (right) & Sosna-U gunner thermal sight housing (left)
          p.push(_part(ctx.getCyl(0.31, 0.35, 0.16, 8), s * 0.58, 0.41, s > 0 ? -0.36 : -0.44));
        }
        p.push(_part(ctx.getBox(0.32, 0.24, 0.38), -0.62, 0.46, 0.38));
        // PK PAN Hawkeye panoramic commander thermal sight cylinder (offset x = +0.62)
        p.push(_part(ctx.getCyl(0.2, 0.23, 0.28, 10), 0.62, 0.52, -0.62));
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'tank:ru:turretEra',
      ctx,
      eraMat,
      (p) => {
        // Iconic Relikt arrowhead ERA wedge blocks ringing the frontal turret arc (+Z)
        for (const s of [-1, 1]) {
          // Inner & outer V-angled upper/lower clamshell arrowhead wedges
          p.push(_part(ctx.getBox(0.62, 0.34, 0.26), s * 0.56, 0.1, 1.32, -0.34, s * 0.38, 0));
          p.push(_part(ctx.getBox(0.62, 0.28, 0.24), s * 0.56, -0.16, 1.3, 0.36, s * 0.38, 0));
          p.push(_part(ctx.getBox(0.68, 0.34, 0.26), s * 1.06, 0.08, 0.98, -0.32, s * 0.66, 0));
          p.push(_part(ctx.getBox(0.68, 0.28, 0.24), s * 1.06, -0.16, 0.96, 0.34, s * 0.66, 0));
          // Flank Relikt turret cheek cassettes
          p.push(_part(ctx.getBox(0.18, 0.52, 1.38), s * 1.26, 0.0, -0.08, 0, 0, s * -0.14));
        }
        // Roof Kontakt-5 / Relikt anti-top-attack ERA brick array on forward turret crown
        for (const rx of [-0.68, -0.22, 0.22, 0.68]) {
          p.push(_part(ctx.getBox(0.38, 0.08, 0.52), rx, 0.37, 0.62, 0.12, 0, 0));
        }
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'tank:ru:turretDark',
      ctx,
      darkMat,
      (p) => {
        // Twin Shtora-1 (TShU-1-7) electro-optical IR jammer emitter boxes flanking mantlet (+Z)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.28, 0.26, 0.26), s * 0.44, 0.08, 1.34));
          // Laser warning receiver sensors on forward roof corners
          p.push(_part(ctx.getCyl(0.055, 0.065, 0.18, 8), s * 0.92, 0.42, 0.56));
        }
        // UDP T05BV-1 remote weapon station mount for roof 12.7mm Kord MG (offset x = +0.62)
        p.push(_part(ctx.getBox(0.22, 0.2, 0.3), 0.62, 0.56, -0.22));
      },
      false,
      false
    );

    // Glowing dark-red Shtora-1 IR jammer lenses (+Z)
    _addMerged(
      turretPivot,
      'tank:ru:shtoraLenses',
      ctx,
      _shtoraRedMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.095, 0.095, 0.05, 10), s * 0.44, 0.08, 1.46, Math.PI / 2, 0, 0));
        }
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'tank:ru:turretSteel',
      ctx,
      barrelMat,
      (p) => {
        // Rear turret bustle slat-armor cage + 2x6 recessed 902B Tucha smoke grenade tubes
        const smokeTube = ctx.getCyl(0.04, 0.04, 0.26, 8);
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            p.push(
              _part(
                smokeTube,
                s * 1.32,
                -0.02 + (i % 2) * 0.1,
                0.42 - Math.floor(i / 2) * 0.16,
                Math.PI / 2 - 0.32,
                s * 0.28,
                0
              )
            );
          }
          for (let cy = -0.18; cy <= 0.22; cy += 0.13) {
            p.push(_part(ctx.getBox(0.035, 0.03, 0.96), s * 1.04, cy, -1.68));
          }
        }
        for (let cy = -0.18; cy <= 0.22; cy += 0.13) {
          p.push(_part(ctx.getBox(2.08, 0.03, 0.035), 0, cy, -2.18));
        }
        // Rear whip antenna
        p.push(_part(ctx.getCyl(0.016, 0.024, 1.3, 6), -0.88, 0.96, -1.85, -0.1, 0, 0));
      },
      true,
      false
    );

    // Articulated High-Elevation (-18° to +62°) UDP T05BV-1 12.7mm Kord Roof RWS Pivot!
    const ruRwsPivot = new THREE.Group();
    ruRwsPivot.name = 'roofRwsPivot';
    ruRwsPivot.position.set(0.62, 0.62, -0.14);
    _addMerged(
      ruRwsPivot,
      'tank:ru:roofRwsGun',
      ctx,
      barrelMat,
      (p) => {
        p.push(_part(ctx.getBox(0.15, 0.14, 0.34), 0, 0, 0.06));
        p.push(_part(ctx.getCyl(0.028, 0.035, 0.92, 8), 0, 0.01, 0.5, Math.PI / 2, 0, 0));
      },
      true,
      false
    );
    turretPivot.add(ruRwsPivot);
    group.userData.roofRwsPivot = ruRwsPivot;

    _addMerged(
      turretPivot,
      'tank:ru:turretGear',
      ctx,
      _oliveGearMat,
      (p) => {
        // Kord 12.7mm ammo box + unditching log strapped across rear turret/hull
        p.push(_part(ctx.getBox(0.16, 0.15, 0.26), 0.78, 0.56, -0.22));
        p.push(_part(ctx.getCyl(0.09, 0.09, 2.35, 8, Math.PI / 2), 0, -0.22, -2.06));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'tank:ru:turretOptics',
      ctx,
      _opticLensMat,
      (p) => {
        // Sosna-U gunner thermal window + PK PAN commander panoramic thermal window (+Z)
        p.push(_part(ctx.getBox(0.18, 0.13, 0.05), -0.62, 0.47, 0.58));
        p.push(_part(ctx.getBox(0.16, 0.11, 0.05), 0.62, 0.54, -0.42));
      },
      false,
      false
    );
  }

  // ==========================================================================
  // 3. RECOILING MAIN SMOOTHBORE CANNON GROUP (z = 1.35 matches vehicles.js recoil!)
  // ==========================================================================
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.04, 1.35);

  // Gun mantlet, thermal shroud bands, MRS muzzle reference sensor & 7.62mm coax (darkMat)
  _addMerged(
    barrelGroup,
    `tank:${sideTag}:bgDark`,
    ctx,
    darkMat,
    (p) => {
      // Heavy armored gun mantlet & dust boot
      p.push(_part(ctx.getBox(0.68, 0.5, 0.56), 0, 0, 0));
      // Thermal shroud clamping bands along smoothbore tube (+Z)
      for (const bz of [0.85, 1.55, 2.95, 3.65]) {
        p.push(_part(ctx.getCyl(0.152, 0.152, 0.11, 10), 0, 0, bz, Math.PI / 2, 0, 0));
      }
      // Muzzle collar & elevated MRS (Muzzle Reference Sensor) optical mast
      const muzZ = isUS ? 4.18 : 4.32;
      p.push(_part(ctx.getCyl(0.168, 0.168, 0.28, 10), 0, 0, muzZ, Math.PI / 2, 0, 0));
      p.push(_part(ctx.getBox(0.045, 0.14, 0.09), 0, 0.19, muzZ + 0.04));
      // Coaxial 7.62mm M240 / PKTM barrel & gas tube
      p.push(_part(ctx.getCyl(0.028, 0.032, 1.12, 8), isUS ? 0.26 : 0.24, 0.02, 0.68, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  // Main 120mm M256 (US) / 125mm 2A46M-5 (RU) smoothbore cannon tube (barrelMat -> hot in FLIR!)
  _addMerged(
    barrelGroup,
    `tank:${sideTag}:bgBarrel`,
    ctx,
    barrelMat,
    (p) => {
      const tubeLen = isUS ? 4.05 : 4.22;
      p.push(_part(ctx.getCyl(0.128, 0.148, tubeLen, 12), 0, 0, 0.2 + tubeLen * 0.5, Math.PI / 2, 0, 0));
      p.push(_part(ctx.getCyl(0.165, 0.175, 0.72, 10), 0, 0, 0.56, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  // Bore evacuator / offset 2A46M-5 fume extractor + armored mantlet shield (hullMat)
  _addMerged(
    barrelGroup,
    `tank:${sideTag}:bgHull`,
    ctx,
    hullMat,
    (p) => {
      p.push(_part(ctx.getBox(0.62, 0.44, 0.18), 0, 0.02, 0.26));
      if (isUS) {
        // Concentric M256 bore evacuator cylinder
        p.push(_part(ctx.getCyl(0.195, 0.195, 0.72, 12), 0, 0, 2.25, Math.PI / 2, 0, 0));
      } else {
        // Signature offset 2A46M-5 cylindrical fume extractor
        p.push(_part(ctx.getCyl(0.185, 0.185, 0.66, 12), 0, 0.032, 2.15, Math.PI / 2, 0, 0));
      }
    },
    true,
    false
  );

  turretPivot.add(barrelGroup);
  if (!turretPivot.parent) group.add(turretPivot);
  return { barrelGroup };
}

// ============================================================================
// 2. UP-ARMORED TACTICAL CAR — US M1151 HUMVEE vs RU GAZ-233014 TIGR-M
// Footprint: ~2.6m W x 4.9m L | +Z = Front Grille/Hood, -Z = Rear Hatch
// Camera invariant: turretPivot at (0, 2.48, -0.2); ALL turret geometry kept
// strictly <= 0.32 local Y (<= 2.80 world Y) below 1P (2.96) & Optic (2.88)!
// ============================================================================
export function buildHumveeModel(ctx) {
  const {
    isUS,
    group,
    wheels,
    turretPivot,
    hullMat,
    eraMat,
    darkMat,
    barrelMat,
    glassMat
  } = ctx;
  const sideTag = isUS ? 'us' : 'ru';

  // ── A. 4 Deep-Lug Off-Road Mud Tires + CTIS Armored Hubs in wheelPivot Groups ──
  const tireGeo = ctx.getTreadTire(0.56, 0.42, 14, 10, 0.43, 0.055, 0.09, 0.55);
  const hubGeo = _getCtisWheelHubGeo(ctx, 0.33, 0.43, 'humvee');
  for (const [wx, wz] of [
    [-1.32, -1.58],
    [1.32, -1.58],
    [-1.32, 1.58],
    [1.32, 1.58]
  ]) {
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(wx, 0.56, wz);

    const tire = new THREE.Mesh(tireGeo, darkMat);
    tire.castShadow = true;
    wheelPivot.add(tire);

    const hub = new THREE.Mesh(hubGeo, eraMat);
    wheelPivot.add(hub);

    group.add(wheelPivot);
    wheels.push(wheelPivot);
  }

  const hullRoot = _createForwardHullRoot(group);

  // ── B. Armored Body, Sloped Hood, Flared Fenders & Slant-Back / Troop Roof (hullMat) ──
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:hullMain`,
    ctx,
    hullMat,
    (p) => {
      // High-clearance armored lower sill & cabin tub
      p.push(_part(ctx.getBox(2.38, 0.64, 4.42), 0, 1.06, -0.02));
      // Flared trapezoidal wheel-well fenders framing front & rear off-road tires
      for (const s of [-1, 1]) {
        for (const fz of [1.58, -1.58]) {
          p.push(_part(ctx.getBox(0.36, 0.12, 1.14), s * 1.24, 1.28, fz));
          p.push(_part(ctx.getBox(0.34, 0.34, 0.24), s * 1.23, 1.08, fz + (fz > 0 ? 0.62 : -0.62), fz > 0 ? -0.45 : 0.45, 0, 0));
          p.push(_part(ctx.getBox(0.34, 0.34, 0.24), s * 1.23, 1.08, fz + (fz > 0 ? -0.62 : 0.62), fz > 0 ? 0.45 : -0.45, 0, 0));
        }
        // A/B/C armored cabin pillars & rocker armor rails
        p.push(_part(ctx.getBox(0.14, 0.68, 0.16), s * 1.1, 1.88, 0.96, -0.26, 0, 0));
        p.push(_part(ctx.getBox(0.14, 0.68, 0.18), s * 1.12, 1.9, -0.08));
        p.push(_part(ctx.getBox(0.14, 0.68, 0.22), s * 1.12, 1.9, -1.08));
      }
      // Split ballistic windshield perimeter frame & center armored divider pillar (+Z)
      p.push(_part(ctx.getBox(2.26, 0.12, 0.14), 0, 2.24, 0.88, -0.26, 0, 0));
      p.push(_part(ctx.getBox(2.28, 0.14, 0.18), 0, 1.56, 1.08));
      p.push(_part(ctx.getBox(0.13, 0.66, 0.14), 0, 1.9, 0.98, -0.26, 0, 0));

      if (isUS) {
        // M1151 wide flat-sloped armored hood (+Z) & 7-slot radiator surround
        p.push(_part(ctx.getBox(2.34, 0.28, 1.28), 0, 1.4, 1.68, 0.11, 0, 0));
        p.push(_part(ctx.getBox(2.32, 0.44, 0.18), 0, 1.24, 2.26));
        // Armored crew cabin roof (top y = 2.38) + iconic sloped slant-back rear cargo hatch (-Z)
        p.push(_part(ctx.getBox(2.28, 0.12, 2.02), 0, 2.34, -0.14));
        p.push(_part(ctx.getBox(2.22, 0.16, 1.28), 0, 1.96, -1.68, -0.44, 0, 0));
        p.push(_part(ctx.getBox(2.28, 0.56, 0.24), 0, 1.38, -2.2));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.14, 0.58, 1.12), s * 1.08, 1.84, -1.64));
        }
      } else {
        // GAZ-233014 Tigr-M raised V-hood armored cowling (+Z) & full-length troop roof (-Z)
        p.push(_part(ctx.getBox(1.56, 0.34, 1.26), 0, 1.48, 1.68, 0.14, 0, 0));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.46, 0.28, 1.24), s * 0.94, 1.38, 1.66, 0.12, 0, s * -0.18));
        }
        p.push(_part(ctx.getBox(2.24, 0.48, 0.2), 0, 1.26, 2.26));
        // Full-length armored troop compartment roof & vertical rear troop doors (-Z)
        p.push(_part(ctx.getBox(2.28, 0.14, 3.16), 0, 2.35, -0.68));
        p.push(_part(ctx.getBox(2.24, 0.96, 0.18), 0, 1.84, -2.22));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.14, 0.88, 1.14), s * 1.1, 1.88, -1.64));
        }
      }
    },
    true,
    true
  );

  // ── C. 4 Recessed FRAG-5 Armored Side Doors, Hinges & Applique Armor (eraMat) ──
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:hullEra`,
    ctx,
    eraMat,
    (p) => {
      for (const s of [-1, 1]) {
        // Front (z = +0.42) & Rear (z = -0.56) heavy recessed FRAG-5 ballistic doors
        for (const dz of [0.42, -0.56]) {
          p.push(_part(ctx.getBox(0.12, 0.68, 0.86), s * 1.19, 1.48, dz));
          p.push(_part(ctx.getBox(0.11, 0.42, 0.82), s * 1.16, 2.02, dz));
          // Exterior heavy armor door hinges
          p.push(_part(ctx.getBox(0.15, 0.09, 0.12), s * 1.21, 1.66, dz + 0.34));
          p.push(_part(ctx.getBox(0.15, 0.09, 0.12), s * 1.21, 1.32, dz + 0.34));
        }
        // Rocker blast-shield threshold step
        p.push(_part(ctx.getBox(0.16, 0.12, 1.98), s * 1.24, 0.82, -0.06));
      }
      if (isUS) {
        // Slant-back clamshell hatch armor ribs
        p.push(_part(ctx.getBox(1.88, 0.08, 1.06), 0, 2.02, -1.68, -0.44, 0, 0));
      } else {
        // Tigr-M roof stiffener ribs & rear spare-wheel hub
        for (const rz of [-0.6, -1.35, -2.0]) {
          p.push(_part(ctx.getBox(2.06, 0.05, 0.1), 0, 2.43, rz));
        }
        p.push(_part(ctx.getCyl(0.24, 0.24, 0.28, 10), 0.44, 1.62, -2.38, Math.PI / 2, 0, 0));
      }
    },
    true,
    false
  );

  // ── D. Underbody Skidplate, Louvered Hood Intake, 7-Slot Grille, Brush Guard, Snorkel & Handles (darkMat -> FLIR white-hot!) ──
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:hullDark`,
    ctx,
    darkMat,
    (p) => {
      // High-clearance ladder frame, portal axles & angled front skidplate
      p.push(_part(ctx.getBox(1.36, 0.26, 3.85), 0, 0.68, 0));
      p.push(_part(ctx.getBox(1.42, 0.12, 0.72), 0, 0.76, 2.08, -0.42, 0, 0));
      for (const az of [1.58, -1.58]) {
        p.push(_part(ctx.getCyl(0.085, 0.085, 2.28, 8, Math.PI / 2), 0, 0.56, az));
        p.push(_part(ctx.getBox(0.32, 0.28, 0.32), 0, 0.58, az));
      }

      // Hood louvered air intake grille (hot radiator plume in FLIR!)
      p.push(_part(ctx.getBox(1.18, 0.05, 0.56), 0, 1.54, 1.58, 0.11, 0, 0));
      for (let lz = 1.36; lz <= 1.8; lz += 0.11) {
        p.push(_part(ctx.getBox(1.1, 0.035, 0.05), 0, 1.56, lz, 0.34, 0, 0));
      }

      if (isUS) {
        // Iconic 7-slot vertical Humvee grille (+Z)
        for (let slot = -3; slot <= 3; slot++) {
          p.push(_part(ctx.getBox(0.11, 0.32, 0.08), slot * 0.19, 1.24, 2.33));
        }
        // Heavy winch bumper + tubular steel brush guard wrapping headlights & grille
        p.push(_part(ctx.getBox(2.44, 0.22, 0.24), 0, 0.94, 2.4));
        p.push(_part(ctx.getBox(2.28, 0.065, 0.065), 0, 1.48, 2.46));
        p.push(_part(ctx.getBox(2.28, 0.06, 0.06), 0, 1.18, 2.48));
        for (const bx of [-1.1, -0.58, 0.58, 1.1]) {
          p.push(_part(ctx.getBox(0.065, 0.56, 0.08), bx, 1.22, 2.46));
        }
      } else {
        // Tigr-M armored V-cowl radiator grille + heavy welded bullbar ram bumper (+Z)
        p.push(_part(ctx.getBox(1.28, 0.36, 0.08), 0, 1.28, 2.34));
        p.push(_part(ctx.getBox(2.42, 0.26, 0.26), 0, 0.94, 2.42));
        p.push(_part(ctx.getBox(1.62, 0.075, 0.075), 0, 1.52, 2.48));
        for (const bx of [-0.76, 0.76]) {
          p.push(_part(ctx.getBox(0.08, 0.58, 0.1), bx, 1.24, 2.48));
        }
        // Rear door-mounted spare tire (-Z)
        p.push(_part(ctx.getCyl(0.46, 0.46, 0.26, 12), 0.44, 1.62, -2.36, Math.PI / 2, 0, 0));
      }

      // Door handles, side mirrors & windshield wipers
      for (const s of [-1, 1]) {
        for (const dz of [0.14, -0.82]) {
          p.push(_part(ctx.getBox(0.06, 0.05, 0.14), s * 1.26, 1.58, dz));
        }
        p.push(_part(ctx.getBox(0.16, 0.22, 0.07), s * 1.32, 1.94, 0.92));
        p.push(_part(ctx.getBox(0.36, 0.03, 0.03), s * 0.52, 1.72, 1.07, 0, 0, 0.28));
      }

      // Right B/A-pillar deep-fording snorkel intake stack + mushroom pre-cleaner cap
      p.push(_part(ctx.getCyl(0.075, 0.085, 0.88, 8), 1.28, 1.92, 0.86));
      p.push(_part(ctx.getCyl(0.14, 0.12, 0.12, 10), 1.28, 2.39, 0.86));

      // Rear bumper & hot exhaust tailpipe (-Z)
      p.push(_part(ctx.getBox(2.4, 0.2, 0.22), 0, 0.94, -2.36));
      p.push(_part(ctx.getCyl(0.065, 0.065, 0.52, 8), -0.96, 0.82, -2.22, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  // ── E. Front Winch Drum, Tow Hooks & Rear Whip Antenna (barrelMat) ──
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:hullSteel`,
    ctx,
    barrelMat,
    (p) => {
      // Front Warn winch cable drum + shackles (world -Z)
      p.push(_part(ctx.getCyl(0.095, 0.095, 0.44, 8, Math.PI / 2), 0, 0.96, 2.48));
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.07, 0.11, 0.14), s * 0.82, 0.92, 2.52));
        p.push(_part(ctx.getBox(0.07, 0.11, 0.14), s * 0.82, 0.92, -2.46));
      }
      // Rear corner whip antenna angled slightly aft so center sightline is 100% open
      p.push(_part(ctx.getCyl(0.015, 0.025, 1.15, 6), -1.18, 2.25, -2.18, -0.22, 0, 0.12));
    },
    false,
    false
  );

  // ── F. Split Ballistic Windshield & 4 Armored Door Windows (glassMat) + LED Lights ──
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:glass`,
    ctx,
    glassMat,
    (p) => {
      for (const s of [-1, 1]) {
        // Left & right ballistic windshield panes (world -Z)
        p.push(_part(ctx.getBox(0.92, 0.52, 0.08), s * 0.56, 1.9, 0.98, -0.26, 0, 0));
        // Front & rear recessed ballistic door windows
        p.push(_part(ctx.getBox(0.06, 0.28, 0.54), s * 1.18, 2.02, 0.42));
        p.push(_part(ctx.getBox(0.06, 0.28, 0.52), s * 1.18, 2.02, -0.56));
      }
      if (!isUS) {
        p.push(_part(ctx.getBox(0.42, 0.26, 0.06), -0.46, 2.0, -2.3));
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:headlights`,
    ctx,
    _headlightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getCyl(0.11, 0.11, 0.05, 10), s * 0.88, 1.26, 2.36, Math.PI / 2, 0, 0));
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `humvee:${sideTag}:taillights`,
    ctx,
    _taillightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.18, 0.1, 0.05), s * 0.98, 1.32, -2.33));
      }
    },
    false,
    false
  );

  // ==========================================================================
  // 2. ROOF GUNNER TURRET (turretPivot at y = 2.48, z = +0.2 over crew cabin)
  // STRICT INVARIANT: All turret vertices kept <= 0.30 local Y (<= 2.78 world Y
  // < 2.80 limit) so 1P (2.96) & Optic (2.88) cameras are 100% unobstructed!
  // ==========================================================================
  turretPivot.position.set(0, 2.48, 0.2);

  if (isUS) {
    // Octagonal OGPK ballistic gunner shield (top at local y = 0.28 -> world 2.76 <= 2.80!)
    _addMerged(
      turretPivot,
      'humvee:us:ogpkHull',
      ctx,
      hullMat,
      (p) => {
        p.push(_part(ctx.getCyl(0.56, 0.58, 0.07, 12), 0, -0.03, 0));
        const r = 0.52;
        const angles = [
          -Math.PI * 0.24,
          Math.PI * 0.24,
          -Math.PI * 0.5,
          Math.PI * 0.5,
          -Math.PI * 0.76,
          Math.PI * 0.76,
          Math.PI
        ];
        for (const ang of angles) {
          const h = Math.abs(ang) > 2.2 ? 0.22 : 0.28;
          const cy = Math.abs(ang) > 2.2 ? 0.11 : 0.14;
          p.push(_part(ctx.getBox(0.38, h, 0.055), Math.sin(ang) * r, cy, Math.cos(ang) * r, 0, ang, 0));
        }
        // Lower front gun-port apron plate (top y = 0.12)
        p.push(_part(ctx.getBox(0.36, 0.12, 0.055), 0, 0.06, r));
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'humvee:us:ogpkGlass',
      ctx,
      glassMat,
      (p) => {
        const r = 0.525;
        for (const ang of [-Math.PI * 0.24, Math.PI * 0.24, -Math.PI * 0.5, Math.PI * 0.5]) {
          p.push(_part(ctx.getBox(0.2, 0.08, 0.065), Math.sin(ang) * r, 0.2, Math.cos(ang) * r, 0, ang, 0));
        }
      },
      false,
      false
    );
  } else {
    // Arbalet-DM stabilized remote weapon station pod (top at local y = 0.26 -> world 2.74 <= 2.80!)
    _addMerged(
      turretPivot,
      'humvee:ru:rwsEra',
      ctx,
      eraMat,
      (p) => {
        p.push(_part(ctx.getCyl(0.46, 0.5, 0.08, 12), 0, -0.02, 0));
        p.push(_part(ctx.getBox(0.28, 0.22, 0.34), -0.14, 0.12, -0.02));
        // Electro-optical thermal target acquisition box (top y = 0.25)
        p.push(_part(ctx.getBox(0.24, 0.18, 0.32), -0.34, 0.15, 0.08));
      },
      true,
      false
    );
    _addMerged(
      turretPivot,
      'humvee:ru:rwsOptic',
      ctx,
      _opticLensMat,
      (p) => {
        p.push(_part(ctx.getBox(0.14, 0.1, 0.04), -0.34, 0.15, 0.25));
      },
      false,
      false
    );
  }

  // Olive .50 cal / 12.7mm ammunition box on turret cradle (top y = 0.23 <= 0.32)
  _addMerged(
    turretPivot,
    `humvee:${sideTag}:ammoBox`,
    ctx,
    _oliveGearMat,
    (p) => {
      p.push(_part(ctx.getBox(0.18, 0.16, 0.32), isUS ? -0.26 : 0.26, 0.14, 0.08));
    },
    false,
    false
  );

  // Recoiling/Pitching .50 cal M2HB / 12.7mm Kord Barrel Group (+Z, top y = 0.24 <= 0.32)
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.12, 0.14);

  _addMerged(
    barrelGroup,
    `humvee:${sideTag}:bgDark`,
    ctx,
    darkMat,
    (p) => {
      // Heavy HMG receiver, top feed cover, rear spade grips & perforated cooling jacket
      p.push(_part(ctx.getBox(0.16, 0.17, 0.58), 0, 0.02, -0.02));
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getCyl(0.018, 0.018, 0.14, 6), s * 0.075, 0.01, -0.36));
      }
      p.push(_part(ctx.getCyl(0.052, 0.056, 0.38, 8), 0, 0.03, 0.46, Math.PI / 2, 0, 0));
      // Slotted .50 cal / Kord muzzle brake at +Z tip
      p.push(_part(ctx.getBox(0.085, 0.065, 0.14), 0, 0.03, 1.44));
    },
    true,
    false
  );

  _addMerged(
    barrelGroup,
    `humvee:${sideTag}:bgBarrel`,
    ctx,
    barrelMat,
    (p) => {
      p.push(_part(ctx.getCyl(0.032, 0.04, 1.05, 8), 0, 0.03, 0.9, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  turretPivot.add(barrelGroup);
  if (!turretPivot.parent) group.add(turretPivot);
  return { barrelGroup };
}

// ============================================================================
// SHARED 8x8 AMPHIBIOUS V-HULL BUILDER (used by APC & US LAV-AD SPAAG)
// 8 treaded tires at wz = [-2.15, -0.72, 0.72, 2.15], wx = ±1.48, y = 0.58
// ============================================================================
function _buildWheeled8x8Chassis(ctx, variantKey, isUS) {
  const { group, wheels, hullMat, eraMat, darkMat, barrelMat, glassMat } = ctx;

  // 1. 8 Deep-Lug Treaded Off-Road Tires + Armored CTIS Hubs
  const tireGeo = ctx.getTreadTire(0.58, 0.44, 14, 12, 0.45, 0.05, 0.085, 0.57);
  const hubGeo = _getCtisWheelHubGeo(ctx, 0.34, 0.45, 'apc8x8');
  for (const wz of [-2.15, -0.72, 0.72, 2.15]) {
    for (const wx of [-1.48, 1.48]) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(wx, 0.58, wz);

      const tire = new THREE.Mesh(tireGeo, darkMat);
      tire.castShadow = true;
      wheelPivot.add(tire);

      const hub = new THREE.Mesh(hubGeo, eraMat);
      wheelPivot.add(hub);

      group.add(wheelPivot);
      wheels.push(wheelPivot);
    }
  }

  const hullRoot = _createForwardHullRoot(group);

  // 2. Boat-Shaped Amphibious V-Hull, Sloped Upper/Lower Glacis (world -Z) & Wheel-Arch Mudguards (hullMat)
  _addMerged(
    hullRoot,
    `${variantKey}:hullMain`,
    ctx,
    hullMat,
    (p) => {
      // Lower boat-shaped amphibious V-belly + upper flared armored hull
      p.push(_part(ctx.getBox(2.18, 0.52, 5.75), 0, 0.78, -0.05));
      p.push(_part(ctx.getBox(2.74, 0.68, 5.95), 0, 1.38, -0.08));
      // Angled upper chine shoulders
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.32, 0.42, 5.88), s * 1.24, 1.72, -0.08, 0, 0, s * 0.36));
        // Wheel-arch mudguard lips over front & rear tandem bogies
        p.push(_part(ctx.getBox(0.28, 0.1, 2.75), s * 1.44, 1.24, 1.44));
        p.push(_part(ctx.getBox(0.28, 0.1, 2.75), s * 1.44, 1.24, -1.44));
      }
      // Steeply sloped upper & lower amphibious bow glacis meeting at sharp +Z prow
      p.push(_part(ctx.getBox(2.64, 0.32, 1.38), 0, 1.52, 2.66, 0.42, 0, 0));
      p.push(_part(ctx.getBox(2.42, 0.34, 1.26), 0, 0.96, 2.72, -0.46, 0, 0));
      p.push(_part(ctx.getBox(2.58, 0.24, 0.32), 0, 1.24, 3.16));
      // Hull roof deck (top y = 1.92) + driver armored cupola hood (+Z)
      p.push(_part(ctx.getBox(2.24, 0.12, 5.45), 0, 1.88, -0.22));
      p.push(_part(ctx.getBox(0.68, 0.16, 0.62), -0.56, 1.96, 1.88));
      if (!isUS) {
        // BTR-82A right-front commander hatch hood & sloped rear transom
        p.push(_part(ctx.getBox(0.68, 0.16, 0.62), 0.56, 1.96, 1.88));
        p.push(_part(ctx.getBox(2.58, 0.78, 0.44), 0, 1.34, -3.02, -0.24, 0, 0));
      } else {
        // US LAV rear vertical ramp bulkhead (-Z)
        p.push(_part(ctx.getBox(2.62, 0.86, 0.26), 0, 1.38, -3.04, -0.08, 0, 0));
      }
    },
    true,
    true
  );

  // 3. Foldable Bow Wave-Breaker Trim Vane (world -Z), Applique Armor & Troop Doors/Cowling (eraMat)
  _addMerged(
    hullRoot,
    `${variantKey}:hullEra`,
    ctx,
    eraMat,
    (p) => {
      // Foldable bow wave-breaker trim vane across +Z nose
      p.push(_part(ctx.getBox(2.38, 0.34, 0.07), 0, 1.36, 3.3, 0.36, 0, 0));
      if (isUS) {
        // LAV-25A2 / Stryker bolt-on ceramic applique side armor panels + rear twin troop ramp/doors (-Z)
        for (const s of [-1, 1]) {
          for (const pz of [-2.1, -0.7, 0.7, 1.95]) {
            p.push(_part(ctx.getBox(0.08, 0.48, 1.18), s * 1.4, 1.48, pz));
          }
          // Twin rear troop doors with exterior hinges & central locking bar (-Z)
          p.push(_part(ctx.getBox(0.92, 0.74, 0.1), s * 0.52, 1.38, -3.16, -0.08, 0, 0));
        }
        // Roof troop hatches behind turret (-Z)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.68, 0.06, 0.88), s * 0.44, 1.95, -1.85));
        }
      } else {
        // BTR-82A side clam-shell troop hatches between axles 2 & 3 + rear waterjet cowling (-Z)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.11, 0.38, 0.76), s * 1.36, 1.62, 0.0, 0, 0, s * 0.22));
          p.push(_part(ctx.getBox(0.11, 0.42, 0.76), s * 1.39, 1.2, 0.0));
          // Side infantry firing port blocks
          for (const fz of [1.18, -1.18, -2.05]) {
            p.push(_part(ctx.getBox(0.09, 0.16, 0.22), s * 1.34, 1.64, fz, 0, 0, s * 0.28));
          }
        }
        // Central rear hydrojet water-propulsion shutter cowling (-Z)
        p.push(_part(ctx.getBox(0.76, 0.48, 0.28), 0, 1.06, -3.22));
      }
    },
    true,
    false
  );

  // 4. Axles, Exhaust Muffler Pipe, Engine Louvers & Tow Shackles (darkMat -> FLIR white-hot!)
  _addMerged(
    hullRoot,
    `${variantKey}:hullDark`,
    ctx,
    darkMat,
    (p) => {
      // 4 heavy drive axles & central transfer drivetrain
      for (const wz of [-2.15, -0.72, 0.72, 2.15]) {
        p.push(_part(ctx.getCyl(0.09, 0.09, 2.55, 8, Math.PI / 2), 0, 0.58, wz));
      }
      // Trim-vane hydraulic struts & front/rear forged tow shackles
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.06, 0.06, 0.24), s * 0.82, 1.32, 3.22));
        p.push(_part(ctx.getBox(0.09, 0.12, 0.18), s * 0.96, 1.08, 3.24));
        p.push(_part(ctx.getBox(0.24, 0.18, 0.18), s * 1.08, 1.54, 3.04));
      }
      if (isUS) {
        // Right-front engine intake grille & hot side exhaust muffler pipe + perforated shroud
        p.push(_part(ctx.getBox(0.78, 0.06, 1.12), 0.52, 1.82, 1.82, 0.18, 0, 0));
        p.push(_part(ctx.getCyl(0.11, 0.11, 1.35, 10), 1.32, 1.78, 0.75, Math.PI / 2, 0, 0));
        p.push(_part(ctx.getBox(0.24, 0.2, 1.42), 1.3, 1.78, 0.75));
        // Twin rear amphibious propeller shrouds under stern (-Z)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.18, 0.18, 0.24, 10), s * 0.76, 0.78, -3.05, Math.PI / 2, 0, 0));
        }
      } else {
        // BTR-82A rear engine deck radiator louvers & twin angled exhaust mufflers (-Z)
        p.push(_part(ctx.getBox(1.58, 0.06, 1.15), 0, 1.94, -2.25));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.095, 0.095, 0.92, 8), s * 1.06, 1.76, -2.68, Math.PI / 2 - 0.18, s * -0.14, 0));
        }
        p.push(_part(ctx.getBox(0.58, 0.34, 0.08), 0, 1.06, -3.35));
      }
    },
    true,
    false
  );

  // 5. Pioneer Tools / Whip Antennas / Stowage & Vision Periscopes + Lights
  _addMerged(
    hullRoot,
    `${variantKey}:hullSteel`,
    ctx,
    barrelMat,
    (p) => {
      p.push(_part(ctx.getCyl(0.028, 0.028, 2.8, 6), -1.36, 1.74, -0.5, Math.PI / 2, 0, 0));
      if (variantKey.startsWith('spaag:')) {
        // LAV-AD twin tall rear communication whip antennas (world +Z)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.016, 0.026, 1.55, 6), s * 1.22, 2.62, -2.88, -0.12, 0, 0));
        }
      } else {
        p.push(_part(ctx.getCyl(0.016, 0.024, 1.35, 6), -1.2, 2.52, -2.85, -0.12, 0, 0));
      }
    },
    false,
    false
  );

  if (isUS) {
    _addMerged(
      hullRoot,
      `${variantKey}:hullGear`,
      ctx,
      _oliveGearMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.32, 0.42, 0.18), s * 1.08, 1.56, -3.18));
        }
      },
      false,
      false
    );
  }

  _addMerged(
    hullRoot,
    `${variantKey}:hullGlass`,
    ctx,
    glassMat,
    (p) => {
      for (const px of [-0.18, 0, 0.18]) {
        p.push(_part(ctx.getBox(0.13, 0.07, 0.07), -0.56 + px, 2.0, 2.18, 0, px * -0.3, 0));
        if (!isUS) {
          p.push(_part(ctx.getBox(0.13, 0.07, 0.07), 0.56 + px, 2.0, 2.18, 0, px * -0.3, 0));
        }
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `${variantKey}:headlights`,
    ctx,
    _headlightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.16, 0.1, 0.05), s * 1.08, 1.54, 3.14));
      }
    },
    false,
    false
  );
  _addMerged(
    hullRoot,
    `${variantKey}:taillights`,
    ctx,
    _taillightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.18, 0.09, 0.05), s * 1.12, 1.58, -3.18));
      }
    },
    false,
    false
  );
}

// ============================================================================
// 3. 8x8 WHEELED IFV / APC — US LAV-25A2 / STRYKER vs RU BTR-82A
// Footprint: ~3.0m W x 6.5m L | turretPivot at (0, 2.15, 0.2)
// ============================================================================
export function buildApcModel(ctx) {
  const { isUS, group, turretPivot, hullMat, eraMat, darkMat, barrelMat } = ctx;
  const sideTag = isUS ? 'us' : 'ru';

  _buildWheeled8x8Chassis(ctx, `apc:${sideTag}`, isUS);

  // Rotating Turret (1P camera at world 2.75 = local 0.60; Optic at 2.68 = local 0.53)
  turretPivot.position.set(0, 2.15, 0.2);

  if (isUS) {
    // ── US LAV-25A2 SLOPED TWO-MAN TURRET + 25MM M242 BUSHMASTER ──
    _addMerged(
      turretPivot,
      'apc:us:turretHull',
      ctx,
      hullMat,
      (p) => {
        p.push(_part(ctx.getBox(1.56, 0.52, 1.78), 0, 0.04, -0.06));
        p.push(_part(ctx.getBox(1.38, 0.44, 0.62), 0, 0.02, 0.92, 0.28, 0, 0));
        // Commander & gunner roof hatches (top local y = 0.36 -> world 2.51 < 2.68)
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.28, 0.31, 0.1, 8), s * 0.4, 0.33, -0.22));
        }
        // Right-front ITSS thermal sight armored doghouse (offset x = +0.44, top y = 0.44)
        p.push(_part(ctx.getBox(0.26, 0.2, 0.34), 0.44, 0.34, 0.46));
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'apc:us:turretEra',
      ctx,
      eraMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.1, 0.44, 1.48), s * 0.82, 0.04, -0.04, 0, 0, s * -0.18));
        }
        p.push(_part(ctx.getBox(1.24, 0.38, 0.48), 0, 0.06, -1.14));
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'apc:us:turretSteel',
      ctx,
      barrelMat,
      (p) => {
        // 2x4 M257 smoke grenade launchers on forward turret cheeks + rear stowage basket rails
        const smokeTube = ctx.getCyl(0.036, 0.036, 0.24, 8);
        for (const s of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            p.push(
              _part(
                smokeTube,
                s * (0.86 + i * 0.025),
                0.08 + (i % 2) * 0.07,
                0.56 - i * 0.09,
                Math.PI / 2 - 0.36,
                s * (0.2 + i * 0.08),
                0
              )
            );
          }
        }
        p.push(_part(ctx.getBox(1.32, 0.04, 0.38), 0, -0.08, -1.52));
        p.push(_part(ctx.getBox(1.32, 0.04, 0.04), 0, 0.2, -1.7));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'apc:us:turretOptic',
      ctx,
      _opticLensMat,
      (p) => {
        p.push(_part(ctx.getBox(0.15, 0.11, 0.04), 0.44, 0.35, 0.64));
      },
      false,
      false
    );
  } else {
    // ── RU BTR-82A COMPACT CONICAL BPPU TURRET + TKN-4GA SIGHT + 6 TUCHA TUBES ──
    _addMerged(
      turretPivot,
      'apc:ru:turretHull',
      ctx,
      hullMat,
      (p) => {
        p.push(_part(ctx.getCyl(0.58, 0.78, 0.44, 12), 0, 0.0, 0));
        // Overhead BPPU weapon cradle trunnion towers
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.18, 0.34, 0.56), s * 0.3, 0.24, 0.06));
        }
        // High-mounted TKN-4GA day/night sight pod (offset x = -0.48, top y = 0.45 < 0.53)
        p.push(_part(ctx.getBox(0.26, 0.26, 0.36), -0.48, 0.32, 0.22));
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'apc:ru:turretEra',
      ctx,
      eraMat,
      (p) => {
        // Dual external 30mm HE / AP ammunition feed chutes into overhead breech
        p.push(_part(ctx.getBox(0.22, 0.28, 0.48), 0.44, 0.22, -0.08));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'apc:ru:turretSteel',
      ctx,
      barrelMat,
      (p) => {
        // 6x 81mm 902V Tucha smoke grenade tubes (3 per side)
        const smokeTube = ctx.getCyl(0.038, 0.038, 0.26, 8);
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            p.push(
              _part(
                smokeTube,
                s * 0.68,
                0.04 + (i === 1 ? 0.06 : 0),
                0.34 - i * 0.13,
                Math.PI / 2 - 0.35,
                s * (0.18 + i * 0.1),
                0
              )
            );
          }
        }
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'apc:ru:turretOptic',
      ctx,
      _opticLensMat,
      (p) => {
        p.push(_part(ctx.getBox(0.16, 0.14, 0.04), -0.48, 0.34, 0.41));
      },
      false,
      false
    );
  }

  // Stabilized 25mm M242 Bushmaster (US) / 30mm 2A72 (RU) Autocannon + Frame Brace + Coax (+Z)
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, isUS ? 0.05 : 0.22, isUS ? 0.96 : 0.28);

  _addMerged(
    barrelGroup,
    `apc:${sideTag}:bgDark`,
    ctx,
    darkMat,
    (p) => {
      // Mantlet / overhead cradle + structural tubular barrel-frame brace + slotted muzzle brake
      p.push(_part(ctx.getBox(0.42, 0.28, 0.44), 0, 0, 0.08));
      // Rectangular frame brace / recoil truss around base of autocannon
      for (const s of [-1, 1]) {
        p.push(_part(ctx.getBox(0.035, 0.04, 0.92), s * 0.11, 0.06, 0.62));
      }
      p.push(_part(ctx.getBox(0.26, 0.14, 0.06), 0, 0.02, 1.06));
      // Muzzle brake (+Z) & coaxial 7.62mm MG
      const muzZ = isUS ? 2.28 : 2.56;
      p.push(_part(ctx.getCyl(0.085, 0.095, 0.22, 8), 0, 0, muzZ, Math.PI / 2, 0, 0));
      p.push(_part(ctx.getCyl(0.026, 0.03, 0.95, 8), isUS ? -0.22 : 0.22, 0.01, 0.62, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  _addMerged(
    barrelGroup,
    `apc:${sideTag}:bgBarrel`,
    ctx,
    barrelMat,
    (p) => {
      // Fluted 25mm / 30mm autocannon barrel + cooling collar rings (+Z)
      const len = isUS ? 2.02 : 2.28;
      p.push(_part(ctx.getCyl(0.055, 0.072, len, 10), 0, 0, 0.2 + len * 0.5, Math.PI / 2, 0, 0));
      p.push(_part(ctx.getCyl(0.085, 0.09, 0.48, 8), 0, 0, 0.52, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  turretPivot.add(barrelGroup);
  if (!turretPivot.parent) group.add(turretPivot);
  return { barrelGroup };
}

// ============================================================================
// 4. MOBILE SHORAD / SPAAG — US LAV-AD 8x8 vs RU 2K22M1 TUNGUSKA TRACKED SPAAG
// Footprint: ~3.0m W x 6.5m L | turretPivot at (0, 2.22, -0.25)
// ============================================================================
export function buildSpaagModel(ctx) {
  const { isUS, group, wheels, turretPivot, hullMat, eraMat, darkMat, barrelMat, glassMat } = ctx;

  turretPivot.position.set(0, 2.22, 0.25);
  const barrelGroup = new THREE.Group();

  if (isUS) {
    // ── US LAV-AD 8x8 WHEELED CHASSIS + BLAZER AIR-DEFENSE TURRET ──
    _buildWheeled8x8Chassis(ctx, 'spaag:us', true);

    _addMerged(
      turretPivot,
      'spaag:us:turretHull',
      ctx,
      hullMat,
      (p) => {
        // Faceted GD Blazer air-defense turret (top local y = 0.30 -> world 2.52 < 2.68)
        p.push(_part(ctx.getBox(1.74, 0.56, 1.98), 0, 0.02, -0.05));
        p.push(_part(ctx.getBox(1.52, 0.46, 0.58), 0, 0.0, 1.02, 0.28, 0, 0));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getCyl(0.27, 0.3, 0.09, 8), s * 0.44, 0.32, -0.28));
        }
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'spaag:us:turretEra',
      ctx,
      eraMat,
      (p) => {
        // FLIR/TV electro-optical tracking gimbal sphere (offset x = -0.48 so center sightline is clear!)
        p.push(_part(_getSphereGeo(0.24, 10, 8), -0.48, 0.44, 0.36));
        p.push(_part(ctx.getCyl(0.16, 0.2, 0.16, 8), -0.48, 0.31, 0.36));
        p.push(_part(ctx.getBox(1.48, 0.42, 0.44), 0, 0.04, -1.18));
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'spaag:us:turretOptic',
      ctx,
      _opticLensMat,
      (p) => {
        p.push(_part(ctx.getCyl(0.11, 0.11, 0.06, 10), -0.48, 0.44, 0.57, Math.PI / 2, 0, 0));
      },
      false,
      false
    );

    // barrelGroup: 5-barrel 25mm GAU-12 Gatling shroud (+Z) + Left/Right 4-tube FIM-92 Stinger pods
    barrelGroup.position.set(0, 0.08, 0.28);

    _addMerged(
      barrelGroup,
      'spaag:us:bgDark',
      ctx,
      darkMat,
      (p) => {
        // Center GAU-12 rotary housing, mid-clamp & muzzle clamp (+Z)
        p.push(_part(ctx.getBox(0.42, 0.36, 0.62), 0, 0, 0.18));
        p.push(_part(ctx.getCyl(0.135, 0.135, 0.12, 10), 0, 0, 1.35, Math.PI / 2, 0, 0));
        p.push(_part(ctx.getCyl(0.14, 0.14, 0.18, 10), 0, 0, 2.22, Math.PI / 2, 0, 0));
        // Left & right Stinger elevation pylon arms
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.32, 0.18, 0.34), s * 0.96, 0.08, -0.18));
        }
      },
      true,
      false
    );

    _addMerged(
      barrelGroup,
      'spaag:us:bgBarrel',
      ctx,
      barrelMat,
      (p) => {
        // 5 clustered 25mm GAU-12 Equalizer rotary barrels (+Z)
        for (let b = 0; b < 5; b++) {
          const ang = (b / 5) * Math.PI * 2;
          p.push(
            _part(
              ctx.getCyl(0.026, 0.028, 1.85, 6),
              Math.cos(ang) * 0.082,
              Math.sin(ang) * 0.082,
              1.32,
              Math.PI / 2,
              0,
              0
            )
          );
        }
        // 4 individual FIM-92 Stinger launch tubes protruding from each side pod (8 total)
        const stingerTube = ctx.getCyl(0.055, 0.055, 1.56, 8);
        for (const s of [-1, 1]) {
          for (const ox of [-0.09, 0.09]) {
            for (const oy of [-0.09, 0.09]) {
              p.push(_part(stingerTube, s * 1.18 + ox, 0.12 + oy, -0.04, Math.PI / 2, 0, 0));
            }
          }
        }
      },
      true,
      false
    );

    _addMerged(
      barrelGroup,
      'spaag:us:bgPods',
      ctx,
      _oliveGearMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.42, 0.42, 1.42), s * 1.18, 0.12, -0.06));
        }
      },
      true,
      false
    );

    // Stinger IR seeker nose caps (+Z)
    _addMerged(
      barrelGroup,
      'spaag:us:stingerSeekers',
      ctx,
      _opticLensMat,
      (p) => {
        const cap = _getSphereGeo(0.048, 8, 6);
        for (const s of [-1, 1]) {
          for (const ox of [-0.09, 0.09]) {
            for (const oy of [-0.09, 0.09]) {
              p.push(_part(cap, s * 1.18 + ox, 0.12 + oy, 0.74));
            }
          }
        }
      },
      false,
      false
    );
  } else {
    // ── RU 2K22M1 TUNGUSKA TRACKED GM-352M HULL + DUAL RADAR + TWIN 30MM + 8x 9M311 SAM ──
    const roadWheelGeo = _getTankRoadwheelGeo(ctx, 0.39, 0.48, 0.14);
    for (const wz of [-2.3, -1.38, -0.46, 0.46, 1.38, 2.3]) {
      for (const wx of [-1.34, 1.34]) {
        const w = new THREE.Mesh(roadWheelGeo, barrelMat);
        w.position.set(wx, 0.41, wz);
        w.castShadow = true;
        group.add(w);
        wheels.push(w);
      }
    }

    const hullRoot = _createForwardHullRoot(group);

    // Tracked GM-352M caterpillar tracks, sprockets, idlers & hot engine louvers (darkMat -> FLIR white-hot!)
    _addMerged(
      hullRoot,
      'spaag:ru:hullDark',
      ctx,
      darkMat,
      (p) => {
        for (const s of [-1, 1]) {
          _appendTrackRunDetails(p, ctx, s, 1.34, 3.05, 0.58, 0.92, 0.06);
          p.push(_part(ctx.getBox(0.09, 0.12, 0.18), s * 0.88, 0.94, 3.16));
          p.push(_part(ctx.getBox(0.22, 0.18, 0.18), s * 1.06, 1.38, 2.98));
        }
        // Forward gas-turbine APU vent & rear diesel radiator louvers
        p.push(_part(ctx.getBox(0.68, 0.06, 0.62), 0.66, 1.72, 1.65));
        p.push(_part(ctx.getBox(1.86, 0.06, 1.25), 0, 1.72, -2.25));
      },
      true,
      true
    );

    _addMerged(
      hullRoot,
      'spaag:ru:hullMain',
      ctx,
      hullMat,
      (p) => {
        p.push(_part(ctx.getBox(2.08, 0.66, 5.75), 0, 0.78, -0.04));
        p.push(_part(ctx.getBox(2.78, 0.64, 5.95), 0, 1.36, -0.06));
        p.push(_part(ctx.getBox(2.72, 0.28, 1.48), 0, 1.44, 2.52, 0.36, 0, 0));
        p.push(_part(ctx.getBox(2.64, 0.42, 0.82), 0, 0.84, 2.86, -0.48, 0, 0));
        p.push(_part(ctx.getBox(0.68, 0.16, 0.58), -0.52, 1.74, 1.88));
        p.push(_part(ctx.getBox(2.72, 0.68, 0.24), 0, 1.34, -3.04));
      },
      true,
      true
    );

    _addMerged(
      hullRoot,
      'spaag:ru:hullEra',
      ctx,
      eraMat,
      (p) => {
        // Stepped armored side skirts + front glacis splash board + rear stowage boxes
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.1, 0.48, 5.92), s * 1.64, 1.04, 0.0));
          p.push(_part(ctx.getBox(0.46, 0.36, 0.28), s * 0.88, 1.46, -3.14));
        }
        p.push(_part(ctx.getBox(2.34, 0.14, 0.08), 0, 1.54, 2.48, -0.32, 0, 0));
      },
      true,
      false
    );

    _addMerged(
      hullRoot,
      'spaag:ru:hullGlass',
      ctx,
      glassMat,
      (p) => {
        for (const px of [-0.16, 0, 0.16]) {
          p.push(_part(ctx.getBox(0.12, 0.07, 0.06), -0.52 + px, 1.78, 2.16));
        }
      },
      false,
      false
    );
    _addMerged(
      hullRoot,
      'spaag:ru:headlights',
      ctx,
      _headlightMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.15, 0.09, 0.05), s * 1.06, 1.38, 3.08));
        }
      },
      false,
      false
    );
    _addMerged(
      hullRoot,
      'spaag:ru:taillights',
      ctx,
      _taillightMat,
      (p) => {
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.16, 0.08, 0.05), s * 1.16, 1.42, -3.16));
        }
      },
      false,
      false
    );

    // Wide Welded Tunguska-M1 Turret + Rear Search Radar + Front Tracking Radar + Optical Sight Cupola
    _addMerged(
      turretPivot,
      'spaag:ru:turretHull',
      ctx,
      hullMat,
      (p) => {
        // Wide angular welded Tunguska turret (top local y = 0.33 -> world 2.55 < 2.68)
        p.push(_part(ctx.getBox(1.88, 0.64, 2.28), 0, 0.01, -0.06));
        p.push(_part(ctx.getBox(1.62, 0.52, 0.56), 0, -0.02, 1.12, 0.24, 0, 0));
        // Optical 1A29M stabilized sight cupola (offset x = +0.54, top y = 0.48)
        p.push(_part(ctx.getCyl(0.24, 0.28, 0.26, 10), 0.54, 0.38, 0.18));
        // Rear mast-mounted curved 1RL144M search radar dish (at z = -1.24, strictly behind 1P camera!)
        p.push(_part(ctx.getBox(0.86, 0.44, 0.1), 0, 0.86, -1.26));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.46, 0.42, 0.09), s * 0.62, 0.86, -1.16, 0, s * -0.38, 0));
        }
      },
      true,
      true
    );

    _addMerged(
      turretPivot,
      'spaag:ru:turretEra',
      ctx,
      eraMat,
      (p) => {
        // Front circular 1RL144 J-band tracking radar dish (+Z nose, top local y = 0.37 -> world 2.59 < 2.68!)
        p.push(_part(ctx.getCyl(0.35, 0.38, 0.14, 14), 0, 0.02, 1.36, Math.PI / 2, 0, 0));
        for (const s of [-1, 1]) {
          p.push(_part(ctx.getBox(0.14, 0.46, 1.65), s * 0.98, 0.0, -0.18));
        }
      },
      true,
      false
    );

    _addMerged(
      turretPivot,
      'spaag:ru:turretDark',
      ctx,
      darkMat,
      (p) => {
        // Search radar hydraulic mast (-Z) + front tracking radar feed-horn spike (+Z) + shell ejection chutes
        p.push(_part(ctx.getBox(0.26, 0.58, 0.28), 0, 0.54, -1.24));
        p.push(_part(ctx.getBox(0.08, 0.08, 0.34), 0, 0.86, -1.04));
        p.push(_part(ctx.getCyl(0.045, 0.075, 0.24, 8), 0, 0.02, 1.48, Math.PI / 2, 0, 0));
      },
      false,
      false
    );

    _addMerged(
      turretPivot,
      'spaag:ru:turretOptic',
      ctx,
      _opticLensMat,
      (p) => {
        p.push(_part(ctx.getBox(0.22, 0.14, 0.05), 0.54, 0.4, 0.42));
      },
      false,
      false
    );

    // barrelGroup: Left & Right Twin 30mm 2A38M Water-Cooled Autocannons (+Z) + 8x 9M311 SAM Canisters (4 per side)
    barrelGroup.position.set(0, 0.06, 0.22);

    _addMerged(
      barrelGroup,
      'spaag:ru:bgDark',
      ctx,
      darkMat,
      (p) => {
        for (const s of [-1, 1]) {
          // Perforated water-cooling jacket, mid-barrel muzzle brace & flash suppressors (+Z)
          p.push(_part(ctx.getBox(0.18, 0.32, 0.92), s * 1.02, 0.02, 0.58));
          p.push(_part(ctx.getBox(0.12, 0.24, 0.08), s * 1.02, 0.02, 1.72));
          for (const oy of [-0.07, 0.07]) {
            p.push(_part(ctx.getCyl(0.048, 0.056, 0.2, 8), s * 1.02, 0.02 + oy, 2.54, Math.PI / 2, 0, 0));
          }
          // SAM canister rack clamps (holding 2x2 = 4 canisters per side)
          for (const cz of [-0.52, 0.38]) {
            p.push(_part(ctx.getBox(0.5, 0.48, 0.08), s * 1.38, 0.08, cz));
          }
        }
      },
      true,
      false
    );

    _addMerged(
      barrelGroup,
      'spaag:ru:bgBarrel',
      ctx,
      barrelMat,
      (p) => {
        // Twin 30mm 2A38M dual-barrel autocannons on BOTH left & right sides (4 barrels total!)
        const tube = ctx.getCyl(0.036, 0.044, 2.28, 8);
        for (const s of [-1, 1]) {
          for (const oy of [-0.07, 0.07]) {
            p.push(_part(tube, s * 1.02, 0.02 + oy, 1.34, Math.PI / 2, 0, 0));
          }
        }
      },
      true,
      false
    );

    // 8 cylindrical 9M311-M1 SAM launch canisters (4 per side in 2x2 banks!)
    _addMerged(
      barrelGroup,
      'spaag:ru:samCanisters',
      ctx,
      _oliveGearMat,
      (p) => {
        const canister = ctx.getCyl(0.1, 0.1, 1.74, 10);
        for (const s of [-1, 1]) {
          for (const ox of [-0.12, 0.12]) {
            for (const oy of [-0.12, 0.12]) {
              p.push(_part(canister, s * 1.38 + ox, 0.08 + oy, -0.06, Math.PI / 2, 0, 0));
            }
          }
        }
      },
      true,
      false
    );

    // Sealed frangible nose & tail caps on all 8 9M311 SAM canisters
    _addMerged(
      barrelGroup,
      'spaag:ru:samCaps',
      ctx,
      eraMat,
      (p) => {
        const cap = ctx.getCyl(0.106, 0.106, 0.08, 10);
        for (const s of [-1, 1]) {
          for (const ox of [-0.12, 0.12]) {
            for (const oy of [-0.12, 0.12]) {
              p.push(_part(cap, s * 1.38 + ox, 0.08 + oy, 0.82, Math.PI / 2, 0, 0));
              p.push(_part(cap, s * 1.38 + ox, 0.08 + oy, -0.94, Math.PI / 2, 0, 0));
            }
          }
        }
      },
      false,
      false
    );
  }

  turretPivot.add(barrelGroup);
  if (!turretPivot.parent) group.add(turretPivot);
  return { barrelGroup };
}
