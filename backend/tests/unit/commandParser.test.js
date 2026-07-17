import {
  serializeCommand,
  splitWindowsCommand,
  splitPosixCommand,
} from "../../src/utils/commandParser.js";

describe("commandParser", () => {
  describe("splitPosixCommand", () => {
    test("basic whitespace split", () => {
      expect(splitPosixCommand("echo hello world")).toEqual(["echo", "hello", "world"]);
    });

    test("double-quoted argument with spaces", () => {
      expect(splitPosixCommand('echo "hello world"')).toEqual(["echo", "hello world"]);
    });

    test("single-quoted argument", () => {
      expect(splitPosixCommand("echo 'hello world'")).toEqual(["echo", "hello world"]);
    });

    test("backslash escapes a space", () => {
      expect(splitPosixCommand("echo hello\\ world")).toEqual(["echo", "hello world"]);
    });

    test("empty string returns empty array", () => {
      expect(splitPosixCommand("   ")).toEqual([]);
    });
  });

  describe("splitWindowsCommand", () => {
    test("basic whitespace split", () => {
      expect(splitWindowsCommand("echo hello world")).toEqual(["echo", "hello", "world"]);
    });

    test("double-quoted argument with spaces", () => {
      expect(splitWindowsCommand('"hello world" arg2')).toEqual(["hello world", "arg2"]);
    });

    test("backslash before non-quote is literal (Windows path safety)", () => {
      // On Windows, D:\path stays as D:\path — backslash is NOT an escape character
      expect(splitWindowsCommand("D:\\path\\to\\file.exe")).toEqual(["D:\\path\\to\\file.exe"]);
    });

    test("two backslashes before quote -> one literal backslash, toggles quote", () => {
      // \\" means: one backslash + close quote
      expect(splitWindowsCommand('arg1 "test\\\\"')).toEqual(["arg1", "test\\"]);
    });
  });

  describe("serializeCommand", () => {
    test("string command -> split to array", () => {
      const result = serializeCommand("echo hello world");
      expect(result).toEqual(["echo", "hello", "world"]);
    });

    test("array command -> returned as-is", () => {
      const result = serializeCommand(["echo", "hello"]);
      expect(result).toEqual(["echo", "hello"]);
    });

    test("shell mode string -> single element array", () => {
      const result = serializeCommand("echo hello && echo world", true);
      expect(result).toEqual(["echo hello && echo world"]);
    });

    test("shell mode with array -> throws", () => {
      expect(() => serializeCommand(["echo", "hello"], true)).toThrow(
        "Shell mode requires the command to be a single string"
      );
    });

    test("empty string -> throws", () => {
      expect(() => serializeCommand("   ")).toThrow("Command must not be empty");
    });

    test("empty array -> throws", () => {
      expect(() => serializeCommand([])).toThrow();
    });
  });
});
