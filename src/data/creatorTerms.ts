// The creator terms version: shown under the terms on /creators and sent with
// every application, so the two can never differ.
//
// When the terms change, change this AND, in the same release, the database:
// app_config.creator_terms_version must equal this string exactly, and
// public.creator_terms_versions needs a row for it. creator_apply refuses any
// application whose version does not match ("The terms have changed").
export const CREATOR_TERMS_VERSION = "Version 3, 14 October 2026";
