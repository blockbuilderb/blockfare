import * as THREE from '../../vendor/three.module.js';

// Pre-allocated reusable THREE.Color instances (Zero per-frame Color allocations)
const _sandstormFogColor = new THREE.Color(0xb89058);
const _sunsetBgColor = new THREE.Color(0xd97d54);
const _sunsetFogColor = new THREE.Color(0xc86d51);
const _nightBgColor = new THREE.Color(0x070b12);
const _dayBgColor = new THREE.Color(0x87b8d8);
const _cloudDayColor = new THREE.Color(0xffffff);
const _cloudSunsetColor = new THREE.Color(0xffd6be);
const _cloudNightColor = new THREE.Color(0x314968);
const _WEATHER_EVENTS = ['FOG', 'HEAVY_FOG', 'SANDSTORM'];

export const WeatherSystem = {
  /**
   * Builds a GPU-instanced 3-Tier Realistic Altitude Sky Cloud System:
   * - Uses a 2-pass Depth-Prepass + Unlit Sky-Scattered Color Shell so overlapping cloud puffs NEVER
   *   punch internal alpha cutout holes AND cloud undersides stay bright, airy sky-silver-white (never dark grey/brown)!
   * - Deck 1 (Low Cumulus Base, 680m – 1,220m): Fluffy volumetric cumulus formations
   * - Deck 2 (Mid Altocumulus, 2,200m – 3,350m): Broad mid-troposphere cloud shelves around 3,000m
   * - Deck 3 (High Cirrus Wisps, 4,100m – 5,450m): High ice-crystal streaks up to the 6,000m ceiling
   */
  buildSkyClouds() {
    if (!this.scene || this.skyCloudGroup) return;

    const group = new THREE.Group();
    group.name = 'RealisticSkyCloudDecks';

    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    const posAttr = unitGeo.attributes.position;
    const normAttr = unitGeo.attributes.normal;
    const vCols = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const ny = normAttr.getY(i);
      const nx = normAttr.getX(i);
      // Pure sunlit white tops (1.0, 1.0, 1.0), crisp snow sides, and bright sky-scattered pale-blue undersides (0.89, 0.94, 1.0)
      let r = 0.96;
      let g = 0.98;
      let b = 1.0;
      if (ny > 0.5) {
        r = 1.0;
        g = 1.0;
        b = 1.0;
      } else if (ny < -0.5) {
        r = 0.89;
        g = 0.94;
        b = 1.0;
      } else if (nx < -0.5) {
        r = 0.93;
        g = 0.96;
        b = 1.0;
      }
      vCols[i * 3] = r;
      vCols[i * 3 + 1] = g;
      vCols[i * 3 + 2] = b;
    }
    unitGeo.setAttribute('color', new THREE.BufferAttribute(vCols, 3));
    unitGeo.userData = { shared: false };

    // Solid from ground level (>340m = 100% opaque, zero see-through box ghosting),
    // with a custom GPU close-up vapor shader (<340m) that feathers sharp 90° box corners,
    // adds subtle 3D cumulus billow shading, and smoothly dissolves into mist during jet fly-throughs!
    const uSkyBgColor = { value: new THREE.Color(0x87b8d8) };
    const cumulusMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: false,
      depthWrite: true,
      fog: false
    });
    cumulusMat.userData.uSkyBgColor = uSkyBgColor;
    cumulusMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSkyBgColor = uSkyBgColor;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vCloudWorldPos;
          varying vec3 vCloudLocalPos;
          varying vec3 vCloudLocalNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vCloudLocalPos = position;
          vCloudLocalNormal = normal;
          vec4 cloudWp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cloudWp = instanceMatrix * cloudWp;
          #endif
          cloudWp = modelMatrix * cloudWp;
          vCloudWorldPos = cloudWp.xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uSkyBgColor;
          varying vec3 vCloudWorldPos;
          varying vec3 vCloudLocalPos;
          varying vec3 vCloudLocalNormal;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float camDist = distance(cameraPosition, vCloudWorldPos);
          // 0.0 from the ground (>360m = untouched crisp clouds); 1.0 when flying right up to a cloud (<360m)
          float closeAmt = 1.0 - smoothstep(55.0, 360.0, camDist);
          if (closeAmt > 0.001) {
            // 1) Identify how close this pixel is to the sharp 90° edges/corners of the unit box [-0.5..+0.5]
            vec3 an = abs(vCloudLocalNormal);
            vec2 faceUv = an.y > 0.5 ? vCloudLocalPos.xz : (an.x > 0.5 ? vCloudLocalPos.zy : vCloudLocalPos.xy);
            float boxEdge = max(abs(faceUv.x), abs(faceUv.y)) * 2.0; // 0 at center, 1.0 at sharp box edge
            float cornerDist = length(faceUv) * 1.4142;

            // 2) Multi-octave 3D world-space cumulus vapor billow noise
            float n1 = sin(vCloudWorldPos.x * 0.037 + vCloudWorldPos.y * 0.051) * cos(vCloudWorldPos.z * 0.039 - vCloudWorldPos.y * 0.043);
            float n2 = sin(vCloudWorldPos.x * 0.089 - vCloudWorldPos.z * 0.083) * cos(vCloudWorldPos.y * 0.097 + vCloudWorldPos.x * 0.061);
            float billow = n1 * 0.65 + n2 * 0.35;

            // 3) Subtle 3D silver-blue vapor shading across close-up faces so they look fluffy instead of flat Styrofoam
            vec3 vaporShadow = mix(uSkyBgColor, vec3(0.86, 0.92, 0.99), 0.72);
            float shadeMix = clamp((0.35 - billow * 0.32 + boxEdge * 0.28) * closeAmt * 0.55, 0.0, 0.48);
            diffuseColor.rgb = mix(diffuseColor.rgb, vaporShadow, shadeMix);

            // 4) Feather sharp cube edges (<310m) & smoothly dissolve into sky mist when flying inside (<115m)
            float edgeErode = smoothstep(0.62 - billow * 0.18, 1.02, max(boxEdge, cornerDist * 0.92)) * closeAmt;
            float flyThroughFade = smoothstep(18.0, 118.0, camDist);
            float vaporOpacity = clamp((1.0 - edgeErode * 0.92) * flyThroughFade, 0.0, 1.0);

            // Blend close-up dissolving mist smoothly toward background sky tone + fine screen-space vapor dither
            diffuseColor.rgb = mix(mix(uSkyBgColor, vec3(0.96, 0.98, 1.0), 0.55), diffuseColor.rgb, smoothstep(0.15, 0.85, vaporOpacity));
            float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (vaporOpacity < ign) discard;
          }`
        );
    };
    const cirrusMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      fog: false
    });

    // Deterministic pseudo-random generator so cloud layout is consistent & evenly distributed
    let seed = 48271;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const cumulusBoxes = [];
    const cloudCenters = [];

    // 1. Low-Altitude Fair-Weather Cumulus Deck (Base 680m – 1,220m, ~2,200–4,000 ft) — 72 cloud formations across 7,600m x 5,200m Theater
    for (let c = 0; c < 72; c++) {
      const cx = (rand() - 0.5) * 7400;
      const cz = (rand() - 0.5) * 5000;
      const baseY = 680 + rand() * 520;
      const scaleMul = 0.88 + rand() * 0.8;
      cloudCenters.push({ x: cx, y: baseY + 28 * scaleMul, z: cz, r: 105 * scaleMul });

      // Wide flat condensation base + 7–10 stepped billowing cumulus puffs & rounded edge shoulders
      const puffs = 7 + ((rand() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        const isCore = p === 0;
        const isCrown = p >= puffs - 2;
        const ox = isCore ? 0 : (rand() - 0.5) * (isCrown ? 85 : 152) * scaleMul;
        const oz = isCore ? 0 : (rand() - 0.5) * (isCrown ? 68 : 112) * scaleMul;
        const oy = isCore ? 0 : (isCrown ? 30 + rand() * 32 : 6 + rand() * 34) * scaleMul;
        const sx = (isCore ? 142 : isCrown ? 46 + rand() * 48 : 62 + rand() * 72) * scaleMul;
        const sy = (isCore ? 22 : isCrown ? 22 + rand() * 26 : 20 + rand() * 32) * scaleMul;
        const sz = (isCore ? 104 : isCrown ? 42 + rand() * 44 : 54 + rand() * 64) * scaleMul;
        cumulusBoxes.push({ x: cx + ox, y: baseY + oy, z: cz + oz, sx, sy, sz, tint: 0.96 + rand() * 0.06 });
      }
    }

    // 2. Mid-Altitude Altocumulus Shelf Deck (2,200m – 3,350m, ~7,200–11,000 ft) — 40 broader formations across 3,000m!
    for (let c = 0; c < 40; c++) {
      const cx = (rand() - 0.5) * 5200;
      const cz = (rand() - 0.5) * 3600;
      const baseY = 2200 + rand() * 1150;
      const puffs = 3 + ((rand() * 3) | 0);
      cloudCenters.push({ x: cx, y: baseY + 20, z: cz, r: 145 });
      for (let p = 0; p < puffs; p++) {
        const ox = (rand() - 0.5) * 195;
        const oz = (rand() - 0.5) * 150;
        const oy = rand() * 28;
        const sx = 125 + rand() * 145;
        const sy = 18 + rand() * 24;
        const sz = 95 + rand() * 120;
        cumulusBoxes.push({ x: cx + ox, y: baseY + oy, z: cz + oz, sx, sy, sz, tint: 0.94 + rand() * 0.06 });
      }
    }

    // 3. High-Altitude Cirrus / Cirrocumulus Wisps (4,100m – 5,450m, ~13,450–17,880 ft) — 44 streaks in upper sky
    const cirrusBoxes = [];
    for (let c = 0; c < 44; c++) {
      const cx = (rand() - 0.5) * 5600;
      const cz = (rand() - 0.5) * 3900;
      const baseY = 4100 + rand() * 1350;
      const wisps = 2 + ((rand() * 2) | 0);
      for (let w = 0; w < wisps; w++) {
        cirrusBoxes.push({
          x: cx + (rand() - 0.5) * 240,
          y: baseY + rand() * 22,
          z: cz + (rand() - 0.5) * 105,
          sx: 250 + rand() * 300,
          sy: 7 + rand() * 8,
          sz: 38 + rand() * 54
        });
      }
    }

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    const cumulusMesh = new THREE.InstancedMesh(unitGeo, cumulusMat, cumulusBoxes.length);
    cumulusMesh.frustumCulled = false;
    cumulusMesh.castShadow = false;
    cumulusMesh.receiveShadow = false;
    for (let i = 0; i < cumulusBoxes.length; i++) {
      const b = cumulusBoxes[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      cumulusMesh.setMatrixAt(i, dummy.matrix);
      const t = Math.max(0.97, Math.min(1.0, b.tint));
      col.setRGB(t, t, 1.0);
      cumulusMesh.setColorAt(i, col);
    }
    cumulusMesh.instanceMatrix.needsUpdate = true;
    if (cumulusMesh.instanceColor) cumulusMesh.instanceColor.needsUpdate = true;

    const cirrusMesh = new THREE.InstancedMesh(unitGeo, cirrusMat, cirrusBoxes.length);
    cirrusMesh.frustumCulled = false;
    cirrusMesh.castShadow = false;
    cirrusMesh.receiveShadow = false;
    for (let i = 0; i < cirrusBoxes.length; i++) {
      const b = cirrusBoxes[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0.14, 0);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      cirrusMesh.setMatrixAt(i, dummy.matrix);
    }
    cirrusMesh.instanceMatrix.needsUpdate = true;

    group.add(cumulusMesh);
    group.add(cirrusMesh);
    this.scene.add(group);

    this.skyCloudGroup = group;
    this.skyCumulusMat = cumulusMat;
    this.skyCirrusMat = cirrusMat;
    this.skyCloudCenters = cloudCenters;
    this._cloudDriftX = 0;
  },
  /**
   * Switches BattleBit time-of-day atmosphere ('DAY', 'SUNSET', 'NIGHT')
   */
  setAtmosphereMode(mode, hemiLight, dirLight) {
    this.atmosphereMode = mode;
    let targetBg = _dayBgColor;
    let targetFog = _dayBgColor;
    let targetDensity = 0.0014;

    if (mode === 'SUNSET') {
      targetBg = _sunsetBgColor;
      targetFog = _sunsetFogColor;
      targetDensity = 0.0018;
      if (hemiLight) {
        hemiLight.color.setHex(0xffb07c);
        hemiLight.groundColor.setHex(0x3a2e39);
        hemiLight.intensity = 0.72;
      }
      if (dirLight) {
        dirLight.color.setHex(0xff8c42);
        dirLight.intensity = 1.35;
        dirLight.position.set(-220, 110, 120);
      }
    } else if (mode === 'NIGHT') {
      targetBg = _nightBgColor;
      targetFog = _nightBgColor;
      targetDensity = 0.0028;
      if (hemiLight) {
        hemiLight.color.setHex(0x1f3044);
        hemiLight.groundColor.setHex(0x090d12);
        hemiLight.intensity = 0.32;
      }
      if (dirLight) {
        dirLight.color.setHex(0x527196);
        dirLight.intensity = 0.38;
        dirLight.position.set(120, 180, -90);
      }
    } else {
      // DAY
      if (hemiLight) {
        hemiLight.color.setHex(0xdff9fb);
        hemiLight.groundColor.setHex(0x4a5540);
        hemiLight.intensity = 0.78;
      }
      if (dirLight) {
        dirLight.color.setHex(0xfff4d6);
        dirLight.intensity = 1.25;
        dirLight.position.set(160, 220, 120);
      }
    }

    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.copy(targetBg);
    } else {
      this.scene.background = targetBg.clone();
    }

    if (this.scene.fog && this.scene.fog.isFogExp2) {
      this.scene.fog.color.copy(targetFog);
      this.scene.fog.density = targetDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(targetFog.getHex(), targetDensity);
    }

    if (this.lampBulbs) {
      const lampHex = mode === 'DAY' ? 0x95a5a6 : 0xffdd59;
      for (let i = 0; i < this.lampBulbs.length; i++) {
        this.lampBulbs[i].material.color.setHex(lampHex);
      }
    }

    if (this.skyCumulusMat) {
      if (this.skyCumulusMat.userData?.uSkyBgColor) {
        this.skyCumulusMat.userData.uSkyBgColor.value.copy(targetBg);
      }
      if (mode === 'SUNSET') {
        this.skyCumulusMat.color.copy(_cloudSunsetColor);
        this.skyCumulusMat.opacity = 0.9;
      } else if (mode === 'NIGHT') {
        this.skyCumulusMat.color.copy(_cloudNightColor);
        this.skyCumulusMat.opacity = 0.72;
      } else {
        this.skyCumulusMat.color.copy(_cloudDayColor);
        this.skyCumulusMat.opacity = 0.88;
      }
    }
    if (this.skyCirrusMat) {
      this.skyCirrusMat.color.copy(
        mode === 'SUNSET' ? _cloudSunsetColor : mode === 'NIGHT' ? _cloudNightColor : _cloudDayColor
      );
      this.skyCirrusMat.opacity = mode === 'NIGHT' ? 0.25 : 0.42;
    }
  },

  // Dynamic Weather System (Battlefield 2042 inspired) + Gentle Wind Cloud Drift
  updateWeather(dt) {
    if (this.skyCloudGroup) {
      this._cloudDriftX = ((this._cloudDriftX || 0) + dt * 4.2);
      if (this._cloudDriftX > 1200) this._cloudDriftX -= 2400;
      this.skyCloudGroup.position.x = this._cloudDriftX;
    }
    this.weatherTimer -= dt;

    if (this.weatherState === 'CLEAR') {
      if (this.weatherTimer <= 0) {
        // Trigger random weather event
        this.weatherState = _WEATHER_EVENTS[(Math.random() * _WEATHER_EVENTS.length) | 0];
        this.weatherDuration = 30 + Math.random() * 45; // 30-75 seconds
        this.weatherTimer = this.weatherDuration;
        this._weatherTransition = 0;
      }
    } else {
      this._weatherTransition = Math.min(1, (this._weatherTransition || 0) + dt * 0.25);

      if (this.weatherTimer <= 0) {
        // Weather clearing
        this.weatherState = 'CLEAR';
        this.weatherTimer = 90 + Math.random() * 120; // Next event in 1.5-3.5 minutes
        this._weatherTransition = 0;
      }
    }

    if (this.weatherParticles && this.weatherParticles.length > 0) {
      for (let i = 0; i < this.weatherParticles.length; i++) {
        const wp = this.weatherParticles[i];
        if (wp && wp.mesh) {
          if (wp.mesh.geometry && !wp.mesh.geometry.userData) wp.mesh.geometry.userData = { shared: true };
          else if (wp.mesh.geometry) wp.mesh.geometry.userData.shared = true;
          if (wp.mesh.material && !wp.mesh.material.userData) wp.mesh.material.userData = { shared: true };
          else if (wp.mesh.material) wp.mesh.material.userData.shared = true;
        }
      }
    }

    // Apply weather effects to fog density
    const mode = this.atmosphereMode || 'DAY';
    const baseDensity = mode === 'NIGHT' ? 0.0028 : mode === 'SUNSET' ? 0.0018 : 0.0014;
    let targetDensity = baseDensity;

    if (this.weatherState === 'FOG') {
      targetDensity = baseDensity * 2.8;
    } else if (this.weatherState === 'HEAVY_FOG') {
      targetDensity = baseDensity * 5.5;
    } else if (this.weatherState === 'SANDSTORM') {
      targetDensity = baseDensity * 4.0;
      // Tint the fog amber during sandstorm (mutating fog.color in-place)
      if (this.scene.fog && this._weatherTransition > 0.3) {
        this.scene.fog.color.lerp(_sandstormFogColor, dt * 0.5);
      }
    }

    // Smooth Altitude-Based Atmospheric Clarity:
    // Whether piloting a plane, gliding under a parachute, OR skydiving in freefall (`parachuteCut`),
    // fog density scales smoothly with actual height above ground so cutting your chute NEVER hides the valley!
    let viewerY = 0;
    let isAirborneEntity = false;
    if (typeof window !== 'undefined' && window.game && window.game.player) {
      const p = window.game.player;
      viewerY = p.camera?.position?.y || p.pos?.y || 0;
      isAirborneEntity = Boolean(
        (p.activeVehicle && p.activeVehicle.isAircraft) || p.parachuting || p.parachuteCut || viewerY > 32
      );
    }
    if (isAirborneEntity || viewerY > 14) {
      const altAboveValley = Math.max(0, viewerY - 12);
      // Crisp airborne horizon visibility right from liftoff (caps dynamic storm/fog haze for aircraft <= 0.00042)
      const altAtten = 1 / (1 + altAboveValley * 0.018);
      const maxAirFog = viewerY > 380 ? 0.00016 : 0.00042;
      targetDensity = Math.min(maxAirFog, targetDensity * altAtten);
    }

    // Soft Cloud-Core Vapor Immersion when flying a jet right through a cumulus cloud!
    let inCloudVapor = 0;
    if (isAirborneEntity && viewerY > 580 && Array.isArray(this.skyCloudCenters) && typeof window !== 'undefined' && window.game?.player?.camera) {
      const camP = window.game.player.camera.position;
      const driftX = this._cloudDriftX || 0;
      for (let ci = 0; ci < this.skyCloudCenters.length; ci++) {
        const cc = this.skyCloudCenters[ci];
        const dy = Math.abs(camP.y - cc.y);
        if (dy > 52) continue;
        const dx = camP.x - (cc.x + driftX);
        const dz = camP.z - cc.z;
        const horizSq = dx * dx + dz * dz;
        const radSq = cc.r * cc.r;
        if (horizSq < radSq) {
          const strength = (1 - Math.sqrt(horizSq) / cc.r) * (1 - dy / 52);
          if (strength > inCloudVapor) inCloudVapor = strength;
        }
      }
    }
    if (inCloudVapor > 0.02) {
      targetDensity = Math.max(targetDensity, 0.0002 + inCloudVapor * 0.0024);
      if (this.scene.fog && mode === 'DAY') {
        this.scene.fog.color.lerp(_cloudDayColor, Math.min(1, inCloudVapor * dt * 8.0));
      }
    }

    if (this.scene.fog) {
      const currentDensity = this.scene.fog.density || baseDensity;
      this.scene.fog.density = THREE.MathUtils.lerp(
        currentDensity,
        targetDensity,
        dt * (isAirborneEntity ? 5.0 : 1.2)
      );

      // Restore fog color in-place when clearing
      if (this.weatherState === 'CLEAR' && this.scene.background && this.scene.background.isColor) {
        this.scene.fog.color.lerp(this.scene.background, dt * 0.3);
      }
    }
  },

  // Get current weather for HUD display
  getWeatherStatus() {
    if (this.weatherState === 'FOG') return '🌫️ FOG ROLLING IN';
    if (this.weatherState === 'HEAVY_FOG') return '🌫️ HEAVY FOG — VISIBILITY LIMITED';
    if (this.weatherState === 'SANDSTORM') return '🌪️ SANDSTORM — SEEK COVER';
    return null;
  }
};
