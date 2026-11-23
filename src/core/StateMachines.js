import { events } from '../events.js?v=116';

const EMPTY_PAYLOAD = Object.freeze({});
const NO_RESTORE_LOCK_PAYLOAD = Object.freeze({ restorePointerLock: false });

/**
 * Pre-computes `_allowedSet` per state once at module initialization so creating
 * hundreds of bot/vehicle FSM instances shares immutable transition Sets with zero allocations.
 */
function compileStateGraph(states) {
  if (!states || states._compiled) return states;
  for (const stateKey of Object.keys(states)) {
    const def = states[stateKey];
    if (def && !def._allowedSet && (def.on || def.transitions)) {
      const set = new Set();
      if (Array.isArray(def.transitions)) {
        for (let i = 0; i < def.transitions.length; i++) {
          set.add(def.transitions[i]);
        }
      }
      if (def.on) {
        const vals = Object.values(def.on);
        for (let i = 0; i < vals.length; i++) {
          set.add(vals[i]);
        }
      }
      Object.defineProperty(def, '_allowedSet', { value: set, enumerable: false });
    }
  }
  Object.defineProperty(states, '_compiled', { value: true, enumerable: false });
  return states;
}

/**
 * Lightweight, zero-allocation-friendly Finite State Machine (FSM) designed to elevate:
 * - UX (User Experience): Prevents impossible/glitched overlapping states (e.g. firing while closing a modal,
 *   crouched + prone simultaneously, downed enemies awarding score or capturing flags, stuck reloads).
 * - DX (Developer Experience): Declarative state definitions, valid transition tables, `onEnter`/`onExit`
 *   guards, and automatic event bus notifications (`fsm:transition`).
 * - AX (Agent Experience): Full runtime introspection via `window.game.stateMachines`, `getSnapshot()`,
 *   transition history ring-buffers, and `validateAllInvariants()`.
 */
export class FiniteStateMachine {
  constructor(config) {
    this.id = config.id || 'anonymous-fsm';
    this.initial = config.initial;
    this.state = config.initial;
    this.previousState = null;
    this.states = config.states || {};
    this.context = config.context || null;
    this.emitEvents = config.emitEvents !== false;
    this.maxHistory = config.maxHistory ?? 24;
    this.history = [];
    this.rejectedCount = 0;
    this.lastRejectedTransition = null;
    this.rejectedHistory = [];
    this.lastTransitionAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.transitionCount = 0;

    if (!this.states._compiled) {
      compileStateGraph(this.states);
    }
  }

  _recordRejection(fromState, attemptedState, reason, payload = EMPTY_PAYLOAD) {
    this.rejectedCount++;
    const entry = {
      from: fromState,
      attempted: attemptedState,
      reason,
      event: payload.event || null,
      at: Math.round(typeof performance !== 'undefined' ? performance.now() : 0)
    };
    this.lastRejectedTransition = entry;
    if (this.maxHistory > 0) {
      this.rejectedHistory.push(entry);
      if (this.rejectedHistory.length > this.maxHistory) {
        this.rejectedHistory.shift();
      }
    }
  }

  /**
   * Returns true if the machine is currently in `stateName` (or any of an array of state names).
   */
  is(stateName) {
    if (Array.isArray(stateName)) {
      for (let i = 0; i < stateName.length; i++) {
        if (stateName[i] === this.state) return true;
      }
      return false;
    }
    return this.state === stateName;
  }

  /**
   * Returns true if transitioning from `this.state` to `nextState` is allowed by the transition graph.
   */
  can(nextState) {
    if (nextState === this.state) return true;
    const currentDef = this.states[this.state];
    if (!currentDef) return false;
    if (currentDef._allowedSet) {
      return currentDef._allowedSet.has(nextState) || currentDef._allowedSet.has('*');
    }
    if (!currentDef.on && !currentDef.transitions) return Boolean(this.states[nextState]);
    const allowed = [
      ...(Array.isArray(currentDef.transitions) ? currentDef.transitions : []),
      ...Object.values(currentDef.on || {})
    ];
    return allowed.includes(nextState) || allowed.includes('*');
  }

