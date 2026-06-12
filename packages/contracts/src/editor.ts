import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const EditorLaunchStyle = Schema.Literals(["direct-path", "goto", "line-column"]);
export type EditorLaunchStyle = typeof EditorLaunchStyle.Type;

type EditorDefinition = {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly [string, ...string[]] | null;
  readonly baseArgs?: readonly string[];
  readonly launchStyle: EditorLaunchStyle;
};

export const EDITORS = [
  { id: "cursor", label: "Cursor", commands: ["cursor"], launchStyle: "goto" },
  { id: "trae", label: "Trae", commands: ["trae"], launchStyle: "goto" },
  { id: "kiro", label: "Kiro", commands: ["kiro"], baseArgs: ["ide"], launchStyle: "goto" },
  { id: "vscode", label: "VS Code", commands: ["code"], launchStyle: "goto" },
  {
    id: "vscode-insiders",
    label: "VS Code Insiders",
    commands: ["code-insiders"],
    launchStyle: "goto",
  },
  { id: "vscodium", label: "VSCodium", commands: ["codium"], launchStyle: "goto" },
  { id: "zed", label: "Zed", commands: ["zed", "zeditor"], launchStyle: "direct-path" },
  { id: "antigravity", label: "Antigravity", commands: ["agy"], launchStyle: "goto" },
  { id: "idea", label: "IntelliJ IDEA", commands: ["idea"], launchStyle: "line-column" },
  { id: "aqua", label: "Aqua", commands: ["aqua"], launchStyle: "line-column" },
  { id: "clion", label: "CLion", commands: ["clion"], launchStyle: "line-column" },
  { id: "datagrip", label: "DataGrip", commands: ["datagrip"], launchStyle: "line-column" },
  { id: "dataspell", label: "DataSpell", commands: ["dataspell"], launchStyle: "line-column" },
  { id: "goland", label: "GoLand", commands: ["goland"], launchStyle: "line-column" },
  { id: "phpstorm", label: "PhpStorm", commands: ["phpstorm"], launchStyle: "line-column" },
  { id: "pycharm", label: "PyCharm", commands: ["pycharm"], launchStyle: "line-column" },
  { id: "rider", label: "Rider", commands: ["rider"], launchStyle: "line-column" },
  { id: "rubymine", label: "RubyMine", commands: ["rubymine"], launchStyle: "line-column" },
  { id: "rustrover", label: "RustRover", commands: ["rustrover"], launchStyle: "line-column" },
  { id: "webstorm", label: "WebStorm", commands: ["webstorm"], launchStyle: "line-column" },
  { id: "file-manager", label: "File Manager", commands: null, launchStyle: "direct-path" },
] as const satisfies ReadonlyArray<EditorDefinition>;

export const BuiltinEditorId = Schema.Literals(EDITORS.map((e) => e.id));
export type BuiltinEditorId = typeof BuiltinEditorId.Type;

export const MAX_CUSTOM_EDITOR_ID_LENGTH = 32;
export const MAX_CUSTOM_EDITORS_COUNT = 32;

/**
 * Placeholder replaced with the target path when launching a custom editor.
 * When no command argument contains it, the target path is appended instead.
 */
export const CUSTOM_EDITOR_PATH_PLACEHOLDER = "{path}";

export const CUSTOM_EDITOR_ID_PREFIX = "custom:";

export const CustomEditorSlug = Schema.NonEmptyString.check(
  Schema.isMaxLength(MAX_CUSTOM_EDITOR_ID_LENGTH),
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
);
export type CustomEditorSlug = typeof CustomEditorSlug.Type;

export const CustomEditorId = Schema.TemplateLiteral([
  Schema.Literal(CUSTOM_EDITOR_ID_PREFIX),
  CustomEditorSlug,
]);
export type CustomEditorId = typeof CustomEditorId.Type;

export const EditorId = Schema.Union([BuiltinEditorId, CustomEditorId]);
export type EditorId = typeof EditorId.Type;

/**
 * User-defined editor launched via an arbitrary command, e.g. a terminal
 * editor wrapped in a terminal emulator: `["ghostty", "-e", "nvim", "{path}"]`.
 */
export const CustomEditorDefinition = Schema.Struct({
  id: CustomEditorSlug,
  name: TrimmedNonEmptyString,
  command: Schema.NonEmptyArray(TrimmedNonEmptyString),
});
export type CustomEditorDefinition = typeof CustomEditorDefinition.Type;

export const CustomEditorsConfig = Schema.Array(CustomEditorDefinition).check(
  Schema.isMaxLength(MAX_CUSTOM_EDITORS_COUNT),
);
export type CustomEditorsConfig = typeof CustomEditorsConfig.Type;

export const LaunchEditorInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  editor: EditorId,
});
export type LaunchEditorInput = typeof LaunchEditorInput.Type;

export class ExternalLauncherError extends Schema.TaggedErrorClass<ExternalLauncherError>()(
  "ExternalLauncherError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
