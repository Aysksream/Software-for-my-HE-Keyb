# Contributing

Thanks for helping improve FUN//CTRL.

## Development setup

Requirements:

- Windows 10 or Windows 11
- Node.js 22 or newer
- npm

Install dependencies and run the validation suite:

```powershell
npm install
npm run check
```

For interactive development, run the bridge and interface separately:

```powershell
npm run dev:bridge
npm run dev
```

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests for protocol encoding, decoding, and process matching.
- Run `npm run check` and `npm audit` before opening a pull request.
- Do not commit `node_modules`, production builds, logs, captured HID traffic,
  firmware images, vendor binaries, or local settings.
- Include screenshots for visible interface changes.

## Hardware safety

Code that writes HID feature reports requires extra care:

- Keep the VID/PID allowlist explicit.
- Validate and clamp user-controlled numeric values.
- Query firmware precision before encoding travel distances.
- Keep destructive actions behind clear confirmation.
- Never run factory-reset or firmware-update commands in automated tests.
- Document the exact keyboard model, connection type, firmware version, and
  result for hardware-tested changes.

Protocol changes should include tests using known byte sequences whenever
possible. Hardware access must remain optional so the regular test suite works
without a connected keyboard.

## Reporting compatibility results

Compatibility reports should include:

- Model name
- USB VID and PID
- Wired, 2.4 GHz, or Bluetooth connection
- Firmware version
- Feature tested
- Expected and observed result

Avoid posting serial numbers or complete device paths; they are unnecessary for
compatibility work.
