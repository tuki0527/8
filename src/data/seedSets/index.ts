import type { QuestionSet } from '../../domain/types.ts';
import { SEED_SETS_1_TO_5 } from './sets1to5.ts';
import { SEED_SETS_6_TO_9 } from './sets6to9.ts';

export const SEED_QUESTION_SETS: QuestionSet[] = [
  ...SEED_SETS_1_TO_5,
  ...SEED_SETS_6_TO_9,
];
