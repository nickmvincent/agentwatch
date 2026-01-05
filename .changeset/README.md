# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## Adding a changeset

Run `bunx changeset` to create a new changeset when you make changes that should be released.

## Releasing

1. Run `bunx changeset version` to bump versions
2. Run `bunx changeset publish` to publish (when npm publishing is configured)