  /**
   * Transitions to `nextState` if valid (or if `force === true`), executing `onExit` and `onEnter` hooks
   * to enforce state invariants.
   */
  transition(nextState, payload = EMPTY_PAYLOAD, force = false) {
    if (!this.states[nextState]) {
      this._recordRejection(this.state, nextState, 'UNKNOWN_STATE', payload);
      return false;
    }
    if (nextState === this.state && !payload.reenter) {
      return true;
    }
    if (!force && !this.can(nextState)) {
      this._recordRejection(this.state, nextState, 'INVALID_TRANSITION', payload);
      return false;
    }

    const fromState = this.state;
    const prevDef = this.states[fromState];
    const nextDef = this.states[nextState];

    if (prevDef && typeof prevDef.onExit === 'function') {
      prevDef.onExit(this.context, nextState, payload);
    }

    this.previousState = fromState;
    this.state = nextState;
    this.transitionCount++;
    this.lastTransitionAt = typeof performance !== 'undefined' ? performance.now() : 0;

    if (this.maxHistory > 0) {
      this.history.push({
        from: fromState,
        to: nextState,
        reason: payload.reason || null,
        at: Math.round(this.lastTransitionAt)
      });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    if (nextDef && typeof nextDef.onEnter === 'function') {
      nextDef.onEnter(this.context, fromState, payload);
    }

    if (this.emitEvents) {
      events.emit('fsm:transition', {
        machineId: this.id,
        from: fromState,
        to: nextState,
        payload
      });
    }

    return true;
  }

  /**
   * Sends a named event (e.g. `'DEPLOY'`, `'DOWNED'`, `'OPEN_GUNSMITH'`) mapped in `states[state].on`.
   */
  send(eventName, payload = {}) {
    const currentDef = this.states[this.state];
    const target = currentDef && currentDef.on ? currentDef.on[eventName] : null;
    if (!target) {
      this._recordRejection(this.state, eventName, 'UNHANDLED_EVENT', { ...payload, event: eventName });
      return false;
    }
    return this.transition(target, { ...payload, event: eventName });
  }

  getSnapshot() {
    return {
      id: this.id,
      state: this.state,
      previousState: this.previousState,
      transitionCount: this.transitionCount,
      rejectedCount: this.rejectedCount,
      lastRejectedTransition: this.lastRejectedTransition,
      lastTransitionAt: Math.round(this.lastTransitionAt),
      recentHistory: this.history.slice(-6)
    };
  }

  toJSON() {
    return this.getSnapshot();
  }
}

// ============================================================================
// 1. MATCH & SCREEN LIFECYCLE STATE MACHINE (`MatchFSM`)
// ============================================================================
export const MATCH_STATES = {
  DEPLOY_LOBBY: 'DEPLOY_LOBBY',
  ACTIVE_COMBAT: 'ACTIVE_COMBAT',
  ROUND_VICTORY: 'ROUND_VICTORY'
};

const MATCH_GRAPH = compileStateGraph({
  [MATCH_STATES.DEPLOY_LOBBY]: {
    transitions: [MATCH_STATES.ACTIVE_COMBAT, MATCH_STATES.ROUND_VICTORY],
    onEnter(g) {
      if (g) g.matchEnded = false;
    }
  },
  [MATCH_STATES.ACTIVE_COMBAT]: {
    transitions: [MATCH_STATES.DEPLOY_LOBBY, MATCH_STATES.ROUND_VICTORY],
    onEnter(g) {
      if (g) g.matchEnded = false;
    }
  },
  [MATCH_STATES.ROUND_VICTORY]: {
    transitions: [MATCH_STATES.DEPLOY_LOBBY],
    onEnter(g) {
      if (g) g.matchEnded = true;
    }
  }
});

export function createMatchFSM(game) {
  return new FiniteStateMachine({
    id: 'match',
    context: game,
    initial: MATCH_STATES.DEPLOY_LOBBY,
    states: MATCH_GRAPH
  });
}

// ============================================================================
// 2. UI OVERLAY & INPUT FOCUS STATE MACHINE (`UIModalFSM`)
//    Prevents overlapping modals, lost mouse focus, and accidental firing!
// ============================================================================
export const UI_MODAL_STATES = {
  DEPLOY_SCREEN: 'DEPLOY_SCREEN',
  HUD_LOCKED: 'HUD_LOCKED',
  COMMO_ROSE: 'COMMO_ROSE',
  MODAL_GUNSMITH_LOOT: 'MODAL_GUNSMITH_LOOT',
  MODAL_COMMAND_MAP: 'MODAL_COMMAND_MAP',
  MODAL_MULTIPLAYER: 'MODAL_MULTIPLAYER',
  MODAL_SETTINGS: 'MODAL_SETTINGS',
  VICTORY_SCREEN: 'VICTORY_SCREEN'
};

const POPOUT_MODAL_DOM_IDS = {
  [UI_MODAL_STATES.MODAL_GUNSMITH_LOOT]: 'gunsmith-modal',
  [UI_MODAL_STATES.MODAL_COMMAND_MAP]: 'command-modal',
  [UI_MODAL_STATES.MODAL_MULTIPLAYER]: 'multiplayer-modal',
  [UI_MODAL_STATES.MODAL_SETTINGS]: 'settings-modal'
};

const UI_MODAL_GRAPH = compileStateGraph({
  [UI_MODAL_STATES.DEPLOY_SCREEN]: {
    transitions: ['*'],
    onEnter(u) {
      if (u?.player) {
        u.player.isFiring = false;
        u.player.isAds = false;
      }
    }
  },
  [UI_MODAL_STATES.HUD_LOCKED]: {
    transitions: ['*'],
    onEnter(u, fromState, payload) {
      if (u?.player) {
        u.player.isFiring = false;
        // Suppress accidental left-click weapon discharge for 180ms when closing any modal
        if (fromState && fromState !== UI_MODAL_STATES.HUD_LOCKED && fromState !== UI_MODAL_STATES.COMMO_ROSE) {
          u.player._suppressFireUntil =
            (typeof performance !== 'undefined' ? performance.now() : 0) + 180;
        }
        if (payload.restorePointerLock !== false && !u.player.dead && typeof document !== 'undefined') {
          try {
            if (typeof window !== 'undefined') window.focus();
            if (document.pointerLockElement !== document.body) {
              const p = document.body.requestPointerLock();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } catch (_) {}
        }
      }
    }
  },
  [UI_MODAL_STATES.COMMO_ROSE]: {
    transitions: ['*']
  },
  [UI_MODAL_STATES.MODAL_GUNSMITH_LOOT]: {
    transitions: ['*'],
    onEnter(u) {
      hideOtherPopoutModals(UI_MODAL_STATES.MODAL_GUNSMITH_LOOT);
      disarmPlayerCombatOnModalOpen(u);
    }
  },
  [UI_MODAL_STATES.MODAL_COMMAND_MAP]: {
    transitions: ['*'],
    onEnter(u) {
      hideOtherPopoutModals(UI_MODAL_STATES.MODAL_COMMAND_MAP);
      disarmPlayerCombatOnModalOpen(u);
    }
  },
  [UI_MODAL_STATES.MODAL_MULTIPLAYER]: {
    transitions: ['*'],
    onEnter(u) {
      hideOtherPopoutModals(UI_MODAL_STATES.MODAL_MULTIPLAYER);
      disarmPlayerCombatOnModalOpen(u);
    }
  },
  [UI_MODAL_STATES.MODAL_SETTINGS]: {
    transitions: ['*'],
    onEnter(u) {
      hideOtherPopoutModals(UI_MODAL_STATES.MODAL_SETTINGS);
      disarmPlayerCombatOnModalOpen(u);
    }
  },
  [UI_MODAL_STATES.VICTORY_SCREEN]: {
    transitions: ['*'],
    onEnter(u) {
      hideOtherPopoutModals(null);
      disarmPlayerCombatOnModalOpen(u);
    }
  }
});

export function createUIModalFSM(ui) {
  return new FiniteStateMachine({
    id: 'uiModal',
    context: ui,
    initial: UI_MODAL_STATES.DEPLOY_SCREEN,
    states: UI_MODAL_GRAPH
  });
}

function hideOtherPopoutModals(keepState) {
  if (typeof document === 'undefined') return;
  for (const [st, domId] of Object.entries(POPOUT_MODAL_DOM_IDS)) {
    if (st === keepState) continue;
    const el = document.getElementById(domId);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
    }
  }
}

function disarmPlayerCombatOnModalOpen(ui) {
  if (ui?.player) {
    ui.player.isFiring = false;
    ui.player.isAds = false;
  }
  if (typeof document !== 'undefined' && document.pointerLockElement === document.body) {
    try {
      document.exitPointerLock();
    } catch (_) {}
  }
}

// ============================================================================
// 3. PLAYER VITALITY & LIFE-CYCLE STATE MACHINE (`PlayerVitalityFSM`)
// ============================================================================
/**
 * Explicit State Machine for Player Vitality & Life-Cycle (Rank #4).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> UNDEPLOYED
 *   UNDEPLOYED --> ALIVE : DEPLOY_INFANTRY
 *   UNDEPLOYED --> IN_VEHICLE : DEPLOY_VEHICLE
 *   ALIVE --> IN_VEHICLE : ENTER_VEHICLE
 *   ALIVE --> DOWNED_BLEEDING_OUT : FATAL_WOUND_DOWNED
 *   ALIVE --> DEAD_AWAITING_RESPAWN : INSTANT_DEATH
 *   ALIVE --> UNDEPLOYED : RETURN_DEPLOY_LOBBY
 *   IN_VEHICLE --> ALIVE : EXIT_VEHICLE
 *   IN_VEHICLE --> DOWNED_BLEEDING_OUT : VEHICLE_BAILOUT_DOWNED
 *   IN_VEHICLE --> DEAD_AWAITING_RESPAWN : VEHICLE_CRASH_DEATH
 *   IN_VEHICLE --> UNDEPLOYED : RETURN_DEPLOY_LOBBY
 *   DOWNED_BLEEDING_OUT --> ALIVE : MEDIC_REVIVED
 *   DOWNED_BLEEDING_OUT --> DEAD_AWAITING_RESPAWN : BLEED_OUT_OR_GIVE_UP
 *   DOWNED_BLEEDING_OUT --> UNDEPLOYED : RETURN_DEPLOY_LOBBY
 *   DEAD_AWAITING_RESPAWN --> UNDEPLOYED : OPEN_DEPLOY_SCREEN
 *   DEAD_AWAITING_RESPAWN --> ALIVE : DEPLOY_INFANTRY
 * ```
 */
export const PLAYER_VITALITY_STATES = {
  UNDEPLOYED: 'UNDEPLOYED',
  ALIVE: 'ALIVE',
  IN_VEHICLE: 'IN_VEHICLE',
  DOWNED_BLEEDING_OUT: 'DOWNED_BLEEDING_OUT',
  DEAD_AWAITING_RESPAWN: 'DEAD_AWAITING_RESPAWN'
};

const PLAYER_VITALITY_GRAPH = compileStateGraph({
  [PLAYER_VITALITY_STATES.UNDEPLOYED]: {
    transitions: [PLAYER_VITALITY_STATES.ALIVE, PLAYER_VITALITY_STATES.IN_VEHICLE]
  },
  [PLAYER_VITALITY_STATES.ALIVE]: {
    transitions: [
      PLAYER_VITALITY_STATES.IN_VEHICLE,
      PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT,
      PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN,
      PLAYER_VITALITY_STATES.UNDEPLOYED
    ],
    onEnter(p) {
      if (!p) return;
      p.dead = false;
      p.downed = false;
    }
  },
  [PLAYER_VITALITY_STATES.IN_VEHICLE]: {
    transitions: [
      PLAYER_VITALITY_STATES.ALIVE,
      PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT,
      PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN,
      PLAYER_VITALITY_STATES.UNDEPLOYED
    ],
    onEnter(p) {
      if (!p) return;
      p.dead = false;
      p.downed = false;
      p.crouching = false;
      p.prone = false;
      p.reloading = false;
      p.slowReloading = false;
      p.draggedBot = null;
      p.isDraggingAlly = false;
    }
  },
  [PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT]: {
    // Cannot transition from DOWNED_BLEEDING_OUT directly into IN_VEHICLE!
    transitions: [
      PLAYER_VITALITY_STATES.ALIVE,
      PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN,
      PLAYER_VITALITY_STATES.UNDEPLOYED
    ],
    onEnter(p) {
      if (!p) return;
      p.dead = false;
      p.downed = true;
      p.isFiring = false;
      p.isAds = false;
      p.reloading = false;
      p.fastReload = false;
      p.slowReloading = false;
      p.magPackProgress = 0;
      p.bandageProgress = 0;
      p.reviveProgress = 0;
      p.draggedBot = null;
      p.isDraggingAlly = false;
    }
  },
  [PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN]: {
    // Cannot transition from DEAD_AWAITING_RESPAWN directly into IN_VEHICLE or DOWNED_BLEEDING_OUT!
    transitions: [PLAYER_VITALITY_STATES.UNDEPLOYED, PLAYER_VITALITY_STATES.ALIVE],
    onEnter(p) {
      if (!p) return;
      p.dead = true;
      p.downed = false;
      p.isFiring = false;
      p.isAds = false;
      p.reloading = false;
      p.slowReloading = false;
      p.draggedBot = null;
      p.isDraggingAlly = false;
    }
  }
});

export function createPlayerVitalityFSM(player) {
  return new FiniteStateMachine({
    id: 'playerVitality',
    context: player,
    initial: PLAYER_VITALITY_STATES.UNDEPLOYED,
    states: PLAYER_VITALITY_GRAPH
  });
}

// ============================================================================
// 4. PLAYER STANCE & LOCOMOTION STATE MACHINE (`PlayerStanceFSM`)
// ============================================================================
export const PLAYER_STANCE_STATES = {
  STANDING: 'STANDING',
  CROUCHING: 'CROUCHING',
  PRONE: 'PRONE',
  SPRINTING: 'SPRINTING',
  AIRBORNE: 'AIRBORNE',
  DRAGGING_ALLY: 'DRAGGING_ALLY',
  VEHICLE_SEATED: 'VEHICLE_SEATED',
  INCAPACITATED: 'INCAPACITATED'
};

const ACTIVE_INFANTRY_STANCES = [
  PLAYER_STANCE_STATES.STANDING,
  PLAYER_STANCE_STATES.CROUCHING,
  PLAYER_STANCE_STATES.PRONE,
  PLAYER_STANCE_STATES.SPRINTING,
  PLAYER_STANCE_STATES.AIRBORNE,
  PLAYER_STANCE_STATES.DRAGGING_ALLY,
  PLAYER_STANCE_STATES.VEHICLE_SEATED,
  PLAYER_STANCE_STATES.INCAPACITATED
];

const PLAYER_STANCE_GRAPH = compileStateGraph({
  [PLAYER_STANCE_STATES.STANDING]: {
    transitions: ACTIVE_INFANTRY_STANCES,
    onEnter(p) {
      if (!p) return;
      p.crouching = false;
      p.prone = false;
    }
  },
  [PLAYER_STANCE_STATES.CROUCHING]: {
    transitions: ACTIVE_INFANTRY_STANCES,
    onEnter(p) {
      if (!p) return;
      p.crouching = true;
      p.prone = false;
    }
  },
  [PLAYER_STANCE_STATES.PRONE]: {
    transitions: ACTIVE_INFANTRY_STANCES,
    onEnter(p) {
      if (!p) return;
      p.prone = true;
      p.crouching = false;
    }
  },
  [PLAYER_STANCE_STATES.SPRINTING]: {
    transitions: ACTIVE_INFANTRY_STANCES,
    onEnter(p) {
      if (!p) return;
      p.crouching = false;
      p.prone = false;
    }
  },
  [PLAYER_STANCE_STATES.AIRBORNE]: { transitions: ACTIVE_INFANTRY_STANCES },
  [PLAYER_STANCE_STATES.DRAGGING_ALLY]: { transitions: ACTIVE_INFANTRY_STANCES },
  [PLAYER_STANCE_STATES.VEHICLE_SEATED]: {
    // Seated vehicle crew can only exit to STANDING / AIRBORNE (eject) or become INCAPACITATED
    transitions: [
      PLAYER_STANCE_STATES.STANDING,
      PLAYER_STANCE_STATES.AIRBORNE,
      PLAYER_STANCE_STATES.INCAPACITATED
    ],
    onEnter(p) {
      if (!p) return;
      p.crouching = false;
      p.prone = false;
    }
  },
  [PLAYER_STANCE_STATES.INCAPACITATED]: {
    // Incapacitated players cannot jump straight to SPRINTING, DRAGGING_ALLY, or VEHICLE_SEATED
    transitions: [
      PLAYER_STANCE_STATES.STANDING,
      PLAYER_STANCE_STATES.CROUCHING,
      PLAYER_STANCE_STATES.PRONE,
      PLAYER_STANCE_STATES.AIRBORNE
    ]
  }
});

export function createPlayerStanceFSM(player) {
  return new FiniteStateMachine({
    id: 'playerStance',
    context: player,
    initial: PLAYER_STANCE_STATES.STANDING,
    emitEvents: false, // High-frequency locomotion transitions don't spam global bus
    states: PLAYER_STANCE_GRAPH
  });
}

// ============================================================================
// 5. PLAYER WEAPON & ACTION STATE MACHINE (`PlayerWeaponFSM`)
// ============================================================================
export const PLAYER_WEAPON_STATES = {
  READY: 'READY',
  FIRING: 'FIRING',
  TACTICAL_RELOAD: 'TACTICAL_RELOAD',
  SPEED_RELOAD: 'SPEED_RELOAD',
  SLOW_MAG_PACK: 'SLOW_MAG_PACK',
  BANDAGING_SELF: 'BANDAGING_SELF',
  REVIVING_ALLY: 'REVIVING_ALLY',
  LOOTING_HOLD: 'LOOTING_HOLD',
  DISABLED: 'DISABLED'
};

const ACTIVE_WEAPON_STATES = [
  PLAYER_WEAPON_STATES.READY,
  PLAYER_WEAPON_STATES.FIRING,
  PLAYER_WEAPON_STATES.TACTICAL_RELOAD,
  PLAYER_WEAPON_STATES.SPEED_RELOAD,
  PLAYER_WEAPON_STATES.SLOW_MAG_PACK,
  PLAYER_WEAPON_STATES.BANDAGING_SELF,
  PLAYER_WEAPON_STATES.REVIVING_ALLY,
  PLAYER_WEAPON_STATES.LOOTING_HOLD,
  PLAYER_WEAPON_STATES.DISABLED
];

const PLAYER_WEAPON_GRAPH = compileStateGraph({
  [PLAYER_WEAPON_STATES.READY]: { transitions: ACTIVE_WEAPON_STATES },
  [PLAYER_WEAPON_STATES.FIRING]: {
    transitions: [
      PLAYER_WEAPON_STATES.READY,
      PLAYER_WEAPON_STATES.TACTICAL_RELOAD,
      PLAYER_WEAPON_STATES.SPEED_RELOAD,
      PLAYER_WEAPON_STATES.BANDAGING_SELF,
      PLAYER_WEAPON_STATES.REVIVING_ALLY,
      PLAYER_WEAPON_STATES.DISABLED
    ],
    onEnter(p) {
      if (p) {
        p.reloading = false;
        p.fastReload = false;
        p.slowReloading = false;
        p.magPackProgress = 0;
      }
    }
  },
  [PLAYER_WEAPON_STATES.TACTICAL_RELOAD]: {
    // Cannot jump from TACTICAL_RELOAD directly into SLOW_MAG_PACK
    transitions: [
      PLAYER_WEAPON_STATES.READY,
      PLAYER_WEAPON_STATES.SPEED_RELOAD,
      PLAYER_WEAPON_STATES.BANDAGING_SELF,
      PLAYER_WEAPON_STATES.REVIVING_ALLY,
      PLAYER_WEAPON_STATES.DISABLED
    ],
    onEnter(p) {
      if (p) {
        p.slowReloading = false;
        p.magPackProgress = 0;
      }
    }
  },
  [PLAYER_WEAPON_STATES.SPEED_RELOAD]: {
    transitions: [
      PLAYER_WEAPON_STATES.READY,
      PLAYER_WEAPON_STATES.BANDAGING_SELF,
      PLAYER_WEAPON_STATES.REVIVING_ALLY,
      PLAYER_WEAPON_STATES.DISABLED
    ],
    onEnter(p) {
      if (p) {
        p.slowReloading = false;
        p.magPackProgress = 0;
      }
    }
  },
  [PLAYER_WEAPON_STATES.SLOW_MAG_PACK]: {
    transitions: [
      PLAYER_WEAPON_STATES.READY,
      PLAYER_WEAPON_STATES.FIRING,
      PLAYER_WEAPON_STATES.TACTICAL_RELOAD,
      PLAYER_WEAPON_STATES.SPEED_RELOAD,
      PLAYER_WEAPON_STATES.BANDAGING_SELF,
      PLAYER_WEAPON_STATES.REVIVING_ALLY,
      PLAYER_WEAPON_STATES.DISABLED
    ],
    onEnter(p) {
      if (p) {
        p.reloading = false;
        p.fastReload = false;
      }
    }
  },
  [PLAYER_WEAPON_STATES.BANDAGING_SELF]: {
    transitions: [
      PLAYER_WEAPON_STATES.READY,
      PLAYER_WEAPON_STATES.REVIVING_ALLY,
      PLAYER_WEAPON_STATES.DISABLED
    ]
  },
  [PLAYER_WEAPON_STATES.REVIVING_ALLY]: {
    transitions: [PLAYER_WEAPON_STATES.READY, PLAYER_WEAPON_STATES.DISABLED]
  },
  [PLAYER_WEAPON_STATES.LOOTING_HOLD]: {
    transitions: [PLAYER_WEAPON_STATES.READY, PLAYER_WEAPON_STATES.DISABLED]
  },
  [PLAYER_WEAPON_STATES.DISABLED]: {
    // Incapacitated/Dead weapon state can ONLY return to READY upon revival or respawn!
    transitions: [PLAYER_WEAPON_STATES.READY],
    onEnter(p) {
      if (!p) return;
      p.isFiring = false;
      p.reloading = false;
      p.fastReload = false;
      p.slowReloading = false;
      p.magPackProgress = 0;
    }
  }
});

export function createPlayerWeaponFSM(player) {
  return new FiniteStateMachine({
    id: 'playerWeapon',
    context: player,
    initial: PLAYER_WEAPON_STATES.READY,
    emitEvents: false,
    states: PLAYER_WEAPON_GRAPH
  });
}

// ============================================================================
// 6. TACTICAL INTERACTION [F] CONTEXT STATE MACHINE (`PlayerInteractFSM`)
//    Governs Tap [F] (<0.30s Auto-Loot) vs. Hold [F] (>=0.30s Side-by-Side Manual Loot / Revive)
// ============================================================================
export const PLAYER_INTERACT_STATES = {
  IDLE: 'IDLE',
  HOLDING_REVIVE: 'HOLDING_REVIVE',
  HOLDING_ENEMY_LOOT: 'HOLDING_ENEMY_LOOT',
  MANUAL_LOOT_MODAL_OPEN: 'MANUAL_LOOT_MODAL_OPEN'
};

const PLAYER_INTERACT_GRAPH = compileStateGraph({
  [PLAYER_INTERACT_STATES.IDLE]: {
    transitions: [
      PLAYER_INTERACT_STATES.HOLDING_REVIVE,
      PLAYER_INTERACT_STATES.HOLDING_ENEMY_LOOT,
      PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN
    ]
  },
  [PLAYER_INTERACT_STATES.HOLDING_REVIVE]: {
    // Cannot transition directly from HOLDING_REVIVE into MANUAL_LOOT_MODAL_OPEN!
    transitions: [PLAYER_INTERACT_STATES.IDLE]
  },
  [PLAYER_INTERACT_STATES.HOLDING_ENEMY_LOOT]: {
    transitions: [
      PLAYER_INTERACT_STATES.IDLE,
      PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN
    ]
  },
  [PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN]: {
    transitions: [PLAYER_INTERACT_STATES.IDLE]
  }
});

export function createPlayerInteractFSM(player) {
  return new FiniteStateMachine({
    id: 'playerInteract',
    context: player,
    initial: PLAYER_INTERACT_STATES.IDLE,
    states: PLAYER_INTERACT_GRAPH
  });
}

// ============================================================================
// 7. NPC BOT VITALITY, DOCTRINE & MEDIC RESCUE STATE SYNCHRONIZER
// ============================================================================
export const BOT_VITALITY_STATES = {
  ALIVE_ACTIVE: 'ALIVE_ACTIVE',
  IN_VEHICLE: 'IN_VEHICLE',
  DOWNED_INCAPACITATED: 'DOWNED_INCAPACITATED',
  POST_REVIVE_GETTING_UP: 'POST_REVIVE_GETTING_UP',
  POST_REVIVE_EQUIPPING: 'POST_REVIVE_EQUIPPING',
  DEAD_RESPAWNING: 'DEAD_RESPAWNING'
};

export const BOT_DOCTRINE_STATES = {
  GARRISON_DEFENSE: 'GARRISON_DEFENSE',
  ORDER_OBJECTIVE: 'ORDER_OBJECTIVE',
  ORDER_FOLLOW: 'ORDER_FOLLOW',
  ORDER_HOLD: 'ORDER_HOLD',
  AUTONOMOUS_ASSAULT: 'AUTONOMOUS_ASSAULT'
};

export const MEDIC_RESCUE_STATES = {
  IDLE: 'IDLE',
  ASSESS_THREAT: 'ASSESS_THREAT',
  APPROACH: 'APPROACH',
  DRAG: 'DRAG',
  REVIVE: 'REVIVE'
};

export const MEDIC_RESCUE_EVENTS = {
  CLAIM_CASUALTY: 'CLAIM_CASUALTY',
  SECTOR_CLEAR_APPROACH: 'SECTOR_CLEAR_APPROACH',
  AMBUSH_REASSESS: 'AMBUSH_REASSESS',
  REACHED_CASUALTY_DRAG: 'REACHED_CASUALTY_DRAG',
  REACHED_COVER_REVIVE: 'REACHED_COVER_REVIVE',
  COMPLETE_REVIVE: 'COMPLETE_REVIVE',
  ABORT_RESCUE: 'ABORT_RESCUE'
};

/**
 * Explicit State Machine for NPC Tactical Medic Rescue & Casualty Pointer Symmetry (Rank #6).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> IDLE
 *   IDLE --> ASSESS_THREAT : CLAIM_CASUALTY
 *   ASSESS_THREAT --> APPROACH : SECTOR_CLEAR_APPROACH
 *   ASSESS_THREAT --> IDLE : ABORT_RESCUE
 *   APPROACH --> ASSESS_THREAT : AMBUSH_REASSESS
 *   APPROACH --> DRAG : REACHED_CASUALTY_DRAG
 *   APPROACH --> IDLE : ABORT_RESCUE
 *   DRAG --> REVIVE : REACHED_COVER_REVIVE
 *   DRAG --> IDLE : ABORT_RESCUE
 *   REVIVE --> IDLE : COMPLETE_REVIVE / ABORT_RESCUE
 * ```
 */
const MEDIC_RESCUE_GRAPH = compileStateGraph({
  [MEDIC_RESCUE_STATES.IDLE]: {
    on: {
      [MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY]: MEDIC_RESCUE_STATES.ASSESS_THREAT
    },
    onEnter(b) {
      if (!b) return;
      if (b.rescueTarget && b.rescueTarget !== 'PLAYER' && b.rescueTarget.rescuer === b) {
        b.rescueTarget.rescuer = null;
      }
      b.rescueTarget = null;
      b.rescueState = null;
      b.medicRescueState = MEDIC_RESCUE_STATES.IDLE;
      b.assessThreatEnemy = null;
    }
  },
  [MEDIC_RESCUE_STATES.ASSESS_THREAT]: {
    on: {
      [MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH]: MEDIC_RESCUE_STATES.APPROACH,
      [MEDIC_RESCUE_EVENTS.ABORT_RESCUE]: MEDIC_RESCUE_STATES.IDLE
    },
    onEnter(b, fromState, payload) {
      if (!b) return;
      const target = payload?.target ?? b.rescueTarget;
      if (target && target !== 'PLAYER') {
        if (target.rescuer && target.rescuer !== b) {
          const prev = target.rescuer;
          if (prev.medicRescueFSM) {
            if (prev.medicRescueFSM.state !== MEDIC_RESCUE_STATES.IDLE) {
              prev.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.ABORT_RESCUE);
            }
          } else {
            prev.rescueTarget = null;
            prev.rescueState = null;
          }
        }
        target.rescuer = b;
      }
      if (target) b.rescueTarget = target;
      b.rescueState = MEDIC_RESCUE_STATES.ASSESS_THREAT;
      b.medicRescueState = MEDIC_RESCUE_STATES.ASSESS_THREAT;
    }
  },
  [MEDIC_RESCUE_STATES.APPROACH]: {
    on: {
      [MEDIC_RESCUE_EVENTS.AMBUSH_REASSESS]: MEDIC_RESCUE_STATES.ASSESS_THREAT,
      [MEDIC_RESCUE_EVENTS.REACHED_CASUALTY_DRAG]: MEDIC_RESCUE_STATES.DRAG,
      [MEDIC_RESCUE_EVENTS.ABORT_RESCUE]: MEDIC_RESCUE_STATES.IDLE
    },
    onEnter(b) {
      if (!b) return;
      b.rescueState = MEDIC_RESCUE_STATES.APPROACH;
      b.medicRescueState = MEDIC_RESCUE_STATES.APPROACH;
    }
  },
  [MEDIC_RESCUE_STATES.DRAG]: {
    on: {
      [MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE]: MEDIC_RESCUE_STATES.REVIVE,
      [MEDIC_RESCUE_EVENTS.ABORT_RESCUE]: MEDIC_RESCUE_STATES.IDLE
    },
    onEnter(b) {
      if (!b) return;
      b.rescueState = MEDIC_RESCUE_STATES.DRAG;
      b.medicRescueState = MEDIC_RESCUE_STATES.DRAG;
    }
  },
  [MEDIC_RESCUE_STATES.REVIVE]: {
    on: {
      [MEDIC_RESCUE_EVENTS.COMPLETE_REVIVE]: MEDIC_RESCUE_STATES.IDLE,
      [MEDIC_RESCUE_EVENTS.ABORT_RESCUE]: MEDIC_RESCUE_STATES.IDLE
    },
    onEnter(b) {
      if (!b) return;
      b.rescueState = MEDIC_RESCUE_STATES.REVIVE;
      b.medicRescueState = MEDIC_RESCUE_STATES.REVIVE;
    }
  }
});

