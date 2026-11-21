import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT_FLIGHT_STATES,
  AIRCRAFT_FLIGHT_EVENTS,
  createAircraftFlightFSM,
  syncAircraftFlightFSM,
  PLAYER_PARACHUTE_STATES,
  PLAYER_PARACHUTE_EVENTS,
  createPlayerParachuteFSM,
  GROUND_VEHICLE_STATES,
  GROUND_VEHICLE_EVENTS,
  createGroundVehicleFSM,
  syncGroundVehicleFSM,
  PLAYER_VITALITY_STATES,
  PLAYER_STANCE_STATES,
  PLAYER_WEAPON_STATES,
  PLAYER_INTERACT_STATES,
  createPlayerVitalityFSM,
  createPlayerStanceFSM,
  createPlayerWeaponFSM,
  createPlayerInteractFSM,
  NETWORK_TRANSPORT_STATES,
  NETWORK_TRANSPORT_EVENTS,
  createNetworkTransportFSM,
  MEDIC_RESCUE_STATES,
  MEDIC_RESCUE_EVENTS,
  createMedicRescueFSM,
  syncBotStateMachine,
  COMMANDER_UAV_STATES,
  COMMANDER_UAV_EVENTS,
  createCommanderUavFSM,
  COMMANDER_AIRSTRIKE_STATES,
  COMMANDER_AIRSTRIKE_EVENTS,
  createCommanderAirstrikeFSM,
  VEHICLE_CM_STATES,
  VEHICLE_CM_EVENTS,
  VEHICLE_THERMAL_STATES,
  VEHICLE_THERMAL_EVENTS,
  createVehicleSubsystemsFSM,
  syncVehicleSubsystemsFSM,
  TARGET_LOCK_STATES,
  TARGET_LOCK_EVENTS,
  createTargetLockScannerFSM,
  updateTargetLockScanner,
  ARMORY_CASE_STATES,
  ARMORY_CASE_EVENTS,
  createArmoryCaseRouletteFSM,
  DEPLOYABLE_STATES,
  DEPLOYABLE_EVENTS,
  createSquadDeployablesFSM,
  syncSquadDeployablesFSM,
  BASE_PROTECTION_STATES,
  BASE_PROTECTION_EVENTS,
  createBaseProtectionFSM,
  syncBaseProtectionFSM,
  GameStateMachineRegistry
} from '../src/core/StateMachines.js';

// ============================================================================
// 1. RANK #1 — AircraftFlightFSM Tests
// ============================================================================
test('Rank #1 AircraftFlightFSM: covers every valid transition and derives legacy flags', () => {
  const plane = {
    id: 'f35_us_1',
    isAircraft: true,
    dead: false,
    isShotDown: false,
    isStalling: false,
    stallSinkVel: 0,
    aiPilotActive: false,
    driver: null
  };

  const fsm = createAircraftFlightFSM(plane);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);
  assert.equal(plane.flightState, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);

  // 1. PARKED_RUNWAY -> AI_SORTIE_PREFLIGHT -> PARKED_RUNWAY
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.START_AI_PREFLIGHT), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.AI_SORTIE_PREFLIGHT);
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.CANCEL_AI_SORTIE), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);

  // 2. PARKED_RUNWAY -> TAXI_TAKEOFF_ROLL -> AIRBORNE_CRUISE
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.BOARD_RUNWAY), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL);
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE);

  // 3. AIRBORNE_CRUISE -> AERODYNAMIC_STALL -> AIRBORNE_CRUISE
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.AERODYNAMIC_STALL);
  assert.equal(plane.isStalling, true);
  assert.equal(plane.isShotDown, false);

  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE);
  assert.equal(plane.isStalling, false);

  // 4. AIRBORNE_CRUISE -> TOUCHDOWN -> PARK_STOP -> AI_LAUNCH_SORTIE
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.TOUCHDOWN), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.TAXI_TAKEOFF_ROLL);
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.PARK_STOP), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE);

  // 5. AIRBORNE_CRUISE -> SHOT_DOWN_MAYDAY_SPIRAL -> DESTROYED_RESPAWNING -> PARKED_RUNWAY
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL);
  assert.equal(plane.isShotDown, true);
  assert.equal(plane.dead, false);

  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.CRASH_IMPACT), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.DESTROYED_RESPAWNING);
  assert.equal(plane.dead, true);
  assert.equal(plane.isShotDown, false);

  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY), true);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);
  assert.equal(plane.dead, false);
});

test('Rank #1 AircraftFlightFSM: rejects invalid transitions and records rejection telemetry', () => {
  const plane = { id: 'su57_ru_1', isAircraft: true, dead: false };
  const fsm = createAircraftFlightFSM(plane);

  // Cannot recover stall or crash impact while parked on runway
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL), false);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY);
  assert.equal(fsm.rejectedCount, 1);

  // Once in SHOT_DOWN_MAYDAY_SPIRAL, cannot recover to AIRBORNE_CRUISE or enter AERODYNAMIC_STALL
  fsm.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE);
  fsm.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL);

  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL), false);
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL), false);
  assert.equal(fsm.transition(AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE), false);
  assert.equal(fsm.state, AIRCRAFT_FLIGHT_STATES.SHOT_DOWN_MAYDAY_SPIRAL);
  assert.equal(fsm.rejectedCount, 4);
});

