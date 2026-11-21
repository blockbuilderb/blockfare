/**
 * Centralized EventBus for decoupling game subsystems (Player, Bots, World, Vehicles, UI, Network, Telemetry).
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} Unsubscribe function
   */
  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  /**
   * Unsubscribe a listener from an event.
   * @param {string} event
   * @param {Function} fn
   */
  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Subscribe to an event once.
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} Unsubscribe function
   */
  once(event, fn) {
    if (typeof fn !== 'function') return () => {};
    const wrapper = (data, ...rest) => {
      this.off(event, wrapper);
      fn(data, ...rest);
    };
    return this.on(event, wrapper);
  }

  /**
   * Emit an event with payload data.
   * @param {string} event
   * @param {*} data
   * @param {...*} rest
   */
  emit(event, data, ...rest) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      fn(data, ...rest);
    }
  }

  /**
   * Clear all listeners (or listeners for a specific event).
   * @param {string} [event]
   */
  clear(event) {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

export const events = new EventBus();

/**
 * Creates a backwards-compatible callback bridge function that delegates to `events.emit(eventName, ...)`.
 * Tagged with `_isEventsBridge = true` so subsystems that emit directly via `events.emit(...)`
 * can avoid double-firing when also checking legacy `onX` properties or passed callback functions.
 *
 * @param {string} eventName
 * @param {Function} [mapArgs]
 * @returns {Function}
 */
export function makeEventBridge(eventName, mapArgs) {
  const fn = (...args) => {
    const payload = mapArgs ? mapArgs(...args) : args[0];
    events.emit(eventName, payload, ...args);
  };
  fn._isEventsBridge = true;
  return fn;
}

export default events;
