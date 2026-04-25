/**
 * Open - Browser/editor launch service interface.
 *
 * Owns process launch helpers for opening URLs in a browser and workspace
 * paths in a configured editor.
 *
 * @module Open
 */
import { spawn } from "node:child_process";

import { EDITORS, OpenError, type EditorId } from "@t3tools/contracts";
import { isCommandAvailable, type CommandAvailabilityOptions } from "@t3tools/shared/shell";
import { Context, Effect, Layer } from "effect";

// ==============================
// Definitions
// ==============================

export { OpenError };
export { isCommandAvailable } from "@t3tools/shared/shell";

export interface OpenInEditorInput {
  readonly cwd: string;
  readonly editor: EditorId;
}

interface EditorLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

const TARGET_WITH_POSITION_PATTERN = /^(.*?):(\d+)(?::(\d+))?$/;

function parseTargetPathAndPosition(target: string): {
  path: string;
  line: string | undefined;
  column: string | undefined;
} | null {
  const match = TARGET_WITH_POSITION_PATTERN.exec(target);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    path: match[1],
    line: match[2],
    column: match[3],
  };
}

function resolveCommandEditorArgs(
  editor: (typeof EDITORS)[number],
  target: string,
): ReadonlyArray<string> {
  const parsedTarget = parseTargetPathAndPosition(target);

  switch (editor.launchStyle) {
    case "direct-path":
      return [target];
    case "goto":
      return parsedTarget ? ["--goto", target] : [target];
    case "line-column": {
      if (!parsedTarget) {
        return [target];
      }

      const { path, line, column } = parsedTarget;
      return [...(line ? ["--line", line] : []), ...(column ? ["--column", column] : []), path];
    }
  }
}

function resolveEditorArgs(
  editor: (typeof EDITORS)[number],
  target: string,
): ReadonlyArray<string> {
  const baseArgs = "baseArgs" in editor ? editor.baseArgs : [];
  return [...baseArgs, ...resolveCommandEditorArgs(editor, target)];
}

function resolveAvailableCommand(
  commands: ReadonlyArray<string>,
  options: CommandAvailabilityOptions = {},
): string | null {
  for (const command of commands) {
    if (isCommandAvailable(command, options)) {
      return command;
    }
  }
  return null;
}

function fileManagerCommandForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "open";
    case "win32":
      return "explorer";
    default:
      return "xdg-open";
  }
}

export function resolveAvailableEditors(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<EditorId> {
  const available: EditorId[] = [];

  for (const editor of EDITORS) {
    if (editor.commands === null) {
      const command = fileManagerCommandForPlatform(platform);
      if (isCommandAvailable(command, { platform, env })) {
        available.push(editor.id);
      }
      continue;
    }

    const command = resolveAvailableCommand(editor.commands, { platform, env });
    if (command !== null) {
      available.push(editor.id);
    }
  }

  return available;
}

export function resolveEditorCommandMap(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyMap<EditorId, string> {
  const map = new Map<EditorId, string>();

  for (const editor of EDITORS) {
    if (editor.commands === null) {
      const command = fileManagerCommandForPlatform(platform);
      if (isCommandAvailable(command, { platform, env })) map.set(editor.id, command);
    } else {
      const command = resolveAvailableCommand(editor.commands, { platform, env });
      if (command !== null) map.set(editor.id, command);
    }
  }

  return map;
}

/**
 * OpenShape - Service API for browser and editor launch actions.
 */
export interface OpenShape {
  /**
   * Open a URL target in the default browser.
   */
  readonly openBrowser: (target: string) => Effect.Effect<void, OpenError>;

  /**
   * Open a workspace path in a selected editor integration.
   *
   * Launches the editor as a detached process so server startup is not blocked.
   */
  readonly openInEditor: (input: OpenInEditorInput) => Effect.Effect<void, OpenError>;
}

/**
 * Open - Service tag for browser/editor launch operations.
 */
export class Open extends Context.Service<Open, OpenShape>()("t3/open") {}

// ==============================
// Implementations
// ==============================

export const resolveEditorLaunch = Effect.fn("resolveEditorLaunch")(function* (
  input: OpenInEditorInput,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  resolvedCommands: ReadonlyMap<EditorId, string> = new Map(),
): Effect.fn.Return<EditorLaunch, OpenError> {
  yield* Effect.annotateCurrentSpan({
    "open.editor": input.editor,
    "open.cwd": input.cwd,
    "open.platform": platform,
  });
  const editorDef = EDITORS.find((editor) => editor.id === input.editor);
  if (!editorDef) {
    return yield* new OpenError({ message: `Unknown editor: ${input.editor}` });
  }

  if (editorDef.commands) {
    const command =
      resolvedCommands.get(input.editor) ??
      resolveAvailableCommand(editorDef.commands, { platform, env }) ??
      editorDef.commands[0];
    return {
      command,
      args: resolveEditorArgs(editorDef, input.cwd),
    };
  }

  if (editorDef.id !== "file-manager") {
    return yield* new OpenError({ message: `Unsupported editor: ${input.editor}` });
  }

  return {
    command: resolvedCommands.get(input.editor) ?? fileManagerCommandForPlatform(platform),
    args: [input.cwd],
  };
});

export const launchDetached = (launch: EditorLaunch) =>
  Effect.gen(function* () {
    yield* Effect.callback<void, OpenError>((resume) => {
      let child;
      try {
        const isWin32 = process.platform === "win32";
        child = spawn(
          launch.command,
          isWin32 ? launch.args.map((a) => `"${a}"`) : [...launch.args],
          { detached: true, stdio: "ignore", shell: isWin32 },
        );
      } catch (error) {
        return resume(
          Effect.fail(new OpenError({ message: "failed to spawn detached process", cause: error })),
        );
      }

      let settled = false;

      const handleError = (cause: Error) => {
        if (!settled) {
          settled = true;
          resume(Effect.fail(new OpenError({ message: "failed to spawn detached process", cause })));
        }
      };

      child.once("error", handleError);

      // ENOENT errors arrive via process.nextTick (before setImmediate), so this
      // catches command-not-found while returning well before the OS spawn event.
      setImmediate(() => {
        if (!settled) {
          settled = true;
          child.removeListener("error", handleError);
          child.once("error", () => {});
          child.unref();
          resume(Effect.void);
        }
      });
    });
  });

const make = Effect.gen(function* () {
  const commandMap = resolveEditorCommandMap();

  const open = yield* Effect.tryPromise({
    try: () => import("open"),
    catch: (cause) => new OpenError({ message: "failed to load browser opener", cause }),
  });

  return {
    openBrowser: (target) =>
      Effect.tryPromise({
        try: () => open.default(target),
        catch: (cause) => new OpenError({ message: "Browser auto-open failed", cause }),
      }),
    openInEditor: (input) =>
      Effect.flatMap(
        resolveEditorLaunch(input, process.platform, process.env, commandMap),
        launchDetached,
      ),
  } satisfies OpenShape;
});

export const OpenLive = Layer.effect(Open, make);