test('Rank #1 AircraftFlightFSM: eliminates overlapping isStalling + isShotDown + aiPilotActive bug class', () => {
  const plane = {
    id: 'a10_us_1',
    isAircraft: true,
    dead: false,
    isShotDown: false,
    isStalling: true,
    stallSinkVel: -18.5,
    aiPilotActive: true
  };
  const fsm = createAircraftFlightFSM(plane);
  fsm.send(AIRCRAFT_FLIGHT_EVENTS.LIFTOFF);
  fsm.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL);
  plane.stallSinkVel = -18.5;
  plane.aiPilotActive = true;

  // Shooting down a stalling or AI-piloted aircraft immediately clears isStalling, stallSinkVel, and aiPilotActive
  assert.equal(fsm.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE), true);
  assert.equal(plane.isShotDown, true);
  assert.equal(plane.isStalling, false);
  assert.equal(plane.stallSinkVel, 0);
  assert.equal(plane.aiPilotActive, false);

  // Even if external code mutates isStalling while isShotDown is true, syncAircraftFlightFSM enforces mutual exclusion
  plane.isStalling = true;
  plane.aiPilotActive = true;
  syncAircraftFlightFSM(plane, { onRunway: false });
  assert.equal(plane.isShotDown, true);
  assert.equal(plane.isStalling, false);
  assert.equal(plane.aiPilotActive, false);
});

// ============================================================================
// 2. RANK #2 — PlayerParachuteFSM Tests
// ============================================================================
test('Rank #2 PlayerParachuteFSM: covers every valid transition and derives canopy visibility', () => {
  const player = {
    isGrounded: true,
    onGround: true,
    parachuting: false,
    parachuteCut: false,
    parachuteMesh: { visible: false }
  };

  const fsm = createPlayerParachuteFSM(player);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.GROUNDED);

  // 1. GROUNDED -> STANDARD_AIRBORNE -> GROUNDED
  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.JUMP_OR_FALL), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.STANDARD_AIRBORNE);
  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.LAND_GROUND), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.GROUNDED);

  // 2. GROUNDED -> PARACHUTE_GLIDING -> CUT_CANOPY_FREEFALL -> RESERVE_CHUTE_GLIDING -> GROUNDED
  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.PARACHUTE_GLIDING);
  assert.equal(player.parachuting, true);
  assert.equal(player.parachuteCut, false);
  assert.equal(player.parachuteMesh.visible, true);

  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.CUT_CANOPY), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.CUT_CANOPY_FREEFALL);
  assert.equal(player.parachuting, false);
  assert.equal(player.parachuteCut, true);
  assert.equal(player.parachuteMesh.visible, false);

  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.PULL_RESERVE), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.RESERVE_CHUTE_GLIDING);
  assert.equal(player.parachuting, true);
  assert.equal(player.parachuteCut, false);
  assert.equal(player.parachuteMesh.visible, true);

  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.LAND_GROUND), true);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.GROUNDED);
  assert.equal(player.parachuting, false);
  assert.equal(player.parachuteCut, false);
  assert.equal(player.parachuteMesh.visible, false);
});

test('Rank #2 PlayerParachuteFSM: rejects invalid transitions (cannot cut canopy while grounded or freefalling)', () => {
  const player = {
    isGrounded: true,
    parachuting: false,
    parachuteCut: false,
    parachuteMesh: { visible: false }
  };
  const fsm = createPlayerParachuteFSM(player);

  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.CUT_CANOPY), false);
  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.PULL_RESERVE), false);
  assert.equal(fsm.state, PLAYER_PARACHUTE_STATES.GROUNDED);
  assert.equal(fsm.rejectedCount, 2);
});

test('Rank #2 PlayerParachuteFSM: eliminates stale parachuteCut across redeploy/vehicle-board and ghost canopy', () => {
  const player = {
    isGrounded: false,
    parachuting: false,
    parachuteCut: false,
    parachuteMesh: { visible: false }
  };
  const fsm = createPlayerParachuteFSM(player);

  fsm.send(PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY);
  fsm.send(PLAYER_PARACHUTE_EVENTS.CUT_CANOPY);
  assert.equal(player.parachuteCut, true);

  // Redeploying or boarding a vehicle while in CUT_CANOPY_FREEFALL resets parachuteCut=false and hides canopy
  assert.equal(fsm.send(PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY), true);
  assert.equal(player.parachuteCut, false);
  assert.equal(player.parachuting, false);
  assert.equal(player.parachuteMesh.visible, false);
});

// ============================================================================
// 3. RANK #3 — GroundVehicleFSM Tests
// ============================================================================
test('Rank #3 GroundVehicleFSM: covers every valid transition including initial delay, AI patrol, commandeering, and wheelie boost', () => {
  const riderGroup = { visible: false };
  const bike = {
    id: 'stark_varg_us',
    type: 'bike',
    isAircraft: false,
    dead: true,
    respawnTimer: 5.0,
    replacementTicketPaid: false,
    driver: null,
    npcDriver: null,
    wheeliePitch: 0,
    mesh: { userData: { riderGroup } }
  };

  const fsm = createGroundVehicleFSM(bike);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.INITIAL_REINFORCEMENT_DELAY);

  // 1. INITIAL_REINFORCEMENT_DELAY -> PARKED_UNOCCUPIED
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.SPAWN_READY), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED);
  assert.equal(bike.dead, false);
  assert.equal(riderGroup.visible, false);

  // 2. PARKED_UNOCCUPIED -> AI_CREWED_PATROL -> PLAYER_DRIVEN_CRUISE (commandeer)
  const npc = { name: 'Bot_1', drivingVehicle: bike };
  bike.npcDriver = npc;
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.NPC_BOARD), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.AI_CREWED_PATROL);
  assert.equal(riderGroup.visible, true);

  const player = { name: 'Player', thirdPersonVehicle: true };
  bike.driver = player;
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.PLAYER_COMMANDEER), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE);
  assert.equal(bike.npcDriver, null);
  assert.equal(npc.drivingVehicle, null);

  // 3. PLAYER_DRIVEN_CRUISE <-> PLAYER_DRIVEN_WHEELIE_BOOST -> PARKED_UNOCCUPIED
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.ENTER_WHEELIE_BOOST), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PLAYER_DRIVEN_WHEELIE_BOOST);
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.EXIT_WHEELIE_BOOST), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PLAYER_DRIVEN_CRUISE);
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.PLAYER_EXIT), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED);
  assert.equal(riderGroup.visible, false);

  // 4. PARKED_UNOCCUPIED -> DESTROYED_RESPAWN_COUNTDOWN -> PARKED_UNOCCUPIED
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.DESTROY), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.DESTROYED_RESPAWN_COUNTDOWN);
  assert.equal(bike.dead, true);
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY), true);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED);
  assert.equal(bike.dead, false);
});

