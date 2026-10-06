// The five starter flows, in menu order.
import type { FlowConfig } from '../../src/engine/types.ts';
import { HQ } from './hq.ts';
import { IN } from './in.ts';
import { OI } from './oi.ts';
import { QHY } from './qhy.ts';
import { SL } from './sl.ts';

export const FLOWS: FlowConfig[] = [HQ, SL, IN, OI, QHY];
