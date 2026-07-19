# `@open-device/cli`

Bun-based developer workflow for package authors.

## Intended commands

```text
device init       create a source package
device check      validate structure and engineering constraints
device dev        serve package, playground, and watch changes
device test       execute scenarios against resolved target artifacts
device pack       create an immutable release and integrity metadata
device inspect    print package, dependency, profile, and evidence details
device add        add and lock a dependency
device eject      copy a selected source-owned part such as a view
device publish    publish static files or register their canonical URLs
```

`publish` must show exact target, visibility, version, digest, and verification status
before creating external state. Deployment and activation are not CLI registry
commands.