test('Rank #3 GroundVehicleFSM: rejects invalid transitions (cannot wheelie unoccupied or destroyed vehicle)', () => {
  const bike = { id: 'surron_us', type: 'bike', isAircraft: false, dead: false };
  const fsm = createGroundVehicleFSM(bike);

  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.ENTER_WHEELIE_BOOST), false);
  assert.equal(fsm.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY), false);
  assert.equal(fsm.state, GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED);
  assert.equal(fsm.rejectedCount, 2);
});

test('Rank #3 GroundVehicleFSM: eliminates simultaneous driver + npcDriver and ghost 3D rider bug class', () => {
  const riderGroup = { visible: true };
  const npc = { name: 'Bot_2', drivingVehicle: null };
  const player = { name: 'Player', thirdPersonVehicle: true };
  const bike = {
    id: 'cbr1000rr_us',
    type: 'bike',
    isAircraft: false,
    dead: false,
    driver: player,
    npcDriver: npc,
    mesh: { userData: { riderGroup } }
  };
  npc.drivingVehicle = bike;

  // syncGroundVehicleFSM evicts npcDriver when human driver is present
  syncGroundVehicleFSM(bike, { wheelieBoost: false });
  assert.equal(bike.driver, player);
  assert.equal(bike.npcDriver, null);
  assert.equal(npc.drivingVehicle, null);

  // Exiting hides riderGroup (preventing ghost 3D rider)
  bike.driver = null;
  syncGroundVehicleFSM(bike);
  assert.equal(riderGroup.visible, false);
});

// ============================================================================
// 4. RANK #4 — Core Player Vitality, Stance, Weapon & Interact FSM Tests
// ============================================================================
test('Rank #4 PlayerVitality/Stance/Weapon/Interact FSMs: cover valid transitions and enforce mutual exclusion', () => {
  const player = {
    dead: true,
    downed: false,
    crouching: false,
    prone: false,
    reloading: false,
    fastReload: false,
    slowReloading: false,
    magPackProgress: 0,
    isFiring: false,
    isAds: false
  };

  const vitality = createPlayerVitalityFSM(player);
  const stance = createPlayerStanceFSM(player);
  const weapon = createPlayerWeaponFSM(player);
  const interact = createPlayerInteractFSM(player);

  // Vitality: UNDEPLOYED -> ALIVE -> IN_VEHICLE -> DOWNED_BLEEDING_OUT -> DEAD_AWAITING_RESPAWN -> UNDEPLOYED
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.ALIVE), true);
  assert.equal(player.dead, false);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.IN_VEHICLE), true);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT), true);
  assert.equal(player.downed, true);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN), true);
  assert.equal(player.dead, true);
  assert.equal(player.downed, false);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.UNDEPLOYED), true);

  // Stance: STANDING -> CROUCHING -> PRONE -> SPRINTING -> VEHICLE_SEATED -> STANDING
  assert.equal(stance.transition(PLAYER_STANCE_STATES.CROUCHING), true);
  assert.equal(player.crouching, true);
  assert.equal(player.prone, false);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.PRONE), true);
  assert.equal(player.prone, true);
  assert.equal(player.crouching, false);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.SPRINTING), true);
  assert.equal(player.prone, false);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.VEHICLE_SEATED), true);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.STANDING), true);

  // Weapon: READY -> SLOW_MAG_PACK -> TACTICAL_RELOAD -> READY -> DISABLED -> READY
  player.slowReloading = true;
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.SLOW_MAG_PACK), true);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.TACTICAL_RELOAD), true);
  assert.equal(player.slowReloading, false);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.READY), true);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.DISABLED), true);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.READY), true);

  // Interact: IDLE -> HOLDING_ENEMY_LOOT -> MANUAL_LOOT_MODAL_OPEN -> IDLE
  assert.equal(interact.transition(PLAYER_INTERACT_STATES.HOLDING_ENEMY_LOOT), true);
  assert.equal(interact.transition(PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN), true);
  assert.equal(interact.transition(PLAYER_INTERACT_STATES.IDLE), true);
});