export function createMedicRescueFSM(bot) {
  const fsm = new FiniteStateMachine({
    id: `medicRescue:${bot?.id || bot?.name || 'bot'}`,
    context: bot,
    initial: MEDIC_RESCUE_STATES.IDLE,
    emitEvents: false,
    states: MEDIC_RESCUE_GRAPH
  });
  if (bot) {
    bot.medicRescueFSM = fsm;
    bot.medicRescueState = fsm.state;
  }
  return fsm;
}

/**
 * Computes and enforces invariants on a Bot's Vitality, Tactical Doctrine, and Medic Rescue states.
 */
export function syncBotStateMachine(bot, allocateReturn = true) {
  if (!bot) return null;

  // Enforce strict mutual exclusion: a bot can never be both `dead` and `downed`
  if (bot.dead && bot.downed) {
    bot.downed = false;
  }

  let vitality = BOT_VITALITY_STATES.ALIVE_ACTIVE;
  if (bot.dead) {
    vitality = BOT_VITALITY_STATES.DEAD_RESPAWNING;
  } else if (bot.downed || (typeof bot.hp === 'number' && bot.hp <= 0)) {
    vitality = BOT_VITALITY_STATES.DOWNED_INCAPACITATED;
  } else if (bot.drivingVehicle) {
    vitality = BOT_VITALITY_STATES.IN_VEHICLE;
  } else if ((bot.postReviveTimer || 0) > 0) {
    vitality = BOT_VITALITY_STATES.POST_REVIVE_GETTING_UP;
  } else if ((bot.weaponReadyTimer || 0) > 0) {
    vitality = BOT_VITALITY_STATES.POST_REVIVE_EQUIPPING;
  }

  // Explicit eligibility flags derived from Vitality State:
  // Downed or dead bots NEVER award score/kills when shot and NEVER contribute to flag capture!
  bot.vitalityState = vitality;
  bot.canGiveDamageScore =
    vitality !== BOT_VITALITY_STATES.DEAD_RESPAWNING &&
    vitality !== BOT_VITALITY_STATES.DOWNED_INCAPACITATED;
  bot.canContributeToFlagCapture =
    vitality === BOT_VITALITY_STATES.ALIVE_ACTIVE ||
    vitality === BOT_VITALITY_STATES.IN_VEHICLE ||
    vitality === BOT_VITALITY_STATES.POST_REVIVE_EQUIPPING;

  let doctrine = BOT_DOCTRINE_STATES.AUTONOMOUS_ASSAULT;
  if (bot.isGarrisonDefender) {
    doctrine = BOT_DOCTRINE_STATES.GARRISON_DEFENSE;
  } else if ((bot.playerOrderTimer || 0) > 0 && bot.playerOrderMode === 'OBJECTIVE') {
    doctrine = BOT_DOCTRINE_STATES.ORDER_OBJECTIVE;
  } else if ((bot.playerOrderTimer || 0) > 0 && bot.playerOrderMode === 'FOLLOW') {
    doctrine = BOT_DOCTRINE_STATES.ORDER_FOLLOW;
  } else if ((bot.playerOrderTimer || 0) > 0 && bot.playerOrderMode === 'HOLD') {
    doctrine = BOT_DOCTRINE_STATES.ORDER_HOLD;
  }
  bot.doctrineState = doctrine;

  let rescue = MEDIC_RESCUE_STATES.IDLE;
  if (bot.medicRescueFSM || bot.role === 'MEDIC' || bot.rescueTarget || bot.rescueState) {
    if (!bot.medicRescueFSM) {
      createMedicRescueFSM(bot);
    }
    if (
      bot.dead ||
      bot.downed ||
      (bot.postReviveTimer || 0) > 0 ||
      !bot.rescueTarget ||
      !bot.rescueState
    ) {
      if (!bot.medicRescueFSM.is(MEDIC_RESCUE_STATES.IDLE)) {
        bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.ABORT_RESCUE);
      } else if (!bot.rescueTarget && bot.rescueState) {
        bot.rescueState = null;
      }
    }
    rescue = bot.medicRescueFSM.state;
  }
  bot.medicRescueState = rescue;

  if (!allocateReturn) return null;
  return { vitality, doctrine, rescue };
}

// ============================================================================
// 8. FORWARD BASE / OBJECTIVE CONTROL STATE MACHINE
// ============================================================================
export const FLAG_CONTROL_STATES = {
  NEUTRAL: 'NEUTRAL',
  US_CONTROLLED: 'US_CONTROLLED',
  US_CONTESTED: 'US_CONTESTED',
  US_GARRISONED_FORTIFIED: 'US_GARRISONED_FORTIFIED',
  RU_CONTROLLED: 'RU_CONTROLLED',
  RU_CONTESTED: 'RU_CONTESTED',
  RU_GARRISONED_FORTIFIED: 'RU_GARRISONED_FORTIFIED'
};

export function syncFlagStateMachine(flag) {
  if (!flag) return FLAG_CONTROL_STATES.NEUTRAL;
  let state = FLAG_CONTROL_STATES.NEUTRAL;
  if (flag.owner === 'US') {
    if (flag.contested) {
      state = FLAG_CONTROL_STATES.US_CONTESTED;
    } else if ((flag.defenseStage || 0) > 0 || (flag.garrisonSquad && flag.garrisonSquad.US)) {
      state = FLAG_CONTROL_STATES.US_GARRISONED_FORTIFIED;
    } else {
      state = FLAG_CONTROL_STATES.US_CONTROLLED;
    }
  } else if (flag.owner === 'RU') {
    if (flag.contested) {
      state = FLAG_CONTROL_STATES.RU_CONTESTED;
    } else if ((flag.defenseStage || 0) > 0 || (flag.garrisonSquad && flag.garrisonSquad.RU)) {
      state = FLAG_CONTROL_STATES.RU_GARRISONED_FORTIFIED;
    } else {
      state = FLAG_CONTROL_STATES.RU_CONTROLLED;
    }
  }
  flag.controlState = state;
  return state;
}

// ============================================================================
// 9. AIRCRAFT FLIGHT, AERODYNAMIC STALL & SHOT-DOWN MAYDAY LIFECYCLE (`AircraftFlightFSM`)
// ============================================================================
/**
 * Explicit State Machine for Fixed-Wing & Tilt-Rotor Aircraft Lifecycle (Rank #1).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> PARKED_RUNWAY
 *   PARKED_RUNWAY --> AI_SORTIE_PREFLIGHT : START_AI_PREFLIGHT
 *   PARKED_RUNWAY --> TAXI_TAKEOFF_ROLL : BOARD_RUNWAY
 *   PARKED_RUNWAY --> AIRBORNE_CRUISE : LIFTOFF / AI_LAUNCH_SORTIE
 *   PARKED_RUNWAY --> DESTROYED_RESPAWNING : DESTROY_GROUND
 *   AI_SORTIE_PREFLIGHT --> AIRBORNE_CRUISE : AI_LAUNCH_SORTIE
 *   AI_SORTIE_PREFLIGHT --> TAXI_TAKEOFF_ROLL : BOARD_RUNWAY
 *   AI_SORTIE_PREFLIGHT --> PARKED_RUNWAY : CANCEL_AI_SORTIE
 *   AI_SORTIE_PREFLIGHT --> DESTROYED_RESPAWNING : DESTROY_GROUND
 *   TAXI_TAKEOFF_ROLL --> AIRBORNE_CRUISE : LIFTOFF
 *   TAXI_TAKEOFF_ROLL --> PARKED_RUNWAY : PARK_STOP
 *   TAXI_TAKEOFF_ROLL --> SHOT_DOWN_MAYDAY_SPIRAL : SHOT_DOWN_AIRBORNE
 *   TAXI_TAKEOFF_ROLL --> DESTROYED_RESPAWNING : DESTROY_GROUND
 *   AIRBORNE_CRUISE --> AERODYNAMIC_STALL : ENTER_STALL
 *   AIRBORNE_CRUISE --> TAXI_TAKEOFF_ROLL : TOUCHDOWN
 *   AIRBORNE_CRUISE --> PARKED_RUNWAY : PARK_STOP
 *   AIRBORNE_CRUISE --> SHOT_DOWN_MAYDAY_SPIRAL : SHOT_DOWN_AIRBORNE
 *   AIRBORNE_CRUISE --> DESTROYED_RESPAWNING : DESTROY_GROUND
 *   AERODYNAMIC_STALL --> AIRBORNE_CRUISE : RECOVER_STALL
 *   AERODYNAMIC_STALL --> TAXI_TAKEOFF_ROLL : TOUCHDOWN
 *   AERODYNAMIC_STALL --> PARKED_RUNWAY : PARK_STOP
 *   AERODYNAMIC_STALL --> SHOT_DOWN_MAYDAY_SPIRAL : SHOT_DOWN_AIRBORNE
 *   AERODYNAMIC_STALL --> DESTROYED_RESPAWNING : DESTROY_GROUND
 *   SHOT_DOWN_MAYDAY_SPIRAL --> DESTROYED_RESPAWNING : CRASH_IMPACT
 *   DESTROYED_RESPAWNING --> PARKED_RUNWAY : RESPAWN_RUNWAY
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `isStalling && isShotDown` simultaneously (entering `SHOT_DOWN_MAYDAY_SPIRAL` zeroes `isStalling` & `stallSinkVel`).
 * - `aiPilotActive && isShotDown` simultaneously (entering `SHOT_DOWN_MAYDAY_SPIRAL` clears `aiPilotActive`).
 * - `dead && (isShotDown || isStalling || aiPilotActive)` simultaneously.
 */
export const AIRCRAFT_FLIGHT_STATES = {
  PARKED_RUNWAY: 'PARKED_RUNWAY',
  AI_SORTIE_PREFLIGHT: 'AI_SORTIE_PREFLIGHT',
  TAXI_TAKEOFF_ROLL: 'TAXI_TAKEOFF_ROLL',
  AIRBORNE_CRUISE: 'AIRBORNE_CRUISE',
  AERODYNAMIC_STALL: 'AERODYNAMIC_STALL',
  SHOT_DOWN_MAYDAY_SPIRAL: 'SHOT_DOWN_MAYDAY_SPIRAL',
  DESTROYED_RESPAWNING: 'DESTROYED_RESPAWNING'
};

export const AIRCRAFT_FLIGHT_EVENTS = {
  START_AI_PREFLIGHT: 'START_AI_PREFLIGHT',
  CANCEL_AI_SORTIE: 'CANCEL_AI_SORTIE',
  AI_LAUNCH_SORTIE: 'AI_LAUNCH_SORTIE',
  BOARD_RUNWAY: 'BOARD_RUNWAY',
  LIFTOFF: 'LIFTOFF',
  TOUCHDOWN: 'TOUCHDOWN',
  PARK_STOP: 'PARK_STOP',
  ENTER_STALL: 'ENTER_STALL',
  RECOVER_STALL: 'RECOVER_STALL',
  SHOT_DOWN_AIRBORNE: 'SHOT_DOWN_AIRBORNE',
  CRASH_IMPACT: 'CRASH_IMPACT',
  DESTROY_GROUND: 'DESTROY_GROUND',
  RESPAWN_RUNWAY: 'RESPAWN_RUNWAY'
};

const AIRCRAFT_FLIGHT_GRAPH = compileStateGraph({
  [AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.START_AI_PREFLIGHT]: AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT,
      [AIRCRAFT_FLIGHT_EVENTS.BOARD_RUNWAY]: AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL,
      [AIRCRAFT_FLIGHT_EVENTS.LIFTOFF]: AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE,
      [AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE]: AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE,
      [AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY;
      v.dead = false;
      v.isShotDown = false;
      v.isStalling = false;
      v.stallSinkVel = 0;
      v.aiPilotActive = false;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE]: AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE,
      [AIRCRAFT_FLIGHT_EVENTS.BOARD_RUNWAY]: AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL,
      [AIRCRAFT_FLIGHT_EVENTS.CANCEL_AI_SORTIE]: AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY,
      [AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT;
      v.dead = false;
      v.isShotDown = false;
      v.isStalling = false;
      v.stallSinkVel = 0;
      v.aiPilotActive = false;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.LIFTOFF]: AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE,
      [AIRCRAFT_FLIGHT_EVENTS.PARK_STOP]: AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY,
      [AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE]: AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL,
      [AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL;
      v.dead = false;
      v.isShotDown = false;
      v.isStalling = false;
      v.stallSinkVel = 0;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL]: AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL,
      [AIRCRAFT_FLIGHT_EVENTS.TOUCHDOWN]: AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL,
      [AIRCRAFT_FLIGHT_EVENTS.PARK_STOP]: AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY,
      [AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE]: AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL,
      [AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE;
      v.dead = false;
      v.isShotDown = false;
      v.isStalling = false;
      v.stallSinkVel = 0;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL]: AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE,
      [AIRCRAFT_FLIGHT_EVENTS.TOUCHDOWN]: AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL,
      [AIRCRAFT_FLIGHT_EVENTS.PARK_STOP]: AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY,
      [AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE]: AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL,
      [AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL;
      v.dead = false;
      v.isShotDown = false;
      v.isStalling = true;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.CRASH_IMPACT]: AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL;
      v.dead = false;
      v.isShotDown = true;
      v.isStalling = false;
      v.stallSinkVel = 0;
      v.aiPilotActive = false;
    }
  },
  [AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING]: {
    on: {
      [AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY]: AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY
    },
    onEnter(v) {
      if (!v) return;
      v.flightState = AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING;
      v.dead = true;
      v.isShotDown = false;
      v.isStalling = false;
      v.stallSinkVel = 0;
      v.aiPilotActive = false;
    }
  }
});

export function createAircraftFlightFSM(vehicle) {
  const initial = vehicle?.dead
    ? AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING
    : AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY;
  const fsm = new FiniteStateMachine({
    id: `aircraftFlight:${vehicle?.id || 'plane'}`,
    context: vehicle,
    initial,
    emitEvents: false,
    states: AIRCRAFT_FLIGHT_GRAPH
  });
  if (vehicle) {
    vehicle.flightFSM = fsm;
    vehicle.flightState = fsm.state;
  }
  return fsm;
}

/**
 * Ensures an aircraft has a `flightFSM` instance and synchronizes/enforces its invariants.
 */
export function syncAircraftFlightFSM(vehicle, opts = EMPTY_PAYLOAD) {
  if (!vehicle || !vehicle.isAircraft) return null;
  if (!vehicle.flightFSM) {
    createAircraftFlightFSM(vehicle);
  }
  const fsm = vehicle.flightFSM;
  const st = fsm.state;
  const onRunway = Boolean(opts.onRunway);

  if (vehicle.dead) {
    if (st !== AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING) {
      if (st === AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.CRASH_IMPACT);
      } else {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND);
      }
    }
  } else if (vehicle.isShotDown) {
    if (st !== AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL) {
      if (
        st === AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY ||
        st === AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT
      ) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF);
      } else if (st === AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF);
      }
      if (fsm.state !== AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE);
      }
    }
    // Enforce mutual exclusion: shot-down aircraft cannot be stalling or AI-piloted
    vehicle.isStalling = false;
    vehicle.stallSinkVel = 0;
    vehicle.aiPilotActive = false;
  } else if (vehicle.isStalling) {
    if (st === AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL);
    }
  } else if (vehicle.aiPilotActive) {
    if (
      st === AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY ||
      st === AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT
    ) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE);
    } else if (st === AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF);
    } else if (st === AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL);
    } else if (st === AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE);
    }
  } else if (vehicle.driver) {
    if (onRunway) {
      if (
        st === AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY ||
        st === AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT
      ) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.BOARD_RUNWAY);
      } else if (
        st === AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE ||
        st === AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL
      ) {
        fsm.send(AIRCRAFT_FLIGHT_EVENTS.TOUCHDOWN);
      }
    } else if (
      st === AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY ||
      st === AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT ||
      st === AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL
    ) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF);
    } else if (st === AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL) {
      fsm.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL);
    }
  } else if (st === AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING) {
    fsm.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
  }

  vehicle.flightState = fsm.state;
  return fsm.state;
}

