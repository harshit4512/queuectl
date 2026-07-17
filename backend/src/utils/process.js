/**
 * Check if a local process ID is currently running.
 * Employs kill(pid, 0) logic: returns true if running (or if permission is denied,
 * which implies it exists), false if lookup fails.
 */
export function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH means process was not found. EPERM means we don't have permission to signal it,
    // which still indicates it exists.
    return err.code === "EPERM";
  }
}