test('Rank #4 PlayerVitality/Stance/Weapon/Interact FSMs: reject illegal jumps that wildcard transitions previously allowed', () => {
  const player = { dead: true, downed: false };
  const vitality = createPlayerVitalityFSM(player);
  const stance = createPlayerStanceFSM(player);
  const weapon = createPlayerWeaponFSM(player);
  const interact = createPlayerInteractFSM(player);

  // Cannot jump from UNDEPLOYED directly to DOWNED_BLEEDING_OUT or DEAD_AWAITING_RESPAWN
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT), false);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.DEAD_AWAITING_RESPAWN), false);

  // Downed player cannot board a vehicle (DOWNED_BLEEDING_OUT -> IN_VEHICLE rejected)
  vitality.transition(PLAYER_VITALITY_STATES.ALIVE);
  vitality.transition(PLAYER_VITALITY_STATES.DOWNED_BLEEDING_OUT);
  assert.equal(vitality.transition(PLAYER_VITALITY_STATES.IN_VEHICLE), false);

  // Incapacitated stance cannot jump straight to SPRINTING or VEHICLE_SEATED
  stance.transition(PLAYER_STANCE_STATES.INCAPACITATED);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.SPRINTING), false);
  assert.equal(stance.transition(PLAYER_STANCE_STATES.VEHICLE_SEATED), false);

  // Disabled weapon cannot jump straight to FIRING or TACTICAL_RELOAD without returning to READY
  weapon.transition(PLAYER_WEAPON_STATES.DISABLED);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.FIRING), false);
  assert.equal(weapon.transition(PLAYER_WEAPON_STATES.TACTICAL_RELOAD), false);

  // Holding revive cannot jump directly into MANUAL_LOOT_MODAL_OPEN
  interact.transition(PLAYER_INTERACT_STATES.HOLDING_REVIVE);
  assert.equal(interact.transition(PLAYER_INTERACT_STATES.MANUAL_LOOT_MODAL_OPEN), false);
});

// ============================================================================
// 5. RANK #5 — NetworkTransportFSM Tests
// ============================================================================
test('Rank #5 NetworkTransportFSM: covers every valid transition across Singleplayer, WS, and HTTP Fallback', () => {
  const net = {
    gameMode: 'SINGLEPLAYER',
    wsConnected: false,
    httpSyncInFlight: false,
    _syncEpoch: 1
  };
  const fsm = createNetworkTransportFSM(net);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER);

  // 1. OFFLINE_SINGLEPLAYER -> MP_WS_CONNECTING -> MP_WS_CONNECTED -> MP_HTTP_SYNC_IN_FLIGHT -> MP_WS_CONNECTED
  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_WS_CONNECTING);
  assert.equal(net.gameMode, 'MULTIPLAYER');

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.WS_OPEN), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED);
  assert.equal(net.wsConnected, true);

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_HTTP_SYNC_IN_FLIGHT);
  assert.equal(net.httpSyncInFlight, true);

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_WS), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_WS_CONNECTED);
  assert.equal(net.httpSyncInFlight, false);

  // 2. MP_WS_CONNECTED -> MP_HTTP_FALLBACK_IDLE -> MP_HTTP_SYNC_IN_FLIGHT -> MP_HTTP_FALLBACK_IDLE -> OFFLINE_SINGLEPLAYER
  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE);
  assert.equal(net.wsConnected, false);

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START), true);
  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_FALLBACK), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.MP_HTTP_FALLBACK_IDLE);

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.DISABLE_MP), true);
  assert.equal(fsm.state, NETWORK_TRANSPORT_STATES.OFFLINE_SINGLEPLAYER);
  assert.equal(net.gameMode, 'SINGLEPLAYER');
});

test('Rank #5 NetworkTransportFSM: rejects HTTP_SYNC_START in OFFLINE_SINGLEPLAYER and increments _syncEpoch on mode switch', () => {
  const net = {
    gameMode: 'SINGLEPLAYER',
    wsConnected: false,
    httpSyncInFlight: false,
    _syncEpoch: 1
  };
  const fsm = createNetworkTransportFSM(net);

  // Cannot start HTTP multiplayer sync while in OFFLINE_SINGLEPLAYER
  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START), false);
  assert.equal(fsm.rejectedCount, 1);

  // Switching to MP, starting an in-flight HTTP request, and switching back to SINGLEPLAYER mid-flight
  // cancels httpSyncInFlight and increments _syncEpoch so the stale response is ignored
  fsm.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP_HTTP_FALLBACK);
  const epochDuringFlight = net._syncEpoch;
  fsm.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START);
  assert.equal(net.httpSyncInFlight, true);

  assert.equal(fsm.send(NETWORK_TRANSPORT_EVENTS.DISABLE_MP), true);
  assert.equal(net.gameMode, 'SINGLEPLAYER');
  assert.equal(net.httpSyncInFlight, false);
  assert.equal(net._syncEpoch > epochDuringFlight, true);
});

// ============================================================================
// 6. RANK #6 — MedicRescueFSM Tests
// ============================================================================
test('Rank #6 MedicRescueFSM: covers every valid transition (IDLE -> ASSESS_THREAT -> APPROACH -> DRAG -> REVIVE -> IDLE)', () => {
  const medic = { id: 'medic_1', name: 'Medic_1', role: 'MEDIC', dead: false, downed: false };
  const casualty = { id: 'rifle_1', name: 'Rifle_1', dead: false, downed: true, rescuer: null };
  const fsm = createMedicRescueFSM(medic);

  assert.equal(fsm.state, MEDIC_RESCUE_STATES.IDLE);

  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY, { target: casualty }), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.ASSESS_THREAT);
  assert.equal(medic.rescueTarget, casualty);
  assert.equal(casualty.rescuer, medic);

  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.APPROACH);

  // Ambush reassessment returns to ASSESS_THREAT then back to APPROACH
  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.AMBUSH_REASSESS), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.ASSESS_THREAT);
  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH), true);

  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.REACHED_CASUALTY_DRAG), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.DRAG);

  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.REVIVE);

  assert.equal(fsm.send(MEDIC_RESCUE_EVENTS.COMPLETE_REVIVE), true);
  assert.equal(fsm.state, MEDIC_RESCUE_STATES.IDLE);
  assert.equal(medic.rescueTarget, null);
  assert.equal(casualty.rescuer, null);
});

