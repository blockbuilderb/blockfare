export {
  BotManager,
  SQUAD_DEFS,
  SQUAD_9MAN_ROSTERS,
  evaluateCatastrophicKill
} from './bots/BotManager.js?v=141';
export {
  createSoldierMesh,
  updateSoldierEquippedWeapon,
  getDefaultWeaponIdForRole
} from './bots/SoldierMeshFactory.js?v=141';
export { SightlineMethods, hasClearSightline, canBotSeeTarget, isPointBlocked } from './bots/SightlineSystem.js?v=141';
export {
  MedicAIMethods,
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findNearestDownedFriendly,
  updateMedicRescue
} from './bots/MedicAI.js?v=141';
export {
  BotAIMethods,
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
} from './bots/BotAI.js?v=141';