// ============================================================================
// 10. PLAYER PARACHUTE, CUT-CANOPY FREEFALL & RESERVE DEPLOYMENT LIFECYCLE (`PlayerParachuteFSM`)
// ============================================================================
/**
 * Explicit State Machine for Player Parachute, Cut-Canopy Freefall & Reserve Chute Deployment (Rank #2).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> GROUNDED
 *   GROUNDED --> STANDARD_AIRBORNE : JUMP_OR_FALL
 *   GROUNDED --> PARACHUTE_GLIDING : EJECT_DEPLOY
 *   STANDARD_AIRBORNE --> GROUNDED : LAND_GROUND / BOARD_VEHICLE / RESET_DEPLOY
 *   STANDARD_AIRBORNE --> PARACHUTE_GLIDING : EJECT_DEPLOY
 *   STANDARD_AIRBORNE --> RESERVE_CHUTE_GLIDING : PULL_RESERVE
 *   PARACHUTE_GLIDING --> CUT_CANOPY_FREEFALL : CUT_CANOPY
 *   PARACHUTE_GLIDING --> GROUNDED : LAND_GROUND / BOARD_VEHICLE / RESET_DEPLOY
 *   CUT_CANOPY_FREEFALL --> RESERVE_CHUTE_GLIDING : PULL_RESERVE
 *   CUT_CANOPY_FREEFALL --> GROUNDED : LAND_GROUND / BOARD_VEHICLE / RESET_DEPLOY
 *   RESERVE_CHUTE_GLIDING --> CUT_CANOPY_FREEFALL : CUT_CANOPY
 *   RESERVE_CHUTE_GLIDING --> GROUNDED : LAND_GROUND / BOARD_VEHICLE / RESET_DEPLOY
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `parachuting === true && parachuteCut === true` simultaneously.
 * - `parachuting === true && (isGrounded === true || activeVehicle !== null)` (ghost 3D canopy above tank/bike or grounded soldier).
 * - `parachuteCut === true` persisting across landing, vehicle entry, or redeploy (`deploy()`).
 */
export const PLAYER_PARACHUTE_STATES = {
  GROUNDED: 'GROUNDED',
  STANDARD_AIRBORNE: 'STANDARD_AIRBORNE',
  PARACHUTE_GLIDING: 'PARACHUTE_GLIDING',
  CUT_CANOPY_FREEFALL: 'CUT_CANOPY_FREEFALL',
  RESERVE_CHUTE_GLIDING: 'RESERVE_CHUTE_GLIDING'
};

export const PLAYER_PARACHUTE_EVENTS = {
  JUMP_OR_FALL: 'JUMP_OR_FALL',
  EJECT_DEPLOY: 'EJECT_DEPLOY',
  CUT_CANOPY: 'CUT_CANOPY',
  PULL_RESERVE: 'PULL_RESERVE',
  LAND_GROUND: 'LAND_GROUND',
  BOARD_VEHICLE: 'BOARD_VEHICLE',
  RESET_DEPLOY: 'RESET_DEPLOY'
};

const PLAYER_PARACHUTE_GRAPH = compileStateGraph({
  [PLAYER_PARACHUTE_STATES.GROUNDED]: {
    on: {
      [PLAYER_PARACHUTE_EVENTS.JUMP_OR_FALL]: PLAYER_PARACHUTE_STATES.STANDARD_AIRBORNE,
      [PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY]: PLAYER_PARACHUTE_STATES.PARACHUTE_GLIDING
    },
    onEnter(p) {
      if (!p) return;
      p.parachuteState = PLAYER_PARACHUTE_STATES.GROUNDED;
      p.parachuting = false;
      p.parachuteCut = false;
      if (p.parachuteMesh) p.parachuteMesh.visible = false;
    }
  },
  [PLAYER_PARACHUTE_STATES.STANDARD_AIRBORNE]: {
    on: {
      [PLAYER_PARACHUTE_EVENTS.LAND_GROUND]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.BOARD_VEHICLE]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY]: PLAYER_PARACHUTE_STATES.PARACHUTE_GLIDING,
      [PLAYER_PARACHUTE_EVENTS.PULL_RESERVE]: PLAYER_PARACHUTE_STATES.RESERVE_CHUTE_GLIDING
    },
    onEnter(p) {
      if (!p) return;
      p.parachuteState = PLAYER_PARACHUTE_STATES.STANDARD_AIRBORNE;
      p.parachuting = false;
      p.parachuteCut = false;
      if (p.parachuteMesh) p.parachuteMesh.visible = false;
    }
  },
  [PLAYER_PARACHUTE_STATES.PARACHUTE_GLIDING]: {
    on: {
      [PLAYER_PARACHUTE_EVENTS.CUT_CANOPY]: PLAYER_PARACHUTE_STATES.CUT_CANOPY_FREEFALL,
      [PLAYER_PARACHUTE_EVENTS.LAND_GROUND]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.BOARD_VEHICLE]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY]: PLAYER_PARACHUTE_STATES.GROUNDED
    },
    onEnter(p) {
      if (!p) return;
      p.parachuteState = PLAYER_PARACHUTE_STATES.PARACHUTE_GLIDING;
      p.parachuting = true;
      p.parachuteCut = false;
      p.isGrounded = false;
      p.onGround = false;
      if (p.parachuteMesh) p.parachuteMesh.visible = true;
    }
  },
  [PLAYER_PARACHUTE_STATES.CUT_CANOPY_FREEFALL]: {
    on: {
      [PLAYER_PARACHUTE_EVENTS.PULL_RESERVE]: PLAYER_PARACHUTE_STATES.RESERVE_CHUTE_GLIDING,
      [PLAYER_PARACHUTE_EVENTS.LAND_GROUND]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.BOARD_VEHICLE]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY]: PLAYER_PARACHUTE_STATES.GROUNDED
    },
    onEnter(p) {
      if (!p) return;
      p.parachuteState = PLAYER_PARACHUTE_STATES.CUT_CANOPY_FREEFALL;
      p.parachuting = false;
      p.parachuteCut = true;
      p.isGrounded = false;
      p.onGround = false;
      if (p.parachuteMesh) p.parachuteMesh.visible = false;
    }
  },
  [PLAYER_PARACHUTE_STATES.RESERVE_CHUTE_GLIDING]: {
    on: {
      [PLAYER_PARACHUTE_EVENTS.CUT_CANOPY]: PLAYER_PARACHUTE_STATES.CUT_CANOPY_FREEFALL,
      [PLAYER_PARACHUTE_EVENTS.LAND_GROUND]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.BOARD_VEHICLE]: PLAYER_PARACHUTE_STATES.GROUNDED,
      [PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY]: PLAYER_PARACHUTE_STATES.GROUNDED
    },
    onEnter(p) {
      if (!p) return;
      p.parachuteState = PLAYER_PARACHUTE_STATES.RESERVE_CHUTE_GLIDING;
      p.parachuting = true;
      p.parachuteCut = false;
      p.isGrounded = false;
      p.onGround = false;
      if (p.parachuteMesh) p.parachuteMesh.visible = true;
    }
  }
});

export function createPlayerParachuteFSM(player) {
  const fsm = new FiniteStateMachine({
    id: 'playerParachute',
    context: player,
    initial: PLAYER_PARACHUTE_STATES.GROUNDED,
    emitEvents: false,
    states: PLAYER_PARACHUTE_GRAPH
  });
  if (player) {
    player.parachuteFSM = fsm;
    player.parachuteState = fsm.state;
  }
  return fsm;
}

// ============================================================================
// 11. GROUND VEHICLE & MOTORCYCLE/E-MOTO/ATV OCCUPANCY & LIFECYCLE (`GroundVehicleFSM`)
// ============================================================================
/**
 * Explicit State Machine for Ground Vehicle & Motorcycle/E-Moto/ATV Occupancy, Gearbox & Lifecycle (Rank #3).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> PARKED_UNOCCUPIED
 *   [*] --> INITIAL_REINFORCEMENT_DELAY
 *   INITIAL_REINFORCEMENT_DELAY --> PARKED_UNOCCUPIED : SPAWN_READY
 *   PARKED_UNOCCUPIED --> PLAYER_DRIVEN_CRUISE : PLAYER_BOARD
 *   PARKED_UNOCCUPIED --> AI_CREWED_PATROL : NPC_BOARD
 *   PARKED_UNOCCUPIED --> DESTROYED_RESPAWN_COUNTDOWN : DESTROY
 *   AI_CREWED_PATROL --> PARKED_UNOCCUPIED : NPC_EXIT
 *   AI_CREWED_PATROL --> PLAYER_DRIVEN_CRUISE : PLAYER_COMMANDEER
 *   AI_CREWED_PATROL --> DESTROYED_RESPAWN_COUNTDOWN : DESTROY
 *   PLAYER_DRIVEN_CRUISE --> PLAYER_DRIVEN_WHEELIE_BOOST : ENTER_WHEELIE_BOOST
 *   PLAYER_DRIVEN_CRUISE --> PARKED_UNOCCUPIED : PLAYER_EXIT
 *   PLAYER_DRIVEN_CRUISE --> DESTROYED_RESPAWN_COUNTDOWN : DESTROY
 *   PLAYER_DRIVEN_WHEELIE_BOOST --> PLAYER_DRIVEN_CRUISE : EXIT_WHEELIE_BOOST
 *   PLAYER_DRIVEN_WHEELIE_BOOST --> PARKED_UNOCCUPIED : PLAYER_EXIT
 *   PLAYER_DRIVEN_WHEELIE_BOOST --> DESTROYED_RESPAWN_COUNTDOWN : DESTROY
 *   DESTROYED_RESPAWN_COUNTDOWN --> PARKED_UNOCCUPIED : RESPAWN_READY
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `v.driver !== null && v.npcDriver !== null` simultaneously (human & bot both steering).
 * - `riderGroup.visible === true` when `v.driver === null && v.npcDriver === null` (ghost 3D rider on unoccupied bike).
 * - `v.dead === true && (v.driver !== null || v.npcDriver !== null)`.
 */
export const GROUND_VEHICLE_STATES = {
  INITIAL_REINFORCEMENT_DELAY: 'INITIAL_REINFORCEMENT_DELAY',
  PARKED_UNOCCUPIED: 'PARKED_UNOCCUPIED',
  AI_CREWED_PATROL: 'AI_CREWED_PATROL',
  PLAYER_DRIVEN_CRUISE: 'PLAYER_DRIVEN_CRUISE',
  PLAYER_DRIVEN_WHEELIE_BOOST: 'PLAYER_DRIVEN_WHEELIE_BOOST',
  DESTROYED_RESPAWN_COUNTDOWN: 'DESTROYED_RESPAWN_COUNTDOWN'
};

export const GROUND_VEHICLE_EVENTS = {
  SPAWN_READY: 'SPAWN_READY',
  PLAYER_BOARD: 'PLAYER_BOARD',
  PLAYER_COMMANDEER: 'PLAYER_COMMANDEER',
  PLAYER_EXIT: 'PLAYER_EXIT',
  NPC_BOARD: 'NPC_BOARD',
  NPC_EXIT: 'NPC_EXIT',
  ENTER_WHEELIE_BOOST: 'ENTER_WHEELIE_BOOST',
  EXIT_WHEELIE_BOOST: 'EXIT_WHEELIE_BOOST',
  DESTROY: 'DESTROY',
  RESPAWN_READY: 'RESPAWN_READY'
};

const GROUND_VEHICLE_GRAPH = compileStateGraph({
  [GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY]: {
    on: {
      [GROUND_VEHICLE_EVENTS.SPAWN_READY]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED,
      [GROUND_VEHICLE_EVENTS.RESPAWN_READY]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY;
      v.dead = true;
      v.driver = null;
      v.npcDriver = null;
      if (v.mesh?.userData?.riderGroup) v.mesh.userData.riderGroup.visible = false;
    }
  },
  [GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED]: {
    on: {
      [GROUND_VEHICLE_EVENTS.PLAYER_BOARD]: GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE,
      [GROUND_VEHICLE_EVENTS.PLAYER_COMMANDEER]: GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE,
      [GROUND_VEHICLE_EVENTS.NPC_BOARD]: GROUND_VEHICLE_STATES.AI_CREWED_PATROL,
      [GROUND_VEHICLE_EVENTS.DESTROY]: GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED;
      v.dead = false;
      v.driver = null;
      v.npcDriver = null;
      v.wheeliePitch = 0;
      if (v.mesh?.userData?.riderGroup) v.mesh.userData.riderGroup.visible = false;
    }
  },
  [GROUND_VEHICLE_STATES.AI_CREWED_PATROL]: {
    on: {
      [GROUND_VEHICLE_EVENTS.NPC_EXIT]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED,
      [GROUND_VEHICLE_EVENTS.PLAYER_COMMANDEER]: GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE,
      [GROUND_VEHICLE_EVENTS.PLAYER_BOARD]: GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE,
      [GROUND_VEHICLE_EVENTS.DESTROY]: GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.AI_CREWED_PATROL;
      v.dead = false;
      v.driver = null;
      if (v.mesh?.userData?.riderGroup) {
        v.mesh.userData.riderGroup.visible = Boolean(v.npcDriver);
      }
    }
  },
  [GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE]: {
    on: {
      [GROUND_VEHICLE_EVENTS.ENTER_WHEELIE_BOOST]:
        GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST,
      [GROUND_VEHICLE_EVENTS.PLAYER_EXIT]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED,
      [GROUND_VEHICLE_EVENTS.DESTROY]: GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE;
      v.dead = false;
      if (v.npcDriver) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }
      if (v.mesh?.userData?.riderGroup) {
        v.mesh.userData.riderGroup.visible = Boolean(v.driver?.thirdPersonVehicle ?? true);
      }
    }
  },
  [GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST]: {
    on: {
      [GROUND_VEHICLE_EVENTS.EXIT_WHEELIE_BOOST]: GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE,
      [GROUND_VEHICLE_EVENTS.PLAYER_EXIT]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED,
      [GROUND_VEHICLE_EVENTS.DESTROY]: GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST;
      v.dead = false;
      if (v.npcDriver) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }
      if (v.mesh?.userData?.riderGroup) {
        v.mesh.userData.riderGroup.visible = Boolean(v.driver?.thirdPersonVehicle ?? true);
      }
    }
  },
  [GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN]: {
    on: {
      [GROUND_VEHICLE_EVENTS.RESPAWN_READY]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED,
      [GROUND_VEHICLE_EVENTS.SPAWN_READY]: GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED
    },
    onEnter(v) {
      if (!v) return;
      v.occupancyState = GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN;
      v.dead = true;
      v.driver = null;
      if (v.npcDriver) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }
      v.wheeliePitch = 0;
      if (v.mesh?.userData?.riderGroup) v.mesh.userData.riderGroup.visible = false;
    }
  }
});

export function createGroundVehicleFSM(vehicle) {
  const initial = vehicle?.dead
    ? vehicle.respawnTimer > 0 && !vehicle.replacementTicketPaid
      ? GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY
      : GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    : GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED;

  const fsm = new FiniteStateMachine({
    id: `groundVehicle:${vehicle?.id || 'veh'}`,
    context: vehicle,
    initial,
    emitEvents: false,
    states: GROUND_VEHICLE_GRAPH
  });

  if (vehicle) {
    vehicle.occupancyFSM = fsm;
    vehicle.occupancyState = fsm.state;
  }
  return fsm;
}

export function syncGroundVehicleFSM(vehicle, opts = EMPTY_PAYLOAD) {
  if (!vehicle || vehicle.isAircraft) return null;
  if (!vehicle.occupancyFSM) {
    createGroundVehicleFSM(vehicle);
  }
  const fsm = vehicle.occupancyFSM;
  const st = fsm.state;

  if (vehicle.dead) {
    if (
      st !== GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN &&
      st !== GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.DESTROY);
    }
    vehicle.driver = null;
    if (vehicle.npcDriver) {
      vehicle.npcDriver.drivingVehicle = null;
      vehicle.npcDriver = null;
    }
    if (vehicle.mesh?.userData?.riderGroup) {
      vehicle.mesh.userData.riderGroup.visible = false;
    }
  } else if (vehicle.driver) {
    if (vehicle.npcDriver) {
      vehicle.npcDriver.drivingVehicle = null;
      vehicle.npcDriver = null;
    }
    if (
      st === GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY ||
      st === GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
    }
    const curSt = fsm.state;
    if (curSt === GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED) {
      fsm.send(GROUND_VEHICLE_EVENTS.PLAYER_BOARD);
    } else if (curSt === GROUND_VEHICLE_STATES.AI_CREWED_PATROL) {
      fsm.send(GROUND_VEHICLE_EVENTS.PLAYER_COMMANDEER);
    }
    if (opts.wheelieBoost === true && fsm.state === GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE) {
      fsm.send(GROUND_VEHICLE_EVENTS.ENTER_WHEELIE_BOOST);
    } else if (
      opts.wheelieBoost === false &&
      fsm.state === GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.EXIT_WHEELIE_BOOST);
    }
    if (vehicle.mesh?.userData?.riderGroup) {
      vehicle.mesh.userData.riderGroup.visible = Boolean(vehicle.driver.thirdPersonVehicle);
    }
  } else if (vehicle.npcDriver) {
    if (
      st === GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY ||
      st === GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
    }
    if (fsm.state === GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED) {
      fsm.send(GROUND_VEHICLE_EVENTS.NPC_BOARD);
    }
    if (vehicle.mesh?.userData?.riderGroup) {
      vehicle.mesh.userData.riderGroup.visible = true;
    }
  } else {
    if (
      st === GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY ||
      st === GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
    } else if (
      st === GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE ||
      st === GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST
    ) {
      fsm.send(GROUND_VEHICLE_EVENTS.PLAYER_EXIT);
    } else if (st === GROUND_VEHICLE_STATES.AI_CREWED_PATROL) {
      fsm.send(GROUND_VEHICLE_EVENTS.NPC_EXIT);
    }
    if (vehicle.mesh?.userData?.riderGroup) {
      vehicle.mesh.userData.riderGroup.visible = false;
    }
  }

  vehicle.occupancyState = fsm.state;
  return fsm.state;
}

