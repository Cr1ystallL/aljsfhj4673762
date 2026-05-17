import { CrashGameEngine } from '../games/crash/crash-engine.js';
import { GameRoomManager } from './game-room-manager.js';

/**
 * Crash room singleton.
 *
 * Both the public game routes and the admin "Restart engine" action
 * need to talk to the same room manager. Hoist it here so neither side
 * carries module-level state the other can't see.
 */
export const crashManager = new GameRoomManager('crash');

let mainEngine = new CrashGameEngine('crash_main');
mainEngine.start();
crashManager.createRoom('crash_main', mainEngine);

/**
 * Restart the crash engine without bouncing the whole Node process.
 * Stops the current room (in-flight rounds are dropped — admin should
 * use this only when the engine is stuck) and spins up a fresh one.
 */
export function restartCrashEngine(): void {
  // GameRoomManager.deleteRoom already calls engine.stop() and removes
  // event listeners cleanly.
  try {
    crashManager.deleteRoom('crash_main');
  } catch {
    // ignore — the room may not exist anymore
  }
  mainEngine = new CrashGameEngine('crash_main');
  mainEngine.start();
  crashManager.createRoom('crash_main', mainEngine);
}
