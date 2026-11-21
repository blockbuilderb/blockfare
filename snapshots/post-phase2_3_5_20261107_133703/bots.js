export { BotManager, SQUAD_DEFS } from './bots/BotManager.js?v=35';
export { createSoldierMesh } from './bots/SoldierMeshFactory.js?v=35';
export { SightlineMethods, hasClearSightline, canBotSeeTarget, isPointBlocked } from './bots/SightlineSystem.js?v=35';
export {
  MedicAIMethods,
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findNearestDownedFriendly,
  updateMedicRescue
} from './bots/MedicAI.js?v=35';
export {
  BotAIMethods,
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
} from './bots/BotAI.js?v=35';
