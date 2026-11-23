export { BotManager, SQUAD_DEFS } from './bots/BotManager.js?v=117';
export {
  createSoldierMesh,
  updateSoldierEquippedWeapon,
  getDefaultWeaponIdForRole
} from './bots/SoldierMeshFactory.js?v=117';
export { SightlineMethods, hasClearSightline, canBotSeeTarget, isPointBlocked } from './bots/SightlineSystem.js?v=117';
export {
  MedicAIMethods,
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findNearestDownedFriendly,
  updateMedicRescue
} from './bots/MedicAI.js?v=117';
export {
  BotAIMethods,
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
} from './bots/BotAI.js?v=117';
