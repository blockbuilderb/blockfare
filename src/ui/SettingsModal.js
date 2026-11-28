import { sound } from '../audio.js?v=146';

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
    const isMuted = sound.getVolume('muted');

    const deploySettingsBtn = this.el('deploy-settings-btn');
    if (deploySettingsBtn) {
      deploySettingsBtn.textContent = isMuted ? '🔇 Muted' : '⚙️ Settings';
      deploySettingsBtn.style.borderColor = isMuted ? '#e74c3c' : 'rgba(0, 206, 201, 0.65)';
      deploySettingsBtn.style.color = isMuted ? '#ff7675' : '#81ecec';
    }

    const hudSettingsBtn = this.el('hud-settings-btn');
    if (hudSettingsBtn) {
      hudSettingsBtn.textContent = isMuted ? '🔇' : '⚙️';
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
        ? '🎥 [V] DEATH CAM: ON'
        : '🎥 [V] DEATH CAM: OFF';
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
        ? `⚠️ FF: ON${tkCount > 0 ? ` (-$${penaltyTot.toFixed(2)})` : ''}`
        : '🛡️ FF: OFF';
      ffBtn.classList.toggle('active', enabled);
      ffBtn.style.borderColor = enabled ? '#ff5252' : '#74b9ff';
      ffBtn.style.color = enabled ? '#ff7675' : '#74b9ff';
    }

    const hudFfBtn = this.el('hud-friendly-fire-btn');
    if (hudFfBtn) {
      hudFfBtn.textContent = enabled ? '⚠️ FF: ON' : '🛡️ FF: OFF';
      hudFfBtn.style.color = enabled ? '#ff7675' : '#74b9ff';
    }
  },

  updateBuildingDestructionUI() {
    const destrToggleBtn = this.el('deploy-destruction-toggle-btn');
    const enabled = this.world ? this.world.buildingDestructionEnabled !== false : true;
    if (destrToggleBtn) {
      destrToggleBtn.textContent = enabled ? '💥 Destruction: ON' : '🛡️ Destruction: OFF';
      destrToggleBtn.classList.toggle('active', enabled);
      destrToggleBtn.style.borderColor = enabled ? '#e67e22' : '#74b9ff';
      destrToggleBtn.style.color = enabled ? '#f39c12' : '#74b9ff';
    }
  },

  toggleSettingsModal(forceState) {
    let modal = this.el('settings-modal');

    if (forceState === false) {
      if (modal) {
        modal.remove();
        if (this._domCache) this._domCache.delete('settings-modal');
      }
      return;
    }

    if (forceState === undefined && modal) {
      modal.remove();
      if (this._domCache) this._domCache.delete('settings-modal');
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
        width: min(650px, 94vw); max-height: min(500px, 90vh);
        display: flex; flex-direction: column; overflow: hidden;
        background: rgba(11, 17, 25, 0.98);
        border: 1.5px solid rgba(0, 206, 201, 0.65); border-top: 3px solid #00cec9;
        border-radius: 10px; padding: 12px 16px;
        z-index: 10030; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
        box-shadow: 0 0 0 100vmax rgba(4, 8, 14, 0.7), 0 24px 60px rgba(0, 0, 0, 0.92);
        pointer-events: auto; box-sizing: border-box;
      `;
      document.body.appendChild(modal);
      if (this._domCache) this._domCache.set('settings-modal', modal);
    }

    this.renderSettingsModalContent(modal);
    this.updateAudioSettingsHud();
  },

  renderSettingsModalContent(modal) {
    if (!modal) return;

    const tab = this._settingsActiveTab || 'audio';
    const masterVol = sound.getVolume('master');
    const weaponsVol = sound.getVolume('weapons');
    const explosionsVol = sound.getVolume('explosions');
    const vehiclesVol = sound.getVolume('vehicles');
    const radioVol = sound.getVolume('radio');
    const musicVol = sound.getVolume('music');
    const reverbOn = sound.getVolume('reverbEnabled');
    const isMuted = sound.getVolume('muted');

    const bldDestructEnabled = this.world ? this.world.buildingDestructionEnabled !== false : true;
    const bhopEnabled = this.player ? this.player.bhopEnabled !== false : true;
    const airAvoidEnabled = this.player ? this.player.aircraftCollisionAvoidance !== false : true;
    const squadDoctrineEnabled = this.player ? this.player.squadDoctrineEnabled !== false : true;
    const ffEnabled = Boolean(this.player && this.player.friendlyFireEnabled);
    const deathCamOn = Boolean(this.player?.deathCamEnabled);
    const uncappedFps = window.game?.uncappedFps !== false;
    const showFpsOn = this.showFps !== false;

    const renderSliderCard = (id, label, val, accent = '#00cec9', extraBtnHtml = '') => `
      <div style="background:rgba(16,26,38,0.9);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:6px;">
          <span style="font-size:11.5px;font-weight:900;color:#ecf0f1;">${label}</span>
          <div style="display:flex;align-items:center;gap:5px;">
            ${extraBtnHtml}
            <span id="vol-badge-${id}" style="font-size:11px;font-weight:900;color:${accent};min-width:42px;text-align:right;">${val}%</span>
          </div>
        </div>
        <input id="vol-slider-${id}" type="range" min="0" max="100" step="1" value="${val}" style="width:100%;accent-color:${accent};cursor:pointer;height:5px;" />
      </div>
    `;

    const renderToggleRow = (title, sub, btnId, isOn, onLbl, offLbl, onCol = '#2ecc71') => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(16,25,36,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 10px;">
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:900;color:#ffffff;">${title}</div>
          <div style="font-size:9.5px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sub}</div>
        </div>
        <button type="button" id="${btnId}" style="background:${
      isOn ? `${onCol}33` : 'rgba(255,255,255,0.07)'
    };border:1px solid ${isOn ? onCol : 'rgba(255,255,255,0.22)'};color:${
      isOn ? '#ffffff' : '#94a3b8'
    };border-radius:5px;padding:4.5px 10px;font-size:10.5px;font-weight:900;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          ${isOn ? onLbl : offLbl}
        </button>
      </div>
    `;

    const audioBodyHtml = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="background:rgba(16,28,40,0.94);border:1px solid rgba(241,196,15,0.45);border-radius:7px;padding:9px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
            <span style="font-size:13px;font-weight:900;color:#f1c40f;">🔊 MASTER VOLUME</span>
            <div style="display:flex;align-items:center;gap:5px;">
              ${[10, 50, 80, 100]
                .map(
                  (p) =>
                    `<button type="button" class="vol-preset-btn" data-preset="${p}" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);color:#cbd5e1;border-radius:4px;padding:2px 7px;font-size:9.5px;font-weight:900;cursor:pointer;">${p}%</button>`
                )
                .join('')}
              <span id="vol-badge-master" style="font-size:12px;font-weight:900;color:#ffd32a;min-width:48px;text-align:right;">
                ${isMuted ? 'MUTED' : `${masterVol}%`}
              </span>
              <button type="button" id="settings-mute-btn" style="background:${
                isMuted ? 'rgba(231,76,60,0.3)' : 'rgba(255,255,255,0.08)'
              };border:1px solid ${isMuted ? '#e74c3c' : 'rgba(255,255,255,0.24)'};color:${
                isMuted ? '#ff7675' : '#dfe6e9'
              };border-radius:4px;padding:3px 8px;font-size:10px;font-weight:900;cursor:pointer;">
                ${isMuted ? '🔇 Unmute' : '🔇 Mute'}
              </button>
            </div>
          </div>
          <input id="vol-slider-master" type="range" min="0" max="100" step="1" value="${masterVol}" style="width:100%;accent-color:#f1c40f;cursor:pointer;height:6px;" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
          ${renderSliderCard(
            'weapons',
            '🔫 Weapons Fire',
            weaponsVol,
            '#00cec9',
            `<button type="button" id="test-shot-btn" style="background:rgba(241,196,15,0.18);border:1px solid #f1c40f;color:#ffd32a;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:900;cursor:pointer;">Test</button>`
          )}
          ${renderSliderCard(
            'explosions',
            '💥 Explosions & Armor',
            explosionsVol,
            '#f39c12',
            `<button type="button" id="test-cannon-btn" style="background:rgba(230,126,34,0.2);border:1px solid #e67e22;color:#f39c12;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:900;cursor:pointer;">Test</button>`
          )}
          ${renderSliderCard('vehicles', '🚁 Vehicles & Rotors', vehiclesVol, '#48dbfb')}
          ${renderSliderCard(
            'radio',
            '📻 Squad Radio & UI',
            radioVol,
            '#2ecc71',
            `<button type="button" id="test-radio-btn" style="background:rgba(46,204,113,0.18);border:1px solid #2ecc71;color:#7bed9f;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:900;cursor:pointer;">Test</button>`
          )}
        </div>

        ${renderSliderCard(
          'music',
          '🎵 Adaptive Combat Score',
          musicVol,
          '#9b59b6',
          `<button type="button" id="settings-reverb-btn" style="background:${
            reverbOn ? 'rgba(46,204,113,0.22)' : 'rgba(255,255,255,0.08)'
          };border:1px solid ${reverbOn ? '#2ecc71' : 'rgba(255,255,255,0.22)'};color:${
            reverbOn ? '#7bed9f' : '#94a3b8'
          };border-radius:3px;padding:1px 6px;font-size:9px;font-weight:900;cursor:pointer;">Reverb: ${
            reverbOn ? 'ON' : 'OFF'
          }</button>`
        )}
      </div>
    `;

    const gameplayBodyHtml = `
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${renderToggleRow(
          '🎖️ Squad Role Licenses (Doctrine)',
          'Restricts Jets to Pilots & Tanks to Armor Crew',
          'settings-doctrine-btn',
          squadDoctrineEnabled,
          'ON (Realistic)',
          'OFF (Open Sandbox)',
          '#2ecc71'
        )}
        ${renderToggleRow(
          '💥 Destructible Buildings',
          'Tanks, RPGs & C4 breach walls; repair with [F]',
          'settings-bld-destruction-btn',
          bldDestructEnabled,
          'ON',
          'OFF',
          '#e67e22'
        )}
        ${renderToggleRow(
          '🎥 Death Cam & 3D Shot Trace',
          'Reveal killer position & bullet trajectory [V]',
          'settings-deathcam-btn',
          deathCamOn,
          'ON',
          'OFF (Hardcore)',
          '#ff4757'
        )}
        ${renderToggleRow(
          '⚠️ Friendly Fire',
          '-$0.10 penalty per friendly teamkill',
          'settings-friendly-fire-btn',
          ffEnabled,
          'ON (-10¢/TK)',
          'OFF (Safe)',
          '#ff5252'
        )}
        ${renderToggleRow(
          '🐇 Quake Bunnyhop & Air-Strafe',
          'Hold [Space] for uncapped air momentum',
          'settings-bhop-toggle-btn',
          bhopEnabled,
          'ON',
          'OFF',
          '#2ecc71'
        )}
        ${renderToggleRow(
          '✈️ Aircraft Easy Upright Assist [G]',
          'Auto terrain pull-up vs 360° aerobatics',
          'settings-air-avoid-btn',
          airAvoidEnabled,
          'AUTO ON',
          'OFF (360° Rolls)',
          '#00d2d3'
        )}

        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(16,25,36,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 10px;flex-wrap:wrap;">
          <span style="font-size:11.5px;font-weight:900;color:#f1c40f;">🪖 AI Army Scale</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[75, 125, 175, 250]
              .map((cnt) => {
                const curCnt = this.botManager?.currentBotsPerTeam || 250;
                const active = curCnt === cnt;
                return `<button type="button" class="settings-bot-count-btn" data-bots="${cnt}" style="background:${
                  active ? 'rgba(241,196,15,0.28)' : 'rgba(255,255,255,0.07)'
                };border:1px solid ${active ? '#f1c40f' : 'rgba(255,255,255,0.2)'};color:${
                  active ? '#ffeaa7' : '#cbd5e1'
                };border-radius:4px;padding:3px 8px;font-size:10px;font-weight:900;cursor:pointer;">${
                  cnt * 2
                }P</button>`;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    const controlsBodyHtml = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="background:rgba(16,26,38,0.92);border:1px solid rgba(0,210,211,0.45);border-radius:7px;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
            <div>
              <div style="font-size:12.5px;font-weight:900;color:#81ecec;">📱 Mobile Dual-Thumb Touch HUD</div>
              <div style="font-size:10px;color:#94a3b8;">Left thumb move • Right thumb aim &amp; fire (PUBG / CoD Mobile style)</div>
            </div>
            <button type="button" id="settings-touch-mode-btn" style="background:rgba(0,210,211,0.22);border:1px solid #00d2d3;color:#81ecec;border-radius:5px;padding:5px 10px;font-size:10.5px;font-weight:900;cursor:pointer;white-space:nowrap;">
              TOUCH: ${(this.mobileTouch?.mode || 'auto').toUpperCase()}
            </button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:10.5px;font-weight:800;color:#cbd5e1;">Touch Aim Sensitivity</span>
            <span id="touch-sens-badge" style="font-size:11px;font-weight:900;color:#81ecec;">${
              this.mobileTouch?.touchSensPct || 100
            }%</span>
          </div>
          <input id="touch-sens-slider" type="range" min="25" max="200" step="5" value="${
            this.mobileTouch?.touchSensPct || 100
          }" style="width:100%;accent-color:#00d2d3;cursor:pointer;height:5px;" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button type="button" id="settings-uncapped-fps-btn" style="background:rgba(16,26,38,0.9);border:1px solid ${
            uncappedFps ? '#00d2d3' : 'rgba(255,255,255,0.2)'
          };color:#ecf0f1;border-radius:6px;padding:8px 10px;font-size:11px;font-weight:900;cursor:pointer;">
            ${uncappedFps ? '🚀 Frame Cap: Uncapped' : '🖥️ Frame Cap: V-Sync'}
          </button>
          <button type="button" id="settings-fps-toggle-btn" style="background:rgba(16,26,38,0.9);border:1px solid ${
            showFpsOn ? '#2ecc71' : 'rgba(255,255,255,0.2)'
          };color:#ecf0f1;border-radius:6px;padding:8px 10px;font-size:11px;font-weight:900;cursor:pointer;">
            ⏱ FPS Counter [F2]: ${showFpsOn ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(16,26,38,0.9);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px;">
          <span style="font-size:11.5px;font-weight:900;color:#ffd32a;">🏅 Scoreboard Playstyle Badge</span>
          <select id="settings-playstyle-select" style="background:#091119;color:#ffd32a;border:1px solid rgba(241,196,15,0.5);border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">
            ${[
              ['auto', 'Auto (Live Playstyle)'],
              ['sharpshooter', '🎯 Sharpshooter'],
              ['ace_pilot', '✈️ Ace Pilot'],
              ['tank_buster', '💥 Tank Buster'],
              ['lifesaver', '⚕️ Lifesaver'],
              ['attacker', '⚔️ Attacker'],
              ['defender', '🛡️ Defender']
            ]
              .map(
                ([tid, tlbl]) =>
                  `<option value="${tid}" ${
                    (this.player?.marksmanProfile?.pinnedTitleId || 'auto') === tid ? 'selected' : ''
                  }>${tlbl}</option>`
              )
              .join('')}
          </select>
        </div>

        <button type="button" id="settings-open-manual-btn" style="background:linear-gradient(135deg, rgba(0,210,211,0.22), rgba(9,132,227,0.22));border:1px solid #00d2d3;color:#81ecec;border-radius:6px;padding:9px 12px;font-size:12px;font-weight:900;cursor:pointer;">
          📖 Open Searchable Controls &amp; Flight Manual [? / F1]
        </button>
      </div>
    `;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:8px;margin-bottom:8px;flex-shrink:0;">
        <span style="font-size:16px;font-weight:900;color:#00cec9;letter-spacing:0.8px;">⚙️ SETTINGS</span>
        <button type="button" id="settings-close-top-btn" style="background:rgba(231,76,60,0.22);border:1px solid #e74c3c;color:#ff7675;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:900;cursor:pointer;">✕ Close</button>
      </div>

      <div style="display:flex;gap:5px;margin-bottom:10px;flex-shrink:0;">
        ${[
          { id: 'audio', lbl: '🔊 Audio' },
          { id: 'gameplay', lbl: '🎮 Gameplay' },
          { id: 'controls', lbl: '📱 Controls & Mobile' }
        ]
          .map(
            (t) =>
              `<button type="button" class="settings-tab-btn" data-stab="${t.id}" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid ${
                tab === t.id ? '#00cec9' : 'rgba(255,255,255,0.14)'
              };background:${
                tab === t.id ? 'rgba(0,206,201,0.2)' : 'rgba(16,24,34,0.88)'
              };color:${
                tab === t.id ? '#81ecec' : '#cbd5e1'
              };font-size:11px;font-weight:900;cursor:pointer;">${t.lbl}</button>`
          )
          .join('')}
      </div>

      <div style="flex:1;min-height:0;overflow-y:auto;padding-right:2px;">
        ${tab === 'gameplay' ? gameplayBodyHtml : tab === 'controls' ? controlsBodyHtml : audioBodyHtml}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.1);padding-top:9px;margin-top:9px;flex-shrink:0;">
        <button type="button" id="settings-reset-btn" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.22);color:#cbd5e1;border-radius:5px;padding:5px 12px;font-size:11px;font-weight:800;cursor:pointer;">↺ Reset Defaults</button>
        <button type="button" id="settings-close-bottom-btn" style="background:#00cec9;border:none;color:#081218;border-radius:5px;padding:6px 16px;font-size:11.5px;font-weight:900;cursor:pointer;">✓ Done</button>
      </div>
    `;

    modal.querySelectorAll('.settings-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._settingsActiveTab = btn.dataset.stab || 'audio';
        this.renderSettingsModalContent(modal);
      });
    });

    const masterSlider = modal.querySelector('#vol-slider-master');
    const masterBadge = modal.querySelector('#vol-badge-master');
    const muteBtn = modal.querySelector('#settings-mute-btn');
    const syncMuteUi = () => {
      const muted = sound.getVolume('muted');
      const curMaster = sound.getVolume('master');
      if (masterBadge) masterBadge.textContent = muted ? 'MUTED' : `${curMaster}%`;
      if (muteBtn) muteBtn.textContent = muted ? '🔇 Unmute' : '🔇 Mute';
      this.updateAudioSettingsHud();
    };

    if (masterSlider) {
      masterSlider.addEventListener('input', () => {
        const val = sound.setVolume('master', masterSlider.value);
        if (sound.getVolume('muted') && val > 0) sound.setMuted(false);
        syncMuteUi();
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        sound.toggleMute();
        this.renderSettingsModalContent(modal);
        this.updateAudioSettingsHud();
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

    for (const ch of ['weapons', 'explosions', 'vehicles', 'radio', 'music']) {
      const sl = modal.querySelector(`#vol-slider-${ch}`);
      const bd = modal.querySelector(`#vol-badge-${ch}`);
      if (sl) {
        sl.addEventListener('input', () => {
          const val = sound.setVolume(ch, sl.value);
          if (bd) bd.textContent = `${val}%`;
          this.updateAudioSettingsHud();
        });
      }
    }

    modal.querySelector('#test-shot-btn')?.addEventListener('click', () => {
      sound.playGunshot('rifle', 0, 0, false);
    });
    modal.querySelector('#test-cannon-btn')?.addEventListener('click', () => {
      sound.playTankCannon(12, 0);
    });
    modal.querySelector('#test-radio-btn')?.addEventListener('click', () => {
      sound.playRadioBeep(false);
    });
    modal.querySelector('#settings-reverb-btn')?.addEventListener('click', () => {
      sound.setReverbEnabled?.(!sound.getVolume('reverbEnabled'));
      this.renderSettingsModalContent(modal);
      sound.playRadioBeep(true);
    });

    modal.querySelector('#settings-bld-destruction-btn')?.addEventListener('click', () => {
      if (!this.world) return;
      this.world.setBuildingDestruction(!this.world.buildingDestructionEnabled);
      this.renderSettingsModalContent(modal);
      this.updateBuildingDestructionUI();
      sound.playRadioBeep(true);
    });
    modal.querySelector('#settings-bhop-toggle-btn')?.addEventListener('click', () => {
      this.player?.toggleBhopEnabled?.();
      this.renderSettingsModalContent(modal);
      sound.playRadioBeep(true);
    });
    modal.querySelector('#settings-friendly-fire-btn')?.addEventListener('click', () => {
      this.player?.toggleFriendlyFire?.();
      this.renderSettingsModalContent(modal);
      this.updateFriendlyFireUI();
    });
    modal.querySelector('#settings-uncapped-fps-btn')?.addEventListener('click', () => {
      window.game?.toggleUncappedFps?.();
      this.renderSettingsModalContent(modal);
      sound.playRadioBeep(true);
    });
    modal.querySelector('#settings-fps-toggle-btn')?.addEventListener('click', () => {
      this.toggleFpsCounter?.();
      this.renderSettingsModalContent(modal);
    });
    modal.querySelector('#settings-air-avoid-btn')?.addEventListener('click', () => {
      this.player?.toggleAircraftCollisionAvoidance?.();
      this.renderSettingsModalContent(modal);
      sound.playRadioBeep(true);
    });
    modal.querySelector('#settings-doctrine-btn')?.addEventListener('click', () => {
      this.player?.toggleSquadDoctrineEnabled?.();
      this.renderSettingsModalContent(modal);
      this.updateSquadDoctrineUI();
      sound.playRadioBeep(true);
    });
    modal.querySelector('#settings-deathcam-btn')?.addEventListener('click', () => {
      this.player?.toggleDeathCamEnabled?.();
      this.renderSettingsModalContent(modal);
      this.updateDeathCamUI();
    });

    modal.querySelectorAll('.settings-bot-count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cnt = Number(btn.dataset.bots || 250);
        if (this.botManager && typeof this.botManager.setBotCountPerSide === 'function') {
          const isSp = !this.network || !this.network.isMultiplayer();
          const pTeam = isSp ? this.player?.team || 'US' : null;
          this.botManager.setBotCountPerSide(cnt, { playerTeam: pTeam });
          window.game?.syncMatchTicketsForArmyScale?.(cnt);
          this.renderSettingsModalContent(modal);
          sound.playRadioBeep(true);
        }
      });
    });

    modal.querySelector('#settings-touch-mode-btn')?.addEventListener('click', () => {
      if (!this.mobileTouch) return;
      this.mobileTouch.cycleMode();
      this.renderSettingsModalContent(modal);
      sound.playRadioBeep(true);
    });
    const touchSensSlider = modal.querySelector('#touch-sens-slider');
    const touchSensBadge = modal.querySelector('#touch-sens-badge');
    if (touchSensSlider && this.mobileTouch) {
      touchSensSlider.addEventListener('input', () => {
        const applied = this.mobileTouch.setSensitivity(touchSensSlider.value);
        if (touchSensBadge) touchSensBadge.textContent = `${applied}%`;
      });
    }

    const titleSelEl = modal.querySelector('#settings-playstyle-select');
    if (titleSelEl && this.player) {
      titleSelEl.addEventListener('change', () => {
        if (!this.player.marksmanProfile) this.player.marksmanProfile = {};
        this.player.marksmanProfile.pinnedTitleId = titleSelEl.value || 'auto';
        try {
          localStorage.setItem(
            'bb_marksman_profile_v1',
            JSON.stringify(this.player.marksmanProfile)
          );
        } catch (_) {}
      });
    }

    modal.querySelector('#settings-reset-btn')?.addEventListener('click', () => {
      sound.resetAudioDefaults();
      if (this.world) this.world.setBuildingDestruction(true);
      this.player?.toggleAircraftCollisionAvoidance?.(true);
      this.player?.setSquadDoctrineEnabled?.(true);
      this.player?.setDeathCamEnabled?.(false);
      this.renderSettingsModalContent(modal);
      this.updateAudioSettingsHud();
      sound.playRadioBeep(true);
    });

    modal.querySelector('#settings-open-manual-btn')?.addEventListener('click', () => {
      this.toggleSettingsModal(false);
      this.toggleControlsOverlay?.();
    });
    modal.querySelector('#settings-close-top-btn')?.addEventListener('click', () => {
      this.toggleSettingsModal(false);
    });
    modal.querySelector('#settings-close-bottom-btn')?.addEventListener('click', () => {
      this.toggleSettingsModal(false);
    });
  }
};