// ============================================================================
// 12. NETWORK TRANSPORT, ROOM SYNC & HTTP FALLBACK LIFECYCLE (`NetworkTransportFSM`)
// ============================================================================
/**
 * Explicit State Machine for Multiplayer WebSocket & HTTP Fallback Sync Lifecycle (Rank #5).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> OFFLINE_SINGLEPLAYER
 *   [*] --> MP_WS_CONNECTING
 *   OFFLINE_SINGLEPLAYER --> MP_WS_CONNECTING : ENABLE_MP
 *   OFFLINE_SINGLEPLAYER --> MP_WS_CONNECTED : ENABLE_MP_WS_READY
 *   OFFLINE_SINGLEPLAYER --> MP_HTTP_FALLBACK_IDLE : ENABLE_MP_HTTP_FALLBACK
 *   MP_WS_CONNECTING --> MP_WS_CONNECTED : WS_OPEN
 *   MP_WS_CONNECTING --> MP_HTTP_FALLBACK_IDLE : WS_CLOSE_OR_ERROR
 *   MP_WS_CONNECTING --> MP_HTTP_SYNC_IN_FLIGHT : HTTP_SYNC_START
 *   MP_WS_CONNECTING --> OFFLINE_SINGLEPLAYER : DISABLE_MP
 *   MP_WS_CONNECTED --> MP_HTTP_FALLBACK_IDLE : WS_CLOSE_OR_ERROR
 *   MP_WS_CONNECTED --> MP_HTTP_SYNC_IN_FLIGHT : HTTP_SYNC_START
 *   MP_WS_CONNECTED --> OFFLINE_SINGLEPLAYER : DISABLE_MP
 *   MP_HTTP_FALLBACK_IDLE --> MP_HTTP_SYNC_IN_FLIGHT : HTTP_SYNC_START
 *   MP_HTTP_FALLBACK_IDLE --> MP_WS_CONNECTED : WS_OPEN
 *   MP_HTTP_FALLBACK_IDLE --> OFFLINE_SINGLEPLAYER : DISABLE_MP
 *   MP_HTTP_SYNC_IN_FLIGHT --> MP_WS_CONNECTED : HTTP_SYNC_DONE_WS
 *   MP_HTTP_SYNC_IN_FLIGHT --> MP_HTTP_FALLBACK_IDLE : HTTP_SYNC_DONE_FALLBACK
 *   MP_HTTP_SYNC_IN_FLIGHT --> OFFLINE_SINGLEPLAYER : DISABLE_MP
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `gameMode === 'SINGLEPLAYER' && httpSyncInFlight === true` (and stale in-flight HTTP responses mutating state after mode/room switch).
 * - `wsConnected === true && (!ws || ws.readyState !== 1)`.
 */
export const NETWORK_TRANSPORT_STATES = {
  OFFLINE_SINGLEPLAYER: 'OFFLINE_SINGLEPLAYER',
  MP_WS_CONNECTING: 'MP_WS_CONNECTING',
  MP_WS_CONNECTED: 'MP_WS_CONNECTED',
  MP_HTTP_FALLBACK_IDLE: 'MP_HTTP_FALLBACK_IDLE',
  MP_HTTP_SYNC_IN_FLIGHT: 'MP_HTTP_SYNC_IN_FLIGHT'
};

export const NETWORK_TRANSPORT_EVENTS = {
  ENABLE_MP: 'ENABLE_MP',
  ENABLE_MP_WS_READY: 'ENABLE_MP_WS_READY',
  ENABLE_MP_HTTP_FALLBACK: 'ENABLE_MP_HTTP_FALLBACK',
  DISABLE_MP: 'DISABLE_MP',
  WS_OPEN: 'WS_OPEN',
  WS_CLOSE_OR_ERROR: 'WS_CLOSE_OR_ERROR',
  HTTP_SYNC_START: 'HTTP_SYNC_START',
  HTTP_SYNC_DONE_WS: 'HTTP_SYNC_DONE_WS',
  HTTP_SYNC_DONE_FALLBACK: 'HTTP_SYNC_DONE_FALLBACK'
};

