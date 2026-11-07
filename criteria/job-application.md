# Northline application criteria

These are the acceptance criteria TestForge turns into Playwright tests. The YAML file next to this document is the machine-readable source. Expected outcomes here are frozen: a repair may not edit them.

## en-happy-path

An English applicant can submit a complete remote application. The page shows “Application received” and the inbox stores one submission.

## es-happy-path

A Spanish applicant can submit an on-site application with `sofia.reyes@correo.es`. The page shows “Solicitud recibida” and the inbox stores one submission.

## en-rejects-invalid-email

The English form rejects `not-an-email` with “Enter a valid email” and stores nothing.

## es-rejects-invalid-email

The Spanish form rejects `not-an-email` with “Introduce un correo válido” and stores nothing.

## en-remote-requires-timezone

Choosing Remote without a timezone shows “Timezone is required” and stores nothing.

## es-onsite-requires-office

Choosing Presencial without an office shows “La oficina es obligatoria” and stores nothing.

## en-double-submit

Activating submit twice records exactly one application and still shows “Application received”.

## a11y-en

The English form has no serious or critical axe-core violations.

## a11y-es

The Spanish form has no serious or critical axe-core violations.
