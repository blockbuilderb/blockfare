import { UI, getEraRoles } from '../config.js?v=126';
import { isMacPlatform, getShortOrderModifierLabel } from '../utils/KeyboardShortcuts.js?v=126';

export const HudRenderer = {
  _setText(el, str) {
    if (!el) return;
    const s = String(str);
    if (el._lastText !== s) {
      el._lastText = s;
      el.textContent = s;
    }
  },

  _setDisplay(el, val) {
    if (!el) return;
    if (el._lastDisplay !== val) {
      el._lastDisplay = val;
      el.style.display = val;
    }
  },

  _setWidth(el, widthStr) {
    if (!el) return;
    if (el._lastWidth !== widthStr) {
      el._lastWidth = widthStr;
      el.style.width = widthStr;
    }
  },

  toggleFpsCounter(forceState) {
    this.showFps = typeof forceState === 'boolean' ? forceState : !this.showFps;
    if (this.fpsPillEl) {
      this.fpsPillEl.classList.toggle('hidden', !this.showFps);
    }
    if (this.hudFpsToggleEl) {
      this.hudFpsToggleEl.textContent = `[F2] Show FPS: ${this.showFps ? 'ON' : 'OFF'}`;
      this.hudFpsToggleEl.style.color = this.showFps ? '#2ecc71' : '#7bed9f';
    }
    if (this.deployFpsToggleBtn) {
      this.deployFpsToggleBtn.textContent = `⏱ [F2] SHOW FPS: ${this.showFps ? 'ON' : 'OFF'}`;
      this.deployFpsToggleBtn.classList.toggle('active', this.showFps);
    }
    if (!this.player.dead) {
      this.addXpNotification(0, `⏱ FPS COUNTER: ${this.showFps ? 'ON' : 'OFF'}`);
    }
    return this.showFps;
  },

  updateFpsMetrics(rawDt) {
    // Uncapped Benchmark FPS Measurement (no 1,000 FPS / 1.0ms artificial clamp!):
    // Counts exact rendered frames across a 0.20s wall-clock window for rock-steady readings from 15 FPS up to 5,000+ FPS.
    const safeDt = Math.max(0.00002, Math.min(0.25, rawDt || 0.0167));
    this._fpsWinFrames = (this._fpsWinFrames || 0) + 1;
    this._fpsWinTime = (this._fpsWinTime || 0) + safeDt;

    if (this._fpsWinTime < 0.2) return;

    const windowFps = this._fpsWinFrames / this._fpsWinTime;
    const windowMs = (this._fpsWinTime / this._fpsWinFrames) * 1000;
    this._fpsWinFrames = 0;
    this._fpsWinTime = 0;

    this.fpsSmoothed = this.fpsSmoothed * 0.55 + windowFps * 0.45;
    this.frameMsSmoothed = this.frameMsSmoothed * 0.55 + windowMs * 0.45;
    this.frameHistory.push(windowFps);
    if (this.frameHistory.length > 30) {
      this.frameHistory.shift();
    }

    if (!this.showFps || !this.fpsPillEl) return;

    const avgFps = Math.round(this.fpsSmoothed);
    const msStr =
      this.frameMsSmoothed < 10
        ? `${this.frameMsSmoothed.toFixed(2)} ms`
        : `${this.frameMsSmoothed.toFixed(1)} ms`;
    const sorted = [...this.frameHistory].sort((a, b) => a - b);
    const lowFps = Math.round(sorted[Math.max(0, Math.floor(sorted.length * 0.1))] || avgFps);
    const isUncapped = typeof window !== 'undefined' && window.game ? window.game.uncappedFps !== false : true;

    if (this.fpsValEl) this.fpsValEl.textContent = String(avgFps);
    if (this.fpsMsValEl) this.fpsMsValEl.textContent = msStr;
    if (this.fpsLowValEl) {
      this.fpsLowValEl.textContent = `LOW: ${lowFps} • ${isUncapped ? 'MAX' : 'VSYNC'}`;
    }

    this.fpsPillEl.classList.toggle('fps-warn', avgFps >= 30 && avgFps < 50);
    this.fpsPillEl.classList.toggle('fps-low', avgFps < 30);
  },

  toggleControlsHelp(initialTab = null) {
    return this.toggleControlsOverlay(initialTab);
  },

  // Comprehensive Searchable 6-Tab Field & Flight Operations Manual [? / F1]
  toggleControlsOverlay(initialTab = null) {
    let el = this.el('controls-overlay');
    if (el) {
      el.remove();
      if (this._domCache) this._domCache.delete('controls-overlay');
      if (!initialTab) return;
    }
    if (typeof document !== 'undefined' && document.pointerLockElement && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }

    const defaultTab =
      initialTab ||
      (this.player?.activeVehicle?.aircraftRole === 'gunship'
        ? 'ac130'
        : this.player?.activeVehicle?.isAircraft
        ? 'jets'
        : this.player?.activeVehicle
        ? 'armor'
        : 'infantry');

    el = document.createElement('div');
    el.id = 'controls-overlay';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: linear-gradient(180deg, rgba(9,15,23,0.985), rgba(5,9,14,0.995));
      border: 1.5px solid rgba(0,210,211,0.7); border-top: 3px solid #00d2d3;
      border-radius: 10px; padding: 16px 20px; z-index: 10020;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
      width: min(880px, 95vw); max-height: 89vh; overflow-y: auto;
      font-size: 12.8px; line-height: 1.5; pointer-events: auto;
      box-shadow: 0 22px 64px rgba(0,0,0,0.94), 0 0 28px rgba(0,210,211,0.16);
    `;

    const isMac = isMacPlatform();
    const modShort = getShortOrderModifierLabel(isMac);
    const macOrdersLabel = isMac
      ? '[⌥ / ⌃ + 1..5, F, H, C, G, R]'
      : `[${modShort} + 1..5, F, H, C, G, R] (Mac: ⌥/⌃)`;

    const manualCatalog = [
      {
        id: 'quickstart',
        lbl: '⚡ HUD & BASICS',
        bannerColor: '#00d2d3',
        bannerBg: 'rgba(0,210,211,0.1)',
        bannerHtml:
          '<b style="color:#00d2d3;">⚡ HUD SYMBOLS, 3-PILLAR ECONOMY &amp; DAMAGE GUIDE:</b> Everything on your screen explained at a glance — from Aircraft HUD circles to Main Base spawns and localized trauma.',
        groups: [
          {
            title: '🎯 AIRCRAFT & TANK HUD SYMBOLS',
            items: [
              ['Cyan + Circle (Jets)', 'Aircraft Nose / Seeker Aim Cursor — steers flight path & locks A2A missiles'],
              ['Green ⊕ IMPACT Circle', 'Gravity-compensated ground impact pipper (GUN / ROCKET / BOMB CCIP) — put green ⊕ on target!'],
              ['3D Ground Ring (Bombs)', 'Appears on terrain ONLY in Bomb mode ([3]) when bomb arc intersects ground'],
              ['Lead Circle (Dogfight)', 'Computed lead pipper ahead of moving enemy aircraft — aim rotary cannon here'],
              ['Tank Hull vs. View Dial', 'Bottom-right gauge shows Hull armor facing vs. 360° independent Turret aim']
            ]
          },
          {
            title: '💰 ECONOMY & ANATOMY PAPER-DOLLS',
            items: [
              ['$0 FREE HQ Pool', 'Main Base Jets (Pilot), Tanks/IFVs (Armor Crew) & HQ Bikes deploy FREE ($0)'],
              ['⚡ Match Cash', 'Earned via kills, captures, revives & resupplies — buys frontline vehicle/CAS drops'],
              ['🏦 Armory Bank', 'Persistent career bank — unlocks permanent Gunsmith optics, weapons & Hangar mods [L]'],
              ['6-Zone Soldier Doll', 'Head, Thorax, L/R Arms (+sway/reload penalty) & L/R Legs (limp) — Hold [H] to splint!'],
              ['6-Zone Airframe Doll', 'Avionics, Cockpit, L/R Wings, Engines & Tail — repair via [X] ECM (+22%) or <45m HQ pass']
            ]
          }
        ]
      },
      {
        id: 'infantry',
        lbl: '🪖 INFANTRY & MED',
        bannerColor: '#7bed9f',
        bannerBg: 'rgba(46,204,113,0.1)',
        bannerHtml:
          '<b style="color:#7bed9f;">🪖 INFANTRY COMBAT, OPTICS, MEDICAL TRAUMA &amp; LOOT:</b> Customize scopes across multiple rifles in <b>[L] Armory</b> (at Base, Friendly FOBs, or <b>[7]</b> Stashes) and splint limb fractures with <b>Hold [H]</b>.',
        groups: [
          {
            title: '🏃 MOVEMENT, GUNPLAY & OPTICS',
            items: [
              ['WASD + Shift', 'Move & Tactical Sprint'],
              ['Space / C / Z', 'Jump & Ledge Vault / Toggle Crouch / Toggle Prone'],
              ['Tap Q / RMB + E', '3D Tactical Ping (Tap Q) • Lean Left (Hold Q) / Lean Right (RMB + E)'],
              ['LMB / RMB / Shift', 'Fire Weapon / ADS Scope / Hold Breath (steadies sniper sway)'],
              ['[V] Key', 'Toggle Variable Scope Zoom (1x ⇄ 4x/6x/12x), Canted Red-Dot, or Weapon Inspect'],
              ['[X] / [N] Keys', 'Cycle Scope Zeroing (100m–400m) / Toggle NVG or Thermal Scope Polarity (WHOT/BHOT)'],
              ['[R] / 2× [R] / [P]', 'Tactical Mag Swap / Emergency Speed-Drop Reload / Tarkov Bullet-by-Bullet Mag Pack']
            ]
          },
          {
            title: '🩺 MEDICAL, LOOTING & CLASS GADGETS',
            items: [
              ['Hold [H]', 'Bandage Heavy Bleed & Splint Arm/Leg Fractures (restores aim & sprint)'],
              ['Hold [F] / [E]', 'Revive Downed Teammate (Medic 2× speed) / Drag Downed Ally to Cover or Board Vehicle'],
              ['Tap [F] / Hold [F]', 'Quick Auto-Loot Body or Resupply / Open Side-by-Side Loot Grid'],
              ['[I] / [L] Keys', '2D Tactical Backpack Grid / Open Gunsmith & Hangar (+ ⚡ ALL GUNS scope buy)'],
              ['[1–4] / [G]', 'Primary, Sidearm, Launcher ([3] toggles RPG-7 ⇄ Stinger AA on Engineer!), C4/Hammer / Frag'],
              ['[5] / [6] / [7] / [8]', 'SL Rally [5] • Recon Beacon [6] • Ammo & Kit Stash [7] • Build Bunker/Emplacement [8]'],
              ['[F] / [T] / [B]', 'Engineer Quick Chest Wall [F] • Cycle Fortification Blueprint [T] • Build Menu [B]'],
              ['[0] / [Shift+0]', 'Deliver Recon Dirt Bike ($250) / 4×4 Quad ATV ($350) 5m ahead (Free at Main Base)'],
              ['[Shift+1..7] / [F5–F11]', 'Instant Field Role Swap at Base, Friendly FOB, or [7] Stash ([Shift+7] = Pilot)']
            ]
          }
        ]
      },
      {
        id: 'armor',
        lbl: '🛡️ TANKS & BIKES',
        bannerColor: '#f1c40f',
        bannerBg: 'rgba(241,196,15,0.1)',
        bannerHtml:
          '<b style="color:#f1c40f;">🛡️ MAIN BATTLE TANKS, 8×8 IFVs, SPAAG AA &amp; BIKES:</b> Slot <b>[1]</b> fires hyper-velocity <b>780 m/s APFSDS Sabot</b> darts, while Slot <b>[3]</b> launches crosshair-guided <b>TOW-2B / Kornet / Refleks ATGMs</b>!',
        groups: [
          {
            title: '💥 3-SLOT ARMOR WEAPONS & OPTICS',
            items: [
              ['[W / A / S / D] + Mouse', 'Drive & Angle Hull Armor independently of 360° Stabilized Turret Aim'],
              ['[1] + LMB', 'Hyper-Velocity 120mm/125mm APFSDS Sabot (780 m/s flat) or 30mm Autocannon (460 m/s)'],
              ['[2] or [Space]', '7.62mm Coaxial MG (Infantry suppression) • Homing Stinger/9M311 SAM on SPAAG AA'],
              ['[3] + LMB', 'SACLOS Guided ATGM (TOW-2B / Kornet / 9M119M Refleks) — keep crosshair on target to steer!'],
              ['[Q] or Mouse Wheel', 'Quick-cycle Vehicle Weapon Slots ([1] ⇄ [2] ⇄ [3])'],
              ['[RMB] / [C] Key', 'Magnified FCS Gunner Zoom / Cycle 3P Chase ⇄ 1P Hatch ⇄ Bore-Sight Optic'],
              ['[N] / [X] Keys', 'Cycle Crew NVG & CITV WHOT/BHOT Thermal / Pop 360° IR Smoke & Trophy APS Shield']
            ]
          },
          {
            title: '👥 MULTI-CREW SEATS, REARM & BIKES',
            items: [
              ['[F1] / [F2] / [F3] / [F4]', 'Switch Seat: [F1] Driver • [F2] Gunner • [F3] +60° Roof .50 CROWS/Kord RWS • [F4] Pax'],
              ['[R] Key (In Vehicle)', 'Check Rearm Status • Auto-rearms & repairs at HQ Motor Pool, Friendly FOBs & [7] Stashes'],
              ['[L] / [E] Keys', 'Open Armor Upgrade Bay (CITV FLIR, ERA, Trophy APS, Dozer) / Enter & Exit Vehicle'],
              ['[Space] / [X] (Bikes)', 'Motorcycle & 4×4 ATV Wheelie / Overdrive Torque Boost (6-Speed & 2-Stroke Powerband)']
            ]
          }
        ]
      },
      {
        id: 'jets',
        lbl: '✈️ JETS & B-2',
        bannerColor: '#48dbfb',
        bannerBg: 'rgba(72,219,251,0.1)',
        bannerHtml:
          '<b style="color:#48dbfb;">✈️ TWO-TIER FLIGHT ENVELOPE ([G] KEY):</b> Default <b>[G] AUTO ON</b> gives beginners smooth upright banked turns &amp; terrain pull-up (cannot flip upside-down). Toggle <b>[G] OFF</b> to unlock full <b>360° Barrel Rolls, Vertical Loops &amp; Upside-Down Flight</b>!',
        groups: [
          {
            title: '🕹️ FLIGHT CONTROLS & TWO-TIER ENVELOPE',
            items: [
              ['[W] / [S] Keys', '≤35% Throttle = Runway Taxi Mode • >38% = Takeoff/Afterburner • Hold [S] at 0 km/h = Tug Pushback / C-130 Reverse'],
              ['Mouse + [A / D] ([G] ON)', 'Easy Mode (Default): Smooth upright coordinated banked turns (capped at 58°, auto-levels)'],
              ['[G] Key Toggle', 'Switch Easy Upright Assist (AUTO ON) ⇄ Advanced 360° Aerobatics & Realistic Crash (OFF)'],
              ['[A / D] & [↑ / ↓] ([G] OFF)', 'Advanced Mode: Full 360° Aileron Rolls, Loops & Sustained Upside-Down Flight (release >117°)!'],
              ['Hold [ALT]', 'Decoupled Free-Look Around / Straight Down while plane auto-levels at current altitude'],
              ['[R] Key (Universal AP)', 'On Runway: Auto-Takeoff • Low Approach: ILS Auto-Land • Mid-Air: LAAP Level-Hold Autopilot!'],
              ['[F] Key', 'Toggle Sight Stabilization (◆ TGP SPI) locking camera & Mavericks onto ground target']
            ]
          },
          {
            title: '🚀 AIR WEAPONS, SENSORS & SURVIVABILITY',
            items: [
              ['[1] + LMB', '20mm M61 Vulcan / 30mm GAU-8 Avenger Rotary Cannon (aim at Dogfight Lead or Green ⊕)'],
              ['[2] or [Space] (Fighter)', 'AIM-120D / R-77M FOX-3 Shoot-and-Forget A2A Missile (~1.1s cone lock or 10° boresight)'],
              ['[2] (A-10C / B-2A)', 'Hydra-70 / S-8 Rocket Pod Salvo (A-10C) • Precision 2,000lb GBU-31 JDAM (B-2A)'],
              ['[3] + LMB / [Space]', 'Drop JDAM / GBU-28 onto 3D Bomb Ring, fire AGM-65 Maverick, or B-2 GBU-57 MOP'],
              ['[C] / [RMB] / [N]', 'Cycle 3P Chase ⇄ 1P Bubble Canopy ⇄ Nose TGP / Telephoto Zoom / NVG & WHOT/BHOT FLIR'],
              ['[X] / [E] Keys', 'Deploy IR Flares + +22% ECM Patch (or B-2 RAM Cloak) / Zero-Zero Eject + Parachute'],
              ['HQ Runway Pit-Stop', 'Land & park on HQ Runway (~4s) to replace damaged Wings/Engines/Radar & 100% Rearm (or <45m low-pass)']
            ]
          }
        ]
      },
      {
        id: 'ac130',
        lbl: '🛸 AC-130 GUNSHIP',
        bannerColor: '#a29bfe',
        bannerBg: 'rgba(162,155,254,0.12)',
        bannerHtml:
          '<b style="color:#a29bfe;">🛸 AC-130 GUNSHIP (1968 VIETNAM ➔ 2024 GHOSTRIDER):</b> All 3 heavy cannons fire strictly out the <b>LEFT (PORT)</b> fuselage! Press <b>[R]</b> to switch between straight <b>Transit Flight</b> and banking in a left-hand <b>Pylon Orbit</b>.',
        groups: [
          {
            title: '🔄 PYLON ORBIT, ALTITUDE & NAVIGATION',
            items: [
              ['[R] Key (Universal AP)', 'Runway: Auto-Takeoff • Low Approach: ILS Auto-Land • Airspace: Curved Tangent Entry ⇄ Pylon Orbit!'],
              ['[F] Key (Orbit)', 'Snap & Lock GPS Pylon Orbit Anchor anywhere on the map (zero geo-fence)'],
              ['[W / A / S / D] (Orbit)', 'Slide GPS Pylon Orbit Circle across the battlefield (Manual Bank in 1968 Era)'],
              ['[Q / Z] or [↑ / ↓] / [- / +]', 'Climb / Descend Loiter Altitude (180m – 1,800m AGL; scales orbit circle & slant range)'],
              ['[ [ ] / [ ] ] Brackets', 'Tighten or Widen Pylon Orbit Radius manually']
            ]
          },
          {
            title: '💥 PORT CANNONS, ZOOM & HANGAR TECH',
            items: [
              ['[1] + LMB', '25mm GAU-12 Equalizer Gatling Cannon (High-ROF anti-infantry & light vehicles)'],
              ['[2] + LMB', '40mm L/60 Bofors HE-Frag Autocannon (Precision splash & structure destruction)'],
              ['[3] or [Space]', '105mm M102 Heavy Howitzer (Massive blast radius vs. armor & bunkers)'],
              ['Mouse Wheel / [RMB]', 'Continuous 1.1×–8.0× Optical Zoom / Quick Zoom Toggle'],
              ['[C] / [N] / [L] Keys', 'Left-Window HUD ⇄ Belly FLIR ⇄ 3P / Day-WHOT-BHOT-NVG / [L] Hangar Era Upgrades'],
              ['[X] / [E] Keys', 'Angel-Wing Flare Salvo & ECM Repair / Parachute Eject']
            ]
          }
        ]
      },
      {
        id: 'command',
        lbl: '★ COMMAND & ERAS',
        bannerColor: '#ff9f43',
        bannerBg: 'rgba(255,159,67,0.1)',
        bannerHtml:
          '<b style="color:#ff9f43;">★ 12+ SPECIALIZED SQUADS, CUSTOM SQUAD CREATOR, MEDIEVAL &amp; JURASSIC ERAS:</b> Join Specialized Infantry (9P), Armor (4P), Air Wing (4P), or Recon (6P) squads — or click <b>➕ Create Squad</b> on Deploy!',
        groups: [
          {
            title: '📡 TACTICAL MAP, CAS & SQUAD ORDERS',
            items: [
              ['[K] or [CapsLock]', 'Open Interactive Tactical Map, Squad Roster & Right-Click Precision Airstrike'],
              ['Hold [Y] (+ 1..8)', 'Open Radial Command Wheel (Attack A–E, Follow, Defend, Scope, Spacing)'],
              [macOrdersLabel, 'Direct Orders: [1–5] Obj A–E • [F] Follow • [H] Defend • [C] Charge • [G] Garrison • [R] Retreat'],
              ['[- / =] (Minus / Plus)', 'Squad Spacing: Stay Close [- ] vs. Fan Out Wide [=]'],
              ['[U] / [J] / [Shift+J]', 'Launch MQ-9 UAV Scan [U] • Call CAS/Artillery at Crosshair [J] • Cycle Strike Type [Shift+J]'],
              ['[9] / [Shift+9]', 'Request Combat Aircraft / Heavy Armor Drop [9] • Cycle Requested Vehicle [Shift+9]']
            ]
          },
          {
            title: '⚔️ MEDIEVAL, 🦖 JURASSIC & ⚙️ SYSTEM KEYS',
            items: [
              ['Mouse Dir + RMB / LMB', 'Medieval 4-Directional Mount & Blade Sword/Shield Parry (RMB) & Riposte/Shield Bash (LMB)'],
              ['[V] (Bows) / [G] (Siege)', 'Toggle Lit Fire Arrows [V] • Call Men to Crew Counterweight Trebuchet [G]'],
              ['Warhorse & Dino Mounts', '[E] Mount Warhorse ([1] Bow, [2] Couched Lance), Alpha T-Rex (Jaw Crush) or Raptor'],
              ['[O] / [M] / [Tab]', 'Multiplayer Room Lobby [O] • Redeploy / Change Class [M] • Live Scoreboard [Tab]'],
              ['[? / F1] / [F2] / [F3]', 'Open/Close This Manual [? / F1] • FPS Counter [F2] • Live Battle Telemetry [F3]'],
              ['Mac Vehicle Seats', 'No-Fn Mac Seat Chords: [⌥/Alt+P] Seat 2 • [⌥/Alt+`] Seat 3 • [Shift+L] Cycle']
            ]
          }
        ]
      }
    ];

    let activeTab = manualCatalog.some((s) => s.id === defaultTab) ? defaultTab : 'infantry';
    let searchQuery = '';

    const escapeHtml = (str) =>
      String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const renderSectionCard = (sec, qLower) => {
      const filteredGroups = [];
      for (const grp of sec.groups) {
        const matchedItems = qLower
          ? grp.items.filter(
              ([k, d]) =>
                k.toLowerCase().includes(qLower) ||
                d.toLowerCase().includes(qLower) ||
                grp.title.toLowerCase().includes(qLower) ||
                sec.lbl.toLowerCase().includes(qLower)
            )
          : grp.items;
        if (matchedItems.length > 0) {
          filteredGroups.push({ title: grp.title, items: matchedItems });
        }
      }
      if (filteredGroups.length === 0) return '';

      return `
        <div class="manual-sec-block" style="margin-bottom:12px;">
          ${
            !qLower
              ? `<div style="background:${sec.bannerBg};border:1px solid ${sec.bannerColor}66;border-left:4px solid ${sec.bannerColor};border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12.2px;">${sec.bannerHtml}</div>`
              : `<div style="font-size:12px;font-weight:900;color:${sec.bannerColor};letter-spacing:1px;margin:8px 0 6px 0;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px;">${sec.lbl}</div>`
          }
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:10px;">
            ${filteredGroups
              .map(
                (grp) => `
              <div style="background:rgba(14,23,34,0.88);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:9px 12px;">
                <div style="font-size:11.5px;font-weight:900;color:${sec.bannerColor};letter-spacing:0.8px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;">${grp.title}</div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                  ${grp.items
                    .map(
                      ([keyLbl, desc]) => `
                    <div style="display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:1.38;">
                      <kbd style="background:rgba(0,210,211,0.13);border:1px solid rgba(0,210,211,0.42);color:#81ecec;border-radius:4px;padding:1px 6px;font-family:Consolas,monospace;font-size:11px;font-weight:900;white-space:nowrap;flex-shrink:0;">${escapeHtml(keyLbl)}</kbd>
                      <span style="color:#dfe6e9;">${escapeHtml(desc)}</span>
                    </div>`
                    )
                    .join('')}
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>
      `;
    };

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap;border-bottom:1px solid rgba(0,210,211,0.28);padding-bottom:9px;">
        <div>
          <div style="font-size:18px;font-weight:900;color:#00d2d3;letter-spacing:1.3px;">📖 BLOCKFARE FIELD &amp; FLIGHT OPERATIONS MANUAL</div>
          <div style="font-size:11px;color:#94a3b8;font-weight:700;">Press <b>[?]</b> or <b>[F1]</b> anytime in-game or on the Deploy Screen &bull; Press <b>[ESC]</b> to close</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input id="manual-search-input" type="text" placeholder="🔍 Filter keys, weapons, vehicles..." style="background:#070d14;color:#fff;border:1px solid rgba(0,210,211,0.5);border-radius:5px;padding:5px 10px;font-size:12px;font-weight:700;width:230px;outline:none;" />
          <button type="button" id="manual-close-btn" style="background:#e74c3c;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-size:11.5px;font-weight:900;cursor:pointer;">✕ CLOSE [ESC]</button>
        </div>
      </div>
      <div id="manual-tabs-row" style="display:flex;gap:5px;margin-bottom:11px;flex-wrap:wrap;"></div>
      <div id="manual-body-content"></div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.09);color:#94a3b8;font-size:11px;text-align:center;">
        Tip: In Aircraft, press <b>[G]</b> to switch between <b>Easy Upright Flight (AUTO ON)</b> and <b>Advanced 360° Aerobatics &amp; Upside-Down Flight (OFF)</b>!
      </div>
    `;

    const tabsRowEl = el.querySelector('#manual-tabs-row');
    const bodyEl = el.querySelector('#manual-body-content');
    const searchInputEl = el.querySelector('#manual-search-input');

    const updateManualView = () => {
      const q = searchQuery.trim().toLowerCase();
      const allTabs = [...manualCatalog, { id: 'all', lbl: '📋 ALL CONTROLS' }];
      if (tabsRowEl) {
        tabsRowEl.innerHTML = allTabs
          .map((t) => {
            const isSel = !q && activeTab === t.id;
            return `<button type="button" class="manual-tab-btn" data-mtab="${t.id}" style="flex:1;min-width:112px;padding:5px 7px;border-radius:5px;border:1.5px solid ${
              isSel ? '#00d2d3' : 'rgba(255,255,255,0.15)'
            };background:${
              isSel ? 'rgba(0,210,211,0.22)' : 'rgba(15,24,34,0.92)'
            };color:${
              isSel ? '#81ecec' : '#cbd5e1'
            };font-size:11px;font-weight:900;cursor:pointer;">${t.lbl}</button>`;
          })
          .join('');
        tabsRowEl.querySelectorAll('.manual-tab-btn').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            activeTab = btn.dataset.mtab;
            if (searchInputEl && searchQuery) {
              searchQuery = '';
              searchInputEl.value = '';
            }
            updateManualView();
          });
        });
      }

      if (!bodyEl) return;
      if (q) {
        const htmlBlocks = manualCatalog.map((sec) => renderSectionCard(sec, q)).filter(Boolean);
        bodyEl.innerHTML =
          htmlBlocks.length > 0
            ? htmlBlocks.join('')
            : `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">No controls matched "<b>${escapeHtml(
                searchQuery
              )}</b>". Click any tab above or clear the search box.</div>`;
      } else if (activeTab === 'all') {
        bodyEl.innerHTML = manualCatalog.map((sec) => renderSectionCard(sec, '')).join('');
      } else {
        const sec = manualCatalog.find((s) => s.id === activeTab) || manualCatalog[1];
        bodyEl.innerHTML = renderSectionCard(sec, '');
      }
    };

    if (searchInputEl) {
      searchInputEl.addEventListener('input', (ev) => {
        ev.stopPropagation();
        searchQuery = searchInputEl.value || '';
        updateManualView();
      });
      searchInputEl.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.code === 'Escape') {
          if (searchInputEl.value) {
            searchInputEl.value = '';
            searchQuery = '';
            updateManualView();
          } else {
            el.remove();
            if (this._domCache) this._domCache.delete('controls-overlay');
          }
        }
      });
    }

    el.querySelector('#manual-close-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      el.remove();
      if (this._domCache) this._domCache.delete('controls-overlay');
    });

    updateManualView();
    document.body.appendChild(el);
    if (this._domCache) this._domCache.set('controls-overlay', el);
  },

  showHitmarker(type = 'normal', label = 'HIT', durationSec = null) {
    this.hitmarkerEl.classList.remove('hidden', 'headshot', 'armor', 'kill');
    if (type === 'headshot') this.hitmarkerEl.classList.add('headshot');
    else if (type === 'armor') this.hitmarkerEl.classList.add('armor');
    else if (type === 'kill') this.hitmarkerEl.classList.add('kill');
    if (this.hitConfirmTagEl) {
      this.hitConfirmTagEl.textContent = label;
    }
    const isBdaTag =
      typeof label === 'string' &&
      (label.includes('TO GO') || label.includes('DESTROYED') || label.includes('RICOCHET'));
    this.hitmarkerTimer =
      typeof durationSec === 'number'
        ? durationSec
        : isBdaTag
        ? 0.95
        : type === 'kill'
        ? 0.38
        : 0.22;
  },

  addTicketEvent(team, delta, category, label) {
    if (!this.ticketEventFeedEl) return;
    const pill = document.createElement('div');
    pill.className = 'ticket-event-pill';
    const isGain = delta > 0;
    const sign = isGain ? '+' : '';
    const borderCol = isGain
      ? '#2ecc71'
      : category === 'PLANE'
      ? '#00d2d3'
      : category === 'TANK' || category === 'ARMOR'
      ? '#e67e22'
      : category === 'CAR'
      ? '#f1c40f'
      : team === 'US'
      ? '#5dade2'
      : '#ec7063';
    const teamCol = team === 'US' ? '#70bdff' : '#ff7878';
    const deltaCol = isGain ? '#2ecc71' : '#ff9f43';
    pill.style.borderLeftColor = borderCol;
    pill.innerHTML = `<span style="color:${teamCol}">${team}</span> <strong style="color:${deltaCol}">${sign}${delta} 🎟️</strong> <span style="color:#dfe6e9">&bull; ${label}</span>`;
    this.ticketEventFeedEl.prepend(pill);

    while (this.ticketEventFeedEl.children.length > 3) {
      this.ticketEventFeedEl.removeChild(this.ticketEventFeedEl.lastChild);
    }

    setTimeout(() => {
      if (pill.parentNode) pill.parentNode.removeChild(pill);
    }, 3400);
  },

  addXpNotification(points, reason) {
    const item = document.createElement('div');
    item.className = 'xp-item';
    const ptsHtml = points > 0 ? `<span class="xp-pts">+${points} XP</span>` : '';
    item.innerHTML = `${ptsHtml}<span>${reason}</span>`;
    this.xpFeedEl.prepend(item);

    while (this.xpFeedEl.children.length > 5) {
      this.xpFeedEl.removeChild(this.xpFeedEl.lastChild);
    }

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 3200);
  },

  // Kill Streak / Multi-Kill Announcement (Battlefield-style center screen text)
  showKillStreakAnnouncement(text) {
    let el = this.el('kill-streak-announcement');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kill-streak-announcement';
      el.style.cssText = `
        position: fixed; top: 28%; left: 50%; transform: translateX(-50%);
        font-size: 32px; font-weight: 900; color: #f39c12;
        text-shadow: 0 0 20px rgba(243,156,18,0.8), 0 2px 8px rgba(0,0,0,0.9);
        letter-spacing: 4px; font-family: 'Rajdhani', sans-serif;
        pointer-events: none; z-index: 9999; opacity: 0;
        transition: opacity 0.15s ease-out, transform 0.3s ease-out;
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('kill-streak-announcement', el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) scale(1.15)';
    setTimeout(() => {
      el.style.transform = 'translateX(-50%) scale(1.0)';
    }, 150);
    setTimeout(() => {
      el.style.opacity = '0';
    }, 2200);
  },

  updateTelemetryPanel(force = false) {
    if (
      !this.telemetryPanelEl ||
      this.telemetryPanelEl.classList.contains('hidden') ||
      this.telemetryPanelEl.style.display === 'none' ||
      !this.telemetry
    ) {
      return;
    }
    const now = performance.now();
    if (!force && this._lastTelemUiAt && now - this._lastTelemUiAt < 250) {
      return;
    }
    this._lastTelemUiAt = now;
    const snap = this.telemetry.buildSnapshot();
    if (!snap) return;

    const d = snap.diagnostics;
    const usContested = snap.mainBases && snap.mainBases.US && snap.mainBases.US.contested;
    const ruContested = snap.mainBases && snap.mainBases.RU && snap.mainBases.RU.contested;
    const contestedFlags = snap.flags.filter((f) => f.contested).map((f) => f.id);
    const contestedList = [
      ...(usContested ? ['US_BASE'] : []),
      ...(ruContested ? ['RU_BASE'] : []),
      ...contestedFlags.map((id) => `OBJ_${id}`)
    ];
    const contestedLabel =
      contestedList.length > 0
        ? `LOCKED: ${contestedList.join(', ')} (${d.blockedContestedSpawns} BLOCKED)`
        : `ALL CLEAR (${d.blockedContestedSpawns} BLOCKED SPAWNS)`;

    if (this.telemSummaryGridEl) {
      const fsmSnap = snap.stateMachines || (window.game?.stateMachines ? window.game.stateMachines.getSnapshot() : null);
      const fsmSummary = fsmSnap
        ? `${fsmSnap.match.state} • UI:${fsmSnap.uiModal.state} • PLR:${fsmSnap.player.vitality.state}/${fsmSnap.player.stance.state}/${fsmSnap.player.weapon.state}`
        : 'ACTIVE';
      const invOk = !fsmSnap || fsmSnap.invariants.valid;
      this.telemSummaryGridEl.innerHTML = `
        <div class="telem-stat-box">
          <div class="telem-stat-label">SPAWN RULE AUDIT (BASE / FLAG)</div>
          <div class="telem-stat-val ok">US ${d.usBaseSpawns}B/${d.usFlagSpawns}F • RU ${d.ruBaseSpawns}B/${d.ruFlagSpawns}F (0 ILLEGAL)</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">CONTESTED BASE SPAWN LOCKOUT</div>
          <div class="telem-stat-val ${contestedList.length > 0 ? 'warn' : 'ok'}">${contestedLabel}</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">MEDIC SITUATION ASSESSMENT</div>
          <div class="telem-stat-val ok">${d.medicThreatAssessments} THREAT / ${d.medicSmokeScreens} SMOKE / ${d.medicClearAssessments} CLEAR</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">ARMOR &amp; CREW / BOARDINGS</div>
          <div class="telem-stat-val">${d.npcVehicleBoardings} BOARDED • ${d.playerArmorProtectedHits} HULL HITS</div>
        </div>
        <div class="telem-stat-box" style="grid-column: 1 / -1;">
          <div class="telem-stat-label">FINITE STATE MACHINES &amp; INVARIANTS (${invOk ? '100% VALID' : 'VIOLATION'})</div>
          <div class="telem-stat-val ${invOk ? 'ok' : 'warn'}">${fsmSummary}</div>
        </div>
      `;
    }

    if (this.telemVehiclesListEl) {
      this.telemVehiclesListEl.innerHTML = snap.vehicles
        .slice(0, 8)
        .map(
          (v) => `
          <div class="telem-veh-item">
            <span><strong>[${v.team}]</strong> ${v.name.split(' (')[0]} (${v.hp}/${v.maxHp})</span>
            <span style="color: ${
              v.status.startsWith('NPC_DRIVEN') || v.status.startsWith('PLAYER')
                ? '#2ecc71'
                : '#f1c40f'
            }">${v.status}</span>
          </div>
        `
        )
        .join('');
    }

    if (this.telemEventsListEl) {
      this.telemEventsListEl.innerHTML = snap.recentEvents
        .slice(0, 7)
        .map(
          (ev) => `
          <div class="telem-ev-item">
            <span style="color: #70bdff">[${ev.type}]</span>
            <span>${
              ev.medic ||
              ev.base ||
              ev.blockedBase ||
              ev.npc ||
              ev.attacker ||
              ev.source ||
              ev.message ||
              ''
            } ${ev.action || ev.redirectedTo || ev.vehicleName || ev.weapon || ''}</span>
          </div>
        `
        )
        .join('');
    }
  },

  addKillfeed(killer, killerTeam, victim, victimTeam, weapon, isHeadshot) {
    const item = document.createElement('div');
    item.className = 'kill-item';
    const kClass = killerTeam === 'US' ? 'kill-us' : 'kill-ru';
    const vClass = victimTeam === 'US' ? 'kill-us' : 'kill-ru';
    const hsTag = isHeadshot ? ' [HEADSHOT]' : '';
    item.innerHTML = `<span class="${kClass}">${killer}</span> <span class="kill-weapon">[${weapon}${hsTag}]</span> <span class="${vClass}">${victim}</span>`;
    this.killfeedEl.prepend(item);

    while (this.killfeedEl.children.length > 6) {
      this.killfeedEl.removeChild(this.killfeedEl.lastChild);
    }

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 6500);
  },

  update(dt, ticketsUS, ticketsRU, matchTimeRemaining = 900, rawDt = dt) {
    this.updateFpsMetrics(rawDt || dt);
    this.lastTicketsUS = ticketsUS;
    this.lastTicketsRU = ticketsRU;
    this.lastMatchTime = matchTimeRemaining;

    const onDeployOrVictory = Boolean(
      (this.deployScreenEl && !this.deployScreenEl.classList.contains('hidden')) ||
        (this.victoryScreenEl && !this.victoryScreenEl.classList.contains('hidden'))
    );

    if (this.player.dead || onDeployOrVictory) {
      if (document.body) {
        document.body.classList.toggle('nvg-green-mode', false);
        document.body.classList.toggle('flir-whot-mode', false);
        document.body.classList.toggle('flir-bhot-mode', false);
        document.body.classList.toggle('flir-scope-mode', false);
      }
      if (this.nvgOverlayEl && !this.nvgOverlayEl.classList.contains('hidden')) {
        this.nvgOverlayEl.classList.add('hidden');
        this.nvgOverlayEl.classList.remove('sensor-whot', 'sensor-bhot');
      }
      const flirDeadCanvas = this.el('flir-fullscreen-canvas');
      if (flirDeadCanvas && !flirDeadCanvas.classList.contains('hidden')) {
        flirDeadCanvas.classList.add('hidden');
      }
    }

    if (this.player.dead) {
      // Respawn timer countdown
      if (this.player.respawnTimer > 0) {
        this.player.respawnTimer -= dt;
        const topBtn = this.el('deploy-top-btn');
        const botBtn = this.el('deploy-btn');
        const remaining = Math.ceil(this.player.respawnTimer);
        const waitText = `RESPAWNING IN ${remaining}s...`;
        this._setText(topBtn, waitText);
        this._setText(botBtn, waitText);
      } else {
        const topBtn = this.el('deploy-top-btn');
        const botBtn = this.el('deploy-btn');
        if (topBtn && topBtn.textContent.includes('RESPAWNING')) {
          this._setText(topBtn, 'DEPLOY [ENTER / SPACE]');
        }
        if (botBtn && botBtn.textContent.includes('RESPAWNING')) {
          this._setText(botBtn, 'DEPLOY [ENTER / SPACE]');
        }
      }
      this.drawDeployMap();
      return;
    }

    const activeSensorMode = this.player.nvgActive
      ? this.player.sensorMode && this.player.sensorMode !== 'OFF'
        ? this.player.sensorMode
        : 'NVG'
      : 'OFF';
    const curInfWep = !this.player.activeVehicle ? this.player.currentWeapon?.() : null;
    const activeScopeOptic =
      !this.player.activeVehicle && typeof this.player.getActiveOpticType === 'function'
        ? this.player.getActiveOpticType()
        : curInfWep?.def?.opticType;
    const isScopeFlir = Boolean(
      !this.player.activeVehicle &&
        this.player.isAds &&
        (this.player.adsAmount || 0) > 0.42 &&
        !this.player.useCantedSight &&
        (activeScopeOptic === 'flir' || activeScopeOptic === 'sniperFlir' || curInfWep?.def?.isThermal)
    );
    const scopeBhot = isScopeFlir && this.player.scopeThermalPolarity === 'BHOT';
    const isFlirMode = activeSensorMode === 'WHOT' || activeSensorMode === 'BHOT';
    if (document.body) {
      document.body.classList.toggle('nvg-green-mode', activeSensorMode === 'NVG');
      document.body.classList.toggle('flir-whot-mode', activeSensorMode === 'WHOT');
      document.body.classList.toggle('flir-bhot-mode', activeSensorMode === 'BHOT');
      document.body.classList.toggle('flir-scope-mode', isScopeFlir && !scopeBhot && !isFlirMode);
      document.body.classList.toggle('flir-scope-bhot-mode', scopeBhot && !isFlirMode);
    }
    if (this.nvgOverlayEl) {
      const hideNvg = activeSensorMode === 'OFF';
      if (this.nvgOverlayEl.classList.contains('hidden') !== hideNvg) {
        this.nvgOverlayEl.classList.toggle('hidden', hideNvg);
      }
      if (!hideNvg) {
        this.nvgOverlayEl.classList.toggle('sensor-whot', activeSensorMode === 'WHOT');
        this.nvgOverlayEl.classList.toggle('sensor-bhot', activeSensorMode === 'BHOT');
        const tagEl = this.el('nvg-mode-tag');
        if (tagEl) {
          this._setText(
            tagEl,
            activeSensorMode === 'WHOT'
              ? 'FLIR // WHITE-HOT INFRARED (WHOT IR) ACTIVE [N]'
              : activeSensorMode === 'BHOT'
              ? 'FLIR // BLACK-HOT INFRARED (BHOT IR) ACTIVE [N]'
              : this.player.activeVehicle?.isAircraft
              ? 'AN/AVS-9 AVIATOR NIGHT VISION ACTIVE [N]'
              : 'AN/PVS-14 GEN-3 NIGHT VISION ACTIVE [N]'
          );
        }
      }
    }
    const flirFsCanvas = this.el('flir-fullscreen-canvas');
    if (flirFsCanvas) {
      if (flirFsCanvas.classList.contains('hidden') === isFlirMode) {
        flirFsCanvas.classList.toggle('hidden', !isFlirMode);
      }
      if (isFlirMode) {
        this._flirCanvasAccum = (this._flirCanvasAccum || 0) + dt;
        if (this._flirCanvasAccum >= 0.022 || this._lastFlirCanvasMode !== activeSensorMode) {
          this._flirCanvasAccum = 0;
          this._lastFlirCanvasMode = activeSensorMode;
          this.renderFullScreenFlirThermal(activeSensorMode);
        }
      }
    }

    // Downed State Overlay
    if (this.player.downed) {
      if (this.downedOverlayEl.classList.contains('hidden')) {
        this.downedOverlayEl.classList.remove('hidden');
      }
      if (!this.scopeOverlayEl.classList.contains('hidden')) {
        this.scopeOverlayEl.classList.add('hidden');
      }
      if (this.crosshairEl._lastOpacity !== '0') {
        this.crosshairEl._lastOpacity = '0';
        this.crosshairEl.style.opacity = '0';
      }
      this._setText(
        this.downedKillerEl,
        this.player.beyondRescue
          ? `☠️ CATASTROPHIC HIT BY ${this.player.downedKiller} (${this.player.downedWeapon || 'HEAVY ORDNANCE'})`
          : `HIT BY ${this.player.downedKiller}`
      );
      this._setText(this.downedTimerValEl, Math.max(0, Math.ceil(this.player.downedTimer)));
      this._setWidth(this.giveupBarFillEl, `${Math.min(100, this.player.giveUpProgress * 100).toFixed(1)}%`);
      if (this.player.beyondRescue) {
        this._setText(
          this.downedMedicDistEl,
          '☠️ BEYOND MEDIC RESCUE — LETHAL OVERPRESSURE / HEAVY CALIBER (RETURNING TO DEPLOY...)'
        );
      } else {
        // Find nearest friendly Medic or Squadmate distance who still has Field Dressings (> 0) to revive!
        let bestMedicDist = Infinity;
        let bestMedicName = null;
        let bestMedicDressings = 0;
        let bestMedicMaxDressings = 9;
        for (const b of this.botManager.bots) {
          if (b.dead || b.downed || b.team !== this.player.team || (b.fieldDressings ?? 1) <= 0) continue;
          if (b.role === 'MEDIC' || b.inPlayerSquad) {
            const d = b.pos.distanceTo(this.player.pos);
            if (d < bestMedicDist) {
              bestMedicDist = d;
              bestMedicName = b.name;
              bestMedicDressings = b.fieldDressings ?? 9;
              bestMedicMaxDressings = b.maxFieldDressings || (b.role === 'MEDIC' ? 9 : 2);
            }
          }
        }
        this._setText(
          this.downedMedicDistEl,
          bestMedicName
            ? `NEAREST MEDIC: ${bestMedicName} (${Math.round(bestMedicDist)}m • ${bestMedicDressings}/${bestMedicMaxDressings} DRESSINGS) — EN ROUTE`
            : 'NEAREST MEDIC: NONE WITH FIELD DRESSINGS IN RANGE'
        );
      }
    } else if (this.downedOverlayEl && !this.downedOverlayEl.classList.contains('hidden')) {
      this.downedOverlayEl.classList.add('hidden');
    }

    const tUS = Math.max(0, Math.floor(ticketsUS));
    const tRU = Math.max(0, Math.floor(ticketsRU));
    this._setText(this.ticketsUsEl, tUS);
    this._setText(this.ticketsRuEl, tRU);

    // Update Top Match Clock, Lead Status & Momentum Tug-of-War Bar
    const mins = Math.floor(matchTimeRemaining / 60);
    const secs = Math.floor(matchTimeRemaining % 60);
    const clockStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    this._setText(this.matchClockEl, clockStr);

    let usFlagsHeld = 0;
    let ruFlagsHeld = 0;
    for (let i = 0; i < this.world.flags.length; i++) {
      const owner = this.world.flags[i].owner;
      if (owner === 'US') usFlagsHeld++;
      else if (owner === 'RU') ruFlagsHeld++;
    }

    // Squad AAS Territory Bleed & Mercy Bleed Calculation for Top Conquest Bar
    const usBleedPerMin =
      ruFlagsHeld >= 5 ? 60 : ruFlagsHeld === 4 ? 15 : ruFlagsHeld === 3 && ruFlagsHeld > usFlagsHeld ? 6 : 0;
    const ruBleedPerMin =
      usFlagsHeld >= 5 ? 60 : usFlagsHeld === 4 ? 15 : usFlagsHeld === 3 && usFlagsHeld > ruFlagsHeld ? 6 : 0;

    if (this.ticketRateUsEl) {
      let rateTxt;
      let rateCol;
      if (usBleedPerMin >= 60) {
        rateTxt = `⚠️ -60/m MERCY (${usFlagsHeld}F)`;
        rateCol = '#ff3838';
      } else if (usBleedPerMin > 0) {
        rateTxt = `-${usBleedPerMin}/m BLEED (${usFlagsHeld}F)`;
        rateCol = '#ff9f43';
      } else {
        rateTxt = `HOLD ${usFlagsHeld}/5F`;
        rateCol = usFlagsHeld >= 3 ? '#2ecc71' : '#74b9ff';
      }
      this._setText(this.ticketRateUsEl, rateTxt);
      if (this.ticketRateUsEl._lastCol !== rateCol) {
        this.ticketRateUsEl._lastCol = rateCol;
        this.ticketRateUsEl.style.color = rateCol;
      }
    }
    if (this.ticketRateRuEl) {
      let rateTxt;
      let rateCol;
      if (ruBleedPerMin >= 60) {
        rateTxt = `⚠️ -60/m MERCY (${ruFlagsHeld}F)`;
        rateCol = '#ff3838';
      } else if (ruBleedPerMin > 0) {
        rateTxt = `-${ruBleedPerMin}/m BLEED (${ruFlagsHeld}F)`;
        rateCol = '#ff9f43';
      } else {
        rateTxt = `HOLD ${ruFlagsHeld}/5F`;
        rateCol = ruFlagsHeld >= 3 ? '#2ecc71' : '#ec7063';
      }
      this._setText(this.ticketRateRuEl, rateTxt);
      if (this.ticketRateRuEl._lastCol !== rateCol) {
        this.ticketRateRuEl._lastCol = rateCol;
        this.ticketRateRuEl.style.color = rateCol;
      }
    }

    const diff = tUS - tRU;
    const bleedText =
      ruBleedPerMin >= 60
        ? ` • ⚠️ RU MERCY BLEED (-60/m • 5-0 FLAGS)`
        : usBleedPerMin >= 60
        ? ` • ⚠️ US MERCY BLEED (-60/m • 0-5 FLAGS)`
        : ruBleedPerMin > 0
        ? ` • RU BLEEDING -${ruBleedPerMin}/m (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : usBleedPerMin > 0
        ? ` • US BLEEDING -${usBleedPerMin}/m (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : ` • FLAGS ${usFlagsHeld}-${ruFlagsHeld} (NO BLEED)`;

    if (this.matchLeadTextEl) {
      let leadTxt;
      let leadCol;
      if (diff > 5) {
        leadTxt = `US LEADING +${diff}${bleedText}`;
        leadCol = '#70bdff';
      } else if (diff < -5) {
        leadTxt = `RU LEADING +${Math.abs(diff)}${bleedText}`;
        leadCol = '#ff7878';
      } else {
        leadTxt = `CONTESTED MATCH (${tUS}-${tRU})${bleedText}`;
        leadCol = '#f1c40f';
      }
      this._setText(this.matchLeadTextEl, leadTxt);
      if (this.matchLeadTextEl._lastCol !== leadCol) {
        this.matchLeadTextEl._lastCol = leadCol;
        this.matchLeadTextEl.style.color = leadCol;
      }
    }

    if (this.momentumBarUsEl) {
      const totalT = Math.max(1, tUS + tRU);
      const usPct = Math.max(8, Math.min(92, (tUS / totalT) * 100));
      this._setWidth(this.momentumBarUsEl, `${usPct.toFixed(1)}%`);
    }

    if (!this.scoreboardEl.classList.contains('hidden')) {
      this._scoreboardTimer = (this._scoreboardTimer || 0) - dt;
      if (this._scoreboardTimer <= 0) {
        this._scoreboardTimer = 0.25; // 4 Hz while [Tab] is held
        this.renderScoreboard(true);
      }
    }

    // Update 5 Flag Badges (using cached DOM lookups & dirty checks)
    let activeCaptureFlag = null;
    for (const flag of this.world.flags) {
      const badge = this.el(`flag-ui-${flag.id}`);
      const fill = this.el(`flag-fill-${flag.id}`);
      if (badge && fill) {
        const pctStr = `${Math.round(Math.abs(flag.captureProgress))}%`;
        if (fill._lastHeight !== pctStr) {
          fill._lastHeight = pctStr;
          fill.style.height = pctStr;
        }
        const col =
          flag.captureProgress > 15
            ? '#3498db'
            : flag.captureProgress < -15
            ? '#e74c3c'
            : '#7f8c8d';
        if (fill._lastBg !== col) {
          fill._lastBg = col;
          fill.style.backgroundColor = col;
          badge.style.borderColor = col;
        }
      }

      const d = Math.hypot(this.player.pos.x - flag.pos.x, this.player.pos.z - flag.pos.z);
      if (d <= flag.radius) {
        activeCaptureFlag = flag;
      }
    }

    // Check if the player is inside an Enemy Main Base Perimeter (58m radius)
    const enemyTeam = this.player.team === 'US' ? 'RU' : 'US';
    const enemyBasePos =
      enemyTeam === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;
    const distToEnemyBase = Math.hypot(
      this.player.pos.x - enemyBasePos.x,
      this.player.pos.z - enemyBasePos.z
    );
    const enemyBaseInfo =
      this.botManager.baseState && this.botManager.baseState[enemyTeam]
        ? this.botManager.baseState[enemyTeam]
        : null;

    if (distToEnemyBase <= 58 && enemyBaseInfo) {
      if (this.captureStatusEl.classList.contains('hidden')) {
        this.captureStatusEl.classList.remove('hidden');
      }
      if (enemyBaseInfo.contested) {
        this._setText(
          this.captureTitleEl,
          `⚠️ ${enemyTeam} MAIN BASE CONTESTED — ALL DEFENDERS ELIMINATED (SPAWNS LOCKED!)`
        );
        this._setWidth(this.captureBarEl, '100%');
        if (this.captureBarEl._lastBg !== '#f39c12') {
          this.captureBarEl._lastBg = '#f39c12';
          this.captureBarEl.style.backgroundColor = '#f39c12';
        }
      } else {
        this._setText(
          this.captureTitleEl,
          `${enemyTeam} MAIN BASE PERIMETER — ELIMINATE ${enemyBaseInfo.defenders} DEFENDERS TO LOCK SPAWNS`
        );
        const clearPct = Math.max(15, 100 - enemyBaseInfo.defenders * 18);
        this._setWidth(this.captureBarEl, `${clearPct}%`);
        if (this.captureBarEl._lastBg !== '#e74c3c') {
          this.captureBarEl._lastBg = '#e74c3c';
          this.captureBarEl.style.backgroundColor = '#e74c3c';
        }
      }
    } else if (activeCaptureFlag) {
      if (this.captureStatusEl.classList.contains('hidden')) {
        this.captureStatusEl.classList.remove('hidden');
      }
      const isFriendlyHeld = activeCaptureFlag.owner === this.player.team;
      const defStage = activeCaptureFlag.defenseStage || 0;
      const absPct = Math.round(Math.abs(activeCaptureFlag.captureProgress));
      const usInZone = activeCaptureFlag.usPresent ?? 0;
      const ruInZone = activeCaptureFlag.ruPresent ?? 0;
      const downedExcluded =
        (activeCaptureFlag.usDownedPresent || 0) + (activeCaptureFlag.ruDownedPresent || 0);
      const downedNote = downedExcluded > 0 ? ` • ${downedExcluded} DOWNED EXCLUDED` : '';
      const myCount = this.player.team === 'US' ? usInZone : ruInZone;
      const enemyCount = this.player.team === 'US' ? ruInZone : usInZone;

      let statusLabel = '';
      const garSquad =
        activeCaptureFlag.garrisonSquad && activeCaptureFlag.garrisonSquad[this.player.team]
          ? ` • 🏰 GARRISON: ${activeCaptureFlag.garrisonSquad[this.player.team]}`
          : '';
      const defDmgPct = Math.min(42, 25 + defStage * 4);
      const holdMult = activeCaptureFlag.defenderWeightMult || (1.35 + defStage * 0.075).toFixed(2);
      if (enemyCount > 0 && myCount > 0) {
        statusLabel = ` • ⚔️ CONTESTED (US ${usInZone} vs RU ${ruInZone} ACTIVE${downedNote}${garSquad} • DEFENDER BUFF: -${defDmgPct}% DMG, -30% RECOIL, ${holdMult}× HOLD)`;
      } else if (!isFriendlyHeld && activeCaptureFlag.owner !== 'NEUTRAL') {
        statusLabel = ` • 🔻 LOWERING ${activeCaptureFlag.owner} FLAG (${absPct}% -> 0%${downedNote} • SPAWN LOCKED!)`;
      } else if (!isFriendlyHeld && activeCaptureFlag.owner === 'NEUTRAL') {
        statusLabel = ` • 🔺 RAISING ${this.player.team} FLAG (${absPct}% -> 100%${downedNote})`;
      } else {
        statusLabel = ` (${activeCaptureFlag.owner} HELD ${absPct}%${downedNote}${garSquad} • 🛡️ DEFENDER ADVANTAGE: -${defDmgPct}% DMG, -30% RECOIL, +HP/ARMOR TRIAGE, ${holdMult}× HOLD • FORT ${defStage}/4 [F])`;
      }
      this._setText(this.captureTitleEl, `${activeCaptureFlag.name}${statusLabel}`);
      this._setWidth(this.captureBarEl, `${absPct}%`);
      const capCol =
        enemyCount > 0 && myCount > 0
          ? '#f39c12'
          : activeCaptureFlag.captureProgress > 5
          ? '#3498db'
          : activeCaptureFlag.captureProgress < -5
          ? '#e74c3c'
          : '#95a5a6';
      if (this.captureBarEl._lastBg !== capCol) {
        this.captureBarEl._lastBg = capCol;
        this.captureBarEl.style.backgroundColor = capCol;
      }
    } else if (!this.captureStatusEl.classList.contains('hidden')) {
      this.captureStatusEl.classList.add('hidden');
    }

    // Compass Heading (Hidden while piloting aircraft since #aircraft-cockpit-hud displays live HDG + G-load)
    const compassBarEl = this.el('compass-bar');
    const inAircraftCompass = Boolean(
      this.player.activeVehicle &&
        this.player.activeVehicle.isAircraft &&
        !this.player.activeVehicle.isSecretOmegaFlyer
    );
    if (compassBarEl) {
      if (compassBarEl.classList.contains('hidden') !== inAircraftCompass) {
        compassBarEl.classList.toggle('hidden', inAircraftCompass);
      }
      if (this.ticketEventFeedEl) {
        const feedMargin = inAircraftCompass ? '8px' : '52px';
        if (this.ticketEventFeedEl._lastMarginTop !== feedMargin) {
          this.ticketEventFeedEl._lastMarginTop = feedMargin;
          this.ticketEventFeedEl.style.marginTop = feedMargin;
        }
      }
    }
    if (!inAircraftCompass) {
      let deg = Math.round(((-this.player.yaw * 180) / Math.PI) % 360);
      if (deg < 0) deg += 360;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dirStr = dirs[Math.round(deg / 45) % 8];
      this._setText(this.compassHeadingEl, `${String(deg).padStart(3, '0')}° ${dirStr}`);
    }

    // Dynamic Weather Status (Battlefield 2042 inspired)
    const weatherStatus = this.world.getWeatherStatus ? this.world.getWeatherStatus() : null;
    let weatherEl = this.el('weather-status');
    if (weatherStatus) {
      if (!weatherEl) {
        weatherEl = document.createElement('div');
        weatherEl.id = 'weather-status';
        weatherEl.style.cssText = `
          position: fixed; top: 68px; left: 50%; transform: translateX(-50%);
          font-size: 13px; font-weight: 700; color: #f39c12;
          text-shadow: 0 1px 6px rgba(0,0,0,0.8);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(weatherEl);
        if (this._domCache) this._domCache.set('weather-status', weatherEl);
      }
      this._setText(weatherEl, weatherStatus);
      this._setDisplay(weatherEl, 'block');
    } else if (weatherEl) {
      this._setDisplay(weatherEl, 'none');
    }

    // Hitmarker decay
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        this.hitmarkerEl.classList.add('hidden');
      }
    }

    // Vehicle Overlay vs Infantry Scope/Crosshair
    const cur = this.player.currentWeapon ? this.player.currentWeapon() : null;
    const activeVeh = this.player.activeVehicle;
    const ammoPanelEl = this.el('ammo-panel');
    const airCockpitHudEl = this.el('aircraft-cockpit-hud');
    const cockpitFrameEl = this.el('vehicle-cockpit-frame');
    const camModePillEl = this.el('veh-cam-mode-pill');
    if (camModePillEl && !this._vehCamPillBound) {
      this._vehCamPillBound = true;
      camModePillEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.player?.cycleVehicleCameraMode?.();
      });
    }
    const vehOrientPanelEl = this.el('veh-orientation-panel');
    const reticleHullRingEl = this.el('reticle-hull-ring');
    const slotListEl = this.el('slot-list');
    const selWepIndEl = this.el('selected-weapon-indicator');

    if (activeVeh && activeVeh.isSecretOmegaFlyer) {
      this.vehicleOverlayEl.classList.add('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '1';
    } else if (activeVeh) {
      this.vehicleOverlayEl.classList.remove('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '0';

      const vehTheme = activeVeh.isAircraft
        ? 'veh-theme-aircraft'
        : activeVeh.type === 'bike' || activeVeh.type === 'atv'
        ? 'veh-theme-moto'
        : activeVeh.type === 'apc'
        ? 'veh-theme-apc'
        : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
        ? 'veh-theme-aa'
        : activeVeh.type === 'humvee' || activeVeh.type === 'emplace_hmg'
        ? 'veh-theme-humvee'
        : activeVeh.type === 'warhorse'
        ? 'veh-theme-warhorse'
        : activeVeh.type === 'trebuchet'
        ? 'veh-theme-trebuchet'
        : activeVeh.type === 'emplace_mortar'
        ? 'veh-theme-mortar'
        : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
        ? 'veh-theme-dino'
        : 'veh-theme-tank';

      if (this._lastVehOverlayTheme !== vehTheme) {
        this._lastVehOverlayTheme = vehTheme;
        this.vehicleOverlayEl.className = vehTheme;
      }

      const showHullRing =
        activeVeh.isAircraft ||
        activeVeh.type === 'tank' ||
        activeVeh.type === 'apc' ||
        activeVeh.type === 'aa' ||
        activeVeh.type === 'humvee';
      if (reticleHullRingEl) {
        let hideRing = !showHullRing;
        if (showHullRing) {
          let hullDegR = Math.round(((-(activeVeh.yaw || 0) * 180) / Math.PI) % 360);
          if (hullDegR < 0) hullDegR += 360;
          let viewDegR = Math.round(((-(this.player.yaw || 0) * 180) / Math.PI) % 360);
          if (viewDegR < 0) viewDegR += 360;
          const relHullDeg = ((hullDegR - viewDegR + 540) % 360) - 180;
          if (activeVeh.isAircraft && Math.abs(relHullDeg) < 4) {
            hideRing = true;
          } else {
            reticleHullRingEl.style.transform = `translate(-50%, -50%) rotate(${relHullDeg.toFixed(1)}deg)`;
            const chevEl = this.el('reticle-hull-chevron');
            if (chevEl) {
              this._setText(chevEl, activeVeh.isAircraft ? '▲ NOSE' : '▲ HULL');
            }
          }
        }
        reticleHullRingEl.classList.toggle('hidden', hideRing);
      }

      this.updateVehicleCenterReticle(activeVeh);

      const vCamMode =
        this.player.vehicleCameraMode || (this.player.thirdPersonVehicle ? 'CHASE_3P' : 'COCKPIT_1P');
      if (cockpitFrameEl) {
        const showCkp = vCamMode === 'COCKPIT_1P' && activeVeh.type !== 'warhorse';
        cockpitFrameEl.classList.toggle('hidden', !showCkp);
        if (showCkp) {
          const isHeavyTank =
            !activeVeh.isAircraft &&
            (activeVeh.type === 'tank' || activeVeh.type === 'apc' || activeVeh.type === 'aa');
          const isGunshipOrbitWindow =
            activeVeh.isAircraft &&
            activeVeh.aircraftRole === 'gunship' &&
            !activeVeh.gunshipManualFlight;
          const isJetBubbleCockpit =
            activeVeh.isAircraft && !isGunshipOrbitWindow;
          cockpitFrameEl.classList.toggle('ckp-tank', isHeavyTank);
          cockpitFrameEl.classList.toggle('ckp-jet', isJetBubbleCockpit || isGunshipOrbitWindow);

          const jetCanopySvg = this.el('jet-cockpit-canopy-svg');
          if (jetCanopySvg) {
            jetCanopySvg.classList.toggle('hidden', !isJetBubbleCockpit);
          }
          // 1P Cockpit Mouse-Aim Flight Director Ring: shows where your mouse commands the nose to pull
          // while the physical cockpit canopy & HUD turn smoothly 1:1 with the airplane body!
          let dirRingEl = this.el('ckp-mouse-director-ring');
          if (isJetBubbleCockpit && !dirRingEl) {
            dirRingEl = document.createElement('div');
            dirRingEl.id = 'ckp-mouse-director-ring';
            dirRingEl.style.cssText =
              'position:fixed;top:50%;left:50%;width:28px;height:28px;border:2px dashed rgba(0,255,170,0.82);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:18;box-shadow:0 0 8px rgba(0,255,170,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;color:#00ffaa;font-weight:900;';
            dirRingEl.textContent = '•';
            cockpitFrameEl.appendChild(dirRingEl);
            if (this._domCache) this._domCache.set('ckp-mouse-director-ring', dirRingEl);
          }
          if (dirRingEl) {
            dirRingEl.style.display = isJetBubbleCockpit ? 'flex' : 'none';
            if (isJetBubbleCockpit) {
              let dyaw = (this.player.yaw || 0) - (activeVeh.yaw || 0);
              while (dyaw > Math.PI) dyaw -= Math.PI * 2;
              while (dyaw < -Math.PI) dyaw += Math.PI * 2;
              let dpitch = (this.player.pitch || 0) - (activeVeh.pitch || 0);
              while (dpitch > Math.PI) dpitch -= Math.PI * 2;
              while (dpitch < -Math.PI) dpitch += Math.PI * 2;
              const cosR = Math.cos(-(activeVeh.roll || 0));
              const sinR = Math.sin(-(activeVeh.roll || 0));
              const rawX = -dyaw * 420;
              const rawY = -dpitch * 420;
              const scrX = Math.max(-280, Math.min(280, rawX * cosR - rawY * sinR));
              const scrY = Math.max(-190, Math.min(190, rawX * sinR + rawY * cosR));
              dirRingEl.style.transform = `translate(calc(-50% + ${scrX.toFixed(1)}px), calc(-50% + ${scrY.toFixed(1)}px))`;
              dirRingEl.style.opacity = Math.hypot(scrX, scrY) < 6 ? '0.28' : '0.9';
            }
          }
          const leftWinSightEl = this.el('ac130-left-window-sight');
          if (leftWinSightEl) {
            leftWinSightEl.classList.toggle('hidden', !isGunshipOrbitWindow);
            if (isGunshipOrbitWindow) {
              const useEotech = Boolean(activeVeh.ac130HasEotechSight);
              this.el('ac130-sideways-hud-svg')?.classList.toggle('hidden', useEotech);
              this.el('ac130-eotech-sight-svg')?.classList.toggle('hidden', !useEotech);
              const bDeg = Math.round(((activeVeh.roll || 0) * 180) / Math.PI);
              const sideHudTel = this.el('ac130-side-hud-telemetry');
              const eoTel = this.el('ac130-eotech-telemetry');
              const telStr = activeVeh.ac130HasCoupledAutopilot
                ? `COUPLED ORBIT (${activeVeh.orbitAnchorLabel || 'FOB'}) • BANK ${bDeg}° L • [R] TRANSIT`
                : `MANUAL PYLON • BANK ${bDeg}° L ([A/D] BANK) • [R] TRANSIT`;
              if (sideHudTel) this._setText(sideHudTel, telStr);
              if (eoTel) this._setText(eoTel, telStr);
            }
          }

          const ckpTagEl = this.el('ckp-mode-tag');
          if (ckpTagEl) {
            this._setText(
              ckpTagEl,
              isGunshipOrbitWindow
                ? activeVeh.ac130HasEotechSight
                  ? `🎯 PILOT LEFT-WINDOW AFSOC EOTECH EXPS3 • ${activeVeh.ac130EraLabel || 'AC-130'} • [R] TRANSIT/ORBIT • [C] CAM`
                  : `🪟 PILOT SIDEWAYS LEFT-WINDOW PYLON HUD • ${activeVeh.ac130EraLabel || '1968 AC-130A'} • [R] TRANSIT/ORBIT • [C] CAM`
                : activeVeh.isAircraft
                ? `🛩️ 1P BUBBLE COCKPIT & HUD • ${activeVeh.name.split(' (')[0]} • [C] SWITCH CAM`
                : isHeavyTank
                ? `🛡️ 1P COMMANDER VISION BLOCK • ${activeVeh.name.split(' (')[0]} • [C] SWITCH CAM`
                : activeVeh.type === 'bike' || activeVeh.type === 'atv'
                ? `🏍️ 1P RIDER HELMET VISOR • [C] SWITCH CAM`
                : `🚙 1P DRIVER CABIN WINDSHIELD • [C] SWITCH CAM`
            );
          }
        }
      }
      const ac130FcoEl = this.el('ac130-fco-overlay');
      if (ac130FcoEl) {
        const showFco =
          activeVeh.isAircraft &&
          activeVeh.aircraftRole === 'gunship' &&
          !activeVeh.gunshipManualFlight &&
          vCamMode === 'OPTIC_NOSE';
        ac130FcoEl.classList.toggle('hidden', !showFco);
        if (showFco) {
          const portCenterYaw = (activeVeh.yaw || 0) + Math.PI * 0.5;
          let pOff = (this.player.yaw || 0) - portCenterYaw;
          while (pOff > Math.PI) pOff -= Math.PI * 2;
          while (pOff < -Math.PI) pOff += Math.PI * 2;
          const pDeg = Math.round((-pOff * 180) / Math.PI);
          const maxArcDeg = Math.max(9, Math.round(((activeVeh.ac130MaxMountArc || 0.62) * 180) / Math.PI));
          const pipPct = Math.max(4, Math.min(96, 50 + (pDeg / maxArcDeg) * 46));
          const pipEl = this.el('ac130-fco-gimbal-pip');
          const lblEl = this.el('ac130-fco-gimbal-lbl');
          if (pipEl) pipEl.style.left = `${pipPct.toFixed(1)}%`;
          if (lblEl) {
            const elevDeg = Math.round(((this.player.pitch || 0) * 180) / Math.PI);
            this._setText(
              lblEl,
              `TRAINABLE GUN MOUNT (±${maxArcDeg}°): ${pDeg >= 0 ? `+${pDeg}° AFT` : `${pDeg}° FWD`} • ELEV ${elevDeg}° • [RMB] ZOOM`
            );
          }
        }
      }
      if (camModePillEl) {
        const camShort =
          vCamMode === 'COCKPIT_1P'
            ? activeVeh.aircraftRole === 'gunship' && !activeVeh.gunshipManualFlight
              ? 'BAY 1P'
              : '1P CKP'
            : vCamMode === 'OPTIC_NOSE'
            ? activeVeh.aircraftRole === 'gunship'
              ? 'FCO POD'
              : 'OPTIC'
            : '3P CAM';
        this._setText(camModePillEl, `🎥 ${camShort} [C]`);
      }
      const sensorPillEl = this.el('veh-sensor-mode-pill');
      if (sensorPillEl) {
        if (!this._vehSensorPillBound) {
          this._vehSensorPillBound = true;
          sensorPillEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }));
          });
        }
        const sMode = this.player.nvgActive ? this.player.sensorMode || 'NVG' : 'OFF';
        const sLabel =
          sMode === 'WHOT'
            ? '🌡️ WHOT [N]'
            : sMode === 'BHOT'
            ? '🌡️ BHOT [N]'
            : sMode === 'NVG'
            ? '🥽 NVG [N]'
            : '☀️ TV [N]';
        this._setText(sensorPillEl, sLabel);
      }
      const avoidPillEl = this.el('veh-avoid-mode-pill');
      if (avoidPillEl) {
        if (!this._vehAvoidPillBound) {
          this._vehAvoidPillBound = true;
          avoidPillEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (typeof this.player?.toggleAircraftCollisionAvoidance === 'function') {
              this.player.toggleAircraftCollisionAvoidance();
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
            }
          });
        }
        const avoidAuto = this.player ? this.player.aircraftCollisionAvoidance !== false : true;
        avoidPillEl.classList.toggle('avoid-off', !avoidAuto);
        this._setText(avoidPillEl, avoidAuto ? '🛡️ AUTO [G]' : '💥 CRASH [G]');
      }

      const isHorseMount = activeVeh.type === 'warhorse';
      const gunTagsEl = this.ammoPanelEl ? this.ammoPanelEl.querySelector('.tactical-gun-tags') : null;
      if (gunTagsEl) gunTagsEl.style.display = isHorseMount ? '' : 'none';

      if (activeVeh.isAircraft) {
        if (ammoPanelEl) ammoPanelEl.classList.add('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (slotListEl) slotListEl.classList.add('hidden');
        if (selWepIndEl) selWepIndEl.classList.add('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.remove('hidden');
        this.updateAircraftCockpitHud(activeVeh, dt);
      } else if (isHorseMount) {
        // Mounted Warhorse Archer: Clean Archery & Mount HUD (NO Tank Turret/FCS Orientation Box!)
        if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (slotListEl) slotListEl.classList.remove('hidden');
        if (selWepIndEl) selWepIndEl.classList.remove('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      } else {
        if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.remove('hidden');
        if (slotListEl) slotListEl.classList.add('hidden');
        if (selWepIndEl) selWepIndEl.classList.remove('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
        this.vehNameLabel.textContent = activeVeh.name;
        const hpPrefix =
          activeVeh.type === 'warhorse'
            ? 'MOUNT HP'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'PREDATOR HP'
            : activeVeh.type === 'trebuchet'
            ? 'SIEGE ENGINE HP'
            : activeVeh.type === 'bike' || activeVeh.type === 'atv'
            ? 'CHASSIS HP'
            : 'VEHICLE HP';
        this.vehHpLabel.textContent =
          activeVeh.type === 'tank' || activeVeh.type === 'apc'
            ? `HULL INTEGRITY: ${Math.round(
                activeVeh.hullIntegrityPct ?? (activeVeh.hp / Math.max(1, activeVeh.maxHp)) * 100
              )}% (${Math.ceil(activeVeh.hp)}/${activeVeh.maxHp} HP${
                activeVeh.maxEraBlocks ? ` • ERA ${activeVeh.eraBlocksIntact ?? activeVeh.maxEraBlocks}/${activeVeh.maxEraBlocks}` : ''
              })`
            : `${hpPrefix}: ${Math.ceil(activeVeh.hp)} / ${activeVeh.maxHp}`;
        if (this.vehSpeedLabelEl) {
          const curKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
          const maxKmh = Math.round((activeVeh.speed || 0) * 3.6);
          this.vehSpeedLabelEl.textContent =
            activeVeh.type === 'trebuchet' || activeVeh.isStaticEmplacement
              ? `RANGE: ${Math.round(this.player?.mortarRangeM || 200)}M (MAX 0 KM/H)`
              : `SPEED: ${curKmh} KM/H (MAX ${maxKmh} KM/H)`;
        }
        this.updateVehicleOrientationHud(activeVeh);
      }
      if (activeVeh.isAircraft && activeVeh.isShotDown) {
        this.interactPromptEl.textContent =
          '🚨 MAYDAY! AIRFRAME SHOT DOWN — PRESS [E] TO EJECT SEAT BEFORE GROUND CRASH!';
        this.interactPromptEl.classList.remove('hidden');
      } else if (activeVeh.isAircraft && activeVeh.isStalling) {
        this.interactPromptEl.textContent =
          '⚠️ AERODYNAMIC STALL (LOW AIRSPEED) — HOLD [W] THROTTLE UP & LOWER NOSE TO RECOVER!';
        this.interactPromptEl.classList.remove('hidden');
      } else {
        this.interactPromptEl.classList.add('hidden');
      }
    } else if (!this.player.downed) {
      this._lastVehOverlayTheme = null;
      this.vehicleOverlayEl.className = 'hidden';
      if (cockpitFrameEl) cockpitFrameEl.classList.add('hidden');
      const ac130FcoOff = this.el('ac130-fco-overlay');
      if (ac130FcoOff) ac130FcoOff.classList.add('hidden');
      const gunTagsEl = this.ammoPanelEl ? this.ammoPanelEl.querySelector('.tactical-gun-tags') : null;
      if (gunTagsEl) gunTagsEl.style.display = '';
      if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
      if (slotListEl) slotListEl.classList.remove('hidden');
      if (selWepIndEl) selWepIndEl.classList.remove('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      const opticType = this.player.getActiveOpticType();
      const inAdsOptic = Boolean(opticType && this.player.adsAmount > 0.45);

      if (inAdsOptic && this.opticFrameEl) {
        this.scopeOverlayEl.classList.remove('hidden');
        const curWepDef = cur && cur.def ? cur.def : null;
        const zLevels = Array.isArray(curWepDef?.zoomLevels) ? curWepDef.zoomLevels : null;
        const zIdx = Math.min(
          zLevels ? zLevels.length - 1 : 0,
          Math.max(0, this.player.opticZoomIndex || 0)
        );
        const activeZoom =
          this.player.useCantedSight
            ? '1.0X'
            : zLevels && zLevels[zIdx]
            ? `${zLevels[zIdx]}X`
            : null;
        const isBlackout =
          !this.player.useCantedSight &&
          (opticType === 'sniper8x' ||
            opticType === 'sniper12x' ||
            opticType === 'sniperFlir' ||
            opticType === 'lpvo36' ||
            opticType === 'flir' ||
            ((opticType === 'elcan4x' || opticType === 'valday6x' || opticType === 'holo3x') &&
              zIdx > 0));
        this.scopeOverlayEl.classList.toggle('full-blackout', isBlackout);
        this.scopeOverlayEl.classList.toggle('reflex-vignette', !isBlackout);
        this.opticFrameEl.className = `optic-${opticType}`;

        const zHint = zLevels && zLevels.length > 1 ? ` [SCROLL/V: ${activeZoom}]` : '';
        const polStr = this.player.scopeThermalPolarity === 'BHOT' ? 'BHOT' : 'WHOT';
        const breathSec = Math.max(0, this.player.breathStamina ?? 4.5).toFixed(1);
        const breathHint = this.player.isHoldingBreath
          ? ` • 🎯 STEADY LOCKED (${breathSec}s)`
          : isBlackout
          ? ' • [SHIFT] HOLD BREATH'
          : '';
        const opticLabels = {
          rmr: 'TRIJICON RMR TYPE 2 • 1.0X MICRO DOT',
          reddot: this.player.useCantedSight
            ? 'CANTED 45° AIMPOINT • 1.0X RED DOT'
            : 'AIMPOINT MICRO T-2 • 1.0X RED DOT',
          kobra: 'KOBRA EKP-8-18 • 1.0X REFLEX',
          okp7: 'OKP-7 DOVETAIL • 1.0X GREEN CHEVRON',
          holo: 'EOTECH EXPS3 • 1.0X HOLOGRAPHIC',
          uh1: 'VORTEX AMG UH-1 GEN II • 1.0X HOLO',
          prism2x: `PRIMARY ARMS GLX • 2.0X PRISM (ZERO ${this.player.zeroDistance}M)`,
          holo3x: `EOTECH HHS-II + G33 • ${activeZoom || '3.0X'}${zHint}`,
          acog: `TRIJICON ACOG • 3.4X (ZERO ${this.player.zeroDistance}M)`,
          elcan4x: `ELCAN SPECTER DR • ${activeZoom || '4.0X'}${zHint}`,
          valday6x: `VALDAY PS-320 • ${activeZoom || '6.0X'} LPVO${zHint}${breathHint}`,
          lpvo36: `EOTECH VUDU • ${activeZoom || '3.0X-6.0X'} DUAL-ZOOM${zHint}${breathHint}`,
          flir: `FLIR RS-32 ${polStr} THERMAL • ${activeZoom || '2.5X'}${zHint} • [N] POLARITY${breathHint}`,
          sniperFlir: `AN/PAS-13G ${polStr} THERMAL SNIPER • ${activeZoom || '6.0X'}${zHint} • [N] POLARITY${breathHint}`,
          sniper8x: `RAZOR HD • 8.0X MIL-DOT (ZERO ${this.player.zeroDistance}M)${breathHint}`,
          sniper12x: `NIGHTFORCE ATACR • ${activeZoom || '12.0X'} BALLISTIC${zHint}${breathHint}`,
          rpgSight: 'PGO-7V • ROCKET OPTICAL GRID'
        };
        if (this.opticLabelEl) {
          this._setText(this.opticLabelEl, opticLabels[opticType] || 'OPTIC SIGHT');
        }
        if (opticType === 'flir' || opticType === 'sniperFlir') {
          this.renderFlirThermalLens?.(opticType);
        }
        this.opticFrameEl.style.transform = `scale(${1 + this.player.recoilKickZ * 0.28})`;
      } else {
        this.scopeOverlayEl.classList.add('hidden');
      }

      const activeWepDef = cur && cur.def ? cur.def : null;
      const isFootBowOrXbow = Boolean(
        activeWepDef && (activeWepDef.isBow || activeWepDef.isCrossbow)
      );
      if (isFootBowOrXbow && this.player.adsAmount > 0.35) {
        // Show dedicated Medieval Bow / Crossbow Arbor Sight when aiming (ADS) on foot!
        this.vehicleOverlayEl.className = 'veh-theme-warhorse';
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (reticleHullRingEl) reticleHullRingEl.classList.add('hidden');
        this.updateVehicleCenterReticle({
          type: 'warhorse',
          isFootArcherySight: true,
          isCrossbowSight: Boolean(activeWepDef.isCrossbow)
        });
        this.crosshairEl.style.opacity = '0';
      } else {
        const keepCrosshairInAds = Boolean(
          !inAdsOptic &&
            activeWepDef &&
            (activeWepDef.isBow ||
              activeWepDef.isCrossbow ||
              activeWepDef.isThrowingBlade ||
              activeWepDef.isVenomSpit ||
              activeWepDef.type === 'melee_sword')
        );
        this.crosshairEl.style.opacity =
          this.player.adsAmount > 0.45 && !keepCrosshairInAds ? '0' : '1';
        this.crosshairEl.style.transform =
          keepCrosshairInAds && this.player.adsAmount > 0.2
            ? `translate(-50%, -50%) scale(${(1 - this.player.adsAmount * 0.34).toFixed(2)})`
            : '';
      }

      // Rotate nearby building keys smoothly at 60Hz while throttling proximity scans to 10Hz
      if (this.world && Array.isArray(this.world.buildingKeys)) {
        for (let i = 0; i < this.world.buildingKeys.length; i++) {
          const kObj = this.world.buildingKeys[i];
          if (!kObj.collected && kObj.mesh) {
            kObj.mesh.rotation.y += dt * 1.8;
          }
        }
      }

      // Throttle #interact-prompt proximity scan to ~10 Hz (0.10s) instead of scanning all vehicles, bots, crates & loot at 60 Hz
      this._interactScanTimer = (this._interactScanTimer || 0) - dt;
      if (this._interactScanTimer <= 0) {
        this._interactScanTimer = 0.10;
        const downedMate = this.botManager.findNearestDownedFriendly(
          this.player.pos,
          this.player.team,
          4.5
        );
        const injuredMate =
          typeof this.player.findNearestInjuredFriendly === 'function'
            ? this.player.findNearestInjuredFriendly(4.5)
            : null;
        const nearFriendlyMedic =
          (this.player.hp < 100 || this.player.bleeding) &&
          typeof this.player.findNearestFriendlyMedic === 'function'
            ? this.player.findNearestFriendlyMedic(6.5)
            : null;
        const nearVeh = this.vehicleManager.findNearestEnterable(
          this.player.pos,
          6.5,
          this.player.team
        );
        let nearCrate = false;
        for (const crate of this.world.ammoCrates) {
          if (crate.pos.distanceTo(this.player.pos) <= 4.5) {
            nearCrate = true;
            break;
          }
        }
        const nearEnemyLoot =
          typeof this.player.findNearestEnemyLoot === 'function'
            ? this.player.findNearestEnemyLoot(4.8)
            : null;
        const nearBuildingKey =
          typeof this.player.findNearestBuildingKey === 'function'
            ? this.player.findNearestBuildingKey(5.2)
            : null;
        const nearFlag =
          typeof this.player.findNearbyFlag === 'function'
            ? this.player.findNearbyFlag(18)
            : activeCaptureFlag;
        const damagedBld =
          typeof this.world.findNearestDamagedBuilding === 'function'
            ? this.world.findNearestDamagedBuilding(this.player.pos, 14.0)
            : null;
        const bpName =
          typeof this.player.getBlueprintName === 'function'
            ? this.player.getBlueprintName()
            : 'CHEST WALL';

        const maxDressings =
          this.player.maxBandages || (this.player.role === 'medic' ? 9 : 2);
        let promptTxt = null;
        if (this.player.parachuting) {
          promptTxt =
            '🪂 PARACHUTE ACTIVE — STEER [WASD] • PRESS [C] OR [X] TO CUT PARACHUTE (FAST DROP)';
        } else if (this.player.parachuteCut && !this.player.grounded) {
          promptTxt =
            '⚡ PARACHUTE CUT (FREEFALL) — PRESS [SPACE] BEFORE GROUND IMPACT TO PULL RESERVE CHUTE!';
        } else if (this.player.draggedBot) {
          promptTxt =
            (this.player.bandages || 0) > 0
              ? `DRAGGING ${this.player.draggedBot.name} TO COVER • HOLD [F] TO REVIVE (-1 DRESSING • ${this.player.bandages}/${maxDressings}) • [E] DROP`
              : `DRAGGING ${this.player.draggedBot.name} • ⚠️ 0/${maxDressings} DRESSINGS LEFT (RESUPPLY AT STASH TO REVIVE!) • [E] DROP`;
        } else if (downedMate) {
          promptTxt =
            (this.player.bandages || 0) > 0
              ? `🩹 HOLD [F] TO REVIVE ${downedMate.name} (-1 DRESSING • ${this.player.bandages}/${maxDressings} LEFT) • PRESS [E] TO DRAG TO COVER`
              : `⚠️ 0/${maxDressings} FIELD DRESSINGS LEFT — RESUPPLY AT AMMO STASH [7] TO REVIVE ${downedMate.name} • [E] DRAG`;
        } else if (nearVeh) {
          const isModernEra = (this.world?.era || 'modern') === 'modern';
          const strictDoc = this.player.squadDoctrineEnabled !== false;
          const needsPilot = Boolean(
            nearVeh.isAircraft && isModernEra && strictDoc && this.player.role !== 'pilot'
          );
          const needsArmor = Boolean(
            !nearVeh.isAircraft &&
              (nearVeh.type === 'tank' || nearVeh.type === 'apc' || nearVeh.type === 'aa') &&
              isModernEra &&
              strictDoc &&
              this.player.role !== 'armor'
          );
          const vehPrompt = needsPilot
            ? `🔒 ${nearVeh.name} — REQUIRES [COMBAT PILOT] LICENSE! (SWITCH AT BASE/FOB [L] OR TOGGLE DOCTRINE OFF)`
            : needsArmor
            ? `🔒 ${nearVeh.name} — REQUIRES [ARMOR CREWMAN] LICENSE! (SWITCH AT BASE/FOB [L] OR TOGGLE DOCTRINE OFF)`
            : nearVeh.npcDriver
            ? `PRESS [E] TO COMMANDEER ${nearVeh.name} FROM ${nearVeh.npcDriver.name}`
            : `PRESS [E] TO ENTER ${nearVeh.name}`;
          const canBuildHere = !isModernEra || !strictDoc || this.player.role === 'engineer';
          const fSuffix = nearCrate
            ? ' • [F] RESUPPLY ALL • [L] GUNSMITH WORKBENCH'
            : damagedBld && canBuildHere
            ? ` • [F] REPAIR BUILDING (${damagedBld.info.integrityPct}%)`
            : nearFlag && nearFlag.owner === this.player.team
            ? canBuildHere
              ? ` • [F] BUILD ${bpName} • [L] FOB GUNSMITH`
              : ' • [L] FOB GUNSMITH WORKBENCH'
            : '';
          promptTxt = `${vehPrompt}${fSuffix}`;
        } else if (nearFriendlyMedic) {
          promptTxt = `🏥 MEDIC ${nearFriendlyMedic.name} TREATING YOUR INJURIES (${Math.ceil(
            this.player.hp
          )}/100 HP) • PRESS [F] FOR INSTANT MAX HEAL`;
        } else if (injuredMate) {
          promptTxt = `PRESS [F] TO HEAL ${injuredMate.name} (${Math.ceil(
            injuredMate.hp
          )}/100 HP)`;
        } else if (nearCrate) {
          promptTxt =
            '📦 AMMO & KIT STASH — PRESS [F] TO RESUPPLY ALL • PRESS [L] FOR ROLE, WEAPON & GUNSMITH WORKBENCH';
        } else if (nearBuildingKey) {
          promptTxt =
            '🔑 ARMORY CASE KEY FOUND IN BUILDING ROOM — PRESS [F] OR WALK OVER TO COLLECT (+1 🔑 KEY & +50 XP)!';
        } else if (nearEnemyLoot) {
          let remItems = 0;
          const lItems = nearEnemyLoot.items || [];
          for (let i = 0; i < lItems.length; i++) {
            if (!lItems[i].looted) remItems++;
          }
          const cashTag = nearEnemyLoot.cashAutoLooted
            ? `💵 +$${nearEnemyLoot.halfLootCash || 140} (50% CASH LOOTED)`
            : `💵 +$${nearEnemyLoot.halfLootCash || 140} (50% OF $${nearEnemyLoot.ownerMatchCash || 280} CASH)`;
          promptTxt = `🎒 ENEMY LOOT: ${nearEnemyLoot.ownerRank} ${nearEnemyLoot.ownerName} • ${cashTag} • TAP [F] AUTO-LOOT GEAR & 50% CASH • HOLD [F] / [I] MANUAL LOOT (${remItems} ITEMS)`;
        } else if (
          damagedBld &&
          ((this.world?.era || 'modern') !== 'modern' ||
            this.player.squadDoctrineEnabled === false ||
            this.player.role === 'engineer')
        ) {
          promptTxt = `🔨 BUILDING COVER DAMAGED (${damagedBld.info.integrityPct}% INTACT) — PRESS [F] OR [T] TO REPAIR BUILDING (+75 XP)`;
        } else if (nearFlag && nearFlag.owner === this.player.team) {
          const defSt = nearFlag.defenseStage || 0;
          const canEngBuild =
            (this.world?.era || 'modern') !== 'modern' ||
            this.player.squadDoctrineEnabled === false ||
            this.player.role === 'engineer';
          promptTxt = canEngBuild
            ? defSt < 4
              ? `🛠️ PRESS [F] TO BUILD ${bpName} & FORTIFY OBJ ${nearFlag.id} (${defSt}/4) • [L] FOB GUNSMITH WORKBENCH`
              : `🛠️ PRESS [F] TO BUILD ${bpName} AT OBJ ${nearFlag.id} • [L] FOB GUNSMITH WORKBENCH`
            : `📍 FRIENDLY FOB ${nearFlag.id} — PRESS [L] FOR GUNSMITH WORKBENCH • PRESS [J] FOR INFANTRY A-10 CAS`;
        }

        if (promptTxt && !this.player.reloading && !this.player.slowReloading) {
          this._setText(this.interactPromptEl, promptTxt);
          if (this.interactPromptEl.classList.contains('hidden')) {
            this.interactPromptEl.classList.remove('hidden');
          }
        } else if (!this.interactPromptEl.classList.contains('hidden')) {
          this.interactPromptEl.classList.add('hidden');
        }

        // Render Squad-style Field Role & Kit Switcher Bar whenever standing near an Ammo & Kit Stash
        this._cachedNearCrate = nearCrate;
      }
      this.updateFieldKitBar(Boolean(this._cachedNearCrate));
    } else {
      this._interactScanTimer = 0;
      this._cachedNearCrate = false;
      this.updateFieldKitBar(false);
    }

    // Update 360° Directional Incoming Fire & Armor Impact Indicators + Telemetry Panel
    this.updateDamageIndicators(dt);
    this.updateTelemetryPanel();

    // Vehicle Hull Armor Integrity Row + Crew Health, Armor, Bleeding, Grenades & Stance
    const inAircraftVitals = Boolean(
      activeVeh && activeVeh.isAircraft && !activeVeh.isSecretOmegaFlyer
    );
    const backpackBadgeEl = this.el('backpack-hud-badge');
    if (this._lastInAircraftVitals !== inAircraftVitals) {
      this._lastInAircraftVitals = inAircraftVitals;
      if (this.armorBadgeEl) this.armorBadgeEl.classList.toggle('hidden', inAircraftVitals);
      if (this.bandageBadgeEl) this.bandageBadgeEl.classList.toggle('hidden', inAircraftVitals);
      if (this.grenadeBadgeEl) this.grenadeBadgeEl.classList.toggle('hidden', inAircraftVitals);
      if (backpackBadgeEl) backpackBadgeEl.classList.toggle('hidden', inAircraftVitals);
      const hudBuildBtn = this.el('hud-build-bunker-btn');
      const hudBikeBtn = this.el('hud-request-bike-btn');
      if (hudBuildBtn) hudBuildBtn.style.display = inAircraftVitals ? 'none' : '';
      if (hudBikeBtn) {
        const isModern = (this.world?.era || 'modern') === 'modern';
        hudBikeBtn.style.display = isModern && !inAircraftVitals ? '' : 'none';
      }
    }

    if (activeVeh && !activeVeh.isAircraft && !activeVeh.isSecretOmegaFlyer && this.vehicleVitalsRowEl) {
      this.vehicleVitalsRowEl.classList.remove('hidden');
      const hullPct = Math.max(0, Math.min(100, (activeVeh.hp / activeVeh.maxHp) * 100));
      if (this.vehHullTagEl) {
        this.vehHullTagEl.textContent =
          activeVeh.type === 'tank'
            ? 'TANK'
            : activeVeh.type === 'apc'
            ? '8×8 IFV'
            : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
            ? 'SPAAG'
            : activeVeh.type === 'humvee'
            ? 'MRAP'
            : activeVeh.type === 'bike'
            ? 'MOTO'
            : activeVeh.type === 'atv'
            ? 'QUAD'
            : activeVeh.type === 'warhorse'
            ? 'STEED'
            : activeVeh.type === 'trebuchet'
            ? 'SIEGE'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'DINO'
            : 'MOUNT';
      }
      if (this.vehHullFillEl) {
        this.vehHullFillEl.style.width = `${hullPct}%`;
        this.vehHullFillEl.style.background =
          hullPct < 35 ? '#e74c3c' : hullPct < 65 ? '#f39c12' : '#2ecc71';
      }
      if (this.vehHullValEl) {
        if (activeVeh.type === 'warhorse') {
          const horseBarding = Math.ceil(activeVeh.armor || 0);
          this.vehHullValEl.textContent = `${Math.ceil(activeVeh.hp)} HP • ${horseBarding} BARDING`;
        } else if (activeVeh.type === 'tank' || activeVeh.type === 'apc') {
          this.vehHullValEl.textContent = `${Math.round(hullPct)}% (${Math.ceil(activeVeh.hp)})`;
        } else {
          this.vehHullValEl.textContent = Math.ceil(activeVeh.hp);
        }
      }
      if (this.crewHpLabelEl) {
        this.crewHpLabelEl.textContent =
          activeVeh.type === 'bike' || activeVeh.type === 'atv' || activeVeh.type === 'warhorse'
            ? 'RIDER HP'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'HUNTER'
            : 'CREW';
      }
      if (activeVeh.type === 'warhorse') {
        const horseBarding = Math.ceil(activeVeh.armor || 0);
        const horseMaxBarding = activeVeh.maxArmor || 120;
        this.armorBadgeEl.textContent = `RIDER ARMOR: ${Math.ceil(this.player.armor)}/${
          this.player.maxArmor || 45
        } • STEED BARDING: ${horseBarding}/${horseMaxBarding}`;
      } else if (activeVeh.type === 'tank' || activeVeh.type === 'apc') {
        const az = activeVeh.armorZones || { front: 100, left: 100, right: 100, rear: 100 };
        const sidePct = Math.round(Math.min(az.left ?? 100, az.right ?? 100));
        const sub = activeVeh.subsystems || {};
        const subStatus =
          sub.tracks === 'DAMAGED'
            ? '⚠️ TRACKS DMG'
            : sub.engine === 'CRITICAL'
            ? '🔥 ENG CRIT'
            : sub.engine === 'SMOKING'
            ? '💨 ENG SMOKE'
            : sub.turret === 'DAMAGED'
            ? '⚠️ TURRET RING'
            : 'SYS OK';
        this.armorBadgeEl.textContent = `HULL ${Math.round(hullPct)}% • F:${Math.round(
          az.front ?? 100
        )}% S:${sidePct}% R:${Math.round(az.rear ?? 100)}% • ${subStatus}`;
      } else {
        const armorPrefix =
          activeVeh.type === 'bike' || activeVeh.type === 'atv'
            ? 'CHASSIS'
            : activeVeh.type === 'trebuchet'
            ? 'TIMBER FRAME'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'SCALED HIDE'
            : 'HULL ARMOR';
        this.armorBadgeEl.textContent = `${armorPrefix}: ${Math.ceil(activeVeh.hp)}/${activeVeh.maxHp}`;
      }
    } else {
      if (this.vehicleVitalsRowEl && !this.vehicleVitalsRowEl.classList.contains('hidden')) {
        this.vehicleVitalsRowEl.classList.add('hidden');
      }
      this._setText(this.crewHpLabelEl, inAircraftVitals ? 'PILOT' : 'HP');
      if (!inAircraftVitals) {
        this._setText(this.armorBadgeEl, `ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`);
      }
    }

    // Update Tactical Soldier Limb & Modular Airframe Paper-Doll SVGs + Fracture Badge (dirty-checked!)
    const soldierSvgEl = this.el('soldier-limb-svg');
    const airSvgEl = this.el('aircraft-dmg-svg');
    const fracBadgeEl = this.el('fracture-badge');
    const zoneHex = (pct) =>
      pct <= 0 ? '#2f3542' : pct <= 30 ? '#ff4757' : pct <= 65 ? '#ffa502' : pct <= 88 ? '#eccc68' : '#2ecc71';
    if (soldierSvgEl && airSvgEl) {
      const showAirDoll = Boolean(inAircraftVitals && activeVeh && activeVeh.airframeParts);
      if (soldierSvgEl.classList.contains('hidden') !== showAirDoll) {
        soldierSvgEl.classList.toggle('hidden', showAirDoll);
      }
      if (airSvgEl.classList.contains('hidden') === showAirDoll) {
        airSvgEl.classList.toggle('hidden', !showAirDoll);
      }
      if (showAirDoll) {
        const ap = activeVeh.airframeParts;
        const airSig = `${ap.avionics}|${ap.cockpit}|${ap.leftWing}|${ap.rightWing}|${ap.engines}|${ap.tail}`;
        if (airSvgEl._lastSig !== airSig) {
          airSvgEl._lastSig = airSig;
          this.el('air-svg-avionics')?.setAttribute('fill', zoneHex(ap.avionics ?? 100));
          this.el('air-svg-cockpit')?.setAttribute('fill', zoneHex(ap.cockpit ?? 100));
          this.el('air-svg-lwing')?.setAttribute('fill', zoneHex(ap.leftWing ?? 100));
          this.el('air-svg-rwing')?.setAttribute('fill', zoneHex(ap.rightWing ?? 100));
          this.el('air-svg-engines')?.setAttribute('fill', zoneHex(ap.engines ?? 100));
          this.el('air-svg-tail')?.setAttribute('fill', zoneHex(ap.tail ?? 100));
        }
      } else if (this.player.limbHealth) {
        const lh = this.player.limbHealth;
        const limbSig = `${lh.head}|${lh.thorax}|${lh.leftArm}|${lh.rightArm}|${lh.leftLeg}|${lh.rightLeg}`;
        if (soldierSvgEl._lastSig !== limbSig) {
          soldierSvgEl._lastSig = limbSig;
          this.el('limb-svg-head')?.setAttribute('fill', zoneHex(lh.head ?? 100));
          this.el('limb-svg-thorax')?.setAttribute('fill', zoneHex(lh.thorax ?? 100));
          this.el('limb-svg-larm')?.setAttribute('fill', zoneHex(lh.leftArm ?? 100));
          this.el('limb-svg-rarm')?.setAttribute('fill', zoneHex(lh.rightArm ?? 100));
          this.el('limb-svg-lleg')?.setAttribute('fill', zoneHex(lh.leftLeg ?? 100));
          this.el('limb-svg-rleg')?.setAttribute('fill', zoneHex(lh.rightLeg ?? 100));
        }
      }
    }
    if (fracBadgeEl) {
      const hasFrac = Boolean(!inAircraftVitals && (this.player.armFractured || this.player.legFractured));
      if (fracBadgeEl.classList.contains('hidden') === hasFrac) {
        fracBadgeEl.classList.toggle('hidden', !hasFrac);
      }
      if (hasFrac) {
        const fracLbl =
          this.player.armFractured && this.player.legFractured
            ? '🦴 ARM+LEG FRACTURE [HOLD H]'
            : this.player.legFractured
            ? '🦴 LEG FRACTURE (-35% SPD) [HOLD H]'
            : '🦴 ARM FRACTURE (+SWAY) [HOLD H]';
        this._setText(fracBadgeEl, fracLbl);
      }
    }

    this._setText(this.hpValEl, Math.ceil(this.player.hp));
    this._setWidth(this.hpFillEl, `${Math.max(0, Math.round(this.player.hp))}%`);
    const isMedicTreating = Boolean(
      !this.player.bleeding && this.player.medicHealTimer > 0 && this.player.beingHealedByMedic
    );
    const hideBleed = !this.player.bleeding && !isMedicTreating;
    if (this.bleedBadgeEl.classList.contains('hidden') !== hideBleed) {
      this.bleedBadgeEl.classList.toggle('hidden', hideBleed);
    }
    if (this.player.bleeding) {
      const approxBleedSecs = Math.ceil((Math.max(1, this.player.hp) / 2) * 2.5);
      this._setText(this.bleedBadgeEl, `BLEEDING [HOLD H] (~${approxBleedSecs}s)`);
      if (this.bleedBadgeEl._lastMode !== 'bleed') {
        this.bleedBadgeEl._lastMode = 'bleed';
        this.bleedBadgeEl.style.background = '';
        this.bleedBadgeEl.style.color = '';
      }
    } else if (isMedicTreating) {
      this._setText(
        this.bleedBadgeEl,
        `🏥 MEDIC ${this.player.beingHealedByMedic} HEALING (${Math.ceil(this.player.hp)}/100 HP)`
      );
      if (this.bleedBadgeEl._lastMode !== 'medic') {
        this.bleedBadgeEl._lastMode = 'medic';
        this.bleedBadgeEl.style.background = 'rgba(46, 204, 113, 0.28)';
        this.bleedBadgeEl.style.color = '#7bed9f';
      }
    }
    const curSpeedMps = this.player.horizSpeed || Math.hypot(this.player.vel?.x || 0, this.player.vel?.z || 0);
    const isBhopping = !activeVeh && !this.player.parachuting && !this.player.downed && curSpeedMps > 10.3;
    const stanceStr = activeVeh
      ? activeVeh.isAircraft
        ? '✈️ PILOT [E EJECT]'
        : activeVeh.type === 'bike' || activeVeh.type === 'atv'
        ? '🏍️ RIDER [SPACE WHEELIE]'
        : activeVeh.type === 'warhorse'
        ? '🐎 MOUNTED CAVALRY'
        : activeVeh.type === 'trebuchet'
        ? '🪨 SIEGE CREW [T/G]'
        : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
        ? '🦖 APEX PREDATOR'
        : activeVeh.type === 'humvee'
        ? '🚙 MRAP GUNNER'
        : activeVeh.type === 'apc'
        ? '🛡️ 8×8 IFV CREW'
        : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
        ? '📡 SPAAG RADAR CREW'
        : '🛡️ ARMOR CREW PROTECTED'
      : this.player.parachuting
      ? '🪂 PARACHUTE [WASD]'
      : this.player.downed
      ? 'INCAPACITATED'
      : isBhopping
      ? `⚡ BHOP ${curSpeedMps.toFixed(1)} M/S`
      : this.player.prone
      ? 'PRONE [Z]'
      : this.player.crouching
      ? 'CROUCHED [C]'
      : 'STANDING';
    this._setText(this.stanceBadgeEl, stanceStr);
    if (!inAircraftVitals) {
      const maxPlayerDressings =
        this.player.maxBandages || (this.player.role === 'medic' ? 9 : 2);
      if (this.player.role === 'medic') {
        const bagPct = Math.round(
          ((this.player.medicBagSupply ?? 600) / (this.player.maxMedicBagSupply || 600)) * 100
        );
        this._setText(this.bandageBadgeEl, `DRESSINGS: ${this.player.bandages}/${maxPlayerDressings} • BAG: ${bagPct}%`);
      } else {
        this._setText(this.bandageBadgeEl, `DRESSINGS: ${this.player.bandages}/${maxPlayerDressings}`);
      }
      this._setText(this.grenadeBadgeEl, `FRAGS [G]: ${this.player.grenades}`);
      if (backpackBadgeEl) {
        const curWep = this.player.currentWeapon ? this.player.currentWeapon() : null;
        const looseRds = curWep && typeof curWep.looseAmmo === 'number' ? curWep.looseAmmo : 0;
        const lootCount = Array.isArray(this.player.backpackItems)
          ? this.player.backpackItems.length
          : 0;
        this._setText(
          backpackBadgeEl,
          lootCount > 0
            ? `🎒 PACK [I]: +${looseRds}R • ${lootCount} LOOT`
            : `🎒 PACK [I]: +${looseRds} RDS`
        );
      }
    }

    if ((this.player.reloading || this.player.slowReloading) && !this.interactPromptEl.classList.contains('hidden')) {
      this.interactPromptEl.classList.add('hidden');
    }
    this.updateReloadAnimationHud(cur);

    if (this.player.reviveProgress > 0 && this.player.reviveTargetBot) {
      if (this.actionProgressEl.classList.contains('hidden')) {
        this.actionProgressEl.classList.remove('hidden');
      }
      this._setText(
        this.actionLabelEl,
        this.player.isDraggingAlly
          ? `DRAGGING ${this.player.reviveTargetBot.name} TO SAFE COVER (STOP TO REVIVE)...`
          : `WRAPPING BANDAGE — REVIVING ${this.player.reviveTargetBot.name}...`
      );
      this._setWidth(this.actionFillEl, `${Math.min(100, this.player.reviveProgress * 100).toFixed(1)}%`);
    } else if (this.player.bandageProgress > 0) {
      if (this.actionProgressEl.classList.contains('hidden')) {
        this.actionProgressEl.classList.remove('hidden');
      }
      this._setText(this.actionLabelEl, 'WRAPPING BANDAGE...');
      this._setWidth(this.actionFillEl, `${Math.min(100, this.player.bandageProgress * 100).toFixed(1)}%`);
    } else if (!this.actionProgressEl.classList.contains('hidden')) {
      // Reloading & slow bullet-packing now display the animated cutaway visualizer (#reload-anim-hud)
      this.actionProgressEl.classList.add('hidden');
    }

    if (activeVeh && activeVeh.isSecretOmegaFlyer) {
      this.vehicleOverlayEl.classList.add('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '1';
    } else if (activeVeh) {
      const activeSlot = activeVeh.activeWeaponSlot || 0;
      this._setText(this.weaponNameEl, activeVeh.name);
      if (activeVeh.isAircraft) {
        const aRole = activeVeh.aircraftRole || activeVeh.type;
        if (aRole === 'cas') {
          this._setText(this.ammoClipEl, activeSlot === 1 ? 'POD' : 'BRRT');
          this._setText(this.ammoReserveEl, activeSlot === 1 ? '70MM' : '30MM');
          this._setText(
            this.fireModeEl,
            '[1] 30MM GAU-8 AVENGER [LMB] • [2] HYDRA-70 ROCKETS [SPACE] • [9] SWITCH JET • [E] EJECT PARACHUTE'
          );
        } else if (aRole === 'gunship') {
          this._setText(this.ammoClipEl, activeSlot === 2 ? '105' : activeSlot === 1 ? '40MM' : '25MM');
          this._setText(this.ammoReserveEl, activeSlot === 2 ? 'HOWZ' : activeSlot === 1 ? 'BOFR' : 'GATL');
          const tgtAlt = Math.round(activeVeh.targetGunshipAlt || 200);
          const orbR = Math.round(activeVeh.orbitRadius || 220);
          const slantR = Math.round(activeVeh.slantRangeM || Math.hypot(tgtAlt, orbR));
          const bnkDeg = Math.round(((activeVeh.idealBankRad || 0.5) * 180) / Math.PI);
          this._setText(
            this.fireModeEl,
            activeVeh.gunshipManualFlight
              ? `✈️ ALT SET: ${tgtAlt}M [Q / Z OR ↑↓ = HEIGHT & RING] • [SCROLL] ZOOM • CYAN RING: ${orbR}M • [R] CIRCLE ${activeVeh.previewOrbitLabel || 'TARGET'}`
              : `🔄 ORBIT ${activeVeh.orbitAnchorLabel || 'TARGET'} • ALT ${tgtAlt}M [Q / Z OR ↑↓] • [SCROLL] ZOOM • CIRCLE ${orbR}M • SLANT ${slantR}M • [WASD] MOVE`
          );
        } else {
          // Combined Strike Fighter + Precision Ground Bomber
          const lockReady = this.player.aircraftLockTarget && this.player.aircraftLockProgress >= 1;
          this._setText(
            this.ammoClipEl,
            activeSlot === 2 ? 'JDAM' : activeSlot === 1 ? (lockReady ? 'LOCK' : 'SEEK') : '20MM'
          );
          this._setText(
            this.ammoReserveEl,
            activeSlot === 2 ? 'GBU' : activeSlot === 1 ? 'A2A' : 'VULC'
          );
          this._setText(
            this.fireModeEl,
            '[1] 20MM VULCAN • [2] AIM-120D A2A [SPACE] • [3] JDAM/GBU-28 BOMBS (CCIP) • [9] SWITCH JET • [E] EJECT'
          );
        }
      } else if (activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa') {
        const lockReady = this.player.aircraftLockTarget && this.player.aircraftLockProgress >= 1;
        this._setText(this.ammoClipEl, activeSlot === 1 ? (lockReady ? 'LOCK' : 'SAM') : '1050');
        this._setText(this.ammoReserveEl, activeSlot === 1 ? 'POD' : 'PROX');
        this._setText(
          this.fireModeEl,
          '[1] TWIN 25/30MM PROXIMITY AA [LMB] • [2] STINGER/9M311 SAM [SPACE] • [E] EXIT'
        );
      } else if (activeVeh.type === 'emplace_mortar') {
        const mRange = Math.round(this.player.mortarRangeM || 200);
        this._setText(this.ammoClipEl, activeSlot === 1 ? '3xHE' : '81MM');
        this._setText(this.ammoReserveEl, `${mRange}M`);
        this._setText(
          this.fireModeEl,
          `[1] 81MM INDIRECT HE (${mRange}M) [LMB] • [2] 3-ROUND BARRAGE [SPACE] • PITCH TO AIM RANGE`
        );
      } else if (activeVeh.type === 'trebuchet') {
        const mRange = Math.round(this.player.mortarRangeM || 200);
        this._setText(
          this.ammoClipEl,
          activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : '90KG'
        );
        this._setText(this.ammoReserveEl, `${mRange}M`);
        this._setText(
          this.fireModeEl,
          `FLAMING SIEGE BOULDER (${mRange}M ARC) [LMB] • [W/S] RANGE • [T] CREW / [G] WINCH`
        );
      } else if (activeVeh.type === 'warhorse') {
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        this._setText(
          this.ammoClipEl,
          activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : 'YEW'
        );
        this._setText(this.ammoReserveEl, `${spdKmh}KMH`);
        this._setText(
          this.fireModeEl,
          'MOUNTED YEW WARBOW (BODKIN ARROWS [LMB]) • CAVALRY GALLOP & TRAMPLE [WASD + SPACE]'
        );
      } else if (activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount') {
        const isTrex = activeVeh.type === 'trex_mount';
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        this._setText(this.ammoClipEl, isTrex ? 'JAWS' : 'CLAW');
        this._setText(this.ammoReserveEl, `${spdKmh}KMH`);
        this._setText(
          this.fireModeEl,
          isTrex
            ? 'CRUSHING THEROPOD JAWS & STOMP [LMB] • APEX ROAR & CHARGE [SPACE]'
            : 'SICKLE TALONS & VENOM SPIT [LMB] • PREDATOR POUNCE LEAP [SPACE]'
        );
      } else if (activeVeh.type === 'bike' || activeVeh.type === 'atv') {
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        const gearStr = activeVeh.isElectric ? 'EV' : `G${activeVeh.currentGear || 'N'}`;
        this._setText(this.ammoClipEl, `${spdKmh}`);
        this._setText(this.ammoReserveEl, `KM/H (${gearStr})`);
        this._setText(
          this.fireModeEl,
          activeVeh.type === 'atv'
            ? 'TWIN 9MM QUAD PDW [LMB] • [SPACE] OVERDRIVE BOOST • [WASD] STEER'
            : '9MM HANDLEBAR SMG [LMB] • [SPACE] WHEELIE / BOOST • [A/D] LEAN'
        );
      } else if (activeVeh.weaponType === 'tank_cannon') {
        const tankShells =
          activeVeh.ordnancePools && typeof activeVeh.ordnancePools.slot0 === 'number'
            ? activeVeh.ordnancePools.slot0
            : null;
        const maxTankShells = activeVeh.maxOrdnancePools?.slot0 || 24;
        if (this.player.vehicleSeatIndex === 2) {
          const rwsRds = activeVeh.ordnancePools?.slot1 ?? 1200;
          this._setText(this.ammoClipEl, activeVeh.coaxOverheated ? 'HOT' : `${rwsRds}`);
          this._setText(this.ammoReserveEl, '.50 RWS');
          this._setText(
            this.fireModeEl,
            'ROOF .50 CAL CROWS / KORD RWS (+60° HIGH-ANGLE ELEVATION [LMB / SPACE]) • [F1–F3] SEATS'
          );
        } else if (activeSlot === 2) {
          const atgmLeft = activeVeh.ordnancePools?.slot2 ?? 4;
          const maxAtgm = activeVeh.maxOrdnancePools?.slot2 || 4;
          this._setText(
            this.ammoClipEl,
            activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : `${atgmLeft}`
          );
          this._setText(this.ammoReserveEl, `/${maxAtgm} ATGM`);
          this._setText(
            this.fireModeEl,
            '[3] LASER-GUIDED ATGM (STEERS TO CROSSHAIR [LMB]) • [1] APFSDS SABOT • [2] COAX'
          );
        } else if (activeSlot === 1) {
          const coaxRds = activeVeh.ordnancePools?.slot1 ?? 1200;
          this._setText(this.ammoClipEl, activeVeh.coaxOverheated ? 'HOT' : `${coaxRds}`);
          this._setText(this.ammoReserveEl, '7.62 AP');
          this._setText(
            this.fireModeEl,
            '[2] COAX 7.62MM MG (+20° MANTLET LIMIT) • [3] GUIDED ATGM • [F3] ROOF .50 RWS'
          );
        } else {
          this._setText(
            this.ammoClipEl,
            activeVeh.fireCooldown > 0
              ? `${activeVeh.fireCooldown.toFixed(1)}s`
              : tankShells !== null
              ? `${tankShells}`
              : 'RDY'
          );
          this._setText(
            this.ammoReserveEl,
            tankShells !== null ? `/${maxTankShells} SABOT` : 'SABOT'
          );
          this._setText(
            this.fireModeEl,
            '[1] 780 M/S APFSDS SABOT [LMB] • [2/SPACE] COAX • [3] GUIDED ATGM • [F3] .50 RWS'
          );
        }
      } else if (activeVeh.weaponType === 'autocannon') {
        const acShells =
          activeVeh.ordnancePools && typeof activeVeh.ordnancePools.slot0 === 'number'
            ? activeVeh.ordnancePools.slot0
            : null;
        if (activeSlot === 2) {
          const towLeft = activeVeh.ordnancePools?.slot2 ?? 6;
          const maxTow = activeVeh.maxOrdnancePools?.slot2 || 6;
          this._setText(
            this.ammoClipEl,
            activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : `${towLeft}`
          );
          this._setText(this.ammoReserveEl, `/${maxTow} TOW`);
          this._setText(
            this.fireModeEl,
            '[3] WIRE-GUIDED TOW-2B / KORNET ATGM (STEERS TO CROSSHAIR [LMB]) • [1] 30MM'
          );
        } else {
          this._setText(
            this.ammoClipEl,
            activeSlot === 1 ? 'COAX' : acShells !== null ? `${acShells}` : '30MM'
          );
          this._setText(this.ammoReserveEl, activeSlot === 1 ? 'BELT' : '30MM HE');
          this._setText(
            this.fireModeEl,
            activeSlot === 1
              ? '[2] 950 RPM 7.62MM AP COAX [LMB / SPACE] • [1] 30MM • [3] TOW ATGM'
              : '[1] 460 M/S 30MM HE [LMB] • [2/SPACE] COAX MG • [3] WIRE-GUIDED TOW ATGM'
          );
        }
      } else {
        const hmgRds = activeVeh.ordnancePools?.slot0 ?? 400;
        this._setText(this.ammoClipEl, `${hmgRds}`);
        this._setText(this.ammoReserveEl, '.50 AP-I');
        this._setText(this.fireModeEl, 'ROOF .50 CAL M2HB RWS (720 RPM AP-I • +60° ELEVATION)');
      }
      if (this.magBarsRowEl) this.magBarsRowEl.innerHTML = '';
    } else if (cur) {
      this._setText(this.weaponNameEl, cur.def.name);
      this._setText(this.ammoClipEl, cur.clip);
      this._setText(this.ammoReserveEl, cur.reserve);
      let fireModeStr;
      if (cur.def.type === 'stinger') {
        const sTgt = this.player.stingerLockedTarget || this.player.stingerTrackingTarget;
        const sPct = Math.round((this.player.stingerLockProgress || 0) * 100);
        fireModeStr = sTgt
          ? this.player.stingerLockedTarget
            ? `🔒 IR LOCKED ON ${sTgt.name.split(' ')[0]} — FIRE [LMB]! • [3] SWAP TO RPG-7 AT`
            : `📡 SEEKING ${sTgt.name.split(' ')[0]} (${sPct}%) • [3] SWAP TO RPG-7 AT`
          : 'IR ANTI-AIR SAM (AIM AT ENEMY JET) • PRESS [3] AGAIN TO SWAP TO RPG-7 AT';
      } else if (cur.def.type === 'rpg') {
        fireModeStr = `${cur.def.caliber} • PRESS [3] AGAIN TO SWAP TO STINGER AA`;
      } else if (cur.def.type === 'melee_sword') {
        const dirIconMap = {
          UP: '▴ OVERHEAD CLEAVE',
          DOWN: '▾ HALF-SWORD THRUST',
          LEFT: '◂ LEFT ZORNHAU SWEEP',
          RIGHT: '▸ RIGHT ZORNHAU SLASH'
        };
        const gDir = this.player.meleeGuardDir || 'RIGHT';
        const dirTag = cur.def.isTwoHandedShield
          ? '🛡️ LMB: HEAVY SHIELD BASH (KNOCKBACK)'
          : cur.def.isPolearm
          ? gDir === 'UP'
            ? '🔱 LMB: HALBERD OVERHEAD CHOP'
            : '🔱 LMB: 5.8M SPEAR THRUST'
          : this.player.isAds && cur.def.id === 'longsword'
          ? '🛡️⚔️ LMB: SHIELD BASH + RIPOSTE THRUST'
          : `⚔️ ${dirIconMap[gDir] || '▸ RIGHT SLASH'}`;
        const blockTag = cur.def.isTwoHandedShield
          ? this.player.isAds
            ? '🛡️ RMB WALL: ACTIVE (-92% DMG)'
            : '🛡️ PASSIVE SHIELD: -35% (HOLD RMB: -92%)'
          : cur.def.id === 'longsword'
          ? this.player.isAds
            ? '🛡️ RMB SHIELD BLOCK: ACTIVE (-75% DMG)'
            : '🛡️ OFF-HAND SHIELD: -30% (HOLD RMB: -75%)'
          : cur.def.isPolearm
          ? this.player.isAds
            ? '🔱 RMB SPEAR BRACE: ACTIVE (-65% DMG)'
            : 'HOLD RMB: ANTI-CAVALRY SPEAR BRACE (-65%)'
          : this.player.isAds
          ? `⚔️ RMB ${gDir} PARRY: ACTIVE (-60% MELEE / -25% ARROW)`
          : 'HOLD RMB: 4-DIR ZWEIHÄNDER PARRY (-60% DMG)';
        fireModeStr = `${dirTag} • ${blockTag}`;
      } else {
        const mv = cur.def.muzzleVelocity ? ` • ${cur.def.muzzleVelocity} M/S` : '';
        fireModeStr = `${cur.def.caliber}${mv} • [F/V] INSPECT`;
      }
      this._setText(this.fireModeEl, fireModeStr);
      this.updateMagBars(cur);
    }

    // Update Zeroing, Arrow/Optic Type, and Fortification Blueprint Badges
    const isBowOrXbowActive = Boolean(
      (activeVeh && activeVeh.type === 'warhorse') ||
        (cur && cur.def && (cur.def.isBow || cur.def.isCrossbow))
    );
    if (this.zeroBadgeEl) {
      this._setText(
        this.zeroBadgeEl,
        isBowOrXbowActive
          ? `ELEV [X]: ${this.player.zeroDistance || 50}M`
          : `ZERO [X]: ${this.player.zeroDistance}m`
      );
    }
    if (this.cantedBadgeEl && (cur || (activeVeh && activeVeh.type === 'warhorse'))) {
      let cantedTxt;
      let cantedCol = '';
      if (isBowOrXbowActive) {
        const isFire = Boolean(this.player.fireArrowsActive);
        cantedTxt = isFire
          ? '🔥 [V] ARROW: FIRE ARROW (+BURN)'
          : '🏹 [V] ARROW: REGULAR BODKIN';
        cantedCol = isFire ? '#ff7f50' : '#7bed9f';
      } else if (!cur.def.opticType) {
        cantedTxt = 'OPTIC: IRON SIGHTS';
      } else if (Array.isArray(cur.def.zoomLevels) && cur.def.zoomLevels.length > 1) {
        const zIdx = Math.min(cur.def.zoomLevels.length - 1, Math.max(0, this.player.opticZoomIndex || 0));
        cantedTxt = this.player.useCantedSight
          ? 'OPTIC [V]: CANTED 45° (1X)'
          : `OPTIC [WHEEL/V]: ${cur.def.zoomLevels[zIdx]}X (${cur.def.zoomLevels.join('⇄')}X)`;
        cantedCol = '#00d2d3';
      } else if (cur.def.hasCantedSight) {
        cantedTxt = `OPTIC [V]: ${
          this.player.useCantedSight ? 'CANTED 45°' : cur.def.opticType.toUpperCase()
        }`;
      } else {
        cantedTxt = `OPTIC: ${cur.def.opticType.toUpperCase()}`;
      }
      this._setText(this.cantedBadgeEl, cantedTxt);
      if (this.cantedBadgeEl._lastCol !== cantedCol) {
        this.cantedBadgeEl._lastCol = cantedCol;
        this.cantedBadgeEl.style.color = cantedCol;
      }
    }
    if (this.blueprintBadgeEl) {
      const bpName =
        typeof this.player.getBlueprintName === 'function'
          ? this.player.getBlueprintName()
          : 'CHEST WALL';
      const stashCd = Math.ceil(this.player.ammoStashCooldown || 0);
      const stashText = stashCd > 0 ? `STASH [7]: ${stashCd}s` : 'STASH [7]: RDY';
      const isModernEra = (this.world?.era || 'modern') === 'modern';
      this._setText(
        this.blueprintBadgeEl,
        isModernEra
          ? `BUILD [F/T/B]: ${bpName} • 🏰 EMPLACE [8] • ✈️ JET/AC-130 [9] • ${stashText}`
          : `BUILD [F/T/B]: ${bpName} • 🏰 FORTIFY [8] • ${stashText}`
      );
    }

    const selWepIndNameEl = this.el('selected-weapon-indicator-name');
    if (selWepIndNameEl) {
      if (activeVeh && activeVeh.isSecretOmegaFlyer) {
        this.vehicleOverlayEl.classList.add('hidden');
        this.scopeOverlayEl.classList.add('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
        this.crosshairEl.style.opacity = '1';
      } else if (activeVeh && activeVeh.type === 'warhorse') {
        const wSlot = activeVeh.activeWeaponSlot || 0;
        const arrTag = this.player.fireArrowsActive ? '🔥 FIRE ARROWS' : 'BODKIN ARROWS';
        this._setText(
          selWepIndNameEl,
          wSlot === 1
            ? '[2] COUCHED CAVALRY LANCE (PRESS [1] FOR LONGBOW)'
            : `[1] ROYAL YEW LONGBOW (${arrTag} • [V] TOGGLE FIRE • [2] LANCE)`
        );
      } else if (activeVeh) {
        const vSlot = (activeVeh.activeWeaponSlot || 0) + 1;
        this._setText(selWepIndNameEl, `[VEHICLE SLOT ${vSlot}] ${activeVeh.name}`);
      } else if (cur && cur.def) {
        const sIdx = (this.player.currentSlotIndex || 0) + 1;
        const wId = cur.def.id;
        const eqSkin =
          wId === 'hammer'
            ? this.player.equippedHammerSkin
            : this.player.equippedWeaponSkins?.[wId];
        const skinSuffix =
          eqSkin === 'pure_gold'
            ? ' • ★ 24K GOLD'
            : eqSkin === 'pure_blue'
            ? ' • ★ SAPPHIRE BLUE'
            : eqSkin === 'karambit'
            ? ' • ★ KARAMBIT GOLD'
            : eqSkin === 'butterfly'
            ? ' • ★ BUTTERFLY SAPPHIRE'
            : '';
        this._setText(selWepIndNameEl, `[SLOT ${sIdx}] ${cur.def.name}${skinSuffix}`);
      }
    }

    for (let i = 0; i < 4; i++) {
      const slotEl = this.el(`slot-${i + 1}`);
      if (slotEl) {
        const isActiveSlot = i === this.player.currentSlotIndex && !activeVeh;
        if (slotEl.classList.contains('active') !== isActiveSlot) {
          slotEl.classList.toggle('active', isActiveSlot);
        }
        const sDef = this.player.slots[i]?.def;
        if (sDef) {
          const isEngSlot3 = i === 2 && this.player.role === 'engineer';
          const shortLbl = isEngSlot3
            ? `${sDef.shortName || sDef.name} [AT/AA]`
            : sDef.shortName || sDef.name;
          const expectedText = `${i + 1}:${shortLbl}`;
          if (slotEl.dataset.label !== expectedText) {
            slotEl.dataset.label = expectedText;
            slotEl.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-title">${shortLbl}</span><span class="slot-active-pill">▲ SELECTED</span>`;
          }
        }
      }
    }

    // Throttled HUD updates to eliminate 60Hz DOM layout thrashing & boost FPS
    this._rosterTimer -= dt;
    if (this._rosterTimer <= 0) {
      this._rosterTimer = UI.ROSTER_UPDATE_INTERVAL; // 4 Hz
      const remoteCount = this.network.remotePlayers.size;
      const activeAiCnt =
        typeof this.botManager.getActiveBotCount === 'function'
          ? this.botManager.getActiveBotCount()
          : this.botManager.bots.length;
      if (this.network && this.network.isMultiplayer()) {
        const netSum = this.network.getTransportSummary?.() || { label: 'MULTIPLAYER' };
        this.netLabelEl.textContent = `${netSum.label} [${this.network.roomCode}] • ${
          1 + remoteCount
        }P + ${activeAiCnt} AI`;
      } else {
        this.netLabelEl.textContent = `🎮 OFFLINE SOLO • ${1 + activeAiCnt} PLAYERS (1 YOU + ${activeAiCnt} AI)`;
      }
      this.updateCommandOrderHud();
      this.updateSquadRoster();
    }

    this._markerTimer -= dt;
    if (this._markerTimer <= 0) {
      this._markerTimer = UI.MARKER_UPDATE_INTERVAL; // 20 Hz
      this.updateWorldSpaceMarkers();
    }

    this._minimapTimer -= dt;
    if (this._minimapTimer <= 0) {
      this._minimapTimer = UI.MINIMAP_UPDATE_INTERVAL; // 15 Hz
      this.drawMinimap();
      const cmdModalVisible =
        typeof this.isCommandModalVisible === 'function'
          ? this.isCommandModalVisible()
          : Boolean(
              this.el('command-modal') &&
                !this.el('command-modal').classList.contains('hidden') &&
                this.el('command-modal').style.display !== 'none'
            );
      if (cmdModalVisible) {
        const cmdMapCanvas = this.el('cmd-tactical-map-canvas');
        if (cmdMapCanvas && cmdMapCanvas.offsetParent !== null) {
          this.drawCommandTacticalMap(cmdMapCanvas);
        }
      }
    }

    // Suppression visual overlay (Squad-style screen darkening when suppressed)
    this.updateSuppressionOverlay();

    // Kill streak HUD badge + War Crimes (Medics Killed) HUD badge + Forward Base Defender Buff badge
    this.updateKillStreakBadge();
    this.updateWarCrimeBadge();
    this.updateForwardBaseDefenseBadge();

    // Commander UAV HUD indicator
    this.updateUAVOverlay();

    // Commo Rose chat callout decay
    this.updateCommoCallout(dt);

    // Airstrike inbound countdown
    this.updateAirstrikeHUD();
  },

  /**
   * Dedicated Visual Aircraft Cockpit Flight Instrument Cluster (`#aircraft-cockpit-hud`):
   * - Analog + Digital Airspeed Indicator (Speedometer Dial + Rotating Needle + Cruise Bug + Throttle Bar)
   * - Turn Coordinator (Banking Miniature Aircraft Silhouette + Standard-Rate Turn Marks)
   * - Slip / Skid Inclinometer ("Ball-in-Curved-Tube" that shifts left/right with slip & skid forces)
   * - Artificial Horizon (ADI Pitch/Roll Sphere) + Vertical Altimeter & VSI Bars
   * - Visual Ordnance Pylon & Countermeasure Strip ([1], [2], [3], [X])
   */
  updateAircraftCockpitHud(v, dt = 0.016) {
    if (!v || !v.isAircraft) return;
    // Throttle SVG transform & MFD 2D canvas redraws to ~30 Hz so uncapped 200+ FPS never thrashes browser SVG layout!
    this._airCockpitHudAccum = (this._airCockpitHudAccum || 0) + dt;
    if (this._airCockpitHudAccum < 0.032 && this._lastAirCockpitVeh === v) {
      return;
    }
    const hudDt = Math.min(0.1, this._airCockpitHudAccum || dt);
    this._airCockpitHudAccum = 0;
    this._lastAirCockpitVeh = v;
    dt = hudDt;

    // Bind interactive pylon click handlers once
    if (!this._airCockpitPylonsBound) {
      this._airCockpitPylonsBound = true;
      [0, 1, 2].forEach((slotIdx) => {
        const pEl = this.el(`air-pylon-${slotIdx + 1}`);
        if (pEl) {
          pEl.style.cursor = 'pointer';
          pEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (this.player?.activeVehicle?.isAircraft) {
              this.player.activeVehicle.activeWeaponSlot = slotIdx;
            }
          });
        }
      });
      const cmEl = this.el('air-pylon-cm');
      if (cmEl) {
        cmEl.style.cursor = 'pointer';
        cmEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.player?.activateVehicleCountermeasure?.();
        });
      }
    }

    const aRole = v.aircraftRole || v.type || 'fighter';
    const isWright = aRole === 'wright_flyer';
    const isB2 = aRole === 'b2_spirit';
    const isCas = aRole === 'cas';
    const isGunship = aRole === 'gunship';

    // 1. Header Bar: Aircraft Tail Badge, Airframe Integrity Bar & Heading / G-Load Pill
    const iconEl = this.el('air-hud-icon');
    const modelEl = this.el('air-hud-model');
    if (iconEl) {
      iconEl.textContent = isWright ? '🪁' : isB2 ? '🦇' : isGunship ? '🛸' : '✈️';
    }
    if (modelEl) {
      modelEl.textContent = isWright
        ? v.team === 'RU'
          ? '1913 ILYA MUROMETS'
          : '1903 WRIGHT FLYER I'
        : isB2
        ? v.team === 'RU'
          ? 'TUPOLEV PAK DA'
          : 'B-2A SPIRIT STEALTH'
        : isCas
        ? v.team === 'RU'
          ? 'SU-25SM FROGFOOT'
          : 'A-10C WARTHOG'
        : isGunship
        ? v.team === 'RU'
          ? 'TU-95MS GUNSHIP'
          : 'AC-130J GHOSTRIDER'
        : v.team === 'RU'
        ? 'SU-57 FELON'
        : 'F-15EX EAGLE';
    }

    const rawHpPct = v.isShotDown
      ? 0
      : Math.max(0, Math.min(100, Math.round(((v.hp || 0) / (v.maxHp || 1500)) * 100)));
    let airframePct = rawHpPct;
    let worstPartTag = '';
    let worstPartPct = 100;
    if (!v.isShotDown && v.airframeParts) {
      const ap = v.airframeParts;
      const partEntries = [
        ['ENG', ap.engines ?? 100],
        ['L.WING', ap.leftWing ?? 100],
        ['R.WING', ap.rightWing ?? 100],
        ['TAIL', ap.tail ?? 100],
        ['RADAR', ap.avionics ?? 100],
        ['CANOPY', ap.cockpit ?? 100]
      ];
      let sumPct = 0;
      for (let pi = 0; pi < partEntries.length; pi++) {
        const [lbl, val] = partEntries[pi];
        sumPct += val;
        if (val < worstPartPct) {
          worstPartPct = val;
          worstPartTag = lbl;
        }
      }
      const avgPartPct = sumPct / partEntries.length;
      const structuralPct = Math.round(avgPartPct * 0.62 + worstPartPct * 0.38);
      airframePct = Math.min(rawHpPct, structuralPct);
    }
    const barSeverityPct = Math.min(
      airframePct,
      worstPartPct <= 30 ? 24 : worstPartPct <= 65 ? 52 : airframePct
    );
    const hpFillEl = this.el('air-hud-hp-fill');
    const hpValEl = this.el('air-hud-hp-val');
    if (hpFillEl) {
      hpFillEl.style.width = `${airframePct}%`;
      hpFillEl.style.background =
        barSeverityPct > 65
          ? 'linear-gradient(90deg, #27ae60, #2ecc71)'
          : barSeverityPct > 30
          ? 'linear-gradient(90deg, #e67e22, #f1c40f)'
          : 'linear-gradient(90deg, #c0392b, #ff4757)';
      if (hpFillEl.parentElement) {
        hpFillEl.parentElement.style.borderColor =
          barSeverityPct > 65
            ? 'rgba(46, 204, 113, 0.45)'
            : barSeverityPct > 30
            ? 'rgba(241, 196, 15, 0.55)'
            : 'rgba(255, 71, 87, 0.72)';
      }
    }
    if (hpValEl) {
      const dmgSuffix =
        !v.isShotDown && worstPartPct < 75 && worstPartTag
          ? ` • ${worstPartPct <= 30 ? '⚠️' : ''}${worstPartTag} ${Math.round(worstPartPct)}%`
          : '';
      hpValEl.textContent = v.isShotDown ? 'MAYDAY' : `${airframePct}%${dmgSuffix}`;
      hpValEl.style.color =
        barSeverityPct > 65 ? '#7bed9f' : barSeverityPct > 30 ? '#f1c40f' : '#ff6b6b';
    }

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let hdgDeg = Math.round(((-(v.yaw || 0) * 180) / Math.PI) % 360);
    if (hdgDeg < 0) hdgDeg += 360;
    const hdgDirStr = dirs[Math.round(hdgDeg / 45) % 8];

    // Load factor G-force from bank angle (1 / cos(roll)) + pitch rate
    const rollRad = v.roll || 0;
    const pitchRad = v.pitch || 0;
    const gLoad = Math.min(
      9.0,
      Math.max(0.5, 1.0 / Math.max(0.22, Math.cos(Math.min(1.25, Math.abs(rollRad)))) + Math.max(0, pitchRad * 1.4))
    );
    const hdgPillEl = this.el('air-hud-hdg-pill');
    if (hdgPillEl) {
      hdgPillEl.textContent = v.isShotDown
        ? '🚨 SHOT DOWN — PRESS [E] EJECT!'
        : v.isStalling
        ? '⚠️ STALL — HOLD [W] & NOSE DOWN!'
        : `HDG ${String(hdgDeg).padStart(3, '0')}° ${hdgDirStr} • ${gLoad.toFixed(1)}G`;
      hdgPillEl.style.color = v.isShotDown || v.isStalling ? '#ff6b6b' : '';
    }

    // 2. Per-Aircraft Realistic Speedometer Envelope & Dynamic SVG Arcs
    const spdMs = Math.max(0, v.forwardSpeed || 0);
    const kmh = Math.round(spdMs * 3.6);
    const kts = Math.round(spdMs * 1.94384);
    const mach = (spdMs / 340.3).toFixed(2);
    const scaleMaxKmh = isWright
      ? kmh <= 115
        ? 120
        : 900
      : isGunship
      ? 300
      : isCas
      ? 420
      : isB2 || aRole === 'bomber'
      ? 600
      : 720;

    const minKmh = (v.minSpeed || 30) * 3.6;
    const cruiseKmh = (v.speed || 62) * 3.6;
    const maxKmh = (v.maxSpeed || 96) * 3.6;
    const asiArcSig = `${aRole}_${scaleMaxKmh}_${Math.round(minKmh)}_${Math.round(maxKmh)}`;

    if (this._lastAsiScaleSig !== asiArcSig) {
      this._lastAsiScaleSig = asiArcSig;
      const step = scaleMaxKmh / 6;
      for (let i = 0; i <= 6; i++) {
        const lblEl = this.el(`asi-lbl-${i}`);
        if (lblEl) lblEl.textContent = String(Math.round(i * step));
      }
      const makeArc = (deg0, deg1) => {
        const a0 = Math.max(-120, Math.min(120, deg0));
        const a1 = Math.max(a0 + 1, Math.min(120, deg1));
        const r0 = ((a0 - 90) * Math.PI) / 180;
        const r1 = ((a1 - 90) * Math.PI) / 180;
        const x0 = (65 + 48 * Math.cos(r0)).toFixed(1);
        const y0 = (65 + 48 * Math.sin(r0)).toFixed(1);
        const x1 = (65 + 48 * Math.cos(r1)).toFixed(1);
        const y1 = (65 + 48 * Math.sin(r1)).toFixed(1);
        const largeArc = a1 - a0 > 180 ? 1 : 0;
        return `M ${x0} ${y0} A 48 48 0 ${largeArc} 1 ${x1} ${y1}`;
      };
      const stallDeg = -120 + Math.min(0.45, Math.max(0.05, minKmh / scaleMaxKmh)) * 240;
      const greenEndDeg = -120 + Math.min(0.85, Math.max(0.32, (cruiseKmh * 1.18) / scaleMaxKmh)) * 240;
      const yellowEndDeg = -120 + Math.min(0.95, Math.max(0.55, (maxKmh * 0.9) / scaleMaxKmh)) * 240;
      const maxArcDeg = -120 + Math.min(1.0, Math.max(0.68, maxKmh / scaleMaxKmh)) * 240;
      this.el('asi-arc-stall')?.setAttribute('d', makeArc(-120, stallDeg));
      this.el('asi-arc-green')?.setAttribute('d', makeArc(stallDeg, greenEndDeg));
      this.el('asi-arc-yellow')?.setAttribute('d', makeArc(greenEndDeg, yellowEndDeg));
      this.el('asi-arc-ab')?.setAttribute('d', makeArc(yellowEndDeg, Math.max(yellowEndDeg + 6, maxArcDeg)));
    }

    // Rotate Speedometer Needle (-120° at 0 km/h to +120° at scaleMaxKmh)
    const asiNeedleEl = this.el('air-asi-needle');
    if (asiNeedleEl) {
      const needleFrac = Math.max(0, Math.min(1.04, kmh / scaleMaxKmh));
      const needleDeg = -120 + needleFrac * 240;
      asiNeedleEl.setAttribute('transform', `rotate(${needleDeg.toFixed(1)} 65 65)`);
    }

    // Rotate Cruise Speed Bug on outer dial rim
    const cruiseBugEl = this.el('air-asi-cruise-bug');
    if (cruiseBugEl) {
      const cruiseDeg = -120 + Math.max(0, Math.min(1, cruiseKmh / scaleMaxKmh)) * 240;
      cruiseBugEl.setAttribute('transform', `rotate(${cruiseDeg.toFixed(1)} 65 65)`);
    }

    const wHeld = Boolean(this.player?.keys?.['KeyW']);
    const sHeld = Boolean(this.player?.keys?.['KeyS']);

    const asiKmhEl = this.el('air-asi-kmh');
    const asiKtsEl = this.el('air-asi-kts');
    const asiMachEl = this.el('air-asi-mach');
    if (asiKmhEl) {
      asiKmhEl.textContent = String(kmh).padStart(3, '0');
      asiKmhEl.setAttribute(
        'fill',
        v.isShotDown || v.isStalling || kmh <= minKmh * 1.06
          ? '#ff4757'
          : wHeld || kmh >= maxKmh * 0.92
          ? '#00d2d3'
          : '#7bed9f'
      );
    }
    if (asiKtsEl) {
      asiKtsEl.textContent = `${kts}KT`;
    }
    if (asiMachEl) {
      const stateTag = v.isShotDown
        ? '🚨 EJECT [E]'
        : v.isStalling || kmh <= minKmh * 1.06
        ? '⚠️ STALL'
        : wHeld || kmh >= maxKmh * 0.92
        ? isWright
          ? '⚡ MAX SPOOL'
          : '⚡ AB/WEP'
        : sHeld
        ? '🛑 BRAKE'
        : 'CRUISE';
      asiMachEl.textContent = `M ${mach} • ${stateTag}`;
      asiMachEl.setAttribute(
        'fill',
        v.isShotDown || v.isStalling || kmh <= minKmh * 1.06
          ? '#ff6b6b'
          : wHeld
          ? '#00d2d3'
          : sHeld
          ? '#f39c12'
          : '#f1c40f'
      );
    }

    // Vertical Throttle Bar (0% to 100%)
    const spdSpan = Math.max(1, maxKmh - minKmh * 0.6);
    const rawThrPct =
      typeof v.throttle === 'number'
        ? Math.round(v.throttle * 100)
        : Math.round(((kmh - minKmh * 0.6) / spdSpan) * 100);
    const thrPct = Math.max(4, Math.min(100, rawThrPct));
    const thrFillEl = this.el('air-thr-fill');
    const thrValEl = this.el('air-thr-val');
    if (thrFillEl) {
      thrFillEl.style.height = `${thrPct}%`;
      thrFillEl.style.background = wHeld
        ? 'linear-gradient(180deg, #00d2d3 0%, #48dbfb 50%, #2ecc71 100%)'
        : sHeld
        ? 'linear-gradient(180deg, #f39c12 0%, #e67e22 100%)'
        : 'linear-gradient(180deg, #2ecc71 0%, #27ae60 100%)';
    }
    if (thrValEl) {
      thrValEl.textContent = wHeld ? 'AB' : `${thrPct}%`;
      thrValEl.style.color = wHeld ? '#00d2d3' : sHeld ? '#f39c12' : '#7bed9f';
    }

    // 2B. Analog Engine RPM / %N1 Tachometer Meter (`#air-rpm-svg` right beside Speedometer!)
    const targetRpmPct = v.isShotDown
      ? 0
      : wHeld
      ? isWright || isGunship
        ? 102
        : 108
      : sHeld
      ? 32
      : Math.max(46, Math.min(98, 44 + (spdMs / Math.max(1, v.maxSpeed || 95)) * 54));
    this._smoothedAirRpmPct =
      typeof this._smoothedAirRpmPct === 'number' && this._lastRpmVeh === v
        ? this._smoothedAirRpmPct + (targetRpmPct - this._smoothedAirRpmPct) * Math.min(1, dt * 6.5)
        : targetRpmPct;
    this._lastRpmVeh = v;

    const rpmPctRound = Math.max(0, Math.round(this._smoothedAirRpmPct));
    const rpmNeedleEl = this.el('air-rpm-needle');
    if (rpmNeedleEl) {
      const rpmNeedleDeg = -120 + Math.max(0, Math.min(1.0, this._smoothedAirRpmPct / 110)) * 240;
      rpmNeedleEl.setAttribute('transform', `rotate(${rpmNeedleDeg.toFixed(1)} 65 65)`);
    }
    const rpmUnitLblEl = this.el('air-rpm-unit-lbl');
    if (rpmUnitLblEl) {
      this._setText(rpmUnitLblEl, isWright ? 'PROP RPM' : isGunship ? 'TRBPRP %' : 'N1 ×10%');
    }
    const rpmPctEl = this.el('air-rpm-pct');
    if (rpmPctEl) {
      const rpmModeSuffix = v.isShotDown
        ? 'FAIL'
        : rpmPctRound > 100
        ? 'WEP/AB'
        : isGunship || isWright
        ? 'PROP'
        : 'N1';
      this._setText(rpmPctEl, v.isShotDown ? '0% FAIL' : `${rpmPctRound}% ${rpmModeSuffix}`);
      rpmPctEl.setAttribute(
        'fill',
        v.isShotDown ? '#ff4757' : rpmPctRound > 100 ? '#ff6b81' : rpmPctRound >= 90 ? '#f1c40f' : '#ff9f43'
      );
    }
    const rpmNumEl = this.el('air-rpm-num');
    if (rpmNumEl) {
      const maxNominalRpm = isWright ? 1450 : isGunship ? 2200 : isCas ? 7600 : 8800;
      const actualRpm = Math.round((this._smoothedAirRpmPct / 100) * maxNominalRpm);
      this._setText(rpmNumEl, `${actualRpm.toLocaleString()} RPM`);
      rpmNumEl.setAttribute('fill', v.isShotDown ? '#ff6b6b' : wHeld ? '#00d2d3' : '#7bed9f');
    }

    // 3. Turn Coordinator & Slip/Skid Inclinometer ("Step on the Ball")
    let rawYawRate = 0;
    if (this._lastAirHudVeh === v && typeof this._lastAirHudYaw === 'number' && dt > 0.0005) {
      let dYaw = (v.yaw || 0) - this._lastAirHudYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      rawYawRate = dYaw / Math.max(0.004, Math.min(0.1, dt));
    }
    this._lastAirHudVeh = v;
    this._lastAirHudYaw = v.yaw || 0;
    this._smoothedYawRate =
      (this._smoothedYawRate || 0) + (rawYawRate - (this._smoothedYawRate || 0)) * Math.min(1, dt * 8.5);

    // Bank angle in degrees (negative = left wing down on cockpit dial, positive = right wing down)
    const bankDeg = Math.round(((-rollRad * 180) / Math.PI));
    const turnRateDegPerSec = Math.round(((-this._smoothedYawRate * 180) / Math.PI));
    const tcPlaneAngle = Math.max(-38, Math.min(38, bankDeg * 0.65 + turnRateDegPerSec * 0.28));

    const tcPlaneEl = this.el('air-tc-plane');
    if (tcPlaneEl) {
      tcPlaneEl.setAttribute('transform', `rotate(${tcPlaneAngle.toFixed(1)} 65 54)`);
    }
    const tcRateValEl = this.el('air-tc-rate-val');
    if (tcRateValEl) {
      const bankSide = bankDeg < -2 ? 'L' : bankDeg > 2 ? 'R' : 'LVL';
      tcRateValEl.textContent = `${Math.abs(bankDeg)}° ${bankSide} • ${Math.abs(turnRateDegPerSec)}°/S`;
    }

    // Slip / Skid Ball Physics inside the Curved Inclinometer Glass Tube:
    // - Coordinated turn rate for current bank angle: sin(roll) * turnRate * 1.15
    // - Uncoordinated yaw demand (yawDiff or A/D rudder input) creates centrifugal SKID toward outside of turn
    // - Banking without matching turn rate creates gravitational SLIP toward inside (low wing) of turn
    let yawDiff = (this.player?.yaw || 0) - (v.yaw || 0);
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const bankKey = (this.player?.keys?.['KeyA'] ? 1 : 0) - (this.player?.keys?.['KeyD'] ? 1 : 0);
    const coordYawRate = Math.sin(rollRad) * (v.turnRate || 1.35) * 1.15;

    const rawSlipBall = Math.max(
      -1,
      Math.min(
        1,
        (this._smoothedYawRate - coordYawRate * 0.82) * 0.95 +
          yawDiff * 1.35 +
          bankKey * 0.35 -
          Math.sin(rollRad) * 0.32
      )
    );
    this._smoothedSlipBall =
      (this._smoothedSlipBall || 0) + (rawSlipBall - (this._smoothedSlipBall || 0)) * Math.min(1, dt * 7.5);

    const slipBallEl = this.el('air-slip-ball');
    if (slipBallEl) {
      const ballDx = this._smoothedSlipBall * 24;
      const ballDy = -(this._smoothedSlipBall * this._smoothedSlipBall) * 5.2;
      slipBallEl.setAttribute('transform', `translate(${ballDx.toFixed(1)}, ${ballDy.toFixed(1)})`);
    }

    const slipStatusEl = this.el('air-slip-status');
    if (slipStatusEl) {
      const absBall = Math.abs(this._smoothedSlipBall);
      if (absBall <= 0.16) {
        slipStatusEl.textContent = '● COORDINATED';
        slipStatusEl.setAttribute('fill', '#2ecc71');
      } else {
        const isSlip =
          (rollRad > 0.06 && this._smoothedSlipBall < -0.16) ||
          (rollRad < -0.06 && this._smoothedSlipBall > 0.16);
        const dirArrow = this._smoothedSlipBall < 0 ? '◄ ' : ' ►';
        const label = isSlip ? 'SLIP' : 'SKID';
        slipStatusEl.textContent =
          this._smoothedSlipBall < 0 ? `${dirArrow}${label} (STEP L)` : `${label} (STEP R)${dirArrow}`;
        slipStatusEl.setAttribute('fill', isSlip ? '#f1c40f' : '#ff6b6b');
      }
    }

    // 4. Artificial Horizon (ADI Sphere) + Altimeter & Vertical Speed (VSI)
    const adiRollGroup = this.el('air-adi-roll-group');
    const adiPitchGroup = this.el('air-adi-pitch-group');
    if (adiRollGroup) {
      adiRollGroup.setAttribute('transform', `rotate(${(-bankDeg).toFixed(1)} 56 58)`);
    }
    if (adiPitchGroup) {
      const pitchDeg = (pitchRad * 180) / Math.PI;
      const pitchPx = Math.max(-30, Math.min(30, pitchDeg * 0.65));
      adiPitchGroup.setAttribute('transform', `translate(0, ${pitchPx.toFixed(1)})`);
    }

    const groundY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const altAgl = Math.max(0, Math.round(v.pos.y - groundY));
    const vsiMs = Math.round(v.velVector ? v.velVector.y : Math.sin(pitchRad) * spdMs);
    const vsiStr = `${vsiMs >= 0 ? '+' : ''}${vsiMs}M/S`;

    const adiFooterEl = this.el('air-adi-footer');
    const ceilM = v.serviceCeilingM || 15000;
    if (adiFooterEl) {
      adiFooterEl.textContent =
        altAgl >= 2500
          ? `ALT ${(altAgl / 1000).toFixed(2)}KM / CEIL ${(ceilM / 1000).toFixed(1)}KM • ${vsiStr}`
          : `ALT ${altAgl}M • VSI ${vsiStr}`;
    }
    const altFillEl = this.el('air-alt-fill');
    if (altFillEl) {
      const barRefM = altAgl > 1000 ? ceilM : 1000;
      const altPct = Math.max(4, Math.min(100, Math.round((altAgl / Math.max(350, barRefM)) * 100)));
      altFillEl.style.height = `${altPct}%`;
    }
    const altValEl = this.el('air-alt-val');
    if (altValEl) {
      altValEl.textContent = altAgl >= 10000 ? `${(altAgl / 1000).toFixed(1)}KM` : `${altAgl}M`;
    }
    const vsiValEl = this.el('air-vsi-val');
    if (vsiValEl) {
      vsiValEl.textContent = altAgl < 28 ? '🦇 MASK' : vsiStr;
      vsiValEl.style.color = altAgl < 28 ? '#00ffcc' : vsiMs > 2 ? '#7bed9f' : vsiMs < -8 ? '#ff7675' : '#bdc3c7';
    }

    // 4A-2. Side-Elevation Climb / Dive Aircraft Profile (`#air-pitch-profile-svg` vs. Horizontal 0° Line!)
    const profGroupEl = this.el('air-profile-plane-group');
    const profShapeEl = this.el('air-profile-shape');
    const profFooterEl = this.el('air-profile-footer');
    if (profShapeEl && this._lastAirProfileRole !== aRole) {
      this._lastAirProfileRole = aRole;
      if (isB2) {
        profShapeEl.innerHTML = `
          <polygon points="24,57 34,53 56,50 74,53 85,56 72,58 46,59" fill="rgba(0,210,211,0.36)" stroke="#00d2d3" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 58 50 Q 65 47 71 52 Z" fill="#81ecec" opacity="0.85"/>
        `;
      } else if (isGunship) {
        profShapeEl.innerHTML = `
          <polygon points="24,58 22,42 32,43 37,52 72,52 83,56 80,60 34,60" fill="rgba(241,196,15,0.36)" stroke="#f1c40f" stroke-width="1.5" stroke-linejoin="round"/>
          <line x1="48" y1="51" x2="66" y2="51" stroke="#ffeaa7" stroke-width="2.4"/>
          <rect x="74" y="53" width="6" height="3" fill="#81ecec" opacity="0.85"/>
        `;
      } else if (isWright) {
        profShapeEl.innerHTML = `
          <line x1="26" y1="56" x2="80" y2="56" stroke="#f39c12" stroke-width="2"/>
          <line x1="44" y1="49" x2="72" y2="49" stroke="#ffeaa7" stroke-width="2.2"/>
          <line x1="44" y1="59" x2="72" y2="59" stroke="#ffeaa7" stroke-width="2.2"/>
          <line x1="50" y1="49" x2="50" y2="59" stroke="#d35400" stroke-width="1.3"/>
          <line x1="66" y1="49" x2="66" y2="59" stroke="#d35400" stroke-width="1.3"/>
        `;
      } else {
        profShapeEl.innerHTML = `
          <polygon points="26,57 22,45 31,45 36,53 56,52 67,49 75,53 84,56 74,59 54,60 32,59" fill="rgba(241,196,15,0.38)" stroke="#f1c40f" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 55 52 Q 63 47 70 52 Z" fill="#48dbfb" opacity="0.85"/>
          <polygon id="air-profile-ab-flame" points="25,54 14,56 25,58" fill="#00d2d3" opacity="0.7"/>
        `;
      }
    }
    const flightPathPitchDeg = (Math.atan2(vsiMs, Math.max(8, spdMs)) * 180) / Math.PI;
    const rawBodyPitchDeg = (pitchRad * 180) / Math.PI;
    const effPitchDeg = Math.round(
      Math.abs(rawBodyPitchDeg) >= Math.abs(flightPathPitchDeg)
        ? rawBodyPitchDeg
        : rawBodyPitchDeg * 0.45 + flightPathPitchDeg * 0.55
    );
    if (profGroupEl) {
      const clampedVisualPitch = Math.max(-42, Math.min(42, effPitchDeg));
      // Nose points right (+X), so negative SVG rotation pitches nose UP above the horizontal y=56 line
      profGroupEl.setAttribute('transform', `rotate(${(-clampedVisualPitch).toFixed(1)} 54 56)`);
      const abFlameEl = this.el('air-profile-ab-flame');
      if (abFlameEl) {
        abFlameEl.setAttribute('opacity', wHeld ? '0.95' : sHeld ? '0.15' : '0.45');
      }
    }
    if (profFooterEl) {
      const pSign = effPitchDeg > 0 ? `+${effPitchDeg}°` : `${effPitchDeg}°`;
      if (vsiMs >= 2 || effPitchDeg >= 3) {
        this._setText(profFooterEl, `▲ CLIMB ${pSign} • ${vsiStr}`);
        profFooterEl.setAttribute('fill', '#7bed9f');
      } else if (vsiMs <= -2 || effPitchDeg <= -3) {
        this._setText(profFooterEl, `▼ DIVE ${pSign} • ${vsiStr}`);
        profFooterEl.setAttribute('fill', vsiMs <= -14 ? '#ff6b6b' : '#ff9f43');
      } else {
        this._setText(profFooterEl, `● LVL ${pSign} • ${vsiStr}`);
        profFooterEl.setAttribute('fill', '#81ecec');
      }
    }

    // 4A-3. Dedicated Rotating 360° Magnetic Compass (`#air-compass-svg`) + Mission Waypoint Bearing Bug!
    const compassRingEl = this.el('air-compass-ring');
    if (compassRingEl) {
      compassRingEl.setAttribute('transform', `rotate(${(-hdgDeg).toFixed(1)} 56 56)`);
    }
    const compassBugEl = this.el('air-compass-tgt-bug');
    const compassFooterEl = this.el('air-compass-footer');
    let navTargetX = null;
    let navTargetZ = null;
    let navTag = '';
    if (this.player?.activePing && this.player.activePing.timer > 0 && this.player.activePing.pos) {
      navTargetX = this.player.activePing.pos.x;
      navTargetZ = this.player.activePing.pos.z;
      navTag = 'WP';
    } else if (this.world?.activeCasRequest && this.world.activeCasRequest.timer > 0 && this.world.activeCasRequest.team === v.team) {
      navTargetX = this.world.activeCasRequest.pos.x;
      navTargetZ = this.world.activeCasRequest.pos.z;
      navTag = 'CAS';
    } else if (Array.isArray(this._latestRoleMissions) && this._latestRoleMissions.length > 0) {
      navTargetX = this._latestRoleMissions[0].targetX;
      navTargetZ = this._latestRoleMissions[0].targetZ;
      navTag = this._latestRoleMissions[0].targetFlagId || 'TGT';
    }
    if (compassBugEl) {
      if (navTargetX !== null && navTargetZ !== null) {
        const dx = navTargetX - v.pos.x;
        const dz = navTargetZ - v.pos.z;
        let tgtBrg = (Math.atan2(dx, -dz) * 180) / Math.PI;
        if (tgtBrg < 0) tgtBrg += 360;
        const relBrg = ((tgtBrg - hdgDeg + 540) % 360) - 180;
        compassBugEl.setAttribute('opacity', '1');
        compassBugEl.setAttribute('transform', `rotate(${relBrg.toFixed(1)} 56 56)`);
      } else {
        compassBugEl.setAttribute('opacity', '0');
      }
    }
    if (compassFooterEl) {
      const hdgPad = String(hdgDeg).padStart(3, '0');
      this._setText(
        compassFooterEl,
        navTag ? `${hdgPad}° ${hdgDirStr} • ▶${navTag}` : `HDG ${hdgPad}° ${hdgDirStr}`
      );
    }

    // 5. Visual Weapon Bay Pylon & Countermeasure Strip ([1], [2], [3], [X])
    const activeSlot = v.activeWeaponSlot || 0;
    const pylonDefs = isWright
      ? [
          { icon: '⚙️', lbl: 'GATLING' },
          { icon: '🧨', lbl: 'DYNAMITE' },
          { icon: '🧨', lbl: '3× SALVO' }
        ]
      : isB2
      ? [
          { icon: '💣', lbl: '80× MK82' },
          { icon: '☢️', lbl: 'GBU-57 MOP' },
          { icon: '🎯', lbl: '20MM+AIM9' }
        ]
      : isCas
      ? [
          { icon: '🔥', lbl: '30MM GAU8' },
          { icon: '🚀', lbl: 'HYDRA-70' },
          { icon: '💣', lbl: 'AGM/BOMB' }
        ]
      : isGunship
      ? [
          { icon: '🔥', lbl: '25MM GATL' },
          { icon: '💥', lbl: '40MM BOFR' },
          { icon: '🎯', lbl: '105 HOWZ' }
        ]
      : [
          { icon: '🔥', lbl: '20MM VULC' },
          { icon: '🚀', lbl: 'AIM120 FOX3' },
          { icon: '💣', lbl: 'JDAM/GBU' }
        ];

    // 4B. Update Aircraft Body vs. Viewpoint Dial (`#air-bvv-svg` — Tank-style Airframe Heading vs. Pilot/Gunner View!)
    const bvvBodyGroup = this.el('air-bvv-body-group');
    const bvvShapeEl = this.el('air-bvv-shape');
    const bvvFooterEl = this.el('air-bvv-footer');
    if (bvvShapeEl && this._lastAirBvvRole !== aRole) {
      this._lastAirBvvRole = aRole;
      if (isB2) {
        bvvShapeEl.innerHTML = `<polygon points="56,24 92,62 84,69 68,58 60,67 56,62 52,67 44,58 28,69 20,62" fill="rgba(0,210,211,0.3)" stroke="#00d2d3" stroke-width="1.6"/>`;
      } else if (isGunship) {
        // AC-130J Silhouette + Port (-X / Left) 25mm/40mm/105mm Barrels!
        bvvShapeEl.innerHTML = `
          <rect x="20" y="47" width="72" height="7" rx="1.5" fill="rgba(241,196,15,0.32)" stroke="#f1c40f" stroke-width="1.4"/>
          <rect x="51" y="26" width="10" height="54" rx="3" fill="rgba(241,196,15,0.42)" stroke="#f1c40f" stroke-width="1.5"/>
          <rect x="42" y="76" width="28" height="5" rx="1" fill="rgba(241,196,15,0.35)" stroke="#f1c40f" stroke-width="1.2"/>
          <line x1="51" y1="42" x2="36" y2="42" stroke="#ff6b6b" stroke-width="2"/>
          <line x1="51" y1="56" x2="34" y2="56" stroke="#ff9f43" stroke-width="2.3"/>
          <line x1="51" y1="67" x2="32" y2="67" stroke="#ffd32a" stroke-width="2.8"/>
        `;
      } else {
        bvvShapeEl.innerHTML = `<polygon points="56,22 61,44 88,58 88,64 61,58 59,76 68,83 68,87 56,84 44,87 44,83 53,76 51,58 24,64 24,58 51,44" fill="rgba(241,196,15,0.32)" stroke="#f1c40f" stroke-width="1.5"/>`;
      }
    }
    if (bvvBodyGroup) {
      let planeHdg = Math.round(((-(v.yaw || 0) * 180) / Math.PI) % 360);
      if (planeHdg < 0) planeHdg += 360;
      let lookHdg = Math.round(((-((this.player?.yaw ?? v.yaw) || 0) * 180) / Math.PI) % 360);
      if (lookHdg < 0) lookHdg += 360;
      const bodyRelDeg = ((planeHdg - lookHdg + 540) % 360) - 180;
      const viewOffDeg = ((lookHdg - planeHdg + 540) % 360) - 180;
      bvvBodyGroup.setAttribute('transform', `rotate(${bodyRelDeg.toFixed(1)} 56 56)`);
      if (bvvFooterEl) {
        const lookPitchDeg = Math.round((((this.player?.pitch ?? v.pitch) || 0) * 180) / Math.PI);
        const pitchTag = lookPitchDeg >= 0 ? `+${lookPitchDeg}°` : `${lookPitchDeg}°`;
        const azTag =
          Math.abs(viewOffDeg) <= 3
            ? 'NOSE 0°'
            : viewOffDeg < 0
            ? `VIEW ${Math.abs(viewOffDeg)}° L`
            : `VIEW ${viewOffDeg}° R`;
        this._setText(bvvFooterEl, `${azTag} • P ${pitchTag}`);
      }
    }

    // 4C. AC-130 Cockpit Dashboard FLIR Video Repeater MFD (Active when FLIR MFD or Coupled Autopilot is installed!)
    const mfdCardEl = this.el('ac130-flir-mfd-card');
    if (mfdCardEl) {
      const showMfd = Boolean(isGunship && v.ac130HasFlirRepeater);
      mfdCardEl.classList.toggle('hidden', !showMfd);
      if (showMfd) {
        this.renderAc130CockpitFlirMfd(v);
      }
    }

    const secCd = v.secondaryCooldown || 0;
    const maxSecCd = isGunship ? 3.2 : aRole === 'fighter' ? 1.8 : 0.6;
    const secReadyPct = secCd > 0.04 ? Math.max(8, Math.min(100, ((maxSecCd - secCd) / maxSecCd) * 100)) : 100;

    for (let i = 0; i < 3; i++) {
      const slotCard = this.el(`air-pylon-${i + 1}`);
      const iconNode = this.el(`air-pylon-${i + 1}-icon`);
      const lblNode = this.el(`air-pylon-${i + 1}-lbl`);
      const barNode = this.el(`air-pylon-${i + 1}-bar`);
      const slotKey = `slot${i}`;
      const ammoCur = v.ordnancePools && typeof v.ordnancePools[slotKey] === 'number' ? v.ordnancePools[slotKey] : null;
      const ammoMax = v.maxOrdnancePools && typeof v.maxOrdnancePools[slotKey] === 'number' ? v.maxOrdnancePools[slotKey] : null;
      const ammoTag = ammoCur !== null ? ` (${ammoCur})` : '';
      if (slotCard) slotCard.classList.toggle('active', activeSlot === i);
      if (iconNode) iconNode.textContent = pylonDefs[i].icon;
      if (lblNode) lblNode.textContent = `${pylonDefs[i].lbl}${ammoTag}`;
      if (barNode) {
        if (ammoCur !== null && ammoCur <= 0) {
          barNode.style.width = '100%';
          barNode.style.background = '#e74c3c';
          if (lblNode) lblNode.textContent = `${pylonDefs[i].lbl} (REARM)`;
        } else if (i === 0) {
          const priCd = v.fireCooldown || 0;
          const ammoPct = ammoCur !== null && ammoMax ? (ammoCur / ammoMax) * 100 : 100;
          const priPct = priCd > 0.12 ? Math.max(15, Math.min(100, (1 - priCd / 0.85) * 100)) : ammoPct;
          barNode.style.width = `${Math.max(8, priPct)}%`;
          barNode.style.background = priCd > 0.12 ? '#f39c12' : '#2ecc71';
        } else if (i === 1 && aRole === 'fighter' && this.player?.aircraftLockTarget) {
          const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
          barNode.style.width = `${Math.max(25, lockPct)}%`;
          barNode.style.background = lockPct >= 100 ? '#ff4757' : '#f1c40f';
          if (lblNode) lblNode.textContent = lockPct >= 100 ? `🔒 LOCKED${ammoTag}` : `SEEK ${lockPct}%`;
        } else {
          const ammoPct = ammoCur !== null && ammoMax ? (ammoCur / ammoMax) * 100 : secReadyPct;
          barNode.style.width = `${secCd > 0.04 ? secReadyPct : Math.max(8, ammoPct)}%`;
          barNode.style.background = secCd > 0.04 ? '#f39c12' : '#2ecc71';
        }
      }
    }

    // Countermeasure Slot [X] (Flares / RAM Cloak / Kitty Hawk Tailwind)
    const cmIconEl = this.el('air-pylon-cm-icon');
    const cmLblEl = this.el('air-pylon-cm-lbl');
    const cmBarEl = this.el('air-pylon-cm-bar');
    const flareAct = v.flareActiveTimer || 0;
    const flareCd = v.flareCooldown || 0;
    const maxFlareCd = isWright ? 6.0 : isB2 ? 7.5 : 9.0;

    if (cmIconEl) {
      cmIconEl.textContent = isWright ? '🌬️' : isB2 ? '🦇' : '✨';
    }
    if (cmLblEl) {
      cmLblEl.textContent =
        flareAct > 0
          ? isB2
            ? `CLOAK ${flareAct.toFixed(0)}S`
            : `ACTIVE ${flareAct.toFixed(0)}S`
          : flareCd > 0
          ? `WAIT ${flareCd.toFixed(0)}S`
          : isWright
          ? 'TAILWIND'
          : isB2
          ? 'RAM CLOAK'
          : 'ECM/FLARE';
    }
    if (cmBarEl) {
      if (flareAct > 0) {
        cmBarEl.style.width = '100%';
        cmBarEl.style.background = isB2 ? '#a29bfe' : '#ffd32a';
      } else if (flareCd > 0) {
        const cdPct = Math.max(5, Math.min(100, ((maxFlareCd - flareCd) / maxFlareCd) * 100));
        cmBarEl.style.width = `${cdPct}%`;
        cmBarEl.style.background = '#f39c12';
      } else {
        cmBarEl.style.width = '100%';
        cmBarEl.style.background = '#00d2d3';
      }
    }
  },

  /**
   * Renders the AC-130 Cockpit Dashboard FLIR Video Repeater MFD (`#ac130-mfd-canvas`),
   * giving the pilot a live White-Hot thermal top-down feed of targets inside the left-wing firing zone!
   */
  renderAc130CockpitFlirMfd(v) {
    const canvas = this.el('ac130-mfd-canvas');
    if (!canvas || !v) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = '#071114';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(46, 213, 115, 0.05)';
    for (let y = 0; y < ch; y += 3) ctx.fillRect(0, y, cw, 1);

    // Center of MFD represents the Port-Side Ground Target Area (~185m off left wing, or v.orbitCenter)
    const portX = -Math.cos(v.yaw || 0);
    const portZ = Math.sin(v.yaw || 0);
    const focusX =
      v.ac130HasCoupledAutopilot && v.orbitCenter
        ? v.orbitCenter.x
        : v.pos.x + portX * 185;
    const focusZ =
      v.ac130HasCoupledAutopilot && v.orbitCenter
        ? v.orbitCenter.z
        : v.pos.z + portZ * 185;
    const scale = 0.24; // ~330m wide thermal sector window

    const toMfd = (wx, wz) => {
      const dx = wx - focusX;
      const dz = wz - focusZ;
      // Orient MFD so Port Firing Direction is UP on the screen!
      const rightX = -portZ;
      const rightZ = portX;
      const sx = cw * 0.5 + (dx * rightX + dz * rightZ) * scale;
      const sy = ch * 0.5 - (dx * portX + dz * portZ) * scale;
      return { sx, sy };
    };

    // Draw Objective Flags inside MFD
    if (this.world?.flags) {
      ctx.font = 'bold 8px Consolas, monospace';
      for (const f of this.world.flags) {
        const { sx, sy } = toMfd(f.pos.x, f.pos.z);
        if (sx < 4 || sx > cw - 4 || sy < 4 || sy > ch - 4) continue;
        ctx.strokeStyle = '#2ed573';
        ctx.strokeRect(sx - 5, sy - 5, 10, 10);
        ctx.fillStyle = '#7bed9f';
        ctx.fillText(f.id, sx + 7, sy + 3);
      }
    }

    // Draw White-Hot Enemy & Cyan Friendly Thermal Signatures on MFD (crewed/active vehicles & foot soldiers only)!
    if (this.botManager?.bots) {
      for (const b of this.botManager.bots) {
        if (!b || b.dead || b.drivingVehicle) continue;
        const { sx, sy } = toMfd(b.pos.x, b.pos.z);
        if (sx < 0 || sx > cw || sy < 0 || sy > ch) continue;
        ctx.fillStyle = b.team !== this.player.team ? '#ffffff' : 'rgba(0, 210, 211, 0.75)';
        ctx.fillRect(sx - 1.3, sy - 1.3, 2.6, 2.6);
      }
    }
    if (this.vehicleManager?.vehicles) {
      for (const ov of this.vehicleManager.vehicles) {
        if (!ov || ov.dead || ov === v) continue;
        const isCrewed = Boolean(ov.driver || ov.npcDriver || ov.aiPilotActive);
        if (!isCrewed) continue;
        const { sx, sy } = toMfd(ov.pos.x, ov.pos.z);
        if (sx < 0 || sx > cw || sy < 0 || sy > ch) continue;
        ctx.fillStyle = ov.team !== this.player.team ? '#fff200' : '#00d2d3';
        ctx.fillRect(sx - 2.6, sy - 2.6, 5.2, 5.2);
      }
    }

    // Draw Live Aim Impact Point Crosshair (`+`) on MFD
    if (this.player?._ccipPoint) {
      const aimMfd = toMfd(this.player._ccipPoint.x, this.player._ccipPoint.z);
      const ax = Math.max(6, Math.min(cw - 6, aimMfd.sx));
      const ay = Math.max(6, Math.min(ch - 6, aimMfd.sy));
      ctx.strokeStyle = '#00d2d3';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ax - 7, ay);
      ctx.lineTo(ax + 7, ay);
      ctx.moveTo(ax, ay - 7);
      ctx.lineTo(ax, ay + 7);
      ctx.stroke();
    }

    const apBadge = this.el('ac130-mfd-ap-badge');
    const eraEl = this.el('ac130-mfd-era');
    const tgtEl = this.el('ac130-mfd-tgt');
    const slewEl = this.el('ac130-mfd-slew');
    if (apBadge) {
      const apTxt = v.gunshipManualFlight
        ? 'TRANSIT [R]'
        : v.ac130HasCoupledAutopilot
        ? '🔄 COUPLED AP [R]'
        : '🕹️ MANUAL PYLON [R]';
      this._setText(apBadge, apTxt);
      apBadge.style.color = v.ac130HasCoupledAutopilot && !v.gunshipManualFlight ? '#00d2d3' : '#f1c40f';
    }
    if (eraEl) this._setText(eraEl, `AIRFRAME: ${v.ac130EraLabel || '1968 AC-130A'}`);
    if (tgtEl) {
      this._setText(
        tgtEl,
        v.gunshipManualFlight
          ? 'MODE: FORWARD TRANSIT'
          : `TARGET: ${v.orbitAnchorLabel || 'PORT SECTOR'}`
      );
    }
    if (slewEl) {
      const arcDeg = Math.round(((v.ac130MaxMountArc || 0.16) * 180) / Math.PI);
      this._setText(slewEl, `GUN MOUNT: ±${arcDeg}° ${arcDeg <= 12 ? 'RIGID' : 'SERVO TGM'}`);
    }
  },

  /**
   * Call of Duty ("Death From Above" / MW2 AC-130) Full-Screen FLIR HUD & Friendly IFF Strobe Renderer:
   * - ZERO fake 2D radial dots (3D soldiers, limbs, helmets, treads & engines now glow natively in WebGL!)
   * - Renders crisp 3.6 Hz blinking IR Glint Strobes ONLY on Friendly Soldiers & Friendly Vehicles
   *   ("Crew, do NOT fire on strobes — those are friendlies!") + crisp target-track brackets on enemy armor!
   */
  renderFullScreenFlirThermal(mode = 'WHOT') {
    const canvas = this.el('flir-fullscreen-canvas');
    if (!canvas || !this.player?.camera) return;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const targetW = Math.min(1280, vw);
    const targetH = Math.min(720, vh);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const isBhot = mode === 'BHOT';
    const cam = this.player.camera;
    const scaleX = cw / Math.max(1, vw);
    const scaleY = ch / Math.max(1, vh);
    const refPos = this.player.activeVehicle ? this.player.activeVehicle.pos : this.player.pos;
    const maxSoldierDist = this.player.activeVehicle?.isAircraft ? 2200 : 850;
    const maxVehDist = this.player.activeVehicle?.isAircraft ? 3200 : 1400;

    // Subtle rolling FLIR interlace refresh bar (authentic AN/AAQ-33 / CoD4 CRT sensor feel)
    const scanY = ((performance.now() * 0.085) % (ch + 40)) - 20;
    ctx.fillStyle = isBhot ? 'rgba(0, 0, 0, 0.035)' : 'rgba(255, 255, 255, 0.035)';
    ctx.fillRect(0, scanY, cw, 5);

    // 3.6 Hz Call of Duty Friendly IR Helmet/Hull Glint Strobe ("Do NOT fire on targets marked by a strobe!")
    const strobeWave = Math.sin(performance.now() * 0.0226);
    const strobeBright = strobeWave > -0.15;
    const strobeAlpha = strobeBright ? 0.96 : 0.28;

    const drawFriendlyIrStrobe = (worldPos, yOff, sz, isVeh = false) => {
      const scr = this.projectWorldToScreen(worldPos, yOff, cam, vw, vh);
      if (!scr || scr.behind) return;
      const lx = scr.x * scaleX;
      const ly = scr.y * scaleY;
      if (lx < -24 || lx > cw + 24 || ly < -24 || ly > ch + 24) return;

      ctx.save();
      ctx.strokeStyle = isBhot
        ? `rgba(10, 14, 18, ${strobeAlpha})`
        : `rgba(255, 255, 255, ${strobeAlpha})`;
      ctx.fillStyle = isBhot
        ? `rgba(10, 14, 18, ${strobeAlpha})`
        : `rgba(255, 255, 255, ${strobeAlpha})`;
      ctx.lineWidth = isVeh ? 1.5 : 1.2;

      // Crisp diamond IFF beacon + 4-point blinking IR glint spikes when strobe flashes ON
      ctx.beginPath();
      ctx.moveTo(lx, ly - sz);
      ctx.lineTo(lx + sz, ly);
      ctx.lineTo(lx, ly + sz);
      ctx.lineTo(lx - sz, ly);
      ctx.closePath();
      ctx.stroke();

      if (strobeBright) {
        const ray = sz * 1.9;
        ctx.beginPath();
        ctx.moveTo(lx - ray, ly);
        ctx.lineTo(lx + ray, ly);
        ctx.moveTo(lx, ly - ray);
        ctx.lineTo(lx, ly + ray);
        ctx.stroke();
        ctx.fillRect(lx - 1.2, ly - 1.2, 2.4, 2.4);
      }
      ctx.restore();
    };

    const drawEnemyVehicleTrackBox = (worldPos, yOff, halfSz) => {
      const scr = this.projectWorldToScreen(worldPos, yOff, cam, vw, vh);
      if (!scr || scr.behind) return;
      const lx = scr.x * scaleX;
      const ly = scr.y * scaleY;
      if (lx < -28 || lx > cw + 28 || ly < -28 || ly > ch + 28) return;

      const s = Math.max(6, halfSz);
      const tick = Math.max(3, s * 0.42);
      ctx.strokeStyle = isBhot ? 'rgba(12, 16, 20, 0.88)' : 'rgba(255, 255, 255, 0.86)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      // 4 crisp corner L-brackets around enemy armor/aircraft (no solid box cluttering the 3D thermal hull!)
      ctx.moveTo(lx - s, ly - s + tick); ctx.lineTo(lx - s, ly - s); ctx.lineTo(lx - s + tick, ly - s);
      ctx.moveTo(lx + s - tick, ly - s); ctx.lineTo(lx + s, ly - s); ctx.lineTo(lx + s, ly - s + tick);
      ctx.moveTo(lx - s, ly + s - tick); ctx.lineTo(lx - s, ly + s); ctx.lineTo(lx - s + tick, ly + s);
      ctx.moveTo(lx + s - tick, ly + s); ctx.lineTo(lx + s, ly + s); ctx.lineTo(lx + s, ly + s - tick);
      ctx.stroke();
    };

    if (this.botManager?.bots) {
      for (const b of this.botManager.bots) {
        if (!b || b.dead || b.drivingVehicle) continue;
        if (b.team !== this.player.team) continue; // Enemy 3D soldiers glow pure unmarked white-hot / black-hot!
        const d = refPos.distanceTo(b.pos);
        if (d > maxSoldierDist) continue;
        drawFriendlyIrStrobe(b.pos, 1.85, 3.8, false);
      }
    }
    if (this.vehicleManager?.vehicles) {
      for (const v of this.vehicleManager.vehicles) {
        if (!v || v.dead || v === this.player.activeVehicle) continue;
        const isCrewed = Boolean(v.driver || v.npcDriver || v.aiPilotActive);
        if (!isCrewed) continue; // Unoccupied FOB bikes / empty emplacements NEVER emit active IFF strobes or radar boxes!
        const d = refPos.distanceTo(v.pos);
        if (d > maxVehDist) continue;
        if (v.team === this.player.team) {
          drawFriendlyIrStrobe(v.pos, 2.8, 5.6, true);
        } else if (this.player.activeVehicle?.hasThermalFlir && v.team && v.team !== 'NEUTRAL') {
          const boxHalf = Math.max(7, Math.min(20, 820 / Math.max(28, d)));
          drawEnemyVehicleTrackBox(v.pos, 1.6, boxHalf);
        }
      }
    }
  },

  /**
   * Renders crisp FLIR RS-32 Rifle Scope scanlines & Friendly IFF IR Strobes
   * (3D soldiers & vehicles already glow White-Hot in the live WebGL viewport inside the scope!).
   */
  renderFlirThermalLens(opticType = 'flir') {
    const canvas = this.el('flir-thermal-canvas');
    if (!canvas || !this.player?.camera) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const isBhot = this.player.scopeThermalPolarity === 'BHOT';
    const isSniperIr = opticType === 'sniperFlir';
    const sniperReadoutEl = this.el('sniper-flir-readout');
    if (isSniperIr && sniperReadoutEl) {
      const steadyTxt = this.player.isHoldingBreath ? ' • STEADY LOCK' : '';
      this._setText(
        sniperReadoutEl,
        `AN/PAS-13G • ${isBhot ? 'BHOT' : 'WHOT'} IR [N]${steadyTxt}`
      );
    }

    ctx.fillStyle = isBhot ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.03)';
    for (let y = 0; y < ch; y += 4) {
      ctx.fillRect(0, y, cw, 1);
    }

    const strobeBright = Math.sin(performance.now() * 0.0226) > -0.15;
    if (!strobeBright || !this.botManager?.bots) return;
    const cam = this.player.camera;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const lensW = isSniperIr ? vh * 0.56 : vw * 0.34;
    const lensH = isSniperIr ? vh * 0.56 : vh * 0.42;
    const lensScaleX = cw / Math.max(1, lensW);
    const lensScaleY = ch / Math.max(1, lensH);
    const maxIffDist = isSniperIr ? 1150 : 560;
    ctx.strokeStyle = isBhot ? 'rgba(12, 16, 20, 0.92)' : 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.15;
    for (const b of this.botManager.bots) {
      if (!b || b.dead || b.team !== this.player.team) continue;
      if (this.player.pos.distanceTo(b.pos) > maxIffDist) continue;
      const scr = this.projectWorldToScreen(b.pos, 1.85, cam, vw, vh);
      if (!scr || scr.behind) continue;
      const lx = cw * 0.5 + (scr.x - vw * 0.5) * lensScaleX;
      const ly = ch * 0.5 + (scr.y - vh * 0.5) * lensScaleY;
      if (lx < 4 || lx > cw - 4 || ly < 4 || ly > ch - 4) continue;
      ctx.strokeRect(lx - 2.5, ly - 2.5, 5, 5);
    }
  },

  /**
   * Vehicle-Specific Center-Screen Reticle (`#turret-reticle-box`):
   * Every vehicle class renders its own distinct sight geometry, color palette, and telemetry tags
   * so non-tank vehicles never display a generic tank gunner box.
   */
  updateVehicleCenterReticle(v) {
    if (!v) return;
    const boxEl = this.el('turret-reticle-box');
    const dynLayer = this.el('tr-dynamic-layer');
    const topTagEl = this.el('tr-top-tag');
    const botTagEl = this.el('tr-bottom-tag');
    const ladderEl = this.el('tr-range-ladder');
    const centerEl = this.el('tr-center-mark');
    if (!boxEl || !dynLayer) return;

    const isGunshipSight = Boolean(
      v.isAircraft &&
        v.aircraftRole === 'gunship' &&
        (!v.gunshipManualFlight || this.player?.vehicleCameraMode === 'OPTIC_NOSE')
    );
    const activeSlot = v.activeWeaponSlot || 0;
    const isFlirHud = Boolean(
      this.player?.nvgActive && (this.player?.sensorMode === 'WHOT' || this.player?.sensorMode === 'BHOT')
    );
    const rKey = isGunshipSight
      ? `ac130_slot_${activeSlot}_${isFlirHud ? this.player.sensorMode : 'tv'}`
      : v.isAircraft
      ? `air_${v.aircraftRole || v.type}`
      : v.type;
    if (this._lastCenterReticleType !== rKey) {
      this._lastCenterReticleType = rKey;
      const corners = boxEl.querySelectorAll('.tr-corner');
      const setCorners = (show, color = '#2ecc71', w = 24, h = 24) => {
        corners.forEach((c) => {
          c.style.display = show ? 'block' : 'none';
          c.style.borderColor = color;
          c.style.width = `${w}px`;
          c.style.height = `${h}px`;
        });
      };

      if (isGunshipSight) {
        // Call of Duty ("Death From Above" / MW2) Authentic AC-130 105mm / 40mm / 25mm FLIR Reticles!
        const retCol = isFlirHud
          ? this.player.sensorMode === 'BHOT'
            ? '#101418'
            : '#f5f7fa'
          : '#00d2d3';
        const shadowCss = isFlirHud
          ? this.player.sensorMode === 'BHOT'
            ? 'drop-shadow(0 0 2px rgba(255,255,255,0.85))'
            : 'drop-shadow(0 0 2px rgba(0,0,0,0.95))'
          : 'drop-shadow(0 0 3px rgba(0,210,211,0.55))';
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = activeSlot === 2 ? '' : '•';
          centerEl.style.color = retCol;
          centerEl.style.textShadow = isFlirHud ? '0 0 3px #000' : `0 0 6px ${retCol}`;
        }

        if (activeSlot === 2) {
          // [3] 105MM M102 HOWITZER (CoD Wide FOV Overwatch — Outer L-Corners + Inner Blast-Radius Box + Broken Cross)
          dynLayer.innerHTML = `
            <svg viewBox="0 0 320 240" width="320" height="240" style="filter:${shadowCss}">
              <path d="M 52 54 L 52 34 L 76 34 M 244 34 L 268 34 L 268 54 M 52 186 L 52 206 L 76 206 M 244 206 L 268 206 L 268 186" fill="none" stroke="${retCol}" stroke-width="2.2"/>
              <rect x="116" y="86" width="88" height="68" fill="none" stroke="${retCol}" stroke-width="1.6"/>
              <line x1="78" y1="120" x2="116" y2="120" stroke="${retCol}" stroke-width="1.8"/>
              <line x1="204" y1="120" x2="242" y2="120" stroke="${retCol}" stroke-width="1.8"/>
              <line x1="160" y1="54" x2="160" y2="86" stroke="${retCol}" stroke-width="1.8"/>
              <line x1="160" y1="154" x2="160" y2="186" stroke="${retCol}" stroke-width="1.8"/>
              <line x1="153" y1="120" x2="167" y2="120" stroke="${retCol}" stroke-width="1.4"/>
              <line x1="160" y1="113" x2="160" y2="127" stroke="${retCol}" stroke-width="1.4"/>
            </svg>
          `;
        } else if (activeSlot === 1) {
          // [2] 40MM L/60 BOFORS (CoD Medium FOV — 4-Way Graduated Mil-Hash Lead Stadia Crosshair)
          dynLayer.innerHTML = `
            <svg viewBox="0 0 320 240" width="320" height="240" style="filter:${shadowCss}">
              <line x1="56" y1="120" x2="146" y2="120" stroke="${retCol}" stroke-width="1.7"/>
              <line x1="174" y1="120" x2="264" y2="120" stroke="${retCol}" stroke-width="1.7"/>
              <line x1="160" y1="32" x2="160" y2="106" stroke="${retCol}" stroke-width="1.7"/>
              <line x1="160" y1="134" x2="160" y2="208" stroke="${retCol}" stroke-width="1.7"/>
              <g stroke="${retCol}" stroke-width="1.5">
                <line x1="128" y1="115" x2="128" y2="125"/><line x1="104" y1="113" x2="104" y2="127"/><line x1="80" y1="115" x2="80" y2="125"/>
                <line x1="192" y1="115" x2="192" y2="125"/><line x1="216" y1="113" x2="216" y2="127"/><line x1="240" y1="115" x2="240" y2="125"/>
                <line x1="155" y1="88" x2="165" y2="88"/><line x1="153" y1="64" x2="167" y2="64"/>
                <line x1="155" y1="152" x2="165" y2="152"/><line x1="153" y1="176" x2="167" y2="176"/>
              </g>
            </svg>
          `;
        } else {
          // [1] 25MM GAU-12 GATLING (CoD Narrow High-Zoom FOV — Tight Corner-Bracket Tracking Box + Fine Cross)
          dynLayer.innerHTML = `
            <svg viewBox="0 0 320 240" width="320" height="240" style="filter:${shadowCss}">
              <path d="M 136 106 L 136 96 L 146 96 M 174 96 L 184 96 L 184 106 M 136 134 L 136 144 L 146 144 M 174 144 L 184 144 L 184 134" fill="none" stroke="${retCol}" stroke-width="2"/>
              <line x1="112" y1="120" x2="132" y2="120" stroke="${retCol}" stroke-width="1.5"/>
              <line x1="188" y1="120" x2="208" y2="120" stroke="${retCol}" stroke-width="1.5"/>
              <line x1="160" y1="74" x2="160" y2="92" stroke="${retCol}" stroke-width="1.5"/>
              <line x1="160" y1="148" x2="160" y2="166" stroke="${retCol}" stroke-width="1.5"/>
            </svg>
          `;
        }
      } else if (v.isAircraft) {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '+';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 8px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Aviation Velocity Vector & Pitch Ladder Bars (Pure SVG, zero font encoding issues!) -->
            <line x1="95" y1="85" x2="132" y2="85" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="95" y1="85" x2="95" y2="93" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="188" y1="85" x2="225" y2="85" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="225" y1="85" x2="225" y2="93" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="115" y1="120" x2="142" y2="120" stroke="#2ecc71" stroke-width="2"/>
            <line x1="178" y1="120" x2="205" y2="120" stroke="#2ecc71" stroke-width="2"/>
            <line x1="95" y1="155" x2="132" y2="155" stroke="#00d2d3" stroke-width="1.8" stroke-dasharray="4 3"/>
            <line x1="188" y1="155" x2="225" y2="155" stroke="#00d2d3" stroke-width="1.8" stroke-dasharray="4 3"/>
            <circle cx="160" cy="120" r="10" fill="none" stroke="#00d2d3" stroke-width="1.6"/>
            <circle cx="160" cy="120" r="36" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1.4" stroke-dasharray="6 4"/>
          </svg>
        `;
      } else if (v.type === 'bike' || v.type === 'atv') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '•';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 8px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Sleek Open Handlebar Rider Reflex Arc (No Tank Box!) -->
            <path d="M 108 102 A 56 56 0 0 1 212 102" fill="none" stroke="rgba(0, 210, 211, 0.65)" stroke-width="2" stroke-linecap="round"/>
            <path d="M 122 142 A 44 44 0 0 0 198 142" fill="none" stroke="rgba(46, 204, 113, 0.5)" stroke-width="1.8" stroke-dasharray="4 3"/>
            <circle cx="160" cy="120" r="14" fill="none" stroke="#00d2d3" stroke-width="1.5"/>
          </svg>
        `;
      } else if (v.type === 'humvee' || v.type === 'emplace_hmg') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '+';
          centerEl.style.color = '#c4e538';
          centerEl.style.textShadow = '0 0 6px #a3cb38';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Open .50 Cal M2HB Reflex Ring Sight -->
            <circle cx="160" cy="120" r="34" fill="none" stroke="rgba(196, 229, 56, 0.78)" stroke-width="2"/>
            <line x1="104" y1="120" x2="122" y2="120" stroke="#c4e538" stroke-width="2.2"/>
            <line x1="198" y1="120" x2="216" y2="120" stroke="#c4e538" stroke-width="2.2"/>
            <line x1="160" y1="68" x2="160" y2="82" stroke="#c4e538" stroke-width="2"/>
            <line x1="160" y1="158" x2="160" y2="172" stroke="#c4e538" stroke-width="2"/>
          </svg>
        `;
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '⊹';
          centerEl.style.color = '#f1c40f';
          centerEl.style.textShadow = '0 0 8px #f1c40f';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- 360° SPAAG Radar Lead-Computing Optical Sight (LCOS) -->
            <circle cx="160" cy="120" r="68" fill="none" stroke="rgba(241, 196, 15, 0.55)" stroke-width="1.8" stroke-dasharray="8 4"/>
            <circle cx="160" cy="120" r="32" fill="none" stroke="rgba(0, 210, 211, 0.72)" stroke-width="1.6"/>
            <line x1="82" y1="120" x2="122" y2="120" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="198" y1="120" x2="238" y2="120" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="160" y1="42" x2="160" y2="82" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="160" y1="158" x2="160" y2="198" stroke="#f1c40f" stroke-width="1.6"/>
          </svg>
        `;
      } else if (v.type === 'apc') {
        setCorners(true, '#00d2d3', 28, 20);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = '#00d2d3';
          ladderEl.innerHTML = '<span>150</span><span>300</span><span>450</span>';
        }
        if (centerEl) {
          centerEl.textContent = '✛';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 7px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- 8×8 IFV 30mm Autocannon Mil-Hash Crossbars -->
            <line x1="92" y1="120" x2="138" y2="120" stroke="rgba(0, 210, 211, 0.65)" stroke-width="1.6"/>
            <line x1="182" y1="120" x2="228" y2="120" stroke="rgba(0, 210, 211, 0.65)" stroke-width="1.6"/>
            <rect x="136" y="98" width="48" height="44" rx="4" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1.2"/>
          </svg>
        `;
      } else if (v.type === 'warhorse') {
        setCorners(false);
        const isXbow = Boolean(
          v.isCrossbowSight || (this.player?.currentWeapon?.()?.def?.isCrossbow && v.isFootArcherySight)
        );
        const isFire = Boolean(this.player?.fireArrowsActive);
        const sightCol = isFire ? '#ff7f50' : isXbow ? '#81ecec' : '#f1c40f';
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = sightCol;
          ladderEl.innerHTML = isXbow
            ? '<span>40M</span><span>80M</span>'
            : '<span>25M</span><span>50M</span><span>75M</span>';
        }
        if (centerEl) {
          centerEl.textContent = isXbow ? '✛' : '▴';
          centerEl.style.color = sightCol;
          centerEl.style.textShadow = `0 0 6px ${sightCol}`;
        }
        dynLayer.innerHTML = isXbow
          ? `
            <svg viewBox="0 0 320 240" width="320" height="240">
              <!-- Arbalest Crossbow Horizontal Iron-Arbor Windage Bar & Bolt Drop Post -->
              <line x1="116" y1="120" x2="148" y2="120" stroke="${sightCol}" stroke-width="2" stroke-linecap="round"/>
              <line x1="172" y1="120" x2="204" y2="120" stroke="${sightCol}" stroke-width="2" stroke-linecap="round"/>
              <line x1="160" y1="130" x2="160" y2="164" stroke="${sightCol}" stroke-width="1.6" stroke-dasharray="4 4"/>
            </svg>
          `
          : `
            <svg viewBox="0 0 320 240" width="320" height="240">
              <!-- Clean Medieval Longbow Draw Brackets & Drop Pins (Never blocks center target) -->
              <path d="M 132 86 Q 114 120 132 154" fill="none" stroke="${sightCol}" stroke-width="2" stroke-linecap="round" opacity="0.82"/>
              <path d="M 188 86 Q 206 120 188 154" fill="none" stroke="${sightCol}" stroke-width="2" stroke-linecap="round" opacity="0.82"/>
            </svg>
          `;
      } else if (v.type === 'trebuchet' || v.type === 'emplace_mortar') {
        setCorners(false);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = '#ff9f43';
          ladderEl.innerHTML = '<span>100M</span><span>200M</span><span>300M</span>';
        }
        if (centerEl) {
          centerEl.textContent = '⊕';
          centerEl.style.color = '#ff9f43';
          centerEl.style.textShadow = '0 0 8px #e67e22';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Siege / Indirect Artillery Elevation Quadrant -->
            <path d="M 105 162 A 64 64 0 0 1 215 162" fill="none" stroke="rgba(230, 126, 34, 0.75)" stroke-width="2" stroke-dasharray="6 3"/>
            <line x1="160" y1="62" x2="160" y2="182" stroke="rgba(241, 196, 15, 0.55)" stroke-width="1.6"/>
          </svg>
        `;
      } else if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '❖';
          centerEl.style.color = '#ff5252';
          centerEl.style.textShadow = '0 0 8px #ff5252';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Primal Theropod Fang & Claw Strike Arcs -->
            <path d="M 118 84 Q 96 120 124 156" fill="none" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
            <path d="M 202 84 Q 224 120 196 156" fill="none" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
          </svg>
        `;
      } else {
        // Main Battle Tank ('tank')
        setCorners(true, '#2ecc71', 24, 24);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = 'rgba(46, 204, 113, 0.78)';
          ladderEl.innerHTML = '<span>200</span><span>400</span><span>600</span>';
        }
        if (centerEl) {
          centerEl.textContent = '+';
          centerEl.style.color = '#2ecc71';
          centerEl.style.textShadow = '0 0 6px #2ecc71';
        }
        dynLayer.innerHTML = '';
      }
    }

    // Center Reticle Tags: Keep center crosshair clean (no duplicated name/speed/altitude/keybind walls!).
    // Show ONLY active transient tactical alerts (missile lock, stall, mayday, flares/cloak, cannon reload, mortar arc).
    if (topTagEl && botTagEl) {
      let topTxt = '';
      let botTxt = '';

      if (v.isAircraft) {
        const lockTgt = this.player?.aircraftLockTarget;
        const lockPct = Math.round((this.player?.aircraftLockProgress || 0) * 100);
        if (v.aircraftRole === 'gunship') {
          const curFov = Math.round(this.player?.camera?.fov || 60);
          if (!v.gunshipManualFlight && curFov < 52) {
            const gY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
            const alt = Math.max(0, Math.round(v.pos.y - gY));
            const mag = (75 / Math.max(12, curFov)).toFixed(1);
            const slant = Math.round(v.slantRangeM || Math.hypot(alt, v.orbitRadius || 240));
            topTxt = `🔍 ${mag}X • SLANT ${slant}M`;
          }
        } else if (lockTgt) {
          const tgtShort = (lockTgt.name || 'BANDIT').split(' ')[0];
          topTxt =
            lockPct >= 100
              ? `🎯 LOCKED ${tgtShort} — [SPACE]`
              : `📡 SEEKING ${tgtShort} (${lockPct}%)`;
        }

        if (v.isShotDown) {
          botTxt = '🚨 MAYDAY — PRESS [E] TO EJECT!';
        } else if (v.isStalling) {
          botTxt = '⚠️ STALL WARNING — HOLD [W] & LOWER NOSE';
        } else if ((v.flareActiveTimer || 0) > 0) {
          botTxt =
            v.aircraftRole === 'b2_spirit'
              ? `🦇 RAM CLOAK ACTIVE (${v.flareActiveTimer.toFixed(1)}S)`
              : `✨ FLARES & ECM ACTIVE (${v.flareActiveTimer.toFixed(1)}S)`;
        }
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        const lockTgt = this.player?.aircraftLockTarget;
        const lockPct = Math.round((this.player?.aircraftLockProgress || 0) * 100);
        if (lockTgt) {
          const tgtShort = (lockTgt.name || 'AIRCRAFT').split(' ')[0];
          botTxt =
            lockPct >= 100
              ? `🔒 SAM LOCKED ON ${tgtShort} — PRESS [SPACE]!`
              : `📡 TRACKING ${tgtShort} (${lockPct}%)`;
        }
      } else if (v.type === 'trebuchet' || v.type === 'emplace_mortar') {
        const rng = Math.round(this.player?.mortarRangeM || 200);
        topTxt = `🎯 IMPACT ARC ${rng}M`;
      } else if (v.type === 'tank' || v.type === 'apc') {
        if (v.subsystems?.optics && v.subsystems.optics !== 'OK') {
          botTxt = '🔭 OPTICS CRACKED — REPAIR [F]/[T]';
        } else if (v.fireCooldown > 0.05 && v.weaponType === 'tank_cannon') {
          botTxt = `⏳ RELOADING (${v.fireCooldown.toFixed(1)}S)`;
        } else if (v.coaxOverheated) {
          botTxt = '🔥 COAX OVERHEATED';
        }
      }
      if (v.isAircraft && (v.sensorGlitchTimer || 0) > 0) {
        botTxt = `📡 HUD / TGP SENSOR GLITCH (${v.sensorGlitchTimer.toFixed(1)}S)`;
      }

      this._setText(topTagEl, topTxt);
      this._setText(botTagEl, botTxt);
      topTagEl.classList.toggle('hidden', !topTxt);
      botTagEl.classList.toggle('hidden', !botTxt);
    }
  },

  // Vehicle Orientation & Telemetry Panel (Bottom-Right, Custom SVG & Gauges per Vehicle)
  updateVehicleOrientationHud(v) {
    if (!v) return;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    let hullDeg = Math.round(((-v.yaw * 180) / Math.PI) % 360);
    if (hullDeg < 0) hullDeg += 360;
    const hullDirStr = dirs[Math.round(hullDeg / 45) % 8];

    const rawTurretYaw = v.turretYaw !== undefined ? v.turretYaw : this.player.yaw;
    let turretDeg = Math.round(((-rawTurretYaw * 180) / Math.PI) % 360);
    if (turretDeg < 0) turretDeg += 360;
    const turretDirStr = dirs[Math.round(turretDeg / 45) % 8];

    // Relative angle of Hull compared to our Turret/Camera Viewpoint (12 o'clock = 0 deg)
    const hullRelDeg = ((hullDeg - turretDeg + 540) % 360) - 180;
    // Relative angle of Turret compared to Hull nose (+Right / -Left)
    const turretOffsetDeg = ((turretDeg - hullDeg + 540) % 360) - 180;

    // 1. Rotate SVG World Compass Ring (-turretDeg) & Vehicle Hull Silhouette (hullRelDeg)
    const isMotoDash = v.type === 'bike' || v.type === 'atv';
    const compassGroup = this.el('veh-svg-compass');
    if (compassGroup) {
      compassGroup.style.display = isMotoDash ? 'none' : '';
      if (!isMotoDash) {
        compassGroup.setAttribute('transform', `rotate(${-turretDeg} 60 60)`);
      }
    }
    const hullGroup = this.el('veh-svg-hull');
    const turretGroup = this.el('veh-svg-turret');
    if (hullGroup) {
      if (isMotoDash) {
        const leanDeg = Math.max(-38, Math.min(38, Math.round(((v.roll || 0) * 180) / Math.PI)));
        hullGroup.setAttribute('transform', `rotate(${leanDeg} 60 60)`);
      } else {
        hullGroup.setAttribute('transform', `rotate(${hullRelDeg} 60 60)`);
      }
    }

    // 1B. Dynamically Adapt Vehicle SVG Silhouette, Panel Title & Telemetry Labels per Vehicle Type
    if (hullGroup && turretGroup && this._lastHudVehSvgType !== v.type) {
      this._lastHudVehSvgType = v.type;
      const titleEl = this.el('veh-orient-title');
      const legTurEl = this.el('veh-leg-turret');
      const legHulEl = this.el('veh-leg-hull');
      const lbl1El = this.el('vor-lbl-1');
      const lbl2El = this.el('vor-lbl-2');
      const lbl3El = this.el('vor-lbl-3');
      const lbl4El = this.el('vor-lbl-4');
      const bannerCtrlEl = this.el('veh-banner-controls');

      let hullSvg = '';
      let turretSvg = '';
      let pTitle = 'MBT FIRE CONTROL & ARMOR';
      let legTur = '▲ TURRET AIM';
      let legHul = '▬ HULL FRONT';
      let l1 = 'TURRET HDG';
      let l2 = 'HULL HDG';
      let l3 = 'SLEW OFFSET';
      let l4 = 'DRIVE GEAR';
      let ctrlText = 'WASD Drive • Mouse Aim Turret • [1/2] Weapons • [E] Exit';

      if (v.type === 'bike' || v.type === 'atv') {
        const isAtv = v.type === 'atv';
        pTitle = isAtv ? 'QUAD ATV DIGITAL TACH & LEAN' : 'MOTO TACHOMETER & LEAN GAUGE';
        legTur = '▲ RPM / SPEED';
        legHul = '▬ LEAN ANGLE';
        l1 = 'RIDER AIM';
        l2 = isAtv ? 'QUAD HDG' : 'BIKE HDG';
        l3 = 'LEAN / LOOK';
        l4 = 'GEAR & RPM';
        ctrlText = isAtv
          ? 'W/S Throttle/Reverse • A/D Steer Quad • [SPACE] Overdrive Boost • LMB Fire Dual PDW • [E] Dismount'
          : 'W/S Throttle/Brake • A/D Lean & Steer • [SPACE] Wheelie/Boost • LMB Fire SMG • [E] Dismount';
        // Tilting Bike/Quad Lean Horizon inside hullGroup
        hullSvg = `
          <line x1="22" y1="60" x2="98" y2="60" stroke="rgba(46, 204, 113, 0.45)" stroke-width="1.6" stroke-dasharray="3 2"/>
          <line x1="34" y1="48" x2="86" y2="48" stroke="#2ecc71" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="5" fill="#2ecc71"/>
          <line x1="60" y1="36" x2="60" y2="84" stroke="#2ecc71" stroke-width="2.4" stroke-linecap="round"/>
        `;
        // Motorsport Analog Tachometer Arc + Rotating Needle + Digital Speedo Readout inside turretGroup
        turretSvg = `
          <path d="M 24 84 A 44 44 0 1 1 96 84" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="5" stroke-linecap="round"/>
          <path d="M 84 26 A 44 44 0 0 1 96 84" fill="none" stroke="rgba(255, 82, 82, 0.75)" stroke-width="5" stroke-linecap="round"/>
          <g id="moto-tach-needle" transform="rotate(-120 60 60)">
            <line x1="60" y1="60" x2="60" y2="18" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
          </g>
          <rect x="34" y="68" width="52" height="30" rx="4" fill="rgba(6, 12, 18, 0.94)" stroke="rgba(0, 210, 211, 0.6)" stroke-width="1.2"/>
          <text id="moto-dial-kmh" x="60" y="83" fill="#00d2d3" font-size="12" font-weight="900" font-family="Consolas, monospace" text-anchor="middle">000</text>
          <text id="moto-dial-gear" x="60" y="94" fill="#f1c40f" font-size="7.5" font-weight="900" text-anchor="middle">KM/H • N</text>
        `;
      } else if (v.type === 'humvee') {
        pTitle = '4×4 TACTICAL MRAP & RWS';
        legTur = '▲ .50 CAL RWS';
        legHul = '▬ 4×4 CHASSIS';
        l1 = 'RWS HDG';
        l2 = 'CHASSIS HDG';
        l3 = 'MOUNT OFFSET';
        l4 = 'DRIVETRAIN';
        ctrlText = 'WASD Drive 4×4 • Mouse Aim Roof .50 Cal HMG • LMB Fire • [E] Exit Vehicle';
        hullSvg = `
          <rect x="35" y="32" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="79" y="32" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="35" y="72" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="79" y="72" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="41" y="27" width="38" height="66" rx="5" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <rect x="45" y="42" width="30" height="12" rx="2" fill="rgba(0, 210, 211, 0.18)" stroke="#2ecc71" stroke-width="1.2"/>
          <polygon points="60,21 53,27 67,27" fill="#2ecc71"/>
          <text x="60" y="84" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">4×4</text>
        `;
        turretSvg = `
          <polygon points="60,60 40,12 80,12" fill="rgba(0, 210, 211, 0.10)"/>
          <line x1="60" y1="52" x2="60" y2="16" stroke="#00d2d3" stroke-width="3.2" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="9" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,11 56,19 64,19" fill="#00d2d3"/>
        `;
      } else if (v.type === 'apc') {
        pTitle = '8×8 AMPHIBIOUS IFV / APC';
        legTur = '▲ 30MM TURRET';
        legHul = '▬ 8×8 HULL';
        l1 = 'TURRET HDG';
        l2 = '8×8 HULL HDG';
        l3 = 'TURRET OFFSET';
        l4 = '8×8 DRIVE';
        ctrlText = 'WASD Drive 8×8 IFV • Mouse Aim 30mm Autocannon • [1] 30mm HE / [2/SPACE] Coax MG • [E] Exit';
        hullSvg = `
          <rect x="35" y="28" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="43" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="64" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="79" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="28" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="43" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="64" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="79" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <polygon points="48,23 72,23 80,35 80,92 40,92 40,35" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,17 53,23 67,23" fill="#2ecc71"/>
          <text x="60" y="85" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">8×8 IFV</text>
        `;
        turretSvg = `
          <polygon points="60,60 38,12 82,12" fill="rgba(0, 210, 211, 0.11)"/>
          <line x1="60" y1="50" x2="60" y2="14" stroke="#00d2d3" stroke-width="3.6" stroke-linecap="round"/>
          <polygon points="52,47 68,47 72,68 48,68" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,9 55,17 65,17" fill="#00d2d3"/>
        `;
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        pTitle = 'SPAAG AIR-DEFENSE RADAR & FLAK';
        legTur = '▲ TWIN AA + SAM';
        legHul = '▬ SPAAG HULL';
        l1 = 'RADAR HDG';
        l2 = 'CHASSIS HDG';
        l3 = 'TURRET OFFSET';
        l4 = 'CHASSIS DRIVE';
        ctrlText = 'WASD Drive • Mouse Aim Flak & SAM Radar • LMB Twin AA • [SPACE] Fire Locked SAM • [E] Exit';
        hullSvg = `
          <rect x="36" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.25)" stroke="#2ecc71" stroke-width="1.5"/>
          <rect x="77" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.25)" stroke="#2ecc71" stroke-width="1.5"/>
          <rect x="43" y="30" width="34" height="60" rx="4" fill="rgba(46, 204, 113, 0.2)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,21 52,30 68,30" fill="#2ecc71"/>
          <text x="60" y="83" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">SPAAG</text>
        `;
        turretSvg = `
          <polygon points="60,60 34,12 86,12" fill="rgba(0, 210, 211, 0.12)"/>
          <line x1="55" y1="50" x2="55" y2="15" stroke="#00d2d3" stroke-width="2.8" stroke-linecap="round"/>
          <line x1="65" y1="50" x2="65" y2="15" stroke="#00d2d3" stroke-width="2.8" stroke-linecap="round"/>
          <rect x="44" y="52" width="5" height="14" rx="1" fill="#f39c12" stroke="#00d2d3" stroke-width="1.2"/>
          <rect x="71" y="52" width="5" height="14" rx="1" fill="#f39c12" stroke="#00d2d3" stroke-width="1.2"/>
          <circle cx="60" cy="60" r="12" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2.2"/>
          <path d="M 51 69 Q 60 76 69 69" fill="none" stroke="#f1c40f" stroke-width="2.2"/>
        `;
      } else if (v.type === 'warhorse') {
        pTitle = 'CAVALRY DESTRIER MOUNT';
        legTur = '▲ ARCHER AIM';
        legHul = '▬ STEED BODY';
        l1 = 'BOW AIM HDG';
        l2 = 'STEED HDG';
        l3 = 'SADDLE ANGLE';
        l4 = 'GAIT SPEED';
        ctrlText = 'W/S Gallop/Trot • A/D Turn Steed • [SPACE] Rear / Jump • LMB Loose Warbow Arrow • [E] Dismount';
        hullSvg = `
          <ellipse cx="60" cy="64" rx="11" ry="22" fill="rgba(212, 172, 13, 0.25)" stroke="#f1c40f" stroke-width="2"/>
          <ellipse cx="60" cy="36" rx="6" ry="11" fill="rgba(212, 172, 13, 0.35)" stroke="#f1c40f" stroke-width="1.8"/>
          <polygon points="55,27 53,21 58,25" fill="#f1c40f"/>
          <polygon points="65,27 67,21 62,25" fill="#f1c40f"/>
          <path d="M 60 86 Q 57 95 62 98" fill="none" stroke="#f1c40f" stroke-width="2.5" stroke-linecap="round"/>
          <text x="60" y="68" fill="#f1c40f" font-size="6.5" font-weight="900" text-anchor="middle">STEED</text>
        `;
        turretSvg = `
          <polygon points="60,60 38,12 82,12" fill="rgba(0, 210, 211, 0.10)"/>
          <path d="M 46 34 Q 60 22 74 34" fill="none" stroke="#00d2d3" stroke-width="2.4"/>
          <line x1="46" y1="34" x2="74" y2="34" stroke="rgba(0, 210, 211, 0.55)" stroke-width="1.2"/>
          <line x1="60" y1="56" x2="60" y2="15" stroke="#00d2d3" stroke-width="2.4" stroke-linecap="round"/>
          <polygon points="60,10 56,18 64,18" fill="#00d2d3"/>
          <circle cx="60" cy="56" r="6" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
        `;
      } else if (v.type === 'trebuchet') {
        pTitle = 'SIEGE TREBUCHET BALLISTICS';
        legTur = '▲ SLING ARC';
        legHul = '▬ OAK A-FRAME';
        l1 = 'FIRING AZIMUTH';
        l2 = 'FRAME BEARING';
        l3 = 'TRAVERSE';
        l4 = 'IMPACT RANGE';
        ctrlText = 'A/D Traverse Timber Frame • W/S Adjust Boulder Range • LMB Loose Flaming Boulder • [T/G] Crew • [E] Leave';
        hullSvg = `
          <rect x="38" y="28" width="6" height="64" rx="1.5" fill="rgba(211, 84, 0, 0.30)" stroke="#e67e22" stroke-width="1.8"/>
          <rect x="76" y="28" width="6" height="64" rx="1.5" fill="rgba(211, 84, 0, 0.30)" stroke="#e67e22" stroke-width="1.8"/>
          <line x1="38" y1="36" x2="82" y2="36" stroke="#e67e22" stroke-width="2.2"/>
          <line x1="38" y1="54" x2="82" y2="54" stroke="#e67e22" stroke-width="2.5"/>
          <line x1="38" y1="84" x2="82" y2="84" stroke="#e67e22" stroke-width="2.2"/>
          <polygon points="60,20 53,28 67,28" fill="#e67e22"/>
          <text x="60" y="74" fill="#f39c12" font-size="6.5" font-weight="900" text-anchor="middle">SIEGE</text>
        `;
        turretSvg = `
          <polygon points="60,60 42,10 78,10" fill="rgba(243, 156, 18, 0.14)"/>
          <line x1="60" y1="82" x2="60" y2="16" stroke="#f1c40f" stroke-width="4" stroke-linecap="round"/>
          <rect x="52" y="38" width="16" height="10" rx="2" fill="rgba(44, 62, 80, 0.95)" stroke="#f39c12" stroke-width="1.8"/>
          <circle cx="60" cy="82" r="5" fill="#e74c3c" stroke="#f1c40f" stroke-width="1.5"/>
          <polygon points="60,9 55,18 65,18" fill="#f1c40f"/>
        `;
      } else if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
        const isTrex = v.type === 'trex_mount';
        pTitle = isTrex ? 'APEX T-REX PREDATOR' : 'VELOCIRAPTOR PACK HUNTER';
        legTur = '▲ JAW / TALON AIM';
        legHul = '▬ THEROPOD BODY';
        l1 = 'GAZE HDG';
        l2 = 'BODY HDG';
        l3 = 'NECK ANGLE';
        l4 = 'STRIDE SPEED';
        ctrlText = 'WASD Sprint/Stalk • Mouse Aim Jaws • LMB Savage Bite / Claws • [SPACE] Leap / Roar • [E] Release';
        hullSvg = `
          <ellipse cx="60" cy="60" rx="${isTrex ? 14 : 10}" ry="22" fill="rgba(231, 76, 60, 0.25)" stroke="#ff5252" stroke-width="2"/>
          <polygon points="52,40 60,20 68,40" fill="rgba(231, 76, 60, 0.35)" stroke="#ff5252" stroke-width="1.8"/>
          <path d="M 60 82 Q 55 95 63 102" fill="none" stroke="#ff5252" stroke-width="3.2" stroke-linecap="round"/>
          <text x="60" y="64" fill="#ff5252" font-size="6.5" font-weight="900" text-anchor="middle">${isTrex ? 'T-REX' : 'RAPTOR'}</text>
        `;
        turretSvg = `
          <polygon points="60,60 36,12 84,12" fill="rgba(255, 82, 82, 0.14)"/>
          <line x1="60" y1="54" x2="60" y2="16" stroke="#ff5252" stroke-width="3" stroke-linecap="round"/>
          <polygon points="60,10 54,19 66,19" fill="#ff5252"/>
          <circle cx="60" cy="56" r="7" fill="rgba(28, 14, 14, 0.95)" stroke="#ff5252" stroke-width="2"/>
        `;
      } else if (v.type === 'emplace_mortar' || v.type === 'emplace_hmg') {
        const isMortar = v.type === 'emplace_mortar';
        pTitle = isMortar ? '81MM INDIRECT MORTAR PIT' : 'HEAVY MG BUNKER EMPLACEMENT';
        legTur = isMortar ? '▲ TUBE AZIMUTH' : '▲ HMG BARREL';
        legHul = '▬ SANDBAG PIT';
        l1 = 'BARREL HDG';
        l2 = 'MOUNT HDG';
        l3 = 'TRAVERSE ARC';
        l4 = isMortar ? 'IMPACT RANGE' : 'MOUNT STATUS';
        ctrlText = isMortar
          ? 'A/D Traverse Tube • W/S Elevation Range • LMB Fire 81mm HE • [SPACE] 3-Round Barrage • [E] Exit'
          : 'Mouse Aim HMG • LMB Sustained .50 Cal Fire • [E] Dismount Emplacement';
        hullSvg = `
          <circle cx="60" cy="60" r="28" fill="rgba(46, 204, 113, 0.15)" stroke="#2ecc71" stroke-width="2" stroke-dasharray="6 3"/>
          <line x1="60" y1="60" x2="40" y2="82" stroke="#2ecc71" stroke-width="2.2"/>
          <line x1="60" y1="60" x2="80" y2="82" stroke="#2ecc71" stroke-width="2.2"/>
          <polygon points="60,26 53,34 67,34" fill="#2ecc71"/>
        `;
        turretSvg = `
          <polygon points="60,60 40,12 80,12" fill="rgba(0, 210, 211, 0.12)"/>
          <line x1="60" y1="58" x2="60" y2="16" stroke="#00d2d3" stroke-width="4.2" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="9" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,10 55,18 65,18" fill="#00d2d3"/>
        `;
      } else {
        // Default: Main Battle Tank ('tank') with Live Directional Armor Zone Bars (Front Glacis, Left/Right Skirts, Rear Engine Deck)
        hullSvg = `
          <rect id="tank-svg-armor-front" x="42" y="22" width="36" height="5" rx="2" fill="#2ecc71"/>
          <rect id="tank-svg-armor-left" x="35" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.35)" stroke="#2ecc71" stroke-width="1.6"/>
          <rect id="tank-svg-armor-right" x="78" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.35)" stroke="#2ecc71" stroke-width="1.6"/>
          <rect id="tank-svg-armor-rear" x="42" y="92" width="36" height="5" rx="2" fill="#2ecc71"/>
          <rect id="tank-svg-hull-body" x="43" y="30" width="34" height="60" rx="4" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,16 53,22 67,22" fill="#2ecc71"/>
          <text id="tank-svg-hull-pct" x="60" y="83" fill="#2ecc71" font-size="8" font-weight="900" text-anchor="middle">100%</text>
        `;
        turretSvg = `
          <polygon points="60,60 36,12 84,12" fill="rgba(0, 210, 211, 0.11)"/>
          <line x1="60" y1="60" x2="36" y2="12" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1" stroke-dasharray="3 3"/>
          <line x1="60" y1="60" x2="84" y2="12" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1" stroke-dasharray="3 3"/>
          <line x1="60" y1="48" x2="60" y2="14" stroke="#00d2d3" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="65" y1="48" x2="65" y2="28" stroke="#f39c12" stroke-width="2" stroke-linecap="round"/>
          <polygon points="60,9 55,17 65,17" fill="#00d2d3"/>
          <circle cx="60" cy="60" r="13" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2.2"/>
          <circle cx="60" cy="60" r="3" fill="#00d2d3"/>
        `;
      }

      hullGroup.innerHTML = hullSvg;
      turretGroup.innerHTML = turretSvg;
      if (titleEl) titleEl.textContent = pTitle;
      if (legTurEl) legTurEl.textContent = legTur;
      if (legHulEl) legHulEl.textContent = legHul;
      if (lbl1El) lbl1El.textContent = l1;
      if (lbl2El) lbl2El.textContent = l2;
      if (lbl3El) lbl3El.textContent = l3;
      if (lbl4El) lbl4El.textContent = l4;
      if (bannerCtrlEl) bannerCtrlEl.textContent = ctrlText;
    }

    if (v.type === 'tank' && hullGroup) {
      const hullPct = Math.max(
        0,
        Math.min(100, Math.round(v.hullIntegrityPct ?? (v.hp / Math.max(1, v.maxHp)) * 100))
      );
      const az = v.armorZones || { front: 100, left: 100, right: 100, rear: 100 };
      const zoneColor = (pct) => (pct < 38 ? '#ff5252' : pct < 70 ? '#f39c12' : '#2ecc71');
      const fEl = hullGroup.querySelector('#tank-svg-armor-front');
      const lEl = hullGroup.querySelector('#tank-svg-armor-left');
      const rEl = hullGroup.querySelector('#tank-svg-armor-right');
      const bEl = hullGroup.querySelector('#tank-svg-armor-rear');
      const bodyEl = hullGroup.querySelector('#tank-svg-hull-body');
      const pctEl = hullGroup.querySelector('#tank-svg-hull-pct');
      if (fEl) fEl.setAttribute('fill', zoneColor(az.front ?? 100));
      if (lEl) lEl.setAttribute('stroke', zoneColor(az.left ?? 100));
      if (rEl) rEl.setAttribute('stroke', zoneColor(az.right ?? 100));
      if (bEl) bEl.setAttribute('fill', zoneColor(az.rear ?? 100));
      if (bodyEl) bodyEl.setAttribute('stroke', zoneColor(hullPct));
      if (pctEl) {
        pctEl.textContent = `${hullPct}%`;
        pctEl.setAttribute('fill', zoneColor(hullPct));
      }
    }

    if (isMotoDash && turretGroup) {
      const kmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.max(80, Math.round((v.speed || 32) * 3.6));
      const rpmFrac = v.engineRpm
        ? Math.min(1, Math.max(0, (v.engineRpm - 1200) / 10800))
        : Math.min(1, kmh / maxKmh);
      const needleDeg = -120 + rpmFrac * 240;
      const needleEl = turretGroup.querySelector('#moto-tach-needle');
      if (needleEl) needleEl.setAttribute('transform', `rotate(${needleDeg.toFixed(1)} 60 60)`);
      const dialKmhEl = turretGroup.querySelector('#moto-dial-kmh');
      if (dialKmhEl) dialKmhEl.textContent = String(kmh).padStart(3, '0');
      const dialGearEl = turretGroup.querySelector('#moto-dial-gear');
      if (dialGearEl) {
        const gStr = v.isElectric ? 'EV' : `G${v.currentGear || 'N'}`;
        dialGearEl.textContent = `KM/H • ${gStr}`;
      }
    }

    // 2. Rotate Peripheral Hull Ring around Center Gunner Reticle
    const reticleHullRing = this.el('reticle-hull-ring');
    if (reticleHullRing) {
      reticleHullRing.style.transform = `rotate(${hullRelDeg}deg)`;
    }
    const reticleHullChevron = this.el('reticle-hull-chevron');
    if (reticleHullChevron) {
      const hullWord =
        v.type === 'bike' || v.type === 'atv'
          ? 'FRAME'
          : v.type === 'warhorse'
          ? 'STEED'
          : v.type === 'trebuchet'
          ? 'A-FRAME'
          : 'HULL';
      reticleHullChevron.textContent =
        Math.abs(hullRelDeg) <= 6
          ? `▲ ${hullWord} ALIGNED`
          : `▲ ${hullWord} (${hullRelDeg > 0 ? '+' : ''}${Math.round(hullRelDeg)}°)`;
    }

    // 3. Update Digital Heading Readouts
    const turretHdgEl = this.el('veh-turret-hdg-val');
    if (turretHdgEl) {
      turretHdgEl.textContent = `${String(turretDeg).padStart(3, '0')}° ${turretDirStr}`;
    }
    const hullHdgEl = this.el('veh-hull-hdg-val');
    if (hullHdgEl) {
      hullHdgEl.textContent = `${String(hullDeg).padStart(3, '0')}° ${hullDirStr}`;
    }
    const offsetEl = this.el('veh-offset-val');
    if (offsetEl) {
      const absOff = Math.abs(Math.round(turretOffsetDeg));
      if (absOff <= 5) {
        offsetEl.textContent = `ALIGNED (${absOff}°)`;
        offsetEl.className = 'vor-val aligned';
      } else {
        const side = turretOffsetDeg > 0 ? 'RIGHT' : 'LEFT';
        offsetEl.textContent = `${turretOffsetDeg > 0 ? '+' : '-'}${absOff}° ${side}`;
        offsetEl.className = 'vor-val offset';
      }
    }
    const gearEl = this.el('veh-gear-val');
    if (gearEl) {
      const spd = v.forwardSpeed || 0;
      const kmh = Math.round(Math.abs(spd) * 3.6);
      const maxKmh = Math.round((v.speed || 0) * 3.6);
      if (v.isAircraft) {
        const gY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        const alt = Math.max(0, Math.round(v.pos.y - gY));
        gearEl.textContent = `ALT ${alt}M • ${kmh} KM/H`;
      } else if (v.type === 'trebuchet' || v.type === 'emplace_mortar') {
        const rng = Math.round(this.player?.mortarRangeM || 200);
        gearEl.textContent = `ARC ${rng}M • STATIC`;
      } else if (v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount') {
        const gait =
          kmh > maxKmh * 0.72 ? 'GALLOP' : kmh > maxKmh * 0.3 ? 'CANTER' : kmh > 2 ? 'TROT' : 'HALT';
        gearEl.textContent = `${gait} • ${kmh}/${maxKmh} KM/H`;
      } else if (v.type === 'bike' || v.type === 'atv') {
        const gearLabel = v.isElectric
          ? spd > 0.3
            ? 'DIRECT EV'
            : spd < -0.3
            ? 'REV EV'
            : 'READY EV'
          : typeof v.currentGear === 'number'
          ? `GEAR ${v.currentGear}`
          : `GEAR ${v.currentGear || 'N'}`;
        const rpmVal = v.engineRpm || (v.isElectric ? 0 : 1400);
        gearEl.textContent = `${gearLabel} • ${rpmVal} RPM • ${kmh} KM/H`;
      } else {
        const gearStr = spd > 0.4 ? 'FWD [W]' : spd < -0.4 ? 'REV [S]' : 'NEUTRAL';
        gearEl.textContent = `${gearStr} • ${kmh}/${maxKmh} KM/H`;
      }
    }

    // 4. Update Dual Weapon Fire-Control Cards (Specific to each vehicle class)
    const activeSlot = v.activeWeaponSlot || 0;
    const cardPrimary = this.el('veh-wpn-card-primary');
    const cardCoax = this.el('veh-wpn-card-coax');
    const hasCoax = Boolean(
      v.type === 'tank' ||
        v.type === 'apc' ||
        v.type === 'aa' ||
        v.type === 'emplace_aa' ||
        v.type === 'emplace_mortar' ||
        v.type === 'trebuchet' ||
        v.type === 'warhorse' ||
        v.type === 'trex_mount' ||
        v.type === 'raptor_mount' ||
        v.type === 'bike' ||
        v.type === 'atv' ||
        v.isAircraft
    );

    if (cardPrimary) {
      cardPrimary.classList.toggle('active', activeSlot === 0);
    }
    if (cardCoax) {
      cardCoax.style.display = hasCoax ? 'block' : 'none';
      cardCoax.classList.toggle('active', activeSlot >= 1);
    }

    const wpn1NameEl = this.el('veh-wpn1-name');
    const wpn1KeyEl = this.el('veh-wpn1-key');
    const wpn1BarEl = this.el('veh-wpn1-bar');
    const wpn1StatusEl = this.el('veh-wpn1-status');
    const wpn2NameEl = this.el('veh-wpn2-name');

    if (v.isAircraft) {
      const aRole = v.aircraftRole || v.type;
      if (wpn1NameEl) {
        wpn1NameEl.textContent =
          aRole === 'wright_flyer'
            ? '[1] 1903 BRASS GATLING MG (840 RPM)'
            : aRole === 'b2_spirit'
            ? '[1] 80× MK-82 CARPET BOMB BAY'
            : aRole === 'cas'
            ? '[1] 30MM GAU-8 BRRRT'
            : aRole === 'gunship'
            ? '[1] 25MM GATLING + [2] 40MM BOFORS'
            : '[1] 20MM VULCAN + [3] JDAM BOMBS';
      }
      if (wpn1KeyEl) {
        wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'LMB / [1/2/3]';
      }
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.08 && aRole === 'fighter' && activeSlot === 2) {
          const maxCd = v.maxFireCooldown || 0.85;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `BOMB BAY CYCLING... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = '#2ecc71';
          wpn1StatusEl.textContent =
            aRole === 'wright_flyer'
              ? 'READY • 1903 GATLING [LMB] + 3× DYNAMITE [SPACE]'
              : aRole === 'b2_spirit'
              ? activeSlot === 1
                ? 'READY • TWIN 30,000LB GBU-57 MOP [LMB/SPACE]'
                : activeSlot === 2
                ? 'READY • 20MM STEALTH CANNON [LMB] + AIM-9X [SPACE]'
                : 'READY • 5-BOMB ROLLING CARPET SALVO (HOLD LMB/SPACE)'
              : aRole === 'cas'
              ? 'READY • 1,320 RPM AP-HEI STRAFE'
              : aRole === 'gunship'
              ? activeSlot === 1
                ? 'READY • 40MM BOFORS AIRBURST [LMB]'
                : 'READY • 1,600 RPM 25MM GATLING [LMB]'
              : activeSlot === 2
              ? 'READY • ⊕ 500LB JDAM [LMB] / GBU-28 [SPACE]'
              : 'READY • 1,080 RPM A2A CANNON + [3] BOMBS';
          wpn1StatusEl.style.color = '#2ecc71';
        }
      }

      if (wpn2NameEl) {
        wpn2NameEl.textContent =
          aRole === 'wright_flyer'
            ? '[2/SPACE] 3× DYNAMITE CRATES + [X] TAILWIND'
            : aRole === 'b2_spirit'
            ? '[2] 2× GBU-57 MOP + [X] RAM STEALTH'
            : aRole === 'cas'
            ? '[2] HYDRA-70 ROCKETS'
            : aRole === 'gunship'
            ? '[3/SPACE] 105MM M102 HOWITZER'
            : activeSlot === 2
            ? '[SPACE] 2,000LB GBU-28'
            : '[2/SPACE] AIM-9X / R-73 A2A';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) {
        wpn2KeyEl.textContent =
          aRole === 'b2_spirit' ? 'SPACE / [2] / [X]' : aRole === 'gunship' ? 'SPACE / [3]' : 'SPACE / [2]';
      }
      if (wpn2BarEl && wpn2StatusEl) {
        const secCd = v.secondaryCooldown || 0;
        if (secCd > 0.05) {
          const maxSec = aRole === 'gunship' ? 3.2 : aRole === 'fighter' ? 1.8 : 0.45;
          const pct = Math.max(0, Math.min(100, ((maxSec - secCd) / maxSec) * 100));
          wpn2BarEl.style.width = `${pct}%`;
          wpn2BarEl.style.background = '#f39c12';
          wpn2StatusEl.textContent = `RELOADING ORDNANCE... ${secCd.toFixed(1)}s`;
          wpn2StatusEl.style.color = '#f39c12';
        } else if (aRole === 'b2_spirit') {
          const cloakActive = (v.flareActiveTimer || 0) > 0;
          wpn2BarEl.style.width = '100%';
          wpn2BarEl.style.background = cloakActive ? '#a29bfe' : '#00d2d3';
          wpn2StatusEl.textContent = cloakActive
            ? `🦇 ACTIVE RAM CLOAK: ${v.flareActiveTimer.toFixed(1)}S (0% RADAR SIGNATURE)`
            : '🦇 88% LOW-OBSERVABLE STEALTH • [X] ACTIVE CLOAK';
          wpn2StatusEl.style.color = cloakActive ? '#dcdde1' : '#7bed9f';
        } else if (aRole === 'fighter' && activeSlot !== 2) {
          const lockTgt = this.player.aircraftLockTarget;
          const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
          wpn2BarEl.style.width = lockTgt ? `${Math.max(25, lockPct)}%` : '100%';
          wpn2BarEl.style.background = lockTgt && lockPct >= 100 ? '#ff3838' : '#00d2d3';
          wpn2StatusEl.textContent = lockTgt
            ? lockPct >= 100
              ? `🎯 LOCKED ON ${lockTgt.name.split(' ')[0]} — PRESS [SPACE]!`
              : `📡 SEEKING ${lockTgt.name.split(' ')[0]} (${lockPct}%)`
            : 'READY • AIM AT JET FOR LOCK OR [3] FOR BOMBS';
          wpn2StatusEl.style.color = lockTgt && lockPct >= 100 ? '#ff5252' : '#7bed9f';
        } else {
          wpn2BarEl.style.width = '100%';
          wpn2BarEl.style.background = '#00d2d3';
          wpn2StatusEl.textContent =
            aRole === 'cas'
              ? 'READY • 70MM HE-AT ROCKET SALVO [SPACE]'
              : aRole === 'gunship'
              ? 'READY • 105MM AERIAL ARTILLERY SHELL [SPACE]'
              : 'READY • 2,000LB BUNKER BUSTER [SPACE]';
          wpn2StatusEl.style.color = '#7bed9f';
        }
      }
      return;
    }

    if (v.type === 'aa' || v.type === 'emplace_aa') {
      if (wpn1NameEl) wpn1NameEl.textContent = '[1] TWIN 25/30MM PROXIMITY AA';
      if (wpn1KeyEl) wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'PRESS [1]';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent = 'READY • 1,050 RPM PROXIMITY AIRBURST FLAK';
        wpn1StatusEl.style.color = '#2ecc71';
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[2] STINGER / 9M311 SAM POD';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE / [2]';
      if (wpn2BarEl && wpn2StatusEl) {
        const lockTgt = this.player.aircraftLockTarget;
        const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
        wpn2BarEl.style.width = lockTgt ? `${Math.max(25, lockPct)}%` : '100%';
        wpn2BarEl.style.background = lockTgt && lockPct >= 100 ? '#ff3838' : '#00d2d3';
        wpn2StatusEl.textContent = lockTgt
          ? lockPct >= 100
            ? `🔒 SAM LOCKED ON ${lockTgt.name.split(' ')[0]} — PRESS [SPACE]!`
            : `📡 RADAR TRACKING ${lockTgt.name.split(' ')[0]} (${lockPct}%)`
          : 'READY • TRACK ENEMY AIRCRAFT FOR SAM LOCK';
        wpn2StatusEl.style.color = lockTgt && lockPct >= 100 ? '#ff5252' : '#7bed9f';
      }
      return;
    }

    if (v.type === 'emplace_mortar') {
      const mRange = Math.round(this.player.mortarRangeM || 200);
      if (wpn1NameEl) wpn1NameEl.textContent = `[1] 81MM INDIRECT HE (${mRange}M)`;
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB FIRE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#f1c40f';
        wpn1StatusEl.textContent = `ELEVATED INDIRECT ARC • IMPACT AT ${mRange}M (⊕ RING)`;
        wpn1StatusEl.style.color = '#f1c40f';
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[2] 3-ROUND RAPID BARRAGE';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE / [2]';
      if (wpn2BarEl && wpn2StatusEl) {
        wpn2BarEl.style.width = '100%';
        wpn2BarEl.style.background = '#e67e22';
        wpn2StatusEl.textContent = 'READY • 3× 81MM HE SALVO [SPACE]';
        wpn2StatusEl.style.color = '#7bed9f';
      }
      return;
    }

    if (v.type === 'bike' || v.type === 'atv') {
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 30) * 3.6);
      const leanDeg = Math.round(((v.roll || 0) * 180) / Math.PI);
      const isWheelie = Boolean(this.player?.keys?.['Space'] || (v.flareActiveTimer || 0) > 0);
      if (wpn1NameEl) {
        wpn1NameEl.textContent =
          v.type === 'atv' ? '[LMB] TWIN 9MM QUAD RACK PDW' : '[LMB] 9MM HANDLEBAR DRIVE-BY SMG';
      }
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB FIRE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent = `READY • ${v.rpm || 850} RPM DRIVE-BY AUTO • LEAN ${leanDeg >= 0 ? '+' : ''}${leanDeg}°`;
        wpn1StatusEl.style.color = '#2ecc71';
      }
      if (wpn2NameEl) {
        wpn2NameEl.textContent = v.isElectric
          ? '[SPACE/X] 80HP ELECTRIC OVERDRIVE'
          : v.isTwoStroke
          ? '[SPACE/X] 2-STROKE POWERBAND BOOST'
          : '[SPACE/X] WHEELIE / NITRO BOOST';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'HOLD SPACE / [X]';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        const gearTag = v.isElectric ? 'EV DRIVE' : `GEAR ${v.currentGear || 'N'}`;
        const rpmTag = `${v.engineRpm || 0} RPM`;
        wpn2BarEl.style.width = `${Math.max(12, pct)}%`;
        wpn2BarEl.style.background = isWheelie ? '#f1c40f' : '#00d2d3';
        wpn2StatusEl.textContent = isWheelie
          ? `🔥 WHEELIE / BOOST • ${spdKmh} KM/H (${gearTag} • ${rpmTag})`
          : `${spdKmh} / ${maxKmh} KM/H (${gearTag} • ${rpmTag}) • [SPACE] WHEELIE`;
        wpn2StatusEl.style.color = isWheelie ? '#f1c40f' : '#7bed9f';
      }
      return;
    }

    if (v.type === 'trebuchet') {
      const mRange = Math.round(this.player.mortarRangeM || 200);
      const crewCnt = v.setupCrewIds ? v.setupCrewIds.length : 0;
      const isReady = v.isTrebuchetReady !== false || crewCnt >= 2;
      if (wpn1NameEl) wpn1NameEl.textContent = `[LMB] FLAMING SIEGE BOULDER (${mRange}M)`;
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB LOOSE';
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.05) {
          const maxCd = v.maxFireCooldown || 3.3;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `WINCHING COUNTERWEIGHT... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = isReady ? '#2ecc71' : '#e67e22';
          wpn1StatusEl.textContent = isReady
            ? `READY • 90KG PITCH BOULDER ARC (${mRange}M IMPACT)`
            : 'HOLD [G] OR CALL CREW [T] TO COCK COUNTERWEIGHT';
          wpn1StatusEl.style.color = isReady ? '#2ecc71' : '#f39c12';
        }
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[T / G] SIEGE CREW & WINCH';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = '[T] CREW / [G] WINCH';
      if (wpn2BarEl && wpn2StatusEl) {
        wpn2BarEl.style.width = `${Math.min(100, Math.max(25, crewCnt * 50))}%`;
        wpn2BarEl.style.background = crewCnt >= 2 ? '#2ecc71' : '#00d2d3';
        wpn2StatusEl.textContent = `CREW ASSIGNED: ${crewCnt}/2 ENGINEERS • [W/S] ELEVATION`;
        wpn2StatusEl.style.color = '#7bed9f';
      }
      return;
    }

    if (v.type === 'warhorse') {
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 12.5) * 3.6);
      if (wpn1NameEl) wpn1NameEl.textContent = '[LMB] MOUNTED ROYAL YEW LONGBOW';
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB LOOSE';
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.05) {
          const maxCd = v.maxFireCooldown || 0.7;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `NOCKING BODKIN ARROW... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = '#2ecc71';
          wpn1StatusEl.textContent = 'READY • 110LB DRAW BODKIN ARROW + TRAMPLE CHARGE';
          wpn1StatusEl.style.color = '#2ecc71';
        }
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[SPACE] CAVALRY GALLOP & REAR JUMP';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'W/S + [SPACE]';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        wpn2BarEl.style.width = `${Math.max(15, pct)}%`;
        wpn2BarEl.style.background = '#f1c40f';
        wpn2StatusEl.textContent = `DESTRIER PACE: ${spdKmh} / ${maxKmh} KM/H • TRAMPLE ACTIVE > 28 KM/H`;
        wpn2StatusEl.style.color = '#f1c40f';
      }
      return;
    }

    if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
      const isTrex = v.type === 'trex_mount';
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 20.5) * 3.6);
      if (wpn1NameEl) {
        wpn1NameEl.textContent = isTrex
          ? '[LMB] CRUSHING JAWS & SEISMIC STOMP'
          : '[LMB] SICKLE TALONS & VENOM SPIT';
      }
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB SAVAGE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#ff5252';
        wpn1StatusEl.textContent = isTrex
          ? 'READY • 160 DMG APEX JAW CRUSH + SHOCKWAVE'
          : 'READY • 78 DMG TALON SLASH / ACID SPIT';
        wpn1StatusEl.style.color = '#ff5252';
      }
      if (wpn2NameEl) {
        wpn2NameEl.textContent = isTrex ? '[SPACE] APEX ROAR & CHARGE' : '[SPACE] PREDATOR POUNCE LEAP';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        wpn2BarEl.style.width = `${Math.max(18, pct)}%`;
        wpn2BarEl.style.background = '#e74c3c';
        wpn2StatusEl.textContent = `STRIDE SPEED: ${spdKmh} / ${maxKmh} KM/H`;
        wpn2StatusEl.style.color = '#ff7979';
      }
      return;
    }

    if (wpn2NameEl) {
      wpn2NameEl.textContent = '[2] 7.62MM COAX MG';
    }

    if (wpn1NameEl) {
      wpn1NameEl.textContent =
        v.weaponType === 'tank_cannon'
          ? v.team === 'RU'
            ? '[1] 125MM CANNON'
            : '[1] 120MM CANNON'
          : v.weaponType === 'autocannon'
          ? '[1] 30MM HE CANNON'
          : '[1] .50 CAL HMG';
    }
    if (wpn1KeyEl) {
      wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'PRESS [1]';
    }
    if (wpn1BarEl && wpn1StatusEl) {
      const maxCd = v.maxFireCooldown || 60 / (v.rpm || 18);
      if (v.fireCooldown > 0.05 && v.weaponType === 'tank_cannon') {
        const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
        wpn1BarEl.style.width = `${pct}%`;
        wpn1BarEl.style.background = '#f39c12';
        wpn1StatusEl.textContent = `RELOADING SHELL... ${v.fireCooldown.toFixed(1)}s`;
        wpn1StatusEl.style.color = '#f39c12';
      } else {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent =
          v.weaponType === 'tank_cannon'
            ? 'READY • APFSDS/HE (135M ZERO • 200-600 ARC)'
            : v.weaponType === 'autocannon'
            ? 'READY • 330 RPM HE-FRAG (145M ZERO)'
            : 'READY • 720 RPM .50 BMG AP-I (FLAT AT +)';
        wpn1StatusEl.style.color = '#2ecc71';
      }
    }

    if (hasCoax) {
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      const heatPct = Math.round(Math.min(100, (v.coaxHeat || 0) * 100));

      if (wpn2KeyEl) {
        wpn2KeyEl.textContent = activeSlot === 1 ? 'LMB / SPACE' : 'HOLD SPACE / [2]';
      }
      if (wpn2BarEl) {
        wpn2BarEl.style.width = `${heatPct}%`;
      }
      if (wpn2StatusEl) {
        if (v.coaxOverheated) {
          wpn2StatusEl.textContent = `⚠️ OVERHEATED (${heatPct}%) — COOLING`;
          wpn2StatusEl.style.color = '#ff5252';
        } else {
          wpn2StatusEl.textContent = `READY • 950 RPM AP (FLAT AT + • HEAT ${heatPct}%)`;
          wpn2StatusEl.style.color = '#bdc3c7';
        }
      }
    }
  },
  updateKillStreakBadge() {
    let el = this.el('kill-streak-badge');
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (this.player.killStreak >= 3 && !sbOpen) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'kill-streak-badge';
        el.style.cssText = `
          position: fixed; bottom: 165px; right: 18px;
          font-size: 14px; font-weight: 700; color: #f39c12;
          text-shadow: 0 1px 6px rgba(0,0,0,0.8);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('kill-streak-badge', el);
      }
      const inAircraft = Boolean(this.player.activeVehicle && this.player.activeVehicle.isAircraft);
      const mfdEl = inAircraft ? this.el('ac130-flir-mfd-card') : null;
      const mfdOpen = Boolean(mfdEl && !mfdEl.classList.contains('hidden'));
      const bottomStr = inAircraft ? (mfdOpen ? '374px' : '252px') : '165px';
      if (el._lastBottom !== bottomStr) {
        el._lastBottom = bottomStr;
        el.style.bottom = bottomStr;
      }
      this._setText(el, `🔥 STREAK: ${this.player.killStreak}`);
      this._setDisplay(el, 'block');
    } else if (el) {
      this._setDisplay(el, 'none');
    }
  },

  // Forward Base Entrenched Defender Advantage Badge (dirty-checked so innerHTML updates ONLY when state changes)
  updateForwardBaseDefenseBadge() {
    let el = this.el('fob-defense-badge');
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (
      this.player.inFriendlyForwardBase &&
      !this.player.activeVehicle?.isAircraft &&
      !this.player.dead &&
      !this.player.downed &&
      !sbOpen
    ) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'fob-defense-badge';
        el.style.cssText = `
          position: fixed; bottom: 215px; right: 18px;
          font-size: 11.5px; font-weight: 900; color: #7bed9f;
          background: rgba(16, 42, 32, 0.88);
          border: 1.5px solid rgba(46, 204, 113, 0.75);
          padding: 5px 10px; border-radius: 5px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 0.9px;
          pointer-events: none; z-index: 200;
          box-shadow: 0 4px 14px rgba(0,0,0,0.65);
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('fob-defense-badge', el);
      }
      const flagId = this.player.defendedFlagId || 'BASE';
      const stg = this.player.defendedFlagStage || 0;
      const garSqVal = this.player.defendedFlagGarrisonSquad || '';
      const sig = `${flagId}|${stg}|${garSqVal}`;
      if (el._lastSig !== sig) {
        el._lastSig = sig;
        const dmgRed = Math.min(42, 25 + stg * 4);
        const holdMult = (1.35 + stg * 0.075).toFixed(2);
        const garSq = garSqVal ? ` • GARRISON: ${garSqVal}` : '';
        el.innerHTML = `
          <div style="color:#2ecc71;font-size:12px;">🏰 OBJ ${flagId} ENTRENCHED DEFENSE (STAGE ${stg}/4${garSq})</div>
          <div style="color:#dfe6e9;font-size:10.5px;font-weight:800;">🛡️ -${dmgRed}% DMG TAKEN • 🎯 -30% RECOIL • ⚖️ ${holdMult}× HOLD • 🏥 +HP/ARMOR/AMMO</div>
        `;
      }
      this._setDisplay(el, 'block');
    } else if (el) {
      this._setDisplay(el, 'none');
    }
  },

  // War Crimes HUD Badge (dirty-checked so text/display update ONLY when count/state changes)
  updateWarCrimeBadge() {
    let el = this.el('war-crime-badge');
    const crimes = this.player.medicKills || 0;
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (crimes > 0 && !sbOpen) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'war-crime-badge';
        el.style.cssText = `
          position: fixed; bottom: 188px; right: 18px;
          font-size: 13px; font-weight: 800; color: #ff6b6b;
          background: rgba(192, 57, 43, 0.22);
          border: 1px solid rgba(231, 76, 60, 0.55);
          padding: 3px 10px; border-radius: 4px;
          text-shadow: 0 1px 6px rgba(0,0,0,0.9);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 1.5px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('war-crime-badge', el);
      }
      const inAircraft = Boolean(this.player.activeVehicle && this.player.activeVehicle.isAircraft);
      const mfdEl = inAircraft ? this.el('ac130-flir-mfd-card') : null;
      const mfdOpen = Boolean(mfdEl && !mfdEl.classList.contains('hidden'));
      const bottomStr = inAircraft ? (mfdOpen ? '398px' : '275px') : '188px';
      if (el._lastBottom !== bottomStr) {
        el._lastBottom = bottomStr;
        el.style.bottom = bottomStr;
      }
      this._setText(el, `⚠️ WAR CRIMES (MEDICS KILLED): ${crimes}`);
      this._setDisplay(el, 'block');
    } else if (el) {
      this._setDisplay(el, 'none');
    }
  },

  // ─── PROXIMITY & SQUAD TACTICAL COMMS FEED (COMPACT & NON-OBSTRUCTIVE) ──
  addTacticalCommsMessage(speakerName, role, channel, distM, text, isSelf = false) {
    let feed = this.el('tactical-comms-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.id = 'tactical-comms-feed';
      feed.style.cssText = `
        position: fixed; bottom: 512px; left: 14px; width: 256px;
        display: flex; flex-direction: column; gap: 3px;
        pointer-events: none; z-index: 150;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      `;
      document.body.appendChild(feed);
      if (this._domCache) this._domCache.set('tactical-comms-feed', feed);
    }

    const item = document.createElement('div');
    const isLocal = channel === 'LOCAL';
    const isCmdNet = channel === 'CMD NET';
    const isCommand = channel === 'COMMAND' || isCmdNet || isSelf;
    const badgeColor = isCommand ? '#f1c40f' : isLocal ? '#2ecc71' : '#5dade2';
    const channelLabel = isCmdNet
      ? '★CMD'
      : isCommand
      ? 'RADIO'
      : isLocal
      ? `${distM}m`
      : `${this.player.squadShort || 'ALP'}`;

    item.style.cssText = `
      background: rgba(10, 16, 22, 0.56);
      border-left: 2px solid ${badgeColor};
      border-radius: 3px;
      padding: 2.5px 6px;
      font-size: 10.5px;
      color: #ecf0f1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: opacity 0.25s ease-out;
    `;
    item.innerHTML = `<span style="font-size:9px;font-weight:900;color:${badgeColor};margin-right:4px;">[${channelLabel}]</span><strong style="color:${
      isSelf ? '#f1c40f' : '#fff'
    };margin-right:4px;">${speakerName}:</strong><span style="color:#dfe6e9;">${text}</span>`;

    feed.appendChild(item);
    while (feed.children.length > 2) {
      feed.removeChild(feed.firstChild);
    }

    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 280);
    }, 3400);
  },

  // ─── COMMANDER UAV HUD OVERLAY ──────────────────────────────────────
  updateUAVOverlay() {
    let el = this.el('uav-hud');
    if (this.player.uavActive) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'uav-hud';
        el.style.cssText = `
          position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
          font-size: 13px; font-weight: 800; color: #00d2d3;
          background: rgba(8, 16, 24, 0.85); padding: 4px 16px;
          border: 1.5px solid rgba(0, 210, 211, 0.65); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 1.5px;
          pointer-events: none; z-index: 9990;
          text-shadow: 0 0 8px rgba(0, 210, 211, 0.55);
          white-space: nowrap;
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('uav-hud', el);
      }
      let infCount = 0;
      const revBots = this.player.uavRevealedBots || [];
      for (let i = 0; i < revBots.length; i++) {
        if (!revBots[i].dead) infCount++;
      }
      let vehCount = 0;
      const revVehs = this.player.uavRevealedVehicles || [];
      for (let i = 0; i < revVehs.length; i++) {
        if (!revVehs[i].dead) vehCount++;
      }
      const hotspot = this.player.uavHotspotFlag ? ` • HOTSPOT: OBJ ${this.player.uavHotspotFlag}` : '';
      const assists = this.player.uavAssists ? ` • ASSISTS: ${this.player.uavAssists}` : '';
      this._setText(
        el,
        `📡 MQ-9 UAV DATALINK ACTIVE — ${Math.ceil(
          this.player.uavTimer
        )}s • ${infCount} INF / ${vehCount} ARMOR PAINTED${hotspot}${assists}`
      );
      this._setDisplay(el, 'block');
    } else if (el) {
      this._setDisplay(el, 'none');
    }
  },

  // ─── AIRSTRIKE INBOUND HUD ─────────────────────────────────────────
  updateAirstrikeHUD() {
    let el = this.el('airstrike-hud');
    if (this.player.airstrikeTarget) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'airstrike-hud';
        el.style.cssText = `
          position: fixed; top: 36px; left: 50%; transform: translateX(-50%);
          font-size: 15px; font-weight: 900; color: #ff6b6b;
          background: rgba(20, 8, 8, 0.85); padding: 4px 16px;
          border: 1.5px solid rgba(231, 76, 60, 0.75); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 9990;
          animation: airstrikeFlash 0.5s infinite alternate;
          white-space: nowrap;
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('airstrike-hud', el);
      }
      const pat = this.player.airstrikeTarget.pattern || 'CARPET';
      const patLabel =
        pat === 'BUNKER_BUSTER'
          ? '🎯 GBU-28 BUNKER BUSTER'
          : pat === 'ARTILLERY'
          ? '🌧️ 155MM ARTILLERY BARRAGE'
          : '✈️ F-15E JDAM CARPET RUN';
      const secs = Math.max(0, this.player.airstrikeTarget.timer).toFixed(1);
      this._setText(el, `💥 ${patLabel} INBOUND — ${secs}s`);
      this._setDisplay(el, 'block');
    } else if (el) {
      this._setDisplay(el, 'none');
    }
  },

  // ─── SQUAD FIELD AMMO & KIT-SWAP BAR (WHEN NEAR ANY AMMO STASH) ─────
  updateFieldKitBar(nearCrate) {
    let el = this.el('field-kit-bar');
    if (!nearCrate || this.player.dead || this.player.downed || this.player.activeVehicle) {
      if (el) this._setDisplay(el, 'none');
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'field-kit-bar';
      el.style.cssText = `
        position: fixed; bottom: 138px; left: 50%; transform: translateX(-50%);
        display: flex; align-items: center; gap: 6px; padding: 6px 12px;
        background: rgba(11, 18, 26, 0.92); border: 1.5px solid rgba(0, 210, 211, 0.75);
        border-radius: 6px; font-family: 'Rajdhani', sans-serif; z-index: 950;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.75); pointer-events: auto;
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('field-kit-bar', el);
    }

    const era = this.world?.era || 'modern';
    const activeRole = (this.player.role || 'engineer').toLowerCase();
    const curWepName = this.player.slots?.[0]?.def?.shortName || 'RIFLE';
    const isMac = isMacPlatform();
    const sig = `${era}:${this.player.team}:${activeRole}:${curWepName}:${isMac ? 'mac' : 'pc'}`;
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      const roles = getEraRoles(era, this.player.team);
      el.innerHTML =
        `<button id="fkb-resupply-btn" style="background:#00b894;border:1.5px solid #55efc4;color:#fff;border-radius:4px;padding:4px 9px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:900;font-size:11.5px;white-space:nowrap;">📦 [F] RESUPPLY 100%</button>` +
        `<button id="fkb-loadout-modal-btn" style="background:rgba(241,196,15,0.22);border:1.5px solid #f1c40f;color:#f1c40f;border-radius:4px;padding:4px 10px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:900;font-size:11.5px;white-space:nowrap;">🎒 [L] ROLE, GUN (${curWepName}) &amp; GUNSMITH</button>` +
        roles
          .map((r, idx) => {
            const isAct = r.id === activeRole;
            const bg = isAct ? 'rgba(46, 204, 113, 0.28)' : 'rgba(30, 42, 56, 0.85)';
            const border = isAct ? '#2ecc71' : 'rgba(255,255,255,0.2)';
            const col = isAct ? '#2ecc71' : '#ecf0f1';
            const keyHint = isMac ? `Shift+${idx + 1}` : r.key;
            return `<button class="field-kit-role-btn" data-role="${r.id}" style="
              background:${bg}; border:1.5px solid ${border}; color:${col};
              border-radius:4px; padding:3px 8px; cursor:pointer;
              font-family:'Rajdhani',sans-serif; font-weight:800; font-size:12px;
              display:flex; flex-direction:column; align-items:center; line-height:1.1;
            ">
              <span>[${keyHint}] ${r.icon} ${r.label}</span>
              <span style="font-size:9px;color:#95a5a6;font-weight:700;">${r.sub}</span>
            </button>`;
          })
          .join('');

      const resBtn = el.querySelector('#fkb-resupply-btn');
      if (resBtn) {
        resBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof this.player.resupplyAll === 'function') {
            this.player.resupplyAll(false);
          }
        });
      }
      const openMenuBtn = el.querySelector('#fkb-loadout-modal-btn');
      if (openMenuBtn) {
        openMenuBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof this.openLoadoutAndGunsmithModal === 'function') {
            this.openLoadoutAndGunsmithModal();
          }
        });
      }
      el.querySelectorAll('.field-kit-role-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const role = btn.dataset.role;
          if (role && typeof this.player.changeRoleInField === 'function') {
            this.player.changeRoleInField(role, true);
            el.dataset.sig = '';
          }
        });
      });
    }
    this._setDisplay(el, 'flex');
  },

  // ─── ANIMATED HUD RELOAD & BULLET-PACKING CUTAWAY VISUALIZER (CACHED SVG DOM) ────────
  _ensureReloadSvgStructure(el, mode) {
    if (el._reloadMode === mode && el._refs) {
      return el._refs;
    }
    el._reloadMode = mode;

    if (mode === 'mag_swap') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span data-ref="title" style="font-size:11.5px;font-weight:900;color:#f1c40f;letter-spacing:0.6px;">
            🔄 FAST MAG-SWAP RELOAD [R]
          </span>
          <span data-ref="pct" style="font-size:10.5px;font-weight:900;color:#7bed9f;">0%</span>
        </div>
        <svg viewBox="0 0 280 76" style="width:100%;height:72px;display:block;background:rgba(6,10,16,0.75);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">
          <!-- Receiver & Barrel Cutaway Silhouette -->
          <rect x="65" y="14" width="125" height="18" rx="2" fill="#2c3e50" stroke="#74b9ff" stroke-width="1.2"/>
          <rect x="190" y="19" width="62" height="7" rx="1" fill="#34495e" stroke="#74b9ff" stroke-width="1"/>
          <rect x="34" y="16" width="31" height="14" rx="2" fill="#1e272e" stroke="#576574" stroke-width="1"/>
          <!-- Magwell Housing -->
          <path d="M118 32 L144 32 L141 44 L116 44 Z" fill="#1e272e" stroke="#74b9ff" stroke-width="1"/>

          <!-- Animated Bolt Carrier & Chambering Brass Round -->
          <g data-ref="boltGroup" transform="translate(0, 0)">
            <rect data-ref="boltRect" x="108" y="16" width="34" height="8" rx="1.5" fill="#95a5a6" stroke="#111" stroke-width="1"/>
            <line x1="108" y1="12" x2="116" y2="16" stroke="#f1c40f" stroke-width="2"/>
          </g>
          <g data-ref="chamberGroup" transform="translate(-14, 0)" style="display:none;">
            <rect x="132" y="20" width="11" height="4" rx="1" fill="#f1c40f"/>
            <polygon points="143,20 149,22 143,24" fill="#e67e22"/>
          </g>

          <!-- Stage 1: Ejecting Old Magazine (Slides Down & Out) -->
          <g data-ref="oldMagGroup" transform="translate(88, 28) rotate(0)" opacity="1">
            <rect x="0" y="0" width="16" height="28" rx="2" fill="#3d3d3d" stroke="#e74c3c" stroke-width="1.2"/>
            <text x="2" y="18" fill="#ff7675" font-size="7.5" font-weight="900">OLD</text>
          </g>

          <!-- Stage 2: Fresh Brass-Topped Magazine Rising into Magwell -->
          <g data-ref="newMagGroup" transform="translate(121, 62)">
            <rect x="0" y="0" width="18" height="30" rx="2" fill="#22313f" stroke="#2ecc71" stroke-width="1.5"/>
            <rect x="3" y="2" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="7" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="12" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="17" width="12" height="3.5" rx="1" fill="#f1c40f"/>
          </g>

          <!-- Stage Callout Text & Progress Stroke -->
          <text data-ref="stageText" x="10" y="67" fill="#f1c40f" font-size="9.5" font-weight="900" font-family="Rajdhani, sans-serif">1. UNLATCH &amp; EJECT MAGAZINE</text>
          <line x1="10" y1="73" x2="270" y2="73" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round"/>
          <line data-ref="progStroke" x1="10" y1="73" x2="270" y2="73" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-dasharray="260" stroke-dashoffset="260"/>
        </svg>
      `;
      el._refs = {
        titleEl: el.querySelector('[data-ref="title"]'),
        pctEl: el.querySelector('[data-ref="pct"]'),
        boltGroup: el.querySelector('[data-ref="boltGroup"]'),
        boltRect: el.querySelector('[data-ref="boltRect"]'),
        chamberGroup: el.querySelector('[data-ref="chamberGroup"]'),
        oldMagGroup: el.querySelector('[data-ref="oldMagGroup"]'),
        newMagGroup: el.querySelector('[data-ref="newMagGroup"]'),
        stageText: el.querySelector('[data-ref="stageText"]'),
        progStroke: el.querySelector('[data-ref="progStroke"]')
      };
    } else {
      let stackSlotsHtml = '';
      for (let i = 0; i < 6; i++) {
        stackSlotsHtml += `
          <g data-stack="${i}" transform="translate(202, ${56 - i * 6})">
            <rect x="0" y="0" width="22" height="4.5" rx="1.5" fill="#f1c40f" stroke="#b7950b" stroke-width="0.6"/>
            <polygon points="22,0 28,2.25 22,4.5" fill="#e67e22"/>
          </g>
        `;
      }
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11.5px;font-weight:900;color:#7bed9f;letter-spacing:0.6px;">
            🎒 TARKOV SLOW RELOAD — PRESSING BULLETS [P]
          </span>
          <span data-ref="packed" style="font-size:10.5px;font-weight:900;color:#f1c40f;">+0 RDS PACKED</span>
        </div>
        <svg viewBox="0 0 280 76" style="width:100%;height:72px;display:block;background:rgba(6,10,16,0.75);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">
          <!-- Cutaway Magazine Body -->
          <rect x="196" y="22" width="38" height="48" rx="3" fill="#18222c" stroke="#2ecc71" stroke-width="1.6"/>
          <!-- Magazine Follower Spring at Bottom -->
          <polyline points="202,67 228,64 202,61 228,58" fill="none" stroke="#95a5a6" stroke-width="1.4"/>

          <!-- Pre-allocated Stacked Brass Cartridges Inside Magazine -->
          ${stackSlotsHtml}

          <!-- Animated Thumb + Loose Brass Cartridge Pressing Down into Feed Lips -->
          <g data-ref="thumbGroup" transform="translate(200, 4)">
            <rect x="-14" y="-6" width="24" height="9" rx="4" fill="#2ecc71" opacity="0.85"/>
            <rect x="2" y="4" width="22" height="5" rx="1.5" fill="#ffeaa7" stroke="#f1c40f" stroke-width="1"/>
            <polygon points="24,4 31,6.5 24,9" fill="#e67e22"/>
          </g>

          <!-- Live Telemetry Callouts & Pack Progress Stroke -->
          <text data-ref="fillText" x="12" y="30" fill="#7bed9f" font-size="10.5" font-weight="900" font-family="Rajdhani, sans-serif">MAG FILL: 0 / 30 RDS</text>
          <text data-ref="looseText" x="12" y="47" fill="#f1c40f" font-size="10" font-weight="900" font-family="Rajdhani, sans-serif">🎒 LOOSE POOL: 0 RDS</text>
          <text x="12" y="64" fill="#95a5a6" font-size="8.5" font-weight="800" font-family="Rajdhani, sans-serif">[LMB] FIRE NOW • [R] FAST SWAP</text>
          <line x1="12" y1="72" x2="184" y2="72" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round"/>
          <line data-ref="packStroke" x1="12" y1="72" x2="184" y2="72" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-dasharray="172" stroke-dashoffset="172"/>
        </svg>
      `;
      const stackGroups = [];
      for (let i = 0; i < 6; i++) {
        stackGroups.push(el.querySelector(`[data-stack="${i}"]`));
      }
      el._refs = {
        packedEl: el.querySelector('[data-ref="packed"]'),
        stackGroups,
        thumbGroup: el.querySelector('[data-ref="thumbGroup"]'),
        fillText: el.querySelector('[data-ref="fillText"]'),
        looseText: el.querySelector('[data-ref="looseText"]'),
        packStroke: el.querySelector('[data-ref="packStroke"]')
      };
    }
    return el._refs;
  },

  updateReloadAnimationHud(cur) {
    let el = this.el('reload-anim-hud');
    const isReloading = Boolean(
      cur &&
        !this.player.dead &&
        !this.player.downed &&
        !this.player.activeVehicle &&
        (this.player.reloading || this.player.slowReloading)
    );
    if (!isReloading) {
      if (el) this._setDisplay(el, 'none');
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'reload-anim-hud';
      el.style.cssText = `
        position: fixed; bottom: 196px; left: 50%; transform: translateX(-50%);
        width: 325px; background: rgba(10, 16, 24, 0.94);
        border: 1.5px solid rgba(241, 196, 15, 0.78); border-radius: 7px;
        padding: 8px 12px; z-index: 960; pointer-events: none;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.85);
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('reload-anim-hud', el);
    }
    this._setDisplay(el, 'block');

    if (this.player.reloading) {
      const refs = this._ensureReloadSvgStructure(el, 'mag_swap');
      const totalTime =
        (this.player.reloadTotalTime || cur.def.reloadTime) * (this.player.fastReload ? 0.62 : 1.0);
      const pct = Math.max(0, Math.min(1, 1 - this.player.reloadTimer / Math.max(0.2, totalTime)));
      const stage = pct < 0.36 ? 1 : pct < 0.74 ? 2 : 3;
      const s1 = stage === 1 ? pct / 0.36 : 1;
      const s2 = stage === 2 ? (pct - 0.36) / 0.38 : stage > 2 ? 1 : 0;
      const s3 = stage === 3 ? (pct - 0.74) / 0.26 : 0;

      const oldMagY = Math.round(28 + s1 * 32);
      const oldMagRot = Math.round(s1 * 16);
      const oldMagOp = stage === 1 ? (1 - s1 * 0.65).toFixed(2) : '0.15';
      const newMagY = stage === 1 ? 62 : Math.round(62 - s2 * 34);
      const boltX = stage === 3 ? Math.round(Math.sin(s3 * Math.PI) * 18) : 0;
      const chamberRoundX = stage === 3 ? Math.round((1 - s3) * 14) : 14;
      const stageTitle =
        stage === 1
          ? '1. UNLATCH & EJECT MAGAZINE'
          : stage === 2
          ? '2. INSERT FRESH MAG FROM RIG'
          : '3. RELEASE BOLT & CHAMBER ROUND';

      const borderCol = this.player.fastReload ? '#e67e22' : '#f1c40f';
      if (el._lastBorderCol !== borderCol) {
        el._lastBorderCol = borderCol;
        el.style.borderColor = borderCol;
      }
      const titleCol = this.player.fastReload ? '#ff9f43' : '#f1c40f';
      if (refs.titleEl && refs.titleEl._lastCol !== titleCol) {
        refs.titleEl._lastCol = titleCol;
        refs.titleEl.style.color = titleCol;
      }
      this._setText(
        refs.titleEl,
        this.player.fastReload ? '⚡ EMERGENCY DROP RELOAD' : '🔄 FAST MAG-SWAP RELOAD [R]'
      );
      this._setText(refs.pctEl, `${Math.round(pct * 100)}%`);
      this._setText(refs.stageText, stageTitle);

      const boltTr = `translate(${-boltX}, 0)`;
      if (refs.boltGroup._lastTr !== boltTr) {
        refs.boltGroup._lastTr = boltTr;
        refs.boltGroup.setAttribute('transform', boltTr);
      }
      const boltFill = stage === 3 ? '#2ecc71' : '#95a5a6';
      if (refs.boltRect._lastFill !== boltFill) {
        refs.boltRect._lastFill = boltFill;
        refs.boltRect.setAttribute('fill', boltFill);
      }
      this._setDisplay(refs.chamberGroup, stage >= 2 ? '' : 'none');
      if (stage >= 2) {
        const chTr = `translate(${-chamberRoundX}, 0)`;
        if (refs.chamberGroup._lastTr !== chTr) {
          refs.chamberGroup._lastTr = chTr;
          refs.chamberGroup.setAttribute('transform', chTr);
        }
      }
      const oldTr = `translate(88, ${oldMagY}) rotate(${oldMagRot})`;
      if (refs.oldMagGroup._lastTr !== oldTr) {
        refs.oldMagGroup._lastTr = oldTr;
        refs.oldMagGroup.setAttribute('transform', oldTr);
      }
      if (refs.oldMagGroup._lastOp !== oldMagOp) {
        refs.oldMagGroup._lastOp = oldMagOp;
        refs.oldMagGroup.setAttribute('opacity', oldMagOp);
      }
      const newTr = `translate(121, ${newMagY})`;
      if (refs.newMagGroup._lastTr !== newTr) {
        refs.newMagGroup._lastTr = newTr;
        refs.newMagGroup.setAttribute('transform', newTr);
      }
      const dashOff = String(Math.round(260 * (1 - pct)));
      if (refs.progStroke._lastOff !== dashOff) {
        refs.progStroke._lastOff = dashOff;
        refs.progStroke.setAttribute('stroke-dashoffset', dashOff);
      }
    } else if (this.player.slowReloading) {
      const refs = this._ensureReloadSvgStructure(el, 'slow_pack');
      const bp = Math.max(0, Math.min(1, this.player.magPackProgress || 0));
      const pressY = Math.round(bp * 16);
      const bestRigMag = cur.mags && cur.mags.length > 0 ? cur.mags[0] : 0;
      const targetRounds = cur.clip < cur.def.clipSize ? cur.clip : bestRigMag;
      const targetMax = cur.def.clipSize || 30;
      const fillRatio = Math.max(0, Math.min(1, targetRounds / targetMax));
      const visibleStackCount = Math.max(1, Math.min(6, Math.ceil(fillRatio * 6)));
      const stackShift = Math.round(bp * 3);

      if (el._lastBorderCol !== '#2ecc71') {
        el._lastBorderCol = '#2ecc71';
        el.style.borderColor = '#2ecc71';
      }
      this._setText(refs.packedEl, `+${this.player.slowReloadRoundsPacked || 0} RDS PACKED`);
      this._setText(refs.fillText, `MAG FILL: ${targetRounds} / ${targetMax} RDS`);
      this._setText(refs.looseText, `🎒 LOOSE POOL: ${cur.looseAmmo || 0} RDS`);

      for (let i = 0; i < 6; i++) {
        const sg = refs.stackGroups[i];
        if (!sg) continue;
        if (i < visibleStackCount) {
          this._setDisplay(sg, '');
          const ry = 56 - i * 6 + stackShift;
          const sTr = `translate(202, ${ry})`;
          if (sg._lastTr !== sTr) {
            sg._lastTr = sTr;
            sg.setAttribute('transform', sTr);
          }
        } else {
          this._setDisplay(sg, 'none');
        }
      }

      const thumbTr = `translate(200, ${4 + pressY})`;
      if (refs.thumbGroup._lastTr !== thumbTr) {
        refs.thumbGroup._lastTr = thumbTr;
        refs.thumbGroup.setAttribute('transform', thumbTr);
      }
      const packOff = String(Math.round(172 * (1 - fillRatio)));
      if (refs.packStroke._lastOff !== packOff) {
        refs.packStroke._lastOff = packOff;
        refs.packStroke.setAttribute('stroke-dashoffset', packOff);
      }
    }
  },

  updateMagBars(cur) {
    if (!this.magBarsRowEl) return;
    if (!cur.mags || cur.def.clipSize <= 1) {
      if (this._lastMagSignature !== 'EMPTY') {
        this._lastMagSignature = 'EMPTY';
        this.magBarsRowEl.innerHTML = '';
      }
      return;
    }
    const looseCount = cur.looseAmmo || 0;
    const sig = `${cur.def.name}:${cur.clip}:${cur.reserve}:${looseCount}:${cur.mags.join(',')}`;
    if (sig === this._lastMagSignature) return;
    this._lastMagSignature = sig;
    // Render active clip + Chest Rig reserve magazines (including 0-round empty mags!) + Backpack Loose Bullets badge
    const allMags = [
      { count: cur.clip, active: true },
      ...cur.mags.map((m) => ({ count: m, active: false }))
    ];
    const magPillsHtml = allMags
      .map((m) => {
        const pct = Math.max(0, Math.min(100, Math.round((m.count / cur.def.clipSize) * 100)));
        const isEmpty = m.count <= 0;
        const fillCol = pct < 35 ? '#e74c3c' : m.active ? '#2ecc71' : '#f1c40f';
        const borderCol = m.active
          ? '#2ecc71'
          : isEmpty
          ? 'rgba(231, 76, 60, 0.75)'
          : 'rgba(255,255,255,0.28)';
        return `<div class="mag-pill" title="${m.active ? 'Active Mag' : 'Chest Rig Mag'}: ${m.count}/${cur.def.clipSize} Rds" style="border-color:${borderCol};${isEmpty ? 'border-style:dashed;' : ''}"><div class="mag-pill-fill" style="height:${pct}%;background:${fillCol}"></div></div>`;
      })
      .join('');

    const looseBadgeHtml = `
      <div onclick="window.game && window.game.ui && window.game.ui.toggleBackpackModal && window.game.ui.toggleBackpackModal()" style="margin-left:5px;padding:1px 5px;background:rgba(16,26,36,0.9);border:1px solid ${
        looseCount > 0 ? 'rgba(46,204,113,0.65)' : 'rgba(231,76,60,0.55)'
      };border-radius:3px;font-size:9.5px;font-weight:900;color:${
        looseCount > 0 ? '#7bed9f' : '#ff7675'
      };display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer;pointer-events:auto;" title="Click or press [I] to open Visualized 2D Backpack • Press [P] or Hold [R] for Tarkov Slow Reload">
        🎒 +${looseCount} LOOSE [P / I]
      </div>
    `;
    this.magBarsRowEl.innerHTML = magPillsHtml + looseBadgeHtml;
  },

  updateSquadRoster() {
    if (!this.squadListBodyEl) return;
    const playerSquadId = this.player.squad || 'ALPHA';
    const squadBots = this.botManager.bots.filter(
      (b) => b.team === this.player.team && b.squad === playerSquadId
    );
    const totalSqScore =
      (this.player.score || 0) + squadBots.reduce((acc, b) => acc + (b.score || 0), 0);
    if (this.squadHeaderTitleEl) {
      this.squadHeaderTitleEl.textContent = `★ ${playerSquadId} SQUAD • ${totalSqScore} PTS`;
    }
    const selfRankLabel =
      this.player.commandRank === 'COMMANDER'
        ? 'CMD'
        : this.player.commandRank === 'SQUAD_LEADER'
        ? 'SL'
        : 'MBR';
    const rows = [
      {
        name: `YOU (${selfRankLabel})`,
        role: this.player.role.toUpperCase().slice(0, 3),
        hp: Math.ceil(this.player.hp),
        downed: this.player.downed,
        dead: this.player.dead
      },
      ...squadBots.slice(0, 4).map((b) => ({
        name: `${b.isCommander ? '★' : b.isSquadLeader ? '▲' : ''}${b.name}`,
        role: b.isSquadLeader ? 'SL' : b.role.slice(0, 3),
        hp: Math.ceil(b.hp),
        downed: b.downed,
        dead: b.dead
      }))
    ];

    this.squadListBodyEl.innerHTML = rows
      .map((r) => {
        const isDown = r.dead || r.downed;
        const statusText = r.dead ? 'KIA' : r.downed ? 'BLEEDING' : `${r.hp} HP`;
        return `<div class="squad-member-row">
          <div><span class="sq-role">[${r.role}]</span> <span class="sq-name">${r.name}</span></div>
          <span class="sq-status ${isDown ? 'down' : 'ok'}">${statusText}</span>
        </div>`;
      })
      .join('');
  }
};

export default HudRenderer;