const NETWORK_TRANSPORT_GRAPH = compileStateGraph({
  [NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER]: {
    on: {
      [NETWORK_TRANSPORT_EVENTS.ENABLE_MP]: NETWORK_TRANSPORT_STATES.MP_WS_CONNECTING,
      [NETWORK_TRANSPORT_EVENTS.ENABLE_MP_WS_READY]: NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED,
      [NETWORK_TRANSPORT_EVENTS.ENABLE_MP_HTTP_FALLBACK]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE
    },
    onEnter(n) {
      if (!n) return;
      n.transportState = NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER;
      n.gameMode = 'SINGLEPLAYER';
      n.httpSyncInFlight = false;
      n._syncEpoch = (n._syncEpoch || 0) + 1;
    }
  },
  [NETWORK_TRANSPORT_STATES.MP_WS_CONNECTING]: {
    on: {
      [NETWORK_TRANSPORT_EVENTS.WS_OPEN]: NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED,
      [NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE,
      [NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT,
      [NETWORK_TRANSPORT_EVENTS.DISABLE_MP]: NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER
    },
    onEnter(n) {
      if (!n) return;
      n.transportState = NETWORK_TRANSPORT_STATES.MP_WS_CONNECTING;
      n.gameMode = 'MULTIPLAYER';
      n.httpSyncInFlight = false;
    }
  },
  [NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED]: {
    on: {
      [NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE,
      [NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT,
      [NETWORK_TRANSPORT_EVENTS.DISABLE_MP]: NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER
    },
    onEnter(n) {
      if (!n) return;
      n.transportState = NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED;
      n.gameMode = 'MULTIPLAYER';
      n.wsConnected = true;
      n.httpSyncInFlight = false;
    }
  },
  [NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE]: {
    on: {
      [NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT,
      [NETWORK_TRANSPORT_EVENTS.WS_OPEN]: NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED,
      [NETWORK_TRANSPORT_EVENTS.DISABLE_MP]: NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER
    },
    onEnter(n) {
      if (!n) return;
      n.transportState = NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE;
      n.gameMode = 'MULTIPLAYER';
      n.wsConnected = false;
      n.httpSyncInFlight = false;
    }
  },
  [NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT]: {
    on: {
      [NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_WS]: NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED,
      [NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_FALLBACK]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE,
      [NETWORK_TRANSPORT_EVENTS.WS_OPEN]: NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT,
      [NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR]:
        NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT,
      [NETWORK_TRANSPORT_EVENTS.DISABLE_MP]: NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER
    },
    onEnter(n) {
      if (!n) return;
      n.transportState = NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT;
      n.gameMode = 'MULTIPLAYER';
      n.httpSyncInFlight = true;
    }
  }
});

export function createNetworkTransportFSM(net) {
  const initial =
    net?.gameMode === 'MULTIPLAYER'
      ? net?.wsConnected
        ? NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED
        : NETWORK_TRANSPORT_STATES.MP_WS_CONNECTING
      : NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER;

  const fsm = new FiniteStateMachine({
    id: 'networkTransport',
    context: net,
    initial,
    emitEvents: false,
    states: NETWORK_TRANSPORT_GRAPH
  });

  if (net) {
    net.transportFSM = fsm;
    net.transportState = fsm.state;
    net._syncEpoch = net._syncEpoch || 1;
  }
  return fsm;
}

// ============================================================================
// 13. COMMANDER STRATEGIC SUPPORT LIFECYCLE (`CommanderUavFSM` & `CommanderAirstrikeFSM`)
// ============================================================================
/**
 * Explicit State Machines for Commander MQ-9 UAV Recon & Airstrike Barrage (Rank #7).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> UAV_READY
 *   UAV_READY --> UAV_ACTIVE_ORBIT : CALL_UAV
 *   UAV_ACTIVE_ORBIT --> UAV_ACTIVE_ORBIT : CALL_UAV (Refresh)
 *   UAV_ACTIVE_ORBIT --> UAV_COOLDOWN : SCAN_EXPIRED
 *   UAV_COOLDOWN --> UAV_READY : COOLDOWN_DONE
 * ```
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> STRIKE_READY
 *   STRIKE_READY --> TARGET_DESIGNATED_WARNING : DESIGNATE_TARGET
 *   TARGET_DESIGNATED_WARNING --> BARRAGE_DROPPING : RELEASE_BARRAGE
 *   BARRAGE_DROPPING --> STRIKE_COOLDOWN : BARRAGE_COMPLETE
 *   STRIKE_COOLDOWN --> STRIKE_READY : COOLDOWN_DONE
 * ```
 */
export const COMMANDER_UAV_STATES = {
  UAV_READY: 'UAV_READY',
  UAV_ACTIVE_ORBIT: 'UAV_ACTIVE_ORBIT',
  UAV_COOLDOWN: 'UAV_COOLDOWN'
};

export const COMMANDER_UAV_EVENTS = {
  CALL_UAV: 'CALL_UAV',
  SCAN_EXPIRED: 'SCAN_EXPIRED',
  COOLDOWN_DONE: 'COOLDOWN_DONE',
  RESET: 'RESET'
};

function cleanupUavMeshes(p) {
  if (!p) return;
  if (p.uavDroneMesh) {
    p.scene?.remove?.(p.uavDroneMesh);
    p.uavDroneMesh = null;
  }
  if (p.uavSweepRingMesh) {
    p.scene?.remove?.(p.uavSweepRingMesh);
    p.uavSweepRingMesh = null;
  }
}

const COMMANDER_UAV_GRAPH = compileStateGraph({
  [COMMANDER_UAV_STATES.UAV_READY]: {
    on: {
      [COMMANDER_UAV_EVENTS.CALL_UAV]: COMMANDER_UAV_STATES.UAV_ACTIVE_ORBIT,
      [COMMANDER_UAV_EVENTS.RESET]: COMMANDER_UAV_STATES.UAV_READY
    },
    onEnter(p) {
      if (!p) return;
      p.uavState = COMMANDER_UAV_STATES.UAV_READY;
      p.uavActive = false;
      p.uavTimer = 0;
      cleanupUavMeshes(p);
    }
  },
  [COMMANDER_UAV_STATES.UAV_ACTIVE_ORBIT]: {
    on: {
      [COMMANDER_UAV_EVENTS.CALL_UAV]: COMMANDER_UAV_STATES.UAV_ACTIVE_ORBIT,
      [COMMANDER_UAV_EVENTS.SCAN_EXPIRED]: COMMANDER_UAV_STATES.UAV_COOLDOWN,
      [COMMANDER_UAV_EVENTS.RESET]: COMMANDER_UAV_STATES.UAV_READY
    },
    onEnter(p) {
      if (!p) return;
      p.uavState = COMMANDER_UAV_STATES.UAV_ACTIVE_ORBIT;
      p.uavActive = true;
    }
  },
  [COMMANDER_UAV_STATES.UAV_COOLDOWN]: {
    on: {
      [COMMANDER_UAV_EVENTS.COOLDOWN_DONE]: COMMANDER_UAV_STATES.UAV_READY,
      [COMMANDER_UAV_EVENTS.RESET]: COMMANDER_UAV_STATES.UAV_READY
    },
    onEnter(p) {
      if (!p) return;
      p.uavState = COMMANDER_UAV_STATES.UAV_COOLDOWN;
      p.uavActive = false;
      p.uavTimer = 0;
      cleanupUavMeshes(p);
    }
  }
});

export function createCommanderUavFSM(player) {
  const fsm = new FiniteStateMachine({
    id: 'commanderUav',
    context: player,
    initial: COMMANDER_UAV_STATES.UAV_READY,
    emitEvents: false,
    states: COMMANDER_UAV_GRAPH
  });
  if (player) {
    player.uavFSM = fsm;
    player.uavState = fsm.state;
  }
  return fsm;
}

export const COMMANDER_AIRSTRIKE_STATES = {
  STRIKE_READY: 'STRIKE_READY',
  TARGET_DESIGNATED_WARNING: 'TARGET_DESIGNATED_WARNING',
  BARRAGE_DROPPING: 'BARRAGE_DROPPING',
  STRIKE_COOLDOWN: 'STRIKE_COOLDOWN'
};

export const COMMANDER_AIRSTRIKE_EVENTS = {
  DESIGNATE_TARGET: 'DESIGNATE_TARGET',
  FORCE_REDESIGNATE: 'FORCE_REDESIGNATE',
  RELEASE_BARRAGE: 'RELEASE_BARRAGE',
  BARRAGE_COMPLETE: 'BARRAGE_COMPLETE',
  COOLDOWN_DONE: 'COOLDOWN_DONE',
  RESET: 'RESET'
};

function cleanupAirstrikeTargetMarkers(p) {
  if (!p || !p.airstrikeTarget) return;
  if (p.airstrikeTarget.markers) {
    p.scene?.remove?.(p.airstrikeTarget.markers);
  }
  p.airstrikeTarget = null;
}

const COMMANDER_AIRSTRIKE_GRAPH = compileStateGraph({
  [COMMANDER_AIRSTRIKE_STATES.STRIKE_READY]: {
    on: {
      [COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET]:
        COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING,
      [COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE]:
        COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING,
      [COMMANDER_AIRSTRIKE_EVENTS.RESET]: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.airstrikeState = COMMANDER_AIRSTRIKE_STATES.STRIKE_READY;
      cleanupAirstrikeTargetMarkers(p);
    }
  },
  [COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING]: {
    on: {
      [COMMANDER_AIRSTRIKE_EVENTS.RELEASE_BARRAGE]: COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING,
      [COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE]:
        COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING,
      [COMMANDER_AIRSTRIKE_EVENTS.RESET]: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.airstrikeState = COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING;
    }
  },
  [COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING]: {
    on: {
      [COMMANDER_AIRSTRIKE_EVENTS.BARRAGE_COMPLETE]: COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN,
      [COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE]:
        COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING,
      [COMMANDER_AIRSTRIKE_EVENTS.RESET]: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.airstrikeState = COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING;
      cleanupAirstrikeTargetMarkers(p);
    }
  },
  [COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN]: {
    on: {
      [COMMANDER_AIRSTRIKE_EVENTS.COOLDOWN_DONE]: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY,
      [COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE]:
        COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING,
      [COMMANDER_AIRSTRIKE_EVENTS.RESET]: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.airstrikeState = COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN;
      cleanupAirstrikeTargetMarkers(p);
    }
  }
});

export function createCommanderAirstrikeFSM(player) {
  const fsm = new FiniteStateMachine({
    id: 'commanderAirstrike',
    context: player,
    initial: COMMANDER_AIRSTRIKE_STATES.STRIKE_READY,
    emitEvents: false,
    states: COMMANDER_AIRSTRIKE_GRAPH
  });
  if (player) {
    player.airstrikeFSM = fsm;
    player.airstrikeState = fsm.state;
  }
  return fsm;
}

// ============================================================================
// 14. VEHICLE COUNTERMEASURE (`[X]`) & COAXIAL THERMAL OVERHEAT (`VehicleSubsystemsFSM`)
// ============================================================================
/**
 * Explicit State Machines for Vehicle Countermeasures (`[X]`) & Coaxial Weapon Thermal Lockout (Rank #8).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> CM_READY
 *   CM_READY --> CM_ACTIVE : ACTIVATE_CM
 *   CM_ACTIVE --> CM_RECHARGING : ACTIVE_EXPIRED
 *   CM_RECHARGING --> CM_READY : COOLDOWN_DONE
 * ```
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> THERMAL_NORMAL
 *   THERMAL_NORMAL --> THERMAL_OVERHEATED_LOCKOUT : OVERHEAT_MAX
 *   THERMAL_OVERHEATED_LOCKOUT --> THERMAL_NORMAL : COOLED_DOWN
 * ```
 */
export const VEHICLE_CM_STATES = {
  CM_READY: 'CM_READY',
  CM_ACTIVE: 'CM_ACTIVE',
  CM_RECHARGING: 'CM_RECHARGING'
};

export const VEHICLE_CM_EVENTS = {
  ACTIVATE_CM: 'ACTIVATE_CM',
  ACTIVE_EXPIRED: 'ACTIVE_EXPIRED',
  COOLDOWN_DONE: 'COOLDOWN_DONE',
  RESET: 'RESET'
};

export const VEHICLE_THERMAL_STATES = {
  THERMAL_NORMAL: 'THERMAL_NORMAL',
  THERMAL_OVERHEATED_LOCKOUT: 'THERMAL_OVERHEATED_LOCKOUT'
};

export const VEHICLE_THERMAL_EVENTS = {
  OVERHEAT_MAX: 'OVERHEAT_MAX',
  COOLED_DOWN: 'COOLED_DOWN',
  RESET: 'RESET'
};

const VEHICLE_CM_GRAPH = compileStateGraph({
  [VEHICLE_CM_STATES.CM_READY]: {
    on: {
      [VEHICLE_CM_EVENTS.ACTIVATE_CM]: VEHICLE_CM_STATES.CM_ACTIVE,
      [VEHICLE_CM_EVENTS.RESET]: VEHICLE_CM_STATES.CM_READY
    },
    onEnter(v) {
      if (!v) return;
      v.cmState = VEHICLE_CM_STATES.CM_READY;
      v.flareActiveTimer = 0;
      v.flareCooldown = 0;
    }
  },
  [VEHICLE_CM_STATES.CM_ACTIVE]: {
    on: {
      [VEHICLE_CM_EVENTS.ACTIVE_EXPIRED]: VEHICLE_CM_STATES.CM_RECHARGING,
      [VEHICLE_CM_EVENTS.COOLDOWN_DONE]: VEHICLE_CM_STATES.CM_READY,
      [VEHICLE_CM_EVENTS.RESET]: VEHICLE_CM_STATES.CM_READY
    },
    onEnter(v) {
      if (!v) return;
      v.cmState = VEHICLE_CM_STATES.CM_ACTIVE;
      if ((v.flareActiveTimer || 0) > 0 && (v.flareCooldown || 0) < v.flareActiveTimer) {
        v.flareCooldown = v.flareActiveTimer;
      }
    }
  },
  [VEHICLE_CM_STATES.CM_RECHARGING]: {
    on: {
      [VEHICLE_CM_EVENTS.COOLDOWN_DONE]: VEHICLE_CM_STATES.CM_READY,
      [VEHICLE_CM_EVENTS.RESET]: VEHICLE_CM_STATES.CM_READY
    },
    onEnter(v) {
      if (!v) return;
      v.cmState = VEHICLE_CM_STATES.CM_RECHARGING;
      v.flareActiveTimer = 0;
    }
  }
});

const VEHICLE_THERMAL_GRAPH = compileStateGraph({
  [VEHICLE_THERMAL_STATES.THERMAL_NORMAL]: {
    on: {
      [VEHICLE_THERMAL_EVENTS.OVERHEAT_MAX]: VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT,
      [VEHICLE_THERMAL_EVENTS.RESET]: VEHICLE_THERMAL_STATES.THERMAL_NORMAL
    },
    onEnter(v) {
      if (!v) return;
      v.thermalState = VEHICLE_THERMAL_STATES.THERMAL_NORMAL;
      v.coaxOverheated = false;
    }
  },
  [VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT]: {
    on: {
      [VEHICLE_THERMAL_EVENTS.COOLED_DOWN]: VEHICLE_THERMAL_STATES.THERMAL_NORMAL,
      [VEHICLE_THERMAL_EVENTS.RESET]: VEHICLE_THERMAL_STATES.THERMAL_NORMAL
    },
    onEnter(v) {
      if (!v) return;
      v.thermalState = VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT;
      v.coaxOverheated = true;
    }
  }
});

export function createVehicleSubsystemsFSM(vehicle) {
  const cmFsm = new FiniteStateMachine({
    id: `vehicleCM:${vehicle?.id || 'veh'}`,
    context: vehicle,
    initial: VEHICLE_CM_STATES.CM_READY,
    emitEvents: false,
    states: VEHICLE_CM_GRAPH
  });

  const thermalFsm = new FiniteStateMachine({
    id: `vehicleThermal:${vehicle?.id || 'veh'}`,
    context: vehicle,
    initial: VEHICLE_THERMAL_STATES.THERMAL_NORMAL,
    emitEvents: false,
    states: VEHICLE_THERMAL_GRAPH
  });

  if (vehicle) {
    vehicle.cmFSM = cmFsm;
    vehicle.cmState = cmFsm.state;
    vehicle.thermalFSM = thermalFsm;
    vehicle.thermalState = thermalFsm.state;
  }
  return { cmFSM: cmFsm, thermalFSM: thermalFsm };
}

export function syncVehicleSubsystemsFSM(vehicle) {
  if (!vehicle) return null;
  if (!vehicle.cmFSM || !vehicle.thermalFSM) {
    createVehicleSubsystemsFSM(vehicle);
  }
  const { cmFSM, thermalFSM } = vehicle;
  const cmSt = cmFSM.state;

  // Enforce countermeasure invariant: flareActiveTimer > 0 requires flareCooldown >= flareActiveTimer
  if ((vehicle.flareActiveTimer || 0) > 0) {
    if ((vehicle.flareCooldown || 0) < vehicle.flareActiveTimer) {
      vehicle.flareCooldown = vehicle.flareActiveTimer;
    }
    if (cmSt === VEHICLE_CM_STATES.CM_RECHARGING) {
      cmFSM.send(VEHICLE_CM_EVENTS.COOLDOWN_DONE);
      cmFSM.send(VEHICLE_CM_EVENTS.ACTIVATE_CM);
    } else if (cmSt === VEHICLE_CM_STATES.CM_READY) {
      cmFSM.send(VEHICLE_CM_EVENTS.ACTIVATE_CM);
    }
  } else if ((vehicle.flareCooldown || 0) > 0) {
    if (cmSt === VEHICLE_CM_STATES.CM_ACTIVE) {
      cmFSM.send(VEHICLE_CM_EVENTS.ACTIVE_EXPIRED);
    }
  } else if (cmSt !== VEHICLE_CM_STATES.CM_READY) {
    cmFSM.send(VEHICLE_CM_EVENTS.COOLDOWN_DONE);
  }

  // Enforce coaxial thermal invariant: coaxHeat <= 0.15 clears coaxOverheated; coaxHeat >= 1.0 trips lockout
  const thSt = thermalFSM.state;
  if ((vehicle.coaxHeat || 0) >= 1.0) {
    if (thSt === VEHICLE_THERMAL_STATES.THERMAL_NORMAL) {
      thermalFSM.send(VEHICLE_THERMAL_EVENTS.OVERHEAT_MAX);
    }
  } else if (
    (vehicle.coaxHeat || 0) <= 0.15 &&
    (vehicle.coaxOverheated || thSt === VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT)
  ) {
    if (thSt === VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT) {
      thermalFSM.send(VEHICLE_THERMAL_EVENTS.COOLED_DOWN);
    } else {
      vehicle.coaxOverheated = false;
    }
  }

  vehicle.cmState = cmFSM.state;
  vehicle.thermalState = thermalFSM.state;
  return { cmState: cmFSM.state, thermalState: thermalFSM.state };
}

// ============================================================================
// 15. RADAR / IR HOMING MISSILE TARGET LOCK-ON SCANNER (`TargetLockScannerFSM`)
// ============================================================================
/**
 * Explicit State Machine for Radar / IR Homing Missile Target Lock-On Scanner (Rank #9).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> IDLE_NO_LOCK
 *   IDLE_NO_LOCK --> LOCKING_ACQUIRING : ACQUIRE_TARGET
 *   LOCKING_ACQUIRING --> LOCKED_SOLID_TONE : LOCK_COMPLETE
 *   LOCKING_ACQUIRING --> LOCKING_ACQUIRING : SWITCH_TARGET
 *   LOCKING_ACQUIRING --> IDLE_NO_LOCK : LOST_TARGET
 *   LOCKED_SOLID_TONE --> LOCKING_ACQUIRING : SWITCH_TARGET
 *   LOCKED_SOLID_TONE --> IDLE_NO_LOCK : LOST_TARGET
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `aircraftLockTarget === null && aircraftLockProgress > 0`
 * - `aircraftLockTarget !== null && (aircraftLockTarget.dead || aircraftLockTarget.isShotDown || aircraftLockTarget.flareActiveTimer > 0)`
 */
export const TARGET_LOCK_STATES = {
  IDLE_NO_LOCK: 'IDLE_NO_LOCK',
  LOCKING_ACQUIRING: 'LOCKING_ACQUIRING',
  LOCKED_SOLID_TONE: 'LOCKED_SOLID_TONE'
};

export const TARGET_LOCK_EVENTS = {
  ACQUIRE_TARGET: 'ACQUIRE_TARGET',
  SWITCH_TARGET: 'SWITCH_TARGET',
  LOCK_COMPLETE: 'LOCK_COMPLETE',
  LOST_TARGET: 'LOST_TARGET'
};

const TARGET_LOCK_GRAPH = compileStateGraph({
  [TARGET_LOCK_STATES.IDLE_NO_LOCK]: {
    on: {
      [TARGET_LOCK_EVENTS.ACQUIRE_TARGET]: TARGET_LOCK_STATES.LOCKING_ACQUIRING
    },
    onEnter(p) {
      if (!p) return;
      p.targetLockState = TARGET_LOCK_STATES.IDLE_NO_LOCK;
      p.aircraftLockTarget = null;
      p.aircraftLockProgress = 0;
    }
  },
  [TARGET_LOCK_STATES.LOCKING_ACQUIRING]: {
    on: {
      [TARGET_LOCK_EVENTS.LOCK_COMPLETE]: TARGET_LOCK_STATES.LOCKED_SOLID_TONE,
      [TARGET_LOCK_EVENTS.SWITCH_TARGET]: TARGET_LOCK_STATES.LOCKING_ACQUIRING,
      [TARGET_LOCK_EVENTS.LOST_TARGET]: TARGET_LOCK_STATES.IDLE_NO_LOCK
    },
    onEnter(p, fromState, payload) {
      if (!p) return;
      p.targetLockState = TARGET_LOCK_STATES.LOCKING_ACQUIRING;
      if (payload?.target) {
        p.aircraftLockTarget = payload.target;
      }
      if (typeof payload?.initialProgress === 'number') {
        p.aircraftLockProgress = payload.initialProgress;
      }
    }
  },
  [TARGET_LOCK_STATES.LOCKED_SOLID_TONE]: {
    on: {
      [TARGET_LOCK_EVENTS.SWITCH_TARGET]: TARGET_LOCK_STATES.LOCKING_ACQUIRING,
      [TARGET_LOCK_EVENTS.LOST_TARGET]: TARGET_LOCK_STATES.IDLE_NO_LOCK
    },
    onEnter(p) {
      if (!p) return;
      p.targetLockState = TARGET_LOCK_STATES.LOCKED_SOLID_TONE;
      p.aircraftLockProgress = 1.0;
    }
  }
});

export function createTargetLockScannerFSM(player) {
  const fsm = new FiniteStateMachine({
    id: 'targetLockScanner',
    context: player,
    initial: TARGET_LOCK_STATES.IDLE_NO_LOCK,
    emitEvents: false,
    states: TARGET_LOCK_GRAPH
  });
  if (player) {
    player.targetLockFSM = fsm;
    player.targetLockState = fsm.state;
  }
  return fsm;
}

export function updateTargetLockScanner(player, candidateTarget, dt, lockRate = 1.45) {
  if (!player) return TARGET_LOCK_STATES.IDLE_NO_LOCK;
  if (!player.targetLockFSM) {
    createTargetLockScannerFSM(player);
  }
  const fsm = player.targetLockFSM;
  const st = fsm.state;

  const isValidTarget = Boolean(
    candidateTarget &&
      !candidateTarget.dead &&
      !candidateTarget.isShotDown &&
      (candidateTarget.flareActiveTimer || 0) <= 0
  );

  if (!isValidTarget) {
    if (st !== TARGET_LOCK_STATES.IDLE_NO_LOCK) {
      fsm.send(TARGET_LOCK_EVENTS.LOST_TARGET);
    } else {
      player.aircraftLockTarget = null;
      player.aircraftLockProgress = 0;
    }
    return fsm.state;
  }

  if (st === TARGET_LOCK_STATES.IDLE_NO_LOCK) {
    fsm.send(TARGET_LOCK_EVENTS.ACQUIRE_TARGET, {
      target: candidateTarget,
      initialProgress: 0.25
    });
  } else if (player.aircraftLockTarget !== candidateTarget) {
    fsm.send(TARGET_LOCK_EVENTS.SWITCH_TARGET, {
      target: candidateTarget,
      initialProgress: 0.25,
      reenter: true
    });
  } else {
    player.aircraftLockProgress = Math.min(1.0, (player.aircraftLockProgress || 0) + dt * lockRate);
    if (
      player.aircraftLockProgress >= 1.0 &&
      st === TARGET_LOCK_STATES.LOCKING_ACQUIRING
    ) {
      fsm.send(TARGET_LOCK_EVENTS.LOCK_COMPLETE);
    }
  }

  player.targetLockState = fsm.state;
  return fsm.state;
}

// ============================================================================
// 16. CS2 ARMORY CASE-OPENING ROULETTE & REWARD REVEAL (`ArmoryCaseRouletteFSM`)
// ============================================================================
/**
 * Explicit State Machine for CS2 Armory Case-Opening Roulette & Reward Reveal (Rank #10).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> CASE_IDLE
 *   CASE_IDLE --> CASE_ROLLING_SPIN : START_SPIN
 *   CASE_ROLLING_SPIN --> CASE_REWARD_REVEALED : COMPLETE_SPIN
 *   CASE_ROLLING_SPIN --> CASE_IDLE : ABORT_SPIN
 *   CASE_REWARD_REVEALED --> CASE_ROLLING_SPIN : START_SPIN
 *   CASE_REWARD_REVEALED --> CASE_IDLE : RESET_CASE
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `_isRouletteSpinning === false && _rouletteRafId !== null` (orphaned RAF loop after spin or modal close)
 * - `_isRouletteSpinning === true && !_rouletteSpinStart && !_playRouletteSpinNextRender` (stuck disabled button)
 * - Overlapping spin triggers while already in `CASE_ROLLING_SPIN`
 */
export const ARMORY_CASE_STATES = {
  CASE_IDLE: 'CASE_IDLE',
  CASE_ROLLING_SPIN: 'CASE_ROLLING_SPIN',
  CASE_REWARD_REVEALED: 'CASE_REWARD_REVEALED'
};

export const ARMORY_CASE_EVENTS = {
  START_SPIN: 'START_SPIN',
  COMPLETE_SPIN: 'COMPLETE_SPIN',
  ABORT_SPIN: 'ABORT_SPIN',
  RESET_CASE: 'RESET_CASE'
};

function cancelRouletteRaf(ui) {
  if (!ui) return;
  if (ui._rouletteRafId) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(ui._rouletteRafId);
    }
    ui._rouletteRafId = null;
  }
}

const ARMORY_CASE_GRAPH = compileStateGraph({
  [ARMORY_CASE_STATES.CASE_IDLE]: {
    on: {
      [ARMORY_CASE_EVENTS.START_SPIN]: ARMORY_CASE_STATES.CASE_ROLLING_SPIN
    },
    onEnter(u) {
      if (!u) return;
      cancelRouletteRaf(u);
      u.caseRouletteState = ARMORY_CASE_STATES.CASE_IDLE;
      u._isRouletteSpinning = false;
      u._playRouletteSpinNextRender = false;
      u._rouletteSpinStart = null;
    }
  },
  [ARMORY_CASE_STATES.CASE_ROLLING_SPIN]: {
    on: {
      [ARMORY_CASE_EVENTS.COMPLETE_SPIN]: ARMORY_CASE_STATES.CASE_REWARD_REVEALED,
      [ARMORY_CASE_EVENTS.ABORT_SPIN]: ARMORY_CASE_STATES.CASE_IDLE
    },
    onEnter(u, fromState, payload) {
      if (!u) return;
      cancelRouletteRaf(u);
      u.caseRouletteState = ARMORY_CASE_STATES.CASE_ROLLING_SPIN;
      u._isRouletteSpinning = true;
      u._playRouletteSpinNextRender = payload?.deferRender !== false;
      u._rouletteSpinStart =
        typeof payload?.spinStart === 'number'
          ? payload.spinStart
          : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
      u._lastCaseReward = null;
    }
  },
  [ARMORY_CASE_STATES.CASE_REWARD_REVEALED]: {
    on: {
      [ARMORY_CASE_EVENTS.START_SPIN]: ARMORY_CASE_STATES.CASE_ROLLING_SPIN,
      [ARMORY_CASE_EVENTS.RESET_CASE]: ARMORY_CASE_STATES.CASE_IDLE,
      [ARMORY_CASE_EVENTS.ABORT_SPIN]: ARMORY_CASE_STATES.CASE_IDLE
    },
    onEnter(u, fromState, payload) {
      if (!u) return;
      cancelRouletteRaf(u);
      u.caseRouletteState = ARMORY_CASE_STATES.CASE_REWARD_REVEALED;
      u._isRouletteSpinning = false;
      u._playRouletteSpinNextRender = false;
      u._rouletteSpinStart = null;
      if (payload?.reward !== undefined) {
        u._lastCaseReward = payload.reward;
      } else if (u.player?.lastCaseResult?.reward) {
        u._lastCaseReward = u.player.lastCaseResult.reward;
      }
    }
  }
});

export function createArmoryCaseRouletteFSM(ui) {
  const fsm = new FiniteStateMachine({
    id: 'armoryCaseRoulette',
    context: ui,
    initial: ARMORY_CASE_STATES.CASE_IDLE,
    emitEvents: false,
    states: ARMORY_CASE_GRAPH
  });
  if (ui) {
    ui.caseRouletteFSM = fsm;
    ui.caseRouletteState = fsm.state;
  }
  return fsm;
}

// ============================================================================
// 17. SQUAD DEPLOYABLES LIFECYCLE (`SquadDeployableFSM`: Rally Point & Insertion Beacon)
// ============================================================================
/**
 * Explicit State Machine for Squad Leader Rally Point & Recon Insertion Beacon (Rank #11).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> DEPLOYABLE_READY
 *   DEPLOYABLE_READY --> DEPLOYABLE_ACTIVE : PLACE
 *   DEPLOYABLE_ACTIVE --> DEPLOYABLE_ACTIVE : PLACE
 *   DEPLOYABLE_ACTIVE --> DEPLOYABLE_COOLDOWN : EXPIRE_OR_DESTROY
 *   DEPLOYABLE_ACTIVE --> DEPLOYABLE_COOLDOWN : DEPLETE_SPAWNS
 *   DEPLOYABLE_COOLDOWN --> DEPLOYABLE_READY : COOLDOWN_DONE
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `insertionBeacon !== null && (insertionBeacon.spawnsLeft <= 0 || insertionBeacon.timer <= 0)`
 * - `rallyPoint !== null && rallyPoint.timer <= 0`
 * - Orphaned 3D `rallyPoint.mesh` / `insertionBeacon.mesh` remaining in `scene` after replacement, expiry, or destruction
 */
export const DEPLOYABLE_STATES = {
  DEPLOYABLE_READY: 'DEPLOYABLE_READY',
  DEPLOYABLE_ACTIVE: 'DEPLOYABLE_ACTIVE',
  DEPLOYABLE_COOLDOWN: 'DEPLOYABLE_COOLDOWN'
};

export const DEPLOYABLE_EVENTS = {
  PLACE: 'PLACE',
  EXPIRE_OR_DESTROY: 'EXPIRE_OR_DESTROY',
  DEPLETE_SPAWNS: 'DEPLETE_SPAWNS',
  COOLDOWN_DONE: 'COOLDOWN_DONE',
  RESET: 'RESET'
};

function cleanupDeployableField(player, fieldName) {
  if (!player) return;
  const obj = player[fieldName];
  if (obj && obj.mesh) {
    player.scene?.remove?.(obj.mesh);
  }
  player[fieldName] = null;
}

const RALLY_DEPLOYABLE_GRAPH = compileStateGraph({
  [DEPLOYABLE_STATES.DEPLOYABLE_READY]: {
    on: {
      [DEPLOYABLE_EVENTS.PLACE]: DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.rallyDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_READY;
    }
  },
  [DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE]: {
    on: {
      [DEPLOYABLE_EVENTS.PLACE]: DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE,
      [DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY]: DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN,
      [DEPLOYABLE_EVENTS.COOLDOWN_DONE]: DEPLOYABLE_STATES.DEPLOYABLE_READY,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.rallyDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE;
    }
  },
  [DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN]: {
    on: {
      [DEPLOYABLE_EVENTS.COOLDOWN_DONE]: DEPLOYABLE_STATES.DEPLOYABLE_READY,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      cleanupDeployableField(p, 'rallyPoint');
      p.rallyDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN;
    }
  }
});

const BEACON_DEPLOYABLE_GRAPH = compileStateGraph({
  [DEPLOYABLE_STATES.DEPLOYABLE_READY]: {
    on: {
      [DEPLOYABLE_EVENTS.PLACE]: DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.beaconDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_READY;
    }
  },
  [DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE]: {
    on: {
      [DEPLOYABLE_EVENTS.PLACE]: DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE,
      [DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY]: DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN,
      [DEPLOYABLE_EVENTS.DEPLETE_SPAWNS]: DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN,
      [DEPLOYABLE_EVENTS.COOLDOWN_DONE]: DEPLOYABLE_STATES.DEPLOYABLE_READY,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      p.beaconDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE;
    }
  },
  [DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN]: {
    on: {
      [DEPLOYABLE_EVENTS.COOLDOWN_DONE]: DEPLOYABLE_STATES.DEPLOYABLE_READY,
      [DEPLOYABLE_EVENTS.RESET]: DEPLOYABLE_STATES.DEPLOYABLE_READY
    },
    onEnter(p) {
      if (!p) return;
      cleanupDeployableField(p, 'insertionBeacon');
      p.beaconDeployableState = DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN;
    }
  }
});

export function createSquadDeployablesFSM(player) {
  const rallyFsm = new FiniteStateMachine({
    id: 'rallyDeployable',
    context: player,
    initial: DEPLOYABLE_STATES.DEPLOYABLE_READY,
    emitEvents: false,
    states: RALLY_DEPLOYABLE_GRAPH
  });

  const beaconFsm = new FiniteStateMachine({
    id: 'beaconDeployable',
    context: player,
    initial: DEPLOYABLE_STATES.DEPLOYABLE_READY,
    emitEvents: false,
    states: BEACON_DEPLOYABLE_GRAPH
  });

  if (player) {
    player.rallyDeployableFSM = rallyFsm;
    player.rallyDeployableState = rallyFsm.state;
    player.beaconDeployableFSM = beaconFsm;
    player.beaconDeployableState = beaconFsm.state;
  }
  return { rallyFSM: rallyFsm, beaconFSM: beaconFsm };
}

export function syncSquadDeployablesFSM(player) {
  if (!player) return null;
  if (!player.rallyDeployableFSM || !player.beaconDeployableFSM) {
    createSquadDeployablesFSM(player);
  }
  const rallyFsm = player.rallyDeployableFSM;
  const beaconFsm = player.beaconDeployableFSM;

  // Sync Rally Point FSM & enforce invariants
  if (player.rallyPoint) {
    if ((player.rallyPoint.timer || 0) <= 0) {
      if (rallyFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
        if (rallyFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN) {
          rallyFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
        }
        rallyFsm.send(DEPLOYABLE_EVENTS.PLACE);
      }
      rallyFsm.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
      if ((player.rallyCooldown || 0) <= 0) {
        rallyFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
    } else if (rallyFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
      if (rallyFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN) {
        rallyFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
      rallyFsm.send(DEPLOYABLE_EVENTS.PLACE);
    }
  } else if ((player.rallyCooldown || 0) > 0) {
    if (rallyFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
      rallyFsm.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
    }
  } else if (rallyFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_READY) {
    rallyFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
  }

  // Sync Insertion Beacon FSM & enforce invariants
  if (player.insertionBeacon) {
    if ((player.insertionBeacon.spawnsLeft || 0) <= 0) {
      if (beaconFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
        if (beaconFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN) {
          beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
        }
        beaconFsm.send(DEPLOYABLE_EVENTS.PLACE);
      }
      beaconFsm.send(DEPLOYABLE_EVENTS.DEPLETE_SPAWNS);
      if ((player.beaconCooldown || 0) <= 0) {
        beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
    } else if ((player.insertionBeacon.timer || 0) <= 0) {
      if (beaconFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
        if (beaconFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN) {
          beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
        }
        beaconFsm.send(DEPLOYABLE_EVENTS.PLACE);
      }
      beaconFsm.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
      if ((player.beaconCooldown || 0) <= 0) {
        beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
    } else if (beaconFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
      if (beaconFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN) {
        beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
      beaconFsm.send(DEPLOYABLE_EVENTS.PLACE);
    }
  } else if ((player.beaconCooldown || 0) > 0) {
    if (beaconFsm.state === DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE) {
      beaconFsm.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
    }
  } else if (beaconFsm.state !== DEPLOYABLE_STATES.DEPLOYABLE_READY) {
    beaconFsm.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
  }

  player.rallyDeployableState = rallyFsm.state;
  player.beaconDeployableState = beaconFsm.state;
  return {
    rallyState: rallyFsm.state,
    beaconState: beaconFsm.state
  };
}

// ============================================================================
// 18. MAIN BASE SPAWN PROTECTION & CONTESTED LOCKOUT (`BaseProtectionFSM`)
// ============================================================================
/**
 * Explicit State Machine for Main Base Spawn Protection & Contested Lockout (Rank #12).
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> BASE_SAFE
 *   BASE_SAFE --> BASE_INTRUDER_DEFENDED : EVALUATE_INTRUDER_DEFENDED
 *   BASE_SAFE --> BASE_CONTESTED_LOCKED : EVALUATE_CONTESTED_LOCKED
 *   BASE_INTRUDER_DEFENDED --> BASE_SAFE : EVALUATE_SAFE
 *   BASE_INTRUDER_DEFENDED --> BASE_CONTESTED_LOCKED : EVALUATE_CONTESTED_LOCKED
 *   BASE_CONTESTED_LOCKED --> BASE_INTRUDER_DEFENDED : EVALUATE_INTRUDER_DEFENDED
 *   BASE_CONTESTED_LOCKED --> BASE_SAFE : EVALUATE_SAFE
 * ```
 *
 * Eliminated Impossible Combinations:
 * - `contested === true && attackers === 0`
 * - `contested === true && defenders > 0`
 * - `baseState[team].contested === true` while Deploy Screen leaves `'BASE'` unlocked when uncontested forward flags exist
 */
export const BASE_PROTECTION_STATES = {
  BASE_SAFE: 'BASE_SAFE',
  BASE_INTRUDER_DEFENDED: 'BASE_INTRUDER_DEFENDED',
  BASE_CONTESTED_LOCKED: 'BASE_CONTESTED_LOCKED'
};

export const BASE_PROTECTION_EVENTS = {
  EVALUATE_SAFE: 'EVALUATE_SAFE',
  EVALUATE_INTRUDER_DEFENDED: 'EVALUATE_INTRUDER_DEFENDED',
  EVALUATE_CONTESTED_LOCKED: 'EVALUATE_CONTESTED_LOCKED'
};

const BASE_PROTECTION_GRAPH = compileStateGraph({
  [BASE_PROTECTION_STATES.BASE_SAFE]: {
    on: {
      [BASE_PROTECTION_EVENTS.EVALUATE_SAFE]: BASE_PROTECTION_STATES.BASE_SAFE,
      [BASE_PROTECTION_EVENTS.EVALUATE_INTRUDER_DEFENDED]:
        BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED,
      [BASE_PROTECTION_EVENTS.EVALUATE_CONTESTED_LOCKED]:
        BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED
    },
    onEnter(entry) {
      if (!entry) return;
      entry.protectionState = BASE_PROTECTION_STATES.BASE_SAFE;
      entry.contested = false;
    }
  },
  [BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED]: {
    on: {
      [BASE_PROTECTION_EVENTS.EVALUATE_SAFE]: BASE_PROTECTION_STATES.BASE_SAFE,
      [BASE_PROTECTION_EVENTS.EVALUATE_INTRUDER_DEFENDED]:
        BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED,
      [BASE_PROTECTION_EVENTS.EVALUATE_CONTESTED_LOCKED]:
        BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED
    },
    onEnter(entry) {
      if (!entry) return;
      entry.protectionState = BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED;
      entry.contested = false;
    }
  },
  [BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED]: {
    on: {
      [BASE_PROTECTION_EVENTS.EVALUATE_SAFE]: BASE_PROTECTION_STATES.BASE_SAFE,
      [BASE_PROTECTION_EVENTS.EVALUATE_INTRUDER_DEFENDED]:
        BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED,
      [BASE_PROTECTION_EVENTS.EVALUATE_CONTESTED_LOCKED]:
        BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED
    },
    onEnter(entry) {
      if (!entry) return;
      entry.protectionState = BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED;
      entry.contested = true;
    }
  }
});

export function createBaseProtectionFSM(baseEntry, team = 'US') {
  const fsm = new FiniteStateMachine({
    id: `baseProtection:${team}`,
    context: baseEntry,
    initial: BASE_PROTECTION_STATES.BASE_SAFE,
    emitEvents: false,
    states: BASE_PROTECTION_GRAPH
  });
  if (baseEntry) {
    baseEntry.fsm = fsm;
    baseEntry.protectionState = fsm.state;
  }
  return fsm;
}

export function syncBaseProtectionFSM(baseEntry, team = 'US') {
  if (!baseEntry) return BASE_PROTECTION_STATES.BASE_SAFE;
  if (!baseEntry.fsm) {
    createBaseProtectionFSM(baseEntry, team);
  }
  const fsm = baseEntry.fsm;
  const attackers = Math.max(0, Number(baseEntry.attackers || 0));
  const defenders = Math.max(0, Number(baseEntry.defenders || 0));
  baseEntry.attackers = attackers;
  baseEntry.defenders = defenders;

  const st = fsm.state;
  if (attackers === 0) {
    if (st !== BASE_PROTECTION_STATES.BASE_SAFE) {
      fsm.send(BASE_PROTECTION_EVENTS.EVALUATE_SAFE);
    }
  } else if (defenders > 0) {
    if (st !== BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED) {
      fsm.send(BASE_PROTECTION_EVENTS.EVALUATE_INTRUDER_DEFENDED);
    }
  } else if (st !== BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED) {
    fsm.send(BASE_PROTECTION_EVENTS.EVALUATE_CONTESTED_LOCKED);
  }

  baseEntry.protectionState = fsm.state;
  baseEntry.contested = fsm.state === BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED;
  return fsm.state;
}

// ============================================================================
// 9. UNIFIED RUNTIME STATE MACHINE COORDINATOR (`GameStateMachineRegistry`)
//    Elevates UX, DX, and AX with live synchronization & invariant verification
// ============================================================================
export class GameStateMachineRegistry {
  constructor(game) {
    this.game = game;
    this.match = createMatchFSM(game);
    this.uiModal = createUIModalFSM(game?.ui);
    this.playerVitality = createPlayerVitalityFSM(game?.player);
    this.playerStance = createPlayerStanceFSM(game?.player);
    this.playerWeapon = createPlayerWeaponFSM(game?.player);
    this.playerInteract = createPlayerInteractFSM(game?.player);

    if (game?.player) {
      game.player.fsm = {
        vitality: this.playerVitality,
        stance: this.playerStance,
        weapon: this.playerWeapon,
        interact: this.playerInteract
      };
    }
    if (game?.ui) {
      game.ui.fsm = {
        modal: this.uiModal
      };
    }
    this._modalElCache = {};
    this._bulkSyncAccum = 999;
  }

  /**
   * Synchronizes all state machines with current game state each frame and enforces invariants.
   */
  update(dt = 0) {
    const g = this.game;
    if (!g) return;
    const p = g.player;
    const ui = g.ui;

    // 1. Sync Match Lifecycle FSM
    const onDeploy = Boolean(
      ui?.deployScreenEl &&
        !ui.deployScreenEl.classList.contains('hidden') &&
        ui.deployScreenEl.style.display !== 'none'
    );
    const onVictory = Boolean(
      ui?.victoryScreenEl &&
        !ui.victoryScreenEl.classList.contains('hidden') &&
        ui.victoryScreenEl.style.display !== 'none'
    );

    const desiredMatchState =
      g.matchEnded || onVictory
        ? MATCH_STATES.ROUND_VICTORY
        : onDeploy
        ? MATCH_STATES.DEPLOY_LOBBY
        : MATCH_STATES.ACTIVE_COMBAT;
    if (this.match.state !== desiredMatchState && this.match.can(desiredMatchState)) {
      this.match.transition(desiredMatchState);
    }

    // 2. Sync UI Overlay & Input Focus FSM
    let desiredModalState = UI_MODAL_STATES.HUD_LOCKED;
    if (onVictory) {
      desiredModalState = UI_MODAL_STATES.VICTORY_SCREEN;
    } else if (onDeploy) {
      desiredModalState = UI_MODAL_STATES.DEPLOY_SCREEN;
    } else if (this._isDomModalOpen('gunsmith-modal')) {
      desiredModalState = UI_MODAL_STATES.MODAL_GUNSMITH_LOOT;
    } else if (this._isDomModalOpen('command-modal')) {
      desiredModalState = UI_MODAL_STATES.MODAL_COMMAND_MAP;
    } else if (this._isDomModalOpen('multiplayer-modal')) {
      desiredModalState = UI_MODAL_STATES.MODAL_MULTIPLAYER;
    } else if (this._isDomModalOpen('settings-modal')) {
      desiredModalState = UI_MODAL_STATES.MODAL_SETTINGS;
    } else if (p?.commoRoseActive) {
      desiredModalState = UI_MODAL_STATES.COMMO_ROSE;
    }
    if (this.uiModal.state !== desiredModalState) {
      if (desiredModalState === UI_MODAL_STATES.HUD_LOCKED) {
        this.uiModal.transition(UI_MODAL_STATES.HUD_LOCKED, NO_RESTORE_LOCK_PAYLOAD);
      } else {
        this.uiModal.transition(desiredModalState);
      }
    }

    // 3. Sync Player Vitality, Stance, Weapon & Interact FSMs
    if (p) {
      // Enforce invariant: never both dead and downed
      if (p.dead && p.downed) {
        p.downed = false;
      }
      // Enforce invariant: never both crouching and prone
      if (p.prone && p.crouching) {
        p.crouching = false;
      }

      if (p.dead) {
        if (this.playerVitality.state !== PLAYER_VITALITY_STATES.UNDEPLOYED) {
          const targetVit = onDeploy
            ? PLAYER_VITALITY_STATES.UNDEPLOYED
            : PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN;
          if (this.playerVitality.state !== targetVit && this.playerVitality.can(targetVit)) {
            this.playerVitality.transition(targetVit);
          }
        }
      } else if (p.downed) {
        if (this.playerVitality.state !== PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT) {
          if (!this.playerVitality.can(PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT)) {
            this.playerVitality.transition(PLAYER_VITALITY_STATES.ALIVE);
          }
          this.playerVitality.transition(PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT);
        }
      } else if (p.activeVehicle) {
        if (this.playerVitality.state !== PLAYER_VITALITY_STATES.IN_VEHICLE) {
          if (!this.playerVitality.can(PLAYER_VITALITY_STATES.IN_VEHICLE)) {
            this.playerVitality.transition(PLAYER_VITALITY_STATES.ALIVE);
          }
          this.playerVitality.transition(PLAYER_VITALITY_STATES.IN_VEHICLE);
        }
      } else if (this.playerVitality.state !== PLAYER_VITALITY_STATES.ALIVE) {
        this.playerVitality.transition(PLAYER_VITALITY_STATES.ALIVE);
      }

      // Stance FSM
      if (p.dead || p.downed) {
        if (this.playerStance.state !== PLAYER_STANCE_STATES.INCAPACITATED) {
          this.playerStance.transition(PLAYER_STANCE_STATES.INCAPACITATED);
        }
      } else {
        if (this.playerStance.state === PLAYER_STANCE_STATES.INCAPACITATED) {
          this.playerStance.transition(PLAYER_STANCE_STATES.STANDING);
        }
        if (p.activeVehicle) {
          if (this.playerStance.state !== PLAYER_STANCE_STATES.VEHICLE_SEATED) {
            this.playerStance.transition(PLAYER_STANCE_STATES.VEHICLE_SEATED);
          }
        } else {
          if (this.playerStance.state === PLAYER_STANCE_STATES.VEHICLE_SEATED) {
            this.playerStance.transition(
              p.isGrounded ? PLAYER_STANCE_STATES.STANDING : PLAYER_STANCE_STATES.AIRBORNE
            );
          }
          let desiredStance = PLAYER_STANCE_STATES.STANDING;
          if (p.draggedBot || p.isDraggingAlly) {
            desiredStance = PLAYER_STANCE_STATES.DRAGGING_ALLY;
          } else if (!p.isGrounded) {
            desiredStance = PLAYER_STANCE_STATES.AIRBORNE;
          } else if (p.prone) {
            desiredStance = PLAYER_STANCE_STATES.PRONE;
          } else if (p.crouching) {
            desiredStance = PLAYER_STANCE_STATES.CROUCHING;
          } else if (
            p.keys?.['ShiftLeft'] &&
            p.keys?.['KeyW'] &&
            !p.isAds &&
            !p.isFiring &&
            !p.isModalOpen?.()
          ) {
            desiredStance = PLAYER_STANCE_STATES.SPRINTING;
          }
          if (this.playerStance.state !== desiredStance) {
            this.playerStance.transition(desiredStance);
          }
        }
      }

      // Weapon & Action FSM
      if (p.dead || p.downed) {
        if (this.playerWeapon.state !== PLAYER_WEAPON_STATES.DISABLED) {
          this.playerWeapon.transition(PLAYER_WEAPON_STATES.DISABLED);
        }
      } else {
        if (this.playerWeapon.state === PLAYER_WEAPON_STATES.DISABLED) {
          this.playerWeapon.transition(PLAYER_WEAPON_STATES.READY);
        }
        let desiredWeapon = PLAYER_WEAPON_STATES.READY;
        if ((p.reviveProgress || 0) > 0) {
          desiredWeapon = PLAYER_WEAPON_STATES.REVIVING_ALLY;
        } else if ((p.bandageProgress || 0) > 0) {
          desiredWeapon = PLAYER_WEAPON_STATES.BANDAGING_SELF;
        } else if (p.reloading) {
          desiredWeapon = p.fastReload
            ? PLAYER_WEAPON_STATES.SPEED_RELOAD
            : PLAYER_WEAPON_STATES.TACTICAL_RELOAD;
        } else if (p.slowReloading) {
          desiredWeapon = PLAYER_WEAPON_STATES.SLOW_MAG_PACK;
        } else if (p.keys?.['KeyF'] && (p.keyFHoldTime || 0) > 0 && p._pendingEnemyLootPack) {
          desiredWeapon = PLAYER_WEAPON_STATES.LOOTING_HOLD;
        } else if (p.isFiring) {
          desiredWeapon = PLAYER_WEAPON_STATES.FIRING;
        }
        if (this.playerWeapon.state !== desiredWeapon) {
          if (!this.playerWeapon.can(desiredWeapon) && this.playerWeapon.can(PLAYER_WEAPON_STATES.READY)) {
            this.playerWeapon.transition(PLAYER_WEAPON_STATES.READY);
          }
          this.playerWeapon.transition(desiredWeapon);
        }
      }

      // Interact [F] FSM
      let desiredInteract = PLAYER_INTERACT_STATES.IDLE;
      if (
        this.uiModal.state === UI_MODAL_STATES.MODAL_GUNSMITH_LOOT &&
        ui?._gunsmithActiveTab === 'backpack'
      ) {
        desiredInteract = PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN;
      } else if ((p.reviveProgress || 0) > 0) {
        desiredInteract = PLAYER_INTERACT_STATES.HOLDING_REVIVE;
      } else if (p.keys?.['KeyF'] && p._pendingEnemyLootPack) {
        desiredInteract = PLAYER_INTERACT_STATES.HOLDING_ENEMY_LOOT;
      }
      if (this.playerInteract.state !== desiredInteract) {
        if (!this.playerInteract.can(desiredInteract) && this.playerInteract.can(PLAYER_INTERACT_STATES.IDLE)) {
          this.playerInteract.transition(PLAYER_INTERACT_STATES.IDLE);
        }
        this.playerInteract.transition(desiredInteract);
      }
    }

    // 4. Sync Squad Deployables FSMs (player-local, very fast)
    if (p) {
      syncSquadDeployablesFSM(p);
    }

    // 5. Throttle bulk 250-bot / 36-vehicle / 5-flag background sweep to 10 Hz during render loop
    //    (When `dt <= 0` — e.g. `validateAllInvariants()`, `getSnapshot()`, or unit tests — run immediately)
    if (dt > 0) {
      this._bulkSyncAccum += dt;
      if (this._bulkSyncAccum < 0.1) {
        // Still sync the player's currently driven vehicle every frame if any
        if (p?.activeVehicle) {
          if (p.activeVehicle.isAircraft) {
            syncAircraftFlightFSM(p.activeVehicle);
          } else {
            syncGroundVehicleFSM(p.activeVehicle);
          }
          syncVehicleSubsystemsFSM(p.activeVehicle);
        }
        return;
      }
      this._bulkSyncAccum = 0;
    }

    // 6. Sync Forward Base Objective FSMs
    if (g.world && Array.isArray(g.world.flags)) {
      for (const flag of g.world.flags) {
        syncFlagStateMachine(flag);
      }
    }

    // 7. Sync Bot Vitality, Doctrine & Medic Rescue FSMs + Base Protection FSMs
    if (g.botManager) {
      if (Array.isArray(g.botManager.bots)) {
        for (let i = 0; i < g.botManager.bots.length; i++) {
          syncBotStateMachine(g.botManager.bots[i], false);
        }
      }
      if (g.botManager.baseState) {
        if (g.botManager.baseState.US) syncBaseProtectionFSM(g.botManager.baseState.US, 'US');
        if (g.botManager.baseState.RU) syncBaseProtectionFSM(g.botManager.baseState.RU, 'RU');
      }
    }

    // 8. Sync Vehicle Flight, Ground Occupancy & Subsystem FSMs
    if (g.vehicleManager && Array.isArray(g.vehicleManager.vehicles)) {
      for (const v of g.vehicleManager.vehicles) {
        if (v.isAircraft) {
          syncAircraftFlightFSM(v);
        } else {
          syncGroundVehicleFSM(v);
        }
        syncVehicleSubsystemsFSM(v);
      }
    }
  }

  _isDomModalOpen(id) {
    if (typeof document === 'undefined') return false;
    let el = this._modalElCache?.[id];
    if (!el || !el.isConnected) {
      el = document.getElementById(id);
      if (this._modalElCache && el) {
        this._modalElCache[id] = el;
      }
    }
    return Boolean(el && !el.classList.contains('hidden') && el.style.display !== 'none');
  }

  /**
   * Validates all state machine invariants across the entire application.
   * Returns `{ valid: boolean, violations: string[] }` for instant DX/AX verification.
   */
  validateAllInvariants() {
    this.update();
    const violations = [];
    const g = this.game;
    const p = g?.player;

    if (p) {
      if (p.dead && p.downed) {
        violations.push('Player cannot be both dead and downed simultaneously.');
      }
      if (p.crouching && p.prone) {
        violations.push('Player cannot be both crouching and prone simultaneously.');
      }
      if (p.reloading && p.slowReloading) {
        violations.push('Player cannot fast-reload and slow-pack magazines simultaneously.');
      }
      if (p.isModalOpen?.() && p.isFiring) {
        violations.push('Player cannot fire weapons while a UI modal is open.');
      }
      if (p.parachuting && p.parachuteCut) {
        violations.push('Player cannot be both parachuting and parachuteCut simultaneously.');
      }
      if ((p.isGrounded || p.activeVehicle) && p.parachuting) {
        violations.push('Player cannot be parachuting while grounded or seated in a vehicle.');
      }
      if (!p.aircraftLockTarget && (p.aircraftLockProgress || 0) > 0) {
        violations.push('Player cannot have aircraftLockProgress > 0 when aircraftLockTarget is null.');
      }
      if (
        p.insertionBeacon &&
        ((p.insertionBeacon.spawnsLeft || 0) <= 0 || (p.insertionBeacon.timer || 0) <= 0)
      ) {
        violations.push('Player insertionBeacon cannot remain active when spawnsLeft <= 0 or timer <= 0.');
      }
    }

    // Verify at most 1 pop-out modal is visible at any time
    const openPopouts = Object.values(POPOUT_MODAL_DOM_IDS).filter((id) => this._isDomModalOpen(id));
    if (openPopouts.length > 1) {
      violations.push(`Multiple popout modals open simultaneously: ${openPopouts.join(', ')}`);
    }

    // Verify vehicle invariants (AircraftFlightFSM, GroundVehicleFSM, VehicleSubsystemsFSM)
    if (g?.vehicleManager?.vehicles) {
      for (const v of g.vehicleManager.vehicles) {
        if (v.isAircraft) {
          if (v.isShotDown && v.isStalling) {
            violations.push(`Aircraft ${v.id} cannot be both isShotDown and isStalling.`);
          }
          if (v.dead && v.isShotDown) {
            violations.push(`Destroyed aircraft ${v.id} cannot still have isShotDown=true.`);
          }
        } else {
          if (v.driver && v.npcDriver) {
            violations.push(`Ground vehicle ${v.id} has both human driver and npcDriver.`);
          }
        }
        if ((v.coaxHeat || 0) <= 0 && v.coaxOverheated) {
          violations.push(`Vehicle ${v.id} has coaxOverheated=true while coaxHeat <= 0.`);
        }
      }
    }

    // Verify bot invariants across all 250 NPCs
    if (g?.botManager?.bots) {
      for (const b of g.botManager.bots) {
        if (b.dead && b.downed) {
          violations.push(`Bot ${b.name} is both dead and downed.`);
        }
        if ((b.downed || b.dead) && b.canContributeToFlagCapture) {
          violations.push(`Incapacitated bot ${b.name} has canContributeToFlagCapture=true.`);
        }
        if ((b.downed || b.dead) && b.canGiveDamageScore) {
          violations.push(`Incapacitated bot ${b.name} has canGiveDamageScore=true.`);
        }
        if (b.rescueTarget && b.rescueTarget.rescuer !== b) {
          violations.push(`Medic ${b.name} has asymmetric rescueTarget link.`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Returns a structured, agent- and developer-friendly snapshot of all state machines in the app.
   */
  getSnapshot() {
    this.update();
    const g = this.game;
    const p = g?.player;
    const botCounts = {
      vitality: {},
      doctrine: {},
      medicRescue: {}
    };
    if (g?.botManager?.bots) {
      for (const b of g.botManager.bots) {
        const v = b.vitalityState || 'UNKNOWN';
        const d = b.doctrineState || 'UNKNOWN';
        const r = b.medicRescueState || 'IDLE';
        botCounts.vitality[v] = (botCounts.vitality[v] || 0) + 1;
        botCounts.doctrine[d] = (botCounts.doctrine[d] || 0) + 1;
        botCounts.medicRescue[r] = (botCounts.medicRescue[r] || 0) + 1;
      }
    }

    const vehicleCounts = {
      aircraftFlight: {},
      groundOccupancy: {},
      cm: {},
      thermal: {}
    };
    if (g?.vehicleManager?.vehicles) {
      for (const v of g.vehicleManager.vehicles) {
        if (v.isAircraft) {
          const fs = v.flightState || 'UNKNOWN';
          vehicleCounts.aircraftFlight[fs] = (vehicleCounts.aircraftFlight[fs] || 0) + 1;
        } else {
          const gs = v.occupancyState || 'UNKNOWN';
          vehicleCounts.groundOccupancy[gs] = (vehicleCounts.groundOccupancy[gs] || 0) + 1;
        }
        const cm = v.cmState || 'CM_READY';
        const th = v.thermalState || 'THERMAL_NORMAL';
        vehicleCounts.cm[cm] = (vehicleCounts.cm[cm] || 0) + 1;
        vehicleCounts.thermal[th] = (vehicleCounts.thermal[th] || 0) + 1;
      }
    }

    const flags = (g?.world?.flags || []).map((f) => ({
      id: f.id,
      owner: f.owner,
      controlState: f.controlState || syncFlagStateMachine(f),
      captureProgress: Math.round(f.captureProgress || 0),
      contested: Boolean(f.contested),
      defenseStage: f.defenseStage || 0,
      garrisonUS: f.garrisonSquad?.US || null,
      garrisonRU: f.garrisonSquad?.RU || null
    }));

    const invariants = this.validateAllInvariants();

    return {
      match: this.match.getSnapshot(),
      uiModal: this.uiModal.getSnapshot(),
      network: g?.network?.transportFSM ? g.network.transportFSM.getSnapshot() : null,
      armoryCaseRoulette: g?.ui?.caseRouletteFSM ? g.ui.caseRouletteFSM.getSnapshot() : null,
      player: {
        vitality: this.playerVitality.getSnapshot(),
        stance: this.playerStance.getSnapshot(),
        weapon: this.playerWeapon.getSnapshot(),
        interact: this.playerInteract.getSnapshot(),
        parachute: p?.parachuteFSM ? p.parachuteFSM.getSnapshot() : null,
        uav: p?.uavFSM ? p.uavFSM.getSnapshot() : null,
        airstrike: p?.airstrikeFSM ? p.airstrikeFSM.getSnapshot() : null,
        targetLock: p?.targetLockFSM ? p.targetLockFSM.getSnapshot() : null,
        rallyDeployable: p?.rallyDeployableFSM ? p.rallyDeployableFSM.getSnapshot() : null,
        beaconDeployable: p?.beaconDeployableFSM ? p.beaconDeployableFSM.getSnapshot() : null,
        inFriendlyForwardBase: Boolean(p?.inFriendlyForwardBase),
        defendedFlagId: p?.defendedFlagId || null
      },
      baseProtection: {
        US: g?.botManager?.baseState?.US?.fsm
          ? g.botManager.baseState.US.fsm.getSnapshot()
          : null,
        RU: g?.botManager?.baseState?.RU?.fsm
          ? g.botManager.baseState.RU.fsm.getSnapshot()
          : null
      },
      vehiclesSummary: vehicleCounts,
      flags,
      botsSummary: botCounts,
      invariants
    };
  }
}
