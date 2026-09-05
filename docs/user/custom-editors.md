# Custom editors

The **Open in** menu lists the editors T3 Code detects on the server machine. You can add your own
entries for editors it does not detect, including terminal editors such as Neovim that need a
terminal emulator to launch.

Custom editors are configured in the server's `settings.json` under `customEditors`. By default
that file lives at `~/.t3/userdata/settings.json`. T3 Code watches it, so changes apply without a
restart.

```json
{
  "customEditors": [
    { "id": "nvim", "name": "Neovim", "command": ["ghostty", "-e", "nvim", "{path}"] },
    { "id": "helix", "name": "Helix", "command": ["kitty", "hx"] }
  ]
}
```

- `id` is lowercase letters, digits, and hyphens. It must be unique across your custom editors.
- `name` is the label shown in the menu.
- `command` is the program followed by its arguments. `{path}` is replaced with the folder or file
  being opened. When no argument contains `{path}`, the path is appended as the last argument.

Custom editors run on the machine hosting the server, so they appear only when the client opens
paths through the server. They are hidden when a remote client opens paths on its own machine.
T3 Code does not check that the command exists before showing it. A missing program shows a launch
error instead.
