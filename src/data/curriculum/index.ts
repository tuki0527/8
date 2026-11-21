import type { CanonicalChapter, CanonicalSlide, ConceptDef } from '../../domain/types.ts';
import { CHAPTERS_1_TO_5 } from './chapters1to5.ts';
import { CHAPTERS_6_TO_9 } from './chapters6to9.ts';

export const CANONICAL_CHAPTERS: CanonicalChapter[] = [
  ...CHAPTERS_1_TO_5,
  ...CHAPTERS_6_TO_9,
];

export const ALL_CONCEPTS: ConceptDef[] = CANONICAL_CHAPTERS.flatMap((c) => c.concepts);

export const VALID_CHAPTER_IDS = new Set(CANONICAL_CHAPTERS.map((c) => c.chapterId));
export const VALID_CONCEPT_IDS = new Set(ALL_CONCEPTS.map((c) => c.conceptId));

export const CHAPTERS_BY_ID = new Map(CANONICAL_CHAPTERS.map((c) => [c.chapterId, c]));
export const CONCEPTS_BY_ID = new Map(ALL_CONCEPTS.map((c) => [c.conceptId, c]));

export const ALL_SLIDES: CanonicalSlide[] = CANONICAL_CHAPTERS.flatMap((c) => c.slides);
export const SLIDES_BY_ID = new Map(ALL_SLIDES.map((s) => [s.slideId, s]));