test('Rank #6 MedicRescueFSM: rejects skipping ASSESS_THREAT/APPROACH and eliminates dual-medic drag / postRevive desync', () => {
  const riflemanRescuer = { id: 'bot_a', name: 'Bot_A', role: 'ASSAULT', dead: false, downed: false };
  const dedicatedMedic = { id: 'bot_b', name: 'Bot_B', role: 'MEDIC', dead: false, downed: false };
  const casualty = { id: 'bot_c', name: 'Bot_C', dead: false, downed: true, rescuer: null };

  const fsmA = createMedicRescueFSM(riflemanRescuer);
  const fsmB = createMedicRescueFSM(dedicatedMedic);

  // Cannot jump directly from IDLE to DRAG or REVIVE
  assert.equal(fsmA.send(MEDIC_RESCUE_EVENTS.REACHED_CASUALTY_DRAG), false);
  assert.equal(fsmA.send(MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE), false);
  assert.equal(fsmA.rejectedCount, 2);

  // When dedicatedMedic claims a casualty already claimed by riflemanRescuer, riflemanRescuer is atomically aborted to IDLE
  fsmA.send(MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY, { target: casualty });
  assert.equal(casualty.rescuer, riflemanRescuer);

  fsmB.send(MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY, { target: casualty });
  assert.equal(casualty.rescuer, dedicatedMedic);
  assert.equal(fsmA.state, MEDIC_RESCUE_STATES.IDLE);
  assert.equal(riflemanRescuer.rescueTarget, null);
  assert.equal(riflemanRescuer.rescueState, null);

  // If dedicatedMedic has postReviveTimer > 0 (still getting up off the ground), syncBotStateMachine aborts any rescue
  dedicatedMedic.postReviveTimer = 1.5;
  syncBotStateMachine(dedicatedMedic);
  assert.equal(fsmB.state, MEDIC_RESCUE_STATES.IDLE);
  assert.equal(dedicatedMedic.rescueTarget, null);
  assert.equal(casualty.rescuer, null);
});

// ============================================================================
// 7. RANK #7 — CommanderUavFSM & CommanderAirstrikeFSM Tests
// ============================================================================
test('Rank #7 CommanderUavFSM & CommanderAirstrikeFSM: cover all valid transitions and automatically dispose 3D meshes', () => {
  const removedMeshes = [];
  const player = {
    scene: {
      remove(m) {
        removedMeshes.push(m);
      }
    },
    uavActive: false,
    uavTimer: 0,
    uavDroneMesh: { id: 'drone_1' },
    uavSweepRingMesh: { id: 'sweep_1' },
    airstrikeTarget: null
  };

  const uavFsm = createCommanderUavFSM(player);
  const strikeFsm = createCommanderAirstrikeFSM(player);

  // UAV_READY -> UAV_ACTIVE_ORBIT -> UAV_COOLDOWN -> UAV_READY
  player.uavDroneMesh = { id: 'drone_active' };
  player.uavSweepRingMesh = { id: 'sweep_active' };
  assert.equal(uavFsm.send(COMMANDER_UAV_EVENTS.CALL_UAV), true);
  assert.equal(uavFsm.state, COMMANDER_UAV_STATES.UAV_ACTIVE_ORBIT);
  assert.equal(player.uavActive, true);

  assert.equal(uavFsm.send(COMMANDER_UAV_EVENTS.SCAN_EXPIRED), true);
  assert.equal(uavFsm.state, COMMANDER_UAV_STATES.UAV_COOLDOWN);
  assert.equal(player.uavActive, false);
  assert.equal(player.uavDroneMesh, null);
  assert.equal(player.uavSweepRingMesh, null);
  assert.equal(removedMeshes.length, 2);

  assert.equal(uavFsm.send(COMMANDER_UAV_EVENTS.COOLDOWN_DONE), true);
  assert.equal(uavFsm.state, COMMANDER_UAV_STATES.UAV_READY);

  // STRIKE_READY -> TARGET_DESIGNATED_WARNING -> BARRAGE_DROPPING -> STRIKE_COOLDOWN -> STRIKE_READY
  const markerGroup = { id: 'strike_markers' };
  player.airstrikeTarget = { markers: markerGroup, timer: 2.4 };
  assert.equal(strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET), true);
  assert.equal(strikeFsm.state, COMMANDER_AIRSTRIKE_STATES.TARGET_DESIGNATED_WARNING);

  assert.equal(strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.RELEASE_BARRAGE), true);
  assert.equal(strikeFsm.state, COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING);
  assert.equal(player.airstrikeTarget, null);
  assert.equal(removedMeshes.includes(markerGroup), true);

  assert.equal(strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.BARRAGE_COMPLETE), true);
  assert.equal(strikeFsm.state, COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN);

  assert.equal(strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.COOLDOWN_DONE), true);
  assert.equal(strikeFsm.state, COMMANDER_AIRSTRIKE_STATES.STRIKE_READY);
});

