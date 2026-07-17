import os from "os";

/**
 * Tokenize a command-line string using Windows argv-parsing rules (CommandLineToArgvW).
 */
export function splitWindowsCommand(s) {
  const args = [];
  let current = [];
  let inQuotes = false;
  let started = false;
  let i = 0;
  const n = s.length;

  while (i < n) {
    const c = s[i];
    if ((c === " " || c === "\t") && !inQuotes) {
      if (started) {
        args.push(current.join(""));
        current = [];
        started = false;
      }
      i++;
      continue;
    }

    started = true;
    if (c === "\\") {
      let j = i;
      while (j < n && s[j] === "\\") {
        j++;
      }
      const numBackslashes = j - i;
      if (j < n && s[j] === '"') {
        current.push("\\".repeat(Math.floor(numBackslashes / 2)));
        if (numBackslashes % 2 === 1) {
          current.push('"');
        } else {
          inQuotes = !inQuotes;
        }
        i = j + 1;
      } else {
        current.push("\\".repeat(numBackslashes));
        i = j;
      }
    } else if (c === '"') {
      if (inQuotes && i + 1 < n && s[i + 1] === '"') {
        current.push('"');
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else {
      current.push(c);
      i++;
    }
  }

  if (started) {
    args.push(current.join(""));
  }
  return args;
}

/**
 * Tokenize a command-line string using POSIX shell rules.
 */
export function splitPosixCommand(s) {
  const args = [];
  let current = [];
  let inDoubleQuotes = false;
  let inSingleQuotes = false;
  let escaped = false;
  let started = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (escaped) {
      current.push(c);
      escaped = false;
      continue;
    }

    if (c === "\\" && !inSingleQuotes) {
      escaped = true;
      started = true;
      continue;
    }

    if (c === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      started = true;
      continue;
    }

    if (c === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      started = true;
      continue;
    }

    if ((c === " " || c === "\t") && !inSingleQuotes && !inDoubleQuotes) {
      if (started) {
        args.push(current.join(""));
        current = [];
        started = false;
      }
      continue;
    }

    started = true;
    current.push(c);
  }

  if (started) {
    args.push(current.join(""));
  }
  return args;
}

export function splitCommandString(command) {
  const isWin = os.platform() === "win32";
  if (isWin) {
    return splitWindowsCommand(command);
  }
  return splitPosixCommand(command);
}

/**
 * Normalizes and validates the command input, converting it into a canonical string array.
 */
export function serializeCommand(command, isShell = false) {
  if (typeof command === "string") {
    if (!command.trim()) {
      throw new Error("Command must not be empty");
    }
    if (isShell) {
      // Shell mode keeps the command as a single-element array
      return [command];
    }
    const argv = splitCommandString(command);
    if (!argv || argv.length === 0) {
      throw new Error("Command must not be empty");
    }
    return argv;
  } else if (Array.isArray(command)) {
    if (isShell) {
      throw new Error("Shell mode requires the command to be a single string");
    }
    if (command.length === 0 || !command.every((p) => typeof p === "string" && p.trim())) {
      throw new Error("command list must be non-empty with non-empty string parts");
    }
    return command;
  }
  throw new Error("Command must be a string or an array of strings");
}
