// ============================================================================
// WEAPONS BARREL MODULE (src/weapons.js)
// Re-exports weapon definitions, class loadouts, gunsmith attachment catalog,
// and the 3D first-person weapon model builder from their dedicated folders:
//   - Weapon & Loadout Data: src/assets/weapon-defs.js
//   - Attachment & Armory Data: src/assets/attachment-defs.js
//   - 3D Weapon View Model: src/models/weapon-model.js
// ============================================================================

export {
  WEAPON_DEFS,
  ALL_MODERN_ROLES,
  WEAPON_CATEGORIES,
  PRIMARY_WEAPON_CATEGORIES,
  SECONDARY_WEAPON_CATEGORIES,
  getWeaponCategory,
  SHOTGUN_SHELL_TYPES,
  CLASS_LOADOUTS,
  CASE_PRICE,
  CASE_GOLD_CHANCE,
  CASE_GUN_POOL,
  GOLD_SPECIAL_POOL
} from './assets/weapon-defs.js?v=150';
export { ATTACHMENT_CATALOG } from './assets/attachment-defs.js?v=150';
export {
  createWeaponViewModel,
  getWeaponHipOffsetX,
  updateFirstPersonArmShoulders
} from './models/weapon-model.js?v=150';