test('Rank #7 CommanderUavFSM & CommanderAirstrikeFSM: reject CALL_UAV/DESIGNATE_TARGET while on cooldown', () => {
  const player = { scene: { remove() {} } };
  const uavFsm = createCommanderUavFSM(player);
  const strikeFsm = createCommanderAirstrikeFSM(player);

  uavFsm.send(COMMANDER_UAV_EVENTS.CALL_UAV);
  uavFsm.send(COMMANDER_UAV_EVENTS.SCAN_EXPIRED);
  assert.equal(uavFsm.state, COMMANDER_UAV_STATES.UAV_COOLDOWN);
  assert.equal(uavFsm.send(COMMANDER_UAV_EVENTS.CALL_UAV), false);

  strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET);
  strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.RELEASE_BARRAGE);
  strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.BARRAGE_COMPLETE);
  assert.equal(strikeFsm.state, COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN);
  assert.equal(strikeFsm.send(COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET), false);
});

// ============================================================================
// 8. RANK #8 — VehicleSubsystemsFSM (Countermeasure & Coaxial Thermal) Tests
// ============================================================================
test('Rank #8 VehicleSubsystemsFSM: covers CM and Coax Thermal transitions and eliminates permanent coax jam / active-without-cooldown', () => {
  const tank = {
    id: 'm1a2_us',
    flareActiveTimer: 0,
    flareCooldown: 0,
    coaxHeat: 0,
    coaxOverheated: false
  };

  const { cmFSM, thermalFSM } = createVehicleSubsystemsFSM(tank);
  assert.equal(cmFSM.state, VEHICLE_CM_STATES.CM_READY);
  assert.equal(thermalFSM.state, VEHICLE_THERMAL_STATES.THERMAL_NORMAL);

  // Rejects ACTIVE_EXPIRED while CM_READY
  assert.equal(cmFSM.send(VEHICLE_CM_EVENTS.ACTIVE_EXPIRED), false);

  // If flareActiveTimer > 0 but flareCooldown was 0, syncVehicleSubsystemsFSM enforces flareCooldown >= flareActiveTimer
  tank.flareActiveTimer = 4.5;
  tank.flareCooldown = 0;
  syncVehicleSubsystemsFSM(tank);
  assert.equal(cmFSM.state, VEHICLE_CM_STATES.CM_ACTIVE);
  assert.equal(tank.flareCooldown, 4.5);

  tank.flareActiveTimer = 0;
  syncVehicleSubsystemsFSM(tank);
  assert.equal(cmFSM.state, VEHICLE_CM_STATES.CM_RECHARGING);

  tank.flareCooldown = 0;
  syncVehicleSubsystemsFSM(tank);
  assert.equal(cmFSM.state, VEHICLE_CM_STATES.CM_READY);

  // Coax thermal: heat >= 1.0 trips THERMAL_OVERHEATED_LOCKOUT; heat <= 0.15 clears coaxOverheated
  tank.coaxHeat = 1.0;
  syncVehicleSubsystemsFSM(tank);
  assert.equal(thermalFSM.state, VEHICLE_THERMAL_STATES.THERMAL_OVERHEATED_LOCKOUT);
  assert.equal(tank.coaxOverheated, true);

  // Bug class: if coaxHeat was reset to 0 while coaxOverheated remained true, syncVehicleSubsystemsFSM unjams it
  tank.coaxHeat = 0;
  syncVehicleSubsystemsFSM(tank);
  assert.equal(thermalFSM.state, VEHICLE_THERMAL_STATES.THERMAL_NORMAL);
  assert.equal(tank.coaxOverheated, false);
});

// ============================================================================
// 9. RANK #9 — TargetLockScannerFSM Tests
// ============================================================================
test('Rank #9 TargetLockScannerFSM: covers IDLE_NO_LOCK -> LOCKING_ACQUIRING -> LOCKED_SOLID_TONE -> LOST_TARGET and eliminates orphan lock progress', () => {
  const player = {
    aircraftLockTarget: null,
    aircraftLockProgress: 0
  };
  const jetA = { id: 'su57_1', isAircraft: true, dead: false, isShotDown: false, flareActiveTimer: 0 };
  const jetB = { id: 'su34_1', isAircraft: true, dead: false, isShotDown: false, flareActiveTimer: 0 };

  const fsm = createTargetLockScannerFSM(player);
  assert.equal(fsm.state, TARGET_LOCK_STATES.IDLE_NO_LOCK);

  // Cannot jump from IDLE_NO_LOCK directly to LOCKED_SOLID_TONE without acquiring first
  assert.equal(fsm.send(TARGET_LOCK_EVENTS.LOCK_COMPLETE), false);

  // Acquire jetA -> progress to 1.0 -> LOCKED_SOLID_TONE
  updateTargetLockScanner(player, jetA, 0.1, 1.5);
  assert.equal(fsm.state, TARGET_LOCK_STATES.LOCKING_ACQUIRING);
  assert.equal(player.aircraftLockTarget, jetA);
  assert.equal(player.aircraftLockProgress, 0.25);

  updateTargetLockScanner(player, jetA, 0.6, 1.5);
  assert.equal(fsm.state, TARGET_LOCK_STATES.LOCKED_SOLID_TONE);
  assert.equal(player.aircraftLockProgress, 1.0);

  // Switching to jetB resets progress to 0.25 in LOCKING_ACQUIRING
  updateTargetLockScanner(player, jetB, 0.1, 1.5);
  assert.equal(fsm.state, TARGET_LOCK_STATES.LOCKING_ACQUIRING);
  assert.equal(player.aircraftLockTarget, jetB);
  assert.equal(player.aircraftLockProgress, 0.25);

  // If jetB is shot down (entered Mayday spiral) or pops flares, lock is immediately dropped and aircraftLockProgress is 0 (never > 0 with null target!)
  jetB.isShotDown = true;
  updateTargetLockScanner(player, jetB, 0.1, 1.5);
  assert.equal(fsm.state, TARGET_LOCK_STATES.IDLE_NO_LOCK);
  assert.equal(player.aircraftLockTarget, null);
  assert.equal(player.aircraftLockProgress, 0);
});

