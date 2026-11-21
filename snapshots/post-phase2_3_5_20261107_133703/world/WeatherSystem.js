import * as THREE from '../../vendor/three.module.js';

// Pre-allocated reusable THREE.Color instance for sandstorm fog tinting (Phase 3F)
const _sandstormFogColor = new THREE.Color(0xb89058);

export const WeatherSystem = {
  /**
   * Switches BattleBit time-of-day atmosphere ('DAY', 'SUNSET', 'NIGHT')
   */
  setAtmosphereMode(mode, hemiLight, dirLight) {
    this.atmosphereMode = mode;
    if (mode === 'SUNSET') {
      this.scene.background = new THREE.Color(0xd97d54);
      this.scene.fog = new THREE.FogExp2(0xc86d51, 0.0018);
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
      this.scene.background = new THREE.Color(0x070b12);
      this.scene.fog = new THREE.FogExp2(0x070b12, 0.0028);
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
      this.scene.background = new THREE.Color(0x87b8d8);
      this.scene.fog = new THREE.FogExp2(0x87b8d8, 0.0014);
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

    if (this.lampBulbs) {
      const lampHex = mode === 'DAY' ? 0x95a5a6 : 0xffdd59;
      for (const b of this.lampBulbs) {
        b.material.color.setHex(lampHex);
      }
    }
  },

  // Dynamic Weather System (Battlefield 2042 inspired)
  updateWeather(dt) {
    this.weatherTimer -= dt;

    if (this.weatherState === 'CLEAR') {
      if (this.weatherTimer <= 0) {
        // Trigger random weather event
        const events = ['FOG', 'HEAVY_FOG', 'SANDSTORM'];
        this.weatherState = events[Math.floor(Math.random() * events.length)];
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
      // Tint the fog amber during sandstorm
      if (this.scene.fog && this._weatherTransition > 0.3) {
        this.scene.fog.color.lerp(_sandstormFogColor, dt * 0.5);
      }
    }

    if (this.scene.fog) {
      const currentDensity = this.scene.fog.density || baseDensity;
      this.scene.fog.density = THREE.MathUtils.lerp(currentDensity, targetDensity, dt * 0.8);

      // Restore fog color when clearing
      if (this.weatherState === 'CLEAR' && this.scene.background) {
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
