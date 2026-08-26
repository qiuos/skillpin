# YAML front-matter parser research

## Question

How should P3 parse `SKILL.md` YAML front matter without creating a brittle partial YAML implementation?

## Findings

- YAML is a general-purpose structured-data format; a handwritten parser would silently reject or misread valid scalar, quote, and multiline forms.
- The maintained `yaml` package provides document parsing with structured diagnostics, so malformed front matter can be converted to a candidate-level `INVALID_FRONT_MATTER` warning rather than ending an entire source scan.
- Node's `fs/promises` APIs provide the primitives needed by P3: `realpath` for loop-safe canonical paths, `readdir({ withFileTypes: true })` for directory-only browsing/scanning, and UTF-8 file reads.

## Decision

Add the maintained `yaml` v2 package as a runtime dependency of `@skillpin/core`. Parse only a leading `---`-delimited front-matter block. Require only scalar string values for `name` and `description`; other metadata is ignored. Any YAML diagnostic or invalid scalar produces a stable candidate-level warning and then falls back to directory name / readable Markdown paragraph.

## References

- YAML project package documentation / repository: https://github.com/eemeli/yaml
- Node.js `fs/promises` API: https://nodejs.org/api/fs.html#promises-api
