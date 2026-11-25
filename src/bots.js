export {
  BotManager,
  SQUAD_DEFS,
  SQUAD_9MAN_ROSTERS,
  evaluateCatastrophicKill
} from './bots/BotManager.js?v=123';
export {
  createSoldierMesh,
  updateSoldierEquippedWeapon,
  getDefaultWeaponIdForRole
} from './bots/SoldierMeshFactory.js?v=123';
export { SightlineMethods, hasClearSightline, canBotSeeTarget, isPointBlocked } from './bots/SightlineSystem.js?v=123';
export {
  MedicAIMethods,
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findNearestDownedFriendly,
  updateMedicRescue
} from './bots/MedicAI.js?v=123';
export {
  BotAIMethods,
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
} from './bots/BotAI.js?v=123';
