import { sound } from '../audio.js?v=105';

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
    const radioVol = sound.getVolume('radio');
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
        <button type="button" id="settings-close-top-btn" style="background:rgba(231,76,60,0.2);border:1px solid #e74c3c;color:#ff7675;border-radius:4px;padding:5px 12px;font-size:12px;font-weight:900;cursor:pointer;">✕ CLOSE</button>
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
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.3);border-radius:6px;padding:10px 14px;margin-bottom:14px;">
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

      <!-- CATEGORY 7: FPS COUNTER OVERLAY [F2] -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,206,201,0.35);border-left:4px solid #00cec9;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#81ecec;">7. FPS &amp; FRAME-TIME COUNTER [F2]</span>
            <div style="font-size:10px;color:#bdc3c7;">Show or hide the real-time FPS &amp; 1% Low counter pill in the top-right corner.</div>
          </div>
          <button
            type="button"
            id="settings-fps-toggle-btn"
            style="background:${
              this.showFps !== false ? 'rgba(46,204,113,0.25)' : 'rgba(255,255,255,0.08)'
            };border:1px solid ${this.showFps !== false ? '#2ecc71' : 'rgba(255,255,255,0.28)'};color:${
              this.showFps !== false ? '#7bed9f' : '#94a3b8'
            };border-radius:4px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;white-space:nowrap;"
          >
            ${this.showFps !== false ? '⏱ FPS: ON' : '⏱ FPS: OFF'}
          </button>
        </div>
      </div>

      <!-- CATEGORY 8: AIRCRAFT COLLISION AVOIDANCE (DEFAULT: AUTO ON vs. REALISTIC CRASH MODE) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(0,210,211,0.45);border-left:4px solid #00d2d3;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#00d2d3;">8. AIRCRAFT COLLISION AVOIDANCE (DEFAULT: AUTO ON • HOTKEY [G] IN FLIGHT)</span>
            <div style="font-size:10px;color:#bdc3c7;">When set to <b>AUTO ON</b> (default), planes automatically pull up over ground, mountains &amp; buildings for easier flight control. Turn <b>OFF (REALISTIC CRASH MODE)</b> so planes can crash into buildings, mountains, or the ground and explode!</div>
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
            ${airAvoidEnabled ? '🛡️ AUTO ON (EASY FLIGHT)' : '💥 OFF (REALISTIC CRASH)'}
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

      <!-- CATEGORY 10: AI ARMY SCALE (100 - 400 TOTAL AI SOLDIERS) -->
      <div style="background:rgba(16,26,36,0.88);border:1px solid rgba(241,196,15,0.45);border-left:4px solid #f1c40f;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#f1c40f;">10. AI ARMY SIZE PER SIDE (DEFAULT: 125 VS 125 = 250 TOTAL • UP TO 200 VS 200 = 400 TOTAL)</span>
            <div style="font-size:10px;color:#bdc3c7;">Scale battlefield soldier density across the 7,600m theater in real time (equal US &amp; RU headcount).</div>
          </div>
          <div style="display:flex;gap:5px;">
            ${[75, 125, 160, 200]
              .map((cnt) => {
                const curCnt = this.botManager?.currentBotsPerTeam || 125;
                const active = curCnt === cnt;
                return `<button type="button" class="settings-bot-count-btn" data-bots="${cnt}" style="background:${
                  active ? 'rgba(241,196,15,0.28)' : 'rgba(255,255,255,0.08)'
                };border:1px solid ${active ? '#f1c40f' : 'rgba(255,255,255,0.24)'};color:${
                  active ? '#ffeaa7' : '#dfe6e9'
                };border-radius:4px;padding:4px 9px;font-size:11px;font-weight:900;cursor:pointer;">${cnt * 2} AI (${cnt}v${cnt})</button>`;
              })
              .join('')}
          </div>
        </div>
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
        const cnt = Number(btn.dataset.bots || 125);
        if (this.botManager && typeof this.botManager.setBotCountPerSide === 'function') {
          this.botManager.setBotCountPerSide(cnt);
          const netLbl = this.el('net-label');
          if (netLbl && (!this.network || !this.network.connected)) {
            netLbl.textContent = `SINGLEPLAYER (OFFLINE) • ${cnt * 2} AI BOTS`;
          }
          this.renderSettingsModalContent(modal);
          sound.playRadioBeep(true);
          this.addXpNotification?.(0, `🪖 AI ARMY SCALED TO ${cnt * 2} SOLDIERS (${cnt} US VS ${cnt} RU)!`);
        }
      });
    });

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
        this.renderSettingsModalContent(modal);
        this.updateAudioSettingsHud();
        sound.playRadioBeep(true);
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
