# Domain docs

How the engineering skills use this repository's domain documentation.

This repository has one context: one `GLOSSARY.md` and one `docs/adr/` at the
root.

## Before exploring, read these

- **`GLOSSARY-MAP.md`** at the root. It says which glossary owns each word:
  this repository, the CLI kernel, the old Shepherdr glossary, the Agent
  ecosystem glossary, or the design words.
- **`GLOSSARY.md`** at the root. It defines this repository's own words, and
  gives each word's name in code: its folder, file, type, and function or
  variable prefix.
- **`docs/adr/`**. Read the decision records that touch the area you are about
  to work in. Design notes that are not yet decision records are in
  `docs/design/`.

If one of these does not exist yet, carry on without creating a placeholder.

## Use the glossary's words

- Use the glossary's word for a domain concept everywhere: issue titles,
  proposals, tests, and the names of folders, files, types, functions and
  variables.
- Do not drift to a word the glossary lists under "avoid".
- A concept with no word is a gap. Raise it and settle the word with the
  domain-modeling skill before naming anything after it.

## Flag decision conflicts

If your output contradicts a decision record, say so openly and say why it is
worth reopening. Do not override it silently.
