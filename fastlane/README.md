fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Mac

### mac build_mas

```sh
[bundle exec] fastlane mac build_mas
```

Build the Mac App Store universal .pkg (arm64 + x64)

### mac validate

```sh
[bundle exec] fastlane mac validate
```

Validate the .pkg against App Store Connect rules (no upload)

### mac upload

```sh
[bundle exec] fastlane mac upload
```

Upload existing .pkg to App Store Connect (does not submit for review)

### mac release

```sh
[bundle exec] fastlane mac release
```

Build + upload to App Store Connect in one step

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