// ============================================================================
// 10. RANK #10 — ArmoryCaseRouletteFSM Tests
// ============================================================================
test('Rank #10 ArmoryCaseRouletteFSM: covers CASE_IDLE -> CASE_ROLLING_SPIN -> CASE_REWARD_REVEALED -> CASE_IDLE and rejects overlapping spins', () => {
  const ui = {
    _isRouletteSpinning: false,
    _playRouletteSpinNextRender: false,
    _rouletteSpinStart: null,
    _rouletteRafId: null,
    _lastCaseReward: null,
    player: {
      lastCaseResult: {
        reward: { id: 'karambit_gold', fullName: '★ Karambit | 24K Gold' }
      }
    }
  };
  const fsm = createArmoryCaseRouletteFSM(ui);
  assert.equal(fsm.state, ARMORY_CASE_STATES.CASE_IDLE);

  // Rejects COMPLETE_SPIN while CASE_IDLE
  assert.equal(fsm.send(ARMORY_CASE_EVENTS.COMPLETE_SPIN), false);
  assert.equal(fsm.rejectedCount, 1);

  // Start spin
  assert.equal(fsm.send(ARMORY_CASE_EVENTS.START_SPIN, { deferRender: true, spinStart: 1000 }), true);
  assert.equal(fsm.state, ARMORY_CASE_STATES.CASE_ROLLING_SPIN);
  assert.equal(ui._isRouletteSpinning, true);
  assert.equal(ui._playRouletteSpinNextRender, true);
  assert.equal(ui._rouletteSpinStart, 1000);

  // Rejects overlapping START_SPIN while already spinning
  assert.equal(fsm.send(ARMORY_CASE_EVENTS.START_SPIN), false);
  assert.equal(fsm.rejectedCount, 2);

  // Complete spin -> CASE_REWARD_REVEALED
  ui._rouletteRafId = 42;
  assert.equal(
    fsm.send(ARMORY_CASE_EVENTS.COMPLETE_SPIN, {
      reward: ui.player.lastCaseResult.reward
    }),
    true
  );
  assert.equal(fsm.state, ARMORY_CASE_STATES.CASE_REWARD_REVEALED);
  assert.equal(ui._isRouletteSpinning, false);
  assert.equal(ui._rouletteRafId, null);
  assert.equal(ui._lastCaseReward.id, 'karambit_gold');

  // Start a new spin from CASE_REWARD_REVEALED -> abort mid-spin (e.g. closing modal) -> CASE_IDLE
  assert.equal(fsm.send(ARMORY_CASE_EVENTS.START_SPIN, { spinStart: 2000 }), true);
  assert.equal(fsm.state, ARMORY_CASE_STATES.CASE_ROLLING_SPIN);
  assert.equal(ui._lastCaseReward, null);
  ui._rouletteRafId = 99;

  assert.equal(fsm.send(ARMORY_CASE_EVENTS.ABORT_SPIN), true);
  assert.equal(fsm.state, ARMORY_CASE_STATES.CASE_IDLE);
  assert.equal(ui._isRouletteSpinning, false);
  assert.equal(ui._rouletteRafId, null);
  assert.equal(ui._rouletteSpinStart, null);
});

// ============================================================================
// 11. RANK #11 — SquadDeployablesFSM (Rally Point & Insertion Beacon) Tests
// ============================================================================
test('Rank #11 SquadDeployablesFSM: covers DEPLOYABLE_READY -> DEPLOYABLE_ACTIVE -> DEPLOYABLE_COOLDOWN -> DEPLOYABLE_READY and disposes 3D meshes on depletion/expiry', () => {
  const removedMeshes = [];
  const player = {
    scene: {
      remove(m) {
        removedMeshes.push(m);
      }
    },
    rallyPoint: null,
    rallyCooldown: 0,
    insertionBeacon: null,
    beaconCooldown: 0
  };

  const { rallyFSM, beaconFSM } = createSquadDeployablesFSM(player);
  assert.equal(rallyFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_READY);
  assert.equal(beaconFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_READY);

  // Rejects EXPIRE_OR_DESTROY and DEPLETE_SPAWNS when DEPLOYABLE_READY
  assert.equal(rallyFSM.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY), false);
  assert.equal(beaconFSM.send(DEPLOYABLE_EVENTS.DEPLETE_SPAWNS), false);

  // Place Rally Point & Insertion Beacon
  const rallyMesh = { id: 'rally_mesh_1' };
  const beaconMesh = { id: 'beacon_mesh_1' };
  player.rallyPoint = { mesh: rallyMesh, timer: 120 };
  player.rallyCooldown = 90;
  player.insertionBeacon = { mesh: beaconMesh, spawnsLeft: 2, timer: 180 };
  player.beaconCooldown = 45;

  syncSquadDeployablesFSM(player);
  assert.equal(rallyFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE);
  assert.equal(beaconFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_ACTIVE);

  // Bug class eliminated: if insertionBeacon.spawnsLeft reaches 0, syncSquadDeployablesFSM automatically removes its 3D mesh and clears insertionBeacon to null!
  player.insertionBeacon.spawnsLeft = 0;
  syncSquadDeployablesFSM(player);
  assert.equal(beaconFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN);
  assert.equal(player.insertionBeacon, null);
  assert.equal(removedMeshes.includes(beaconMesh), true);

  // Cooldown finishes -> DEPLOYABLE_READY
  player.beaconCooldown = 0;
  syncSquadDeployablesFSM(player);
  assert.equal(beaconFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_READY);

  // Rally timer expires -> removes rallyMesh and transitions to DEPLOYABLE_COOLDOWN -> DEPLOYABLE_READY
  player.rallyPoint.timer = 0;
  syncSquadDeployablesFSM(player);
  assert.equal(rallyFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_COOLDOWN);
  assert.equal(player.rallyPoint, null);
  assert.equal(removedMeshes.includes(rallyMesh), true);

  player.rallyCooldown = 0;
  syncSquadDeployablesFSM(player);
  assert.equal(rallyFSM.state, DEPLOYABLE_STATES.DEPLOYABLE_READY);
});

