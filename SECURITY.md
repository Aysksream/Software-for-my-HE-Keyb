# Security policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting when available. Do not open a
public issue for vulnerabilities involving arbitrary HID writes, local API
access, path handling, or process information.

Include a concise description, reproduction steps, affected version, and the
expected impact. Do not include unrelated personal data, device serial numbers,
or access tokens.

## Local trust model

The bridge listens only on `127.0.0.1`. Device writes are restricted to an
explicit FUN60 VID/PID allowlist, and factory reset requires an exact
confirmation token. The API rejects non-loopback host headers, untrusted browser
origins, cross-site requests, and form-style writes. Raw HID paths are not
returned to the interface. Profiles and process rules are stored locally with
restricted file permissions where the operating system supports them.

Remote interface origins are denied unless explicitly listed in the local
`FUN60_ALLOWED_ORIGINS` environment variable. Never place credentials or API
keys in that variable; it accepts origins such as `https://example.vercel.app`
only.

The bridge is intended for a single-user Windows workstation. Do not expose
port `3815` to a network interface or reverse proxy.

GitHub Actions runs CodeQL and Gitleaks, dependencies are audited in CI, and
Dependabot checks npm packages and workflow actions weekly. Workflow actions are
pinned to full commit hashes to reduce supply-chain risk.
