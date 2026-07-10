/**
 * Split one animation into two at time t — equivalent to the trims
 * [0, t] and [t, duration] (CLAUDE.md A.5).
 */

import type { AnimationDocument } from '../vrma/types';
import { trimDocument } from './trim';

export function splitDocument(doc: AnimationDocument, t: number): [AnimationDocument, AnimationDocument] {
  return [trimDocument(doc, 0, t), trimDocument(doc, t, doc.duration)];
}
