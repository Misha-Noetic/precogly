# Changelog

## [0.3.0](https://github.com/precogly/precogly/compare/v0.2.0...v0.3.0) (2026-06-01)


### Features

* add due date, external ticket URL, and comment log to countermeasures; implement risk register with auto-populate and kanban view ([d055ad2](https://github.com/precogly/precogly/commit/d055ad20ab887aa6976b40ee4ba28646079ee0b1))
* add due date, external ticket URL, and comment log to countermeasures; implement risk register with auto-populate and kanban view ([cb5c150](https://github.com/precogly/precogly/commit/cb5c1500f2bea81a9d5e08f9ff8e9378057b78b5))

## [0.2.0](https://github.com/precogly/precogly/compare/v0.1.0...v0.2.0) (2026-05-26)

### Features

* Add delete functionality for components and countermeasures in Threat Analysis view ([#79](https://github.com/precogly/precogly/pull/79))
* Add actor and attacker impact fields to threat records ([#70](https://github.com/precogly/precogly/pull/70))
* Add show/hide password toggle on login and signup forms ([#64](https://github.com/precogly/precogly/pull/64))
* Add threat model import/export with ThreatPersona/ThreatSource models and round-trip fidelity ([#86](https://github.com/precogly/precogly/pull/86))
* Add cross-framework requirement mappings for compliance overlays ([#50](https://github.com/precogly/precogly/pull/50))
* Improve threat model completion status indicators ([#84](https://github.com/precogly/precogly/pull/84))
* Allow threat library import without compliance packs ([#98](https://github.com/precogly/precogly/pull/98))
* Add schema_version field to pack.yaml with validation ([#95](https://github.com/precogly/precogly/pull/95))

### Bug Fixes

* Generate threats for existing components/flows on re-sync and recalculate risks on orphan deletion ([#63](https://github.com/precogly/precogly/pull/63))
* Refresh compliance overlay instances after pack update ([#60](https://github.com/precogly/precogly/pull/60))
* Allow library packs to be removed and re-added to threat models ([#57](https://github.com/precogly/precogly/pull/57))
* Prevent data flow threats from auto-populating from unrelated library packs ([#46](https://github.com/precogly/precogly/pull/46))
* Filter threat picker by component's library ([#55](https://github.com/precogly/precogly/pull/55))
* Fix taxonomy pack slug mismatch ([#65](https://github.com/precogly/precogly/pull/65))
* Reject string-list format in components-threats.yaml at validation time ([#74](https://github.com/precogly/precogly/pull/74))
* Return success=False when pack version mismatch is detected ([#73](https://github.com/precogly/precogly/pull/73))
* Fix provider parsing, component matching, and UI fallback ([#48](https://github.com/precogly/precogly/pull/48))
* Fix form field overflow in modals ([#35](https://github.com/precogly/precogly/pull/35))
* Fix forgot password element positioning ([#36](https://github.com/precogly/precogly/pull/36))
* Fix npm audit vulnerabilities ([#62](https://github.com/precogly/precogly/pull/62))
* Fix tsconfig baseUrl deprecation ([#67](https://github.com/precogly/precogly/pull/67))
* Improve validation and bubble up messages to frontend ([#78](https://github.com/precogly/precogly/pull/78))
* Unify component category enums and control_type values across stack ([#87](https://github.com/precogly/precogly/pull/87))

### Architecture / Performance

* Simplify pack resolution — use filesystem as source of truth with O(1) path-based lookup ([#47](https://github.com/precogly/precogly/pull/47), [#54](https://github.com/precogly/precogly/pull/54))
* Simplify pack directory structure and improve libraries UI ([#89](https://github.com/precogly/precogly/pull/89))

### DevOps

* Add CI workflow for PR checks — pytest and tsc ([#90](https://github.com/precogly/precogly/pull/90), [#91](https://github.com/precogly/precogly/pull/91))
* Enable branch protection on main with required reviews and status checks
* Add release-please workflow for automated releases ([#93](https://github.com/precogly/precogly/pull/93))
* Reconcile version numbers across frontend, backend, and docs ([#92](https://github.com/precogly/precogly/pull/92))

### Documentation

* Add recipes section with IEC 62443 and EU banking recipes ([#44](https://github.com/precogly/precogly/pull/44))
* Add CONTRIBUTING.md ([#42](https://github.com/precogly/precogly/pull/42), [#49](https://github.com/precogly/precogly/pull/49))
* Add docs for threat model import/export ([#68](https://github.com/precogly/precogly/pull/68))
* Add docs for multiple DFD creation ([#76](https://github.com/precogly/precogly/pull/76))
* Update README with OWASP affiliation ([#71](https://github.com/precogly/precogly/pull/71))
* Add Discord link to README ([#85](https://github.com/precogly/precogly/pull/85))

## [0.1.0](https://github.com/precogly/precogly/releases/tag/v0.1.0) (2026-04-28)

Initial public release of Precogly.

### Features

* Core threat modeling workflow
* DFD editor with nested components, trust zones, and trust boundaries
* Library packs (AWS, Azure, GCP)
* Threat analysis and reporting
* Import and export TM-BOM style JSON files
* Collaborative workspaces with roles and permissions
* Compliance mapping (DORA, CRA, ASVS, NIST CSF, SOC 2)
* Reference image support
* REST API with OpenAPI documentation
