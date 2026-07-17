# Architecture

FUN//CTRL separates the interface from privileged local capabilities.

## Components

### Web interface

The React application edits profiles, displays device state, and calls the
local API. It can also use WebHID for foreground manual control in supported
browsers.

### Windows bridge

The Node.js bridge binds to `127.0.0.1:3815` and provides:

- guarded USB HID discovery;
- RY5088 feature-report reads and writes;
- local profile and automation storage;
- Windows process detection;
- static hosting for the production interface.

The bridge never binds to a public network interface.

### Profile engine

Profiles contain millimeter values. Before writing, the transport queries the
keyboard firmware and selects its native fixed-point factor:

```text
millimeters × precision factor = raw u16 travel value
```

Trigger tables are sent in checksummed 65-byte HID feature reports. Multi-page
writes commit only on the final packet.

## Trust boundaries

- Only explicit `3151` FUN60 product IDs may be opened.
- API requests must use a loopback `Host` header and, when sent by a browser,
  an explicitly allowed origin.
- State-changing API requests require JSON plus the client control header,
  preventing cross-site forms from reaching HID operations.
- Numeric profile values are clamped by the bridge.
- The hosted interface cannot inspect local processes.
- Background automation requires the local bridge.
- Factory reset requires the literal `RESET` token.
- Firmware updates are outside the current feature scope.

## Persistence

Settings are written atomically to:

```text
%APPDATA%\Fun60Control\settings.json
```

No cloud account or telemetry service is used.

The raw operating-system HID path is kept inside the device adapter and is not
included in API status responses.