// ============================================================================
// 12. RANK #12 — BaseProtectionFSM Tests
// ============================================================================
test('Rank #12 BaseProtectionFSM: covers BASE_SAFE <-> BASE_INTRUDER_DEFENDED <-> BASE_CONTESTED_LOCKED and eliminates contested-with-defenders desync', () => {
  const usBase = {
    contested: false,
    defenders: 4,
    attackers: 0,
    playerPresent: false
  };
  const fsm = createBaseProtectionFSM(usBase, 'US');
  assert.equal(fsm.state, BASE_PROTECTION_STATES.BASE_SAFE);
  assert.equal(usBase.contested, false);

  // Attackers enter while defenders are still alive -> BASE_INTRUDER_DEFENDED (NOT contested!)
  usBase.attackers = 2;
  usBase.defenders = 3;
  usBase.contested = true; // Even if someone wrongly mutated contested=true while defenders > 0:
  syncBaseProtectionFSM(usBase, 'US');
  assert.equal(fsm.state, BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED);
  assert.equal(usBase.contested, false);

  // All defenders eliminated while attackers remain -> BASE_CONTESTED_LOCKED (contested === true)
  usBase.defenders = 0;
  usBase.attackers = 2;
  syncBaseProtectionFSM(usBase, 'US');
  assert.equal(fsm.state, BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED);
  assert.equal(usBase.contested, true);

  // Friendly defender enters perimeter -> BASE_INTRUDER_DEFENDED (unlocks base)
  usBase.defenders = 1;
  syncBaseProtectionFSM(usBase, 'US');
  assert.equal(fsm.state, BASE_PROTECTION_STATES.BASE_INTRUDER_DEFENDED);
  assert.equal(usBase.contested, false);

  // Attackers eliminated -> BASE_SAFE
  usBase.attackers = 0;
  syncBaseProtectionFSM(usBase, 'US');
  assert.equal(fsm.state, BASE_PROTECTION_STATES.BASE_SAFE);
  assert.equal(usBase.contested, false);
});

// ============================================================================
// 13. UNIFIED COORDINATOR — GameStateMachineRegistry Invariants & Snapshot Test
// ============================================================================
test('GameStateMachineRegistry: synchronizes all 12 state machine families and verifies zero invariant violations', () => {
  const game = {
    matchEnded: false,
    ui: {
      deployScreenEl: { classList: { contains: () => true }, style: { display: 'none' } },
      victoryScreenEl: { classList: { contains: () => true }, style: { display: 'none' } }
    },
    player: {
      dead: false,
      downed: false,
      crouching: false,
      prone: false,
      isGrounded: true,
      reloading: false,
      slowReloading: false,
      isFiring: false,
      parachuting: false,
      parachuteCut: false,
      aircraftLockTarget: null,
      aircraftLockProgress: 0,
      rallyPoint: null,
      rallyCooldown: 0,
      insertionBeacon: null,
      beaconCooldown: 0
    },
    world: {
      flags: [
        { id: 'A', owner: 'US', captureProgress: 100, contested: false, defenseStage: 2 },
        { id: 'C', owner: 'NEUTRAL', captureProgress: 0, contested: false, defenseStage: 0 }
      ]
    },
    botManager: {
      bots: [
        { id: 'us_1', name: 'SgtOkiDoki', team: 'US', role: 'MEDIC', dead: false, downed: false }
      ],
      baseState: {
        US: { contested: false, defenders: 5, attackers: 0, playerPresent: false },
        RU: { contested: false, defenders: 0, attackers: 2, playerPresent: true }
      }
    },
    vehicleManager: {
      vehicles: [
        {
          id: 'f15_1',
          isAircraft: true,
          dead: false,
          isShotDown: false,
          isStalling: false,
          aiPilotActive: true,
          pos: { y: 80 },
          forwardSpeed: 120
        },
        {
          id: 'm1a2_1',
          isAircraft: false,
          dead: false,
          driver: null,
          npcDriver: null,
          coaxHeat: 0,
          coaxOverheated: false
        }
      ]
    }
  };

  const registry = new GameStateMachineRegistry(game);
  const snapshot = registry.getSnapshot();

  assert.equal(snapshot.invariants.valid, true);
  assert.equal(snapshot.invariants.violations.length, 0);
  assert.equal(snapshot.baseProtection.US.state, BASE_PROTECTION_STATES.BASE_SAFE);
  assert.equal(snapshot.baseProtection.RU.state, BASE_PROTECTION_STATES.BASE_CONTESTED_LOCKED);
  assert.equal(snapshot.vehiclesSummary.aircraftFlight[AIRCRAFT_FLIGHT_STATES.AIRBORNE_CRUISE], 1);
  assert.equal(
    snapshot.vehiclesSummary.groundOccupancy[GROUND_VEHICLE_STATES.PARKED_UNOCCUPIED],
    1
  );
});








