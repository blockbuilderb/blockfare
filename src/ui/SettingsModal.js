import { sound } from '../audio.js?v=143';

export const SettingsModal = {
  bindSettingsEvents() {
    const deploySettingsBtn = this.el('deploy-settings-btn');
    if (deploySettingsBtn) {
      deploySettingsBtn.addEventListener('click', () => {
        this.toggleSettingsModal();
      });
    }

    const hudSettingsBtn = this.el('hud-settings-btn');
    if (hudSettingsBtn) {
      hudSettingsBtn.addEventListener('click', () => {
        this.toggleSettingsModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        const modal = this.el('settings-modal');
        if (modal) {
          this.toggleSettingsModal(false);
        }
      }
    });

    this.updateAudioSettingsHud();
  },

  updateAudioSettingsHud() {
    const masterVol = sound.getVolume('master');
    const isMuted = sound.getVolume('muted');

    const deploySettingsBtn = this.el('deploy-settings-btn');
    if (deploySettingsBtn) {
      deploySettingsBtn.textContent = isMuted ? '🔇 Muted' : `⚙️ Settings`;
      deploySettingsBtn.style.borderColor = isMuted ? '#e74c3c' : '#00cec9';
      deploySettingsBtn.style.color = isMuted ? '#ff7675' : '#81ecec';
    }

    const hudSettingsBtn = this.el('hud-settings-btn');
    if (hudSettingsBtn) {
      hudSettingsBtn.textContent = isMuted ? '🔇 Muted' : `⚙️ Settings`;
      hudSettingsBtn.style.color = isMuted ? '#ff7675' : '#81ecec';
    }
    this.updateBuildingDestructionUI();
    this.updateFriendlyFireUI();
    this.updateSquadDoctrineUI();
    this.updateDeathCamUI();
  },

  updateDeathCamUI() {
    const enabled = Boolean(this.player && this.player.deathCamEnabled);
    const dcBtn = this.el('deploy-deathcam-toggle-btn');
    if (dcBtn) {
      dcBtn.textContent = enabled ? '🎥 Killcam: ON' : '🎥 Killcam: OFF';
      dcBtn.classList.toggle('active', enabled);
      dcBtn.style.borderColor = enabled ? '#ff4757' : 'rgba(149, 165, 166, 0.55)';
      dcBtn.style.color = enabled ? '#ff9f9f' : '#dfe6e9';
      dcBtn.style.background = enabled
        ? 'rgba(231, 76, 60, 0.22)'
        : 'rgba(255, 255, 255, 0.08)';
    }
    const downedDcBtn = this.el('downed-deathcam-toggle-btn');
    if (downedDcBtn) {
      downedDcBtn.classList.toggle('active', enabled);
      downedDcBtn.textContent = enabled
        ? '🎥 [V] OPTIONAL DEATH CAM: ON — SHOWING KILLER & 3D SHOT TRACE'
        : '🎥 [V] OPTIONAL DEATH CAM: OFF (REALISTIC — PRESS [V] TO REVEAL HOW YOU DIED)';
    }
  },

  updateSquadDoctrineUI() {
    const enabled = this.player ? this.player.squadDoctrineEnabled !== false : true;
    const docBtn = this.el('deploy-doctrine-toggle-btn');
    if (docBtn) {
      docBtn.textContent = enabled ? '🎖️ Doctrine: ON' : '🔓 Doctrine: OFF';
      docBtn.classList.toggle('active', enabled);
      docBtn.style.borderColor = enabled ? '#2ecc71' : '#f39c12';
      docBtn.style.color = enabled ? '#7bed9f' : '#ffeaa7';
      docBtn.style.background = enabled ? 'rgba(46, 204, 113, 0.18)' : 'rgba(243, 156, 18, 0.2)';
    }
  },

  updateFriendlyFireUI() {
    const enabled = Boolean(this.player && this.player.friendlyFireEnabled);
    const tkCount = (this.player && this.player.friendlyFireKills) || 0;
    const penaltyTot = (this.player && this.player.friendlyFirePenaltyTotal) || 0;

    const ffBtn = this.el('deploy-friendly-fire-toggle-btn');
    if (ffBtn) {
      ffBtn.textContent = enabled
        ? `⚠️ FRIENDLY FIRE: ON (-10¢/TK${tkCount > 0 ? ` • ${tkCount} TK -$${penaltyTot.toFixed(2)}` : ''})`
        : '🛡️ FRIENDLY FIRE: OFF (-10¢/TK)';
      ffBtn.classList.toggle('active', enabled);
      ffBtn.style.borderColor = enabled ? '#ff5252' : '#74b9ff';
      ffBtn.style.color = enabled ? '#ff7675' : '#74b9ff';
      ffBtn.style.background = enabled ? 'rgba(231, 76, 60, 0.25)' : 'rgba(52, 152, 219, 0.14)';
    }

    const hudFfBtn = this.el('hud-friendly-fire-btn');
    if (hudFfBtn) {
      hudFfBtn.textContent = enabled
        ? `⚠️ FF: ON (-10¢/TK${tkCount > 0 ? ` • -$${penaltyTot.toFixed(2)}` : ''})`
        : '🛡️ FF: OFF (-10¢/TK)';
      hudFfBtn.style.color = enabled ? '#ff7675' : '#74b9ff';
    }

    const depB2FfBtn = document.getElementById('dep-b2-friendly-fire-btn');
    if (depB2FfBtn) {
      depB2FfBtn.textContent = enabled
        ? `⚠️ FRIENDLY FIRE: ON (-10¢/TK${tkCount > 0 ? ` • -$${penaltyTot.toFixed(2)}` : ''})`
        : '🛡️ FRIENDLY FIRE: OFF (-10¢/TK)';
      depB2FfBtn.style.borderColor = enabled ? '#ff5252' : '#74b9ff';
      depB2FfBtn.style.color = enabled ? '#ff7675' : '#74b9ff';
      depB2FfBtn.style.background = enabled ? 'rgba(231, 76, 60, 0.28)' : 'rgba(52, 152, 219, 0.18)';
    }
  },

  updateBuildingDestructionUI() {
    const destrToggleBtn = this.el('deploy-destruction-toggle-btn');
    const enabled = this.world ? this.world.buildingDestructionEnabled !== false : true;
    if (destrToggleBtn) {
      destrToggleBtn.textContent = enabled
        ? '💥 BUILDINGS: DESTRUCTIBLE (YES)'
        : '🛡️ BUILDINGS: INDESTRUCTIBLE (NO)';
      destrToggleBtn.classList.toggle('active', enabled);
      destrToggleBtn.style.borderColor = enabled ? '#e67e22' : '#74b9ff';
      destrToggleBtn.style.color = enabled ? '#f39c12' : '#74b9ff';
    }
  },

  toggleSettingsModal(forceState) {
    let modal = this.el('settings-modal');

    if (forceState === false) {
      if (modal) modal.remove();
      return;
    }

    if (forceState === undefined && modal) {
      modal.remove();
      return;
    }

    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'settings-modal';
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 580px; max-width: 94vw; max-height: 90vh; overflow-y: auto;
        background: #0b1219;
        border: 2px solid #00cec9; border-radius: 8px; padding: 18px 22px;
        z-index: 10010; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.92), 0 0 24px rgba(0, 206, 201, 0.18);
        pointer-events: auto;
      `;
      document.body.appendChild(modal);
      if (this._domCache) this._domCache.set('settings-modal', modal);
    }

    this.renderSettingsModalContent(modal);
    this.updateAudioSettingsHud();
  },

  renderSettingsModalContent(modal) {
    if (!modal) return;

    const masterVol = sound.getVolume('master');
    const weaponsVol = sound.getVolume('weapons');
    const explosionsVol = sound.getVolume('explosions');
    const vehiclesVol = sound.getVolume('vehicles');
    const radioVol = sound.getVolume('radio');
    const musicVol = sound.getVolume('music');
    const reverbOn = sound.getVolume('reverbEnabled');
    const envLabel = (sound.currentEnvironment || 'open_valley').replace(/_/g, ' ').toUpperCase();
    const isMuted = sound.getVolume('muted');
    const bldDestructEnabled = this.world ? this.world.buildingDestructionEnabled !== false : true;
    const bhopEnabled = this.player ? this.player.bhopEnabled !== false : true;
    const airAvoidEnabled = this.player ? this.player.aircraftCollisionAvoidance !== false : true;
    const squadDoctrineEnabled = this.player ? this.player.squadDoctrineEnabled !== false : true;
    const ffEnabled = Boolean(this.player && this.player.friendlyFireEnabled);
    const ffKills = (this.player && this.player.friendlyFireKills) || 0;
    const ffPenalty = (this.player && this.player.friendlyFirePenaltyTotal) || 0;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,206,201,0.35);padding-bottom:10px;margin-bottom:14px;">
        <div>
          <div style="font-size:18px;font-weight:900;color:#f1c40f;letter-spacing:1px;">🔊 TACTICAL AUDIO &amp; WORLD SETTINGS</div>
          <div style="font-size:11px;color:#81ecec;font-weight:700;">FINE-TUNE MASTER GAIN (0–100), CHANNELS &amp; BUILDING DESTRUCTION • AUTO-SAVED</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" id="settings-open-manual-btn" style="background:rgba(0,210,211,0.18);border:1px solid #00d2d3;color:#81ecec;border-radius:4px;padding:5px 10px;font-size:11.5px;font-weight:900;cursor:pointer;">📖 CONTROLS [? / F1]</button>
          <button type="button" id="settings-close-top-btn" style="background:rgba(231,76,60,0.2);border:1px solid #e74c3c;color:#ff7675;border-radius:4px;padding:5px 12px;font-size:12px;font-weight:900;cursor:pointer;">✕ CLOSE</button>
        </div>
      </div>

      <!-- MASTER VOLUME SECTION -->
      <div style="background:rgba(16,28,40,0.92);border:1px solid rgba(241,196,15,0.45);border-left:4px solid #f1c40f;border-radius:6px;padding:12px 14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <span style="font-size:14px;font-weight:900;color:#f1c40f;letter-spacing:0.6px;">MASTER VOLUME (0 - 100)</span>
            <div style="font-size:10.5px;color:#bdc3c7;">Controls global WebAudio master bus limiter &amp; overall output gain</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="vol-badge-master" style="background:rgba(241,196,15,0.18);border:1px solid #f1c40f;color:#f1c40f;border-radius:4px;padding:3px 9px;font-size:13px;font-weight:900;min-width:66px;text-align:center;">
              ${isMuted ? 'MUTED' : `${masterVol} / 100`}
            </span>
            <button type="button" id="settings-mute-btn" style="background:${
              isMuted ? 'rgba(231,76,60,0.32)' : 'rgba(255,255,255,0.08)'
            };border:1px solid ${isMuted ? '#e74c3c' : 'rgba(255,255,255,0.28)'};color:${
              isMuted ? '#ff7675' : '#dfe6e9'
            };border-radius:4px;padding:4px 10px;font-size:11px;font-weight:900;cursor:pointer;">
              ${isMuted ? '🔇 UNMUTE ALL' : '🔇 MUTE ALL'}
            </button>
          </div>
        </div>

        <input
          id="vol-slider-master"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${masterVol}"
          style="width:100%;accent-color:#f1c40f;cursor:pointer;height:6px;margin-bottom:8px;"
        />

        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
          <span style="font-size:10.5px;color:#95a5a6;font-weight:800;">QUICK PRESETS:</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="vol-preset-btn" data-preset="10" style="background:rgba(0,206,201,0.14);border:1px solid rgba(0,206,201,0.45);color:#81ecec;border-radius:3px;padding:3px 10px;font-size:11px;font-weight:900;cursor:pointer;">10%</button>
            <button type="button" class="vol-preset-btn" data-preset="50" style="background:rgba(0,206,201,0.14);border:1px solid rgba(0,206,201,0.45);color:#81ecec;border-radius:3px;padding:3px 10px;font-size:11px;font-weight:900;cursor:pointer;">50%</button>
            <button type="button" class="vol-preset-btn" data-preset="80" style="background:rgba(0,206,201,0.14);border:1px solid rgba(0,206,201,0.45);color:#81ecec;border-radius:3px;padding:3px 10px;font-size:11px;font-weight:900;cursor:pointer;">80%</button>
            <button type="button" class="vol-preset-btn" data-preset="100" style="background:rgba(0,206,201,0.14);border:1px solid rgba(0,206,201,0.45);color:#81ecec;border-radius:3px;padding:3px 10px;font-size:11px;font-weight:900;cursor:pointer;">100%</button>
          </div>
        </div>
      </div>

      <!-- CATEGORY 1: WEAPONS & INFANTRY FIRE -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.3);border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">1. WEAPONS &amp; INFANTRY FIRE (0 - 100)</span>
            <div style="font-size:10px;color:#95a5a6;">Rifles, SMGs, LMGs, Snipers, Suppressed Shots, Bullet Whiz, Reloads &amp; Hitmarkers</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="vol-badge-weapons" style="background:rgba(0,206,201,0.15);border:1px solid #00cec9;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:900;min-width:60px;text-align:center;">
              ${weaponsVol} / 100
            </span>
            <button type="button" id="test-shot-btn" style="background:rgba(241,196,15,0.18);border:1px solid #f1c40f;color:#f1c40f;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">🔫 Test Shot</button>
            <button type="button" id="test-amr-btn" style="background:rgba(231,76,60,0.2);border:1px solid #e74c3c;color:#ff7675;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">🎯 .50 AMR</button>
          </div>
        </div>
        <input
          id="vol-slider-weapons"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${weaponsVol}"
          style="width:100%;accent-color:#00cec9;cursor:pointer;height:6px;"
        />
      </div>

      <!-- CATEGORY 2: EXPLOSIONS & ARMOR -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.3);border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">2. EXPLOSIONS &amp; ARMOR (0 - 100)</span>
            <div style="font-size:10px;color:#95a5a6;">120mm Tank Cannons, 30mm IFV Autocannons, RPG-7, C4, Frags &amp; Airstrikes</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="vol-badge-explosions" style="background:rgba(0,206,201,0.15);border:1px solid #00cec9;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:900;min-width:60px;text-align:center;">
              ${explosionsVol} / 100
            </span>
            <button type="button" id="test-cannon-btn" style="background:rgba(230,126,34,0.22);border:1px solid #e67e22;color:#f39c12;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">💥 Test Cannon</button>
          </div>
        </div>
        <input
          id="vol-slider-explosions"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${explosionsVol}"
          style="width:100%;accent-color:#00cec9;cursor:pointer;height:6px;"
        />
      </div>

      <!-- CATEGORY 3: RADIO COMMS & UI -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.3);border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">3. RADIO COMMS &amp; UI (0 - 100)</span>
            <div style="font-size:10px;color:#95a5a6;">Squad Leader Radio Squelch, Commo Rose, Capture Ticks &amp; Objective Alerts</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="vol-badge-radio" style="background:rgba(0,206,201,0.15);border:1px solid #00cec9;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:900;min-width:60px;text-align:center;">
              ${radioVol} / 100
            </span>
            <button type="button" id="test-radio-btn" style="background:rgba(46,204,113,0.2);border:1px solid #2ecc71;color:#7bed9f;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">📻 Test Radio</button>
          </div>
        </div>
        <input
          id="vol-slider-radio"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${radioVol}"
          style="width:100%;accent-color:#00cec9;cursor:pointer;height:6px;"
        />
      </div>

      <!-- CATEGORY 3B: VEHICLES, TURBINES & ROTORS -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.3);border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">VEHICLES, ENGINES &amp; ROTORS (0 - 100)</span>
            <div style="font-size:10px;color:#95a5a6;">Humvee V8 Diesel, M1A2 Gas-Turbine, T-90M V12, Dirt Bikes, Helicopters &amp; Jet Afterburners</div>
          </div>
          <span id="vol-badge-vehicles" style="background:rgba(0,206,201,0.15);border:1px solid #00cec9;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:900;min-width:60px;text-align:center;">
            ${vehiclesVol} / 100
          </span>
        </div>
        <input
          id="vol-slider-vehicles"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${vehiclesVol}"
          style="width:100%;accent-color:#00cec9;cursor:pointer;height:6px;"
        />
      </div>

      <!-- CATEGORY 3C: ADAPTIVE GENERAL MIDI WAR SOUNDTRACK & 3D CONVOLUTION REVERB -->
      <div style="background:rgba(16,26,36,0.92);border:1px solid rgba(155,89,182,0.5);border-left:4px solid #9b59b6;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#d2b4de;">🎵 ADAPTIVE MIDI SCORE &amp; 3D CONVOLUTION REVERB (0 - 100)</span>
            <div style="font-size:10px;color:#95a5a6;">Dynamic General MIDI Combat Score (Deploy, Contested, Low-Ticket Finale &amp; Medieval) + Live Acoustic Echo (<b>${envLabel}</b>)</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span id="vol-badge-music" style="background:rgba(155,89,182,0.2);border:1px solid #9b59b6;color:#e8daef;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:900;min-width:60px;text-align:center;">
              ${musicVol} / 100
            </span>
            <button type="button" id="test-music-btn" style="background:rgba(155,89,182,0.24);border:1px solid #9b59b6;color:#e8daef;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">🎺 Fanfare</button>
            <button type="button" id="settings-reverb-btn" style="background:${
              reverbOn ? 'rgba(46,204,113,0.22)' : 'rgba(255,255,255,0.08)'
            };border:1px solid ${reverbOn ? '#2ecc71' : 'rgba(255,255,255,0.28)'};color:${
              reverbOn ? '#7bed9f' : '#94a3b8'
            };border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">${
              reverbOn ? '🏔️ REVERB: ON' : '🏔️ REVERB: OFF'
            }</button>
          </div>
        </div>
        <input
          id="vol-slider-music"
          type="range"
          min="0"
          max="100"
          step="1"
          value="${musicVol}"
          style="width:100%;accent-color:#9b59b6;cursor:pointer;height:6px;"
        />
      </div>

      <!-- CATEGORY 4: BUILDING DESTRUCTION & REPAIR OPTION (DEFAULT: YES) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(230,126,34,0.45);border-left:4px solid #e67e22;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#f39c12;">4. ALLOW BUILDINGS TO BE DESTROYED (DEFAULT: YES)</span>
            <div style="font-size:10px;color:#bdc3c7;">When enabled (default), tanks, RPGs &amp; C4 can blast craters or level buildings, and defenders can repair damaged buildings around forward bases with <b>[F]</b> or <b>[T]</b> (+75 XP).</div>
          </div>
          <button
            type="button"
            id="settings-bld-destruction-btn"
            style="background:${
              bldDestructEnabled ? 'rgba(230,126,34,0.25)' : 'rgba(52,152,219,0.22)'
            };border:1px solid ${bldDestructEnabled ? '#e67e22' : '#3498db'};color:${
              bldDestructEnabled ? '#f39c12' : '#74b9ff'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${bldDestructEnabled ? '💥 YES (DESTRUCTIBLE)' : '🛡️ NO (INDESTRUCTIBLE)'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 5: QUAKE BUNNYHOP & AIR-STRAFING MOVEMENT OPTION -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(46,204,113,0.45);border-left:4px solid #2ecc71;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#2ecc71;">5. QUAKE BUNNYHOPPING &amp; AIR-STRAFING MECHANISM</span>
            <div style="font-size:10px;color:#bdc3c7;">When enabled, holding <b>[SPACE]</b> auto-bunnyhops with zero landing friction and air-strafing (<b>A/D</b> + mouse turn) builds uncapped horizontal momentum. Turn OFF for standard tactical movement.</div>
          </div>
          <button
            type="button"
            id="settings-bhop-toggle-btn"
            style="background:${
              bhopEnabled ? 'rgba(46,204,113,0.25)' : 'rgba(255,255,255,0.08)'
            };border:1px solid ${bhopEnabled ? '#2ecc71' : 'rgba(255,255,255,0.28)'};color:${
              bhopEnabled ? '#7bed9f' : '#94a3b8'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${bhopEnabled ? '🐇 ENABLED (ON)' : '🥾 DISABLED (OFF)'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 6: FRIENDLY FIRE MODE (-$0.10 / 10 CENTS PER TEAMMATE KILL) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(255,82,82,0.5);border-left:4px solid #ff5252;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#ff7675;">6. FRIENDLY FIRE MODE (-$0.10 / 10 CENTS DEDUCTED PER TEAMMATE KILL)</span>
            <div style="font-size:10px;color:#bdc3c7;">When turned ON, your gunfire, explosives &amp; vehicles can damage and eliminate friendly teammates. Each teammate kill deducts <b>$0.10 (10 cents)</b> from your cash! ${
              ffKills > 0
                ? `<span style="color:#ff7675;font-weight:900;">(TEAMKILLS: ${ffKills} • PENALTY: -$${ffPenalty.toFixed(2)})</span>`
                : ''
            }</div>
          </div>
          <button
            type="button"
            id="settings-friendly-fire-btn"
            style="background:${
              ffEnabled ? 'rgba(231,76,60,0.32)' : 'rgba(52,152,219,0.18)'
            };border:1px solid ${ffEnabled ? '#ff5252' : '#3498db'};color:${
              ffEnabled ? '#ff7675' : '#74b9ff'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${ffEnabled ? '⚠️ FRIENDLY FIRE: ON (-$0.10/TK)' : '🛡️ FRIENDLY FIRE: OFF (SAFE)'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 7: FPS COUNTER & UNCAPPED BENCHMARK MODE [F2] -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.35);border-left:4px solid #00cec9;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <span style="font-size:13px;font-weight:900;color:#81ecec;">7. FPS COUNTER &amp; UNCAPPED BENCHMARK MODE [F2]</span>
            <div style="font-size:10px;color:#bdc3c7;"><b>UNCAPPED</b> (default) bypasses browser 60Hz/120Hz V-Sync via a zero-delay <code>MessageChannel</code> loop to benchmark raw CPU/GPU max FPS across different computers! Switch to <b>V-SYNC</b> anytime to save laptop battery.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button
              type="button"
              id="settings-uncapped-fps-btn"
              style="background:${
                window.game?.uncappedFps !== false ? 'rgba(0,210,211,0.26)' : 'rgba(255,255,255,0.08)'
              };border:1px solid ${window.game?.uncappedFps !== false ? '#00d2d3' : 'rgba(255,255,255,0.28)'};color:${
                window.game?.uncappedFps !== false ? '#81ecec' : '#cbd5e1'
              };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
            >
              ${window.game?.uncappedFps !== false ? '🚀 CAP: UNCAPPED (MAX FPS)' : '🖥️ CAP: V-SYNC (MONITOR Hz)'}
            </button>
            <button
              type="button"
              id="settings-fps-toggle-btn"
              style="background:${
                this.showFps !== false ? 'rgba(46,204,113,0.25)' : 'rgba(255,255,255,0.08)'
              };border:1px solid ${this.showFps !== false ? '#2ecc71' : 'rgba(255,255,255,0.28)'};color:${
                this.showFps !== false ? '#7bed9f' : '#94a3b8'
              };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
            >
              ${this.showFps !== false ? '⏱ FPS HUD: ON' : '⏱ FPS HUD: OFF'}
            </button>
          </div>
        </div>
      </div>

      <!-- CATEGORY 8: AIRCRAFT COLLISION AVOIDANCE (DEFAULT: AUTO ON vs. REALISTIC CRASH MODE) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,210,211,0.45);border-left:4px solid #00d2d3;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#00d2d3;">8. AIRCRAFT FLIGHT ASSIST &amp; COLLISION AVOIDANCE (DEFAULT: AUTO ON • HOTKEY [G] IN FLIGHT)</span>
            <div style="font-size:10px;color:#bdc3c7;">When <b>AUTO ON</b> (default, Easy Flight), planes auto pull-up over terrain/buildings AND keep turns upright (cannot flip upside-down). Turn <b>OFF (ADVANCED AEROBATICS)</b> to unlock full <b>360° Barrel Rolls, Vertical Loops &amp; Upside-Down Flight</b> plus realistic ground/building crashes!</div>
          </div>
          <button
            type="button"
            id="settings-air-avoid-btn"
            style="background:${
              airAvoidEnabled ? 'rgba(46,204,113,0.25)' : 'rgba(231,76,60,0.32)'
            };border:1px solid ${airAvoidEnabled ? '#2ecc71' : '#ff5252'};color:${
              airAvoidEnabled ? '#7bed9f' : '#ff7675'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${airAvoidEnabled ? '🛡️ AUTO ON (EASY UPRIGHT)' : '🔥 OFF (360° AEROBATICS)'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 9: SQUAD SPECIALIZED ROLES, VEHICLE LICENSES & FOB GUNSMITH DOCTRINE (DEFAULT: ON) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(46,204,113,0.5);border-left:4px solid #2ecc71;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#7bed9f;">9. SQUAD ROLE LICENSES, ENGINEER BUILDING &amp; BASE/FOB GUNSMITH (DEFAULT: ON)</span>
            <div style="font-size:10px;color:#bdc3c7;">When <b>ON</b> (default, <i>Squad</i>-style), only <b>Combat Pilots</b> fly/order Planes, only <b>Armor Crewmen</b> operate/request Tanks &amp; IFVs, only <b>Engineers</b> build walls/emplacements, and <b>[L] Gunsmith</b> operates at Main Base, Friendly FOBs &amp; Stashes. Toggle <b>OFF</b> for unrestricted sandbox access!</div>
          </div>
          <button
            type="button"
            id="settings-doctrine-btn"
            style="background:${
              squadDoctrineEnabled ? 'rgba(46,204,113,0.25)' : 'rgba(243,156,18,0.28)'
            };border:1px solid ${squadDoctrineEnabled ? '#2ecc71' : '#f39c12'};color:${
              squadDoctrineEnabled ? '#7bed9f' : '#ffeaa7'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${squadDoctrineEnabled ? '🎖️ DOCTRINE: ON (REALISTIC)' : '🔓 DOCTRINE: OFF (OPEN)'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 10: BATTLEFIELD PLAYER & AI ARMY SCALE (UP TO 500 PLAYERS: 1 YOU + 499 AI) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(241,196,15,0.45);border-left:4px solid #f1c40f;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#f1c40f;">10. BATTLEFIELD SCALE (DEFAULT: 500 PLAYERS = 1 YOU + 499 AI • BALANCED 250 VS 250)</span>
            <div style="font-size:10px;color:#bdc3c7;">Scale battlefield combatant density across the 7,600m theater in real time (reserves 1 slot on your faction so US &amp; RU stay evenly matched).</div>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${[75, 125, 175, 200, 250]
              .map((cnt) => {
                const curCnt = this.botManager?.currentBotsPerTeam || 250;
                const active = curCnt === cnt;
                const totPlayers = cnt * 2;
                const aiCount = totPlayers - 1;
                return `<button type="button" class="settings-bot-count-btn" data-bots="${cnt}" style="background:${
                  active ? 'rgba(241,196,15,0.28)' : 'rgba(255,255,255,0.08)'
                };border:1px solid ${active ? '#f1c40f' : 'rgba(255,255,255,0.24)'};color:${
                  active ? '#ffeaa7' : '#dfe6e9'
                };border-radius:4px;padding:4px 9px;font-size:11px;font-weight:900;cursor:pointer;">${totPlayers}P (1+${aiCount} AI)</button>`;
              })
              .join('')}
          </div>
        </div>
      </div>

      <!-- CATEGORY 11: OPTIONAL TACTICAL DEATH CAM & 3D SHOT TRAJECTORY (DEFAULT: OFF FOR REALISM) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(255,71,87,0.45);border-left:4px solid #ff4757;border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#ff6b81;">11. OPTIONAL DEATH CAM &amp; 3D SHOT TRACE (DEFAULT: OFF FOR REALISM)</span>
            <div style="font-size:10px;color:#bdc3c7;">OFF preserves hardcore mil-sim fog of war. Turn ON (or press <b>[V]</b> when downed) to see Killer Zoom, 3D Bullet Trajectory, Hit Zone &amp; 3.8s Killer Replay.</div>
          </div>
          <button type="button" id="settings-deathcam-btn" style="background:${
            this.player?.deathCamEnabled ? 'rgba(231,76,60,0.28)' : 'rgba(255,255,255,0.08)'
          };border:1.5px solid ${
            this.player?.deathCamEnabled ? '#ff4757' : 'rgba(189,195,199,0.4)'
          };color:${
            this.player?.deathCamEnabled ? '#ff9f9f' : '#dfe6e9'
          };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;">${
            this.player?.deathCamEnabled
              ? '🎥 DEATH CAM: ON (3D TRACE + REPLAY)'
              : '🪖 DEATH CAM: OFF (REALISTIC DEFAULT)'
          }</button>
        </div>
      </div>

      <!-- CATEGORY 12: PUBG / COD MOBILE DUAL-THUMB TOUCH CONTROLS & AIM SENSITIVITY -->
      <div style="background:rgba(16,26,36,0.92);border:1px solid rgba(0,210,211,0.5);border-left:4px solid #00d2d3;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">12. 📱 MOBILE DUAL-THUMB TOUCH HUD &amp; AIM SENSITIVITY</span>
            <div style="font-size:10px;color:#bdc3c7;"><b>AUTO</b> enables the PUBG/CoD Mobile Dual-Thumb Joystick + Fire/Drag-Aim HUD automatically on phones &amp; tablets while keeping Desktop KBM clean. Force <b>ON</b> anytime to test!</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="touch-sens-badge" style="background:rgba(0,210,211,0.16);border:1px solid #00d2d3;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:11.5px;font-weight:900;min-width:58px;text-align:center;">
              ${this.mobileTouch?.touchSensPct || 100}%
            </span>
            <button type="button" id="settings-touch-mode-btn" style="background:rgba(0,210,211,0.22);border:1.5px solid #00d2d3;color:#81ecec;border-radius:4px;padding:5px 11px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;">
              📱 TOUCH: ${(this.mobileTouch?.mode || 'auto').toUpperCase()}
            </button>
          </div>
        </div>
        <input
          id="touch-sens-slider"
          type="range"
          min="25"
          max="200"
          step="5"
          value="${this.mobileTouch?.touchSensPct || 100}"
          style="width:100%;accent-color:#00d2d3;cursor:pointer;height:6px;"
        />
      </div>

      <!-- FOOTER ACTIONS -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px;">
        <button type="button" id="settings-reset-btn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.28);color:#dfe6e9;border-radius:4px;padding:6px 14px;font-size:12px;font-weight:800;cursor:pointer;">↺ Reset to Defaults</button>
        <button type="button" id="settings-close-bottom-btn" style="background:#00cec9;border:none;color:#0b1219;border-radius:4px;padding:6px 18px;font-size:12.5px;font-weight:900;cursor:pointer;">✓ SAVE &amp; CLOSE</button>
      </div>
    `;

    const masterSlider = modal.querySelector('#vol-slider-master');
    const masterBadge = modal.querySelector('#vol-badge-master');
    const muteBtn = modal.querySelector('#settings-mute-btn');
    const weaponsSlider = modal.querySelector('#vol-slider-weapons');
    const weaponsBadge = modal.querySelector('#vol-badge-weapons');
    const explosionsSlider = modal.querySelector('#vol-slider-explosions');
    const explosionsBadge = modal.querySelector('#vol-badge-explosions');
    const radioSlider = modal.querySelector('#vol-slider-radio');
    const radioBadge = modal.querySelector('#vol-badge-radio');
    const vehiclesSlider = modal.querySelector('#vol-slider-vehicles');
    const vehiclesBadge = modal.querySelector('#vol-badge-vehicles');
    const musicSlider = modal.querySelector('#vol-slider-music');
    const musicBadge = modal.querySelector('#vol-badge-music');

    const syncMuteUi = () => {
      const muted = sound.getVolume('muted');
      const curMaster = sound.getVolume('master');
      if (masterBadge) {
        masterBadge.textContent = muted ? 'MUTED' : `${curMaster} / 100`;
      }
      if (muteBtn) {
        muteBtn.textContent = muted ? '🔇 UNMUTE ALL' : '🔇 MUTE ALL';
        muteBtn.style.background = muted ? 'rgba(231,76,60,0.32)' : 'rgba(255,255,255,0.08)';
        muteBtn.style.borderColor = muted ? '#e74c3c' : 'rgba(255,255,255,0.28)';
        muteBtn.style.color = muted ? '#ff7675' : '#dfe6e9';
      }
      this.updateAudioSettingsHud();
    };

    if (masterSlider) {
      masterSlider.addEventListener('input', () => {
        const val = sound.setVolume('master', masterSlider.value);
        if (sound.getVolume('muted') && val > 0) {
          sound.setMuted(false);
        }
        syncMuteUi();
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        sound.toggleMute();
        syncMuteUi();
      });
    }

    modal.querySelectorAll('.vol-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetVal = Number(btn.dataset.preset || 80);
        sound.setMuted(false);
        const applied = sound.setVolume('master', presetVal);
        if (masterSlider) masterSlider.value = String(applied);
        syncMuteUi();
        sound.playRadioBeep(true);
      });
    });

    if (weaponsSlider) {
      weaponsSlider.addEventListener('input', () => {
        const val = sound.setVolume('weapons', weaponsSlider.value);
        if (weaponsBadge) weaponsBadge.textContent = `${val} / 100`;
        this.updateAudioSettingsHud();
      });
    }

    if (explosionsSlider) {
      explosionsSlider.addEventListener('input', () => {
        const val = sound.setVolume('explosions', explosionsSlider.value);
        if (explosionsBadge) explosionsBadge.textContent = `${val} / 100`;
        this.updateAudioSettingsHud();
      });
    }

    if (radioSlider) {
      radioSlider.addEventListener('input', () => {
        const val = sound.setVolume('radio', radioSlider.value);
        if (radioBadge) radioBadge.textContent = `${val} / 100`;
        this.updateAudioSettingsHud();
      });
    }

    if (vehiclesSlider) {
      vehiclesSlider.addEventListener('input', () => {
        const val = sound.setVolume('vehicles', vehiclesSlider.value);
        if (vehiclesBadge) vehiclesBadge.textContent = `${val} / 100`;
        this.updateAudioSettingsHud();
      });
    }

    if (musicSlider) {
      musicSlider.addEventListener('input', () => {
        const val = sound.setVolume('music', musicSlider.value);
        if (musicBadge) musicBadge.textContent = `${val} / 100`;
        this.updateAudioSettingsHud();
      });
    }

    const testAmrBtn = modal.querySelector('#test-amr-btn');
    if (testAmrBtn) {
      testAmrBtn.addEventListener('click', () => {
        sound.playGunshot('amr', 0, 0, false);
      });
    }

    const testMusicBtn = modal.querySelector('#test-music-btn');
    if (testMusicBtn) {
      testMusicBtn.addEventListener('click', () => {
        sound.playMusicStinger?.('victory');
      });
    }

    const reverbBtn = modal.querySelector('#settings-reverb-btn');
    if (reverbBtn) {
      reverbBtn.addEventListener('click', () => {
        const nextRev = !sound.getVolume('reverbEnabled');
        sound.setReverbEnabled?.(nextRev);
        this.renderSettingsModalContent(modal);
        sound.playRadioBeep(true);
      });
    }

    const testShotBtn = modal.querySelector('#test-shot-btn');
    if (testShotBtn) {
      testShotBtn.addEventListener('click', () => {
        sound.playGunshot('rifle', 0, 0, false);
      });
    }

    const testCannonBtn = modal.querySelector('#test-cannon-btn');
    if (testCannonBtn) {
      testCannonBtn.addEventListener('click', () => {
        sound.playTankCannon(12, 0);
      });
    }

    const testRadioBtn = modal.querySelector('#test-radio-btn');
    if (testRadioBtn) {
      testRadioBtn.addEventListener('click', () => {
        sound.playRadioBeep(false);
      });
    }

    const bldDestructBtn = modal.querySelector('#settings-bld-destruction-btn');
    if (bldDestructBtn && this.world) {
      bldDestructBtn.addEventListener('click', () => {
        const nextVal = !this.world.buildingDestructionEnabled;
        this.world.setBuildingDestruction(nextVal);
        this.renderSettingsModalContent(modal);
        this.updateBuildingDestructionUI();
        sound.playRadioBeep(true);
      });
    }

    const bhopToggleBtn = modal.querySelector('#settings-bhop-toggle-btn');
    if (bhopToggleBtn && this.player && typeof this.player.toggleBhopEnabled === 'function') {
      bhopToggleBtn.addEventListener('click', () => {
        this.player.toggleBhopEnabled();
        this.renderSettingsModalContent(modal);
        sound.playRadioBeep(true);
      });
    }

    const ffToggleBtn = modal.querySelector('#settings-friendly-fire-btn');
    if (ffToggleBtn && this.player && typeof this.player.toggleFriendlyFire === 'function') {
      ffToggleBtn.addEventListener('click', () => {
        const nextFf = this.player.toggleFriendlyFire();
        this.renderSettingsModalContent(modal);
        this.updateFriendlyFireUI();
        this.addXpNotification?.(
          0,
          nextFf
            ? '⚠️ FRIENDLY FIRE ENABLED: TEAMMATE KILLS DEDUCT $0.10 (10 CENTS)!'
            : '🛡️ FRIENDLY FIRE DISABLED: TEAMMATES PROTECTED'
        );
      });
    }

    const uncappedFpsBtn = modal.querySelector('#settings-uncapped-fps-btn');
    if (uncappedFpsBtn && window.game && typeof window.game.toggleUncappedFps === 'function') {
      uncappedFpsBtn.addEventListener('click', () => {
        const uncapped = window.game.toggleUncappedFps();
        this.renderSettingsModalContent(modal);
        sound.playRadioBeep(true);
        this.addXpNotification?.(
          0,
          uncapped
            ? '🚀 FPS LIMIT REMOVED: UNCAPPED BENCHMARK MODE ACTIVE!'
            : '🖥️ V-SYNC ENABLED: LOCKED TO DISPLAY REFRESH RATE'
        );
      });
    }

    const fpsToggleBtn = modal.querySelector('#settings-fps-toggle-btn');
    if (fpsToggleBtn && typeof this.toggleFpsCounter === 'function') {
      fpsToggleBtn.addEventListener('click', () => {
        this.toggleFpsCounter();
        this.renderSettingsModalContent(modal);
      });
    }

    const airAvoidBtn = modal.querySelector('#settings-air-avoid-btn');
    if (airAvoidBtn && this.player && typeof this.player.toggleAircraftCollisionAvoidance === 'function') {
      airAvoidBtn.addEventListener('click', () => {
        const avoidOn = this.player.toggleAircraftCollisionAvoidance();
        this.renderSettingsModalContent(modal);
        sound.playRadioBeep(true);
        this.addXpNotification?.(
          0,
          avoidOn
            ? '🛡️ AIRCRAFT COLLISION AVOIDANCE: AUTO ON (AUTO PULL-UP OVER GROUND & BUILDINGS)'
            : '💥 AIRCRAFT COLLISION AVOIDANCE: OFF (REALISTIC MODE — PLANES CRASH & EXPLODE ON GROUND/BUILDING IMPACT!)'
        );
      });
    }

    const doctrineBtn = modal.querySelector('#settings-doctrine-btn');
    if (doctrineBtn && this.player && typeof this.player.toggleSquadDoctrineEnabled === 'function') {
      doctrineBtn.addEventListener('click', () => {
        const docOn = this.player.toggleSquadDoctrineEnabled();
        this.renderSettingsModalContent(modal);
        this.updateSquadDoctrineUI();
        sound.playRadioBeep(true);
        this.addXpNotification?.(
          0,
          docOn
            ? '🎖️ SQUAD DOCTRINE: ON (PILOT/ARMOR LICENSES, ENGINEER FORTIFICATIONS & BASE/FOB GUNSMITH ACTIVE)'
            : '🔓 SQUAD DOCTRINE: OFF (ALL CLASSES CAN FLY PLANES, DRIVE TANKS, BUILD WALLS & OPEN GUNSMITH ANYWHERE)'
        );
      });
    }

    modal.querySelectorAll('.settings-bot-count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cnt = Number(btn.dataset.bots || 250);
        if (this.botManager && typeof this.botManager.setBotCountPerSide === 'function') {
          const isSp = !this.network || !this.network.isMultiplayer();
          const playerTeam = isSp ? this.player?.team || 'US' : null;
          this.botManager.setBotCountPerSide(cnt, { playerTeam });
          window.game?.syncMatchTicketsForArmyScale?.(cnt);
          const aiCnt = this.botManager.bots.length;
          const netLbl = this.el('net-label');
          if (netLbl && isSp) {
            netLbl.textContent = `🎮 SINGLEPLAYER • ${1 + aiCnt} PLAYERS (1 YOU + ${aiCnt} AI)`;
          }
          this.renderSettingsModalContent(modal);
          sound.playRadioBeep(true);
          this.addXpNotification?.(
            0,
            isSp
              ? `🪖 BATTLEFIELD SCALED TO ${1 + aiCnt} PLAYERS (1 YOU + ${aiCnt} AI • ${cnt} US VS ${cnt} RU)!`
              : `🪖 AI ARMY SCALED TO ${aiCnt} SOLDIERS (${cnt} US VS ${cnt} RU)!`
          );
        }
      });
    });

    const deathCamBtn = modal.querySelector('#settings-deathcam-btn');
    if (deathCamBtn && this.player && typeof this.player.toggleDeathCamEnabled === 'function') {
      deathCamBtn.addEventListener('click', () => {
        this.player.toggleDeathCamEnabled();
        this.renderSettingsModalContent(modal);
        this.updateDeathCamUI();
      });
    }

    const touchModeBtn = modal.querySelector('#settings-touch-mode-btn');
    if (touchModeBtn && this.mobileTouch) {
      touchModeBtn.addEventListener('click', () => {
        this.mobileTouch.cycleMode();
        this.renderSettingsModalContent(modal);
        sound.playRadioBeep(true);
      });
    }

    const touchSensSlider = modal.querySelector('#touch-sens-slider');
    const touchSensBadge = modal.querySelector('#touch-sens-badge');
    if (touchSensSlider && this.mobileTouch) {
      touchSensSlider.addEventListener('input', () => {
        const applied = this.mobileTouch.setSensitivity(touchSensSlider.value);
        if (touchSensBadge) touchSensBadge.textContent = `${applied}%`;
      });
    }

    const resetBtn = modal.querySelector('#settings-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        sound.resetAudioDefaults();
        if (this.world) this.world.setBuildingDestruction(true);
        if (this.player && typeof this.player.toggleAircraftCollisionAvoidance === 'function') {
          this.player.toggleAircraftCollisionAvoidance(true);
        }
        if (this.player && typeof this.player.setSquadDoctrineEnabled === 'function') {
          this.player.setSquadDoctrineEnabled(true);
        }
        if (this.player && typeof this.player.setDeathCamEnabled === 'function') {
          this.player.setDeathCamEnabled(false);
        }
        this.renderSettingsModalContent(modal);
        this.updateAudioSettingsHud();
        sound.playRadioBeep(true);
      });
    }

    const openManualBtn = modal.querySelector('#settings-open-manual-btn');
    if (openManualBtn) {
      openManualBtn.addEventListener('click', () => {
        this.toggleSettingsModal(false);
        if (typeof this.toggleControlsOverlay === 'function') {
          this.toggleControlsOverlay();
        }
      });
    }

    const closeTopBtn = modal.querySelector('#settings-close-top-btn');
    if (closeTopBtn) {
      closeTopBtn.addEventListener('click', () => {
        this.toggleSettingsModal(false);
      });
    }

    const closeBottomBtn = modal.querySelector('#settings-close-bottom-btn');
    if (closeBottomBtn) {
      closeBottomBtn.addEventListener('click', () => {
        this.toggleSettingsModal(false);
      });
    }
  },
};
