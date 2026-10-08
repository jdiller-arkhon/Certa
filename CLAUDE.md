# Instructions for AI assistants working on Certa

## Release gate — nothing goes live without the owner's inspection

The owner (jdiller@arkhonindustries.com) must personally inspect the app before any of it is live.
Until they explicitly approve a release, do NOT:

- deploy Certa anywhere reachable by others (any server, cloud, or the Certa origin host);
- change, or open PRs against, the Arkhon website (e.g. the `/certa` rewrite in
  docs/ARKHON_SITE_INTEGRATION.md) or its Cloudflare/DNS configuration;
- add deploy/publish steps to CI, or merge to `main`;
- publish container images, app-store builds, or share preview links.

Allowed: committing and pushing to the working branch, and running the stack locally
(Docker Compose on localhost) for development and testing.

Approval must come from the owner in their own words for that specific release; it does not
carry over to later releases.
