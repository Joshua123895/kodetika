// The reference's data layer: carries the YAML bytes in via Vite's ?raw and
// hands the parsed, shaped result to the handbook pages. The shaping itself
// lives in src/lib/referenceModel.js, which node scripts and tests can import
// without Vite (the same split miniwebSource.js / levelSource.js use).

import { load } from "js-yaml";
import referenceRaw from "./reference.yaml?raw";
import { buildReference } from "../lib/referenceModel";

const { topics, guides } = buildReference(load(referenceRaw));

export const REFERENCE_TOPICS = topics;
export const REFERENCE_GUIDES = guides;
