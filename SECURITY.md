# Security policy

## Supported versions

Open Device is pre-alpha and has no supported release line yet. Security fixes are
applied to the default branch until the first versioned policy is published.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting or create a private draft security
advisory for this repository. Do not open a public issue containing exploit details,
private device programs, credentials, or sensitive infrastructure information.

Include, when possible:

- affected commit or package version;
- threat scenario and required attacker capabilities;
- minimal reproduction using synthetic data;
- effect on package integrity, sandbox escape, runtime isolation, resolution, or
  hardware command policy;
- suggested mitigation.

The maintainers will acknowledge a complete report, assess severity, coordinate a fix,
and credit the reporter unless anonymity is requested. Exact response timelines will
be added when the project has a stable maintainer team.

## Security scope

High-priority areas include:

- iframe sandbox or CSP escape;
- `postMessage` confusion or unauthorized intent injection;
- Wasm memory corruption, denial of service, or undeclared capability access;
- resolver SSRF, path traversal, redirect bypass, or integrity bypass;
- dependency confusion or mutable-release substitution;
- scenario/evidence forgery;
- a path from package content to real hardware command execution without host policy.

See [`docs/security-model.md`](docs/security-model.md) for design requirements.
